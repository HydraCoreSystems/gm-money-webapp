import { api } from '../api.js';
import { openModal, showConfirmModal, showToast } from '../modals.js';

export async function renderCategories(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading categories & subcategories...</span>
    </div>
  `;

  try {
    const res = await api.getCategories();
    const categories = res.categories;

    const expenseCats = categories.filter(c => c.type === 'expense');
    const incomeCats = categories.filter(c => c.type === 'income');
    const transferCats = categories.filter(c => c.type === 'transfer');

    const renderCatCard = (cat) => `
      <div class="card" style="padding: 14px 18px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="font-size: 15px; color: var(--text-main);">${cat.name}</strong>
            <span class="badge ${cat.type === 'income' ? 'badge-income' : cat.type === 'transfer' ? 'badge-transfer' : 'badge-expense'}">
              ${cat.type}
            </span>
            <span style="font-size: 11.5px; color: var(--text-dim);">(${cat.transaction_count || 0} transactions)</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm add-sub-btn" data-id="${cat.id}">+ Subcategory</button>
            <button class="btn btn-outline btn-sm edit-cat-btn" data-id="${cat.id}">✎</button>
            <button class="btn btn-outline btn-sm delete-cat-btn" data-id="${cat.id}" style="color: var(--accent-red);">✕</button>
          </div>
        </div>

        <!-- Subcategories List -->
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-left: 12px; border-left: 2px solid var(--border-medium);">
          ${cat.subcategories && cat.subcategories.length > 0 ? cat.subcategories.map(s => `
            <div style="background: var(--bg-surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 4px 10px; font-size: 12.5px; display: flex; align-items: center; gap: 8px;">
              <span>${s.name}</span>
              ${s.transaction_count ? `<span style="font-size: 10.5px; color: var(--text-dim);">(${s.transaction_count})</span>` : ''}
              <button class="edit-sub-btn" data-id="${s.id}" data-cat-id="${cat.id}" data-name="${s.name}" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 11px;">✎</button>
              <button class="delete-sub-btn" data-id="${s.id}" style="background: none; border: none; color: var(--accent-red); cursor: pointer; font-size: 11px;">✕</button>
            </div>
          `).join('') : `
            <span style="color: var(--text-dim); font-size: 12px; font-style: italic;">No specific subcategories.</span>
          `}
        </div>
      </div>
    `;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="font-size: 17px; font-weight: 700;">Categories & Subcategories</h3>
          <div style="font-size: 13px; color: var(--text-muted);">
            Manage your two-tier Microsoft Money classification system for Gathering Moss LLC.
          </div>
        </div>
        <button class="btn btn-primary" id="cat-add-new-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>New Category</span>
        </button>
      </div>

      <!-- Expense Categories -->
      <div>
        <h4 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #fca5a5; margin-bottom: 10px; letter-spacing: 0.5px;">
          Expense Categories (${expenseCats.length})
        </h4>
        ${expenseCats.map(renderCatCard).join('')}
      </div>

      <!-- Income Categories -->
      <div style="margin-top: 14px;">
        <h4 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #86efac; margin-bottom: 10px; letter-spacing: 0.5px;">
          Income Categories (${incomeCats.length})
        </h4>
        ${incomeCats.map(renderCatCard).join('')}
      </div>

      <!-- Transfer Categories -->
      <div style="margin-top: 14px;">
        <h4 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #93c5fd; margin-bottom: 10px; letter-spacing: 0.5px;">
          Transfer & Owner Equity (${transferCats.length})
        </h4>
        ${transferCats.map(renderCatCard).join('')}
      </div>
    `;

    // Modal Helpers for Categories
    const showCatModal = (existing = null) => {
      const html = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width: 440px;">
            <div class="modal-header">
              <div class="modal-title">${existing ? 'Edit Category' : 'New Category'}</div>
              <button class="modal-close-btn modal-close-trigger">&times;</button>
            </div>
            <form id="category-modal-form">
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label" for="cat-name-inp">Category Name</label>
                  <input type="text" class="input" id="cat-name-inp" value="${existing ? existing.name : ''}" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="cat-type-inp">Type</label>
                  <select class="select" id="cat-type-inp">
                    <option value="expense" ${existing && existing.type === 'expense' ? 'selected' : ''}>Expense</option>
                    <option value="income" ${existing && existing.type === 'income' ? 'selected' : ''}>Income</option>
                    <option value="transfer" ${existing && existing.type === 'transfer' ? 'selected' : ''}>Transfer / Equity</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
                <button type="submit" class="btn btn-primary">${existing ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      `;
      const { overlay, close } = openModal(html);
      overlay.querySelector('#category-modal-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = overlay.querySelector('#cat-name-inp').value.trim();
        const type = overlay.querySelector('#cat-type-inp').value;
        try {
          if (existing) {
            await api.updateCategory(existing.id, { name, type });
            showToast('Category updated');
          } else {
            await api.createCategory({ name, type });
            showToast('Category created');
          }
          close();
          renderCategories(container, navigateTo);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    const showSubModal = (catId, existingSub = null) => {
      const html = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width: 400px;">
            <div class="modal-header">
              <div class="modal-title">${existingSub ? 'Edit Subcategory' : 'New Subcategory'}</div>
              <button class="modal-close-btn modal-close-trigger">&times;</button>
            </div>
            <form id="sub-modal-form">
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label" for="sub-name-inp">Subcategory Name</label>
                  <input type="text" class="input" id="sub-name-inp" value="${existingSub ? existingSub.name : ''}" required>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline modal-close-trigger">Cancel</button>
                <button type="submit" class="btn btn-primary">${existingSub ? 'Save' : 'Add'}</button>
              </div>
            </form>
          </div>
        </div>
      `;
      const { overlay, close } = openModal(html);
      overlay.querySelector('#sub-modal-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = overlay.querySelector('#sub-name-inp').value.trim();
        try {
          if (existingSub) {
            await api.updateSubcategory(existingSub.id, { name });
            showToast('Subcategory updated');
          } else {
            await api.createSubcategory(catId, { name });
            showToast('Subcategory added');
          }
          close();
          renderCategories(container, navigateTo);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    };

    // Event Bindings
    container.querySelector('#cat-add-new-btn')?.addEventListener('click', () => showCatModal());

    container.querySelectorAll('.edit-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const cat = categories.find(c => c.id === id);
        if (cat) showCatModal(cat);
      });
    });

    container.querySelectorAll('.delete-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const cat = categories.find(c => c.id === id);
        if (cat) {
          showConfirmModal({
            title: 'Delete Category',
            message: `Are you sure you want to delete <strong>${cat.name}</strong> and all its subcategories?`,
            confirmText: 'Delete Category',
            danger: true,
            onConfirm: async () => {
              try {
                await api.deleteCategory(id);
                showToast('Category deleted');
                renderCategories(container, navigateTo);
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        }
      });
    });

    container.querySelectorAll('.add-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = parseInt(btn.dataset.id, 10);
        showSubModal(catId);
      });
    });

    container.querySelectorAll('.edit-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const name = btn.dataset.name;
        showSubModal(null, { id, name });
      });
    });

    container.querySelectorAll('.delete-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        showConfirmModal({
          title: 'Delete Subcategory',
          message: 'Are you sure you want to delete this subcategory?',
          confirmText: 'Delete Subcategory',
          danger: true,
          onConfirm: async () => {
            try {
              await api.deleteSubcategory(id);
              showToast('Subcategory deleted');
              renderCategories(container, navigateTo);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading categories</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
