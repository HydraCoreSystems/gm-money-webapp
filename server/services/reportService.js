import { db } from '../db.js';
import { SchedulerService } from './schedulerService.js';

export class ReportService {
  /**
   * Generates dashboard summary statistics
   */
  static getDashboardSummary() {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    const currentYear = today.toISOString().slice(0, 4);  // YYYY

    // 1. Account Balances
    const accounts = db.prepare('SELECT * FROM accounts WHERE active = 1 ORDER BY type, name').all();
    let liquidCash = 0;
    let creditDebt = 0;

    accounts.forEach(acc => {
      if (acc.type === 'credit_card' || acc.type === 'loan') {
        creditDebt += Math.abs(acc.current_balance);
      } else {
        liquidCash += acc.current_balance;
      }
    });

    const netWorth = liquidCash - creditDebt;

    // 2. Month-to-date Income & Expense
    const mtdRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN amount > 0 AND transaction_type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN amount < 0 AND transaction_type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expense
      FROM transactions
      WHERE date LIKE ? AND review_status = 'approved'
    `).get(`${currentMonth}%`);

    const mtdNet = mtdRow.income - mtdRow.expense;

    // 3. Year-to-date Income & Expense
    const ytdRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN amount > 0 AND transaction_type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN amount < 0 AND transaction_type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expense
      FROM transactions
      WHERE date LIKE ? AND review_status = 'approved'
    `).get(`${currentYear}%`);

    // 4. Pending Review Count
    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM transactions WHERE review_status = 'pending_review'
    `).get().count;

    // 5. Upcoming Bills Count & Projection
    const projection = SchedulerService.getCashFlowProjection(30);
    const upcomingBillsCount = projection.events.filter(e => e.transaction_type === 'expense').length;

    // 6. Recent Transactions
    const recentTransactions = db.prepare(`
      SELECT t.*, a.name as account_name, c.name as category_name, sub.name as subcategory_name,
        (SELECT COUNT(*) FROM transaction_splits WHERE transaction_id = t.id) as split_count,
        (SELECT COUNT(*) FROM transaction_attachments WHERE transaction_id = t.id) as attachment_count
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      WHERE t.review_status = 'approved'
      ORDER BY t.date DESC, t.id DESC
      LIMIT 8
    `).all();

    // 7. Spending by Category (MTD)
    const categorySpending = this.getSpendingByCategory({ startDate: `${currentMonth}-01`, endDate: today.toISOString().slice(0, 10) });

    // 8. 6-Month Cash Flow Trend
    const cashFlowTrend = this.getMonthlyCashFlowTrend(6);

    return {
      liquid_cash: Number(liquidCash.toFixed(2)),
      credit_debt: Number(creditDebt.toFixed(2)),
      net_worth: Number(netWorth.toFixed(2)),
      projected_cash: projection.projected_cash,
      mtd_income: Number(mtdRow.income.toFixed(2)),
      mtd_expense: Number(mtdRow.expense.toFixed(2)),
      mtd_net: Number(mtdNet.toFixed(2)),
      ytd_income: Number(ytdRow.income.toFixed(2)),
      ytd_expense: Number(ytdRow.expense.toFixed(2)),
      ytd_net: Number((ytdRow.income - ytdRow.expense).toFixed(2)),
      pending_review_count: pendingCount,
      upcoming_bills_count: upcomingBillsCount,
      accounts,
      recent_transactions: recentTransactions,
      category_spending: categorySpending,
      cash_flow_trend: cashFlowTrend,
      projection_events: projection.events.slice(0, 5)
    };
  }

  /**
   * Monthly Income vs Expense Trend (Last N months)
   */
  static getMonthlyCashFlowTrend(months = 6) {
    const results = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
      const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });

      const row = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 AND transaction_type = 'income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN amount < 0 AND transaction_type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expense
        FROM transactions
        WHERE date LIKE ? AND review_status = 'approved'
      `).get(`${monthStr}%`);

      results.push({
        month: monthStr,
        label,
        income: Number(row.income.toFixed(2)),
        expense: Number(row.expense.toFixed(2)),
        net: Number((row.income - row.expense).toFixed(2))
      });
    }

    return results;
  }

  /**
   * Spending by Category Breakdown with subcategories & split support
   */
  static getSpendingByCategory({ startDate, endDate, accountId }) {
    // 1. Fetch non-split expense transactions
    let nonSplitQuery = `
      SELECT
        c.id as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        sub.id as subcategory_id,
        COALESCE(sub.name, 'General') as subcategory_name,
        ABS(t.amount) as amount,
        t.id as trans_id
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      WHERE t.transaction_type = 'expense' AND t.review_status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
    `;
    const nonSplitParams = [];

    if (startDate) {
      nonSplitQuery += ` AND t.date >= ?`;
      nonSplitParams.push(startDate);
    }
    if (endDate) {
      nonSplitQuery += ` AND t.date <= ?`;
      nonSplitParams.push(endDate);
    }
    if (accountId) {
      nonSplitQuery += ` AND t.account_id = ?`;
      nonSplitParams.push(accountId);
    }

    const nonSplitRows = db.prepare(nonSplitQuery).all(...nonSplitParams);

    // 2. Fetch split transaction rows
    let splitQuery = `
      SELECT
        c.id as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        sub.id as subcategory_id,
        COALESCE(sub.name, 'General') as subcategory_name,
        ABS(ts.amount) as amount,
        t.id as trans_id
      FROM transaction_splits ts
      JOIN transactions t ON ts.transaction_id = t.id
      LEFT JOIN categories c ON ts.category_id = c.id
      LEFT JOIN subcategories sub ON ts.subcategory_id = sub.id
      WHERE t.transaction_type = 'expense' AND t.review_status = 'approved'
    `;
    const splitParams = [];

    if (startDate) {
      splitQuery += ` AND t.date >= ?`;
      splitParams.push(startDate);
    }
    if (endDate) {
      splitQuery += ` AND t.date <= ?`;
      splitParams.push(endDate);
    }
    if (accountId) {
      splitQuery += ` AND t.account_id = ?`;
      splitParams.push(accountId);
    }

    const splitRows = db.prepare(splitQuery).all(...splitParams);
    const allExpenseLines = [...nonSplitRows, ...splitRows];

    const categoryMap = {};
    let grandTotal = 0;

    allExpenseLines.forEach(line => {
      grandTotal += line.amount;
      const catKey = line.category_name;
      if (!categoryMap[catKey]) {
        categoryMap[catKey] = {
          category_id: line.category_id,
          category_name: line.category_name,
          total_amount: 0,
          transaction_count: 0,
          subcategories: {}
        };
      }

      categoryMap[catKey].total_amount += line.amount;
      categoryMap[catKey].transaction_count++;

      const subKey = line.subcategory_name;
      if (!categoryMap[catKey].subcategories[subKey]) {
        categoryMap[catKey].subcategories[subKey] = {
          subcategory_id: line.subcategory_id,
          subcategory_name: line.subcategory_name,
          amount: 0,
          count: 0
        };
      }
      categoryMap[catKey].subcategories[subKey].amount += line.amount;
      categoryMap[catKey].subcategories[subKey].count++;
    });

    const categories = Object.values(categoryMap)
      .map(cat => ({
        category_id: cat.category_id,
        category_name: cat.category_name,
        total_amount: Number(cat.total_amount.toFixed(2)),
        transaction_count: cat.transaction_count,
        percentage: grandTotal > 0 ? Number(((cat.total_amount / grandTotal) * 100).toFixed(1)) : 0,
        subcategories: Object.values(cat.subcategories).map(s => ({
          subcategory_id: s.subcategory_id,
          subcategory_name: s.subcategory_name,
          amount: Number(s.amount.toFixed(2)),
          count: s.count,
          percentage: cat.total_amount > 0 ? Number(((s.amount / cat.total_amount) * 100).toFixed(1)) : 0
        })).sort((a, b) => b.amount - a.amount)
      }))
      .sort((a, b) => b.total_amount - a.total_amount);

    return {
      grand_total: Number(grandTotal.toFixed(2)),
      categories
    };
  }

  /**
   * Structured Profit & Loss Statement with Split Support
   */
  static getProfitAndLoss({ startDate, endDate, accountId }) {
    // 1. Income (non-split + splits)
    let incomeQuery = `
      SELECT
        COALESCE(c.name, 'Other Income') as category_name,
        c.id as category_id,
        COALESCE(sub.name, 'General') as subcategory_name,
        sub.id as subcategory_id,
        COALESCE(SUM(t.amount), 0) as amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      WHERE t.transaction_type = 'income' AND t.review_status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
    `;
    const incomeParams = [];

    if (startDate) { incomeQuery += ` AND t.date >= ?`; incomeParams.push(startDate); }
    if (endDate) { incomeQuery += ` AND t.date <= ?`; incomeParams.push(endDate); }
    if (accountId) { incomeQuery += ` AND t.account_id = ?`; incomeParams.push(accountId); }

    incomeQuery += ` GROUP BY c.id, c.name, sub.id, sub.name`;
    const incomeRows = db.prepare(incomeQuery).all(...incomeParams);

    // 2. Expenses (non-split)
    let expNonSplitQuery = `
      SELECT
        COALESCE(c.name, 'Uncategorized Expense') as category_name,
        c.id as category_id,
        COALESCE(sub.name, 'General') as subcategory_name,
        sub.id as subcategory_id,
        COALESCE(SUM(ABS(t.amount)), 0) as amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      WHERE t.transaction_type = 'expense' AND t.review_status = 'approved'
        AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
    `;
    const expParams = [];
    if (startDate) { expNonSplitQuery += ` AND t.date >= ?`; expParams.push(startDate); }
    if (endDate) { expNonSplitQuery += ` AND t.date <= ?`; expParams.push(endDate); }
    if (accountId) { expNonSplitQuery += ` AND t.account_id = ?`; expParams.push(accountId); }
    expNonSplitQuery += ` GROUP BY c.id, c.name, sub.id, sub.name`;
    const expNonSplitRows = db.prepare(expNonSplitQuery).all(...expParams);

    // 3. Expenses (splits)
    let expSplitQuery = `
      SELECT
        COALESCE(c.name, 'Uncategorized Expense') as category_name,
        c.id as category_id,
        COALESCE(sub.name, 'General') as subcategory_name,
        sub.id as subcategory_id,
        COALESCE(SUM(ABS(ts.amount)), 0) as amount
      FROM transaction_splits ts
      JOIN transactions t ON ts.transaction_id = t.id
      LEFT JOIN categories c ON ts.category_id = c.id
      LEFT JOIN subcategories sub ON ts.subcategory_id = sub.id
      WHERE t.transaction_type = 'expense' AND t.review_status = 'approved'
    `;
    const expSplitParams = [];
    if (startDate) { expSplitQuery += ` AND t.date >= ?`; expSplitParams.push(startDate); }
    if (endDate) { expSplitQuery += ` AND t.date <= ?`; expSplitParams.push(endDate); }
    if (accountId) { expSplitQuery += ` AND t.account_id = ?`; expSplitParams.push(accountId); }
    expSplitQuery += ` GROUP BY c.id, c.name, sub.id, sub.name`;
    const expSplitRows = db.prepare(expSplitQuery).all(...expSplitParams);

    // Helper to merge rows and build tree
    const buildTree = (allRows) => {
      const map = {};
      allRows.forEach(r => {
        if (!map[r.category_name]) {
          map[r.category_name] = {
            category_name: r.category_name,
            total: 0,
            subcategories: {}
          };
        }
        map[r.category_name].total += r.amount;

        const subName = r.subcategory_name || 'General';
        if (!map[r.category_name].subcategories[subName]) {
          map[r.category_name].subcategories[subName] = 0;
        }
        map[r.category_name].subcategories[subName] += r.amount;
      });

      return Object.values(map).map(cat => ({
        category_name: cat.category_name,
        total: Number(cat.total.toFixed(2)),
        subcategories: Object.entries(cat.subcategories).map(([subName, amt]) => ({
          subcategory_name: subName,
          amount: Number(amt.toFixed(2))
        }))
      })).sort((a, b) => b.total - a.total);
    };

    const incomeTree = buildTree(incomeRows);
    const expenseTree = buildTree([...expNonSplitRows, ...expSplitRows]);

    const totalIncome = incomeTree.reduce((sum, c) => sum + c.total, 0);
    const totalExpenses = expenseTree.reduce((sum, c) => sum + c.total, 0);
    const netIncome = totalIncome - totalExpenses;

    return {
      start_date: startDate,
      end_date: endDate,
      income: {
        categories: incomeTree,
        total: Number(totalIncome.toFixed(2))
      },
      expenses: {
        categories: expenseTree,
        total: Number(totalExpenses.toFixed(2))
      },
      net_operating_income: Number(netIncome.toFixed(2))
    };
  }

  /**
   * Top Payees Spending Ranking
   */
  static getPayeeSpending({ startDate, endDate, limit = 20 }) {
    let query = `
      SELECT
        t.payee,
        COALESCE(SUM(ABS(t.amount)), 0) as total_spent,
        COUNT(t.id) as transaction_count,
        MAX(t.date) as last_transaction_date,
        c.name as primary_category
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.transaction_type = 'expense' AND t.review_status = 'approved'
    `;
    const params = [];

    if (startDate) { query += ` AND t.date >= ?`; params.push(startDate); }
    if (endDate) { query += ` AND t.date <= ?`; params.push(endDate); }

    query += ` GROUP BY t.payee ORDER BY total_spent DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params);

    return rows.map(r => ({
      payee: r.payee,
      total_spent: Number(r.total_spent.toFixed(2)),
      transaction_count: r.transaction_count,
      last_transaction_date: r.last_transaction_date,
      primary_category: r.primary_category || 'Uncategorized'
    }));
  }
}
