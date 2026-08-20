import { api } from '../api.js';
import { showScheduledModal, showConfirmModal, showToast } from '../modals.js';

let projectionDays = 30;

export async function renderScheduled(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading scheduled bills & cash projection...</span>
    </div>
  `;

  try {
    const [schRes, projRes] = await Promise.all([
      api.getScheduled(),
      api.getProjection(projectionDays)
    ]);

    const scheduled = schRes.scheduled;
    const proj = projRes.projection;

    container.innerHTML = `
      <!-- Top Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h3 style="font-size: 17px; font-weight: 700;">Scheduled Bills & Deposits</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Manage recurring financial commitments and track projected cash flow.
          </div>
        </div>
        <button class="btn btn-primary" id="scheduled-add-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>New Scheduled Item</span>
        </button>
      </div>

      <!-- Cash Flow Projection Summary Cards -->
      <div class="stats-grid">
        <div class="stat-card moss">
          <span class="stat-label">Current Cash Balance</span>
          <span class="stat-value">$${proj.current_cash.toFixed(2)}</span>
          <span class="stat-subtext">Checking, Savings & Cash</span>
        </div>

        <div class="stat-card ${proj.projected_change >= 0 ? 'moss' : 'red'}">
          <span class="stat-label">Projected Net Change (${projectionDays} Days)</span>
          <span class="stat-value ${proj.projected_change >= 0 ? 'amount-pos' : 'amount-neg'}">
            ${proj.projected_change >= 0 ? '+' : ''}$${proj.projected_change.toFixed(2)}
          </span>
          <span class="stat-subtext">Upcoming bills vs recurring deposits</span>
        </div>

        <div class="stat-card gold">
          <span class="stat-label">Projected Balance (${projectionDays} Days)</span>
          <span class="stat-value">$${proj.projected_cash.toFixed(2)}</span>
          <span class="stat-subtext">Estimated cash position</span>
        </div>
      </div>

      <!-- Scheduled Rules Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px;">Recurring Schedules (${scheduled.length})</strong>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Payee / Description</th>
                <th style="width: 120px;">Frequency</th>
                <th style="width: 120px;">Next Due Date</th>
                <th>Account</th>
                <th>Category</th>
                <th class="text-right" style="width: 110px;">Amount</th>
                <th class="text-center" style="width: 110px;">Auto-Create</th>
                <th class="text-center" style="width: 140px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${scheduled.length > 0 ? scheduled.map(s => `
                <tr style="${!s.active ? 'opacity: 0.5;' : ''}">
                  <td>
                    <strong>${s.payee}</strong>
                    ${s.memo ? `<div style="font-size: 11.5px; color: var(--text-dim);">${s.memo}</div>` : ''}
                  </td>
                  <td>
                    <span class="badge badge-gold" style="text-transform: capitalize;">${s.frequency}</span>
                  </td>
                  <td class="text-mono" style="font-size: 12px; color: var(--accent-gold);">${s.next_due_date}</td>
                  <td style="font-size: 12px; color: var(--moss-light);">${s.account_name}</td>
                  <td>
                    <span class="badge ${s.transaction_type === 'income' ? 'badge-income' : 'badge-expense'}">
                      ${s.category_name ? `${s.category_name}${s.subcategory_name ? ' : ' + s.subcategory_name : ''}` : 'General'}
                    </span>
                  </td>
                  <td class="text-right text-mono ${s.transaction_type === 'expense' ? 'amount-neg' : 'amount-pos'}">
                    ${s.transaction_type === 'expense' ? '-' : '+'}$${s.amount.toFixed(2)}
                  </td>
                  <td class="text-center">
                    ${s.auto_create ? '<span class="badge badge-income">Yes</span>' : '<span style="color: var(--text-dim); font-size: 12px;">Manual</span>'}
                  </td>
                  <td class="text-center">
                    <button class="btn btn-primary btn-sm record-sch-btn" data-id="${s.id}" title="Record to Register Now">Post</button>
                    <button class="btn btn-outline btn-sm edit-sch-btn" data-id="${s.id}" title="Edit">✎</button>
                    <button class="btn btn-outline btn-sm delete-sch-btn" data-id="${s.id}" title="Delete" style="color: var(--accent-red);">✕</button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 36px;">
                    No scheduled bills or recurring deposits created yet. Click "+ New Scheduled Item" to set one up.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Projection Events Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px;">Projected Occurrences (Next ${projectionDays} Days)</strong>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm ${projectionDays === 30 ? 'active' : ''}" id="proj-30-btn">30 Days</button>
            <button class="btn btn-outline btn-sm ${projectionDays === 60 ? 'active' : ''}" id="proj-60-btn">60 Days</button>
            <button class="btn btn-outline btn-sm ${projectionDays === 90 ? 'active' : ''}" id="proj-90-btn">90 Days</button>
          </div>
        </div>
        <div class="table-container" style="max-height: 320px;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 110px;">Due Date</th>
                <th>Payee</th>
                <th>Account</th>
                <th>Category</th>
                <th class="text-right" style="width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${proj.events.length > 0 ? proj.events.map(e => `
                <tr>
                  <td class="text-mono" style="font-size: 12px; color: var(--accent-gold);">${e.date}</td>
                  <td><strong>${e.payee}</strong></td>
                  <td style="font-size: 12px; color: var(--moss-light);">${e.account_name}</td>
                  <td>
                    <span class="badge ${e.transaction_type === 'income' ? 'badge-income' : 'badge-expense'}">
                      ${e.category_name || 'General'}
                    </span>
                  </td>
                  <td class="text-right text-mono ${e.amount < 0 ? 'amount-neg' : 'amount-pos'}">
                    ${e.amount < 0 ? '-' : '+'}$${Math.abs(e.amount).toFixed(2)}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 24px;">No occurrences in this window.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelector('#scheduled-add-btn')?.addEventListener('click', () => {
      showScheduledModal(null, () => renderScheduled(container, navigateTo));
    });

    const setDays = (d) => {
      projectionDays = d;
      renderScheduled(container, navigateTo);
    };

    container.querySelector('#proj-30-btn')?.addEventListener('click', () => setDays(30));
    container.querySelector('#proj-60-btn')?.addEventListener('click', () => setDays(60));
    container.querySelector('#proj-90-btn')?.addEventListener('click', () => setDays(90));

    container.querySelectorAll('.record-sch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        try {
          await api.recordScheduled(id);
          showToast('Scheduled bill posted to register');
          renderScheduled(container, navigateTo);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.edit-sch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const item = scheduled.find(s => s.id === id);
        if (item) {
          showScheduledModal(item, () => renderScheduled(container, navigateTo));
        }
      });
    });

    container.querySelectorAll('.delete-sch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const item = scheduled.find(s => s.id === id);
        if (item) {
          showConfirmModal({
            title: 'Delete Scheduled Bill',
            message: `Are you sure you want to delete the scheduled recurring transaction for <strong>${item.payee}</strong>?`,
            confirmText: 'Delete Schedule',
            danger: true,
            onConfirm: async () => {
              try {
                await api.deleteScheduled(id);
                showToast('Scheduled bill deleted');
                renderScheduled(container, navigateTo);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        }
      });
    });

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading scheduled bills</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
