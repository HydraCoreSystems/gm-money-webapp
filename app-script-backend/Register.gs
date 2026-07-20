/**
 * ============================================================
 * Gathering Moss Financial Center
 * Register.gs
 *
 * Version: 0.18.0
 *
 * The Register is a unified ledger: it shows both manually
 * entered transactions and approved bank-fed transactions for
 * the selected account in a single chronological list, the way
 * Microsoft Money's register combined everything you'd entered
 * with everything downloaded from the bank. A "Source" column
 * marks each row as Manual or Bank so it's always clear where
 * it came from. If a manual entry was matched to a real bank
 * transaction (via Matching.gs), only the manual row is shown —
 * never both — to avoid double-counting the same transaction.
 * ============================================================
 */

function buildRegisterSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.SHEETS.REGISTER);

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.REGISTER);
  }

  const fullRange = sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  );

  fullRange.breakApart();
  fullRange.clearDataValidations();

  sheet.clear();
  sheet.clearFormats();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(4);

  sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  ).setBackground(GM.COLORS.PAGE);

  sheet.setColumnWidth(1, 105);
  sheet.setColumnWidth(2, 225);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 165);
  sheet.setColumnWidth(5, 145);
  sheet.setColumnWidth(6, 115);
  sheet.setColumnWidth(7, 115);
  sheet.setColumnWidth(8, 105);
  sheet.setColumnWidth(9, 90);
  sheet.setColumnWidth(10, 150);
  sheet.setColumnWidth(11, 260);

  sheet.setRowHeight(1, 42);
  sheet.setRowHeight(2, 28);
  sheet.setRowHeight(3, 28);
  sheet.setRowHeight(4, 30);

  sheet.getRange("A1:L1")
    .merge()
    .setValue("Register")
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(18)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A2:B2")
    .merge()
    .setValue("Manual + bank transactions")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("C2:D2")
    .merge()
    .setValue("Account")
    .setFontWeight("bold")
    .setHorizontalAlignment("right")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("E2:F2")
    .merge()
    .setValue("Business Checking")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("G2:H2")
    .merge()
    .setValue("Bank Balance")
    .setFontWeight("bold")
    .setHorizontalAlignment("right")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("I2:K2")
    .merge()
    .setValue("--")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("right")
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00')
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("A3:B3")
    .merge()
    .setValue("Balance")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("C3:D3")
    .merge()
    .setValue("--")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("right")
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00')
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("E3")
    .setValue("Status Filter")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER)
    .setHorizontalAlignment("right");

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      ["All", "Uncleared", "Cleared", "Reconciled"],
      true
    )
    .setAllowInvalid(false)
    .build();

  sheet.getRange("F3:G3")
    .merge()
    .setValue("All")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setDataValidation(statusRule)
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("H3:K3")
    .merge()
    .setValue(
      "Last refreshed: " +
      formatRegisterTimestamp_(new Date())
    )
    .setHorizontalAlignment("right")
    .setFontColor(GM.COLORS.MUTED);

  const headers = [
    "Date",
    "Payee",
    "Category",
    "Subcategory",
    "Payment Method",
    "Amount",
    "Balance",
    "Status",
    "Source",
    "Account",
    "Notes",
    "Transaction ID"
  ];

  sheet.getRange(4, 1, 1, headers.length)
    .setValues([headers])
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.hideColumns(12);
  refreshRegister();
}


function refreshRegister() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const register = ss.getSheetByName(GM.SHEETS.REGISTER);
  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();

  if (!register) {
    throw new Error(
      'Register sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  const accountName = String(
    register.getRange("E2").getValue() || ""
  ).trim() || "Business Checking";

  const selectedStatus = String(
    register.getRange("F3").getValue() || "All"
  ).trim();

  const bankBalance =
    getLatestBalanceHistoryValue_(accountName);

  register.getRange("I2")
    .setValue(bankBalance)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  const existingRows = register.getLastRow();

  if (existingRows > 4) {
    register.getRange(
      5,
      1,
      existingRows - 4,
      12
    )
      .clearContent()
      .clearFormat();
  }

  const entries = buildRegisterEntries_(manual, source, accountName);

  if (entries.length === 0) {
    register.getRange("C3")
      .setValue(bankBalance)
      .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

    register.getRange("A5")
      .setValue(
        "No transactions have been entered yet."
      )
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    updateRegisterRefreshTime_(register);
    return;
  }

  const projectedBalance = applyRegisterRunningBalance_(
    entries,
    bankBalance
  );

  register.getRange("C3")
    .setValue(projectedBalance)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  const displayEntries = entries
    .slice()
    .sort(function(a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateB - dateA;
      }

      return 0;
    })
    .filter(function(entry) {
      return (
        selectedStatus === "All" ||
        entry.status === selectedStatus
      );
    });

  if (displayEntries.length === 0) {
    register.getRange("A5")
      .setValue(
        "No transactions match the selected filter."
      )
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    updateRegisterRefreshTime_(register);
    return;
  }

  const output = displayEntries.map(function(entry) {
    return [
      entry.date,
      entry.payee,
      entry.category,
      entry.subcategory,
      entry.paymentMethod,
      entry.amount,
      entry.runningBalance,
      entry.status,
      entry.source,
      accountName,
      entry.notes,
      entry.transactionId
    ];
  });

  register.getRange(
    5,
    1,
    output.length,
    output[0].length
  )
    .setValues(output);

  register.getRange(5, 1, output.length, 1)
    .setNumberFormat("m/d/yyyy");

  register.getRange(5, 6, output.length, 2)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  register.getRange(5, 1, output.length, 12)
    .setVerticalAlignment("middle")
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  register.getRange(5, 2, output.length, 4)
    .setHorizontalAlignment("left");

  register.getRange(5, 2, output.length, 1)
    .setWrap(true);

  register.getRange(5, 11, output.length, 1)
    .setWrap(true);

  register.autoResizeRows(5, output.length);

  register.getRange(5, 6, output.length, 2)
    .setHorizontalAlignment("right");

  register.getRange(5, 8, output.length, 2)
    .setHorizontalAlignment("center");

  const amountRange = register.getRange(5, 6, output.length, 1);
  const statusRange = register.getRange(5, 8, output.length, 1);

  register.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setFontColor("#C62828")
      .setRanges([amountRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setFontColor("#2E7D32")
      .setRanges([amountRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Uncleared")
      .setBackground("#FFF4CC")
      .setFontColor("#8A6300")
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Cleared")
      .setBackground("#E8F5E9")
      .setFontColor("#1B5E20")
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Reconciled")
      .setBackground("#E3F2FD")
      .setFontColor("#0D47A1")
      .setRanges([statusRange])
      .build()
  ]);

  updateRegisterRefreshTime_(register);
  SpreadsheetApp.flush();
}


/**
 * Builds the combined list of manual + bank-fed entries, before
 * sorting or running-balance calculation. Bank-fed transactions
 * that are already represented by a matched manual entry (Status
 * = Cleared with a Matched Bank Key) are excluded, so the same
 * real-world transaction is never shown twice.
 *
 * Pass a specific accountName to filter to one account (how
 * Register uses this), or omit it / pass an empty string to get
 * entries across every account (how the Home dashboard uses this
 * for its month-to-date totals and Recent Transactions panel).
 */
function buildRegisterEntries_(manual, source, accountName) {
  const targetAccount = String(accountName || "").trim();
  const filterByAccount = targetAccount !== "";

  const entries = [];

  const manualValues = manual.getDataRange().getValues();
  const usedBankKeys = new Set();

  if (manualValues.length >= 2) {
    const manualMap = getHeaderMap_(manualValues[0]);

    requireHeaders_(manualMap, [
      "Transaction ID",
      "Date",
      "Account",
      "Payee",
      "Amount",
      "Category",
      "Subcategory",
      "Payment Method",
      "Notes",
      "Status",
      "Matched Bank Key"
    ]);

    manualValues.slice(1).forEach(function(row) {
      if (String(row[manualMap["Transaction ID"]] || "").trim() === "") {
        return;
      }

      const rowAccount = String(row[manualMap.Account] || "").trim();

      if (filterByAccount && rowAccount !== targetAccount) {
        return;
      }

      const matchedBankKey = String(
        row[manualMap["Matched Bank Key"]] || ""
      ).trim();

      if (matchedBankKey) {
        usedBankKeys.add(matchedBankKey);
      }

      entries.push({
        source: "Manual",
        date: row[manualMap.Date],
        payee: row[manualMap.Payee],
        category: row[manualMap.Category],
        subcategory: row[manualMap.Subcategory],
        paymentMethod: row[manualMap["Payment Method"]],
        amount: Number(row[manualMap.Amount] || 0),
        status: String(row[manualMap.Status] || "").trim(),
        notes: row[manualMap.Notes],
        transactionId: row[manualMap["Transaction ID"]],
        account: rowAccount
      });
    });
  }

  const sourceValues = source.getDataRange().getValues();

  if (sourceValues.length < 2) {
    return entries;
  }

  const sourceMap = getHeaderMap_(sourceValues[0]);

  requireHeaders_(sourceMap, [
    "Date",
    "Description",
    "Amount",
    "Account",
    "Category"
  ]);

  const bankEntries = [];

  sourceValues.slice(1).forEach(function(row) {
    const rowAccount = String(row[sourceMap.Account] || "").trim();

    if (filterByAccount && rowAccount !== targetAccount) {
      return;
    }

    const category = String(row[sourceMap.Category] || "").trim();

    if (
      category === "" ||
      category.toLowerCase() === "uncategorized"
    ) {
      return;
    }

    const bankKey = buildTransactionKey_(
      row[sourceMap.Date],
      row[sourceMap.Description],
      row[sourceMap.Amount],
      row[sourceMap.Account]
    );

    if (usedBankKeys.has(bankKey)) {
      return;
    }

    bankEntries.push({
      source: "Bank",
      date: row[sourceMap.Date],
      payee: row[sourceMap.Description],
      category: category,
      subcategory: "",
      paymentMethod: "",
      amount: Number(row[sourceMap.Amount] || 0),
      status: "Cleared",
      notes: "",
      transactionId: "",
      account: rowAccount,
      bankKey: bankKey
    });
  });

  enrichBankEntriesFromMetadata_(bankEntries);

  return entries.concat(bankEntries);
}


/**
 * Fills in Subcategory and Notes for bank-fed entries from
 * GM_TransactionMeta, which is where that detail lives for
 * transactions approved through Review (Tiller itself has no
 * concept of subcategory).
 */
function enrichBankEntriesFromMetadata_(bankEntries) {
  if (bankEntries.length === 0) {
    return;
  }

  const metaSheet = getTransactionMetadataSheet_();
  const metaValues = metaSheet.getDataRange().getValues();

  if (metaValues.length < 2) {
    return;
  }

  const metaMap = getHeaderMap_(metaValues[0]);
  const metaByKey = {};

  metaValues.slice(1).forEach(function(row) {
    const key = String(row[metaMap["Transaction Key"]] || "").trim();

    if (key) {
      metaByKey[key] = row;
    }
  });

  bankEntries.forEach(function(entry) {
    const metaRow = metaByKey[entry.bankKey];

    if (!metaRow) {
      return;
    }

    entry.subcategory = metaRow[metaMap.Subcategory] || "";
    entry.notes = metaRow[metaMap.Notes] || "";
  });
}


/**
 * Computes a Money-style running balance across every entry,
 * cleared and uncleared alike. Since the current bank balance
 * already reflects every cleared transaction, the calculation
 * works backward first to find the implied balance before any
 * of the currently-visible cleared entries, then walks forward
 * chronologically through everything (cleared and uncleared) so
 * each row gets a mathematically consistent running balance.
 * Returns the final balance after every entry, which is the
 * account's overall projected balance.
 */
function applyRegisterRunningBalance_(entries, bankBalance) {
  const clearedSum = entries
    .filter(function(entry) {
      return entry.status.toLowerCase() !== "uncleared";
    })
    .reduce(function(total, entry) {
      return total + entry.amount;
    }, 0);

  const chronological = entries
    .slice()
    .sort(function(a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return 0;
    });

  let runningBalance = bankBalance - clearedSum;

  chronological.forEach(function(entry) {
    runningBalance += entry.amount;
    entry.runningBalance = runningBalance;
  });

  return runningBalance;
}


function applyRegisterFilter() {
  refreshRegister();
}


function clearRegisterFilter() {
  const register = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.REGISTER);

  if (!register) {
    throw new Error(
      "Register sheet not found."
    );
  }

  register.getRange("F3")
    .setValue("All");

  refreshRegister();
}


/**
 * Lets the person manually tell Register that a Manual row and a
 * Bank row represent the same real-world transaction — the same
 * outcome the automatic matcher produces, for the case where a
 * bank transaction was already approved through Review before it
 * could be automatically matched to its manual counterpart.
 *
 * Select exactly two rows first (click one row number, then hold
 * Ctrl/Cmd and click a second row number to add it to the
 * selection) — one Manual row and one Bank row — then run this.
 */
function matchSelectedRegisterTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const register = ss.getSheetByName(GM.SHEETS.REGISTER);

  if (!register) {
    throw new Error("Register sheet not found.");
  }

  const selectedRows = new Set();

  register.getActiveRangeList().getRanges().forEach(function(range) {
    for (
      let row = range.getRow();
      row <= range.getLastRow();
      row++
    ) {
      if (row >= 5) {
        selectedRows.add(row);
      }
    }
  });

  if (selectedRows.size !== 2) {
    ui.alert(
      "Select exactly two rows first — click one row number, " +
      "then hold Ctrl (or Cmd on Mac) and click a second row " +
      "number to select both the Manual transaction and its " +
      "matching Bank transaction, then run this again."
    );
    return;
  }

  const rows = Array.from(selectedRows).map(function(row) {
    return {
      row: row,
      values: register
        .getRange(row, 1, 1, 12)
        .getValues()[0]
    };
  });

  const manualEntry = rows.find(function(item) {
    return String(item.values[8] || "").trim() === "Manual";
  });

  const bankEntry = rows.find(function(item) {
    return String(item.values[8] || "").trim() === "Bank";
  });

  if (!manualEntry || !bankEntry || manualEntry === bankEntry) {
    ui.alert(
      "Select one Manual transaction and one Bank transaction " +
      "— both selected rows appear to be the same source."
    );
    return;
  }

  const manualTransactionId = String(
    manualEntry.values[11] || ""
  ).trim();

  if (!manualTransactionId) {
    ui.alert(
      "The selected Manual row could not be identified."
    );
    return;
  }

  const accountName = String(
    register.getRange("E2").getValue() || ""
  ).trim();

  const bankKey = buildTransactionKey_(
    bankEntry.values[0],
    bankEntry.values[1],
    Number(bankEntry.values[5]),
    accountName
  );

  const confirmResponse = ui.alert(
    "Match Transactions",
    "Match these as the same transaction?\n\n" +
    "Manual: " + manualEntry.values[1] + " — " +
    manualEntry.values[5] + " (" +
    Utilities.formatDate(
      new Date(manualEntry.values[0]),
      Session.getScriptTimeZone(),
      "M/d/yyyy"
    ) + ")\n\n" +
    "Bank: " + bankEntry.values[1] + " — " +
    bankEntry.values[5] + " (" +
    Utilities.formatDate(
      new Date(bankEntry.values[0]),
      Session.getScriptTimeZone(),
      "M/d/yyyy"
    ) + ")\n\n" +
    "The Manual entry will be marked Cleared, and the duplicate " +
    "Bank row will no longer be shown separately.",
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  const manual = getManualTransactionsSheet_();
  const manualRowNumber = findManualTransactionRowById_(
    manualTransactionId
  );

  if (!manualRowNumber) {
    ui.alert(
      "The Manual transaction could not be found — it may have " +
      "been edited or deleted since Register was last refreshed."
    );
    return;
  }

  const manualHeaders = manual
    .getRange(1, 1, 1, manual.getLastColumn())
    .getValues()[0];

  const manualMap = getHeaderMap_(manualHeaders);

  requireHeaders_(manualMap, [
    "Status",
    "Matched Bank Key"
  ]);

  manual
    .getRange(manualRowNumber, manualMap.Status + 1)
    .setValue("Cleared");

  manual
    .getRange(manualRowNumber, manualMap["Matched Bank Key"] + 1)
    .setValue(bankKey);

  if (typeof learnMerchant_ === "function") {
    const manualPayee = String(manualEntry.values[1] || "").trim();
    const category = String(manualEntry.values[2] || "").trim();
    const subcategory = String(manualEntry.values[3] || "").trim();
    const bankDescription = String(bankEntry.values[1] || "").trim();

    try {
      learnMerchant_(manualPayee, category, subcategory);

      if (
        bankDescription &&
        typeof normalizeMerchantKey_ === "function" &&
        normalizeMerchantKey_(bankDescription) !==
          normalizeMerchantKey_(manualPayee)
      ) {
        learnMerchant_(bankDescription, category, subcategory);
      }
    } catch (error) {
      console.error(
        "Gathering Moss merchant learning error: " + error.message
      );
    }
  }

  SpreadsheetApp.flush();
  refreshRegister();

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  ss.toast(
    "Transactions matched and marked Cleared.",
    GM.APP_NAME,
    4
  );
}


function editSelectedRegisterTransaction() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.REGISTER);

  if (!sheet) {
    throw new Error(
      "Register sheet not found."
    );
  }

  const row = sheet
    .getActiveCell()
    .getRow();

  if (row < 5) {
    SpreadsheetApp.getUi().alert(
      "Select a transaction row first."
    );
    return;
  }

  const transactionId = String(
    sheet.getRange(row, 12).getValue() || ""
  ).trim();

  if (!transactionId) {
    SpreadsheetApp.getUi().alert(
      "This row came from your bank feed and can't be edited " +
      "here — only manually entered transactions can be edited " +
      "in Register."
    );
    return;
  }

  loadManualTransactionIntoEntry_(
    transactionId
  );
}


function deleteSelectedRegisterTransaction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(
    GM.SHEETS.REGISTER
  );

  if (!sheet) {
    throw new Error(
      "Register sheet not found."
    );
  }

  const row = sheet
    .getActiveCell()
    .getRow();

  if (row < 5) {
    SpreadsheetApp.getUi().alert(
      "Select a transaction row first."
    );
    return;
  }

  const transactionId = String(
    sheet.getRange(row, 12).getValue() || ""
  ).trim();

  const payee = String(
    sheet.getRange(row, 2).getValue() || ""
  ).trim();

  const amount = sheet
    .getRange(row, 6)
    .getDisplayValue();

  if (!transactionId) {
    SpreadsheetApp.getUi().alert(
      "This row came from your bank feed and can't be deleted " +
      "here — only manually entered transactions can be deleted " +
      "in Register."
    );
    return;
  }

  const response = SpreadsheetApp.getUi().alert(
    "Delete Transaction",
    "Delete " +
      payee +
      " (" +
      amount +
      ")?\n\nThis cannot be undone.",
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (
    response !==
    SpreadsheetApp.getUi().Button.YES
  ) {
    return;
  }

  const manualRow =
    findManualTransactionRowById_(
      transactionId
    );

  if (!manualRow) {
    SpreadsheetApp.getUi().alert(
      "The manual transaction could not be found."
    );
    return;
  }

  getManualTransactionsSheet_()
    .deleteRow(manualRow);

  refreshRegister();

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  ss.toast(
    "Transaction deleted.",
    GM.APP_NAME,
    4
  );
}


function getLatestBalanceHistoryValue_(
  accountName
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(
    "Balance History"
  );

  if (!sheet) {
    throw new Error(
      'Tiller sheet "Balance History" was not found.'
    );
  }

  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Date",
    "Time",
    "Account",
    "Balance"
  ]);

  const normalizedTarget =
    normalizeRegisterText_(accountName);

  let latestTimestamp = -1;
  let latestBalance = null;

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    const rowAccount =
      normalizeRegisterText_(
        row[map.Account]
      );

    if (
      rowAccount !== normalizedTarget
    ) {
      continue;
    }

    const timestamp =
      combineBalanceDateTime_(
        row[map.Date],
        row[map.Time]
      );

    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;

      const balance = Number(
        row[map.Balance]
      );

      latestBalance = isFinite(balance)
        ? balance
        : 0;
    }
  }

  if (latestBalance === null) {
    throw new Error(
      'No Balance History record was found for account "' +
        accountName +
        '".'
    );
  }

  return latestBalance;
}


function combineBalanceDateTime_(
  dateValue,
  timeValue
) {
  const date = new Date(dateValue);

  if (isNaN(date.getTime())) {
    return -1;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (
    timeValue instanceof Date &&
    !isNaN(timeValue.getTime())
  ) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
    seconds = timeValue.getSeconds();
  } else {
    const parsedTime = new Date(
      "1970-01-01 " +
        String(timeValue || "")
    );

    if (!isNaN(parsedTime.getTime())) {
      hours = parsedTime.getHours();
      minutes = parsedTime.getMinutes();
      seconds = parsedTime.getSeconds();
    }
  }

  date.setHours(
    hours,
    minutes,
    seconds,
    0
  );

  return date.getTime();
}


function normalizeRegisterText_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function updateRegisterRefreshTime_(register) {
  register.getRange("H3:K3")
    .setValue(
      "Last refreshed: " +
      formatRegisterTimestamp_(new Date())
    )
    .setHorizontalAlignment("right")
    .setFontColor(GM.COLORS.MUTED);
}


function formatRegisterTimestamp_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "MMM d, yyyy h:mm a"
  );
}

