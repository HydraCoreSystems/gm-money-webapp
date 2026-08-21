import { api } from './api.js';
import { auth } from './services/auth.js';
import { showTransactionModal, showAccountModal, showToast } from './modals.js';
import { renderHome } from './views/home.js';
import { renderRegister } from './views/register.js';
import { renderImporter } from './views/importer.js';
import { renderReview } from './views/review.js';
import { renderScheduled } from './views/scheduled.js';
import { renderReconciliation } from './views/reconciliation.js';
import { renderCategories } from './views/categories.js';
import { renderMerchantMemory } from './views/merchantMemory.js';
import { renderReports } from './views/reports.js';
import { renderAccounts } from './views/accounts.js';
import { renderSettings } from './views/settings.js';
import { renderHelp } from './views/help.js';

class App {
  constructor() {
    this.currentView = 'home';
    this.viewContainer = document.getElementById('view-content');
    this.viewTitle = document.getElementById('current-view-title');
    this.sidebarAccountsList = document.getElementById('sidebar-accounts-list');
    this.reviewBadge = document.getElementById('sidebar-review-badge');
    this.appEl = document.getElementById('app');
  }

  async init() {
    // Check authentication first
    const session = await auth.getSession();

    if (!session) {
      this.renderLoginScreen();
      return;
    }

    // Listen for auth state changes (logout from another tab, etc.)
    auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.renderLoginScreen();
      }
    });

    this.bindGlobalEvents();
    await this.refreshSidebarState();
    this.navigateTo('home');
  }

  renderLoginScreen() {
    if (this.appEl) {
      document.body.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-primary, #0d1117);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            background: var(--bg-surface, #161b22);
            border: 1px solid var(--border-subtle, #30363d);
            border-radius: 12px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
          ">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="font-size: 22px; font-weight: 700; color: var(--text-main, #e6edf3); margin: 0 0 4px 0;">
                Gathering Moss
              </h1>
              <span style="font-size: 13px; color: var(--text-muted, #8b949e);">Financial Center</span>
            </div>

            <div id="login-error" style="display: none; background: rgba(245,101,101,0.15); border: 1px solid rgba(245,101,101,0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #fca5a5;"></div>

            <form id="login-form" style="display: flex; flex-direction: column; gap: 16px;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-muted, #8b949e); margin-bottom: 6px;">
                  Email
                </label>
                <input
                  type="email"
                  id="login-email"
                  placeholder="owner@example.com"
                  style="
                    width: 100%;
                    padding: 10px 12px;
                    background: var(--bg-primary, #0d1117);
                    border: 1px solid var(--border-subtle, #30363d);
                    border-radius: 8px;
                    color: var(--text-main, #e6edf3);
                    font-size: 14px;
                    outline: none;
                    box-sizing: border-box;
                  "
                />
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-muted, #8b949e); margin-bottom: 6px;">
                  Password
                </label>
                <input
                  type="password"
                  id="login-password"
                  placeholder="Enter password"
                  style="
                    width: 100%;
                    padding: 10px 12px;
                    background: var(--bg-primary, #0d1117);
                    border: 1px solid var(--border-subtle, #30363d);
                    border-radius: 8px;
                    color: var(--text-main, #e6edf3);
                    font-size: 14px;
                    outline: none;
                    box-sizing: border-box;
                  "
                />
              </div>
              <button
                type="submit"
                style="
                  width: 100%;
                  padding: 11px;
                  background: var(--moss-primary, #238636);
                  border: none;
                  border-radius: 8px;
                  color: #fff;
                  font-size: 14px;
                  font-weight: 600;
                  cursor: pointer;
                  margin-top: 4px;
                "
              >
                Sign In
              </button>
            </form>

            <p style="text-align: center; margin-top: 20px; font-size: 11px; color: var(--text-dim, #484f58);">
              Owner-only access. Contact your administrator for credentials.
            </p>
          </div>
        </div>
      `;

      const form = document.getElementById('login-form');
      const errorDiv = document.getElementById('login-error');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
          errorDiv.textContent = 'Please enter both email and password.';
          errorDiv.style.display = 'block';
          return;
        }

        errorDiv.style.display = 'none';

        try {
          await auth.signIn(email, password);
          // Reload the page to initialize the full app
          window.location.reload();
        } catch (err) {
          errorDiv.textContent = err.message || 'Authentication failed. Please try again.';
          errorDiv.style.display = 'block';
        }
      });
    }
  }

  bindGlobalEvents() {
    // Nav menu buttons
    document.querySelectorAll('.sidebar-nav .nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) this.navigateTo(view);
      });
    });

    // Top App Bar Action Buttons
    document.getElementById('top-new-trans-btn')?.addEventListener('click', () => {
      showTransactionModal(null, null, () => {
        this.refreshSidebarState();
        this.reloadCurrentView();
      });
    });

    document.getElementById('top-import-btn')?.addEventListener('click', () => {
      this.navigateTo('importer');
    });

    document.getElementById('top-backup-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.createBackupSnapshot();
        showToast(`Backup snapshot created: ${res.filename}`);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Logout button in top bar
    document.getElementById('top-logout-btn')?.addEventListener('click', async () => {
      await auth.signOut();
      window.location.reload();
    });

    document.getElementById('sidebar-add-acc-btn')?.addEventListener('click', () => {
      showAccountModal(null, () => {
        this.refreshSidebarState();
        if (this.currentView === 'accounts') this.reloadCurrentView();
      });
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        showTransactionModal(null, null, () => {
          this.refreshSidebarState();
          this.reloadCurrentView();
        });
      }
    });
  }

  async refreshSidebarState() {
    try {
      const [accRes, transRes] = await Promise.all([
        api.getAccounts().catch(() => ({ accounts: [] })),
        api.getTransactions({ review_status: 'pending_review', limit: 1000 }).catch(() => ({ transactions: [] }))
      ]);

      const accounts = (accRes.accounts || []).filter(a => a.active);
      const pendingCount = (transRes.transactions || []).length;

      // Update accounts in sidebar
      if (this.sidebarAccountsList) {
        this.sidebarAccountsList.innerHTML = accounts.map(a => `
          <div class="sidebar-acc-item" data-id="${a.id}">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${a.name}</span>
            <span class="acc-bal">$${safeFloatDisplay(a.current_balance)}</span>
          </div>
        `).join('');

        function safeFloatDisplay(val) {
          const n = typeof val === 'number' ? val : parseFloat(val);
          return isNaN(n) ? '0.00' : n.toFixed(2);
        }

        this.sidebarAccountsList.querySelectorAll('.sidebar-acc-item').forEach(item => {
          item.addEventListener('click', () => {
            const accId = parseInt(item.dataset.id, 10);
            this.navigateTo('register', { accountId: accId });
          });
        });
      }

      // Update Review badge
      if (this.reviewBadge) {
        if (pendingCount > 0) {
          this.reviewBadge.textContent = pendingCount;
          this.reviewBadge.style.display = 'inline-block';
        } else {
          this.reviewBadge.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('Error updating sidebar:', err);
    }
  }

  async navigateTo(viewName, params = {}) {
    this.currentView = viewName;
    this.currentParams = params;

    // Update active nav button
    document.querySelectorAll('.sidebar-nav .nav-btn').forEach(btn => {
      if (btn.dataset.view === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const titles = {
      'home': 'Home Dashboard',
      'register': 'Account Register',
      'review': 'Review Queue',
      'importer': 'CSV Import',
      'scheduled': 'Scheduled Bills & Deposits',
      'categories': 'Categories & Subcategories',
      'merchant-memory': 'Merchant Memory',
      'reconciliation': 'Account Statement Reconciliation',
      'reports': 'Financial Reports & P&L',
      'accounts': 'Account Management',
      'settings': 'Backups & Settings',
      'help': 'Guide & Primer'
    };

    if (this.viewTitle) {
      this.viewTitle.textContent = titles[viewName] || 'Gathering Moss Financial Center';
    }

    await this.refreshSidebarState();

    const navigateWrapper = (v, p) => this.navigateTo(v, p);

    try {
      switch (viewName) {
        case 'home':
          await renderHome(this.viewContainer, navigateWrapper);
          break;
        case 'register':
          await renderRegister(this.viewContainer, params.accountId, navigateWrapper);
          break;
        case 'review':
          await renderReview(this.viewContainer, navigateWrapper);
          break;
        case 'importer':
          await renderImporter(this.viewContainer, navigateWrapper);
          break;
        case 'scheduled':
          await renderScheduled(this.viewContainer, navigateWrapper);
          break;
        case 'categories':
          await renderCategories(this.viewContainer, navigateWrapper);
          break;
        case 'merchant-memory':
          await renderMerchantMemory(this.viewContainer, navigateWrapper);
          break;
        case 'reconciliation':
          await renderReconciliation(this.viewContainer, params, navigateWrapper);
          break;
        case 'reports':
          await renderReports(this.viewContainer, navigateWrapper);
          break;
        case 'accounts':
          await renderAccounts(this.viewContainer, navigateWrapper);
          break;
        case 'settings':
          await renderSettings(this.viewContainer, navigateWrapper);
          break;
        case 'help':
          renderHelp(this.viewContainer);
          break;
        default:
          await renderHome(this.viewContainer, navigateWrapper);
      }
    } catch (err) {
      console.error(`Error rendering view "${viewName}":`, err);
      if (this.viewContainer) {
        this.viewContainer.innerHTML = `
          <div style="padding: 40px; text-align: center; color: var(--text-muted);">
            <h3>Error loading page</h3>
            <p>${err.message}</p>
            <button class="btn btn-primary" onclick="location.reload()">Reload App</button>
          </div>`;
      }
    }
  }

  reloadCurrentView() {
    this.navigateTo(this.currentView, this.currentParams);
  }
}

// Instantiate application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
