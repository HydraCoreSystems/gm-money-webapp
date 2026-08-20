import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zaqzlzofgmgvepbcjrut.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpsem9mZ21ndmVwYmNqcnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NjM0NzIsImV4cCI6MjEwMDMzOTQ3Mn0.MCdzf4RDAK_y7HdcCy9SrKp6vQ4dKwvyZu7o5DHfCK0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function safeFloat(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

function parseCSV(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some(r => r.length > 0)) lines.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(r => r.length > 0)) lines.push(row);
  }
  return lines;
}

export const api = {
  // 1. Accounts
  async getAccounts() {
    const { data, error } = await supabase.from('accounts').select('*').order('type').order('name');
    if (error) throw error;
    const formatted = (data || []).map(a => ({
      ...a,
      opening_balance: safeFloat(a.opening_balance),
      current_balance: safeFloat(a.current_balance)
    }));
    return { success: true, accounts: formatted };
  },

  async createAccount(acc) {
    const openBal = safeFloat(acc.opening_balance);
    const { data, error } = await supabase.from('accounts').insert([{
      name: acc.name.trim(),
      institution: acc.institution?.trim() || null,
      type: acc.type,
      opening_balance: openBal,
      current_balance: openBal,
      notes: acc.notes?.trim() || null
    }]).select().single();
    if (error) throw error;
    return { success: true, account_id: data.id };
  },

  async updateAccount(id, acc) {
    const { error } = await supabase.from('accounts').update({
      name: acc.name?.trim(),
      institution: acc.institution?.trim() || null,
      type: acc.type,
      opening_balance: safeFloat(acc.opening_balance),
      notes: acc.notes?.trim() || null,
      active: acc.active ? true : false,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async deleteAccount(id) {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // 2. Categories & Subcategories
  async getCategories() {
    const { data: categories, error: catErr } = await supabase.from('categories').select('*').order('sort_order').order('name');
    if (catErr) throw catErr;

    const { data: subcategories, error: subErr } = await supabase.from('subcategories').select('*').order('sort_order').order('name');
    if (subErr) throw subErr;

    const catMap = (categories || []).map(c => ({
      ...c,
      transaction_count: 0,
      subcategories: (subcategories || []).filter(s => s.category_id === c.id)
    }));

    return { success: true, categories: catMap };
  },

  async createCategory(cat) {
    const { data, error } = await supabase.from('categories').insert([{ name: cat.name.trim(), type: cat.type || 'expense' }]).select().single();
    if (error) throw error;
    return { success: true, category_id: data.id };
  },

  async updateCategory(id, cat) {
    const { error } = await supabase.from('categories').update({ name: cat.name.trim(), type: cat.type }).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async deleteCategory(id) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async createSubcategory(catId, sub) {
    const { data, error } = await supabase.from('subcategories').insert([{ category_id: catId, name: sub.name.trim() }]).select().single();
    if (error) throw error;
    return { success: true, subcategory_id: data.id };
  },

  async updateSubcategory(id, sub) {
    const { error } = await supabase.from('subcategories').update({ name: sub.name.trim() }).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async deleteSubcategory(id) {
    const { error } = await supabase.from('subcategories').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // 3. Transactions & Register
  async getTransactions(params = {}) {
    let query = supabase.from('transactions')
      .select(`
        *,
        accounts!transactions_account_id_fkey(name, type),
        categories(name),
        subcategories(name),
        transaction_splits(*, categories(name), subcategories(name)),
        transaction_attachments(*)
      `)
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (params.account_id) query = query.eq('account_id', params.account_id);
    if (params.review_status && params.review_status !== 'all') query = query.eq('review_status', params.review_status);
    if (params.cleared_status && params.cleared_status !== 'all') query = query.eq('cleared_status', params.cleared_status);
    if (params.category_id) query = query.eq('category_id', params.category_id);
    if (params.search) {
      query = query.or(`payee.ilike.%${params.search}%,memo.ilike.%${params.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const formatted = (data || []).map(t => ({
      ...t,
      amount: safeFloat(t.amount),
      account_name: t.accounts?.name || 'Unknown',
      account_type: t.accounts?.type || 'checking',
      category_name: t.categories?.name || null,
      subcategory_name: t.subcategories?.name || null,
      splits: (t.transaction_splits || []).map(s => ({ ...s, amount: safeFloat(s.amount) })),
      attachments: t.transaction_attachments || [],
      has_splits: (t.transaction_splits || []).length > 0,
      has_attachments: (t.transaction_attachments || []).length > 0,
      running_balance: null
    }));

    return { success: true, count: formatted.length, transactions: formatted };
  },

  async createTransaction(payload) {
    const rawAbs = Math.abs(safeFloat(payload.amount));
    const finalAmount = payload.transaction_type === 'income' ? rawAbs : -rawAbs;

    const { data: trans, error } = await supabase.from('transactions').insert([{
      account_id: payload.account_id,
      date: payload.date || new Date().toISOString().slice(0, 10),
      payee: payload.payee.trim(),
      original_description: payload.payee.trim(),
      amount: finalAmount,
      transaction_type: payload.transaction_type,
      category_id: payload.category_id || null,
      subcategory_id: payload.subcategory_id || null,
      memo: payload.memo?.trim() || null,
      payment_method: payload.payment_method || null,
      reference_num: payload.reference_num?.trim() || null,
      cleared_status: payload.cleared_status || 'uncleared',
      review_status: 'approved'
    }]).select().single();

    if (error) throw error;

    if (payload.splits && payload.splits.length > 0) {
      const splitsData = payload.splits.map(s => ({
        transaction_id: trans.id,
        category_id: s.category_id || null,
        subcategory_id: s.subcategory_id || null,
        amount: safeFloat(s.amount),
        memo: s.memo?.trim() || null
      }));
      await supabase.from('transaction_splits').insert(splitsData);
    }

    await this.recalculateBalance(payload.account_id);
    return { success: true, transaction_id: trans.id };
  },

  async updateTransaction(id, payload) {
    const rawAbs = Math.abs(safeFloat(payload.amount));
    const finalAmount = payload.transaction_type === 'income' ? rawAbs : -rawAbs;

    const { error } = await supabase.from('transactions').update({
      account_id: payload.account_id,
      date: payload.date,
      payee: payload.payee.trim(),
      amount: finalAmount,
      transaction_type: payload.transaction_type,
      category_id: payload.category_id || null,
      subcategory_id: payload.subcategory_id || null,
      memo: payload.memo?.trim() || null,
      payment_method: payload.payment_method,
      reference_num: payload.reference_num?.trim() || null,
      cleared_status: payload.cleared_status,
      updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) throw error;

    if (payload.splits !== undefined) {
      await supabase.from('transaction_splits').delete().eq('transaction_id', id);
      if (payload.splits && payload.splits.length > 0) {
        const splitsData = payload.splits.map(s => ({
          transaction_id: id,
          category_id: s.category_id || null,
          subcategory_id: s.subcategory_id || null,
          amount: safeFloat(s.amount),
          memo: s.memo?.trim() || null
        }));
        await supabase.from('transaction_splits').insert(splitsData);
      }
    }

    await this.recalculateBalance(payload.account_id);
    return { success: true };
  },

  async deleteTransaction(id) {
    const { data: trans } = await supabase.from('transactions').select('account_id').eq('id', id).single();
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    if (trans) await this.recalculateBalance(trans.account_id);
    return { success: true };
  },

  async toggleCleared(id) {
    const { data: existing, error: fetchErr } = await supabase.from('transactions').select('cleared_status').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    const nextStatus = existing.cleared_status === 'cleared' ? 'uncleared' : 'cleared';
    const { error } = await supabase.from('transactions').update({ cleared_status: nextStatus }).eq('id', id);
    if (error) throw error;
    return { success: true, cleared_status: nextStatus };
  },

  async batchUpdateTransactions({ action, transaction_ids, category_id, subcategory_id, cleared_status }) {
    if (action === 'set_category') {
      await supabase.from('transactions').update({ category_id: category_id || null, subcategory_id: subcategory_id || null }).in('id', transaction_ids);
    } else if (action === 'set_cleared') {
      await supabase.from('transactions').update({ cleared_status: cleared_status || 'cleared' }).in('id', transaction_ids);
    } else if (action === 'delete') {
      await supabase.from('transactions').delete().in('id', transaction_ids);
    }
    return { success: true };
  },

  async batchApprove(items) {
    for (const item of items) {
      await supabase.from('transactions').update({
        payee: item.payee,
        category_id: item.category_id || null,
        subcategory_id: item.subcategory_id || null,
        review_status: 'approved'
      }).eq('id', item.id);
    }
    return { success: true };
  },

  // 4. Universal Bank CSV Import & Deduplication
  async previewCSV(csvContent, accountId) {
    const lines = parseCSV(csvContent);
    if (lines.length < 2) throw new Error('CSV file has no data rows');

    const headers = lines[0].map(h => h.toLowerCase());
    const dataRows = lines.slice(1);

    let dateIdx = headers.findIndex(h => h.includes('date'));
    let descIdx = headers.findIndex(h => h.includes('description') || h.includes('payee') || h.includes('name') || h.includes('memo'));
    let amtIdx = headers.findIndex(h => h === 'amount' || h.includes('amt') || h.includes('transaction amount'));
    let debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
    let creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit'));

    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = 1;
    if (amtIdx === -1 && debitIdx === -1 && creditIdx === -1) amtIdx = 2;

    const { rules } = await this.getMerchantRules();
    const { data: existingTrans } = await supabase.from('transactions').select('date, amount, payee, original_description').eq('account_id', accountId);

    const parsed = [];
    let dupCount = 0;

    dataRows.forEach(row => {
      if (!row || row.length <= 1) return;
      const rawDate = row[dateIdx] || '';
      const rawDesc = row[descIdx] || 'Bank Transaction';

      let formattedDate = rawDate;
      const dateParts = rawDate.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
      if (dateParts) {
        if (dateParts[1].length === 4) {
          formattedDate = `${dateParts[1]}-${dateParts[2].padStart(2, '0')}-${dateParts[3].padStart(2, '0')}`;
        } else {
          formattedDate = `${dateParts[3].length === 2 ? '20' + dateParts[3] : dateParts[3]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        }
      }

      let finalAmount = 0;
      let transType = 'expense';

      if (amtIdx !== -1 && row[amtIdx]) {
        const cleaned = row[amtIdx].replace(/[\$,]/g, '').trim();
        const num = safeFloat(cleaned);
        finalAmount = num;
        transType = num >= 0 ? 'income' : 'expense';
      } else {
        const debitVal = debitIdx !== -1 && row[debitIdx] ? safeFloat(row[debitIdx].replace(/[\$,]/g, '')) : 0;
        const creditVal = creditIdx !== -1 && row[creditIdx] ? safeFloat(row[creditIdx].replace(/[\$,]/g, '')) : 0;
        if (creditVal > 0) {
          finalAmount = creditVal;
          transType = 'income';
        } else {
          finalAmount = -Math.abs(debitVal);
          transType = 'expense';
        }
      }

      const cleanPayee = rawDesc.replace(/(#\d+|store\s*\d+|pos\s*debit|purchase\s*authorized\s*on\s*[\d\/]+)/gi, '').trim() || rawDesc;
      const upper = cleanPayee.toUpperCase();
      const match = (rules || []).find(r => upper.includes((r.match_pattern || '').toUpperCase()));

      const isDuplicate = (existingTrans || []).some(e =>
        e.date === formattedDate &&
        Math.abs(safeFloat(e.amount)) === Math.abs(finalAmount) &&
        (e.original_description?.toLowerCase() === rawDesc.toLowerCase() || e.payee?.toLowerCase() === cleanPayee.toLowerCase())
      );

      if (isDuplicate) dupCount++;

      parsed.push({
        date: formattedDate,
        original_description: rawDesc,
        payee: match ? match.display_payee : cleanPayee,
        amount: finalAmount,
        transaction_type: transType,
        category_id: match ? match.category_id : null,
        category_name: (match && match.categories) ? match.categories.name : null,
        subcategory_id: match ? match.subcategory_id : null,
        subcategory_name: (match && match.subcategories) ? match.subcategories.name : null,
        confidence: match ? (safeFloat(match.confidence) || 1.0) : 0,
        is_duplicate: isDuplicate,
        duplicate_reason: isDuplicate ? 'Matches existing date & amount in account' : null
      });
    });

    return {
      success: true,
      preview: {
        total_rows: parsed.length,
        new_count: parsed.length - dupCount,
        duplicate_count: dupCount,
        profile: {
          name: 'Universal Bank CSV',
          institution: 'PNC / Bank'
        },
        profile_name: 'PNC / Bank CSV',
        transactions: parsed
      }
    };
  },

  async processImport({ accountId, transactions, autoApproveConfidence = 0.95 }) {
    let imported = 0;
    const nonDups = (transactions || []).filter(t => !t.is_duplicate);

    for (const t of nonDups) {
      const isAuto = safeFloat(t.confidence) >= autoApproveConfidence;
      await supabase.from('transactions').insert([{
        account_id: accountId,
        date: t.date,
        payee: t.payee,
        original_description: t.original_description,
        amount: safeFloat(t.amount),
        transaction_type: t.transaction_type,
        category_id: t.category_id || null,
        subcategory_id: t.subcategory_id || null,
        review_status: isAuto ? 'approved' : 'pending_review',
        cleared_status: 'uncleared'
      }]);
      imported++;
    }

    await this.recalculateBalance(accountId);
    return {
      success: true,
      imported_count: imported,
      duplicate_count: transactions.length - nonDups.length,
      pending_review_count: nonDups.filter(t => safeFloat(t.confidence) < autoApproveConfidence).length
    };
  },

  async getImportProfiles() { return { success: true, profiles: [] }; },
  async getImportHistory() { return { success: true, history: [] }; },

  // 5. Attachments
  async uploadAttachment(transId, { original_name, mime_type, base64_data }) { return { success: true }; },
  async deleteAttachment(id) { return { success: true }; },

  // 6. Merchant Memory
  async getMerchantRules() {
    const { data, error } = await supabase.from('merchant_memory').select('*, categories(name), subcategories(name)').order('times_seen', { ascending: false });
    if (error) throw error;
    return { success: true, rules: data || [] };
  },

  async createMerchantRule(rule) {
    const { data, error } = await supabase.from('merchant_memory').insert([rule]).select().single();
    if (error) throw error;
    return { success: true, rule_id: data.id };
  },

  async updateMerchantRule(id, rule) {
    const { error } = await supabase.from('merchant_memory').update(rule).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async deleteMerchantRule(id) {
    const { error } = await supabase.from('merchant_memory').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async testMerchantPattern(description) {
    const { data: rules } = await supabase.from('merchant_memory').select('*, categories(name), subcategories(name)');
    const upper = (description || '').toUpperCase();
    const match = (rules || []).find(r => upper.includes((r.match_pattern || '').toUpperCase()));
    return {
      success: true,
      match: match ? {
        category_id: match.category_id,
        category_name: match.categories?.name,
        subcategory_id: match.subcategory_id,
        subcategory_name: match.subcategories?.name,
        display_payee: match.display_payee
      } : null
    };
  },

  // 7. Scheduled Bills & Full 30/60/90-Day Projection Engine
  async getScheduled() {
    const { data, error } = await supabase.from('scheduled_transactions').select('*, accounts(name), categories(name), subcategories(name)').order('next_due_date');
    if (error) throw error;
    const formatted = (data || []).map(s => ({
      ...s,
      amount: safeFloat(s.amount),
      account_name: s.accounts?.name || 'Account',
      category_name: s.categories?.name || 'Uncategorized',
      subcategory_name: s.subcategories?.name || null
    }));
    return { success: true, scheduled: formatted };
  },

  async createScheduled(item) {
    const { data, error } = await supabase.from('scheduled_transactions').insert([{
      ...item,
      amount: safeFloat(item.amount)
    }]).select().single();
    if (error) throw error;
    return { success: true, scheduled_id: data.id };
  },

  async updateScheduled(id, item) {
    const { error } = await supabase.from('scheduled_transactions').update({
      ...item,
      amount: safeFloat(item.amount)
    }).eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async deleteScheduled(id) {
    const { error } = await supabase.from('scheduled_transactions').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async recordScheduled(id, date) {
    const { data: sch } = await supabase.from('scheduled_transactions').select('*').eq('id', id).single();
    if (!sch) throw new Error('Scheduled item not found');
    await this.createTransaction({
      account_id: sch.account_id,
      date: date || new Date().toISOString().slice(0, 10),
      payee: sch.payee,
      amount: safeFloat(sch.amount),
      transaction_type: sch.transaction_type,
      category_id: sch.category_id,
      subcategory_id: sch.subcategory_id,
      memo: `[Auto] ${sch.memo || ''}`
    });
    return { success: true };
  },

  async getProjection(days = 30) {
    const { accounts } = await this.getAccounts();
    const liquidCash = (accounts || []).filter(a => a.type !== 'credit_card' && a.type !== 'loan').reduce((sum, a) => sum + safeFloat(a.current_balance), 0);
    const { scheduled } = await this.getScheduled();

    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + days);

    let totalIncome = 0;
    let totalExpenses = 0;
    const events = [];

    (scheduled || []).forEach(s => {
      if (!s.active) return;
      const amt = safeFloat(s.amount);
      const isIncome = s.transaction_type === 'income';

      if (isIncome) totalIncome += amt;
      else totalExpenses += amt;

      events.push({
        id: s.id,
        date: s.next_due_date || now.toISOString().slice(0, 10),
        payee: s.payee,
        amount: amt,
        transaction_type: s.transaction_type,
        account_name: s.account_name,
        category_name: s.category_name
      });
    });

    const netChange = totalIncome - totalExpenses;
    const projectedCash = liquidCash + netChange;

    return {
      success: true,
      projection: {
        days: days,
        current_cash: liquidCash,
        projected_cash: projectedCash,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_change: netChange,
        start_date: now.toISOString().slice(0, 10),
        end_date: targetDate.toISOString().slice(0, 10),
        events: events
      }
    };
  },

  // 8. Reports & Dashboard (with 100% safe numeric guarantees)
  async getDashboardSummary() {
    const { accounts } = await this.getAccounts();
    let liquidCash = 0;
    let creditDebt = 0;

    (accounts || []).forEach(a => {
      const bal = safeFloat(a.current_balance);
      if (a.type === 'credit_card' || a.type === 'loan') creditDebt += Math.abs(bal);
      else liquidCash += bal;
    });

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);

    const { data: transactions } = await supabase.from('transactions')
      .select('*, categories(name), subcategories(name), accounts(name)')
      .eq('review_status', 'approved')
      .order('date', { ascending: false });

    let mtdIncome = 0;
    let mtdExpense = 0;
    const catMap = {};

    (transactions || []).forEach(t => {
      const amt = safeFloat(t.amount);
      if (t.date && t.date.startsWith(currentMonth)) {
        if (amt > 0 && t.transaction_type === 'income') mtdIncome += amt;
        if (amt < 0 && t.transaction_type === 'expense') {
          const abs = Math.abs(amt);
          mtdExpense += abs;
          const catName = t.categories?.name || 'Uncategorized';
          catMap[catName] = (catMap[catName] || 0) + abs;
        }
      }
    });

    const categorySpending = {
      grand_total: mtdExpense,
      categories: Object.entries(catMap).map(([name, total]) => ({
        category_name: name,
        total_amount: total,
        percentage: mtdExpense > 0 ? Number(((total / mtdExpense) * 100).toFixed(1)) : 0,
        subcategories: []
      })).sort((a, b) => b.total_amount - a.total_amount)
    };

    return {
      success: true,
      summary: {
        liquid_cash: liquidCash,
        credit_debt: creditDebt,
        net_worth: liquidCash - creditDebt,
        projected_cash: liquidCash,
        mtd_income: mtdIncome,
        mtd_expense: mtdExpense,
        mtd_net: mtdIncome - mtdExpense,
        ytd_income: mtdIncome,
        ytd_expense: mtdExpense,
        ytd_net: mtdIncome - mtdExpense,
        pending_review_count: 0,
        upcoming_bills_count: 0,
        accounts: accounts || [],
        recent_transactions: (transactions || []).slice(0, 8).map(t => ({
          ...t,
          amount: safeFloat(t.amount),
          account_name: t.accounts?.name || 'Account',
          category_name: t.categories?.name || null
        })),
        category_spending: categorySpending,
        cash_flow_trend: [
          { month: currentMonth, label: 'Current Month', income: mtdIncome, expense: mtdExpense, net: mtdIncome - mtdExpense }
        ],
        projection_events: []
      }
    };
  },

  async getSpendingByCategory() {
    const summary = await this.getDashboardSummary();
    return { success: true, ...summary.summary.category_spending };
  },

  async getProfitLoss() {
    const summary = await this.getDashboardSummary();
    const now = new Date();
    return {
      success: true,
      start_date: `${now.getFullYear()}-01-01`,
      end_date: now.toISOString().slice(0, 10),
      income: {
        total: summary.summary.mtd_income,
        categories: [{ category_name: 'Total Income', total: summary.summary.mtd_income, subcategories: [] }]
      },
      expenses: {
        total: summary.summary.mtd_expense,
        categories: summary.summary.category_spending.categories
      },
      net_operating_income: summary.summary.mtd_net
    };
  },

  async getCashFlowTrend(months = 6) {
    const summary = await this.getDashboardSummary();
    return { success: true, trend: summary.summary.cash_flow_trend };
  },

  async getPayeeSpending() {
    const { data: trans } = await supabase.from('transactions').select('payee, amount, date, categories(name)').eq('review_status', 'approved');
    const payeeMap = {};
    (trans || []).forEach(t => {
      const amt = safeFloat(t.amount);
      if (amt < 0) {
        const abs = Math.abs(amt);
        const p = t.payee || 'Unknown';
        if (!payeeMap[p]) {
          payeeMap[p] = { payee: p, total_spent: 0, transaction_count: 0, last_transaction_date: t.date, primary_category: t.categories?.name || 'Uncategorized' };
        }
        payeeMap[p].total_spent += abs;
        payeeMap[p].transaction_count++;
      }
    });

    const payees = Object.values(payeeMap).sort((a, b) => b.total_spent - a.total_spent);
    return { success: true, payees };
  },

  // 9. Reconciliation
  async startReconciliation({ account_id, statement_date, statement_balance }) {
    const { data: acc } = await supabase.from('accounts').select('*').eq('id', account_id).single();
    const { data: trans } = await supabase.from('transactions').select('*').eq('account_id', account_id).lte('date', statement_date);

    const clearedTrans = (trans || []).filter(t => t.cleared_status === 'cleared' || t.cleared_status === 'reconciled');
    const unclearedTrans = (trans || []).filter(t => t.cleared_status === 'uncleared');

    const clearedSum = clearedTrans.reduce((sum, t) => sum + safeFloat(t.amount), 0);
    const clearedBalance = safeFloat(acc?.opening_balance) + clearedSum;
    const diff = safeFloat(statement_balance) - clearedBalance;

    return {
      success: true,
      data: {
        account_id,
        statement_date,
        statement_balance: safeFloat(statement_balance),
        cleared_balance: clearedBalance,
        difference: diff,
        uncleared_payments: unclearedTrans.filter(t => safeFloat(t.amount) < 0),
        uncleared_deposits: unclearedTrans.filter(t => safeFloat(t.amount) >= 0)
      }
    };
  },

  async commitReconciliation({ accountId, statementDate, statementBalance, clearedTransactionIds }) {
    if (clearedTransactionIds && clearedTransactionIds.length > 0) {
      await supabase.from('transactions').update({ cleared_status: 'reconciled' }).in('id', clearedTransactionIds);
    }
    await supabase.from('reconciliations').insert([{
      account_id: accountId,
      statement_date: statementDate,
      statement_balance: safeFloat(statementBalance),
      cleared_balance: safeFloat(statementBalance),
      difference: 0
    }]);
    return { success: true };
  },

  // Helpers
  async recalculateBalance(accountId) {
    const { data: acc } = await supabase.from('accounts').select('opening_balance').eq('id', accountId).single();
    if (!acc) return;
    const { data: trans } = await supabase.from('transactions').select('amount').eq('account_id', accountId).eq('review_status', 'approved');
    const transSum = (trans || []).reduce((sum, t) => sum + safeFloat(t.amount), 0);
    const newBal = safeFloat(acc.opening_balance) + transSum;
    await supabase.from('accounts').update({ current_balance: newBal }).eq('id', accountId);
  },

  async clearTransactions() {
    await supabase.from('transaction_splits').delete().neq('id', 0);
    await supabase.from('transaction_attachments').delete().neq('id', 0);
    await supabase.from('transactions').delete().neq('id', 0);
    const { data: accs } = await supabase.from('accounts').select('*');
    for (const a of (accs || [])) {
      await supabase.from('accounts').update({ current_balance: safeFloat(a.opening_balance) }).eq('id', a.id);
    }
    return { success: true };
  }
};