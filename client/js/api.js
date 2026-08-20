// Gathering Moss API Client

export const api = {
  async request(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error [${url}]:`, err);
      throw err;
    }
  },

  // Accounts
  getAccounts: () => api.request('/api/accounts'),
  createAccount: (data) => api.request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id, data) => api.request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id) => api.request(`/api/accounts/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => api.request('/api/categories'),
  createCategory: (data) => api.request('/api/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => api.request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => api.request(`/api/categories/${id}`, { method: 'DELETE' }),
  createSubcategory: (catId, data) => api.request(`/api/categories/${catId}/subcategories`, { method: 'POST', body: JSON.stringify(data) }),
  updateSubcategory: (id, data) => api.request(`/api/subcategories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubcategory: (id) => api.request(`/api/subcategories/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/api/transactions${qs ? '?' + qs : ''}`);
  },
  createTransaction: (data) => api.request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => api.request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => api.request(`/api/transactions/${id}`, { method: 'DELETE' }),
  toggleCleared: (id) => api.request(`/api/transactions/${id}/cleared`, { method: 'PATCH' }),
  batchApprove: (items, learn = true) => api.request('/api/transactions/batch-approve', { method: 'POST', body: JSON.stringify({ items, learn }) }),
  batchUpdateTransactions: (data) => api.request('/api/transactions/batch-update', { method: 'POST', body: JSON.stringify(data) }),

  // Attachments (Receipts & Invoices)
  uploadAttachment: (transId, data) => api.request(`/api/transactions/${transId}/attachments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAttachment: (id) => api.request(`/api/attachments/${id}`, { method: 'DELETE' }),

  // Merchant Memory
  getMerchantRules: () => api.request('/api/merchant-memory'),
  createMerchantRule: (data) => api.request('/api/merchant-memory', { method: 'POST', body: JSON.stringify(data) }),
  updateMerchantRule: (id, data) => api.request(`/api/merchant-memory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMerchantRule: (id) => api.request(`/api/merchant-memory/${id}`, { method: 'DELETE' }),
  testMerchantPattern: (description) => api.request('/api/merchant-memory/test', { method: 'POST', body: JSON.stringify({ description }) }),
  reprocessMerchantMemory: () => api.request('/api/merchant-memory/reprocess', { method: 'POST' }),

  // Scheduled Transactions
  getScheduled: () => api.request('/api/scheduled'),
  createScheduled: (data) => api.request('/api/scheduled', { method: 'POST', body: JSON.stringify(data) }),
  updateScheduled: (id, data) => api.request(`/api/scheduled/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScheduled: (id) => api.request(`/api/scheduled/${id}`, { method: 'DELETE' }),
  recordScheduled: (id, date) => api.request(`/api/scheduled/${id}/record`, { method: 'POST', body: JSON.stringify({ date }) }),
  getProjection: (days = 30) => api.request(`/api/scheduled/projection?days=${days}`),

  // CSV Import
  previewCSV: (csv_content, account_id, custom_profile) => api.request('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv_content, account_id, custom_profile })
  }),
  processImport: (data) => api.request('/api/import/process', { method: 'POST', body: JSON.stringify(data) }),
  getImportProfiles: () => api.request('/api/import/profiles'),
  saveImportProfile: (data) => api.request('/api/import/profiles', { method: 'POST', body: JSON.stringify(data) }),
  getImportHistory: () => api.request('/api/import/history'),

  // Reconciliation
  startReconciliation: (data) => api.request('/api/reconciliation/start', { method: 'POST', body: JSON.stringify(data) }),
  commitReconciliation: (data) => api.request('/api/reconciliation/commit', { method: 'POST', body: JSON.stringify(data) }),

  // Reports
  getDashboardSummary: () => api.request('/api/reports/dashboard'),
  getSpendingByCategory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/api/reports/spending-category${qs ? '?' + qs : ''}`);
  },
  getProfitLoss: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/api/reports/profit-loss${qs ? '?' + qs : ''}`);
  },
  getCashFlowTrend: (months = 12) => api.request(`/api/reports/cash-flow?months=${months}`),
  getPayeeSpending: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/api/reports/payees${qs ? '?' + qs : ''}`);
  },

  // Backups & Migration
  createBackupSnapshot: () => api.request('/api/backup/create-snapshot', { method: 'POST' }),
  listBackups: () => api.request('/api/backup/list'),
  clearTransactions: () => api.request('/api/backup/clear-transactions', { method: 'POST' }),
  importLegacySheets: (data) => api.request('/api/backup/legacy-migration', { method: 'POST', body: JSON.stringify(data) })
};
