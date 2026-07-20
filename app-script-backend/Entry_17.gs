/**
 * ============================================================
 * Gathering Moss Financial Center
 * Entry.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

function buildEntrySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.ENTRY, 1);
  }

  const fullSheetRange = sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  );

  fullSheetRange.breakApart();
  fullSheetRange.clearDataValidations();

  sheet.getCharts().forEach(function(chart) {
    sheet.removeChart(chart);
  });

  sheet.clear();
  sheet.clearFormats();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(0);

  if (sheet.getMaxColumns() < 11) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      11 - sheet.getMaxColumns()
    );
  }

  sheet.showColumns(1, sheet.getMaxColumns());

  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 26);
  sheet.setColumnWidth(3, 145);
  sheet.setColumnWidth(4, 170);
  sheet.setColumnWidth(5, 170);
  sheet.setColumnWidth(6, 26);
  sheet.setColumnWidth(7, 40);

  for (let row = 1; row <= 50; row++) {
    sheet.setRowHeight(row, 25);
  }

  sheet.setRowHeight(2, 36);
  sheet.setRowHeight(7, 54);
  sheet.setRowHeight(14, 36);
  sheet.setRowHeight(16, 30);
  sheet.setRowHeight(18, 36);
  sheet.setRowHeight(35, 36);

  sheet.getRange("A1:K50")
    .setBackground(GM.COLORS.PAGE);

  sheet.getRange("B2:F16")
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  sheet.getRange("B2:F2")
    .merge()
    .setValue("Enter Transaction")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const fields = [
    { label: "Date", row: 4 },
    { label: "Account", row: 5 },
    { label: "Payee", row: 6 },
    { label: "Amount", row: 7 },
    { label: "Transaction Type", row: 8 },
    { label: "Category", row: 9 },
    { label: "Subcategory", row: 10 },
    { label: "Payment Method", row: 11 }
  ];

  fields.forEach(function(field) {
    sheet.getRange(field.row, 3)
      .setValue(field.label)
      .setFontWeight("bold")
      .setFontColor(GM.COLORS.TEXT)
      .setVerticalAlignment("middle");

    sheet.getRange(field.row, 4, 1, 2)
      .merge()
      .setBackground(GM.COLORS.INPUT)
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        GM.COLORS.BORDER,
        SpreadsheetApp.BorderStyle.SOLID
      )
      .setVerticalAlignment("middle");
  });

  sheet.getRange("C13")
    .setValue("Notes")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.TEXT)
    .setVerticalAlignment("top");

  sheet.getRange("D13:E14")
    .merge()
    .setBackground(GM.COLORS.INPUT)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setVerticalAlignment("top")
    .setWrap(true);

  sheet.getRange("D4")
    .setValue(new Date())
    .setNumberFormat("m/d/yyyy")
    .setHorizontalAlignment("left");

  sheet.getRange("D7:E7")
    .setBackground(GM.COLORS.SAGE)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      GM.COLORS.PRIMARY,
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  sheet.getRange("D7")
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00')
    .setHorizontalAlignment("right")
    .setFontWeight("bold")
    .setFontSize(22)
    .setFontColor(GM.COLORS.DEEP);

  const accountNames = getEntryAccountNames_();
  const categoryNames = getConfiguredCategoryNames_();
  const subcategoryNames = getConfiguredSubcategoryNames_("");
  const paymentMethods = getConfiguredPaymentMethods_();

  const accountRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(accountNames, true)
    .setAllowInvalid(false)
    .build();

  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Expense", "Income"], true)
    .setAllowInvalid(false)
    .build();

  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(categoryNames, true)
    .setAllowInvalid(false)
    .build();

  const subcategoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(subcategoryNames, true)
    .setAllowInvalid(false)
    .build();

  const paymentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(paymentMethods, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange("D5").setDataValidation(accountRule);
  sheet.getRange("D8").setDataValidation(typeRule);
  sheet.getRange("D9").setDataValidation(categoryRule);
  sheet.getRange("D10").setDataValidation(subcategoryRule);
  sheet.getRange("D11").setDataValidation(paymentRule);

  const defaultAccount = accountNames.indexOf("Business Checking") >= 0
    ? "Business Checking"
    : (accountNames[0] || "");

  if (defaultAccount) {
    sheet.getRange("D5").setValue(defaultAccount);
  }

  if (paymentMethods.indexOf("Debit Card") >= 0) {
    sheet.getRange("D11").setValue("Debit Card");
  } else if (paymentMethods.length > 0) {
    sheet.getRange("D11").setValue(paymentMethods[0]);
  }

  sheet.getRange("D8").setValue("Expense");

  sheet.getRange("C16:D16")
    .merge()
    .setValue("Save Entry  (check the box →)")
    .setBackground(GM.COLORS.ACCENT)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  sheet.getRange("E16")
    .insertCheckboxes()
    .setValue(false)
    .setBackground(GM.COLORS.ACCENT)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  buildEntrySpendingPanel_(sheet);
  buildEntryIncomePanel_(sheet);

  clearEntryEditState_();
  sheet.setActiveRange(sheet.getRange("D6"));
  getManualTransactionsSheet_();
}



function buildEntrySpendingPanel_(sheet) {
  sheet.getRange("A18:G18")
    .merge()
    .setValue("Spending This Month")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A19:G31")
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  const summary = getEntryMonthlySpendingByCategory_();

  sheet.getRange("A19:G31")
    .breakApart()
    .clearContent();

  sheet.getRange("A33:D33")
    .merge()
    .setValue("Month total")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.TEXT)
    .setFontWeight("bold")
    .setHorizontalAlignment("right");

  sheet.getRange("E33:G33")
    .merge()
    .setValue(summary.total)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00')
    .setBackground(GM.COLORS.SAGE)
    .setFontColor(GM.COLORS.DEEP)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("H1:I20")
    .clearContent()
    .clearDataValidations();
  sheet.hideColumns(8, 4);

  if (summary.rows.length === 0) {
    sheet.getRange("A19:G31")
      .merge()
      .setValue(
        "No spending has been recorded for this month yet.\n\n" +
        "The chart will appear after your first expense is entered."
      )
      .setBackground(GM.COLORS.PANEL)
      .setFontColor(GM.COLORS.MUTED)
      .setFontSize(13)
      .setFontStyle("italic")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        GM.COLORS.BORDER,
        SpreadsheetApp.BorderStyle.SOLID_THICK
      );

    return;
  }

  sheet.getRange("H1:I1")
    .setValues([["Spending Category", "Spending"]]);

  sheet.getRange(
    2,
    8,
    summary.rows.length,
    2
  ).setValues(summary.rows);

  const chartRange = sheet.getRange(
    1,
    8,
    summary.rows.length + 1,
    2
  );

  try {
    const pieHoleSize = summary.rows.length > 1 ? 0.32 : 0;

    const chart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(chartRange)
      .setPosition(19, 1, 8, 8)
      .setOption("width", 580)
      .setOption("height", 320)
      .setOption("title", "Spending by Category")
      .setOption("titleTextStyle", {
        bold: true,
        fontSize: 14,
        color: GM.COLORS.TEXT
      })
      .setOption("backgroundColor", GM.COLORS.PANEL)
      .setOption("pieHole", pieHoleSize)
      .setOption("pieSliceBorderColor", GM.COLORS.DEEP)
      .setOption("pieSliceText", "label")
      .setOption("colors", [
        "#1F5A36",
        "#1F5A36",
        "#B0203A",
        "#C1650A",
        "#C9A227",
        "#1B7A72",
        "#2A4B9B",
        "#7B3F94"
      ])
      .build();

    sheet.insertChart(chart);
    SpreadsheetApp.flush();
  } catch (error) {
    sheet.getRange("A20")
      .setValue(
        "The spending chart could not be created: " +
        error.message
      )
      .setFontColor(GM.COLORS.ERROR)
      .setFontStyle("italic")
      .setWrap(true);

    console.error(
      "Gathering Moss spending chart error: " + error.message
    );
  }
}


function buildEntryIncomePanel_(sheet) {
  sheet.getRange("A35:G35")
    .merge()
    .setValue("Income This Month")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A36:G48")
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  const summary = getEntryMonthlyIncomeByCategory_();

  sheet.getRange("A36:G48")
    .breakApart()
    .clearContent();

  sheet.getRange("A50:D50")
    .merge()
    .setValue("Month total")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.TEXT)
    .setFontWeight("bold")
    .setHorizontalAlignment("right");

  sheet.getRange("E50:G50")
    .merge()
    .setValue(summary.total)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00')
    .setBackground(GM.COLORS.SAGE)
    .setFontColor(GM.COLORS.DEEP)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("J1:K20")
    .clearContent()
    .clearDataValidations();
  sheet.hideColumns(10, 2);

  if (summary.rows.length === 0) {
    sheet.getRange("A36:G48")
      .merge()
      .setValue(
        "No income has been recorded for this month yet.\n\n" +
        "The chart will appear after your first income entry."
      )
      .setBackground(GM.COLORS.PANEL)
      .setFontColor(GM.COLORS.MUTED)
      .setFontSize(13)
      .setFontStyle("italic")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        GM.COLORS.BORDER,
        SpreadsheetApp.BorderStyle.SOLID_THICK
      );

    return;
  }

  sheet.getRange("J1:K1")
    .setValues([["Income Category", "Income"]]);

  sheet.getRange(
    2,
    10,
    summary.rows.length,
    2
  ).setValues(summary.rows);

  const chartRange = sheet.getRange(
    1,
    10,
    summary.rows.length + 1,
    2
  );

  try {
    const pieHoleSize = summary.rows.length > 1 ? 0.32 : 0;

    const chart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(chartRange)
      .setPosition(36, 1, 8, 8)
      .setOption("width", 580)
      .setOption("height", 320)
      .setOption("title", "Income by Category")
      .setOption("titleTextStyle", {
        bold: true,
        fontSize: 14,
        color: GM.COLORS.TEXT
      })
      .setOption("backgroundColor", GM.COLORS.PANEL)
      .setOption("pieHole", pieHoleSize)
      .setOption("pieSliceBorderColor", GM.COLORS.DEEP)
      .setOption("pieSliceText", "label")
      .setOption("colors", [
        "#C9A227",
        "#C9A227",
        "#1F5A36",
        "#2A4B9B",
        "#B0203A",
        "#1B7A72",
        "#C1650A",
        "#7B3F94"
      ])
      .build();

    sheet.insertChart(chart);
    SpreadsheetApp.flush();
  } catch (error) {
    sheet.getRange("A37")
      .setValue(
        "The income chart could not be created: " +
        error.message
      )
      .setFontColor(GM.COLORS.ERROR)
      .setFontStyle("italic")
      .setWrap(true);

    console.error(
      "Gathering Moss income chart error: " + error.message
    );
  }
}


/**
 * Builds the label used to group a transaction on the Spending
 * and Income charts — Subcategory is the more useful, specific
 * breakdown (e.g. "Sales Income: Plant Sales" vs. "Sales Income:
 * HydraTower Sales" as separate slices instead of one combined
 * "Sales Income" slice), falling back to just the Category on
 * older transactions that don't have a Subcategory set.
 */
function buildEntryChartGroupLabel_(category, subcategory) {
  const cleanCategory = String(category || "").trim();
  const cleanSubcategory = String(subcategory || "").trim();

  if (!cleanSubcategory) {
    return cleanCategory || "Uncategorized";
  }

  return cleanCategory + ": " + cleanSubcategory;
}


function getEntryMonthlySpendingByCategory_() {
  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();
  const entries = buildRegisterEntries_(manual, source, "");

  const result = {
    rows: [],
    total: 0
  };

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const totals = {};

  entries.forEach(function(entry) {
    const date = entry.date instanceof Date
      ? entry.date
      : new Date(entry.date);

    if (
      isNaN(date.getTime()) ||
      date.getMonth() !== month ||
      date.getFullYear() !== year
    ) {
      return;
    }

    const category = String(
      entry.category || "Uncategorized"
    ).trim() || "Uncategorized";

    if (getConfiguredCategoryType_(category) !== "Expense") {
      return;
    }

    const amount = Number(entry.amount || 0);

    if (!isFinite(amount)) {
      return;
    }

    const groupLabel = buildEntryChartGroupLabel_(
      category,
      entry.subcategory
    );

    totals[groupLabel] = (totals[groupLabel] || 0) + amount;
  });

  result.rows = Object.keys(totals)
    .map(function(category) {
      return [category, Math.abs(totals[category])];
    })
    .filter(function(row) {
      return row[1] > 0.004;
    })
    .sort(function(a, b) {
      return b[1] - a[1];
    });

  result.total = result.rows.reduce(function(sum, row) {
    return sum + row[1];
  }, 0);

  return result;
}


function refreshEntrySpendingChart() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    return;
  }

  sheet.getCharts().forEach(function(chart) {
    const anchorRow = chart.getContainerInfo().getAnchorRow();

    if (anchorRow < 34) {
      sheet.removeChart(chart);
    }
  });

  buildEntrySpendingPanel_(sheet);
  SpreadsheetApp.flush();
}


function getEntryMonthlyIncomeByCategory_() {
  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();
  const entries = buildRegisterEntries_(manual, source, "");

  const result = {
    rows: [],
    total: 0
  };

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const totals = {};

  entries.forEach(function(entry) {
    const date = entry.date instanceof Date
      ? entry.date
      : new Date(entry.date);

    if (
      isNaN(date.getTime()) ||
      date.getMonth() !== month ||
      date.getFullYear() !== year
    ) {
      return;
    }

    const category = String(
      entry.category || "Uncategorized"
    ).trim() || "Uncategorized";

    if (getConfiguredCategoryType_(category) !== "Income") {
      return;
    }

    const amount = Number(entry.amount || 0);

    if (!isFinite(amount)) {
      return;
    }

    const groupLabel = buildEntryChartGroupLabel_(
      category,
      entry.subcategory
    );

    totals[groupLabel] = (totals[groupLabel] || 0) + amount;
  });

  result.rows = Object.keys(totals)
    .map(function(category) {
      return [category, totals[category]];
    })
    .filter(function(row) {
      return row[1] > 0.004;
    })
    .sort(function(a, b) {
      return b[1] - a[1];
    });

  result.total = result.rows.reduce(function(sum, row) {
    return sum + row[1];
  }, 0);

  return result;
}


function refreshEntryIncomeChart() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    return;
  }

  sheet.getCharts().forEach(function(chart) {
    const anchorRow = chart.getContainerInfo().getAnchorRow();

    if (anchorRow >= 34) {
      sheet.removeChart(chart);
    }
  });

  buildEntryIncomePanel_(sheet);
  SpreadsheetApp.flush();
}


function saveEntry() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    throw new Error("Entry sheet not found.");
  }

  const enteredAmount = Number(sheet.getRange("D7").getValue());
  const transactionType = String(
    sheet.getRange("D8").getValue() || "Expense"
  ).trim();

  const normalizedAmount = transactionType === "Income"
    ? Math.abs(enteredAmount)
    : -Math.abs(enteredAmount);

  const values = {
    date: sheet.getRange("D4").getValue(),
    account: String(sheet.getRange("D5").getValue() || "").trim(),
    payee: String(sheet.getRange("D6").getValue() || "").trim(),
    amount: normalizedAmount,
    transactionType: transactionType,
    category: String(sheet.getRange("D9").getValue() || "").trim(),
    subcategory: String(sheet.getRange("D10").getValue() || "").trim(),
    paymentMethod: String(sheet.getRange("D11").getValue() || "").trim(),
    notes: String(sheet.getRange("D13").getValue() || "").trim()
  };

  const errors = [];

  if (!(values.date instanceof Date) || isNaN(values.date.getTime())) {
    errors.push("Enter a valid date.");
  }

  if (!values.account) {
    errors.push("Choose an account.");
  }

  if (!values.payee) {
    errors.push("Enter a payee.");
  }

  if (!isFinite(enteredAmount) || enteredAmount === 0) {
    errors.push("Enter a non-zero amount.");
  }

  if (
    values.transactionType !== "Expense" &&
    values.transactionType !== "Income"
  ) {
    errors.push("Choose Expense or Income.");
  }

  if (!values.category) {
    errors.push("Choose a category.");
  }

  if (!values.paymentMethod) {
    errors.push("Choose a payment method.");
  }

  if (errors.length > 0) {
    SpreadsheetApp.getUi().alert(
      "Entry could not be saved:\n\n" + errors.join("\n")
    );
    return;
  }

  const dataSheet = getManualTransactionsSheet_();
  const editId = PropertiesService.getUserProperties()
    .getProperty("GM_EDIT_TRANSACTION_ID");

  if (editId) {
    const rowNumber = findManualTransactionRowById_(editId);

    if (!rowNumber) {
      clearEntryEditState_();
      throw new Error("The transaction being edited could not be found.");
    }

    const existing = dataSheet
      .getRange(rowNumber, 1, 1, dataSheet.getLastColumn())
      .getValues()[0];

    const output = new Array(dataSheet.getLastColumn()).fill("");

    output[0] = editId;
    output[1] = values.date;
    output[2] = values.account;
    output[3] = values.payee;
    output[4] = values.amount;
    output[5] = values.category;
    output[6] = values.subcategory;
    output[7] = values.paymentMethod;
    output[8] = values.notes;
    output[9] = existing[9] || "Manual";
    output[10] = existing[10] || "Uncleared";
    output[11] = existing[11] || "";
    output[12] = existing[12] || "";
    output[13] = existing[13] ||
      Session.getActiveUser().getEmail() ||
      "Gathering Moss";
    output[14] = new Date();

    for (let index = 15; index < existing.length; index++) {
      output[index] = existing[index];
    }

    dataSheet
      .getRange(rowNumber, 1, 1, output.length)
      .setValues([output]);

    ss.toast("Transaction updated.", GM.APP_NAME, 4);
  } else {
    if (isLikelyDuplicateEntry_(dataSheet, values)) {
      ss.toast(
        "That transaction was already saved a moment ago — " +
        "skipped a duplicate entry.",
        GM.APP_NAME,
        5
      );

      SpreadsheetApp.flush();
      clearEntryForm();

      if (ss.getSheetByName(GM.SHEETS.REGISTER)) {
        refreshRegister();
      }

      if (ss.getSheetByName(GM.SHEETS.HOME)) {
        refreshHomeDashboard();
      }

      refreshEntrySpendingChart();
      refreshEntryIncomeChart();
      return;
    }

    const transactionId = createManualTransactionId_();
    const output = new Array(dataSheet.getLastColumn()).fill("");

    output[0] = transactionId;
    output[1] = values.date;
    output[2] = values.account;
    output[3] = values.payee;
    output[4] = values.amount;
    output[5] = values.category;
    output[6] = values.subcategory;
    output[7] = values.paymentMethod;
    output[8] = values.notes;
    output[9] = "Manual";
    output[10] = "Uncleared";
    output[13] = Session.getActiveUser().getEmail() || "Gathering Moss";
    output[14] = new Date();

    dataSheet
      .getRange(dataSheet.getLastRow() + 1, 1, 1, output.length)
      .setValues([output]);

    ss.toast("Transaction saved as Uncleared.", GM.APP_NAME, 4);
  }

  SpreadsheetApp.flush();
  clearEntryForm();

  if (ss.getSheetByName(GM.SHEETS.REGISTER)) {
    refreshRegister();
  }

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  refreshEntrySpendingChart();
  refreshEntryIncomeChart();
}


function clearEntryForm() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    return;
  }

  const accountNames = getEntryAccountNames_();
  const paymentMethods = getConfiguredPaymentMethods_();

  const defaultAccount = accountNames.indexOf("Business Checking") >= 0
    ? "Business Checking"
    : (accountNames[0] || "");

  const defaultPayment = paymentMethods.indexOf("Debit Card") >= 0
    ? "Debit Card"
    : (paymentMethods[0] || "");

  sheet.getRange("D4")
    .setValue(new Date())
    .setNumberFormat("m/d/yyyy")
    .setHorizontalAlignment("left");

  sheet.getRange("D5").setValue(defaultAccount);
  sheet.getRange("D8").setValue("Expense");
  sheet.getRange("D11").setValue(defaultPayment);

  ["D6", "D7", "D9", "D10", "D13"].forEach(function(a1) {
    sheet.getRange(a1).clearContent();
  });

  clearEntryEditState_();

  sheet.getRange("B2:F2")
    .setValue("Enter Transaction");

  sheet.getRange("C16:D16")
    .setValue("Save Entry  (check the box →)");

  sheet.getRange("E16").setValue(false);

  sheet.activate();
  sheet.setActiveRange(sheet.getRange("D6"));
}


function loadManualTransactionIntoEntry_(transactionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const entry = ss.getSheetByName(GM.SHEETS.ENTRY);
  const manual = getManualTransactionsSheet_();
  const rowNumber = findManualTransactionRowById_(transactionId);

  if (!entry || !rowNumber) {
    throw new Error("The selected transaction could not be loaded.");
  }

  const headers = manual
    .getRange(1, 1, 1, manual.getLastColumn())
    .getValues()[0];

  const map = getHeaderMap_(headers);

  requireHeaders_(map, [
    "Date",
    "Account",
    "Payee",
    "Amount",
    "Category",
    "Subcategory",
    "Payment Method",
    "Notes"
  ]);

  const row = manual
    .getRange(rowNumber, 1, 1, manual.getLastColumn())
    .getValues()[0];

  entry.getRange("D4")
    .setValue(row[map.Date])
    .setNumberFormat("m/d/yyyy");

  entry.getRange("D5").setValue(row[map.Account]);
  entry.getRange("D6").setValue(row[map.Payee]);
  const storedAmount = Number(row[map.Amount] || 0);

  entry.getRange("D7").setValue(Math.abs(storedAmount));
  entry.getRange("D8").setValue(
    storedAmount >= 0 ? "Income" : "Expense"
  );
  entry.getRange("D9").setValue(row[map.Category]);
  entry.getRange("D10").setValue(row[map.Subcategory]);
  entry.getRange("D11").setValue(row[map["Payment Method"]]);
  entry.getRange("D13").setValue(row[map.Notes]);

  PropertiesService.getUserProperties()
    .setProperty("GM_EDIT_TRANSACTION_ID", transactionId);

  entry.getRange("B2:F2")
    .setValue("Edit Transaction");

  ss.setActiveSheet(entry);
  entry.setActiveRange(entry.getRange("D6"));
}


function findManualTransactionRowById_(transactionId) {
  const sheet = getManualTransactionsSheet_();
  const values = sheet.getDataRange().getValues();

  for (let index = 1; index < values.length; index++) {
    if (
      String(values[index][0] || "").trim() ===
      String(transactionId || "").trim()
    ) {
      return index + 1;
    }
  }

  return 0;
}


function clearEntryEditState_() {
  PropertiesService.getUserProperties()
    .deleteProperty("GM_EDIT_TRANSACTION_ID");
}


function getManualTransactionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.DATABASE.MANUAL_TRANSACTIONS);

  if (!sheet) {
    sheet = ss.insertSheet(GM.DATABASE.MANUAL_TRANSACTIONS);
  }

  const requiredHeaders = [
    "Transaction ID",
    "Date",
    "Account",
    "Payee",
    "Amount",
    "Category",
    "Subcategory",
    "Payment Method",
    "Notes",
    "Source",
    "Status",
    "Matched Bank Key",
    "Reconciled Date",
    "Entered By",
    "Entered At",
    "Schedule ID",
    "Scheduled Due Key"
  ];

  ensureSheetHeaders_(sheet, requiredHeaders);
  sheet.setFrozenRows(1);

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


function getEntryAccountNames_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const candidates = [
    GM.DATABASE.ACCOUNTS,
    "Accounts"
  ];

  let sheet = null;

  for (let index = 0; index < candidates.length; index++) {
    sheet = ss.getSheetByName(candidates[index]);

    if (sheet) {
      break;
    }
  }

  if (!sheet) {
    return ["Business Checking"];
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return ["Business Checking"];
  }

  const headerMap = getHeaderMap_(values[0]);
  const possibleHeaders = [
    "Account",
    "Account Name",
    "Name"
  ];

  let accountColumn = -1;

  for (let index = 0; index < possibleHeaders.length; index++) {
    if (headerMap[possibleHeaders[index]] !== undefined) {
      accountColumn = headerMap[possibleHeaders[index]];
      break;
    }
  }

  if (accountColumn === -1) {
    accountColumn = 0;
  }

  const accounts = values
    .slice(1)
    .map(function(row) {
      return String(row[accountColumn] || "").trim();
    })
    .filter(function(value) {
      return value !== "";
    });

  return accounts.length > 0
    ? Array.from(new Set(accounts)).sort()
    : ["Business Checking"];
}


/**
 * Guards against the same transaction getting saved twice in a
 * row — for example, if a double-click on the Save checkbox (or
 * a browser display lag right after a save) triggers saveEntry()
 * a second time before the person notices the form already
 * cleared. Compares the incoming entry against whichever
 * transaction was added most recently; if every field matches
 * and it was entered within the last 15 seconds, it's treated
 * as a duplicate rather than saved again.
 */
function isLikelyDuplicateEntry_(dataSheet, values) {
  const lastRow = dataSheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const lastRecord = dataSheet
    .getRange(lastRow, 1, 1, dataSheet.getLastColumn())
    .getValues()[0];

  const lastEnteredAt = lastRecord[14];

  if (
    !(lastEnteredAt instanceof Date) ||
    isNaN(lastEnteredAt.getTime())
  ) {
    return false;
  }

  const secondsSinceLast =
    (new Date().getTime() - lastEnteredAt.getTime()) / 1000;

  if (secondsSinceLast < 0 || secondsSinceLast > 15) {
    return false;
  }

  const lastDate = lastRecord[1] instanceof Date
    ? lastRecord[1]
    : new Date(lastRecord[1]);

  const sameDate =
    !isNaN(lastDate.getTime()) &&
    values.date instanceof Date &&
    lastDate.getFullYear() === values.date.getFullYear() &&
    lastDate.getMonth() === values.date.getMonth() &&
    lastDate.getDate() === values.date.getDate();

  const sameAmount =
    Math.abs(Number(lastRecord[4] || 0) - values.amount) < 0.005;

  return (
    sameDate &&
    String(lastRecord[2] || "").trim() === values.account &&
    String(lastRecord[3] || "").trim() === values.payee &&
    sameAmount &&
    String(lastRecord[5] || "").trim() === values.category &&
    String(lastRecord[6] || "").trim() === values.subcategory &&
    String(lastRecord[7] || "").trim() === values.paymentMethod &&
    String(lastRecord[8] || "").trim() === values.notes
  );
}


function createManualTransactionId_() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss"
  );

  const randomPart = Math.floor(1000 + Math.random() * 9000);

  return "MAN-" + timestamp + "-" + randomPart;
}
