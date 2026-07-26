import { getLiteBalances } from "@/lib/lite";
import { getActiveAccounts } from "@/lib/register";
import { getCategoryGroups } from "@/lib/categories";
import { EntryForm } from "@/components/EntryForm";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// The everyday, phone-first entry point -- balances at a glance and the
// entry form, nothing else. No Sidebar, no Register/Review/Settings --
// this is the screen meant to live on Crystal's home screen (manifest.ts
// points start_url here), not the full desk-bound app.
export default async function LitePage() {
  let balances: { id: string; name: string; balance: number }[] = [];
  let accounts: { id: string; name: string }[] = [];
  let categoryGroups: Awaited<ReturnType<typeof getCategoryGroups>> = [];
  let loadError: string | null = null;

  try {
    [balances, accounts, categoryGroups] = await Promise.all([getLiteBalances(), getActiveAccounts(), getCategoryGroups()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load GM Money.";
  }

  return (
    <div className="gm-lite">
      <header className="gm-lite__header">
        <div className="gm-brand-lockup" style={{ padding: 0 }}>
          <div className="gm-brand-mark">GM</div>
          <div>
            <strong style={{ color: "var(--ink)" }}>Gathering Moss</strong>
            <span style={{ color: "var(--muted)" }}>Financial Center</span>
          </div>
        </div>
        <div className="gm-lite__header-actions">
          <a href="/" className="gm-link-button">
            Full app
          </a>
          <form action={logout}>
            <button type="submit" className="gm-link-button">
              Log out
            </button>
          </form>
        </div>
      </header>

      {loadError && (
        <div className="gm-card">
          <p className="gm-error">{loadError}</p>
        </div>
      )}

      {!loadError && (
        <>
          <div className="gm-lite__balances">
            {balances.map((b) => (
              <div key={b.id} className="gm-lite__balance-tile">
                <div className="gm-lite__balance-label">{b.name}</div>
                <div className="gm-lite__balance-value">{formatMoney(b.balance)}</div>
              </div>
            ))}
          </div>

          <EntryForm accounts={accounts} categoryGroups={categoryGroups} />
        </>
      )}
    </div>
  );
}
