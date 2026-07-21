/* ============================================================
   Web App API — the entry point for the React frontend.

   Additive only: this file introduces the Web App surface on top
   of the existing sheet logic. It never modifies saveEntry() or
   any other Sheets-UI code path, which must keep working
   unchanged for the spreadsheet itself.
============================================================ */

const GM_API_PASSWORD_PROPERTY = "GM_API_PASSWORD";


/**
 * One-time setup: run manually from the Apps Script editor (select
 * this function in the toolbar dropdown, click Run). Never hardcode
 * the actual password in source — it's stored in Script Properties.
 */
function setApiPassword() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Set API Password",
    "Enter the shared password the web app frontend will use:",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const password = response.getResponseText().trim();

  if (!password) {
    ui.alert("Password cannot be blank.");
    return;
  }

  PropertiesService.getScriptProperties()
    .setProperty(GM_API_PASSWORD_PROPERTY, password);

  ui.alert("API password saved.");
}


function doPost(e) {
  return handleApiRequest_(e);
}


function handleApiRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return jsonError_("Missing request body.", "MALFORMED_REQUEST");
  }

  let body;

  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonError_("Malformed JSON body.", "MALFORMED_REQUEST");
  }

  // Password gate runs first, before the action is even inspected —
  // no sheet is ever touched, and no action name is ever confirmed
  // to exist, without a valid password.
  const storedPassword = PropertiesService.getScriptProperties()
    .getProperty(GM_API_PASSWORD_PROPERTY);

  if (!storedPassword) {
    return jsonError_(
      "Server is not configured with an API password yet.",
      "SERVER_ERROR"
    );
  }

  if (String(body.password || "") !== storedPassword) {
    return jsonError_("Invalid password.", "BAD_PASSWORD");
  }

  const action = String(body.action || "");
  const payload = body.payload || {};

  try {
    switch (action) {
      case "getFormOptions":
        return jsonOutput_({ ok: true, data: apiGetFormOptions_() });

      case "createTransaction":
        return jsonOutput_(apiCreateTransaction_(payload));

      case "getRegister":
        return jsonOutput_(apiGetRegister_(payload));

      case "updateTransaction":
        return jsonOutput_(apiUpdateTransaction_(payload));

      case "deleteTransaction":
        return jsonOutput_(apiDeleteTransaction_(payload));

      case "updateTransactionStatus":
        return jsonOutput_(apiUpdateTransactionStatus_(payload));

      case "matchTransaction":
        return jsonOutput_(apiMatchTransaction_(payload));

      case "getReviewTransactions":
        return jsonOutput_({ ok: true, data: apiGetReviewTransactions_() });

      case "approveTransaction":
        return jsonOutput_(apiApproveTransaction_(payload));

      case "getDashboard":
        return jsonOutput_({ ok: true, data: apiGetDashboard_() });

      case "addCategory":
        return jsonOutput_(apiAddCategory_(payload));

      case "addSubcategory":
        return jsonOutput_(apiAddSubcategory_(payload));

      case "deleteSubcategory":
        return jsonOutput_(apiDeleteSubcategory_(payload));

      case "deleteCategory":
        return jsonOutput_(apiDeleteCategory_(payload));

      case "addPaymentMethod":
        return jsonOutput_(apiAddPaymentMethod_(payload));

      case "deletePaymentMethod":
        return jsonOutput_(apiDeletePaymentMethod_(payload));

      case "getScheduledTransactions":
        return jsonOutput_({ ok: true, data: apiGetScheduledTransactions_() });

      case "createScheduledTransaction":
        return jsonOutput_(apiCreateScheduledTransaction_(payload));

      case "updateScheduledTransaction":
        return jsonOutput_(apiUpdateScheduledTransaction_(payload));

      case "deleteScheduledTransaction":
        return jsonOutput_(apiDeleteScheduledTransaction_(payload));

      case "processScheduledTransactionsNow":
        return jsonOutput_(apiProcessScheduledTransactionsNow_());

      case "getMerchantMemory":
        return jsonOutput_(apiGetMerchantMemory_(payload));

      case "updateMerchantMemory":
        return jsonOutput_(apiUpdateMerchantMemory_(payload));

      case "lockMerchantMemory":
        return jsonOutput_(apiLockMerchantMemory_(payload));

      case "unlockMerchantMemory":
        return jsonOutput_(apiUnlockMerchantMemory_(payload));

      case "deleteMerchantMemory":
        return jsonOutput_(apiDeleteMerchantMemory_(payload));

      case "rebuildMerchantMemory":
        return jsonOutput_(apiRebuildMerchantMemory_());

      case "getBudgets":
        return jsonOutput_({ ok: true, data: apiGetBudgets_() });

      case "setBudget":
        return jsonOutput_(apiSetBudget_(payload));

      case "deleteBudget":
        return jsonOutput_(apiDeleteBudget_(payload));

      case "getNotificationSettings":
        return jsonOutput_({ ok: true, data: apiGetNotificationSettings_() });

      case "addNotificationRecipient":
        return jsonOutput_(apiAddNotificationRecipient_(payload));

      case "removeNotificationRecipient":
        return jsonOutput_(apiRemoveNotificationRecipient_(payload));

      case "updateNotificationRecipient":
        return jsonOutput_(apiUpdateNotificationRecipient_(payload));

      case "sendTestNotification":
        return jsonOutput_(apiSendTestNotification_(payload));

      default:
        return jsonError_(
          'Unknown action: "' + action + '".',
          "UNKNOWN_ACTION"
        );
    }
  } catch (err) {
    console.error("GM API error: " + err.message);
    return jsonError_("Server error: " + err.message, "SERVER_ERROR");
  }
}


function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function jsonError_(error, code, extra) {
  return jsonOutput_(
    Object.assign({ ok: false, error: error, code: code }, extra || {})
  );
}


/* ============================================================
   getFormOptions
============================================================ */

function apiGetFormOptions_() {
  return {
    categoryGroups: apiGetCategoryGroups_(),
    accounts: getEntryAccountNames_(),
    paymentMethods: getConfiguredPaymentMethods_()
  };
}


function apiGetCategoryGroups_() {
  const rows = sortCategoryStructure_(getConfiguredCategoryStructure_());
  const groups = [];
  const groupByType = {};
  const categoryByKey = {};

  rows.forEach(function(row) {
    const category = row[0];
    const subcategory = row[1];
    const type = row[2];

    if (!groupByType[type]) {
      groupByType[type] = { type: type, categories: [] };
      groups.push(groupByType[type]);
    }

    const key = type + " " + category;

    if (!categoryByKey[key]) {
      categoryByKey[key] = { name: category, subcategories: [] };
      groupByType[type].categories.push(categoryByKey[key]);
    }

    if (subcategory) {
      categoryByKey[key].subcategories.push(subcategory);
    }
  });

  return groups;
}


/* ============================================================
   createTransaction
============================================================ */

/**
 * Parses a "yyyy-MM-dd" date-only string as a local date. Deliberately
 * not `new Date(dateString)` — that parses date-only ISO strings as
 * UTC midnight, which can silently display as the previous day once
 * converted to the script's local time zone.
 */
function parseDateOnly_(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString || "").trim());

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return isNaN(date.getTime()) ? null : date;
}


function buildTransactionValues_(payload) {
  const errors = [];

  const date = parseDateOnly_(payload.date);

  if (!date) {
    errors.push("Enter a valid date.");
  }

  const account = String(payload.account || "").trim();
  const accounts = getEntryAccountNames_();

  if (!account) {
    errors.push("Choose an account.");
  } else if (accounts.indexOf(account) === -1) {
    errors.push('Unknown account: "' + account + '".');
  }

  const payee = String(payload.payee || "").trim().slice(0, 200);

  if (!payee) {
    errors.push("Enter a payee.");
  }

  const enteredAmount = Number(payload.amount);

  if (!isFinite(enteredAmount) || enteredAmount <= 0) {
    errors.push("Enter an amount greater than zero.");
  }

  const category = String(payload.category || "").trim();
  const validCategories = getConfiguredCategoryNames_();

  if (!category) {
    errors.push("Choose a category.");
  } else if (validCategories.indexOf(category) === -1) {
    errors.push('Unknown category: "' + category + '".');
  }

  const subcategory = String(payload.subcategory || "").trim();

  if (subcategory && category) {
    const validSubs = getConfiguredSubcategoryNames_(category);

    if (validSubs.indexOf(subcategory) === -1) {
      errors.push(
        '"' + subcategory + '" is not a subcategory of "' + category + '".'
      );
    }
  }

  const paymentMethod = String(payload.paymentMethod || "").trim();
  const validMethods = getConfiguredPaymentMethods_();

  if (!paymentMethod) {
    errors.push("Choose a payment method.");
  } else if (validMethods.indexOf(paymentMethod) === -1) {
    errors.push('Unknown payment method: "' + paymentMethod + '".');
  }

  const notes = String(payload.notes || "").trim().slice(0, 1000);
  const enteredBy = String(payload.enteredBy || "").trim().slice(0, 100) || "Web App";

  if (errors.length > 0) {
    return { errors: errors };
  }

  // The only place Income/Expense is ever decided — derived purely
  // from the category the user picked, never from a client-supplied
  // field. This is what makes a mismatched category/type impossible.
  const type = getConfiguredCategoryType_(category);
  const signedAmount = type === "Income" ? Math.abs(enteredAmount) : -Math.abs(enteredAmount);

  return {
    errors: [],
    values: {
      date: date,
      account: account,
      payee: payee,
      amount: signedAmount,
      transactionType: type,
      category: category,
      subcategory: subcategory,
      paymentMethod: paymentMethod,
      notes: notes,
      enteredBy: enteredBy
    }
  };
}


/**
 * The live GM_ManualTransactions sheet's actual column order does NOT
 * match the documented header list — column 7 is a legacy "Business
 * Area" field (pre-dating the Category/Subcategory redesign), and the
 * real "Subcategory" column was appended at the end (position 18) by
 * ensureSheetHeaders_ rather than inserted where the docs assume.
 * Every other column lines up with its documented position — this is
 * the one exception. Looked up dynamically (matching how Register.gs
 * already reads it via getHeaderMap_) rather than hardcoded, so writes
 * land in the column that's actually named "Subcategory" regardless
 * of where it physically sits.
 */
function getManualTransactionSubcategoryColumn_(dataSheet) {
  const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  const map = getHeaderMap_(headers);
  return map.Subcategory;
}


function apiCreateTransaction_(payload) {
  const built = buildTransactionValues_(payload);

  if (built.errors.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Entry could not be saved.",
      fieldErrors: built.errors
    };
  }

  const values = built.values;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return {
      ok: false,
      code: "LOCK_TIMEOUT",
      error: "The system is busy — try again in a moment."
    };
  }

  try {
    const dataSheet = getManualTransactionsSheet_();

    if (isLikelyDuplicateEntry_(dataSheet, values)) {
      return {
        ok: true,
        data: {
          duplicate: true,
          message: "Skipped — an identical transaction was just saved."
        }
      };
    }

    const transactionId = createManualTransactionId_();
    const row = new Array(dataSheet.getLastColumn()).fill("");

    row[0] = transactionId;
    row[1] = values.date;
    row[2] = values.account;
    row[3] = values.payee;
    row[4] = values.amount;
    row[5] = values.category;
    row[7] = values.paymentMethod;
    row[8] = values.notes;
    row[9] = "Manual";
    row[10] = "Uncleared";
    row[13] = values.enteredBy;
    row[14] = new Date();
    row[getManualTransactionSubcategoryColumn_(dataSheet)] = values.subcategory;

    dataSheet
      .getRange(dataSheet.getLastRow() + 1, 1, 1, row.length)
      .setValues([row]);

    // Deliberately NOT calling refreshRegister()/refreshHomeDashboard()
    // here: they're full recomputes of the ledger/dashboard (~20-30s on
    // real data) and this milestone's frontend doesn't show either view.
    // The Sheet's own Register/Dashboard tabs catch up next time they're
    // opened, same as any other out-of-band edit to the data sheets.

    invalidateDashboardCache_();

    return {
      ok: true,
      data: {
        transactionId: transactionId,
        amount: values.amount,
        type: values.transactionType
      }
    };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   getRegister
============================================================ */

/**
 * Reuses Register.gs's existing merge/dedup/running-balance logic
 * verbatim (buildRegisterEntries_, applyRegisterRunningBalance_,
 * getLatestBalanceHistoryValue_) rather than reimplementing it —
 * that logic was originally a full afternoon of debugging to get
 * right (duplicate rows, wrong balances) and is the same code the
 * Sheets-side Register tab uses.
 */
function apiGetRegister_(payload) {
  const accountName = String(payload.account || "").trim();

  if (!accountName) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Choose an account."
    };
  }

  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();
  const entries = buildRegisterEntries_(manual, source, accountName);

  let bankBalance;

  try {
    bankBalance = getLatestBalanceHistoryValue_(accountName);
  } catch (err) {
    // Manual-only account with no Tiller sync history — start from 0
    // rather than fail the whole request.
    bankBalance = 0;
  }

  const projectedBalance = entries.length > 0
    ? applyRegisterRunningBalance_(entries, bankBalance)
    : bankBalance;

  const statusFilter = String(payload.status || "All").trim();
  const ENTRY_LIMIT = 150;

  const filteredEntries = entries
    .slice()
    .sort(function(a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA !== dateB ? dateB - dateA : 0; // newest first, matches Sheets Register
    })
    .filter(function(entry) {
      return statusFilter === "All" || entry.status === statusFilter;
    });

  // The balance math above needs the FULL history (the backward pass
  // derives the implied starting balance from every cleared entry ever
  // recorded), but this account has 2 years of Tiller-synced history —
  // thousands of rows, a multi-MB payload if returned whole. Only the
  // most recent window is actually useful to look at, so the response
  // is capped here, after the balance calculation, not before it.
  const displayEntries = filteredEntries
    .slice(0, ENTRY_LIMIT)
    .map(function(entry) {
      return {
        transactionId: entry.transactionId || "",
        date: entry.date instanceof Date
          ? Utilities.formatDate(entry.date, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(entry.date),
        payee: entry.payee,
        category: entry.category,
        subcategory: entry.subcategory,
        paymentMethod: entry.paymentMethod,
        amount: entry.amount,
        runningBalance: entry.runningBalance,
        status: entry.status,
        source: entry.source,
        notes: entry.notes
      };
    });

  return {
    ok: true,
    data: {
      account: accountName,
      bankBalance: bankBalance,
      projectedBalance: projectedBalance,
      entries: displayEntries,
      totalCount: filteredEntries.length,
      truncated: filteredEntries.length > ENTRY_LIMIT
    }
  };
}




/* ============================================================
   Register mutations — updateTransaction / deleteTransaction /
   updateTransactionStatus / matchTransaction

   All four locate the row fresh via findManualTransactionRowById_
   on every call rather than trusting a row number from the client —
   Register is a derived/cached view, so the underlying sheet may
   have changed since the client last fetched it.
============================================================ */

function apiUpdateTransaction_(payload) {
  const transactionId = String(payload.transactionId || "").trim();

  if (!transactionId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing transaction ID." };
  }

  const built = buildTransactionValues_(payload);

  if (built.errors.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Entry could not be saved.",
      fieldErrors: built.errors
    };
  }

  const values = built.values;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const dataSheet = getManualTransactionsSheet_();
    const rowNumber = findManualTransactionRowById_(transactionId);

    if (!rowNumber) {
      return {
        ok: false,
        code: "NOT_FOUND",
        error: "That transaction could not be found — it may have been deleted or already changed."
      };
    }

    const existing = dataSheet
      .getRange(rowNumber, 1, 1, dataSheet.getLastColumn())
      .getValues()[0];

    const output = new Array(dataSheet.getLastColumn()).fill("");

    output[0] = transactionId;
    output[1] = values.date;
    output[2] = values.account;
    output[3] = values.payee;
    output[4] = values.amount;
    output[5] = values.category;
    output[6] = existing[6] || ""; // legacy "Business Area" column, preserved as-is
    output[7] = values.paymentMethod;
    output[8] = values.notes;
    output[9] = existing[9] || "Manual";
    output[10] = existing[10] || "Uncleared";
    output[11] = existing[11] || "";
    output[12] = existing[12] || "";
    output[13] = existing[13] || values.enteredBy;
    output[14] = new Date();

    for (let index = 15; index < existing.length; index++) {
      output[index] = existing[index];
    }

    // Set after the preserve-loop above (real Subcategory column lives
    // at the end, index 17, so it would otherwise get clobbered back
    // to its old value by that loop).
    output[getManualTransactionSubcategoryColumn_(dataSheet)] = values.subcategory;

    dataSheet.getRange(rowNumber, 1, 1, output.length).setValues([output]);

    invalidateDashboardCache_();

    return {
      ok: true,
      data: {
        transactionId: transactionId,
        amount: values.amount,
        type: values.transactionType
      }
    };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteTransaction_(payload) {
  const transactionId = String(payload.transactionId || "").trim();

  if (!transactionId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing transaction ID." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const dataSheet = getManualTransactionsSheet_();
    const rowNumber = findManualTransactionRowById_(transactionId);

    if (!rowNumber) {
      return {
        ok: false,
        code: "NOT_FOUND",
        error: "That transaction could not be found — it may have already been deleted."
      };
    }

    dataSheet.deleteRow(rowNumber);

    invalidateDashboardCache_();

    return { ok: true, data: { transactionId: transactionId } };
  } finally {
    lock.releaseLock();
  }
}


const GM_VALID_STATUSES_ = ["Uncleared", "Cleared", "Reconciled"];

function apiUpdateTransactionStatus_(payload) {
  const transactionId = String(payload.transactionId || "").trim();
  const status = String(payload.status || "").trim();

  if (!transactionId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing transaction ID." };
  }

  if (GM_VALID_STATUSES_.indexOf(status) === -1) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Status must be one of: " + GM_VALID_STATUSES_.join(", ") + "."
    };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const dataSheet = getManualTransactionsSheet_();
    const rowNumber = findManualTransactionRowById_(transactionId);

    if (!rowNumber) {
      return { ok: false, code: "NOT_FOUND", error: "That transaction could not be found." };
    }

    dataSheet.getRange(rowNumber, 11).setValue(status); // column 11 = Status

    invalidateDashboardCache_();

    return { ok: true, data: { transactionId: transactionId, status: status } };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Links a manual transaction to a bank-fed transaction it duplicates,
 * so the bank row stops appearing as a separate entry in Register.
 * Mirrors matchSelectedRegisterTransactions_'s core write (Status =
 * "Cleared" + Matched Bank Key) without the sheet-UI range-selection
 * part, which has no API equivalent. The bank key is always computed
 * server-side via buildTransactionKey_, never trusted from the client.
 *
 * Per CLAUDE.md, merchant memory must learn BOTH the clean manual
 * payee text and the messy raw bank description here — teaching only
 * one side was a real bug in the original build.
 */
function apiMatchTransaction_(payload) {
  const transactionId = String(payload.transactionId || "").trim();
  const bankDate = payload.bankDate;
  const bankDescription = String(payload.bankDescription || "");
  const bankAmount = Number(payload.bankAmount);
  const bankAccount = String(payload.bankAccount || "");

  if (!transactionId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing transaction ID." };
  }

  if (!bankDate || !bankDescription || !bankAccount || !isFinite(bankAmount)) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing bank transaction details to match against." };
  }

  const bankKey = buildTransactionKey_(bankDate, bankDescription, bankAmount, bankAccount);
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const dataSheet = getManualTransactionsSheet_();
    const rowNumber = findManualTransactionRowById_(transactionId);

    if (!rowNumber) {
      return { ok: false, code: "NOT_FOUND", error: "That transaction could not be found." };
    }

    const row = dataSheet.getRange(rowNumber, 1, 1, dataSheet.getLastColumn()).getValues()[0];
    const subcategoryColumn = getManualTransactionSubcategoryColumn_(dataSheet);

    dataSheet.getRange(rowNumber, 11).setValue("Cleared");  // Status
    dataSheet.getRange(rowNumber, 12).setValue(bankKey);    // Matched Bank Key

    try {
      if (typeof learnMerchant_ === "function") {
        learnMerchant_(row[3], row[5], row[subcategoryColumn]);       // clean manual payee
        learnMerchant_(bankDescription, row[5], row[subcategoryColumn]); // messy bank description
      }
    } catch (learnError) {
      console.error("Merchant learning failed during match: " + learnError.message);
    }

    invalidateDashboardCache_();

    return { ok: true, data: { transactionId: transactionId, bankKey: bankKey } };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   Bank review — getReviewTransactions / approveTransaction
============================================================ */

/**
 * Mirrors addBankReviewRecords_'s exact filter (Transactions.gs): a
 * bank-fed transaction needs review if its Category is blank or
 * "uncategorized" and it hasn't already been approved.
 */
function apiGetReviewTransactions_() {
  const source = getTillerTransactionsSheet_();
  const sourceValues = source.getDataRange().getValues();

  if (sourceValues.length < 2) {
    return [];
  }

  const sourceMap = getHeaderMap_(sourceValues[0]);
  requireHeaders_(sourceMap, ["Date", "Description", "Amount", "Account", "Category"]);

  const approvedKeys = getApprovedTransactionKeys_();
  const results = [];

  for (let rowIndex = 1; rowIndex < sourceValues.length; rowIndex++) {
    const row = sourceValues[rowIndex];
    const category = String(row[sourceMap.Category] || "").trim();

    if (category !== "" && category.toLowerCase() !== "uncategorized") {
      continue;
    }

    const transactionKey = buildTransactionKey_(
      row[sourceMap.Date],
      row[sourceMap.Description],
      row[sourceMap.Amount],
      row[sourceMap.Account]
    );

    if (approvedKeys.has(transactionKey)) {
      continue;
    }

    results.push({
      sourceRow: rowIndex + 1,
      date: row[sourceMap.Date] instanceof Date
        ? Utilities.formatDate(row[sourceMap.Date], Session.getScriptTimeZone(), "yyyy-MM-dd")
        : String(row[sourceMap.Date]),
      description: String(row[sourceMap.Description] || ""),
      amount: Number(row[sourceMap.Amount] || 0),
      account: String(row[sourceMap.Account] || ""),
      transactionKey: transactionKey
    });
  }

  return results;
}


/**
 * Reuses approveBankReviewTransaction_ verbatim (auto-registers the
 * category into Tiller's own Categories sheet, writes back Category/
 * Categorized By/Categorized Date, saves GM_TransactionMeta, teaches
 * merchant memory) — description and transactionKey are derived from
 * the actual Tiller row here, never trusted from the client.
 */
function apiApproveTransaction_(payload) {
  const sourceRow = Number(payload.sourceRow);
  const category = String(payload.category || "").trim();
  const subcategory = String(payload.subcategory || "").trim();
  const notes = String(payload.notes || "").trim().slice(0, 1000);

  if (!isFinite(sourceRow) || sourceRow < 2) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing or invalid source row." };
  }

  if (!category) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Choose a category." };
  }

  const validCategories = getConfiguredCategoryNames_();

  if (validCategories.indexOf(category) === -1) {
    return { ok: false, code: "VALIDATION_ERROR", error: 'Unknown category: "' + category + '".' };
  }

  if (subcategory) {
    const validSubs = getConfiguredSubcategoryNames_(category);

    if (validSubs.indexOf(subcategory) === -1) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: '"' + subcategory + '" is not a subcategory of "' + category + '".'
      };
    }
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const source = getTillerTransactionsSheet_();

    if (sourceRow > source.getLastRow()) {
      return {
        ok: false,
        code: "NOT_FOUND",
        error: "That transaction could not be found — it may have already been reviewed."
      };
    }

    const sourceHeaders = source.getRange(1, 1, 1, source.getLastColumn()).getValues()[0];
    const sourceMap = getHeaderMap_(sourceHeaders);
    requireHeaders_(sourceMap, ["Date", "Description", "Amount", "Account", "Category"]);

    const row = source.getRange(sourceRow, 1, 1, source.getLastColumn()).getValues()[0];
    const description = String(row[sourceMap.Description] || "").trim();
    const transactionKey = buildTransactionKey_(
      row[sourceMap.Date],
      row[sourceMap.Description],
      row[sourceMap.Amount],
      row[sourceMap.Account]
    );

    const errors = [];
    const approved = approveBankReviewTransaction_(
      source, sourceMap, sourceRow, sourceRow,
      description, category, subcategory, notes, transactionKey, errors
    );

    if (!approved) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: errors.join(" ") || "Could not approve this transaction."
      };
    }

    invalidateDashboardCache_();

    return { ok: true, data: { sourceRow: sourceRow, transactionKey: transactionKey } };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   getDashboard
============================================================ */

/**
 * Reuses getLatestAccountBalances_ (Dashboard.gs), buildRegisterEntries_
 * (Register.gs, empty accountName = all accounts, same as the original
 * Sheets dashboard's own getManualDashboardSummary_), and this file's
 * own apiGetReviewTransactions_ for the pending-review count (avoids a
 * second, redundant full scan of the Tiller sheet, and guarantees this
 * count always matches what the Review tab actually shows).
 *
 * Deliberately does NOT port forward a bug found in the original
 * getManualDashboardSummary_ (Dashboard.gs): it derives Income/Expenses
 * This Month from the raw sign of the amount rather than
 * getConfiguredCategoryType_(entry.category), which CLAUDE.md explicitly
 * calls out as wrong (a refund on an expense category should still
 * count as that category's spending, not income). This version uses
 * getConfiguredCategoryType_, the same function apiCreateTransaction_
 * already uses correctly.
 */
/* ============================================================
   Dashboard cache

   getDashboard's underlying computation merges the FULL manual +
   Tiller transaction history (thousands of rows, ~2 years of real
   data) every time it runs -- confirmed the original Sheets Dashboard
   (getManualDashboardSummary_, Dashboard.gs) does the exact same full
   merge, but only ever runs it on-demand via a menu click, then shows
   already-computed cell values on every subsequent view. This API
   recomputes from scratch on every single request with no equivalent
   cache, which is the real reason it feels slower than Sheets did --
   not a difference in how much data gets scanned. A short-TTL cache
   here reproduces that same "compute once, view many times" feel.
   Invalidated proactively by every mutation that could change the
   numbers, so it can never show stale data after a real change --
   the TTL only matters for repeat views with nothing changed.
============================================================ */

const DASHBOARD_CACHE_KEY = "gm_dashboard_v1";
const DASHBOARD_CACHE_TTL_SECONDS = 300;

function invalidateDashboardCache_() {
  CacheService.getScriptCache().remove(DASHBOARD_CACHE_KEY);
}

function apiGetDashboard_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(DASHBOARD_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = buildDashboardData_();
  cache.put(DASHBOARD_CACHE_KEY, JSON.stringify(result), DASHBOARD_CACHE_TTL_SECONDS);
  return result;
}


function buildDashboardData_() {
  const balances = getLatestAccountBalances_();
  const currentCash = balances.reduce(function(sum, b) { return sum + b.balance; }, 0);

  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();
  const entries = buildRegisterEntries_(manual, source, "");

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let incomeThisMonth = 0;
  let expensesThisMonth = 0;
  let unclearedNet = 0;
  let unclearedCount = 0;

  entries.forEach(function(entry) {
    const date = entry.date instanceof Date ? entry.date : new Date(entry.date);
    const status = String(entry.status || "").trim().toLowerCase();

    if (!isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year) {
      const type = getConfiguredCategoryType_(entry.category);

      if (type === "Income") {
        incomeThisMonth += Math.abs(entry.amount);
      } else {
        expensesThisMonth += Math.abs(entry.amount);
      }
    }

    if (status === "uncleared") {
      unclearedNet += entry.amount;
      unclearedCount++;
    }
  });

  const recentTransactions = entries
    .slice()
    .sort(function(a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA !== dateB ? dateB - dateA : 0;
    })
    .slice(0, 8)
    .map(function(entry) {
      return {
        date: entry.date instanceof Date
          ? Utilities.formatDate(entry.date, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(entry.date),
        payee: entry.payee,
        category: entry.category,
        subcategory: entry.subcategory,
        amount: entry.amount,
        status: entry.status,
        account: entry.account
      };
    });

  const pendingReviewCount = apiGetReviewTransactions_().length;

  // Groups the SAME `entries` already computed above for the
  // income/expense totals, rather than calling
  // getEntryMonthlySpendingByCategory_() (which would redundantly
  // re-fetch both sheets and re-run the full buildRegisterEntries_
  // merge a second time in this same request). Same current-month
  // grouping, same category-type filter (Expense only, via
  // getConfiguredCategoryType_, not raw amount sign), same
  // "Category: Subcategory" chart labels as that helper -- money's own
  // home page (per the screenshot the user shared) puts this
  // "Spending by category" pie chart on the home screen, not a
  // separate Reports screen.
  const categoryTotals = {};
  // Category-only totals (ignoring subcategory) for budget comparison --
  // a separate accumulator from categoryTotals above, since budgets are
  // per-category, not per "Category: Subcategory" label. Same entries
  // walk, no extra sheet reads.
  const categoryOnlyTotals = {};

  entries.forEach(function(entry) {
    const date = entry.date instanceof Date ? entry.date : new Date(entry.date);

    if (isNaN(date.getTime()) || date.getMonth() !== month || date.getFullYear() !== year) {
      return;
    }

    const category = String(entry.category || "Uncategorized").trim() || "Uncategorized";

    if (getConfiguredCategoryType_(category) !== "Expense") {
      return;
    }

    const amount = Math.abs(Number(entry.amount || 0));
    const label = buildEntryChartGroupLabel_(category, entry.subcategory);
    categoryTotals[label] = (categoryTotals[label] || 0) + amount;
    categoryOnlyTotals[category] = (categoryOnlyTotals[category] || 0) + amount;
  });

  const spendingByCategory = Object.keys(categoryTotals)
    .map(function(category) {
      return { category: category, amount: categoryTotals[category] };
    })
    .filter(function(row) {
      return row.amount > 0.004;
    })
    .sort(function(a, b) {
      return b.amount - a.amount;
    });

  const budgetProgress = apiGetBudgets_().map(function(budget) {
    return {
      category: budget.category,
      budgeted: budget.monthlyBudget,
      spent: categoryOnlyTotals[budget.category] || 0
    };
  });

  return {
    currentCash: currentCash,
    projectedCash: currentCash + unclearedNet,
    incomeThisMonth: incomeThisMonth,
    expensesThisMonth: expensesThisMonth,
    pendingReviewCount: pendingReviewCount,
    unclearedCount: unclearedCount,
    accountBalances: balances.map(function(b) {
      return { account: b.account, balance: b.balance };
    }),
    recentTransactions: recentTransactions,
    spendingByCategory: spendingByCategory,
    budgetProgress: budgetProgress
  };
}


/* ============================================================
   Settings — Category / Subcategory / Payment Method management

   The Settings sheet stores Categories (A4:C100), Payment Methods
   (D4:D100), Transaction Types (F4:F20), and Frequencies (H4:H20) as
   different COLUMN ranges on the SAME physical rows — not separate
   sheets. Never use sheet.deleteRow()/insertRow() here: a whole-row
   operation would shift every other column's list too. Every write
   below follows the existing sortCategoriesAlphabetically() pattern:
   read the full range, modify the in-memory array, clearContent()
   that exact range, write the array back — scoped to one column range
   at a time, always compacted (no gaps, since every reader stops at
   the first blank cell).
============================================================ */

const GM_CATEGORY_ROW_LIMIT_ = 96;

function getSettingsSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GM.SHEETS.SETTINGS);

  if (!sheet) {
    throw new Error("Settings sheet not found.");
  }

  return sheet;
}


function writeCategoryStructure_(sheet, rows) {
  const sorted = sortCategoryStructure_(rows);

  sheet.getRange("A4:C100").clearContent();

  if (sorted.length > 0) {
    sheet.getRange(4, 1, Math.min(sorted.length, 97), 3).setValues(sorted.slice(0, 97));
  }
}


function countManualTransactionCategoryUsage_(category, subcategory) {
  const sheet = getManualTransactionsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const map = getHeaderMap_(values[0]);
  const subcategoryColumn = getManualTransactionSubcategoryColumn_(sheet);
  const cleanCategory = category.toLowerCase();
  const cleanSubcategory = subcategory ? subcategory.toLowerCase() : "";

  let count = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    if (String(row[map.Category] || "").trim().toLowerCase() !== cleanCategory) {
      continue;
    }

    if (cleanSubcategory) {
      const rowSubcategory = String(row[subcategoryColumn] || "").trim().toLowerCase();
      if (rowSubcategory !== cleanSubcategory) {
        continue;
      }
    }

    count++;
  }

  return count;
}


function countTillerCategoryUsage_(category) {
  const source = getTillerTransactionsSheet_();
  const values = source.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const map = getHeaderMap_(values[0]);
  const cleanCategory = category.toLowerCase();
  let count = 0;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][map.Category] || "").trim().toLowerCase() === cleanCategory) {
      count++;
    }
  }

  return count;
}


function countTransactionMetaSubcategoryUsage_(subcategory) {
  const metaSheet = getTransactionMetadataSheet_();
  const values = metaSheet.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const map = getHeaderMap_(values[0]);
  const cleanSubcategory = subcategory.toLowerCase();
  let count = 0;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][map.Subcategory] || "").trim().toLowerCase() === cleanSubcategory) {
      count++;
    }
  }

  return count;
}


function apiAddCategory_(payload) {
  const name = String(payload.name || "").trim();
  const type = String(payload.type || "").trim();

  if (!name) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Enter a category name." };
  }

  if (type !== "Income" && type !== "Expense") {
    return { ok: false, code: "VALIDATION_ERROR", error: "Choose Income or Expense." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getSettingsSheet_();
    const rows = getConfiguredCategoryStructure_();

    const exists = rows.some(function(row) {
      return String(row[0] || "").trim().toLowerCase() === name.toLowerCase();
    });

    if (exists) {
      return { ok: false, code: "VALIDATION_ERROR", error: 'Category "' + name + '" already exists.' };
    }

    if (rows.length >= GM_CATEGORY_ROW_LIMIT_) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: "The category list is full. Remove something before adding more."
      };
    }

    rows.push([name, "", type]);
    writeCategoryStructure_(sheet, rows);

    return { ok: true, data: { name: name, type: type } };
  } finally {
    lock.releaseLock();
  }
}


function apiAddSubcategory_(payload) {
  const category = String(payload.category || "").trim();
  const subcategory = String(payload.subcategory || "").trim();

  if (!category) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Choose a category." };
  }

  if (!subcategory) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Enter a subcategory name." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getSettingsSheet_();
    const rows = getConfiguredCategoryStructure_();

    const categoryExists = rows.some(function(row) {
      return String(row[0] || "").trim().toLowerCase() === category.toLowerCase();
    });

    if (!categoryExists) {
      return { ok: false, code: "VALIDATION_ERROR", error: 'Unknown category: "' + category + '".' };
    }

    const subcategoryExists = rows.some(function(row) {
      return String(row[0] || "").trim().toLowerCase() === category.toLowerCase() &&
        String(row[1] || "").trim().toLowerCase() === subcategory.toLowerCase();
    });

    if (subcategoryExists) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: '"' + subcategory + '" already exists under "' + category + '".'
      };
    }

    if (rows.length >= GM_CATEGORY_ROW_LIMIT_) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        error: "The category list is full. Remove something before adding more."
      };
    }

    const type = getConfiguredCategoryType_(category);
    rows.push([category, subcategory, type]);
    writeCategoryStructure_(sheet, rows);

    return { ok: true, data: { category: category, subcategory: subcategory } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteSubcategory_(payload) {
  const category = String(payload.category || "").trim();
  const subcategory = String(payload.subcategory || "").trim();

  if (!category || !subcategory) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing category or subcategory." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const manualUsage = countManualTransactionCategoryUsage_(category, subcategory);
    const metaUsage = countTransactionMetaSubcategoryUsage_(subcategory);
    const totalUsage = manualUsage + metaUsage;

    if (totalUsage > 0) {
      return {
        ok: false,
        code: "IN_USE",
        error: totalUsage + " transaction" + (totalUsage === 1 ? "" : "s") +
          " use this subcategory — remove or recategorize them first."
      };
    }

    const sheet = getSettingsSheet_();
    const rows = getConfiguredCategoryStructure_().filter(function(row) {
      return !(
        String(row[0] || "").trim().toLowerCase() === category.toLowerCase() &&
        String(row[1] || "").trim().toLowerCase() === subcategory.toLowerCase()
      );
    });

    writeCategoryStructure_(sheet, rows);

    return { ok: true, data: { category: category, subcategory: subcategory } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteCategory_(payload) {
  const category = String(payload.category || "").trim();

  if (!category) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing category." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const manualUsage = countManualTransactionCategoryUsage_(category, "");
    const tillerUsage = countTillerCategoryUsage_(category);
    const totalUsage = manualUsage + tillerUsage;

    if (totalUsage > 0) {
      return {
        ok: false,
        code: "IN_USE",
        error: totalUsage + " transaction" + (totalUsage === 1 ? "" : "s") +
          " use this category — remove or recategorize them first."
      };
    }

    const sheet = getSettingsSheet_();
    const rows = getConfiguredCategoryStructure_().filter(function(row) {
      return String(row[0] || "").trim().toLowerCase() !== category.toLowerCase();
    });

    writeCategoryStructure_(sheet, rows);

    return { ok: true, data: { category: category } };
  } finally {
    lock.releaseLock();
  }
}


function apiAddPaymentMethod_(payload) {
  const name = String(payload.name || "").trim();

  if (!name) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Enter a payment method name." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const existing = getConfiguredPaymentMethods_();

    const exists = existing.some(function(v) {
      return v.toLowerCase() === name.toLowerCase();
    });

    if (exists) {
      return { ok: false, code: "VALIDATION_ERROR", error: 'Payment method "' + name + '" already exists.' };
    }

    const range = getSettingsListRange_("Payment Methods");
    const values = range.getValues();
    let targetRow = -1;

    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === "") {
        targetRow = i;
        break;
      }
    }

    if (targetRow === -1) {
      return { ok: false, code: "VALIDATION_ERROR", error: "The payment methods list is full." };
    }

    const sheet = getSettingsSheet_();
    sheet.getRange(4 + targetRow, 4).setValue(name);

    return { ok: true, data: { name: name } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeletePaymentMethod_(payload) {
  const name = String(payload.name || "").trim();

  if (!name) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing payment method name." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const manualSheet = getManualTransactionsSheet_();
    const manualValues = manualSheet.getDataRange().getValues();
    let usage = 0;

    if (manualValues.length >= 2) {
      const map = getHeaderMap_(manualValues[0]);

      for (let i = 1; i < manualValues.length; i++) {
        if (String(manualValues[i][map["Payment Method"]] || "").trim().toLowerCase() === name.toLowerCase()) {
          usage++;
        }
      }
    }

    if (usage > 0) {
      return {
        ok: false,
        code: "IN_USE",
        error: usage + " transaction" + (usage === 1 ? "" : "s") +
          " use this payment method — remove or change them first."
      };
    }

    const range = getSettingsListRange_("Payment Methods");
    const values = range.getValues().map(function(row) { return row[0]; });

    const filtered = values.filter(function(v) {
      return String(v || "").trim().toLowerCase() !== name.toLowerCase();
    });

    const sheet = getSettingsSheet_();
    sheet.getRange("D4:D100").clearContent();

    if (filtered.length > 0) {
      const out = filtered
        .filter(function(v) { return String(v || "").trim() !== ""; })
        .map(function(v) { return [v]; });

      if (out.length > 0) {
        sheet.getRange(4, 4, out.length, 1).setValues(out);
      }
    }

    return { ok: true, data: { name: name } };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   Scheduled (recurring) transactions

   Recurrence definitions live in their own dedicated hidden sheet
   (GM_RecurringTransactions, via getRecurringTransactionsSheet_) --
   a separate sheet, not sharing rows/columns with anything else, so
   deleteRow() is safe here (unlike the Settings sheet).

   Generation itself is NOT reimplemented -- it's already fully
   automated server-side (a daily trigger calling
   processDueScheduledTransactionsForSpreadsheet_, Automation.gs) and
   this file only exposes a thin wrapper to run it on demand. This
   milestone only manages the recurrence definitions.

   Unlike the original saveScheduledTransaction() (which accepts a
   raw, already-signed Amount typed directly into a cell with no
   category-type check at all), every write here takes an UNSIGNED
   amount and derives the sign from getConfiguredCategoryType_ --
   same anti-mismatch principle as apiCreateTransaction_.
============================================================ */

function apiGetScheduledTransactions_() {
  const sheet = getRecurringTransactionsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const map = getHeaderMap_(values[0]);

  return values.slice(1).map(function(row) {
    const nextDue = row[map["Next Due"]];

    return {
      scheduleId: String(row[map["Schedule ID"]] || ""),
      payee: String(row[map.Payee] || ""),
      amount: Number(row[map.Amount] || 0),
      account: String(row[map.Account] || ""),
      category: String(row[map.Category] || ""),
      subcategory: String(row[map.Subcategory] || ""),
      paymentMethod: String(row[map["Payment Method"]] || ""),
      frequency: String(row[map.Frequency] || ""),
      nextDue: nextDue instanceof Date
        ? Utilities.formatDate(nextDue, Session.getScriptTimeZone(), "yyyy-MM-dd")
        : String(nextDue || ""),
      active: String(row[map.Active] || "").trim() === "Yes",
      autoCreate: String(row[map["Auto Create"]] || "").trim() === "Yes",
      notes: String(row[map.Notes] || "")
    };
  });
}


function buildScheduledTransactionValues_(payload) {
  const errors = [];

  const payee = String(payload.payee || "").trim().slice(0, 200);
  if (!payee) {
    errors.push("Enter a payee.");
  }

  const enteredAmount = Number(payload.amount);
  if (!isFinite(enteredAmount) || enteredAmount <= 0) {
    errors.push("Enter an amount greater than zero.");
  }

  const account = String(payload.account || "").trim();
  const accounts = getEntryAccountNames_();
  if (!account) {
    errors.push("Choose an account.");
  } else if (accounts.indexOf(account) === -1) {
    errors.push('Unknown account: "' + account + '".');
  }

  const category = String(payload.category || "").trim();
  const validCategories = getConfiguredCategoryNames_();
  if (!category) {
    errors.push("Choose a category.");
  } else if (validCategories.indexOf(category) === -1) {
    errors.push('Unknown category: "' + category + '".');
  }

  const subcategory = String(payload.subcategory || "").trim();
  if (subcategory && category) {
    const validSubs = getConfiguredSubcategoryNames_(category);
    if (validSubs.indexOf(subcategory) === -1) {
      errors.push('"' + subcategory + '" is not a subcategory of "' + category + '".');
    }
  }

  const paymentMethod = String(payload.paymentMethod || "").trim();
  const validMethods = getConfiguredPaymentMethods_();
  if (!paymentMethod) {
    errors.push("Choose a payment method.");
  } else if (validMethods.indexOf(paymentMethod) === -1) {
    errors.push('Unknown payment method: "' + paymentMethod + '".');
  }

  const frequency = String(payload.frequency || "").trim();
  if (GM.RECURRING_FREQUENCIES.indexOf(frequency) === -1) {
    errors.push("Choose a valid frequency.");
  }

  const nextDue = parseDateOnly_(payload.nextDue);
  if (!nextDue) {
    errors.push("Enter a valid next due date.");
  }

  const active = payload.active === false ? "No" : "Yes";
  const autoCreate = payload.autoCreate === true ? "Yes" : "No";
  const notes = String(payload.notes || "").trim().slice(0, 1000);

  if (errors.length > 0) {
    return { errors: errors };
  }

  const type = getConfiguredCategoryType_(category);
  const signedAmount = type === "Income" ? Math.abs(enteredAmount) : -Math.abs(enteredAmount);

  return {
    errors: [],
    values: {
      payee: payee,
      amount: signedAmount,
      account: account,
      category: category,
      subcategory: subcategory,
      paymentMethod: paymentMethod,
      frequency: frequency,
      nextDue: nextDue,
      active: active,
      autoCreate: autoCreate,
      notes: notes
    }
  };
}


function apiCreateScheduledTransaction_(payload) {
  const built = buildScheduledTransactionValues_(payload);

  if (built.errors.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Could not save.", fieldErrors: built.errors };
  }

  const values = built.values;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getRecurringTransactionsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = getHeaderMap_(headers);

    const scheduleId = createRecurringTransactionId_();
    const row = new Array(sheet.getLastColumn()).fill("");

    row[map["Schedule ID"]] = scheduleId;
    row[map.Payee] = values.payee;
    row[map.Amount] = values.amount;
    row[map.Account] = values.account;
    row[map.Category] = values.category;
    row[map.Subcategory] = values.subcategory;
    row[map["Payment Method"]] = values.paymentMethod;
    row[map.Frequency] = values.frequency;
    row[map["Next Due"]] = values.nextDue;
    row[map.Active] = values.active;
    row[map["Auto Create"]] = values.autoCreate;
    row[map.Notes] = values.notes;
    row[map["Updated By"]] = "Web App";
    row[map["Updated At"]] = new Date();

    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

    return { ok: true, data: { scheduleId: scheduleId } };
  } finally {
    lock.releaseLock();
  }
}


function apiUpdateScheduledTransaction_(payload) {
  const scheduleId = String(payload.scheduleId || "").trim();

  if (!scheduleId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing schedule ID." };
  }

  const built = buildScheduledTransactionValues_(payload);

  if (built.errors.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Could not save.", fieldErrors: built.errors };
  }

  const values = built.values;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getRecurringTransactionsSheet_();
    const rowNumber = findRecurringTransactionRowById_(scheduleId);

    if (!rowNumber) {
      return { ok: false, code: "NOT_FOUND", error: "That scheduled transaction could not be found." };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = getHeaderMap_(headers);
    const existing = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

    existing[map.Payee] = values.payee;
    existing[map.Amount] = values.amount;
    existing[map.Account] = values.account;
    existing[map.Category] = values.category;
    existing[map.Subcategory] = values.subcategory;
    existing[map["Payment Method"]] = values.paymentMethod;
    existing[map.Frequency] = values.frequency;
    existing[map["Next Due"]] = values.nextDue;
    existing[map.Active] = values.active;
    existing[map["Auto Create"]] = values.autoCreate;
    existing[map.Notes] = values.notes;
    existing[map["Updated By"]] = "Web App";
    existing[map["Updated At"]] = new Date();

    sheet.getRange(rowNumber, 1, 1, existing.length).setValues([existing]);

    return { ok: true, data: { scheduleId: scheduleId } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteScheduledTransaction_(payload) {
  const scheduleId = String(payload.scheduleId || "").trim();

  if (!scheduleId) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing schedule ID." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getRecurringTransactionsSheet_();
    const rowNumber = findRecurringTransactionRowById_(scheduleId);

    if (!rowNumber) {
      return { ok: false, code: "NOT_FOUND", error: "That scheduled transaction could not be found." };
    }

    sheet.deleteRow(rowNumber);

    return { ok: true, data: { scheduleId: scheduleId } };
  } finally {
    lock.releaseLock();
  }
}


function apiProcessScheduledTransactionsNow_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    processDueScheduledTransactionsForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    invalidateDashboardCache_();
    return { ok: true, data: { processed: true } };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   Merchant Memory

   Records (GM_MerchantMemory, via getMerchantMemorySheet_) are only
   ever created by learnMerchant_() -- transaction entry, bank-review
   approval, and register matching all already teach it (see
   apiMatchTransaction_/apiApproveTransaction_ above). There is no
   "add a merchant manually" path here, matching the Sheets-side
   Merchant Manager, which only ever edits/locks/unlocks/deletes/
   rebuilds existing rows.

   Reused verbatim from MerchantMemory.gs: lockMerchantMemory_,
   unlockMerchantMemory_, deleteMerchantMemory_, rebuildMerchantMemory_
   -- all operate on an already-normalized Merchant Key, and
   normalizeMerchantKey_ is idempotent, so passing a stored
   merchantKey straight through is safe. The list/search/filter/sort
   logic mirrors refreshMerchantManager_ (MerchantManager.gs) headless
   -- same filter values, same status logic (merchantManagerStatus_),
   same sort (locked first, then confidence desc, then name) -- but
   returns JSON instead of writing to the hidden Sheets-UI sheet.
============================================================ */

function apiGetMerchantMemory_(payload) {
  const sheet = getMerchantMemorySheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return { ok: true, data: { records: [], stats: { merchants: 0, autoLearned: 0, locked: 0 } } };
  }

  const map = getHeaderMap_(values[0]);

  const records = values.slice(1)
    .filter(function(row) {
      return String(row[map["Merchant Key"]] || "").trim() !== "";
    })
    .map(function(row) {
      const confidence = Number(row[map.Confidence] || 0);
      const locked = String(row[map.Locked] || "").trim().toLowerCase() === "yes";
      const firstSeen = row[map["First Seen"]];
      const lastSeen = row[map["Last Seen"]];

      return {
        merchantKey: String(row[map["Merchant Key"]] || "").trim(),
        merchant: String(row[map["Preferred Merchant"]] || "").trim(),
        category: String(row[map.Category] || "").trim(),
        subcategory: String(row[map.Subcategory] || "").trim(),
        timesUsed: Number(row[map["Times Used"]] || 0),
        firstSeen: firstSeen instanceof Date
          ? Utilities.formatDate(firstSeen, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(firstSeen || ""),
        lastSeen: lastSeen instanceof Date
          ? Utilities.formatDate(lastSeen, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(lastSeen || ""),
        confidence: confidence,
        locked: locked,
        status: merchantManagerStatus_(confidence, locked)
      };
    });

  const stats = {
    merchants: records.length,
    autoLearned: records.filter(function(r) { return r.confidence >= GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE; }).length,
    locked: records.filter(function(r) { return r.locked; }).length
  };

  const searchText = normalizeMerchantManagerSearch_(payload.search || "");
  const filter = String(payload.filter || "All").trim();

  const filtered = records.filter(function(record) {
    if (searchText) {
      const haystack = normalizeMerchantManagerSearch_(
        [record.merchant, record.merchantKey, record.category, record.subcategory].join(" ")
      );
      if (haystack.indexOf(searchText) === -1) {
        return false;
      }
    }

    if (filter === "Auto-Ready") {
      return record.confidence >= GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE;
    }
    if (filter === "Learning") {
      return record.confidence < GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE;
    }
    if (filter === "Locked") {
      return record.locked;
    }
    return true;
  });

  filtered.sort(function(a, b) {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.merchant.localeCompare(b.merchant);
  });

  return { ok: true, data: { records: filtered, stats: stats } };
}


function apiUpdateMerchantMemory_(payload) {
  const merchantKey = String(payload.merchantKey || "").trim();

  if (!merchantKey) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing merchant key." };
  }

  const errors = [];

  const preferredMerchant = String(payload.preferredMerchant || "").trim().slice(0, 200);
  if (!preferredMerchant) {
    errors.push("Preferred Merchant cannot be blank.");
  }

  const category = String(payload.category || "").trim();
  const validCategories = getConfiguredCategoryNames_();
  if (!category) {
    errors.push("Choose a category.");
  } else if (validCategories.indexOf(category) === -1) {
    errors.push('Unknown category: "' + category + '".');
  }

  const subcategory = String(payload.subcategory || "").trim();
  if (subcategory && category) {
    const validSubs = getConfiguredSubcategoryNames_(category);
    if (validSubs.indexOf(subcategory) === -1) {
      errors.push('"' + subcategory + '" is not a subcategory of "' + category + '".');
    }
  }

  if (errors.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Could not save.", fieldErrors: errors };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getMerchantMemorySheet_();
    const values = sheet.getDataRange().getValues();
    const map = getHeaderMap_(values[0]);

    let targetRow = -1;
    const newKey = normalizeMerchantKey_(preferredMerchant);

    for (let i = 1; i < values.length; i++) {
      const key = String(values[i][map["Merchant Key"]] || "").trim();

      if (key === merchantKey) {
        targetRow = i + 1;
      } else if (key === newKey) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          error: 'Another merchant already uses the key derived from "' + preferredMerchant + '".'
        };
      }
    }

    if (targetRow === -1) {
      return { ok: false, code: "NOT_FOUND", error: "That merchant record could not be found." };
    }

    sheet.getRange(targetRow, map["Merchant Key"] + 1).setValue(newKey);
    sheet.getRange(targetRow, map["Preferred Merchant"] + 1).setValue(preferredMerchant);
    sheet.getRange(targetRow, map.Category + 1).setValue(category);
    sheet.getRange(targetRow, map.Subcategory + 1).setValue(subcategory);
    sheet.getRange(targetRow, map["Last Seen"] + 1).setValue(new Date());

    return { ok: true, data: { merchantKey: newKey } };
  } finally {
    lock.releaseLock();
  }
}


function apiLockMerchantMemory_(payload) {
  const merchantKey = String(payload.merchantKey || "").trim();

  if (!merchantKey) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing merchant key." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const found = lockMerchantMemory_(merchantKey);

    if (!found) {
      return { ok: false, code: "NOT_FOUND", error: "That merchant record could not be found." };
    }

    return { ok: true, data: { merchantKey: merchantKey, locked: true } };
  } finally {
    lock.releaseLock();
  }
}


function apiUnlockMerchantMemory_(payload) {
  const merchantKey = String(payload.merchantKey || "").trim();

  if (!merchantKey) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing merchant key." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const found = unlockMerchantMemory_(merchantKey);

    if (!found) {
      return { ok: false, code: "NOT_FOUND", error: "That merchant record could not be found." };
    }

    return { ok: true, data: { merchantKey: merchantKey, locked: false } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteMerchantMemory_(payload) {
  const merchantKey = String(payload.merchantKey || "").trim();

  if (!merchantKey) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing merchant key." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const found = deleteMerchantMemory_(merchantKey);

    if (!found) {
      return { ok: false, code: "NOT_FOUND", error: "That merchant record could not be found." };
    }

    return { ok: true, data: { merchantKey: merchantKey } };
  } finally {
    lock.releaseLock();
  }
}


function apiRebuildMerchantMemory_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    rebuildMerchantMemory_();
    return { ok: true, data: { rebuilt: true } };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   Budgeting / spending plans

   Entirely new -- no equivalent exists anywhere in the Sheets
   backend (confirmed by grep before planning this milestone).
   GM_Budgets is a dedicated hidden sheet, same pattern as
   GM_MerchantMemory / GM_RecurringTransactions: one row per
   budgeted CATEGORY (never subcategory), Expense-type categories
   only -- Income categories aren't "budgeted" in this model, same
   as Money's own Spending Tracker. A category with no row here
   simply isn't tracked, not "budgeted at $0."
============================================================ */

const GM_BUDGETS = {
  SHEET: "GM_Budgets",
  HEADERS: ["Category", "Monthly Budget", "Updated By", "Updated At"]
};

function getBudgetsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM_BUDGETS.SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(GM_BUDGETS.SHEET);
  }

  ensureSheetHeaders_(sheet, GM_BUDGETS.HEADERS);
  sheet.setFrozenRows(1);

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


function apiGetBudgets_() {
  const sheet = getBudgetsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const map = getHeaderMap_(values[0]);

  return values.slice(1)
    .filter(function(row) {
      return String(row[map.Category] || "").trim() !== "";
    })
    .map(function(row) {
      return {
        category: String(row[map.Category] || "").trim(),
        monthlyBudget: Number(row[map["Monthly Budget"]] || 0)
      };
    });
}


function apiSetBudget_(payload) {
  const category = String(payload.category || "").trim();
  const monthlyBudget = Number(payload.monthlyBudget);

  if (!category) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Choose a category." };
  }

  if (getConfiguredCategoryNames_().indexOf(category) === -1) {
    return { ok: false, code: "VALIDATION_ERROR", error: 'Unknown category: "' + category + '".' };
  }

  if (getConfiguredCategoryType_(category) !== "Expense") {
    return { ok: false, code: "VALIDATION_ERROR", error: "Only Expense categories can have a budget." };
  }

  if (!isFinite(monthlyBudget) || monthlyBudget <= 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Enter a budget amount greater than zero." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getBudgetsSheet_();
    const values = sheet.getDataRange().getValues();
    const map = getHeaderMap_(values[0]);
    const now = new Date();

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][map.Category] || "").trim() === category) {
        const row = i + 1;
        sheet.getRange(row, map["Monthly Budget"] + 1).setValue(monthlyBudget);
        sheet.getRange(row, map["Updated By"] + 1).setValue("Web App");
        sheet.getRange(row, map["Updated At"] + 1).setValue(now);
        invalidateDashboardCache_();
        return { ok: true, data: { category: category, monthlyBudget: monthlyBudget } };
      }
    }

    sheet.appendRow([category, monthlyBudget, "Web App", now]);
    invalidateDashboardCache_();
    return { ok: true, data: { category: category, monthlyBudget: monthlyBudget } };
  } finally {
    lock.releaseLock();
  }
}


function apiDeleteBudget_(payload) {
  const category = String(payload.category || "").trim();

  if (!category) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Missing category." };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const sheet = getBudgetsSheet_();
    const values = sheet.getDataRange().getValues();
    const map = getHeaderMap_(values[0]);

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][map.Category] || "").trim() === category) {
        sheet.deleteRow(i + 1);
        invalidateDashboardCache_();
        return { ok: true, data: { category: category } };
      }
    }

    return { ok: false, code: "NOT_FOUND", error: "That budget could not be found." };
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
   Email notifications

   Entirely new, additive. Free via MailApp -- no new infrastructure,
   sends as the deploying user (matches the web app's own
   "Execute as: Me" config, so it works from anonymous requests the
   same way every other write already does). Push notifications were
   explicitly deferred by the owner (real new infra, and don't work on
   iPhone at all until installed as a PWA) -- email first.

   Recipients are stored as a list, each with their OWN name, email,
   and preferences -- not one shared global setting. This intentionally
   stops short of real per-person login (still one shared app password,
   per the "simple password protection, not full user accounts"
   decision in CLAUDE.md) but lets Phil and Crystal each choose what
   they personally want to be notified about, tied to the same
   Phil/Crystal identity already used for "Entered By" attribution
   elsewhere in the app.

   Adding the first recipient installs a daily time-driven trigger (no
   manual Apps Script editor visit required); removing the last one
   removes the trigger too. The daily digest computes "what's true
   today" (upcoming bills, over-budget categories, low balances,
   yesterday's deposits) ONCE and shares it across recipients, then
   filters per-recipient by their own prefs -- so it never recomputes
   the expensive parts once per person. Only sends to a recipient when
   their own prefs actually produced something to report.
============================================================ */

const GM_NOTIFICATION_RECIPIENTS_PROPERTY = "GM_NOTIFICATION_RECIPIENTS";
const GM_NOTIFICATION_EMAIL_PROPERTY_LEGACY_ = "GM_NOTIFICATION_EMAIL";
const GM_NOTIFICATION_PREFS_PROPERTY_LEGACY_ = "GM_NOTIFICATION_PREFS";
const GM_NOTIFICATION_TRIGGER_HANDLER = "sendDailyNotificationDigest_";
const GM_NOTIFICATION_LOOKAHEAD_DAYS = 3;

function installNotificationTrigger_() {
  const alreadyInstalled = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === GM_NOTIFICATION_TRIGGER_HANDLER;
  });

  if (alreadyInstalled) {
    return;
  }

  ScriptApp.newTrigger(GM_NOTIFICATION_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
}


function removeNotificationTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === GM_NOTIFICATION_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(t);
    }
  });
}


const GM_NOTIFICATION_EMAIL_VALID_ = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GM_NOTIFICATION_PREFS_DEFAULTS_ = {
  upcomingBills: true,
  overBudget: true,
  lowBalance: false,
  lowBalanceThreshold: 100,
  newDeposits: false,
  newDepositThreshold: 0
};

function normalizeNotificationPrefs_(raw) {
  const source = raw || {};
  return {
    upcomingBills: source.upcomingBills !== false,
    overBudget: source.overBudget !== false,
    lowBalance: source.lowBalance === true,
    lowBalanceThreshold: isFinite(Number(source.lowBalanceThreshold)) ? Number(source.lowBalanceThreshold) : 100,
    newDeposits: source.newDeposits === true,
    newDepositThreshold: isFinite(Number(source.newDepositThreshold)) ? Number(source.newDepositThreshold) : 0
  };
}


function saveNotificationRecipients_(recipients) {
  PropertiesService.getScriptProperties().setProperty(
    GM_NOTIFICATION_RECIPIENTS_PROPERTY,
    JSON.stringify(recipients)
  );

  if (recipients.length > 0) {
    installNotificationTrigger_();
  } else {
    removeNotificationTrigger_();
  }
}


// One-time migration from the old shared-email-list-plus-single-prefs
// shape into per-recipient prefs -- existing recipients keep getting
// exactly what they were already getting until someone edits their own
// preferences or name.
function migrateLegacyNotificationSettings_() {
  const props = PropertiesService.getScriptProperties();
  const legacyEmailsRaw = props.getProperty(GM_NOTIFICATION_EMAIL_PROPERTY_LEGACY_);

  if (!legacyEmailsRaw) {
    return [];
  }

  const legacyPrefsRaw = props.getProperty(GM_NOTIFICATION_PREFS_PROPERTY_LEGACY_);
  let legacyPrefs = GM_NOTIFICATION_PREFS_DEFAULTS_;

  if (legacyPrefsRaw) {
    try {
      legacyPrefs = normalizeNotificationPrefs_(JSON.parse(legacyPrefsRaw));
    } catch (err) {
      legacyPrefs = GM_NOTIFICATION_PREFS_DEFAULTS_;
    }
  }

  const emails = legacyEmailsRaw.split(",").map(function(e) { return e.trim(); }).filter(function(e) { return e; });
  const recipients = emails.map(function(email) {
    return { name: "", email: email, prefs: Object.assign({}, legacyPrefs) };
  });

  saveNotificationRecipients_(recipients);
  props.deleteProperty(GM_NOTIFICATION_EMAIL_PROPERTY_LEGACY_);
  props.deleteProperty(GM_NOTIFICATION_PREFS_PROPERTY_LEGACY_);

  return recipients;
}


function getNotificationRecipients_() {
  const raw = PropertiesService.getScriptProperties().getProperty(GM_NOTIFICATION_RECIPIENTS_PROPERTY);

  if (!raw) {
    return migrateLegacyNotificationSettings_();
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(function(r) {
      return {
        name: String(r.name || ""),
        email: String(r.email || ""),
        prefs: normalizeNotificationPrefs_(r.prefs)
      };
    });
  } catch (err) {
    return [];
  }
}


function apiGetNotificationSettings_() {
  return { recipients: getNotificationRecipients_() };
}


function apiAddNotificationRecipient_(payload) {
  const email = String(payload.email || "").trim();
  const name = String(payload.name || "").trim();

  if (!GM_NOTIFICATION_EMAIL_VALID_.test(email)) {
    return { ok: false, code: "VALIDATION_ERROR", error: '"' + email + '" is not a valid email address.' };
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const recipients = getNotificationRecipients_();

    if (recipients.some(function(r) { return r.email.toLowerCase() === email.toLowerCase(); })) {
      return { ok: false, code: "VALIDATION_ERROR", error: "That email is already on the list." };
    }

    recipients.push({ name: name, email: email, prefs: Object.assign({}, GM_NOTIFICATION_PREFS_DEFAULTS_) });
    saveNotificationRecipients_(recipients);
    return { ok: true, data: { recipients: recipients } };
  } finally {
    lock.releaseLock();
  }
}


function apiRemoveNotificationRecipient_(payload) {
  const email = String(payload.email || "").trim().toLowerCase();

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const recipients = getNotificationRecipients_().filter(function(r) {
      return r.email.toLowerCase() !== email;
    });

    saveNotificationRecipients_(recipients);
    return { ok: true, data: { recipients: recipients } };
  } finally {
    lock.releaseLock();
  }
}


function apiUpdateNotificationRecipient_(payload) {
  const email = String(payload.email || "").trim().toLowerCase();

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    return { ok: false, code: "LOCK_TIMEOUT", error: "The system is busy — try again in a moment." };
  }

  try {
    const recipients = getNotificationRecipients_();
    const match = recipients.find(function(r) { return r.email.toLowerCase() === email; });

    if (!match) {
      return { ok: false, code: "NOT_FOUND", error: "That recipient could not be found." };
    }

    if (payload.name !== undefined) {
      match.name = String(payload.name || "").trim();
    }

    if (payload.prefs !== undefined) {
      match.prefs = normalizeNotificationPrefs_(payload.prefs);
    }

    saveNotificationRecipients_(recipients);
    return { ok: true, data: { recipients: recipients } };
  } finally {
    lock.releaseLock();
  }
}


// Computes the shared, recipient-independent facts once per digest run
// ("what bills are due, what's over budget, what balances are low,
// what deposited yesterday") so per-recipient filtering below never
// re-walks the register or re-runs the dashboard build once per person.
function buildNotificationDigestContext_() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + GM_NOTIFICATION_LOOKAHEAD_DAYS);

  const upcomingBills = apiGetScheduledTransactions_().filter(function(item) {
    if (!item.active) return false;
    const due = parseDateOnly_(item.nextDue);
    return due && due >= today && due <= horizon;
  });

  // Bypasses the getDashboard cache deliberately -- this runs once a
  // day via trigger, not per web request, so the ~15s full recompute
  // cost is a non-issue here, and a notification email should always
  // reflect genuinely current numbers.
  const budgetProgress = buildDashboardData_().budgetProgress;
  const accountBalances = getLatestAccountBalances_();

  // "Yesterday" -- the digest runs at 7am, before that day's own
  // transactions would typically exist yet, so the prior full day is
  // the window that actually contains unreported activity.
  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();
  const registerEntries = buildRegisterEntries_(manual, source, "");

  const yesterdayDeposits = registerEntries.filter(function(entry) {
    const date = entry.date instanceof Date ? entry.date : new Date(entry.date);

    if (isNaN(date.getTime()) || date < yesterdayStart || date > yesterdayEnd) {
      return false;
    }

    return getConfiguredCategoryType_(entry.category) === "Income";
  });

  return {
    upcomingBills: upcomingBills,
    budgetProgress: budgetProgress,
    accountBalances: accountBalances,
    yesterdayDeposits: yesterdayDeposits
  };
}


function buildNotificationDigestLinesForPrefs_(context, prefs) {
  const lines = [];

  if (prefs.upcomingBills && context.upcomingBills.length > 0) {
    lines.push("Upcoming bills (next " + GM_NOTIFICATION_LOOKAHEAD_DAYS + " days):");
    context.upcomingBills.forEach(function(b) {
      lines.push("- " + b.payee + ": $" + Math.abs(b.amount).toFixed(2) + " due " + b.nextDue);
    });
  }

  if (prefs.overBudget) {
    const overBudget = context.budgetProgress.filter(function(b) { return b.spent > b.budgeted; });

    if (overBudget.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("Over budget this month:");
      overBudget.forEach(function(b) {
        lines.push(
          "- " + b.category + ": $" + b.spent.toFixed(2) + " spent of $" + b.budgeted.toFixed(2) + " budgeted"
        );
      });
    }
  }

  if (prefs.lowBalance) {
    const lowAccounts = context.accountBalances.filter(function(b) { return b.balance < prefs.lowBalanceThreshold; });

    if (lowAccounts.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("Low balance (below $" + prefs.lowBalanceThreshold.toFixed(2) + "):");
      lowAccounts.forEach(function(b) {
        lines.push("- " + b.account + ": $" + b.balance.toFixed(2));
      });
    }
  }

  if (prefs.newDeposits) {
    const deposits = context.yesterdayDeposits.filter(function(d) {
      return Math.abs(d.amount) >= prefs.newDepositThreshold;
    });

    if (deposits.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("New deposits yesterday:");
      deposits.forEach(function(d) {
        lines.push("- " + d.payee + ": $" + Math.abs(d.amount).toFixed(2));
      });
    }
  }

  return lines;
}


function sendDailyNotificationDigest_() {
  const recipients = getNotificationRecipients_();

  if (recipients.length === 0) {
    return;
  }

  const context = buildNotificationDigestContext_();

  recipients.forEach(function(r) {
    const lines = buildNotificationDigestLinesForPrefs_(context, r.prefs);

    if (lines.length === 0) {
      return;
    }

    MailApp.sendEmail({
      to: r.email,
      subject: "GM Money — daily update",
      body: lines.join("\n")
    });
  });
}


function apiSendTestNotification_(payload) {
  const recipients = getNotificationRecipients_();

  if (recipients.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", error: "Add a notification email first." };
  }

  const targetEmail = payload && payload.email ? String(payload.email).trim().toLowerCase() : "";
  const targets = targetEmail
    ? recipients.filter(function(r) { return r.email.toLowerCase() === targetEmail; })
    : recipients;

  if (targets.length === 0) {
    return { ok: false, code: "NOT_FOUND", error: "That recipient could not be found." };
  }

  targets.forEach(function(r) {
    MailApp.sendEmail({
      to: r.email,
      subject: "GM Money — test notification",
      body: "This is a test notification from GM Money. If you're seeing this, email notifications are working correctly."
    });
  });

  return { ok: true, data: { sent: true } };
}
