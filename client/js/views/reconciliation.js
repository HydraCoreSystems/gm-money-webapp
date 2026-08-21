import { api } from '../api.js';
import { showToast, showConfirmModal } from '../modals.js';

let activeSession = null;

export async function renderReconciliation(container, initialParams = {}, navigateTo = null) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading account reconciliation...</span>
    </div>
  `;

  try {
    const accRes = await api.getAccounts();
    const accounts = accRes.accounts.filter(a => a.active);
    const defaultAccountId = initialParams.accountId || (accounts[0]?.id || '');

    const renderSetupForm = () => {
      container.innerHTML = `
        <div style="max-width: 650px; margin: 20px auto;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span>Reconcile Bank / Credit Card Statement</span>
              </div>
            </div>

            <form id="reconcile-setup-form" style="display: flex; flex-direction: column; gap: 16px;">
              <p style="font-size: 13.5px; color: var(--text-muted);">
                Match your Gathering Moss transactions against your official monthly bank or credit card statement to guarantee 100% accounting accuracy.
              </p>

              <!-- Account -->
              <div class="form-group">
                <label class="form-label" for="rec-acc">Select Account to Reconcile</label>
                <select class="select" id="rec-acc" required>
                  ${accounts.map(a => `<option value="${a.id}" ${a.id == defaultAccountId ? 'selected' : ''}>${a.name} (${a.balance_established ? `$${a.current_balance.toFixed(2)}` : 'Not established'})</option>`).join('')}
                </select>
              </div>

              <div class="form-grid">
                <!-- Statement Ending Date -->
                <div class="form-group">
                  <label class="form-label" for="rec-date">Statement Ending Date</label>
                  <input type="date" class="input" id="rec-date" value="${new Date().toISOString().slice(0, 10)}" required>
                </div>

                <!-- Statement Ending Balance -->
                <div class="form-group">
                  <label class="form-label" for="rec-balance">Statement Ending Balance ($)</label>
                  <input type="number" step="0.01" class="input text-mono" id="rec-balance" placeholder="e.g. 2489.50" required>
                  <span class="form-hint">From your paper or PDF statement</span>
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                <button type="submit" class="btn btn-primary">Start Reconciliation</button>
              </div>
            </form>
          </div>
        </div>
      `;

      container.querySelector('#reconcile-setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const accountId = parseInt(container.querySelector('#rec-acc').value, 10);
        const statementDate = container.querySelector('#rec-date').value;
        const statementBalance = parseFloat(container.querySelector('#rec-balance').value);

        try {
          const res = await api.startReconciliation({
            account_id: accountId,
            statement_date: statementDate,
            statement_balance: statementBalance
          });

          activeSession = res.data;
          renderWorkspaceScreen();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    const renderWorkspaceScreen = () => {
      const s = activeSession;
      const selectedIds = new Set();

      // Pre-check any transactions that were already marked 'cleared'
      s.payments.forEach(p => { if (p.cleared_status === 'cleared') selectedIds.add(p.id); });
      s.deposits.forEach(d => { if (d.cleared_status === 'cleared') selectedIds.add(d.id); });

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Top Balancing Ribbon -->
          <div class="card" style="padding: 16px 20px; background-color: var(--bg-surface-raised); border-color: var(--border-medium);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
              <div>
                <h3 style="font-size: 16px; font-weight: 700;">Reconciling: ${s.account.name}</h3>
                <div style="font-size: 12.5px; color: var(--text-muted);">
                  Statement Date: <strong>${s.statement_date}</strong> | Statement Balance: <strong class="text-mono">$${s.statement_balance.toFixed(2)}</strong>
                </div>
              </div>

              <!-- Live Balance Calculator -->
              <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap;">
                <div>
                  <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Cleared Balance</div>
                  <div class="text-mono" id="rec-cleared-bal-disp" style="font-size: 17px; font-weight: 700; color: var(--text-main);">$0.00</div>
                </div>

                <div>
                  <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Difference</div>
                  <div class="text-mono" id="rec-diff-disp" style="font-size: 18px; font-weight: 800; color: var(--accent-red);">$0.00</div>
                </div>

                <div style="display: flex; gap: 10px;">
                  <button class="btn btn-outline" id="rec-cancel-btn">Cancel</button>
                  <button class="btn btn-primary" id="rec-finish-btn" disabled>Finish Reconciliation</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Split Two-Column Ledger: Payments vs Deposits -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <!-- Payments & Debits Column -->
            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 12px 18px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13.5px; color: #fca5a5;">Payments & Debits (${s.payments.length})</strong>
                <button class="btn btn-outline btn-sm" id="rec-select-all-payments">Toggle All</button>
              </div>
              <div class="table-container" style="max-height: 480px;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="width: 36px; text-align: center;">Clr</th>
                      <th style="width: 90px;">Date</th>
                      <th>Payee</th>
                      <th class="text-right" style="width: 100px;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${s.payments.length > 0 ? s.payments.map(p => `
                      <tr class="rec-row" data-id="${p.id}" data-amount="${p.amount}">
                        <td style="text-align: center;">
                          <input type="checkbox" class="rec-cb" data-id="${p.id}" ${selectedIds.has(p.id) ? 'checked' : ''}>
                        </td>
                        <td class="text-mono" style="font-size: 11.5px; color: var(--text-muted);">${p.date}</td>
                        <td><strong>${p.payee}</strong></td>
                        <td class="text-right text-mono amount-neg">$${Math.abs(p.amount).toFixed(2)}</td>
                      </tr>
                    `).join('') : `
                      <tr>
                        <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">No uncleared payments found.</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Deposits & Credits Column -->
            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 12px 18px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13.5px; color: #86efac;">Deposits & Credits (${s.deposits.length})</strong>
                <button class="btn btn-outline btn-sm" id="rec-select-all-deposits">Toggle All</button>
              </div>
              <div class="table-container" style="max-height: 480px;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="width: 36px; text-align: center;">Clr</th>
                      <th style="width: 90px;">Date</th>
                      <th>Payee</th>
                      <th class="text-right" style="width: 100px;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${s.deposits.length > 0 ? s.deposits.map(d => `
                      <tr class="rec-row" data-id="${d.id}" data-amount="${d.amount}">
                        <td style="text-align: center;">
                          <input type="checkbox" class="rec-cb" data-id="${d.id}" ${selectedIds.has(d.id) ? 'checked' : ''}>
                        </td>
                        <td class="text-mono" style="font-size: 11.5px; color: var(--text-muted);">${d.date}</td>
                        <td><strong>${d.payee}</strong></td>
                        <td class="text-right text-mono amount-pos">+$${Math.abs(d.amount).toFixed(2)}</td>
                      </tr>
                    `).join('') : `
                      <tr>
                        <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">No uncleared deposits found.</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;

      const clearedBalDisp = container.querySelector('#rec-cleared-bal-disp');
      const diffDisp = container.querySelector('#rec-diff-disp');
      const finishBtn = container.querySelector('#rec-finish-btn');

      const recalculate = () => {
        let clearedSum = 0;
        const allEligible = [...s.payments, ...s.deposits];

        selectedIds.forEach(id => {
          const item = allEligible.find(t => t.id === id);
          if (item) clearedSum += item.amount;
        });

        const currentClearedBal = Number((s.starting_reconciled_balance + clearedSum).toFixed(2));
        const diff = Number((s.statement_balance - currentClearedBal).toFixed(2));

        clearedBalDisp.textContent = `$${currentClearedBal.toFixed(2)}`;
        diffDisp.textContent = `${diff >= 0 ? '' : '-'}$${Math.abs(diff).toFixed(2)}`;

        if (Math.abs(diff) < 0.001) {
          diffDisp.style.color = '#86efac';
          diffDisp.textContent = '$0.00 (Balanced!)';
          finishBtn.disabled = false;
          finishBtn.classList.remove('btn-secondary');
          finishBtn.classList.add('btn-primary');
        } else {
          diffDisp.style.color = '#fca5a5';
          finishBtn.disabled = true;
        }
      };

      // Checkbox event binding
      container.querySelectorAll('.rec-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = parseInt(cb.dataset.id, 10);
          if (cb.checked) {
            selectedIds.add(id);
          } else {
            selectedIds.delete(id);
          }
          recalculate();
        });
      });

      // Toggle all payments
      container.querySelector('#rec-select-all-payments')?.addEventListener('click', () => {
        const allPaymentsChecked = s.payments.every(p => selectedIds.has(p.id));
        s.payments.forEach(p => {
          if (allPaymentsChecked) selectedIds.delete(p.id);
          else selectedIds.add(p.id);
        });
        container.querySelectorAll('.rec-cb').forEach(cb => {
          const id = parseInt(cb.dataset.id, 10);
          if (s.payments.some(p => p.id === id)) cb.checked = !allPaymentsChecked;
        });
        recalculate();
      });

      // Toggle all deposits
      container.querySelector('#rec-select-all-deposits')?.addEventListener('click', () => {
        const allDepositsChecked = s.deposits.every(d => selectedIds.has(d.id));
        s.deposits.forEach(d => {
          if (allDepositsChecked) selectedIds.delete(d.id);
          else selectedIds.add(d.id);
        });
        container.querySelectorAll('.rec-cb').forEach(cb => {
          const id = parseInt(cb.dataset.id, 10);
          if (s.deposits.some(d => d.id === id)) cb.checked = !allDepositsChecked;
        });
        recalculate();
      });

      // Cancel button
      container.querySelector('#rec-cancel-btn')?.addEventListener('click', renderSetupForm);

      // Finish Reconciliation
      finishBtn.addEventListener('click', async () => {
        try {
          await api.commitReconciliation({
            account_id: s.account.id,
            statement_date: s.statement_date,
            statement_balance: s.statement_balance,
            cleared_transaction_ids: Array.from(selectedIds)
          });

          showToast(`Reconciliation complete! ${selectedIds.size} transactions marked as reconciled.`);
          if (navigateTo) navigateTo('register', { accountId: s.account.id });
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      recalculate();
    };

    renderSetupForm();

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading reconciliation</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
