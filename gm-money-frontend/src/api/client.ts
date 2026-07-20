import type { ApiResult } from "./types";

const API_URL = import.meta.env.VITE_GM_API_URL as string;

const PASSWORD_KEY = "gm_money_password";
const ENTERED_BY_KEY = "gm_money_entered_by";

export const getStoredPassword = () => sessionStorage.getItem(PASSWORD_KEY) ?? "";
export const storePassword = (pw: string) => sessionStorage.setItem(PASSWORD_KEY, pw);
export const clearStoredPassword = () => sessionStorage.removeItem(PASSWORD_KEY);

export const getStoredEnteredBy = () => sessionStorage.getItem(ENTERED_BY_KEY) ?? "";
export const storeEnteredBy = (name: string) => sessionStorage.setItem(ENTERED_BY_KEY, name);

export async function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<ApiResult<T>> {
  if (!API_URL) {
    return {
      ok: false,
      error: "VITE_GM_API_URL is not configured.",
      code: "CONFIG_ERROR",
    };
  }

  const body = JSON.stringify({
    action,
    password: getStoredPassword(),
    payload,
  });

  let response: Response;

  try {
    response = await fetch(API_URL, {
      method: "POST",
      // Deliberately text/plain, not application/json: Apps Script Web
      // Apps don't handle CORS preflight (OPTIONS), so this must stay a
      // CORS "simple request" — no custom headers, no JSON content type.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection.",
      code: "NETWORK_ERROR",
    };
  }

  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return {
      ok: false,
      error: "Server returned an unexpected response.",
      code: "PARSE_ERROR",
    };
  }
}
