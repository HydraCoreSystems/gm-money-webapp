import { api } from '../api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../modals.js';

export async function renderSettings(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading system settings and account profile...</span>
    </div>
  `;

  try {
    const [backupRes, currentUser] = await Promise.all([
      api.listBackups().catch(() => ({ backups: [] })),
      auth.getUser().catch(() => null)
    ]);
    const backups = backupRes.backups || [];

    const userEmail = currentUser?.email || 'Logged In User';
    const userFullName = currentUser?.user_metadata?.full_name || (
      userEmail.toLowerCase().includes('crystal') || userEmail.toLowerCase().includes('clachleman') 
        ? 'Crystal Achleman' 
        : (userEmail.toLowerCase().includes('phil') ? 'Philip Achleman' : 'Co-Owner')
    );

    const initials = userFullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'GM';

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 24px; max-width: 920px; margin: 0 auto;">
        
        <!-- 0. Account & Password Settings Card -->
        <div class="card" style="border-top: 4px solid var(--accent-gold);">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Owner Account & Password Settings</span>
            </div>
            <span class="badge" style="background: rgba(35, 134, 54, 0.2); color: #3fb950; border: 1px solid #3fb950; font-size: 11px; padding: 4px 8px; border-radius: 4px;">Verified Co-Owner</span>
          </div>

          <!-- Current User Info Banner -->
          <div style="background: var(--bg-surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-gold), #b8860b); color: #000; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--text-main);">${userFullName}</div>
                <div style="font-size: 13px; color: var(--text-muted);">${userEmail}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" id="settings-logout-btn" style="color: var(--text-muted);">Sign Out</button>
          </div>

          <!-- Two Column Settings Form -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            
            <!-- Change Password Box -->
            <div style="background: var(--bg-surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; gap: 14px;">
              <div>
                <strong style="font-size: 14px; color: var(--text-main);">Change Your Password</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  Set a new private password for your account.
                </p>
              </div>
              
              <form id="settings-password-form" style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="settings-new-password"
                    placeholder="At least 6 characters"
                    required
                    style="width: 100%; padding: 9px 12px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-main); font-size: 13.5px; box-sizing: border-box;"
                  />
                </div>

                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="settings-confirm-password"
                    placeholder="Re-enter new password"
                    required
                    style="width: 100%; padding: 9px 12px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-main); font-size: 13.5px; box-sizing: border-box;"
                  />
                </div>

                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); margin-top: -2px;">
                  <input type="checkbox" id="settings-show-password" style="cursor: pointer;">
                  <label for="settings-show-password" style="cursor: pointer;">Show password characters</label>
                </div>

                <button type="submit" class="btn btn-primary" id="settings-update-password-btn" style="margin-top: 4px;">
                  Update Password
                </button>
              </form>
            </div>

            <!-- Profile & Co-Owners Box -->
            <div style="background: var(--bg-surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; gap: 14px;">
              <div>
                <strong style="font-size: 14px; color: var(--text-main);">Display Profile</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  Customize your name across the application.
                </p>
              </div>

              <form id="settings-profile-form" style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                  <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="settings-full-name"
                    value="${userFullName}"
                    placeholder="Your Full Name"
                    style="width: 100%; padding: 9px 12px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-main); font-size: 13.5px; box-sizing: border-box;"
                  />
                </div>

                <button type="submit" class="btn btn-secondary" id="settings-save-profile-btn">
                  Save Name
                </button>
              </form>

              <hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 6px 0;" />

              <div>
                <strong style="font-size: 13px; color: var(--text-main);">Enrolled Co-Owners</strong>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 8px 12px; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-subtle);">
                    <span><strong>Philip Achleman</strong><br><span style="color: var(--text-muted); font-size: 11px;">gatheringmossphil@gmail.com</span></span>
                    <span style="color: var(--accent-gold); font-size: 11px; font-weight: 600;">Co-Owner</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 8px 12px; background: var(--bg-primary); border-radius: 6px; border: 1px solid var(--border-subtle);">
                    <span><strong>Crystal Achleman</strong><br><span style="color: var(--text-muted); font-size: 11px;">clachleman@gmail.com</span></span>
                    <span style="color: var(--accent-gold); font-size: 11px; font-weight: 600;">Co-Owner</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div>
          <h3 style="font-size: 17px; font-weight: 700;">System Backups & Data Portability</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Your financial data is protected with 100% data ownership, snapshot capabilities, and exports.
          </div>
        </div>

        <!-- 1. Instant Backups & Exports Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              <span>Database Backups & Exports</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div style="background: var(--bg-surface-raised); padding: 14px; border-radius: var(--radius-md); display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
              <div>
                <strong style="font-size: 14px;">Download Full SQLite Database</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  1-Click download of <code>gathering_moss.db</code> containing all accounts, transactions, rules, and history.
                </p>
              </div>
              <a href="/api/backup/download-db" class="btn btn-primary" download>Download .db File</a>
            </div>

            <div style="background: var(--bg-surface-raised); padding: 14px; border-radius: var(--radius-md); display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
              <div>
                <strong style="font-size: 14px;">Create Local Snapshot</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  Saves a point-in-time snapshot timestamped in your local <code>data/backups/</code> directory.
                </p>
              </div>
              <button class="btn btn-secondary" id="create-snapshot-btn">Create Snapshot Now</button>
            </div>

            <div style="background: var(--bg-surface-raised); padding: 14px; border-radius: var(--radius-md); display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
              <div>
                <strong style="font-size: 14px;">Export All Transactions (CSV)</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  Export clean, standard CSV spreadsheet of all transactions across all accounts.
                </p>
              </div>
              <a href="/api/backup/export-csv" class="btn btn-outline" download>Export Transactions CSV</a>
            </div>

            <div style="background: var(--bg-surface-raised); padding: 14px; border-radius: var(--radius-md); display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
              <div>
                <strong style="font-size: 14px;">Export Complete System JSON</strong>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  Export full database schema and records in portable JSON format.
                </p>
              </div>
              <a href="/api/backup/export-json" class="btn btn-outline" download>Export Full JSON</a>
            </div>
          </div>
        </div>

        <!-- 1B. Reset / Clear Data Card -->
        <div class="card" style="border-left: 4px solid var(--accent-red);">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              <span>Reset & Clear Test Data</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <p style="font-size: 13px; color: var(--text-muted);">
                Wipe out automated test transactions and start with a clean slate for your actual bank records. (Your accounts, categories, and merchant rules are preserved, and a safety backup is created first).
              </p>
            </div>
            <button class="btn btn-danger" id="clear-all-trans-btn">Clear All Test Transactions</button>
          </div>
        </div>

        <!-- 2. Legacy Migration Card -->
        <div class="card" style="border-left: 4px solid var(--accent-gold);">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
              <span>Legacy Google Sheets / Tiller Migration Tool</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <p style="font-size: 13px; color: var(--text-muted);">
              Migrate your existing multi-year transaction history from Google Sheets or Tiller into Gathering Moss. Drop your exported spreadsheet below to auto-map columns and import seamlessly.
            </p>
            <div id="migration-drop-zone" style="border: 2px dashed var(--border-subtle); border-radius: var(--radius-lg); padding: 30px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" style="margin-bottom: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <div style="font-size: 14px; font-weight: 600;">Click to select file, or drag and drop spreadsheet here</div>
              <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">Supports CSV exports from Google Sheets, Tiller, or Microsoft Money</div>
              <input type="file" id="migration-file-input" accept=".csv" style="display: none;">
            </div>
          </div>
        </div>

        <!-- 3. Existing Local Backups List Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Available Local Snapshots (${backups.length})</span>
            </div>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Date & Time</th>
                  <th>File Size</th>
                  <th class="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                ${backups.length > 0 ? backups.map(b => `
                  <tr>
                    <td><code>${b.filename}</code></td>
                    <td class="text-muted">${new Date(b.created_at).toLocaleString()}</td>
                    <td class="text-mono">${(b.size / 1024).toFixed(1)} KB</td>
                    <td class="text-right">
                      <button class="btn btn-outline btn-sm restore-backup-btn" data-filename="${b.filename}">Restore</button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">No previous snapshots created yet.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // -------------------------------------------------------------
    // Hook up Event Listeners
    // -------------------------------------------------------------

    // Password Update
    const pwdForm = container.querySelector('#settings-password-form');
    const newPwdInput = container.querySelector('#settings-new-password');
    const confirmPwdInput = container.querySelector('#settings-confirm-password');
    const showPwdCheckbox = container.querySelector('#settings-show-password');
    const updatePwdBtn = container.querySelector('#settings-update-password-btn');

    showPwdCheckbox?.addEventListener('change', (e) => {
      const type = e.target.checked ? 'text' : 'password';
      if (newPwdInput) newPwdInput.type = type;
      if (confirmPwdInput) confirmPwdInput.type = type;
    });

    pwdForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPwd = newPwdInput?.value || '';
      const confirmPwd = confirmPwdInput?.value || '';

      if (newPwd.length < 6) {
        showToast('Password must be at least 6 characters long.', 'error');
        return;
      }

      if (newPwd !== confirmPwd) {
        showToast('Passwords do not match. Please re-enter.', 'error');
        return;
      }

      try {
        if (updatePwdBtn) updatePwdBtn.disabled = true;
        updatePwdBtn.textContent = 'Updating...';

        await auth.updatePassword(newPwd);
        showToast('Password successfully updated!', 'success');

        if (newPwdInput) newPwdInput.value = '';
        if (confirmPwdInput) confirmPwdInput.value = '';
      } catch (err) {
        showToast('Failed to update password: ' + err.message, 'error');
      } finally {
        if (updatePwdBtn) updatePwdBtn.disabled = false;
        updatePwdBtn.textContent = 'Update Password';
      }
    });

    // Profile Name Update
    const profileForm = container.querySelector('#settings-profile-form');
    const fullNameInput = container.querySelector('#settings-full-name');
    const saveProfileBtn = container.querySelector('#settings-save-profile-btn');

    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = fullNameInput?.value.trim() || '';
      if (!name) return;

      try {
        if (saveProfileBtn) saveProfileBtn.disabled = true;
        await auth.updateProfile({ full_name: name });
        showToast('Display name saved successfully!', 'success');
        renderSettings(container, navigateTo);
      } catch (err) {
        showToast('Failed to save name: ' + err.message, 'error');
      } finally {
        if (saveProfileBtn) saveProfileBtn.disabled = false;
      }
    });

    // Sign Out Button
    container.querySelector('#settings-logout-btn')?.addEventListener('click', async () => {
      await auth.signOut();
      window.location.reload();
    });

    // Create snapshot
    container.querySelector('#create-snapshot-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.createBackupSnapshot();
        showToast(`Snapshot created: ${res.filename}`);
        renderSettings(container, navigateTo);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Clear all test transactions
    container.querySelector('#clear-all-trans-btn')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all test transactions? A safety backup will be saved first.')) {
        try {
          await api.clearTransactions();
          showToast('All transactions cleared successfully. Clean slate established!');
          if (navigateTo) navigateTo('register');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });

    // Restore snapshot
    container.querySelectorAll('.restore-backup-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const filename = btn.dataset.filename;
        if (confirm(`Are you sure you want to restore "${filename}"? Current data will be replaced.`)) {
          try {
            await api.restoreBackupSnapshot(filename);
            showToast(`Database restored from: ${filename}`);
            renderSettings(container, navigateTo);
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

    // Migration drag & drop
    const migrationDrop = container.querySelector('#migration-drop-zone');
    const migrationInput = container.querySelector('#migration-file-input');

    if (migrationDrop && migrationInput) {
      migrationDrop.addEventListener('click', () => migrationInput.click());

      migrationDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        migrationDrop.classList.add('dragover');
      });

      migrationDrop.addEventListener('dragleave', () => migrationDrop.classList.remove('dragover'));

      const handleMigrationFile = (file) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const res = await api.importLegacySheets({ csv_content: e.target.result });
            showToast(`Legacy Migration complete! Imported ${res.imported_count} historical transactions.`);
            if (navigateTo) navigateTo('register');
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
        reader.readAsText(file);
      };

      migrationDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        migrationDrop.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleMigrationFile(e.dataTransfer.files[0]);
        }
      });

      migrationInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleMigrationFile(e.target.files[0]);
        }
      });
    }

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading settings</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
