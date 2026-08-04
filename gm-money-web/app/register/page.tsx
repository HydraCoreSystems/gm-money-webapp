import { getRegisterData, getActiveAccounts, type RegisterData } from "@/lib/register";
import { getCategoryGroups, type CategoryGroupOption } from "@/lib/categories";
import { Sidebar } from "@/components/Sidebar";
import { RegisterEntryRow } from "@/components/RegisterEntryRow";

export const dynamic = "force-dynamic";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export default async function RegisterPage({ searchParams }: { searchParams: { account?: string } }) {
  let accounts: { id: string; name: string }[] = [];
  let data: RegisterData | undefined;
  let categoryGroups: CategoryGroupOption[] = [];
  let loadError: string | null = null;
  try {
    // Sequential, not Promise.all -- see lib/register.ts's own note on the
    // concurrent-Supabase-query bug this codebase has already hit once.
    accounts = await getActiveAccounts();
    data = await getRegisterData(searchParams.account);
    categoryGroups = await getCategoryGroups();
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
                <RegisterEntryRow key={e.id} entry={e} accountId={data!.accountId} categoryGroups={categoryGroups} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
