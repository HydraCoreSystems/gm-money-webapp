import { getSupabaseServerClient, getSupabaseServerClientPublic, getBusinessId } from "./supabase";

export type NotificationPrefs = {
  upcomingBills: boolean;
  overBudget: boolean;
  lowBalance: boolean;
  lowBalanceThreshold: number;
  newDeposits: boolean;
  newDepositThreshold: number;
};

export type NotificationRecipient = {
  name: string;
  email: string;
  prefs: NotificationPrefs;
};

export type NotificationSettings = {
  recipients: NotificationRecipient[];
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  upcomingBills: true,
  overBudget: true,
  lowBalance: false,
  lowBalanceThreshold: 100,
  newDeposits: false,
  newDepositThreshold: 0,
};

function normalizeNotificationPrefs(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  const source = raw ?? {};
  return {
    upcomingBills: source.upcomingBills !== false,
    overBudget: source.overBudget !== false,
    lowBalance: source.lowBalance === true,
    lowBalanceThreshold: Number.isFinite(Number(source.lowBalanceThreshold)) ? Number(source.lowBalanceThreshold) : 100,
    newDeposits: source.newDeposits === true,
    newDepositThreshold: Number.isFinite(Number(source.newDepositThreshold)) ? Number(source.newDepositThreshold) : 0,
  };
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  // Use the public-targeting server client so we can read from the
  // public view proxy if the gm_money table is restricted.
  const supabase = getSupabaseServerClientPublic();
  const businessId = await getBusinessId();

  const { data, error } = await supabase.from("notification_recipients").select("name, email, prefs").eq("business_id", businessId).order("email", { ascending: true });
  if (error) throw new Error(error.message);

  return {
    recipients: (data ?? []).map((row) => ({
      name: String((row as { name?: string }).name ?? ""),
      email: String((row as { email?: string }).email ?? ""),
      prefs: normalizeNotificationPrefs((row as { prefs?: Partial<NotificationPrefs> }).prefs as Partial<NotificationPrefs> | undefined),
    })),
  };
}

export async function addNotificationRecipient(name: string, email: string): Promise<NotificationSettings> {
  const supabase = getSupabaseServerClientPublic();
  const businessId = await getBusinessId();

  const { error } = await supabase.from("notification_recipients").insert({
    business_id: businessId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    prefs: DEFAULT_NOTIFICATION_PREFS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  return getNotificationSettings();
}

export async function updateNotificationRecipient(email: string, name: string, prefs: NotificationPrefs): Promise<NotificationSettings> {
  const supabase = getSupabaseServerClientPublic();
  const businessId = await getBusinessId();

  const { error } = await supabase.from("notification_recipients").update({ name: name.trim(), prefs, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("email", email.trim().toLowerCase());
  if (error) throw new Error(error.message);
  return getNotificationSettings();
}

export async function removeNotificationRecipient(email: string): Promise<NotificationSettings> {
  const supabase = getSupabaseServerClientPublic();
  const businessId = await getBusinessId();

  const { error } = await supabase.from("notification_recipients").delete().eq("business_id", businessId).eq("email", email.trim().toLowerCase());
  if (error) throw new Error(error.message);
  return getNotificationSettings();
}
