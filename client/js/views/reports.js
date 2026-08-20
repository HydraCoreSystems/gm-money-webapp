import { api } from '../api.js';

let activeTab = 'pnl'; // 'pnl', 'category', 'cashflow', 'payees'
let currentPreset = 'ytd'; // 'mtd', 'last_month', 'ytd', 'all'
let startDate = '';
let endDate = '';

export async function renderReports(container, navigateTo) {
  // Set default dates based on preset
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');

  if (currentPreset === 'mtd') {
    startDate = `${y}-${m}-01`;
    endDate = today.toISOString().slice(0, 10);
  } else if (currentPreset === 'last_month') {
    const lastMonthD = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    startDate = lastMonthD.toISOString().slice(0, 10);
    endDate = lastMonthEnd.toISOString().slice(0, 10);
  } else if (currentPreset === 'ytd') {
    startDate = `${y}-01-01`;
    endDate = today.toISOString().slice(0, 10);
  } else {
    startDate = '';
    endDate = '';
  }

  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Generating financial reports...</span>
    </div>
  `;

  try {
    const renderReportShell = async () => {
      container.innerHTML = `
        <!-- Top Toolbar & Tabs -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
          <div>
            <h3 style="font-size: 17px; font-weight: 700;">Financial Reports & Statements</h3>
            <div style="font-size: 13px; color: var(--text-muted);">
              Standard Category/Subcategory reporting for Gathering Moss LLC without corporate complexity.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm" onclick="window.print()">Print / Save PDF</button>
          </div>
        </div>

        <!-- Segmented Tab Navigation -->
        <div class="segmented-control" style="max-width: 650px;" id="report-tabs">
          <button class="segmented-btn ${activeTab === 'pnl' ? 'active' : ''}" data-tab="pnl">Profit & Loss (P&L)</button>
          <button class="segmented-btn ${activeTab === 'category' ? 'active' : ''}" data-tab="category">Spending by Category</button>
          <button class="segmented-btn ${activeTab === 'cashflow' ? 'active' : ''}" data-tab="cashflow">Monthly Cash Flow</button>
          <button class="segmented-btn ${activeTab === 'payees' ? 'active' : ''}" data-tab="payees">Top Payees</button>
        </div>

        <!-- Date Range Filter Bar -->
        <div class="card" style="padding: 12px 18px; background-color: var(--bg-surface-raised);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-dim);">Date Range:</span>
              <button class="btn btn-outline btn-sm ${currentPreset === 'mtd' ? 'btn-primary' : ''}" id="preset-mtd">This Month</button>
              <button class="btn btn-outline btn-sm ${currentPreset === 'last_month' ? 'btn-primary' : ''}" id="preset-last-month">Last Month</button>
              <button class="btn btn-outline btn-sm ${currentPreset === 'ytd' ? 'btn-primary' : ''}" id="preset-ytd">Year to Date (YTD)</button>
              <button class="btn btn-outline btn-sm ${currentPreset === 'all' ? 'btn-primary' : ''}" id="preset-all">All Time</button>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="date" class="input" id="rep-start-date" value="${startDate}" style="padding: 4px 8px; font-size: 12px;">
              <span style="color: var(--text-dim);">to</span>
              <input type="date" class="input" id="rep-end-date" value="${endDate}" style="padding: 4px 8px; font-size: 12px;">
              <button class="btn btn-secondary btn-sm" id="rep-apply-custom-date">Apply</button>
            </div>
          </div>
        </div>

        <!-- Report Content -->
        <div id="report-content-body">
          <div style="text-align: center; padding: 30px; color: var(--text-muted);">Loading statement...</div>
        </div>
      `;

      // Tab click events
      container.querySelectorAll('#report-tabs .segmented-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          activeTab = btn.dataset.tab;
          renderReportShell();
        });
      });

      // Preset date clicks
      const setPreset = (p) => {
        currentPreset = p;
        renderReports(container, navigateTo);
      };

      container.querySelector('#preset-mtd')?.addEventListener('click', () => setPreset('mtd'));
      container.querySelector('#preset-last-month')?.addEventListener('click', () => setPreset('last_month'));
      container.querySelector('#preset-ytd')?.addEventListener('click', () => setPreset('ytd'));
      container.querySelector('#preset-all')?.addEventListener('click', () => setPreset('all'));

      container.querySelector('#rep-apply-custom-date')?.addEventListener('click', () => {
        startDate = container.querySelector('#rep-start-date').value;
        endDate = container.querySelector('#rep-end-date').value;
        currentPreset = 'custom';
        renderReportBody();
      });

      await renderReportBody();
    };

    const renderReportBody = async () => {
      const body = container.querySelector('#report-content-body');
      if (!body) return;

      if (activeTab === 'pnl') {
        const pnl = await api.getProfitLoss({ start_date: startDate || undefined, end_date: endDate || undefined });
        body.innerHTML = `
          <div class="card" style="max-width: 800px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 16px;">
              <h3 style="font-size: 18px; font-weight: 800;">Gathering Moss LLC</h3>
              <div style="font-size: 14px; font-weight: 600; color: var(--moss-light);">Profit & Loss Statement (Income Statement)</div>
              <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">
                ${startDate ? startDate : 'Beginning'} through ${endDate ? endDate : 'Present'}
              </div>
            </div>

            <!-- Income Section -->
            <div style="margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--moss-primary); padding-bottom: 6px; margin-bottom: 10px;">
                <strong style="font-size: 14px; text-transform: uppercase; color: #86efac;">Operating Income</strong>
                <strong class="text-mono" style="font-size: 14px; color: #86efac;">$${pnl.income.total.toFixed(2)}</strong>
              </div>
              ${pnl.income.categories.length > 0 ? pnl.income.categories.map(cat => `
                <div style="margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 13.5px; padding: 4px 8px; background: var(--bg-surface-raised); border-radius: var(--radius-sm);">
                    <span>${cat.category_name}</span>
                    <span class="text-mono">$${cat.total.toFixed(2)}</span>
                  </div>
                  ${cat.subcategories.map(sub => `
                    <div style="display: flex; justify-content: space-between; font-size: 12.5px; padding: 2px 8px 2px 24px; color: var(--text-muted);">
                      <span>${sub.subcategory_name}</span>
                      <span class="text-mono">$${sub.amount.toFixed(2)}</span>
                    </div>
                  `).join('')}
                </div>
              `).join('') : `
                <div style="color: var(--text-dim); font-size: 12.5px; padding-left: 8px;">No income recorded.</div>
              `}
            </div>

            <!-- Expenses Section -->
            <div style="margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--accent-red); padding-bottom: 6px; margin-bottom: 10px;">
                <strong style="font-size: 14px; text-transform: uppercase; color: #fca5a5;">Operating Expenses</strong>
                <strong class="text-mono" style="font-size: 14px; color: #fca5a5;">$${pnl.expenses.total.toFixed(2)}</strong>
              </div>
              ${pnl.expenses.categories.length > 0 ? pnl.expenses.categories.map(cat => `
                <div style="margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 13.5px; padding: 4px 8px; background: var(--bg-surface-raised); border-radius: var(--radius-sm);">
                    <span>${cat.category_name}</span>
                    <span class="text-mono">$${cat.total.toFixed(2)}</span>
                  </div>
                  ${cat.subcategories.map(sub => `
                    <div style="display: flex; justify-content: space-between; font-size: 12.5px; padding: 2px 8px 2px 24px; color: var(--text-muted);">
                      <span>${sub.subcategory_name}</span>
                      <span class="text-mono">$${sub.amount.toFixed(2)}</span>
                    </div>
                  `).join('')}
                </div>
              `).join('') : `
                <div style="color: var(--text-dim); font-size: 12.5px; padding-left: 8px;">No expenses recorded.</div>
              `}
            </div>

            <!-- Net Operating Income -->
            <div style="border-top: 3px double var(--border-medium); padding-top: 14px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="font-size: 16px;">Net Operating Income / (Loss)</strong>
                <div style="font-size: 12px; color: var(--text-dim);">Gross Income minus Total Expenses</div>
              </div>
              <div class="text-mono ${pnl.net_operating_income >= 0 ? 'amount-pos' : 'amount-neg'}" style="font-size: 20px; font-weight: 800;">
                ${pnl.net_operating_income >= 0 ? '+' : ''}$${pnl.net_operating_income.toFixed(2)}
              </div>
            </div>
          </div>
        `;
      } else if (activeTab === 'category') {
        const catData = await api.getSpendingByCategory({ start_date: startDate || undefined, end_date: endDate || undefined });
        body.innerHTML = `
          <div class="card" style="padding: 0; overflow: hidden;">
            <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 14px;">Total Expenses: $${catData.grand_total.toFixed(2)}</strong>
            </div>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="text-center" style="width: 110px;">Transactions</th>
                    <th class="text-right" style="width: 140px;">Total Spent</th>
                    <th class="text-right" style="width: 100px;">% Share</th>
                  </tr>
                </thead>
                <tbody>
                  ${catData.categories.map(c => `
                    <tr style="font-weight: 600; background-color: var(--bg-surface-raised);">
                      <td>${c.category_name}</td>
                      <td class="text-center text-mono">${c.transaction_count}</td>
                      <td class="text-right text-mono amount-neg">$${c.total_amount.toFixed(2)}</td>
                      <td class="text-right text-mono">${c.percentage}%</td>
                    </tr>
                    ${c.subcategories.map(s => `
                      <tr style="font-size: 12px; color: var(--text-muted);">
                        <td style="padding-left: 32px;">↳ ${s.subcategory_name}</td>
                        <td class="text-center text-mono">${s.count}</td>
                        <td class="text-right text-mono">$${s.amount.toFixed(2)}</td>
                        <td class="text-right text-mono" style="color: var(--text-dim);">${s.percentage}%</td>
                      </tr>
                    `).join('')}
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } else if (activeTab === 'cashflow') {
        const trend = (await api.getCashFlowTrend(12)).trend;
        body.innerHTML = `
          <div class="card" style="padding: 0; overflow: hidden;">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th class="text-right" style="width: 140px;">Total Inflow</th>
                    <th class="text-right" style="width: 140px;">Total Outflow</th>
                    <th class="text-right" style="width: 160px;">Net Cash Flow</th>
                  </tr>
                </thead>
                <tbody>
                  ${trend.map(t => `
                    <tr>
                      <td><strong>${t.label}</strong></td>
                      <td class="text-right text-mono amount-pos">+$${t.income.toFixed(2)}</td>
                      <td class="text-right text-mono amount-neg">-$${t.expense.toFixed(2)}</td>
                      <td class="text-right text-mono ${t.net >= 0 ? 'amount-pos' : 'amount-neg'}" style="font-weight: 700;">
                        ${t.net >= 0 ? '+' : ''}$${t.net.toFixed(2)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } else if (activeTab === 'payees') {
        const payees = (await api.getPayeeSpending({ start_date: startDate || undefined, end_date: endDate || undefined, limit: 30 })).payees;
        body.innerHTML = `
          <div class="card" style="padding: 0; overflow: hidden;">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">Rank</th>
                    <th>Payee / Vendor</th>
                    <th>Primary Category</th>
                    <th class="text-center" style="width: 120px;">Transactions</th>
                    <th class="text-right" style="width: 140px;">Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  ${payees.map((p, idx) => `
                    <tr>
                      <td class="text-mono" style="font-size: 11px; color: var(--text-dim);">${idx + 1}</td>
                      <td><strong>${p.payee}</strong></td>
                      <td><span class="badge badge-gold">${p.primary_category}</span></td>
                      <td class="text-center text-mono">${p.transaction_count}</td>
                      <td class="text-right text-mono amount-neg" style="font-weight: 700;">$${p.total_spent.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    };

    await renderReportShell();

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error generating report</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}
