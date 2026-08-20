import { supabase } from './supabaseClient.js';

export const api = {
  // 1. Accounts
  async getAccounts() {
    const { data, error } = await supabase.from('accounts').select('*').order('type').order('name');
    if (error) throw error;
    return { success: true, accounts: data || [] };
  },

  async createAccount(acc) {
    const openBal = parseFloat(acc.opening_balance) || 0;
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
      opening_balance: parseFloat(acc.opening_balance) || 0,
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
      account_name: t.accounts?.name || 'Unknown',
      account_type: t.accounts?.type || 'checking',
      category_name: t.categories?.name || null,
      subcategory_name: t.subcategories?.name || null,
      splits: t.transaction_splits || [],
      attachments: t.transaction_attachments || [],
      has_splits: (t.transaction_splits || []).length > 0,
      has_attachments: (t.transaction_attachments || []).length > 0,
      running_balance: null
    }));

    return { success: true, count: formatted.length, transactions: formatted };
  },

  async createTransaction(payload) {
    const rawAbs = Math.abs(parseFloat(payload.amount) || 0);
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
        amount: parseFloat(s.amount) || 0,
        memo: s.memo?.trim() || null
      }));
      await supabase.from('transaction_splits').insert(splitsData);
    }

    await this.recalculateBalance(payload.account_id);
    return { success: true, transaction_id: trans.id };
  },

  async updateTransaction(id, payload) {
    const rawAbs = Math.abs(parseFloat(payload.amount) || 0);
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
          amount: parseFloat(s.amount) || 0,
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

  // 4. Attachments (Supabase Storage)
  async uploadAttachment(transId, { original_name, mime_type, base64_data }) {
    const cleanBase64 = base64_data.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mime_type || 'image/png' });

    const ext = original_name.split('.').pop() || 'png';
    const storagePath = `receipt_${transId}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from('receipts').upload(storagePath, blob);
    if (uploadErr) throw uploadErr;

    const { data: dbAtt, error: dbErr } = await supabase.from('transaction_attachments').insert([{
      transaction_id: transId,
      storage_path: storagePath,
      original_name: original_name || 'receipt.png',
      mime_type: mime_type || 'image/png',
      file_size: blob.size
    }]).select().single();

    if (dbErr) throw dbErr;
    return { success: true, attachment: dbAtt };
  },

  async deleteAttachment(id) {
    const { data: att } = await supabase.from('transaction_attachments').select('*').eq('id', id).single();
    if (att) {
      await supabase.storage.from('receipts').remove([att.storage_path]);
      await supabase.from('transaction_attachments').delete().eq('id', id);
    }
    return { success: true };
  },

  // 5. Merchant Memory
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
    const match = (rules || []).find(r => upper.includes(r.match_pattern.toUpperCase()));
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

  async reprocessMerchantMemory() { return { success: true, updated_count: 0 }; },

  // 6. Scheduled Bills
  async getScheduled() {
    const { data, error } = await supabase.from('scheduled_transactions').select('*, accounts(name), categories(name), subcategories(name)').order('next_due_date');
    if (error) throw error;
    return { success: true, scheduled: data || [] };
  },

  async createScheduled(item) {
    const { data, error } = await supabase.from('scheduled_transactions').insert([item]).select().single();
    if (error) throw error;
    return { success: true, scheduled_id: data.id };
  },

  async updateScheduled(id, item) {
    const { error } = await supabase.from('scheduled_transactions').update(item).eq('id', id);
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
      amount: sch.amount,
      transaction_type: sch.transaction_type,
      category_id: sch.category_id,
      subcategory_id: sch.subcategory_id,
      memo: `[Auto] ${sch.memo || ''}`
    });
    return { success: true };
  },

  async getProjection(days = 30) {
    const { accounts } = await this.getAccounts();
    const liquidCash = accounts.filter(a => a.type !== 'credit_card' && a.type !== 'loan').reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0);
    return { success: true, projection: { current_cash: liquidCash, projected_cash: liquidCash, net_change: 0, events: [] } };
  },

  // 7. Reports & Dashboard
  async getDashboardSummary() {
    const { accounts } = await this.getAccounts();
    let liquidCash = 0;
    let creditDebt = 0;

    accounts.forEach(a => {
      const bal = parseFloat(a.current_balance) || 0;
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
      const amt = parseFloat(t.amount) || 0;
      if (t.date.startsWith(currentMonth)) {
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
        accounts,
        recent_transactions: (transactions || []).slice(0, 8).map(t => ({
          ...t,
          account_name: t.accounts?.name || 'Account',
          category_name: t.categories?.name || null
        })),
        category_spending: categorySpending,
        cash_flow_trend: [],
        projection_events: []
      }
    };
  },

  async getSpendingByCategory() { return this.getDashboardSummary().then(r => r.summary.category_spending); },
  async getProfitLoss() { return { success: true, income: { total: 0, categories: [] }, expenses: { total: 0, categories: [] }, net_operating_income: 0 }; },
  async getCashFlowTrend() { return { success: true, trend: [] }; },
  async getPayeeSpending() { return { success: true, payees: [] }; },

  // Helpers
  async recalculateBalance(accountId) {
    const { data: acc } = await supabase.from('accounts').select('opening_balance').eq('id', accountId).single();
    if (!acc) return;
    const { data: trans } = await supabase.from('transactions').select('amount').eq('account_id', accountId).eq('review_status', 'approved');
    const transSum = (trans || []).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const newBal = (parseFloat(acc.opening_balance) || 0) + transSum;
    await supabase.from('accounts').update({ current_balance: newBal }).eq('id', accountId);
  },

  async clearTransactions() {
    await supabase.from('transaction_splits').delete().neq('id', 0);
    await supabase.from('transaction_attachments').delete().neq('id', 0);
    await supabase.from('transactions').delete().neq('id', 0);
    const { data: accs } = await supabase.from('accounts').select('*');
    for (const a of (accs || [])) {
      await supabase.from('accounts').update({ current_balance: a.opening_balance }).eq('id', a.id);
    }
    return { success: true };
  }
};