import { api } from '../api.js';
import { showAccountModal, showConfirmModal, showToast } from '../modals.js';

export async function renderAccounts(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading accounts...</span>
    </div>
  `;

  try {
    const res = await api.getAccounts();
    const accounts = res.accounts;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="font-size: 17px; font-weight: 700;">Account Management</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Manage your checking, savings, credit cards, and cash accounts.
          </div>
        </div>
        <button class="btn btn-primary" id="add-acc-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>New Account</span>
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        ${accounts.map(a => `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; ${!a.active ? 'opacity: 0.6;' : ''}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                  <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main);">${a.name}</h4>
                  <div style="font-size: 12px; color: var(--text-dim);">${a.institution || 'Local Account'} • <span style="text-transform: capitalize;">${a.type.replace('_', ' ')}</span></div>
                </div>
                <span class="badge ${a.active ? 'badge-income' : 'badge-gold'}">${a.active ? 'Active' : 'Archived'}</span>
              </div>

              <div style="margin: 16px 0;">
                <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Current Balance</div>
                <div class="text-mono" style="font-size: 22px; font-weight: 700; color: ${a.type === 'credit_card' && a.current_balance > 0 ? '#fca5a5' : 'var(--text-main)'};">
                  ${a.balance_established ? `$${a.current_balance.toFixed(2)}` : 'Not established'}
                </div>
                <div style="font-size: 11.5px; color: var(--text-dim); margin-top: 2px;">
                  Opening Balance: ${a.balance_established ? `$${a.opening_balance.toFixed(2)}` : 'Not established'}
                </div>
              </div>

              ${a.notes ? `
                <div style="font-size: 12px; color: var(--text-muted); background: var(--bg-surface-raised); padding: 6px 10px; border-radius: var(--radius-sm); margin-bottom: 14px;">
                  ${a.notes}
                </div>
              ` : ''}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
              <button class="btn btn-primary btn-sm goto-reg-btn" data-id="${a.id}">Open in Register</button>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-outline btn-sm edit-acc-btn" data-id="${a.id}">Edit</button>
                <button class="btn btn-outline btn-sm delete-acc-btn" data-id="${a.id}" style="color: var(--accent-red);">✕</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelector('#add-acc-btn')?.addEventListener('click', () => {
      showAccountModal(null, () => renderAccounts(container, navigateTo));
    });

    container.querySelectorAll('.goto-reg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        if (navigateTo) navigateTo('register', { accountId: id });
      });
    });

    container.querySelectorAll('.edit-acc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const acc = accounts.find(a => a.id === id);
        if (acc) {
          showAccountModal(acc, () => renderAccounts(container, navigateTo));
        }
      });
    });

    container.querySelectorAll('.delete-acc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const acc = accounts.find(a => a.id === id);
        if (acc) {
          showConfirmModal({
            title: 'Archive / Delete Account',
            message: `Are you sure you want to archive <strong>${acc.name}</strong>? Existing transactions will be preserved.`,
            confirmText: 'Confirm',
            danger: true,
            onConfirm: async () => {
              try {
                await api.deleteAccount(id);
                showToast('Account updated');
                renderAccounts(container, navigateTo);
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
        <h3>Error loading accounts</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
