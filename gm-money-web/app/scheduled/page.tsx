import { Sidebar } from "@/components/Sidebar";
import { getActiveAccounts } from "@/lib/register";
import { getCategoryGroups, type CategoryGroupOption } from "@/lib/categories";
import { getScheduledTransactions, type ScheduledTransaction } from "@/lib/scheduled";
import { ScheduledPanel } from "@/components/ScheduledPanel";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  let accounts: { id: string; name: string }[] = [];
  let categoryGroups: CategoryGroupOption[] = [];
  let items: ScheduledTransaction[] = [];
  let loadError: string | null = null;

  try {
    [accounts, categoryGroups, items] = await Promise.all([getActiveAccounts(), getCategoryGroups(), getScheduledTransactions()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load scheduled transactions.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/scheduled" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Scheduled</p>
            <h1>Scheduled transactions</h1>
            <p className="gm-topbar__lead">Plan recurring payments in a calendar and auto-post them into the register on due dates.</p>
          </div>
        </header>

        {loadError ? (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        ) : (
          <ScheduledPanel categoryGroups={categoryGroups} accounts={accounts} initialItems={items} />
        )}
      </div>
    </div>
  );
}
