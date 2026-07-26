/**
 * ============================================================
 * Gathering Moss Financial Center
 * TillerSync.gs
 *
 * Pushes Tiller-fed transactions + latest account balances to
 * gm-money-web's /api/tiller-sync endpoint on a recurring trigger, so the
 * web app's data stays live instead of a one-time migration snapshot.
 * The receiving endpoint upserts on a deterministic key, so re-running
 * this on a schedule is safe -- it will not create duplicate rows.
 *
 * One-time setup (Apps Script editor):
 *   1. Project Settings -> Script Properties -> add:
 *        TILLER_SYNC_URL    = https://gm-money-web.vercel.app/api/tiller-sync
 *        TILLER_SYNC_SECRET = (the same value as TILLER_SYNC_SECRET in
 *                              gm-money-web's environment variables)
 *   2. Run installTillerSyncTrigger() once (select it in the function
 *      dropdown above, click Run) to start the 15-minute sync. The first
 *      run will prompt for authorization -- this script now makes
 *      external requests (UrlFetchApp), which it didn't do before.
 *   3. Run syncTillerToGmMoneyWeb() directly any time to sync immediately
 *      instead of waiting for the next scheduled run.
 * ============================================================
 */

// The receiving endpoint (/api/tiller-sync) enforces its own CUTOFF_DATE
// server-side regardless of this window, so this is just about not
// resending months of data every 15 minutes -- not the thing keeping old
// history out. (A 60-day window here once quietly repopulated 166
// deliberately-purged pre-cutoff transactions before that server-side
// enforcement existed.) 21 days comfortably covers the real ~4-day bank-
// posting lag this data shows, with room to spare.
const TILLER_SYNC_LOOKBACK_DAYS_ = 21;

function syncTillerToGmMoneyWeb() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("TILLER_SYNC_URL");
  const secret = props.getProperty("TILLER_SYNC_SECRET");

  if (!url || !secret) {
    throw new Error(
      'TillerSync is not configured. Set "TILLER_SYNC_URL" and "TILLER_SYNC_SECRET" ' +
      "in Project Settings -> Script Properties first."
    );
  }

  const sheet = getTillerTransactionsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log("TillerSync: transactions sheet is empty, nothing to sync.");
    return [];
  }

  const map = getHeaderMap_(values[0]);
  requireHeaders_(map, ["Date", "Description", "Amount", "Account"]);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TILLER_SYNC_LOOKBACK_DAYS_);

  const byAccount = {};

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const rawDate = row[map.Date];
    if (!(rawDate instanceof Date) || isNaN(rawDate.getTime())) continue;
    if (rawDate < cutoff) continue;

    const account = String(row[map.Account] || "").trim();
    const description = String(row[map.Description] || "").trim();
    const amount = Number(row[map.Amount]);
    if (!account || !description || !isFinite(amount)) continue;

    const entry = {
      date: formatSyncDateKey_(rawDate),
      description: description,
      amount: amount,
      account: account,
      source: "tiller"
    };

    if (!byAccount[account]) {
      byAccount[account] = [];
    }
    byAccount[account].push(entry);
  }

  const accountNames = Object.keys(byAccount);
  const results = [];

  for (let i = 0; i < accountNames.length; i++) {
    const accountName = accountNames[i];

    let balance = null;
    try {
      balance = getLatestBalanceHistoryValue_(accountName);
    } catch (err) {
      Logger.log("TillerSync: could not read balance for \"" + accountName + "\": " + err.message);
    }

    const payload = {
      accountName: accountName,
      transactions: byAccount[accountName]
    };
    if (balance !== null) {
      payload.balance = balance;
    }

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-shared-secret": secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log(
        "TillerSync: sync failed for \"" + accountName + "\" (" + code + "): " + response.getContentText()
      );
    }

    results.push({ account: accountName, statusCode: code, transactionCount: byAccount[accountName].length });
  }

  Logger.log("TillerSync: " + JSON.stringify(results));
  return results;
}

function formatSyncDateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function installTillerSyncTrigger() {
  removeTillerSyncTrigger();
  ScriptApp.newTrigger("syncTillerToGmMoneyWeb")
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log("TillerSync trigger installed: syncTillerToGmMoneyWeb will run every 15 minutes.");
}

function removeTillerSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncTillerToGmMoneyWeb") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
