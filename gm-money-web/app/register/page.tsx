import { getRegisterData, getActiveAccounts, type RegisterData } from "@/lib/register";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

function formatMoneySigned(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function statusBadgeClass(status: string): string {
  if (status === "cleared") return "gm-status-badge gm-status-badge--cleared";
  if (status === "uncleared") return "gm-status-badge gm-status-badge--uncleared";
  return "gm-status-badge gm-status-badge--reconciled";
}

export default async function RegisterPage({ searchParams }: { searchParams: { account?: string } }) {
  let accounts: { id: string; name: string }[] = [];
  let data: RegisterData | undefined;
  let loadError: string | null = null;
  try {
    accounts = await getActiveAccounts();
    data = await getRegisterData(searchParams.account);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the register.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/register" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Register</p>
            <h1>Register</h1>
            <p className="gm-topbar__lead">Every transaction for one account, with a running balance.</p>
          </div>
          {accounts.length > 1 && (
            <div className="gm-topbar__actions">
              {accounts.map((a) => (
                <a
                  key={a.id}
                  href={`/register?account=${a.id}`}
                  className={a.id === data?.accountId ? "button gm-button" : "button gm-button gm-button--secondary"}
                  style={{ textDecoration: "none", display: "inline-block", width: "auto" }}
                >
                  {a.name}
                </a>
              ))}
            </div>
          )}
        </header>

        {loadError && (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        )}

        {data && (
          <div className="gm-card gm-card--wide" style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div className="gm-panel-head" style={{ padding: "20px 22px 14px" }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{data.accountName}</h2>
            </div>
            <div className="gm-register-summary" style={{ margin: "0 22px 1rem" }}>
              <div>
                <div className="gm-register-summary__label">Current Balance</div>
                <div className="gm-register-summary__value">{formatMoney(data.currentBalance)}</div>
              </div>
              <div>
                <div className="gm-register-summary__label">Transactions</div>
                <div className="gm-register-summary__value">{data.entries.length}</div>
              </div>
            </div>

            <div className="gm-register-list" style={{ padding: "0 22px 22px" }}>
              {data.entries.map((e) => (
                <div key={e.id} className="gm-register-row">
                  <div className="gm-register-row__top">
                    <div className="gm-register-row__main">
                      <div className="gm-register-row__payee">{e.description}</div>
                      <div className="gm-register-row__meta">
                        {e.date}
                        {e.category ? ` · ${e.category}` : " · Uncategorized"}
                      </div>
                    </div>
                    <div className="gm-register-row__amounts">
                      <div className={e.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                        {formatMoneySigned(e.amount)}
                      </div>
                      <div className="gm-register-row__balance">{formatMoney(e.runningBalance)}</div>
                    </div>
                  </div>
                  <div className="gm-register-row__actions">
                    <span className={statusBadgeClass(e.status)}>{e.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
