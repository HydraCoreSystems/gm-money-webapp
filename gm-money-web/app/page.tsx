import { getDashboardData } from "@/lib/dashboard";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatMoneySigned(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default async function HomePage() {
  let data;
  let loadError: string | null = null;
  try {
    data = await getDashboardData();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the dashboard.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Dashboard</p>
            <h1>Dashboard</h1>
            <p className="gm-topbar__lead">
              Real data, live from Supabase -- migrated from the Sheets/Tiller system.
            </p>
          </div>
        </header>

        {loadError && (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="hero-zone" style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div className="gm-overview-card">
                <div className="gm-overview-card__row">
                  {data.accounts.map((a) => (
                    <div key={a.id}>
                      <span className="gm-overview-card__label">{a.name}</span>
                      <span className="gm-overview-card__value">{formatMoney(a.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gm-stat-tile-row">
                <div className="gm-stat-tile">
                  <span className="gm-stat-tile__label">Income This Month</span>
                  <span className="gm-stat-tile__value gm-stat-tile__value--income">
                    {formatMoney(data.incomeThisMonth)}
                  </span>
                </div>
                <div className="gm-stat-tile">
                  <span className="gm-stat-tile__label">Expenses This Month</span>
                  <span className="gm-stat-tile__value gm-stat-tile__value--expenses">
                    {formatMoney(data.expensesThisMonth)}
                  </span>
                </div>
                <div className="gm-stat-tile">
                  <span className="gm-stat-tile__label">Pending Review</span>
                  <span className="gm-stat-tile__value gm-stat-tile__value--review">{data.pendingReviewCount}</span>
                </div>
                <div className="gm-stat-tile">
                  <span className="gm-stat-tile__label">Uncleared</span>
                  <span className="gm-stat-tile__value gm-stat-tile__value--uncleared">{data.unclearedCount}</span>
                </div>
              </div>
            </div>

            <div className="gm-card" style={{ maxWidth: 1200, margin: "26px auto 0", width: "calc(100% - 0px)" }}>
              <div className="gm-panel-head" style={{ display: "flex", justifyContent: "space-between", padding: "20px 22px 14px" }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>Recent Activity</h2>
                <span className="gm-register-note" style={{ margin: 0 }}>
                  Showing 2026-07-01 onward
                </span>
              </div>
              <div className="gm-register-list" style={{ padding: "0 22px 22px" }}>
                {data.recentTransactions.length === 0 && <p className="gm-register-note">No recent transactions.</p>}
                {data.recentTransactions.map((t) => (
                  <div key={t.id} className="gm-register-row">
                    <div className="gm-register-row__top">
                      <div className="gm-register-row__main">
                        <div className="gm-register-row__payee">{t.description}</div>
                        <div className="gm-register-row__meta">
                          {t.date} · {t.account}
                          {t.category ? ` · ${t.category}` : ""}
                        </div>
                      </div>
                      <div className={t.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                        {formatMoneySigned(t.amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
