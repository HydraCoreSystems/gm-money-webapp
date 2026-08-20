import { api } from '../api.js';
import { showToast } from '../modals.js';

export async function renderSettings(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading system settings and backups...</span>
    </div>
  `;

  try {
    const backupRes = await api.listBackups();
    const backups = backupRes.backups;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 24px; max-width: 900px; margin: 0 auto;">
        <div>
          <h3 style="font-size: 17px; font-weight: 700;">System Backups & Data Portability</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Your financial data is stored locally in an open SQLite database. You have 100% data ownership and zero cloud vendor lock-in.
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

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: 13px; color: var(--text-muted);">
              Migrate your existing transaction history from the previous Google Sheets + Tiller spreadsheet into Gathering Moss Financial Center.
              The old <em>Business Area</em> field will be preserved in transaction metadata and categories will be mapped to the new Category/Subcategory system automatically.
            </p>

            <div class="drop-zone" id="migration-drop-zone" style="padding: 24px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>
              <div style="font-weight: 600; font-size: 13.5px;">Drop Legacy Google Sheets Export CSV Here</div>
              <input type="file" id="migration-file-input" accept=".csv" style="display: none;">
            </div>
          </div>
        </div>

        <!-- 3. Local Snapshot History -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div style="padding: 14px 20px; border-bottom: 1px solid var(--border-subtle);">
            <strong style="font-size: 14px;">Local Database Snapshots (${backups.length})</strong>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Snapshot Filename</th>
                  <th>Created Date</th>
                  <th class="text-right">File Size</th>
                </tr>
              </thead>
              <tbody>
                ${backups.length > 0 ? backups.map(b => `
                  <tr>
                    <td><code style="font-family: var(--font-mono); color: var(--moss-light);">${b.filename}</code></td>
                    <td class="text-mono" style="font-size: 12px; color: var(--text-muted);">${new Date(b.created_at).toLocaleString()}</td>
                    <td class="text-right text-mono">${(b.size / 1024).toFixed(1)} KB</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-dim); padding: 20px;">No snapshots created yet.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Snapshot creation
    container.querySelector('#create-snapshot-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.createBackupSnapshot();
        showToast(`Snapshot created: ${res.snapshot.filename}`);
        renderSettings(container, navigateTo);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Clear test transactions
    container.querySelector('#clear-all-trans-btn')?.addEventListener('click', () => {
      import('../modals.js').then(({ showConfirmModal }) => {
        showConfirmModal({
          title: 'Clear All Transactions',
          message: 'This will delete all current transactions to give you a clean slate for your actual data. Accounts, Categories, and Merchant Memory rules will be kept, and a backup snapshot will be saved automatically.',
          confirmText: 'Clear Transactions',
          danger: true,
          onConfirm: async () => {
            try {
              await api.clearTransactions();
              showToast('Transactions cleared! Ready for your real data.');
              if (navigateTo) navigateTo('home');
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        });
      });
    });

    // Migration drag & drop
    const migrationDrop = container.querySelector('#migration-drop-zone');
    const migrationInput = container.querySelector('#migration-file-input');

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

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading settings</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
