import { db } from '../db.js';

export class ReconciliationService {
  /**
   * Retrieves account reconciliation workspace data
   */
  static getReconciliationData(accountId, statementDate, statementBalance) {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!account) throw new Error('Account not found');

    // Get prior reconciled balance
    const priorReconciledRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as prior_sum
      FROM transactions
      WHERE account_id = ? AND cleared_status = 'reconciled' AND review_status = 'approved'
    `).get(accountId);

    const startingReconciledBalance = Number((account.opening_balance + priorReconciledRow.prior_sum).toFixed(2));

    // Get all transactions eligible for reconciliation (cleared or uncleared, up to statement date)
    const eligibleTransactions = db.prepare(`
      SELECT t.*, c.name as category_name, sub.name as subcategory_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      WHERE t.account_id = ?
        AND t.cleared_status != 'reconciled'
        AND t.review_status = 'approved'
        AND t.date <= ?
      ORDER BY t.date ASC, t.id ASC
    `).all(accountId, statementDate);

    const payments = eligibleTransactions.filter(t => t.amount < 0);
    const deposits = eligibleTransactions.filter(t => t.amount >= 0);

    return {
      account,
      statement_date: statementDate,
      statement_balance: Number(statementBalance),
      starting_reconciled_balance: startingReconciledBalance,
      payments,
      deposits
    };
  }

  /**
   * Commits the reconciliation when difference is 0.00 (or user explicitly confirms)
   */
  static commitReconciliation({ accountId, statementDate, statementBalance, clearedTransactionIds }) {
    if (!clearedTransactionIds || clearedTransactionIds.length === 0) {
      throw new Error('No transactions selected to reconcile');
    }

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!account) throw new Error('Account not found');

    // Calculate cleared balance
    const idPlaceholders = clearedTransactionIds.map(() => '?').join(',');
    const selectedSumRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as selected_sum
      FROM transactions
      WHERE id IN (${idPlaceholders})
    `).get(...clearedTransactionIds);

    const priorReconciledRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as prior_sum
      FROM transactions
      WHERE account_id = ? AND cleared_status = 'reconciled' AND review_status = 'approved'
    `).get(accountId);

    const startingBalance = account.opening_balance + priorReconciledRow.prior_sum;
    const finalClearedBalance = Number((startingBalance + selectedSumRow.selected_sum).toFixed(2));
    const difference = Number((statementBalance - finalClearedBalance).toFixed(2));

    // Update transactions to 'reconciled'
    const markReconciled = db.prepare(`
      UPDATE transactions
      SET cleared_status = 'reconciled', updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${idPlaceholders})
    `);
    markReconciled.run(...clearedTransactionIds);

    // Record reconciliation record
    const insertRec = db.prepare(`
      INSERT INTO reconciliations (account_id, statement_date, statement_balance, cleared_balance, difference, status)
      VALUES (?, ?, ?, ?, ?, 'completed')
    `);
    insertRec.run(accountId, statementDate, statementBalance, finalClearedBalance, difference);

    return {
      success: true,
      cleared_count: clearedTransactionIds.length,
      cleared_balance: finalClearedBalance,
      difference
    };
  }
}
