import {
  supabase,
  safeFloat,
  toCents,
  fromCents,
  extractAmount,
  parseCSV,
  detectCSVProfile,
  normalizeDate,
  normalizeDescription,
  determineType,
  formatPayee
} from './services/supabaseClient.js';
import { buildBaseKey, generateFingerprint } from './services/fingerprint.js';

export const api = {
  // ================================================================
  // 1. Accounts
  // ================================================================
  async getAccounts() {
    const { data: rawData, error } = await supabase.from('accounts').select('*');
    if (error) throw error;

    const accounts = rawData || [];

    const formatted = accounts.map(a => ({
      ...a,
      institution: a.institution || 'Bank',
      opening_balance: safeFloat(a.opening_balance),
      current_balance: safeFloat(a.current_balance)
    })).sort((a, b) => {
      if (a.type === 'checking') return -1;
      if (b.type === 'checking') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return { success: true, accounts: formatted };
  },

  async createAccount(acc) {
    const openBal = safeFloat(acc.opening_balance);
    const { data, error } = await supabase.from('accounts').insert([{
      name: acc.name.trim(),
      institution: acc.institution?.trim() || 'Bank',
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
      institution: acc.institution?.trim() || 'Bank',
      type: acc.type,
      opening_balance: safeFloat(acc.opening_balance),
      notes: acc.notes?.trim() || null,
      active: acc.active ? true : false,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    await this.recalculateBalance(id);
    return { success: true };
  },

  async deleteAccount(id) {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // ================================================================
  // 2. Categories & Subcategories
  // ================================================================
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

  // ================================================================
  // 3. Transactions & Register
  // ================================================================
  async getTransactions(params = {}) {
    const [accRes, catRes, transRes] = await Promise.all([
      this.getAccounts(),
      this.getCategories(),
      supabase.from('transactions').select('*').order('date', { ascending: false }).order('id', { ascending: false })
    ]);

    if (transRes.error) throw transRes.error;

    const accMap = {};
    accRes.accounts.forEach(a => { accMap[a.id] = a; });

    const catMap = {};
    const subMap = {};
    catRes.categories.forEach(c => {
      catMap[c.id] = c.name;
      (c.subcategories || []).forEach(s => { subMap[s.id] = s.name; });
    });

    let list = transRes.data || [];

    if (params.account_id) list = list.filter(t => String(t.account_id) === String(params.account_id));
    if (params.review_status && params.review_status !== 'all') list = list.filter(t => t.review_status === params.review_status);
    if (params.cleared_status && params.cleared_status !== 'all') list = list.filter(t => t.cleared_status === params.cleared_status);
    if (params.category_id) list = list.filter(t => String(t.category_id) === String(params.category_id));
    if (params.search) {
      const s = params.search.toLowerCase();
      list = list.filter(t => (t.payee || '').toLowerCase().includes(s) || (t.memo || '').toLowerCase().includes(s));
    }

    // Compute running balances if single account view
    let runningMap = {};
    if (params.account_id) {
      const accId = parseInt(params.account_id, 10);
      const acc = accMap[accId];
      if (acc) {
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        let running = safeFloat(acc.opening_balance);
        sorted.forEach(t => {
          running += safeFloat(t.amount);
          runningMap[t.id] = Math.round(running * 100) / 100;
        });
      }
    }

    const formatted = list.map(t => ({
      ...t,
      amount: safeFloat(t.amount),
      account_name: accMap[t.account_id]?.name || 'Gathering Moss Business Checking',
      account_type: accMap[t.account_id]?.type || 'checking',
      category_name: catMap[t.category_id] || null,
      subcategory_name: subMap[t.subcategory_id] || null,
      splits: [],
      attachments: [],
      has_splits: false,
      has_attachments: false,
      running_balance: runningMap[t.id] !== undefined ? runningMap[t.id] : null
    }));

    return { success: true, count: formatted.length, transactions: formatted };
  },

  async createTransaction(payload) {
    const rawAbs = Math.abs(safeFloat(payload.amount));
    const finalAmount = payload.transaction_type === 'income' ? rawAbs : -rawAbs;

    const { data: trans, error } = await supabase.from('transactions').insert([{
      account_id: parseInt(payload.account_id, 10),
      date: payload.date || new Date().toISOString().slice(0, 10),
      payee: payload.payee.trim(),
      original_description: payload.payee.trim(),
      amount: finalAmount,
      transaction_type: payload.transaction_type,
      category_id: payload.category_id ? parseInt(payload.category_id, 10) : null,
      subcategory_id: payload.subcategory_id ? parseInt(payload.subcategory_id, 10) : null,
      memo: payload.memo?.trim() || null,
      payment_method: payload.payment_method || null,
      reference_num: payload.reference_num?.trim() || null,
      cleared_status: payload.cleared_status || 'uncleared',
      review_status: 'approved'
    }]).select().single();

    if (error) throw error;

    await this.recalculateBalance(payload.account_id);
    return { success: true, transaction_id: trans.id };
  },

  async updateTransaction(id, payload) {
    const rawAbs = Math.abs(safeFloat(payload.amount));
    const finalAmount = payload.transaction_type === 'income' ? rawAbs : -rawAbs;

    const { error } = await supabase.from('transactions').update({
      account_id: parseInt(payload.account_id, 10),
      date: payload.date,
      payee: payload.payee.trim(),
      amount: finalAmount,
      transaction_type: payload.transaction_type,
      category_id: payload.category_id ? parseInt(payload.category_id, 10) : null,
      subcategory_id: payload.subcategory_id ? parseInt(payload.subcategory_id, 10) : null,
      memo: payload.memo?.trim() || null,
      payment_method: payload.payment_method,
      reference_num: payload.reference_num?.trim() || null,
      cleared_status: payload.cleared_status,
      updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) throw error;

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
    if (!transaction_ids || transaction_ids.length === 0) return { success: true };
    if (action === 'set_category') {
      await supabase.from('transactions').update({
        category_id: category_id ? parseInt(category_id, 10) : null,
        subcategory_id: subcategory_id ? parseInt(subcategory_id, 10) : null
      }).in('id', transaction_ids);
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
        category_id: item.category_id ? parseInt(item.category_id, 10) : null,
        subcategory_id: item.subcategory_id ? parseInt(item.subcategory_id, 10) : null,
        review_status: 'approved'
      }).eq('id', item.id);
    }
    return { success: true };
  },

  // ================================================================
  // 4. CSV Import: Header-based detection, fingerprint dedup, PNC support
  // ================================================================
  async previewCSV(csvContent, accountId) {
    const allRows = parseCSV(csvContent);
    if (allRows.length === 0) throw new Error('CSV file is empty');

    const headers = allRows[0];
    const dataRows = allRows.slice(1);

    const profile = detectCSVProfile(headers);

    // Build header index map
    let hdrMap = null;
    if (profile) {
      hdrMap = {};
      headers.forEach((h, idx) => { hdrMap[h.trim()] = idx; });
    }

    const getVal = (row, colName) => {
      if (!hdrMap || !colName || hdrMap[colName] === undefined) return '';
      return (row[hdrMap[colName]] || '').trim();
    };

    // Get merchant rules for auto-suggest
    const { rules } = await this.getMerchantRules();

    // Get existing fingerprints for deduplication
    let existingFingerprints = new Set();
    if (accountId) {
      const { data: existing } = await supabase.from('transactions')
        .select('fingerprint')
        .eq('account_id', parseInt(accountId, 10))
        .not('fingerprint', 'is', null);
      (existing || []).forEach(t => { if (t.fingerprint) existingFingerprints.add(t.fingerprint); });
    }

    const parsed = [];
    let dupCount = 0;

    // Occurrence counters per base key within this CSV
    // baseKey = accountId|date|signedAmount|normalizedPayee
    const csvOccurrence = {};

    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const row = dataRows[rIdx];
      if (!row || row.length === 0 || row.every(c => !c || !c.trim())) continue;

      let isoDate = null;
      let rawPayee = '';
      let rawAmount = 0;

      if (profile) {
        const rawDate = getVal(row, profile.dateCol);
        isoDate = normalizeDate(rawDate);
        if (!isoDate) continue;

        rawPayee = (profile.payeeCol ? getVal(row, profile.payeeCol) : headers[1]) || row[1] || '';
        rawAmount = extractAmount(getVal(row, profile.amountCol)) || 0;
        if (rawAmount === 0 && profile.amountCol) {
          const raw = getVal(row, profile.amountCol);
          const num = parseFloat(raw.replace(/[^\d\.\-+]/g, ''));
          if (!isNaN(num)) rawAmount = Math.round(num * 100) / 100;
        }
      } else {
        let dateIdx = -1;
        for (let i = 0; i < row.length; i++) {
          const d = normalizeDate(row[i]);
          if (d) { isoDate = d; dateIdx = i; break; }
        }
        if (!isoDate) continue;

        let descIdx = -1;
        for (let i = 0; i < row.length; i++) {
          if (i === dateIdx) continue;
          if (/[a-zA-Z]/.test(row[i]) && row[i].length > rawPayee.length) {
            rawPayee = row[i];
            descIdx = i;
          }
        }
        if (!rawPayee) rawPayee = 'Bank Transaction';

        const foundNums = [];
        for (let i = 0; i < row.length; i++) {
          if (i === dateIdx || i === descIdx) continue;
          const num = extractAmount(row[i]);
          if (num !== null) foundNums.push(num);
        }
        rawAmount = foundNums.length > 0 ? foundNums[0] : 0;
      }

      if (rawAmount === 0 && !rawPayee) continue;

      const cleanPayee = normalizeDescription(rawPayee) || rawPayee;
      const displayPayee = formatPayee(cleanPayee);
      const transType = determineType(rawAmount, rawPayee);

      // Preserve signed amount for fingerprint: debit/refund must not collide
      let finalAmount = rawAmount;
      if (transType === 'expense' && finalAmount > 0) finalAmount = -finalAmount;
      if (transType === 'income' && finalAmount < 0) finalAmount = Math.abs(finalAmount);

      // Merchant memory match
      const upper = cleanPayee.toUpperCase();
      const match = (rules || []).find(r => upper.includes((r.match_pattern || '').toUpperCase()));

      // Occurrence-based deduplication:
      // baseKey includes signed amount → debit (-$27.95) and refund (+$27.95) get different keys
      // Two identical purchases get occurrence 1 and 2 → distinct fingerprints
      const baseKey = buildBaseKey(accountId, isoDate, finalAmount, cleanPayee);
      csvOccurrence[baseKey] = (csvOccurrence[baseKey] || 0) + 1;
      const occ = csvOccurrence[baseKey];

      const fingerprint = await generateFingerprint(accountId, isoDate, finalAmount, cleanPayee, occ);

      const isDuplicate = existingFingerprints.has(fingerprint);
      if (isDuplicate) dupCount++;

      parsed.push({
        row_index: rIdx + 1,
        date: isoDate,
        original_description: rawPayee,
        payee: match ? match.display_payee : displayPayee,
        amount: finalAmount,
        transaction_type: transType,
        suggested_category_id: match ? match.category_id : null,
        suggested_subcategory_id: match ? match.subcategory_id : null,
        category_name: null,
        subcategory_name: null,
        confidence: match ? safeFloat(match.confidence || 1.0) : 0,
        is_duplicate: isDuplicate,
        duplicate_reason: isDuplicate ? 'Identical transaction (date + signed amount + payee + occurrence) already exists in account' : null,
        fingerprint
      });
    }

    return {
      success: true,
      preview: {
        total_rows: parsed.length,
        new_count: parsed.length - dupCount,
        duplicate_count: dupCount,
        error_count: 0,
        profile: profile || { name: 'Generic CSV', institution: 'Unknown' },
        profile_name: profile ? profile.name : 'Generic CSV',
        transactions: parsed
      }
    };
  },

  async processImport({ filename, accountId, account_id, transactions }) {
    const accId = parseInt(accountId || account_id, 10);
    if (isNaN(accId)) {
      throw new Error('Destination account ID is required for import');
    }

    const nonDups = (transactions || []).filter(t => !t.is_duplicate);

    if (nonDups.length === 0) {
      return { success: true, imported_count: 0, duplicate_count: (transactions || []).length, review_required_count: 0 };
    }

    // Partition: each transaction belongs to exactly one outcome
    const payloadRows = nonDups.map(t => {
      const highConf = (t.confidence ?? 0) >= 0.7;
      const hasSuggestion = t.suggested_category_id != null;

      return {
        date: t.date || new Date().toISOString().slice(0, 10),
        payee: t.payee || 'Bank Transaction',
        original_description: t.original_description || t.payee,
        amount: safeFloat(t.amount),
        transaction_type: t.transaction_type || (safeFloat(t.amount) >= 0 ? 'income' : 'expense'),
        suggested_category_id: hasSuggestion ? parseInt(t.suggested_category_id, 10) : null,
        suggested_subcategory_id: t.suggested_subcategory_id ? parseInt(t.suggested_subcategory_id, 10) : null,
        confidence: safeFloat(t.confidence ?? 0),
        fingerprint: t.fingerprint || null,
        meta: { highConf, hasSuggestion }
      };
    });

    // Verify classification is mutually exclusive
    const approveCount = payloadRows.filter(r => r.meta.highConf && r.meta.hasSuggestion).length;
    const reviewCount = payloadRows.length - approveCount;

    // Call the atomic RPC — everything succeeds or nothing persists
    const { data: result, error: rpcError } = await supabase.rpc('fc_import_transactions', {
      p_account_id: accId,
      p_filename: filename || 'manual_import.csv',
      p_transactions: payloadRows
    });

    if (rpcError) {
      throw new Error('Import failed: ' + rpcError.message);
    }

    if (!result || !result.success) {
      throw new Error('Import RPC returned without success');
    }

    return {
      success: true,
      import_id: result.import_id,
      imported_count: result.imported_count,
      duplicate_count: result.duplicate_count,
      review_required_count: result.review_required_count,
      classified: { approved: approveCount, review: reviewCount }
    };
  },

  async getImportProfiles() {
    const { data, error } = await supabase.from('import_profiles').select('*').order('name');
    if (error) return { success: true, profiles: [] };
    return { success: true, profiles: data || [] };
  },

  async getImportHistory() {
    const { data, error } = await supabase.from('import_history').select('*, accounts(name)').order('import_date', { ascending: false }).limit(20);
    if (error) return { success: true, history: [] };
    return { success: true, history: data || [] };
  },

  // ================================================================
  // 5. Attachments (stubs)
  // ================================================================
  async uploadAttachment() { return { success: true }; },
  async deleteAttachment() { return { success: true }; },

  // ================================================================
  // 6. Merchant Memory
  // ================================================================
  async getMerchantRules() {
    const { data, error } = await supabase.from('merchant_memory').select('*').order('times_seen', { ascending: false });
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
    const { rules } = await this.getMerchantRules();
    const upper = (description || '').toUpperCase();
    const match = (rules || []).find(r => upper.includes((r.match_pattern || '').toUpperCase()));
    return {
      success: true,
      match: match ? {
        category_id: match.category_id,
        category_name: null,
        subcategory_id: match.subcategory_id,
        subcategory_name: null,
        display_payee: match.display_payee
      } : null
    };
  },

  async reprocessMerchantMemory() {
    const { data: pending } = await supabase.from('transactions').select('id, original_description, payee').eq('review_status', 'pending_review');
    if (!pending || pending.length === 0) return { success: true, updated_count: 0 };

    const { rules } = await this.getMerchantRules();
    let updated = 0;

    for (const t of pending) {
      const upper = (t.original_description || t.payee || '').toUpperCase();
      const match = (rules || []).find(r => upper.includes((r.match_pattern || '').toUpperCase()));
      if (match && match.category_id) {
        await supabase.from('transactions').update({
          category_id: match.category_id,
          subcategory_id: match.subcategory_id || null,
          payee: match.display_payee || t.payee
        }).eq('id', t.id);
        updated++;
      }
    }

    return { success: true, updated_count: updated };
  },

  // ================================================================
  // 7. Scheduled Bills & Projections
  // ================================================================
  async getScheduled() {
    const [accRes, catRes, schRes] = await Promise.all([
      this.getAccounts(),
      this.getCategories(),
      supabase.from('scheduled_transactions').select('*').order('next_due_date')
    ]);

    if (schRes.error) throw schRes.error;

    const accMap = {};
    accRes.accounts.forEach(a => { accMap[a.id] = a.name; });

    const catMap = {};
    const subMap = {};
    catRes.categories.forEach(c => {
      catMap[c.id] = c.name;
      (c.subcategories || []).forEach(s => { subMap[s.id] = s.name; });
    });

    const formatted = (schRes.data || []).map(s => ({
      ...s,
      amount: safeFloat(s.amount),
      account_name: accMap[s.account_id] || 'Account',
      category_name: catMap[s.category_id] || 'Uncategorized',
      subcategory_name: subMap[s.subcategory_id] || null
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
    const result = await this.createTransaction({
      account_id: sch.account_id,
      date: date || new Date().toISOString().slice(0, 10),
      payee: sch.payee,
      amount: safeFloat(sch.amount),
      transaction_type: sch.transaction_type,
      category_id: sch.category_id,
      subcategory_id: sch.subcategory_id,
      memo: `[Auto] ${sch.memo || ''}`
    });
    return { success: true, transaction_id: result.transaction_id };
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
        days,
        current_cash: liquidCash,
        projected_cash: projectedCash,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_change: netChange,
        start_date: now.toISOString().slice(0, 10),
        end_date: targetDate.toISOString().slice(0, 10),
        events
      }
    };
  },

  // ================================================================
  // 8. Reports & Dashboard
  // ================================================================
  async getDashboardSummary() {
    const [accRes, catRes, transRes] = await Promise.all([
      this.getAccounts(),
      this.getCategories(),
      supabase.from('transactions').select('*').eq('review_status', 'approved').order('date', { ascending: false })
    ]);

    const accounts = accRes.accounts || [];
    let liquidCash = 0;
    let creditDebt = 0;

    accounts.forEach(a => {
      const bal = safeFloat(a.current_balance);
      if (a.type === 'credit_card' || a.type === 'loan') creditDebt += Math.abs(bal);
      else liquidCash += bal;
    });

    const accMap = {};
    accounts.forEach(a => { accMap[a.id] = a.name; });

    const catMap = {};
    catRes.categories.forEach(c => { catMap[c.id] = c.name; });

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const currentYear = now.toISOString().slice(0, 4);
    const transactions = transRes.data || [];

    let mtdIncome = 0;
    let mtdExpense = 0;
    let ytdIncome = 0;
    let ytdExpense = 0;
    const catSpendingMap = {};

    transactions.forEach(t => {
      const amt = safeFloat(t.amount);
      if (t.date) {
        if (t.date.startsWith(currentMonth)) {
          if (amt > 0 && (t.transaction_type === 'income' || t.transaction_type === 'transfer')) mtdIncome += amt;
          if (amt < 0 && t.transaction_type === 'expense') {
            const abs = Math.abs(amt);
            mtdExpense += abs;
            const catName = catMap[t.category_id] || 'Uncategorized';
            catSpendingMap[catName] = (catSpendingMap[catName] || 0) + abs;
          }
        }
        if (t.date.startsWith(currentYear)) {
          if (amt > 0 && (t.transaction_type === 'income' || t.transaction_type === 'transfer')) ytdIncome += amt;
          if (amt < 0 && t.transaction_type === 'expense') ytdExpense += Math.abs(amt);
        }
      }
    });

    const categorySpending = {
      grand_total: mtdExpense,
      categories: Object.entries(catSpendingMap).map(([name, total]) => ({
        category_name: name,
        total_amount: total,
        percentage: mtdExpense > 0 ? Number(((total / mtdExpense) * 100).toFixed(1)) : 0,
        subcategories: []
      })).sort((a, b) => b.total_amount - a.total_amount)
    };

    const pendingCount = (await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('review_status', 'pending_review')).count || 0;

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
        ytd_income: ytdIncome,
        ytd_expense: ytdExpense,
        ytd_net: ytdIncome - ytdExpense,
        pending_review_count: pendingCount,
        upcoming_bills_count: 0,
        accounts,
        recent_transactions: transactions.slice(0, 8).map(t => ({
          ...t,
          amount: safeFloat(t.amount),
          account_name: accMap[t.account_id] || 'Account',
          category_name: catMap[t.category_id] || null
        })),
        category_spending: categorySpending,
        cash_flow_trend: [
          { month: currentMonth, label: 'Current Month', income: mtdIncome, expense: mtdExpense, net: mtdIncome - mtdExpense }
        ],
        projection_events: []
      }
    };
  },

  async getSpendingByCategory(startDate, endDate, accountId) {
    const { data: trans } = await supabase.from('transactions').select('*').eq('review_status', 'approved').eq('transaction_type', 'expense');

    let filtered = trans || [];
    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);
    if (accountId) filtered = filtered.filter(t => String(t.account_id) === String(accountId));

    const { categories: cats } = await this.getCategories();
    const catMap = {};
    (cats || []).forEach(c => { catMap[c.id] = c.name; });

    const spendingMap = {};
    let grandTotal = 0;

    filtered.forEach(t => {
      const abs = Math.abs(safeFloat(t.amount));
      grandTotal += abs;
      const catName = catMap[t.category_id] || 'Uncategorized';
      spendingMap[catName] = (spendingMap[catName] || 0) + abs;
    });

    const categories = Object.entries(spendingMap).map(([name, total]) => ({
      category_name: name,
      total_amount: Math.round(total * 100) / 100,
      percentage: grandTotal > 0 ? Number(((total / grandTotal) * 100).toFixed(1)) : 0,
      subcategories: []
    })).sort((a, b) => b.total_amount - a.total_amount);

    return { success: true, grand_total: Math.round(grandTotal * 100) / 100, categories };
  },

  async getProfitLoss(startDate, endDate, accountId) {
    const { data: trans } = await supabase.from('transactions').select('*').eq('review_status', 'approved');

    let filtered = trans || [];
    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);
    if (accountId) filtered = filtered.filter(t => String(t.account_id) === String(accountId));

    const { categories: cats } = await this.getCategories();
    const catMap = {};
    (cats || []).forEach(c => { catMap[c.id] = c.name; });

    let totalIncome = 0;
    let totalExpenses = 0;
    const incomeMap = {};
    const expenseMap = {};

    filtered.forEach(t => {
      const amt = safeFloat(t.amount);
      if (amt > 0 && (t.transaction_type === 'income' || t.transaction_type === 'transfer')) {
        totalIncome += amt;
        const cat = catMap[t.category_id] || 'Other Income';
        incomeMap[cat] = (incomeMap[cat] || 0) + amt;
      }
      if (amt < 0 && t.transaction_type === 'expense') {
        const abs = Math.abs(amt);
        totalExpenses += abs;
        const cat = catMap[t.category_id] || 'Uncategorized Expense';
        expenseMap[cat] = (expenseMap[cat] || 0) + abs;
      }
    });

    const incomeCategories = Object.entries(incomeMap).map(([name, total]) => ({
      category_name: name,
      total: Math.round(total * 100) / 100,
      subcategories: []
    })).sort((a, b) => b.total - a.total);

    const expenseCategories = Object.entries(expenseMap).map(([name, total]) => ({
      category_name: name,
      total: Math.round(total * 100) / 100,
      subcategories: []
    })).sort((a, b) => b.total - a.total);

    return {
      success: true,
      start_date: startDate || 'All Time',
      end_date: endDate || new Date().toISOString().slice(0, 10),
      income: { categories: incomeCategories, total: Math.round(totalIncome * 100) / 100 },
      expenses: { categories: expenseCategories, total: Math.round(totalExpenses * 100) / 100 },
      net_operating_income: Math.round((totalIncome - totalExpenses) * 100) / 100
    };
  },

  async getCashFlowTrend(months = 12) {
    const { data: trans } = await supabase.from('transactions').select('date, amount, transaction_type').eq('review_status', 'approved');

    const results = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });

      let income = 0;
      let expense = 0;

      (trans || []).forEach(t => {
        if (t.date && t.date.startsWith(monthStr)) {
          const amt = safeFloat(t.amount);
          if (amt > 0 && t.transaction_type === 'income') income += amt;
          if (amt < 0 && t.transaction_type === 'expense') expense += Math.abs(amt);
        }
      });

      results.push({
        month: monthStr,
        label,
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        net: Math.round((income - expense) * 100) / 100
      });
    }

    return { success: true, trend: results };
  },

  async getPayeeSpending(startDate, endDate) {
    const { data: trans } = await supabase.from('transactions').select('*').eq('review_status', 'approved').eq('transaction_type', 'expense');

    let filtered = trans || [];
    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);

    const payeeMap = {};
    filtered.forEach(t => {
      const abs = Math.abs(safeFloat(t.amount));
      const p = t.payee || 'Unknown';
      if (!payeeMap[p]) {
        payeeMap[p] = { payee: p, total_spent: 0, transaction_count: 0, last_transaction_date: t.date, primary_category: 'Expense' };
      }
      payeeMap[p].total_spent += abs;
      payeeMap[p].transaction_count++;
    });

    const payees = Object.values(payeeMap).map(p => ({
      ...p,
      total_spent: Math.round(p.total_spent * 100) / 100
    })).sort((a, b) => b.total_spent - a.total_spent);

    return { success: true, payees };
  },

  // ================================================================
  // 9. Reconciliation
  // ================================================================
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

  // ================================================================
  // 10. Backups & Reset
  // ================================================================
  async listBackups() { return { success: true, backups: [] }; },

  async createBackupSnapshot() {
    const [accs, cats, subs, trans, sch, rules] = await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('subcategories').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('scheduled_transactions').select('*'),
      supabase.from('merchant_memory').select('*')
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      app: 'Gathering Moss Financial Center',
      data: {
        accounts: accs.data || [],
        categories: cats.data || [],
        subcategories: subs.data || [],
        transactions: trans.data || [],
        scheduled_transactions: sch.data || [],
        merchant_memory: rules.data || []
      }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gathering_moss_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return { success: true, filename: a.download };
  },

  async importLegacySheets() { return { success: true, imported_count: 0 }; },

  async recalculateBalance(accountId) {
    const { data: acc } = await supabase.from('accounts').select('opening_balance').eq('id', accountId).single();
    if (!acc) return;
    const { data: trans } = await supabase.from('transactions').select('amount').eq('account_id', accountId).eq('review_status', 'approved');
    const transCents = (trans || []).reduce((sum, t) => sum + toCents(t.amount), 0);
    const openCents = toCents(acc.opening_balance);
    const newBal = (openCents + transCents) / 100;
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
