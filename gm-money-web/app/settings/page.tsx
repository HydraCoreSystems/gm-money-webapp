import { Sidebar } from "@/components/Sidebar";
import { getSettingsData } from "@/lib/settings";
import { getNotificationSettings } from "@/lib/notifications";
import { SettingsPanel } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let data;
  let loadError: string | null = null;

  try {
    const [settingsData, notificationSettings] = await Promise.all([getSettingsData(), getNotificationSettings()]);
    data = {
      ...settingsData,
      notificationRecipients: notificationSettings.recipients,
    };
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load settings.";
  }

  return (
    <div className="gm-shell">
      <Sidebar active="/settings" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Settings</p>
            <h1>Settings</h1>
            <p className="gm-topbar__lead">Manage appearance, password, notifications, and budget targets.</p>
          </div>
        </header>

        {loadError ? (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{loadError}</p>
            </div>
          </div>
        ) : (
          data && <SettingsPanel data={data} />
        )}
      </div>
    </div>
  );
}
