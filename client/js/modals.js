import { api } from './api.js';

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'warning' ? 'toast-warning' : ''}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function openModal(htmlContent) {
  const root = document.getElementById('modal-root');
  root.innerHTML = htmlContent;
  const overlay = root.querySelector('.modal-overlay');
  
  setTimeout(() => overlay.classList.add('active'), 10);

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => { root.innerHTML = ''; }, 200);
  };

  overlay.querySelectorAll('.modal-close-trigger').forEach(btn => {
    btn.addEventListener('click', close);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKeyDown);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  return { overlay, close };
}

/**
 * Modernized Transaction Entry & Edit Modal with Split & Receipt Support
 */
export async function showTransactionModal(existing = null, defaultAccountId = null, onSaved = null) {
  const [accRes, catRes] = await Promise.all([
    api.getAccounts(),
    api.getCategories()
  ]);

  const accounts = accRes.accounts.filter(a => a.active);
  const categories = catRes.categories;

  const isEdit = !!existing;
  const initialType = existing ? existing.transaction_type : 'expense';
  const initialAmount = existing ? Math.abs(existing.amount).toFixed(2) : '';
  const initialAccId = existing ? existing.account_id : (defaultAccountId || (accounts[0]?.id || ''));
  const initialDate = existing ? existing.date : new Date().toISOString().slice(0, 10);
  let isSplitActive = existing && existing.splits && existing.splits.length > 0;
  let splitRows = existing && existing.splits ? [...existing.splits] : [];
  let attachments = existing && existing.attachments ? [...existing.attachments] : [];
  let stagedNewAttachments = []; // files staged for upload before transaction ID exists

  const html = `
    <div class="modal-overlay">
      <div class="modal-box modal-lg">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? 'Edit Transaction' : 'New Transaction'}</div>
          <button class="modal-close-btn modal-close-trigger">&times;</button>
        </div>
        <form id="trans-form">
          <div class="modal-body" style="max-height: 75vh;">
            <!-- Top Controls Row -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div class="segmented-control" id="trans-type-segmented" style="max-width: 320px;">
                <button type="button" class="segmented-btn ${initialType === 'expense' ? 'active' : ''}" data-type="expense">Expense</button>
                <button type="button" class="segmented-btn ${initialType === 'income' ? 'active' : ''}" data-type="income">Income</button>
                <button type="button" class="segmented-btn ${initialType === 'transfer' ? 'active' : ''}" data-type="transfer">Transfer</button>
              </div>
              <input type="hidden" name="transaction_type" id="form-trans-type" value="${initialType}">

              <button type="button" class="btn btn-outline btn-sm" id="toggle-split-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
                <span id="split-btn-label">${isSplitActive ? 'Disable Split' : 'Split Transaction'}</span>
              </button>
            </div>

            <div class="form-grid">
              <!-- Account -->
              <div class="form-group">
                <label class="form-label" for="form-account">Account</label>
                <select class="select" name="account_id" id="form-account" required>
                  ${accounts.map(a => `<option value="${a.id}" ${a.id == initialAccId ? 'selected' : ''}>${a.name} ($${a.current_balance.toFixed(2)})</option>`).join('')}
                </select>
              </div>

              <!-- Date -->
              <div class="form-group">
                <label class="form-label" for="form-date">Date</label>
                <input type="date" class="input" name="date" id="form-date" value="${initialDate}" required>
              </div>
            </div>

            <!-- Payee with Merchant Memory live suggestion -->
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="form-label" for="form-payee">Payee / Merchant</label>
                <span id="merchant-suggestion-badge" class="badge badge-gold" style="display: none; font-size: 10.5px;">Learned Rule</span>
              </div>
              <input type="text" class="input" name="payee" id="form-payee" placeholder="e.g. USPS, Micro Center, Chick-fil-A, Home Depot" value="${existing ? existing.payee : ''}" required autocomplete="off">
            </div>

            <!-- Amount & Transfer Destination -->
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="form-amount">Total Amount ($)</label>
                <input type="number" step="0.01" min="0.01" class="input text-mono" name="amount" id="form-amount" placeholder="48.99 (positive value)" value="${initialAmount}" required>
                <span class="form-hint">No minus sign needed for expenses</span>
              </div>

              <div class="form-group" id="transfer-target-group" style="${initialType === 'transfer' ? '' : 'display: none;'}">
                <label class="form-label" for="form-transfer-acc">Transfer To Account</label>
                <select class="select" name="transfer_account_id" id="form-transfer-acc">
                  <option value="">Select destination...</option>
                  ${accounts.map(a => `<option value="${a.id}" ${existing && existing.transfer_account_id == a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Single Category/Subcategory (Shown when NOT in split mode) -->
            <div class="form-grid" id="single-cat-picker-grid" style="${initialType === 'transfer' || isSplitActive ? 'display: none;' : ''}">
              <div class="form-group">
                <label class="form-label" for="form-category">Category</label>
                <select class="select" name="category_id" id="form-category">
                  <option value="">(None / Uncategorized)</option>
                  ${categories.map(c => `<option value="${c.id}" ${existing && existing.category_id == c.id ? 'selected' : ''}>${c.name} (${c.type})</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="form-subcategory">Subcategory</label>
                <select class="select" name="subcategory_id" id="form-subcategory">
                  <option value="">(None)</option>
                </select>
              </div>
            </div>

            <!-- Split Transactions Builder (Shown when in split mode) -->
            <div id="split-builder-section" style="${isSplitActive ? '' : 'display: none;'}">
              <div style="background: var(--bg-surface-raised); border: 1px solid var(--border-medium); border-radius: var(--radius-md); padding: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <strong style="font-size: 13.5px; color: var(--moss-light);">Split Transaction Lines</strong>
                  <div style="font-size: 12.5px;">
                    <span style="color: var(--text-dim);">Unallocated: </span>
                    <strong class="text-mono" id="split-remaining-disp" style="color: var(--accent-gold);">$0.00</strong>
                  </div>
                </div>

                <div id="split-rows-container" style="display: flex; flex-direction: column; gap: 8px;">
                  <!-- Dynamic split rows -->
                </div>

                <button type="button" class="btn btn-outline btn-sm" id="add-split-row-btn" style="margin-top: 10px;">+ Add Split Line</button>
              </div>
            </div>

            <!-- Payment Method & Reference # -->
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="form-payment-method">Payment Method</label>
                <select class="select" name="payment_method" id="form-payment-method">
                  <option value="debit" ${existing && existing.payment_method === 'debit' ? 'selected' : ''}>Debit Card</option>
                  <option value="credit" ${existing && existing.payment_method === 'credit' ? 'selected' : ''}>Credit Card</option>
                  <option value="ach" ${existing && existing.payment_method === 'ach' ? 'selected' : ''}>ACH / Bank Transfer</option>
                  <option value="check" ${existing && existing.payment_method === 'check' ? 'selected' : ''}>Check</option>
                  <option value="cash" ${existing && existing.payment_method === 'cash' ? 'selected' : ''}>Cash</option>
                  <option value="electronic" ${existing && existing.payment_method === 'electronic' ? 'selected' : ''}>Electronic / Online</option>
                  <option value="other" ${existing && existing.payment_method === 'other' ? 'selected' : ''}>Other</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="form-ref">Reference / Check #</label>
                <input type="text" class="input" name="reference_num" id="form-ref" placeholder="Optional" value="${existing && existing.reference_num ? existing.reference_num : ''}">
              </div>
            </div>

            <!-- Memo -->
            <div class="form-group">
              <label class="form-label" for="form-memo">Memo / Notes</label>
              <input type="text" class="input" name="memo" id="form-memo" placeholder="Optional notes" value="${existing && existing.memo ? existing.memo : ''}">
            </div>

            <!-- Receipts & Invoice Attachments Section -->
            <div class="form-group">
              <label class="form-label">Receipts & Invoices (Drag & drop or Paste with Ctrl+V)</label>
              <div class="drop-zone" id="receipt-drop-zone" style="padding: 16px; border-radius: var(--radius-md);">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg>
                <div style="font-size: 12.5px; font-weight: 600;">Drop receipt image or PDF here (or Ctrl+V to paste screenshot)</div>
                <input type="file" id="receipt-file-input" accept="image/*,application/pdf" style="display: none;">
              </div>

              <!-- Attachments List Preview -->
              <div id="attachments-gallery" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;"></div>
            </div>

            <!-- Status Checkboxes -->
            <div style="display: flex; gap: 20px; align-items: center;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" name="cleared" id="form-cleared" ${existing && (existing.cleared_status === 'cleared' || existing.cleared_status === 'reconciled') ? 'checked' : ''}>
                <span>Mark as Cleared</span>
              </label>

              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" name="learn_merchant" id="form-learn" checked>
                <span>Remember classification for Merchant Memory</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Record Transaction'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const { overlay, close } = openModal(html);

  // Single Category Cascade
  const updateSingleSubcategories = (catId, selectedSubId = null) => {
    const subSelect = overlay.querySelector('#form-subcategory');
    subSelect.innerHTML = '<option value="">(None)</option>';
    if (!catId) return;

    const cat = categories.find(c => c.id == catId);
    if (cat && cat.subcategories) {
      cat.subcategories.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        if (selectedSubId && s.id == selectedSubId) opt.selected = true;
        subSelect.appendChild(opt);
      });
    }
  };

  const catSelect = overlay.querySelector('#form-category');
  catSelect.addEventListener('change', () => updateSingleSubcategories(catSelect.value));

  if (existing && existing.category_id) {
    updateSingleSubcategories(existing.category_id, existing.subcategory_id);
  }

  // Segmented Type toggle
  const segButtons = overlay.querySelectorAll('#trans-type-segmented .segmented-btn');
  const typeInput = overlay.querySelector('#form-trans-type');
  const transferGroup = overlay.querySelector('#transfer-target-group');
  const singleCatGrid = overlay.querySelector('#single-cat-picker-grid');
  const splitSection = overlay.querySelector('#split-builder-section');
  const toggleSplitBtn = overlay.querySelector('#toggle-split-btn');

  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      segButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.type;
      typeInput.value = t;

      if (t === 'transfer') {
        transferGroup.style.display = '';
        singleCatGrid.style.display = 'none';
        splitSection.style.display = 'none';
        toggleSplitBtn.style.display = 'none';
      } else {
        transferGroup.style.display = 'none';
        toggleSplitBtn.style.display = '';
        if (isSplitActive) {
          singleCatGrid.style.display = 'none';
          splitSection.style.display = '';
        } else {
          singleCatGrid.style.display = '';
          splitSection.style.display = 'none';
        }
      }
    });
  });

  // Split Builder Logic
  const splitRowsContainer = overlay.querySelector('#split-rows-container');
  const remainingDisp = overlay.querySelector('#split-remaining-disp');
  const totalAmountInput = overlay.querySelector('#form-amount');

  const updateSplitRemaining = () => {
    const total = parseFloat(totalAmountInput.value) || 0;
    let splitSum = 0;
    overlay.querySelectorAll('.split-amount-input').forEach(inp => {
      splitSum += parseFloat(inp.value) || 0;
    });
    const diff = total - splitSum;
    remainingDisp.textContent = `$${diff.toFixed(2)}`;
    if (Math.abs(diff) < 0.01) {
      remainingDisp.style.color = '#86efac';
      remainingDisp.textContent = '$0.00 (Balanced)';
    } else {
      remainingDisp.style.color = '#fde047';
    }
  };

  const renderSplitRows = () => {
    splitRowsContainer.innerHTML = '';
    if (splitRows.length === 0) {
      // Create initial 2 default rows
      splitRows = [
        { category_id: existing?.category_id || '', subcategory_id: existing?.subcategory_id || '', amount: totalAmountInput.value ? (parseFloat(totalAmountInput.value) / 2).toFixed(2) : '', memo: '' },
        { category_id: '', subcategory_id: '', amount: totalAmountInput.value ? (parseFloat(totalAmountInput.value) / 2).toFixed(2) : '', memo: '' }
      ];
    }

    splitRows.forEach((row, idx) => {
      const div = document.createElement('div');
      div.className = 'split-row-item';
      div.style.cssText = 'display: grid; grid-template-columns: 1.5fr 1.5fr 1fr 1.5fr 36px; gap: 8px; align-items: center;';
      div.innerHTML = `
        <select class="select split-cat-select" style="padding: 4px 6px; font-size: 12px;">
          <option value="">(Category)</option>
          ${categories.map(c => `<option value="${c.id}" ${row.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
        <select class="select split-sub-select" style="padding: 4px 6px; font-size: 12px;">
          <option value="">(Subcategory)</option>
        </select>
        <input type="number" step="0.01" class="input text-mono split-amount-input" placeholder="Amount" value="${row.amount || ''}" style="padding: 4px 6px; font-size: 12px;">
        <input type="text" class="input split-memo-input" placeholder="Memo" value="${row.memo || ''}" style="padding: 4px 6px; font-size: 12px;">
        <button type="button" class="btn btn-outline btn-sm remove-split-row-btn" style="color: var(--accent-red); padding: 4px;">✕</button>
      `;

      const catSel = div.querySelector('.split-cat-select');
      const subSel = div.querySelector('.split-sub-select');
      const amtInp = div.querySelector('.split-amount-input');
      const memoInp = div.querySelector('.split-memo-input');

      const populateSubs = (catId, preselectSub = null) => {
        subSel.innerHTML = '<option value="">(Subcategory)</option>';
        if (!catId) return;
        const cat = categories.find(c => c.id == catId);
        if (cat && cat.subcategories) {
          cat.subcategories.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (preselectSub && s.id == preselectSub) opt.selected = true;
            subSel.appendChild(opt);
          });
        }
      };

      catSel.addEventListener('change', () => {
        row.category_id = catSel.value;
        row.subcategory_id = '';
        populateSubs(catSel.value);
      });

      subSel.addEventListener('change', () => { row.subcategory_id = subSel.value; });
      amtInp.addEventListener('input', () => {
        row.amount = amtInp.value;
        updateSplitRemaining();
      });
      memoInp.addEventListener('input', () => { row.memo = memoInp.value; });

      div.querySelector('.remove-split-row-btn').addEventListener('click', () => {
        splitRows.splice(idx, 1);
        renderSplitRows();
      });

      if (row.category_id) {
        populateSubs(row.category_id, row.subcategory_id);
      }

      splitRowsContainer.appendChild(div);
    });

    updateSplitRemaining();
  };

  toggleSplitBtn.addEventListener('click', () => {
    isSplitActive = !isSplitActive;
    if (isSplitActive) {
      overlay.querySelector('#split-btn-label').textContent = 'Disable Split';
      singleCatGrid.style.display = 'none';
      splitSection.style.display = '';
      renderSplitRows();
    } else {
      overlay.querySelector('#split-btn-label').textContent = 'Split Transaction';
      singleCatGrid.style.display = '';
      splitSection.style.display = 'none';
      splitRows = [];
    }
  });

  overlay.querySelector('#add-split-row-btn')?.addEventListener('click', () => {
    splitRows.push({ category_id: '', subcategory_id: '', amount: '', memo: '' });
    renderSplitRows();
  });

  totalAmountInput.addEventListener('input', () => {
    if (isSplitActive) updateSplitRemaining();
  });

  if (isSplitActive) renderSplitRows();

  // Attachments Handling
  const gallery = overlay.querySelector('#attachments-gallery');
  const dropZone = overlay.querySelector('#receipt-drop-zone');
  const fileInput = overlay.querySelector('#receipt-file-input');

  const renderAttachmentsGallery = () => {
    gallery.innerHTML = '';
    const allAtts = [...attachments, ...stagedNewAttachments];
    allAtts.forEach((att, idx) => {
      const div = document.createElement('div');
      div.style.cssText = 'background: var(--bg-surface-raised); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 11.5px; display: flex; align-items: center; gap: 8px;';
      div.innerHTML = `
        <span style="color: var(--moss-light);">📎 ${att.original_name}</span>
        ${att.id ? `<button type="button" class="view-att-btn" style="background: none; border: none; color: var(--accent-blue); cursor: pointer;">View</button>` : '<span style="color: var(--accent-gold); font-size: 10.5px;">(Staged)</span>'}
        <button type="button" class="del-att-btn" style="background: none; border: none; color: var(--accent-red); cursor: pointer;">✕</button>
      `;

      div.querySelector('.view-att-btn')?.addEventListener('click', () => {
        window.open(`/api/attachments/${att.id}/view`, '_blank');
      });

      div.querySelector('.del-att-btn').addEventListener('click', async () => {
        if (att.id) {
          try {
            await api.deleteAttachment(att.id);
            attachments = attachments.filter(a => a.id !== att.id);
            renderAttachmentsGallery();
          } catch (e) {
            showToast(e.message, 'error');
          }
        } else {
          stagedNewAttachments.splice(idx - attachments.length, 1);
          renderAttachmentsGallery();
        }
      });

      gallery.appendChild(div);
    });
  };

  const processFileToAttachment = (file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64_data = ev.target.result;
      if (isEdit) {
        try {
          const res = await api.uploadAttachment(existing.id, {
            original_name: file.name || 'receipt.png',
            mime_type: file.type || 'image/png',
            base64_data
          });
          attachments.push(res.attachment);
          renderAttachmentsGallery();
          showToast('Receipt attached');
        } catch (e) {
          showToast(e.message, 'error');
        }
      } else {
        stagedNewAttachments.push({
          original_name: file.name || 'receipt.png',
          mime_type: file.type || 'image/png',
          base64_data
        });
        renderAttachmentsGallery();
      }
    };
    reader.readAsDataURL(file);
  };

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) processFileToAttachment(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFileToAttachment(e.dataTransfer.files[0]);
  });

  // Global Ctrl+V Clipboard Paste Listener for screenshots
  const pasteListener = (e) => {
    if (e.clipboardData && e.clipboardData.items) {
      for (const item of e.clipboardData.items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          processFileToAttachment(blob);
          showToast('Image pasted from clipboard');
        }
      }
    }
  };
  window.addEventListener('paste', pasteListener);

  renderAttachmentsGallery();

  // Merchant Memory Live Autocomplete
  const payeeInput = overlay.querySelector('#form-payee');
  const badge = overlay.querySelector('#merchant-suggestion-badge');
  let debounceTimer = null;
  payeeInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = payeeInput.value.trim();
    if (val.length < 2) {
      badge.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await api.testMerchantPattern(val);
        if (res.success && res.match && res.match.category_id && !isSplitActive) {
          badge.style.display = 'inline-flex';
          badge.textContent = `Auto-Match: ${res.match.category_name}${res.match.subcategory_name ? ' > ' + res.match.subcategory_name : ''}`;
          catSelect.value = res.match.category_id;
          updateSingleSubcategories(res.match.category_id, res.match.subcategory_id);
        } else {
          badge.style.display = 'none';
        }
      } catch (e) {
        badge.style.display = 'none';
      }
    }, 300);
  });

  // Form Submit
  const form = overlay.querySelector('#trans-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    const payload = {
      account_id: parseInt(fd.get('account_id'), 10),
      date: fd.get('date'),
      payee: fd.get('payee'),
      amount: parseFloat(fd.get('amount')),
      transaction_type: fd.get('transaction_type'),
      category_id: !isSplitActive && fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
      subcategory_id: !isSplitActive && fd.get('subcategory_id') ? parseInt(fd.get('subcategory_id'), 10) : null,
      memo: fd.get('memo'),
      payment_method: fd.get('payment_method'),
      reference_num: fd.get('reference_num'),
      cleared_status: fd.get('cleared') ? 'cleared' : 'uncleared',
      transfer_account_id: fd.get('transfer_account_id') ? parseInt(fd.get('transfer_account_id'), 10) : null,
      splits: isSplitActive ? splitRows.filter(r => r.amount && parseFloat(r.amount) > 0) : [],
      learn_merchant: !!fd.get('learn_merchant')
    };

    try {
      let savedTransId = existing ? existing.id : null;
      if (isEdit) {
        await api.updateTransaction(existing.id, payload);
        showToast('Transaction updated');
      } else {
        const createRes = await api.createTransaction(payload);
        savedTransId = createRes.transaction_id;
        showToast('Transaction recorded');
      }

      // Upload staged attachments if any
      if (savedTransId && stagedNewAttachments.length > 0) {
        for (const staged of stagedNewAttachments) {
          await api.uploadAttachment(savedTransId, staged);
        }
      }

      window.removeEventListener('paste', pasteListener);
      close();
      if (onSaved) onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/**
 * Account Create & Edit Modal
 */
export async function showAccountModal(existing = null, onSaved = null) {
  const isEdit = !!existing;
  const html = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? 'Edit Account' : 'New Account'}</div>
          <button class="modal-close-btn modal-close-trigger">&times;</button>
        </div>
        <form id="account-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="acc-name">Account Name</label>
              <input type="text" class="input" name="name" id="acc-name" placeholder="e.g. Gathering Moss Checking" value="${existing ? existing.name : ''}" required>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="acc-inst">Financial Institution</label>
                <input type="text" class="input" name="institution" id="acc-inst" placeholder="e.g. Chase, Capital One" value="${existing && existing.institution ? existing.institution : ''}">
              </div>

              <div class="form-group">
                <label class="form-label" for="acc-type">Account Type</label>
                <select class="select" name="type" id="acc-type" required>
                  <option value="checking" ${existing && existing.type === 'checking' ? 'selected' : ''}>Checking</option>
                  <option value="savings" ${existing && existing.type === 'savings' ? 'selected' : ''}>Savings</option>
                  <option value="credit_card" ${existing && existing.type === 'credit_card' ? 'selected' : ''}>Credit Card</option>
                  <option value="cash" ${existing && existing.type === 'cash' ? 'selected' : ''}>Cash / Petty Cash</option>
                  <option value="loan" ${existing && existing.type === 'loan' ? 'selected' : ''}>Loan / Liability</option>
                  <option value="other" ${existing && existing.type === 'other' ? 'selected' : ''}>Other Asset</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="acc-open-bal">Opening Balance ($)</label>
              <input type="number" step="0.01" class="input text-mono" name="opening_balance" id="acc-open-bal" value="${existing ? existing.opening_balance : '0.00'}" required>
              <span class="form-hint">For credit cards, positive number is current balance owed</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="acc-notes">Notes</label>
              <input type="text" class="input" name="notes" id="acc-notes" placeholder="Account purpose, routing notes, etc." value="${existing && existing.notes ? existing.notes : ''}">
            </div>

            ${isEdit ? `
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" name="active" ${existing.active ? 'checked' : ''}>
                <span>Account is Active</span>
              </label>
            ` : ''}
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Account' : 'Create Account'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const { overlay, close } = openModal(html);

  overlay.querySelector('#account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      institution: fd.get('institution'),
      type: fd.get('type'),
      opening_balance: parseFloat(fd.get('opening_balance')) || 0,
      notes: fd.get('notes'),
      active: isEdit ? !!fd.get('active') : 1
    };

    try {
      if (isEdit) {
        await api.updateAccount(existing.id, payload);
        showToast('Account updated');
      } else {
        await api.createAccount(payload);
        showToast('Account created');
      }
      close();
      if (onSaved) onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/**
 * Scheduled Bill & Deposit Modal
 */
export async function showScheduledModal(existing = null, onSaved = null) {
  const [accRes, catRes] = await Promise.all([
    api.getAccounts(),
    api.getCategories()
  ]);

  const accounts = accRes.accounts.filter(a => a.active);
  const categories = catRes.categories;
  const isEdit = !!existing;

  const html = `
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? 'Edit Scheduled Item' : 'New Scheduled Bill / Deposit'}</div>
          <button class="modal-close-btn modal-close-trigger">&times;</button>
        </div>
        <form id="scheduled-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="sch-type">Type</label>
                <select class="select" name="transaction_type" id="sch-type" required>
                  <option value="expense" ${existing && existing.transaction_type === 'expense' ? 'selected' : ''}>Recurring Bill / Expense</option>
                  <option value="income" ${existing && existing.transaction_type === 'income' ? 'selected' : ''}>Recurring Deposit / Income</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="sch-freq">Frequency</label>
                <select class="select" name="frequency" id="sch-freq" required>
                  <option value="weekly" ${existing && existing.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                  <option value="biweekly" ${existing && existing.frequency === 'biweekly' ? 'selected' : ''}>Every 2 Weeks</option>
                  <option value="monthly" ${!existing || existing.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                  <option value="quarterly" ${existing && existing.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                  <option value="yearly" ${existing && existing.frequency === 'yearly' ? 'selected' : ''}>Yearly</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="sch-payee">Payee / Description</label>
              <input type="text" class="input" name="payee" id="sch-payee" placeholder="e.g. Shopify, Electricity, Web Hosting" value="${existing ? existing.payee : ''}" required>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="sch-amount">Amount ($)</label>
                <input type="number" step="0.01" min="0.01" class="input text-mono" name="amount" id="sch-amount" placeholder="39.00" value="${existing ? existing.amount : ''}" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="sch-account">Account</label>
                <select class="select" name="account_id" id="sch-account" required>
                  ${accounts.map(a => `<option value="${a.id}" ${existing && existing.account_id == a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="sch-cat">Category</label>
                <select class="select" name="category_id" id="sch-cat">
                  <option value="">(None)</option>
                  ${categories.map(c => `<option value="${c.id}" ${existing && existing.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="sch-next-date">Next Due Date</label>
                <input type="date" class="input" name="next_due_date" id="sch-next-date" value="${existing ? existing.next_due_date : new Date().toISOString().slice(0, 10)}" required>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="sch-memo">Memo</label>
              <input type="text" class="input" name="memo" id="sch-memo" placeholder="Optional notes" value="${existing && existing.memo ? existing.memo : ''}">
            </div>

            <div style="display: flex; gap: 20px; align-items: center;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" name="auto_create" ${existing && existing.auto_create ? 'checked' : ''}>
                <span>Automatically record on due date</span>
              </label>

              ${isEdit ? `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  <input type="checkbox" name="active" ${existing.active ? 'checked' : ''}>
                  <span>Active</span>
                </label>
              ` : ''}
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Schedule' : 'Create Schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const { overlay, close } = openModal(html);

  overlay.querySelector('#scheduled-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      payee: fd.get('payee'),
      amount: parseFloat(fd.get('amount')),
      account_id: parseInt(fd.get('account_id'), 10),
      transaction_type: fd.get('transaction_type'),
      category_id: fd.get('category_id') ? parseInt(fd.get('category_id'), 10) : null,
      frequency: fd.get('frequency'),
      next_due_date: fd.get('next_due_date'),
      auto_create: !!fd.get('auto_create'),
      active: isEdit ? !!fd.get('active') : 1,
      memo: fd.get('memo')
    };

    try {
      if (isEdit) {
        await api.updateScheduled(existing.id, payload);
        showToast('Scheduled transaction updated');
      } else {
        await api.createScheduled(payload);
        showToast('Scheduled transaction created');
      }
      close();
      if (onSaved) onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/**
 * Reusable Confirmation Dialog
 */
export function showConfirmModal({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
  const html = `
    <div class="modal-overlay">
      <div class="modal-box" style="max-width: 420px;">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close-btn modal-close-trigger">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 14px; color: var(--text-main);">${message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-action-btn">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  const { overlay, close } = openModal(html);

  overlay.querySelector('#confirm-action-btn').addEventListener('click', async () => {
    close();
    if (onConfirm) await onConfirm();
  });
}
