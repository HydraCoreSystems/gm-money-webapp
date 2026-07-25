// One-time bootstrap: seed gm_money.site_auth with an initial password
// hash, since there's no self-service "sign up" flow for the very first
// password (the change-password page at /settings/password requires
// already being logged in). Run once after supabase/schema.sql has been
// applied and gm_money is exposed in Supabase's API settings:
//
//   node scripts/seed-site-auth.mjs [password]
//
// If no password is given, generates a random one and prints it -- log in
// with it once, then change it immediately via /settings/password.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  const env = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
  return env;
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "gm_money" },
  });

  const password = process.argv[2] || randomBytes(9).toString("base64url");
  const hash = await bcrypt.hash(password, 10);

  const { error } = await supabase
    .from("site_auth")
    .upsert({ id: 1, password_hash: hash, updated_at: new Date().toISOString() });

  if (error) {
    console.error("Failed to seed site_auth:", error.message);
    process.exit(1);
  }

  if (!process.argv[2]) {
    console.log(`Generated initial password: ${password}`);
    console.log("Log in with this once, then change it via /settings/password.");
  } else {
    console.log("Password set.");
  }
}

main();
