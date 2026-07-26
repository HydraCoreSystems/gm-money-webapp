import { Sidebar } from "@/components/Sidebar";
import { MerchantMemoryPanel } from "@/components/MerchantMemoryPanel";
import { getCategoryGroups } from "@/lib/categories";
import { getMerchantMemoryData } from "@/lib/merchant-memory";

export const dynamic = "force-dynamic";

export default async function MerchantsPage() {
  let data;
  let categoryGroups;
  let loadError: string | null = null;

  try {
    [data, categoryGroups] = await Promise.all([getMerchantMemoryData(), getCategoryGroups()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load merchant memory.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/merchants" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Merchant Memory</p>
            <h1>Merchant Memory</h1>
            <p className="gm-topbar__lead">Teach the app how to suggest categories for recurring payees.</p>
          </div>
        </header>

        {loadError ? (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        ) : (
          data && categoryGroups && <MerchantMemoryPanel data={data} categoryGroups={categoryGroups} />
        )}
      </div>
    </div>
  );
}
