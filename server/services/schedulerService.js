import { db, recalculateAccountBalance } from '../db.js';

export class SchedulerService {
  /**
   * Computes the subsequent due date based on frequency
   */
  static calculateNextDate(currentDateStr, frequency) {
    const d = new Date(currentDateStr + 'T00:00:00');

    switch (frequency) {
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'biweekly':
        d.setDate(d.getDate() + 14);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'quarterly':
        d.setMonth(d.getMonth() + 3);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        d.setMonth(d.getMonth() + 1);
    }

    return d.toISOString().slice(0, 10);
  }

  /**
   * Evaluates and posts due auto-create scheduled transactions
   */
  static processDueScheduledTransactions(asOfDateStr = new Date().toISOString().slice(0, 10)) {
    const dueItems = db.prepare(`
      SELECT * FROM scheduled_transactions
      WHERE active = 1 AND next_due_date <= ? AND auto_create = 1
    `).all(asOfDateStr);

    let createdCount = 0;
    const insertTrans = db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, amount, transaction_type,
        category_id, subcategory_id, memo, payment_method,
        cleared_status, review_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uncleared', 'approved')
    `);

    const updateScheduled = db.prepare(`
      UPDATE scheduled_transactions
      SET next_due_date = ?, last_generated_date = ?
      WHERE id = ?
    `);

    const affectedAccounts = new Set();

    dueItems.forEach(item => {
      const signedAmount = item.transaction_type === 'expense'
        ? -Math.abs(item.amount)
        : Math.abs(item.amount);

      insertTrans.run(
        item.account_id,
        item.next_due_date,
        item.payee,
        signedAmount,
        item.transaction_type,
        item.category_id,
        item.subcategory_id,
        item.memo ? `[Scheduled] ${item.memo}` : '[Scheduled Bill/Deposit]',
        item.payment_method || null
      );

      affectedAccounts.add(item.account_id);
      createdCount++;

      const nextDate = this.calculateNextDate(item.next_due_date, item.frequency);
      updateScheduled.run(nextDate, item.next_due_date, item.id);
    });

    affectedAccounts.forEach(accId => recalculateAccountBalance(accId));

    return {
      processed_count: dueItems.length,
      created_count: createdCount
    };
  }

  /**
   * Manually records a single scheduled bill into the register and rolls over the date
   */
  static recordScheduledTransaction(scheduledId, overrideDate = null) {
    const item = db.prepare('SELECT * FROM scheduled_transactions WHERE id = ?').get(scheduledId);
    if (!item) throw new Error('Scheduled transaction not found');

    const postDate = overrideDate || item.next_due_date;
    const signedAmount = item.transaction_type === 'expense'
      ? -Math.abs(item.amount)
      : Math.abs(item.amount);

    db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, amount, transaction_type,
        category_id, subcategory_id, memo, payment_method,
        cleared_status, review_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uncleared', 'approved')
    `).run(
      item.account_id,
      postDate,
      item.payee,
      signedAmount,
      item.transaction_type,
      item.category_id,
      item.subcategory_id,
      item.memo ? `[Scheduled] ${item.memo}` : '[Scheduled Bill/Deposit]',
      item.payment_method || null
    );

    const nextDate = this.calculateNextDate(item.next_due_date, item.frequency);
    db.prepare(`
      UPDATE scheduled_transactions
      SET next_due_date = ?, last_generated_date = ?
      WHERE id = ?
    `).run(nextDate, postDate, item.id);

    recalculateAccountBalance(item.account_id);

    return { success: true, next_due_date: nextDate };
  }

  /**
   * Generates a 30/60/90 day projected cash-flow forecast based on current balances + scheduled items
   */
  static getCashFlowProjection(days = 30) {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);
    const endStr = endDate.toISOString().slice(0, 10);
    const startStr = today.toISOString().slice(0, 10);

    const accounts = db.prepare('SELECT * FROM accounts WHERE active = 1').all();
    const scheduled = db.prepare(`
      SELECT s.*, c.name as category_name, sub.name as subcategory_name, a.name as account_name
      FROM scheduled_transactions s
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN subcategories sub ON s.subcategory_id = sub.id
      JOIN accounts a ON s.account_id = a.id
      WHERE s.active = 1
    `).all();

    const projectedEvents = [];

    scheduled.forEach(item => {
      let cur = item.next_due_date;
      while (cur <= endStr) {
        if (cur >= startStr) {
          projectedEvents.push({
            scheduled_id: item.id,
            account_id: item.account_id,
            account_name: item.account_name,
            payee: item.payee,
            date: cur,
            amount: item.transaction_type === 'expense' ? -Math.abs(item.amount) : Math.abs(item.amount),
            transaction_type: item.transaction_type,
            category_name: item.category_name,
            subcategory_name: item.subcategory_name
          });
        }
        cur = this.calculateNextDate(cur, item.frequency);
      }
    });

    // Sort events by date
    projectedEvents.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate projected balances
    let totalCurrentCash = accounts
      .filter(a => a.type === 'checking' || a.type === 'savings' || a.type === 'cash')
      .reduce((sum, a) => sum + a.current_balance, 0);

    let projectedNetChange = projectedEvents.reduce((sum, e) => sum + e.amount, 0);
    let totalProjectedCash = totalCurrentCash + projectedNetChange;

    return {
      current_cash: Number(totalCurrentCash.toFixed(2)),
      projected_cash: Number(totalProjectedCash.toFixed(2)),
      projected_change: Number(projectedNetChange.toFixed(2)),
      forecast_days: days,
      events: projectedEvents
    };
  }
}
