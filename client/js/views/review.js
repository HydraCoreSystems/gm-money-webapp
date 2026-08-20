import { api } from '../api.js';
import { showToast } from '../modals.js';

export async function renderReview(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading review queue...</span>
    </div>
  `;

  try {
    const [transRes, catRes] = await Promise.all([
      api.getTransactions({ review_status: 'pending_review', limit: 1000 }),
      api.getCategories()
    ]);

    const pendingTransactions = transRes.transactions;
    const categories = catRes.categories;

    if (pendingTransactions.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 60px 20px; max-width: 600px; margin: 40px auto;">
          <div style="width: 56px; height: 56px; background: rgba(72, 187, 120, 0.15); color: #48bb78; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Review Queue is Clear!</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 24px;">
            All imported transactions have been reviewed, categorized, and posted to your Register.
          </p>
          <div style="display: flex; justify-content: center; gap: 12px;">
            <button class="btn btn-primary" id="review-goto-register-btn">Open Register</button>
            <button class="btn btn-secondary" id="review-import-more-btn">Import Another CSV</button>
          </div>
        </div>
      `;

      container.querySelector('#review-goto-register-btn')?.addEventListener('click', () => navigateTo('register'));
      container.querySelector('#review-import-more-btn')?.addEventListener('click', () => navigateTo('importer'));
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Top Toolbar -->
        <div class="card" style="padding: 14px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 700;">Review Queue (${pendingTransactions.length} Pending)</h3>
              <div style="font-size: 12.5px; color: var(--text-muted);">
                Verify category assignments. Approving transactions teaches Merchant Memory for future imports.
              </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button class="btn btn-outline btn-sm" id="review-reprocess-rules-btn">Re-run Merchant Rules</button>
              <button class="btn btn-primary" id="review-approve-selected-btn">Approve Selected (<span id="selected-count-span">${pendingTransactions.length}</span>)</button>
            </div>
          </div>
        </div>

        <!-- Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-container" style="max-height: 600px;">
            <table class="data-table" id="review-table">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center;">
                    <input type="checkbox" id="review-select-all" checked>
                  </th>
                  <th style="width: 100px;">Date</th>
                  <th style="width: 130px;">Account</th>
                  <th>Raw Description / Clean Payee</th>
                  <th class="text-right" style="width: 110px;">Amount</th>
                  <th style="width: 200px;">Category</th>
                  <th style="width: 180px;">Subcategory</th>
                  <th class="text-center" style="width: 80px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${pendingTransactions.map(t => `
                  <tr data-id="${t.id}">
                    <td style="text-align: center;">
                      <input type="checkbox" class="review-row-cb" data-id="${t.id}" checked>
                    </td>
                    <td class="text-mono" style="font-size: 12px; color: var(--text-muted);">${t.date}</td>
                    <td style="font-size: 12px; color: var(--moss-light);">${t.account_name}</td>
                    <td>
                      <input type="text" class="input review-payee-input" data-id="${t.id}" value="${t.payee}" style="font-weight: 600; padding: 4px 8px; width: 100%;">
                      <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">Raw: ${t.original_description}</div>
                    </td>
                    <td class="text-right text-mono ${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">
                      ${t.amount < 0 ? '-' : '+'}$${Math.abs(t.amount).toFixed(2)}
                    </td>
                    <td>
                      <select class="select review-cat-select" data-id="${t.id}" style="width: 100%; padding: 4px 8px;">
                        <option value="">(Select Category)</option>
                        ${categories.map(c => `<option value="${c.id}" ${t.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <select class="select review-sub-select" data-id="${t.id}" style="width: 100%; padding: 4px 8px;">
                        <option value="">(None)</option>
                      </select>
                    </td>
                    <td class="text-center">
                      <button class="btn btn-primary btn-sm single-approve-btn" data-id="${t.id}">Approve</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Populate subcategories for each row
    const rows = container.querySelectorAll('#review-table tbody tr');
    rows.forEach(row => {
      const transId = parseInt(row.dataset.id, 10);
      const trans = pendingTransactions.find(t => t.id === transId);
      const catSelect = row.querySelector('.review-cat-select');
      const subSelect = row.querySelector('.review-sub-select');

      const updateSubs = (catId, preselectSubId = null) => {
        subSelect.innerHTML = '<option value="">(None)</option>';
        if (!catId) return;
        const cat = categories.find(c => c.id == catId);
        if (cat && cat.subcategories) {
          cat.subcategories.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (preselectSubId && s.id == preselectSubId) opt.selected = true;
            subSelect.appendChild(opt);
          });
        }
      };

      catSelect.addEventListener('change', () => updateSubs(catSelect.value));

      if (trans && trans.category_id) {
        updateSubs(trans.category_id, trans.subcategory_id);
      }
    });

    // Selection management
    const selectAllCb = container.querySelector('#review-select-all');
    const rowCbs = container.querySelectorAll('.review-row-cb');
    const selectedCountSpan = container.querySelector('#selected-count-span');

    const updateSelectedCount = () => {
      const checked = container.querySelectorAll('.review-row-cb:checked').length;
      selectedCountSpan.textContent = checked;
    };

    selectAllCb.addEventListener('change', (e) => {
      rowCbs.forEach(cb => { cb.checked = e.target.checked; });
      updateSelectedCount();
    });

    rowCbs.forEach(cb => cb.addEventListener('change', updateSelectedCount));

    // Single Approve Action
    container.querySelectorAll('.single-approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const row = container.querySelector(`tr[data-id="${id}"]`);
        const payee = row.querySelector('.review-payee-input').value;
        const catId = row.querySelector('.review-cat-select').value ? parseInt(row.querySelector('.review-cat-select').value, 10) : null;
        const subId = row.querySelector('.review-sub-select').value ? parseInt(row.querySelector('.review-sub-select').value, 10) : null;

        try {
          await api.batchApprove([{ id, payee, category_id: catId, subcategory_id: subId }], true);
          showToast('Transaction approved');
          renderReview(container, navigateTo);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Batch Approve Selected
    container.querySelector('#review-approve-selected-btn')?.addEventListener('click', async () => {
      const selectedRows = container.querySelectorAll('.review-row-cb:checked');
      if (selectedRows.length === 0) {
        showToast('No transactions selected', 'warning');
        return;
      }

      const items = [];
      selectedRows.forEach(cb => {
        const id = parseInt(cb.dataset.id, 10);
        const row = container.querySelector(`tr[data-id="${id}"]`);
        const payee = row.querySelector('.review-payee-input').value;
        const catId = row.querySelector('.review-cat-select').value ? parseInt(row.querySelector('.review-cat-select').value, 10) : null;
        const subId = row.querySelector('.review-sub-select').value ? parseInt(row.querySelector('.review-sub-select').value, 10) : null;
        items.push({ id, payee, category_id: catId, subcategory_id: subId });
      });

      try {
        await api.batchApprove(items, true);
        showToast(`Approved ${items.length} transactions`);
        renderReview(container, navigateTo);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Re-run Merchant Rules
    container.querySelector('#review-reprocess-rules-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.reprocessMerchantMemory();
        showToast(`Re-classified ${res.updated_count} transactions based on current merchant memory`);
        renderReview(container, navigateTo);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading review queue</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
