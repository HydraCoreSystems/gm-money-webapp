import { api } from '../api.js';
import { showTransactionModal, showConfirmModal, showToast } from '../modals.js';

let currentAccountId = '';
let currentSearch = '';
let currentClearedStatus = 'all';
let selectedTransactionIds = new Set();
let expandedSplitIds = new Set();

export async function renderRegister(container, initialAccountId = null, navigateTo = null) {
  if (initialAccountId) currentAccountId = initialAccountId;

  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading transaction register...</span>
    </div>
  `;

  try {
    const [accRes, catRes] = await Promise.all([
      api.getAccounts(),
      api.getCategories()
    ]);

    const accounts = accRes.accounts;
    const categories = catRes.categories;

    if (!currentAccountId && accounts.length > 0) {
      currentAccountId = accounts[0].id;
    }

    const loadRegisterTable = async () => {
      const selectedAcc = accounts.find(a => a.id == currentAccountId);

      const transRes = await api.getTransactions({
        account_id: currentAccountId || undefined,
        search: currentSearch || undefined,
        cleared_status: currentClearedStatus !== 'all' ? currentClearedStatus : undefined,
        review_status: 'approved'
      });

      const transactions = transRes.transactions;

      container.innerHTML = `
        <!-- Register Top Banner & Filter Controls -->
        <div class="register-wrapper">
          <div class="register-toolbar">
            <div class="toolbar-left">
              <!-- Account Selector -->
              <select class="select" id="register-account-select" style="font-weight: 700; font-size: 14px; min-width: 260px;">
                <option value="" ${!currentAccountId ? 'selected' : ''}>All Accounts Combined</option>
                ${accounts.map(a => `
                  <option value="${a.id}" ${a.id == currentAccountId ? 'selected' : ''}>
                    ${a.name} (${a.balance_established ? `$${a.current_balance.toFixed(2)}` : 'Not established'})
                  </option>
                `).join('')}
              </select>

              <!-- Search Box -->
              <input type="text" class="input input-search" id="register-search-input" placeholder="Search payee, memo, amount..." value="${currentSearch}">

              <!-- Cleared Filter -->
              <select class="select" id="register-cleared-filter">
                <option value="all" ${currentClearedStatus === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="uncleared" ${currentClearedStatus === 'uncleared' ? 'selected' : ''}>Uncleared Only</option>
                <option value="cleared" ${currentClearedStatus === 'cleared' ? 'selected' : ''}>Cleared Only</option>
                <option value="reconciled" ${currentClearedStatus === 'reconciled' ? 'selected' : ''}>Reconciled Only</option>
              </select>
            </div>

            <div class="toolbar-right">
              <button class="btn btn-primary" id="register-add-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Add Transaction</span>
              </button>
              ${currentAccountId ? `
                <button class="btn btn-outline btn-sm" id="register-reconcile-btn">Reconcile</button>
              ` : ''}
              <button class="btn btn-outline btn-sm" id="register-export-csv-btn">Export CSV</button>
            </div>
          </div>

          <!-- Account Running Summary Header -->
          ${selectedAcc ? `
            <div style="background-color: var(--bg-surface-raised); padding: 10px 18px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 24px; font-size: 13px; align-items: center;">
              <div>
                <span style="color: var(--text-dim); font-size: 11px; text-transform: uppercase;">Current Balance: </span>
                <strong class="text-mono" style="color: var(--text-main); font-size: 14px;">${selectedAcc.balance_established ? `$${selectedAcc.current_balance.toFixed(2)}` : 'Not established'}</strong>
              </div>
              <div>
                <span style="color: var(--text-dim); font-size: 11px; text-transform: uppercase;">Opening Balance: </span>
                <span class="text-mono" style="color: var(--text-muted);">${selectedAcc.balance_established ? `$${selectedAcc.opening_balance.toFixed(2)}` : 'Not established'}</span>
              </div>
              <div style="margin-left: auto; color: var(--text-dim); font-size: 12px;">
                Showing ${transactions.length} transactions
              </div>
            </div>
          ` : ''}

          <!-- Floating Sticky Batch Action Bar (shown when 1+ rows checked) -->
          <div id="batch-action-bar" style="background: var(--bg-surface-hover); border-bottom: 1px solid var(--border-medium); padding: 8px 18px; display: none; align-items: center; justify-content: space-between; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <strong style="color: var(--moss-light); font-size: 13.5px;"><span id="batch-selected-count">0</span> Transactions Selected</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <select class="select" id="batch-category-select" style="padding: 4px 8px; font-size: 12px;">
                <option value="">Bulk Assign Category...</option>
                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
              <button class="btn btn-outline btn-sm" id="batch-mark-cleared-btn">Mark Cleared (C)</button>
              <button class="btn btn-outline btn-sm" id="batch-mark-uncleared-btn">Mark Uncleared (·)</button>
              <button class="btn btn-danger btn-sm" id="batch-delete-btn">Delete Selected</button>
              <button class="btn btn-outline btn-sm" id="batch-deselect-all-btn">Deselect All</button>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center;">
                    <input type="checkbox" id="reg-select-all-cb">
                  </th>
                  <th style="width: 95px;">Date</th>
                  ${!currentAccountId ? '<th style="width: 130px;">Account</th>' : ''}
                  <th>Payee / Description</th>
                  <th style="width: 170px;">Category</th>
                  <th>Memo</th>
                  <th class="text-right" style="width: 100px;">Payment</th>
                  <th class="text-right" style="width: 100px;">Deposit</th>
                  <th class="text-center" style="width: 45px;" title="Cleared / Reconciled">Clr</th>
                  ${currentAccountId ? '<th class="text-right" style="width: 110px;">Balance</th>' : ''}
                  <th class="text-center" style="width: 90px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.length > 0 ? transactions.map(t => {
                  const isExpense = t.amount < 0;
                  const absVal = Math.abs(t.amount).toFixed(2);
                  const clrClass = t.cleared_status === 'reconciled' ? 'cleared-R' : t.cleared_status === 'cleared' ? 'cleared-C' : 'cleared-U';
                  const clrLetter = t.cleared_status === 'reconciled' ? 'R' : t.cleared_status === 'cleared' ? 'C' : '·';
                  const isChecked = selectedTransactionIds.has(t.id);
                  const hasSplits = t.has_splits;
                  const isSplitExpanded = expandedSplitIds.has(t.id);
                  const hasAtts = t.has_attachments;

                  return `
                    <tr data-id="${t.id}" style="${isChecked ? 'background-color: var(--bg-surface-hover);' : ''}">
                      <td style="text-align: center;">
                        <input type="checkbox" class="reg-row-cb" data-id="${t.id}" ${isChecked ? 'checked' : ''}>
                      </td>
                      <td class="text-mono" style="font-size: 12px; color: var(--text-muted);">${t.date}</td>
                      ${!currentAccountId ? `<td style="font-size: 12px; color: var(--moss-light);">${t.account_name}</td>` : ''}
                      <td>
                        <strong>${t.payee}</strong>
                        ${t.reference_num ? `<span style="font-size: 11px; color: var(--text-dim); margin-left: 6px;">#${t.reference_num}</span>` : ''}
                        ${hasAtts ? `
                          <button type="button" class="btn-att-preview" data-id="${t.id}" title="${t.attachments.length} attached receipt(s)" style="background: none; border: none; cursor: pointer; margin-left: 6px; font-size: 13px;">
                            📎
                          </button>
                        ` : ''}
                      </td>
                      <td>
                        ${hasSplits ? `
                          <span class="badge badge-gold toggle-split-expand-btn" data-id="${t.id}" style="cursor: pointer;" title="Click to expand split categories">
                            [Split (${t.splits.length})] ${isSplitExpanded ? '▲' : '▼'}
                          </span>
                        ` : `
                          <span class="badge ${t.transaction_type === 'income' ? 'badge-income' : t.transaction_type === 'transfer' ? 'badge-transfer' : 'badge-expense'}">
                            ${t.category_name ? `${t.category_name}${t.subcategory_name ? ' : ' + t.subcategory_name : ''}` : (t.transaction_type === 'transfer' ? (t.transfer_account_name ? 'Transfer to ' + t.transfer_account_name : 'Transfer') : 'Uncategorized')}
                          </span>
                        `}
                      </td>
                      <td style="color: var(--text-muted); font-size: 12px;">${t.memo || ''}</td>
                      <td class="text-right text-mono amount-neg">
                        ${isExpense ? `$${absVal}` : ''}
                      </td>
                      <td class="text-right text-mono amount-pos">
                        ${!isExpense ? `$${absVal}` : ''}
                      </td>
                      <td class="text-center">
                        <span class="badge-cleared ${clrClass} toggle-cleared-btn" data-id="${t.id}" title="Status: ${t.cleared_status} (Click to toggle)">
                          ${clrLetter}
                        </span>
                      </td>
                      ${currentAccountId ? `
                        <td class="text-right text-mono" style="font-weight: 600; color: ${t.running_balance < 0 ? 'var(--accent-red)' : 'var(--text-main)'};">
                          ${t.running_balance !== null ? `$${t.running_balance.toFixed(2)}` : '—'}
                        </td>
                      ` : ''}
                      <td class="text-center">
                        <button class="btn btn-outline btn-sm edit-trans-btn" data-id="${t.id}" title="Edit">✎</button>
                        <button class="btn btn-outline btn-sm delete-trans-btn" data-id="${t.id}" title="Delete" style="color: var(--accent-red);">✕</button>
                      </td>
                    </tr>

                    <!-- Split breakdown expanded row -->
                    ${hasSplits && isSplitExpanded ? `
                      <tr class="split-breakdown-row" style="background: rgba(0,0,0,0.2);">
                        <td></td>
                        <td colspan="${currentAccountId ? 8 : 8}" style="padding: 6px 14px 10px;">
                          <div style="font-size: 11.5px; font-weight: 700; color: var(--moss-light); margin-bottom: 4px;">Split Allocations:</div>
                          <div style="display: flex; flex-direction: column; gap: 4px;">
                            ${t.splits.map(s => `
                              <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); background: var(--bg-surface); padding: 4px 10px; border-radius: var(--radius-sm);">
                                <span>↳ <strong>${s.category_name || 'General'}${s.subcategory_name ? ' : ' + s.subcategory_name : ''}</strong> ${s.memo ? `(${s.memo})` : ''}</span>
                                <span class="text-mono" style="color: #fca5a5;">$${Math.abs(s.amount).toFixed(2)}</span>
                              </div>
                            `).join('')}
                          </div>
                        </td>
                      </tr>
                    ` : ''}
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="${currentAccountId ? 10 : 10}" style="text-align: center; color: var(--text-dim); padding: 36px;">
                      No transactions found for this selection. Click "+ Add Transaction" or "Import CSV" to begin.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Batch Bar Updater
      const batchBar = container.querySelector('#batch-action-bar');
      const batchCount = container.querySelector('#batch-selected-count');
      const selectAllCb = container.querySelector('#reg-select-all-cb');

      const updateBatchBar = () => {
        const count = selectedTransactionIds.size;
        if (count > 0) {
          batchBar.style.display = 'flex';
          batchCount.textContent = count;
        } else {
          batchBar.style.display = 'none';
        }
      };

      // Row Selection events
      container.querySelectorAll('.reg-row-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = parseInt(cb.dataset.id, 10);
          if (cb.checked) selectedTransactionIds.add(id);
          else selectedTransactionIds.delete(id);
          updateBatchBar();
        });
      });

      selectAllCb.addEventListener('change', (e) => {
        if (e.target.checked) {
          transactions.forEach(t => selectedTransactionIds.add(t.id));
        } else {
          selectedTransactionIds.clear();
        }
        container.querySelectorAll('.reg-row-cb').forEach(cb => { cb.checked = e.target.checked; });
        updateBatchBar();
      });

      container.querySelector('#batch-deselect-all-btn')?.addEventListener('click', () => {
        selectedTransactionIds.clear();
        selectAllCb.checked = false;
        container.querySelectorAll('.reg-row-cb').forEach(cb => { cb.checked = false; });
        updateBatchBar();
      });

      // Batch Assign Category
      container.querySelector('#batch-category-select')?.addEventListener('change', async (e) => {
        const catId = parseInt(e.target.value, 10);
        if (!catId || selectedTransactionIds.size === 0) return;

        try {
          await api.batchUpdateTransactions({
            action: 'set_category',
            transaction_ids: Array.from(selectedTransactionIds),
            category_id: catId
          });
          showToast(`Assigned category to ${selectedTransactionIds.size} transactions`);
          selectedTransactionIds.clear();
          loadRegisterTable();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      // Batch Mark Cleared
      container.querySelector('#batch-mark-cleared-btn')?.addEventListener('click', async () => {
        if (selectedTransactionIds.size === 0) return;
        try {
          await api.batchUpdateTransactions({
            action: 'set_cleared',
            transaction_ids: Array.from(selectedTransactionIds),
            cleared_status: 'cleared'
          });
          showToast(`Marked ${selectedTransactionIds.size} transactions as Cleared`);
          selectedTransactionIds.clear();
          loadRegisterTable();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      // Batch Mark Uncleared
      container.querySelector('#batch-mark-uncleared-btn')?.addEventListener('click', async () => {
        if (selectedTransactionIds.size === 0) return;
        try {
          await api.batchUpdateTransactions({
            action: 'set_cleared',
            transaction_ids: Array.from(selectedTransactionIds),
            cleared_status: 'uncleared'
          });
          showToast(`Marked ${selectedTransactionIds.size} transactions as Uncleared`);
          selectedTransactionIds.clear();
          loadRegisterTable();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      // Batch Delete
      container.querySelector('#batch-delete-btn')?.addEventListener('click', () => {
        if (selectedTransactionIds.size === 0) return;
        showConfirmModal({
          title: 'Bulk Delete Transactions',
          message: `Are you sure you want to permanently delete <strong>${selectedTransactionIds.size}</strong> selected transactions?`,
          confirmText: `Delete ${selectedTransactionIds.size} Transactions`,
          danger: true,
          onConfirm: async () => {
            try {
              await api.batchUpdateTransactions({
                action: 'delete',
                transaction_ids: Array.from(selectedTransactionIds)
              });
              showToast(`Deleted ${selectedTransactionIds.size} transactions`);
              selectedTransactionIds.clear();
              loadRegisterTable();
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });

      // Expand / Collapse split breakdown
      container.querySelectorAll('.toggle-split-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          if (expandedSplitIds.has(id)) expandedSplitIds.delete(id);
          else expandedSplitIds.add(id);
          loadRegisterTable();
        });
      });

      // Attachment Preview
      container.querySelectorAll('.btn-att-preview').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          const trans = transactions.find(t => t.id === id);
          if (trans && trans.attachments && trans.attachments.length > 0) {
            window.open(`/api/attachments/${trans.attachments[0].id}/view`, '_blank');
          }
        });
      });

      // Filters & Add
      container.querySelector('#register-account-select')?.addEventListener('change', (e) => {
        currentAccountId = e.target.value;
        loadRegisterTable();
      });

      container.querySelector('#register-cleared-filter')?.addEventListener('change', (e) => {
        currentClearedStatus = e.target.value;
        loadRegisterTable();
      });

      let searchTimeout = null;
      container.querySelector('#register-search-input')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          currentSearch = e.target.value.trim();
          loadRegisterTable();
        }, 300);
      });

      container.querySelector('#register-add-btn')?.addEventListener('click', () => {
        showTransactionModal(null, currentAccountId, loadRegisterTable);
      });

      container.querySelector('#register-reconcile-btn')?.addEventListener('click', () => {
        if (navigateTo) navigateTo('reconciliation', { accountId: currentAccountId });
      });

      container.querySelector('#register-export-csv-btn')?.addEventListener('click', () => {
        window.open(`/api/backup/export-csv${currentAccountId ? '?account_id=' + currentAccountId : ''}`, '_blank');
      });

      // Single row actions
      container.querySelectorAll('.toggle-cleared-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          try {
            await api.toggleCleared(id);
            loadRegisterTable();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

      container.querySelectorAll('.edit-trans-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          const trans = transactions.find(t => t.id === id);
          if (trans) showTransactionModal(trans, currentAccountId, loadRegisterTable);
        });
      });

      container.querySelectorAll('.delete-trans-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.id, 10);
          const trans = transactions.find(t => t.id === id);
          if (trans) {
            showConfirmModal({
              title: 'Delete Transaction',
              message: `Are you sure you want to delete the transaction with <strong>${trans.payee}</strong> for <strong>$${Math.abs(trans.amount).toFixed(2)}</strong>?`,
              confirmText: 'Delete Transaction',
              danger: true,
              onConfirm: async () => {
                try {
                  await api.deleteTransaction(id);
                  showToast('Transaction deleted');
                  loadRegisterTable();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }
            });
          }
        });
      });

      updateBatchBar();
    };

    await loadRegisterTable();

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading register</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
