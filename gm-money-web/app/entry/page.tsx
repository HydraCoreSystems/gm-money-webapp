import { getActiveAccounts } from "@/lib/register";
import { getCategoryGroups } from "@/lib/categories";
import { Sidebar } from "@/components/Sidebar";
import { EntryForm } from "@/components/EntryForm";

export const dynamic = "force-dynamic";

export default async function EntryPage() {
  let accounts: { id: string; name: string }[] = [];
  let categoryGroups: Awaited<ReturnType<typeof getCategoryGroups>> = [];
  let loadError: string | null = null;
  try {
    [accounts, categoryGroups] = await Promise.all([getActiveAccounts(), getCategoryGroups()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the entry form.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/entry" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Entry</p>
            <h1>Add a transaction.</h1>
            <p className="gm-topbar__lead">
              Pick a category and the type -- Income or Expense -- is set automatically.
            </p>
          </div>
        </header>

        {loadError ? (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        ) : (
          <EntryForm accounts={accounts} categoryGroups={categoryGroups} />
        )}
      </div>
    </div>
  );
}
