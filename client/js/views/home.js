import { api } from '../api.js';
import { showTransactionModal, showToast } from '../modals.js';

let categoryChartInstance = null;
let cashFlowChartInstance = null;

export async function renderHome(container, navigateTo) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 40px;">
      <span style="color: var(--text-muted);">Loading financial center dashboard...</span>
    </div>
  `;

  try {
    const data = await api.getDashboardSummary();
    const s = data.summary;

    container.innerHTML = `
      <!-- Pending Review Banner (if any) -->
      ${s.pending_review_count > 0 ? `
        <div style="background: linear-gradient(90deg, rgba(226, 179, 87, 0.2), rgba(226, 179, 87, 0.05)); border: 1px solid var(--accent-gold); border-radius: var(--radius-lg); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <div>
              <strong style="color: var(--accent-gold); font-size: 14px;">${s.pending_review_count} Imported Transactions Need Review</strong>
              <div style="font-size: 12.5px; color: var(--text-muted);">Confirm classifications and learn new merchant patterns.</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="home-goto-review-btn">Review Transactions</button>
        </div>
      ` : ''}

      <!-- Top Summary Stat Cards -->
      <div class="stats-grid">
        <div class="stat-card moss">
          <span class="stat-label">Total Liquid Cash</span>
          <span class="stat-value">$${s.liquid_cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="stat-subtext">Checking, Savings & Cash on Hand</span>
        </div>

        <div class="stat-card gold">
          <span class="stat-label">Projected Cash (30 Days)</span>
          <span class="stat-value">$${s.projected_cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="stat-subtext">Based on scheduled bills & income</span>
        </div>

        <div class="stat-card ${s.mtd_net >= 0 ? 'moss' : 'red'}">
          <span class="stat-label">MTD Net Income</span>
          <span class="stat-value ${s.mtd_net >= 0 ? 'amount-pos' : 'amount-neg'}">
            ${s.mtd_net < 0 ? '-' : (s.mtd_net > 0 ? '+' : '')}$${Math.abs(s.mtd_net).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span class="stat-subtext">In: $${s.mtd_income.toFixed(2)} | Out: $${s.mtd_expense.toFixed(2)}</span>
        </div>

        <div class="stat-card ${s.credit_debt > 0 ? 'red' : 'blue'}">
          <span class="stat-label">Credit Card Debt</span>
          <span class="stat-value">$${s.credit_debt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="stat-subtext">Net Worth: $${s.net_worth.toFixed(2)}</span>
        </div>
      </div>

      <!-- Charts Row -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- Spending by Category Chart -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
              <span>Spending by Category (MTD)</span>
            </div>
            <button class="btn btn-outline btn-sm" id="home-view-reports-btn">View P&L</button>
          </div>
          <div style="height: 240px; position: relative; display: flex; align-items: center; justify-content: center;">
            ${s.category_spending.categories.length > 0 ? `
              <canvas id="categoryDonutChart"></canvas>
            ` : `
              <div style="color: var(--text-dim); font-size: 13px;">No expense transactions recorded this month.</div>
            `}
          </div>
        </div>

        <!-- 6-Month Cash Flow Trend Chart -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              <span>Monthly Cash Flow (Income vs Expense)</span>
            </div>
          </div>
          <div style="height: 240px; position: relative;">
            <canvas id="cashFlowBarChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Activity & Upcoming Row -->
      <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px;">
        <!-- Recent Transactions -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path></svg>
              <span>Recent Transactions</span>
            </div>
            <button class="btn btn-outline btn-sm" id="home-goto-register-btn">Open Register</button>
          </div>
          <div class="table-container" style="max-height: 280px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Category</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${s.recent_transactions.length > 0 ? s.recent_transactions.map(t => `
                  <tr>
                    <td class="text-mono" style="font-size: 12px; color: var(--text-muted);">${t.date}</td>
                    <td><strong>${t.payee}</strong></td>
                    <td>
                      <span class="badge ${t.transaction_type === 'income' ? 'badge-income' : t.transaction_type === 'transfer' ? 'badge-transfer' : 'badge-expense'}">
                        ${t.category_name || (t.transaction_type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                      </span>
                    </td>
                    <td class="text-right text-mono ${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">
                      ${t.amount < 0 ? '-' : '+'}$${Math.abs(t.amount).toFixed(2)}
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">No recent transactions found.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Upcoming Bills & Scheduled Items -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>
              <span>Upcoming Scheduled Bills</span>
            </div>
            <button class="btn btn-outline btn-sm" id="home-goto-scheduled-btn">Manage</button>
          </div>
          <div class="table-container" style="max-height: 280px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Payee</th>
                  <th class="text-right">Amount</th>
                  <th class="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${s.projection_events.length > 0 ? s.projection_events.map(e => `
                  <tr>
                    <td class="text-mono" style="font-size: 12px; color: var(--accent-gold);">${e.date}</td>
                    <td><strong>${e.payee}</strong></td>
                    <td class="text-right text-mono ${e.amount < 0 ? 'amount-neg' : 'amount-pos'}">
                      $${Math.abs(e.amount).toFixed(2)}
                    </td>
                    <td class="text-center">
                      <button class="btn btn-outline btn-sm record-bill-btn" data-id="${e.scheduled_id}">Record</button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">No upcoming bills in next 30 days.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Hook up buttons
    container.querySelector('#home-goto-review-btn')?.addEventListener('click', () => navigateTo('review'));
    container.querySelector('#home-goto-register-btn')?.addEventListener('click', () => navigateTo('register'));
    container.querySelector('#home-goto-scheduled-btn')?.addEventListener('click', () => navigateTo('scheduled'));
    container.querySelector('#home-view-reports-btn')?.addEventListener('click', () => navigateTo('reports'));

    container.querySelectorAll('.record-bill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api.recordScheduled(id);
          showToast('Scheduled bill recorded to register');
          renderHome(container, navigateTo);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    // Render Chart.js visual charts
    renderCharts(s);

  } catch (err) {
    container.innerHTML = `
      <div style="background-color: var(--accent-red-bg); border: 1px solid var(--accent-red); border-radius: var(--radius-lg); padding: 20px; color: var(--text-main);">
        <h3>Error loading dashboard</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

function renderCharts(s) {
  if (typeof Chart === 'undefined') return;

  // 1. Category Donut Chart
  const donutCanvas = document.getElementById('categoryDonutChart');
  if (donutCanvas && s.category_spending.categories.length > 0) {
    if (categoryChartInstance) categoryChartInstance.destroy();

    const labels = s.category_spending.categories.map(c => c.category_name);
    const dataValues = s.category_spending.categories.map(c => c.total_amount);
    const colors = [
      '#52a479', '#e2b357', '#4299e1', '#9f7aea', '#ed64a6',
      '#38b2ac', '#f6ad55', '#fc8181', '#68d391', '#4fd1c5'
    ];

    categoryChartInstance = new Chart(donutCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#142820',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#d1e2da',
              font: { family: 'Plus Jakarta Sans', size: 11 },
              boxWidth: 12
            }
          }
        },
        cutout: '68%'
      }
    });
  }

  // 2. Monthly Cash Flow Bar Chart
  const barCanvas = document.getElementById('cashFlowBarChart');
  if (barCanvas && s.cash_flow_trend.length > 0) {
    if (cashFlowChartInstance) cashFlowChartInstance.destroy();

    const labels = s.cash_flow_trend.map(t => t.label);
    const incomeData = s.cash_flow_trend.map(t => t.income);
    const expenseData = s.cash_flow_trend.map(t => t.expense);

    cashFlowChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: 'rgba(72, 187, 120, 0.75)',
            borderColor: '#48bb78',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Expenses',
            data: expenseData,
            backgroundColor: 'rgba(245, 101, 101, 0.75)',
            borderColor: '#f56565',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#95b3a4', font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#95b3a4',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (val) => '$' + val
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#d1e2da',
              font: { family: 'Plus Jakarta Sans', size: 11 },
              boxWidth: 12
            }
          }
        }
      }
    });
  }
}
