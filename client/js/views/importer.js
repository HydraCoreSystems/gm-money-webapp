import { api } from '../api.js';
import { showToast } from '../modals.js';

let previewData = null;
let currentCsvContent = null;
let currentFileName = '';

export async function renderImporter(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading CSV import engine...</span>
    </div>
  `;

  try {
    const accRes = await api.getAccounts();
    const accounts = accRes.accounts.filter(a => a.active);

    const renderUploadForm = () => {
      container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>
                <span>Universal Bank CSV Import</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
              <p style="font-size: 13.5px; color: var(--text-muted);">
                Download your monthly activity or transaction history as a CSV file from any bank or credit card (Chase, Capital One, Discover, Amex, PayPal, etc.) and drop it below.
              </p>

              <!-- Account Selector -->
              <div class="form-group" style="max-width: 400px;">
                <label class="form-label" for="import-account-select">Select Destination Account</label>
                <select class="select" id="import-account-select" required>
                  ${accounts.map(a => `<option value="${a.id}">${a.name} (${a.institution || a.type})${!a.balance_established ? ' — balance not established' : ''}</option>`).join('')}
                </select>
                ${accounts.filter(a => !a.balance_established).length > 0 ? `
                  <div style="margin-top: 8px; font-size: 11px; color: var(--text-dim);">
                    Accounts with &ldquo;balance not established&rdquo; require a statement balance on first import.
                  </div>
                ` : ''}
              </div>

              <!-- Drag & Drop Zone -->
              <div class="drop-zone" id="csv-drop-zone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                <div style="font-size: 14px; font-weight: 600;">Drag & Drop Bank CSV File Here</div>
                <div style="font-size: 12px; color: var(--text-dim);">or click to browse from your computer</div>
                <input type="file" id="csv-file-input" accept=".csv,text/csv,text/plain" style="display: none;">
              </div>
            </div>
          </div>
        </div>
      `;

      const dropZone = container.querySelector('#csv-drop-zone');
      const fileInput = container.querySelector('#csv-file-input');
      const accountSelect = container.querySelector('#import-account-select');

      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0], accountSelect.value);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFile(e.target.files[0], accountSelect.value);
        }
      });
    };

    const handleFile = (file, accountId) => {
      currentFileName = file.name;
      const reader = new FileReader();
      reader.onload = async (event) => {
        currentCsvContent = event.target.result;
        await runPreview(accountId);
      };
      reader.readAsText(file);
    };

    const runPreview = async (accountId) => {
      try {
        const res = await api.previewCSV(currentCsvContent, accountId);
        previewData = res.preview;
        renderPreviewScreen(accountId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    const renderPreviewScreen = (accountId) => {
      const p = previewData;
      const account = accounts.find(a => a.id == accountId);
      const notEstablished = account && !account.balance_established;
      const newRows = (p.transactions || []).filter(t => !t.is_duplicate);
      const netAmount = newRows.reduce((sum, t) => sum + (t.amount || 0), 0);

      if (notEstablished && newRows.length > 0) {
        renderBalanceInitScreen(accountId, account, p, newRows, netAmount);
        return;
      }

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <div class="card" style="border-left: 4px solid var(--moss-primary);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
              <div>
                <h3 style="font-size: 16px; font-weight: 700;">Import Preview: ${currentFileName}</h3>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                  Target Account: <strong>${account?.name}</strong> | Detected Format: <strong style="color: var(--moss-light);">${p.profile_name || p.profile?.name || 'Unknown'}</strong>
                </div>
              </div>
              <div style="display: flex; gap: 10px;">
                <button class="btn btn-outline" id="preview-cancel-btn">Choose Different File</button>
                <button class="btn btn-primary" id="preview-commit-btn" ${p.new_count === 0 ? 'disabled' : ''}>
                  Import ${p.new_count} New Transactions
                </button>
              </div>
            </div>

            <div style="display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap;">
              <div style="background: var(--bg-surface-raised); padding: 8px 14px; border-radius: var(--radius-md); font-size: 13px;">
                <span style="color: var(--text-dim);">Total Rows:</span> <strong>${p.total_rows}</strong>
              </div>
              <div style="background: rgba(72, 187, 120, 0.15); border: 1px solid rgba(72, 187, 120, 0.4); padding: 8px 14px; border-radius: var(--radius-md); font-size: 13px; color: #86efac;">
                <span>New Transactions:</span> <strong>${p.new_count}</strong>
              </div>
              <div style="background: rgba(226, 179, 87, 0.15); border: 1px solid rgba(226, 179, 87, 0.4); padding: 8px 14px; border-radius: var(--radius-md); font-size: 13px; color: #fde047;">
                <span>Duplicates Ignored:</span> <strong>${p.duplicate_count}</strong>
              </div>
              ${p.error_count > 0 ? `
                <div style="background: rgba(245, 101, 101, 0.15); border: 1px solid rgba(245, 101, 101, 0.4); padding: 8px 14px; border-radius: var(--radius-md); font-size: 13px; color: #fca5a5;">
                  <span>Skipped/Empty:</span> <strong>${p.error_count}</strong>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="card" style="padding: 0; overflow: hidden;">
            <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); font-weight: 600; font-size: 13.5px;">
              Parsed Transaction Rows (${p.transactions.length})
            </div>
            <div class="table-container" style="max-height: 480px;">
              <table class="data-table">
                <thead><tr><th style="width:50px;">#</th><th style="width:100px;">Date</th><th>Normalized Payee</th><th>Raw Bank Description</th><th class="text-right" style="width:110px;">Amount</th><th>Suggested Category</th><th style="width:90px;">Confidence</th><th style="width:100px;">Status</th></tr></thead>
                <tbody>${p.transactions.map((t, idx) => `
                  <tr style="${t.is_duplicate ? 'opacity:0.5;background:rgba(0,0,0,0.15);' : ''}">
                    <td class="text-mono" style="font-size:11px;color:var(--text-dim);">${idx + 1}</td>
                    <td class="text-mono" style="font-size:12px;">${t.date}</td>
                    <td><strong>${t.payee}</strong></td>
                    <td style="font-size:11.5px;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.original_description}</td>
                    <td class="text-right text-mono ${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">${t.amount < 0 ? '-' : '+'}$${Math.abs(t.amount).toFixed(2)}</td>
                    <td><span class="badge ${t.suggested_category_id ? 'badge-gold' : 'badge-expense'}">${t.suggested_category_name ? `${t.suggested_category_name}${t.suggested_subcategory_name ? ' : ' + t.suggested_subcategory_name : ''}` : 'Unassigned'}</span></td>
                    <td>${t.confidence > 0 ? `<span style="font-size:11.5px;font-weight:600;color:${t.confidence >= 0.9 ? '#86efac' : '#fde047'};">${Math.round(t.confidence * 100)}%</span>` : '<span style="color:var(--text-dim);font-size:11px;">0%</span>'}</td>
                    <td>${t.is_duplicate ? '<span class="badge badge-gold" style="font-size:10.5px;">Duplicate</span>' : '<span class="badge badge-income" style="font-size:10.5px;">Ready</span>'}</td>
                  </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      container.querySelector('#preview-cancel-btn')?.addEventListener('click', renderUploadForm);
      container.querySelector('#preview-commit-btn')?.addEventListener('click', () => commitImport(accountId, null));
    };

    const renderBalanceInitScreen = (accountId, account, p, newRows, netAmount) => {
      const lastTxnDate = newRows.length > 0 ? newRows[newRows.length - 1].date : '';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <div class="card" style="border-left: 4px solid var(--accent-gold, #e2b357);">
            <div style="display: flex; flex-direction: column; gap: 16px;">
              <div>
                <h3 style="font-size: 16px; font-weight: 700;">Initialize ${account.name} Balance</h3>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                  This account has no established balance. Enter the <strong>PNC statement ending balance</strong> as of the last transaction date to calculate the opening balance.
                </div>
              </div>

              <div class="form-group" style="max-width: 400px;">
                <label class="form-label" for="balance-statement-input" style="font-weight: 600;">
                  Statement Ending Balance as of ${lastTxnDate || 'the last transaction date'}
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 18px; font-weight: 700;">$${ }</span>
                  <input type="text" class="input" id="balance-statement-input" placeholder="e.g. 2500.00" style="font-size: 16px; padding: 10px 14px; width: 200px;" autofocus>
                </div>
                <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
                  This is the balance shown at the bottom of your PNC statement or CSV export after the last transaction.
                </div>
              </div>

              <!-- Calculation Preview -->
              <div class="card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle);">
                <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); font-weight: 600; font-size: 13.5px;">
                  Balance Calculation Preview
                </div>
                <div style="padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-muted);">New transactions:</span>
                    <strong>${newRows.length}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-muted);">Net transaction amount:</span>
                    <strong style="color: ${netAmount >= 0 ? 'var(--moss-light)' : 'var(--accent-red)'};">${netAmount >= 0 ? '+' : ''}$${netAmount.toFixed(2)}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
                    <span>Opening balance =</span>
                    <span style="font-size: 12px; color: var(--text-dim);">Statement Balance &minus; Net Transactions</span>
                  </div>
                  <div id="balance-calc-result" style="font-size: 14px; font-weight: 700; color: var(--moss-light); text-align: right;"></div>
                  <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
                    <span>Resulting current balance:</span>
                    <strong id="balance-resulting" style="color: var(--moss-light);"></strong>
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-outline" id="balance-cancel-btn">Cancel</button>
                <button class="btn btn-primary" id="balance-confirm-btn" disabled>Confirm and Import</button>
              </div>
            </div>
          </div>

          <div class="card" style="padding: 0; overflow: hidden;">
            <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); font-weight: 600; font-size: 13.5px;">
              Transactions to Import (${newRows.length})
            </div>
            <div class="table-container" style="max-height: 300px;">
              <table class="data-table">
                <thead><tr><th style="width:50px;">#</th><th style="width:100px;">Date</th><th>Payee</th><th class="text-right" style="width:110px;">Amount</th></tr></thead>
                <tbody>${newRows.map((t, idx) => `
                  <tr>
                    <td class="text-mono" style="font-size:11px;color:var(--text-dim);">${idx + 1}</td>
                    <td class="text-mono" style="font-size:12px;">${t.date}</td>
                    <td>${t.payee}</td>
                    <td class="text-right text-mono ${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">${t.amount < 0 ? '-' : '+'}$${Math.abs(t.amount).toFixed(2)}</td>
                  </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const balanceInput = container.querySelector('#balance-statement-input');
      const calcResult = container.querySelector('#balance-calc-result');
      const balanceResulting = container.querySelector('#balance-resulting');
      const confirmBtn = container.querySelector('#balance-confirm-btn');

      const updateCalc = () => {
        const raw = balanceInput.value.replace(/[$,]/g, '').trim();
        const statementBal = parseFloat(raw);
        if (!isNaN(statementBal) && raw !== '') {
          const opening = statementBal - netAmount;
          const current = statementBal;
          calcResult.textContent = '$${statementBal.toFixed(2)} &minus; ' + (netAmount >= 0 ? '+$' + netAmount.toFixed(2) : '-$' + Math.abs(netAmount).toFixed(2)) + ' = $$ ' + opening.toFixed(2);
          balanceResulting.textContent = '$${current.toFixed(2)}';
          confirmBtn.disabled = false;
        } else {
          calcResult.textContent = '\u2014';
          balanceResulting.textContent = '\u2014';
          confirmBtn.disabled = true;
        }
      };

      balanceInput.addEventListener('input', updateCalc);

      container.querySelector('#balance-cancel-btn')?.addEventListener('click', renderUploadForm);

      confirmBtn.addEventListener('click', async () => {
        if (confirmBtn.disabled) return;
        const raw = balanceInput.value.replace(/[$,]/g, '').trim();
        const statementBal = parseFloat(raw);
        if (isNaN(statementBal)) {
          showToast('Please enter a valid statement balance.', 'error');
          return;
        }
        await commitImport(accountId, statementBal);
      });
    };

    const commitImport = async (accountId, statementBalance) => {
      try {
        const p = previewData;
        const commitRes = await api.processImport({
          filename: currentFileName,
          account_id: accountId,
          transactions: p.transactions,
          statementBalance
        });

        if (commitRes.opening_established) {
          showToast(`Balance initialized. Imported ${commitRes.imported_count} transactions (${commitRes.duplicate_count} duplicates skipped).`);
        } else {
          showToast(`Successfully imported ${commitRes.imported_count} transactions (${commitRes.duplicate_count} duplicates skipped)`);
        }

        if (commitRes.review_required_count > 0) {
          navigateTo('review');
        } else {
          navigateTo('register', { accountId });
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    renderUploadForm();

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading CSV importer</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
