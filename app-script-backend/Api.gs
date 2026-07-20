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

    return { ok: true, data: { sourceRow: sourceRow, transactionKey: transactionKey } };
  } finally {
    lock.releaseLock();
  }
}
