import { Sidebar } from "@/components/Sidebar";
import { getReviewQueue, type PendingReviewTransaction } from "@/lib/review";
import { getCategoryGroups, type CategoryGroupOption } from "@/lib/categories";
import { ReviewQueue } from "@/components/ReviewQueue";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let queue: PendingReviewTransaction[] = [];
  let categoryGroups: CategoryGroupOption[] = [];
  let loadError: string | null = null;

  try {
    [queue, categoryGroups] = await Promise.all([getReviewQueue(), getCategoryGroups()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load review queue.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/review" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Review</p>
            <h1>Review queue</h1>
            <p className="gm-topbar__lead">Categorize the next bank-fed transactions and move them into the ledger.</p>
          </div>
        </header>

        {loadError ? (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        ) : (
          <ReviewQueue queue={queue} categoryGroups={categoryGroups} />
        )}
      </div>
    </div>
  );
}
