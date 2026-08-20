  async processImport({ accountId, transactions }) {
    const accId = parseInt(accountId, 10);
    const nonDups = (transactions || []).filter(t => !t.is_duplicate);

    if (nonDups.length === 0) {
      return { success: true, imported_count: 0, duplicate_count: transactions.length, pending_review_count: 0 };
    }

    const rows = nonDups.map(t => ({
      account_id: accId,
      date: t.date,
      payee: t.payee,
      original_description: t.original_description,
      amount: safeFloat(t.amount),
      transaction_type: t.transaction_type || (safeFloat(t.amount) >= 0 ? 'income' : 'expense'),
      category_id: t.category_id || null,
      subcategory_id: t.subcategory_id || null,
      review_status: 'approved',
      cleared_status: 'uncleared'
    }));

    const { error } = await supabase.from('transactions').insert(rows);
    if (error) throw error;

    await this.recalculateBalance(accId);
    return {
      success: true,
      imported_count: rows.length,
      duplicate_count: transactions.length - rows.length,
      pending_review_count: 0
    };
  },