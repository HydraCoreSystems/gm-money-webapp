import { api } from '../api.js';
import { openModal, showConfirmModal, showToast } from '../modals.js';

export async function renderMerchantMemory(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading merchant memory intelligence...</span>
    </div>
  `;

  try {
    const [memRes, catRes] = await Promise.all([
      api.getMerchantRules(),
      api.getCategories()
    ]);

    const rules = memRes.rules;
    const categories = catRes.categories;

    container.innerHTML = `
      <!-- Top Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="font-size: 17px; font-weight: 700;">Merchant Memory & Learning Engine</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Gathering Moss learns from your transaction classifications and automatically maps noisy bank descriptions.
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-outline" id="reprocess-all-mem-btn">Re-run on Pending Transactions</button>
          <button class="btn btn-primary" id="add-mem-rule-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      <!-- Interactive Pattern Testing Sandbox -->
      <div class="card" style="background-color: var(--bg-surface-raised); border-color: var(--border-medium);">
        <div style="font-size: 13.5px; font-weight: 700; margin-bottom: 8px;">
          Test Rule Pattern Matcher
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <input type="text" class="input" id="test-pattern-input" placeholder="Type raw bank description (e.g. 'CHICK-FIL-A #02891 ATLANTA' or 'USPS PO 98402')..." style="flex: 1;">
          <button class="btn btn-secondary" id="run-test-pattern-btn">Test Match</button>
        </div>
        <div id="test-pattern-results" style="margin-top: 10px; font-size: 13px; display: none;"></div>
      </div>

      <!-- Merchant Rules Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px;">Learned Merchant Rules (${rules.length})</strong>
          <input type="text" class="input input-search" id="search-rules-input" placeholder="Filter rules..." style="padding: 4px 10px; font-size: 12px;">
        </div>
        <div class="table-container" style="max-height: 540px;">
          <table class="data-table" id="rules-table">
            <thead>
              <tr>
                <th>Match Pattern</th>
                <th>Display Payee</th>
                <th>Category</th>
                <th style="width: 100px;">Confidence</th>
                <th class="text-center" style="width: 90px;">Times Seen</th>
                <th style="width: 110px;">Last Seen</th>
                <th class="text-center" style="width: 90px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rules.length > 0 ? rules.map(r => `
                <tr data-id="${r.id}" data-text="${r.match_pattern.toLowerCase()} ${r.display_payee.toLowerCase()}">
                  <td>
                    <code style="font-family: var(--font-mono); color: var(--moss-light); font-size: 12px;">${r.match_pattern}</code>
                    <span style="font-size: 10.5px; color: var(--text-dim); margin-left: 6px;">(${r.match_type})</span>
                  </td>
                  <td><strong>${r.display_payee}</strong></td>
                  <td>
                    <span class="badge badge-gold">
                      ${r.category_name ? `${r.category_name}${r.subcategory_name ? ' : ' + r.subcategory_name : ''}` : 'Unassigned'}
                    </span>
                  </td>
                  <td>
                    <span style="font-weight: 600; font-size: 12px; color: ${r.confidence >= 0.9 ? '#86efac' : '#fde047'};">
                      ${Math.round(r.confidence * 100)}%
                    </span>
                  </td>
                  <td class="text-center text-mono" style="font-size: 12px;">${r.times_seen}</td>
                  <td class="text-mono" style="font-size: 11.5px; color: var(--text-muted);">${r.last_seen ? r.last_seen.slice(0, 10) : '—'}</td>
                  <td class="text-center">
                    <button class="btn btn-outline btn-sm edit-rule-btn" data-id="${r.id}">✎</button>
                    <button class="btn btn-outline btn-sm delete-rule-btn" data-id="${r.id}" style="color: var(--accent-red);">✕</button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 36px;">No rules found.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Testing sandbox
    const testInput = container.querySelector('#test-pattern-input');
    const testBtn = container.querySelector('#run-test-pattern-btn');
    const testResults = container.querySelector('#test-pattern-results');

    const executeTest = async () => {
      const val = testInput.value.trim();
      if (!val) return;
      try {
        const res = await api.testMerchantPattern(val);
        const m = res.match;
        testResults.style.display = 'block';
        if (m && m.category_id) {
          testResults.innerHTML = `
            <div style="background: rgba(72, 187, 120, 0.15); border: 1px solid rgba(72, 187, 120, 0.4); padding: 10px 14px; border-radius: var(--radius-md); color: #86efac;">
              ✓ <strong>Matched Rule #${m.rule_id}</strong> (${m.match_type}): Cleaned Payee: <strong>"${m.display_payee}"</strong> → Category: <strong>${m.category_name} : ${m.subcategory_name || 'General'}</strong> (Confidence: ${Math.round(m.confidence * 100)}%)
            </div>
          `;
        } else {
          testResults.innerHTML = `
            <div style="background: rgba(226, 179, 87, 0.15); border: 1px solid rgba(226, 179, 87, 0.4); padding: 10px 14px; border-radius: var(--radius-md); color: #fde047;">
              ⚠ No existing rule matched. Normalized Payee: <strong>"${m.display_payee}"</strong> (Confidence: 0%). Categorizing this will create a new learned rule.
            </div>
          `;
        }
      } catch (e) {
        showToast(e.message, 'error');
      }
    };

    testBtn.addEventListener('click', executeTest);
    testInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') executeTest(); });

    // Rules search filter
    const rulesInput = container.querySelector('#search-rules-input');
    rulesInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      container.querySelectorAll('#rules-table tbody tr').forEach(row => {
        const text = row.dataset.text || '';
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });

    // Rule Add / Edit Modal
    const showRuleModal = (existing = null) => {
      const html = `
        <div class="modal-overlay">
          <div class="modal-box">
            <div class="modal-header">
              <div class="modal-title">${existing ? 'Edit Merchant Rule' : 'New Merchant Rule'}</div>
              <button class="modal-close-btn modal-close-trigger">&times;</button>
            </div>
            <form id="rule-form">
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label" for="rule-pattern">Match Pattern / Keyword</label>
                  <input type="text" class="input" id="rule-pattern" value="${existing ? existing.match_pattern : ''}" placeholder="e.g. USPS or CHICK-FIL-A" required>
                </div>

                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label" for="rule-match-type">Match Type</label>
                    <select class="select" id="rule-match-type">
                      <option value="contains" ${!existing || existing.match_type === 'contains' ? 'selected' : ''}>Contains Substring</option>
                      <option value="exact" ${existing && existing.match_type === 'exact' ? 'selected' : ''}>Exact Match</option>
                      <option value="regex" ${existing && existing.match_type === 'regex' ? 'selected' : ''}>Regular Expression</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="rule-display">Clean Display Payee</label>
                    <input type="text" class="input" id="rule-display" value="${existing ? existing.display_payee : ''}" placeholder="e.g. USPS" required>
                  </div>
                </div>

                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label" for="rule-cat">Target Category</label>
                    <select class="select" id="rule-cat" required>
                      <option value="">(Select Category)</option>
                      ${categories.map(c => `<option value="${c.id}" ${existing && existing.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="rule-sub">Target Subcategory</label>
                    <select class="select" id="rule-sub">
                      <option value="">(None)</option>
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="rule-conf">Confidence (0.0 to 1.0)</label>
                  <input type="number" step="0.05" min="0.1" max="1.0" class="input text-mono" id="rule-conf" value="${existing ? existing.confidence : '1.0'}" required>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
                <button type="submit" class="btn btn-primary">${existing ? 'Save Rule' : 'Create Rule'}</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const { overlay, close } = openModal(html);
      const catSelect = overlay.querySelector('#rule-cat');
      const subSelect = overlay.querySelector('#rule-sub');

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

      if (existing && existing.category_id) {
        updateSubs(existing.category_id, existing.subcategory_id);
      }

      overlay.querySelector('#rule-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          match_pattern: overlay.querySelector('#rule-pattern').value.trim(),
          match_type: overlay.querySelector('#rule-match-type').value,
          display_payee: overlay.querySelector('#rule-display').value.trim(),
          category_id: parseInt(catSelect.value, 10),
          subcategory_id: subSelect.value ? parseInt(subSelect.value, 10) : null,
          confidence: parseFloat(overlay.querySelector('#rule-conf').value) || 1.0
        };

        try {
          if (existing) {
            await api.updateMerchantRule(existing.id, payload);
            showToast('Merchant rule updated');
          } else {
            await api.createMerchantRule(payload);
            showToast('Merchant rule created');
          }
          close();
          renderMerchantMemory(container, navigateTo);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    container.querySelector('#add-mem-rule-btn')?.addEventListener('click', () => showRuleModal());

    container.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const rule = rules.find(r => r.id === id);
        if (rule) showRuleModal(rule);
      });
    });

    container.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        showConfirmModal({
          title: 'Delete Merchant Rule',
          message: 'Are you sure you want to delete this learned pattern?',
          confirmText: 'Delete Rule',
          danger: true,
          onConfirm: async () => {
            try {
              await api.deleteMerchantRule(id);
              showToast('Merchant rule deleted');
              renderMerchantMemory(container, navigateTo);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });

    container.querySelector('#reprocess-all-mem-btn')?.addEventListener('click', async () => {
      try {
        const res = await api.reprocessMerchantMemory();
        showToast(`Re-processed: updated ${res.updated_count} pending transactions.`);
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading merchant memory</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
