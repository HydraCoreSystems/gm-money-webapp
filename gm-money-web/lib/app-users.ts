import bcrypt from "bcryptjs";
import { getBusinessId, getSupabaseServerClient } from "@/lib/supabase";

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRole(value: unknown): "owner" | "admin" | "member" {
  const role = String(value ?? "member").toLowerCase();
  if (role === "owner" || role === "admin") return role;
  return "member";
}

export async function getAppUserCount(): Promise<number> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listAppUsers(): Promise<AppUser[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, display_name, role, is_active, last_login_at, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    email: String(row.email),
    displayName: String(row.display_name ?? ""),
    role: normalizeRole(row.role),
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
  }));
}

export async function createAppUser(input: {
  email: string;
  displayName: string;
  password: string;
  role: "owner" | "admin" | "member";
}): Promise<{ id: string; email: string; displayName: string; role: "owner" | "admin" | "member" }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email || !displayName) {
    throw new Error("Email and name are required.");
  }

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const passwordHash = await bcrypt.hash(input.password, 10);

  // /setup gates on getAppUserCount() === 0 before calling this, but that
  // check and this insert are separate queries -- two overlapping /setup
  // submissions could both pass the count check (audit finding L3). A
  // partial unique index on app_users (business_id) where role='owner' is
  // the real backstop; this pre-check just turns the DB violation into a
  // clear error message instead of the generic "email already exists"
  // guess (the index error carries no email, so the generic catch below
  // would be misleading here).
  if (input.role === "owner") {
    const { count: existingOwnerCount, error: ownerCheckError } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "owner")
      .eq("is_active", true);
    if (ownerCheckError) throw new Error(ownerCheckError.message);
    if ((existingOwnerCount ?? 0) > 0) {
      throw new Error("An owner already exists for this business.");
    }
  }

  const { data, error } = await supabase
    .from("app_users")
    .insert({
      business_id: businessId,
      email,
      display_name: displayName,
      password_hash: passwordHash,
      role: input.role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, email, display_name, role")
    .single();

  if (error) {
    if (String(error.message).toLowerCase().includes("duplicate") || String(error.message).toLowerCase().includes("unique")) {
      throw new Error("A user with that email already exists.");
    }
    throw new Error(error.message);
  }

  return {
    id: data.id,
    email: String(data.email),
    displayName: String(data.display_name ?? ""),
    role: normalizeRole(data.role),
  };
}

export async function findActiveUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member";
  passwordHash: string;
} | null> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, display_name, role, password_hash")
    .eq("business_id", businessId)
    .eq("email", normalized)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    email: String(data.email),
    displayName: String(data.display_name ?? ""),
    role: normalizeRole(data.role),
    passwordHash: String(data.password_hash),
  };
}

export async function touchAppUserLastLogin(userId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { error } = await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function updateAppUserPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  if (input.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { data, error } = await supabase
    .from("app_users")
    .select("password_hash")
    .eq("business_id", businessId)
    .eq("id", input.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("User account not found.");

  const matches = await bcrypt.compare(input.currentPassword, String(data.password_hash));
  if (!matches) throw new Error("Current password is incorrect.");

  const nextHash = await bcrypt.hash(input.newPassword, 10);
  const { error: updateError } = await supabase
    .from("app_users")
    .update({ password_hash: nextHash, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", input.userId);

  if (updateError) throw new Error(updateError.message);
}

export async function setAppUserActive(input: { userId: string; active: boolean }): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { error } = await supabase
    .from("app_users")
    .update({ is_active: input.active, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", input.userId);
  if (error) throw new Error(error.message);
}

// Login rate-limiting (audit finding M4). Tracks failed login attempts
// per (business_id, email) in gm_money.login_attempts so the login
// Server Action can cap guesses -- bcrypt throttles each individual
// attempt but nothing capped the total number of attempts before this.
export type LoginAttemptState = {
  failedAttempts: number;
  lockedUntil: string | null;
};

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

function isLoginAttemptsTableMissing(error: { code?: string; message?: string }): boolean {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("login_attempts") && (text.includes("does not exist") || text.includes("42p01") || text.includes("pgrst"));
}

export async function getLoginAttemptState(email: string): Promise<LoginAttemptState> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from("login_attempts")
    .select("failed_attempts, locked_until")
    .eq("business_id", businessId)
    .eq("email", normalized)
    .maybeSingle();
  // Degrade to "no attempts" (fail-open, the pre-fix behavior) if the
  // rate-limit table hasn't been created yet -- never let a missing
  // bookkeeping table take down login for the whole business.
  if (error && isLoginAttemptsTableMissing(error)) {
    return { failedAttempts: 0, lockedUntil: null };
  }
  if (error) throw new Error(error.message);
  return {
    failedAttempts: Number(data?.failed_attempts ?? 0),
    lockedUntil: data?.locked_until ? String(data.locked_until) : null,
  };
}

export async function recordFailedLoginAttempt(email: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const normalized = normalizeEmail(email);

  const { data: existing, error: readError } = await supabase
    .from("login_attempts")
    .select("failed_attempts")
    .eq("business_id", businessId)
    .eq("email", normalized)
    .maybeSingle();
  if (readError && isLoginAttemptsTableMissing(readError)) return; // fail-open without the table
  if (readError) throw new Error(readError.message);

  const nextCount = Number(existing?.failed_attempts ?? 0) + 1;
  const now = new Date();
  const lockedUntil = nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCKOUT_MINUTES * 60_000).toISOString() : null;

  const { error } = await supabase.from("login_attempts").upsert(
    {
      business_id: businessId,
      email: normalized,
      failed_attempts: nextCount,
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    },
    { onConflict: "business_id,email" },
  );
  if (error && !isLoginAttemptsTableMissing(error)) throw new Error(error.message);
}

export async function clearLoginFailures(email: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const normalized = normalizeEmail(email);
  const { error } = await supabase
    .from("login_attempts")
    .delete()
    .eq("business_id", businessId)
    .eq("email", normalized);
  if (error && !isLoginAttemptsTableMissing(error)) throw new Error(error.message);
}
