/**
 * ============================================================
 * Gathering Moss Financial Center
 * Scheduled.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

function buildScheduledSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.SCHEDULED);
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
  sheet.setFrozenRows(18);

  sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  ).setBackground(GM.COLORS.PAGE);

  for (let column = 1; column <= 11; column++) {
    sheet.setColumnWidth(column, 125);
  }

  sheet.setColumnWidth(1, 95);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 115);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 155);
  sheet.setColumnWidth(6, 155);
  sheet.setColumnWidth(7, 155);
  sheet.setColumnWidth(8, 145);
  sheet.setColumnWidth(9, 110);
  sheet.setColumnWidth(10, 210);
  sheet.setColumnWidth(11, 120);

  sheet.setRowHeight(1, 40);
  sheet.setRowHeights(3, 6, 28);
  sheet.setRowHeight(12, 28);
  sheet.setRowHeight(18, 30);

  sheet.getRange("A1:K1")
    .merge()
    .setValue("Scheduled Transactions")
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(18)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const labels = [
    ["A3", "Payee"],
    ["A4", "Amount"],
    ["A5", "Account"],
    ["A6", "Category"],
    ["A7", "Subcategory"],
    ["A8", "Payment Method"],
    ["F3", "Frequency"],
    ["F4", "Next Due"],
    ["F5", "Active"],
    ["F6", "Auto Create"],
    ["F7", "Notes"]
  ];

  labels.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontWeight("bold")
      .setFontColor(GM.COLORS.HEADER);
  });

  [
    "B3:E3",
    "B4:E4",
    "B5:E5",
    "B6:E6",
    "B7:E7",
    "B8:E8",
    "G3:K3",
    "G4:K4",
    "G5:K5",
    "G6:K6",
    "G7:K8"
  ].forEach(function(a1) {
    sheet.getRange(a1)
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
      );
  });

  sheet.getRange("B4")
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  sheet.getRange("G4")
    .setValue(new Date())
    .setNumberFormat("m/d/yyyy");

  const accounts = getEntryAccountNames_();
  const categories = getConfiguredCategoryNames_();
  const subcategories = getConfiguredSubcategoryNames_("");
  const paymentMethods = getConfiguredPaymentMethods_();

  const accountRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(accounts, true)
    .setAllowInvalid(false)
    .build();

  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(categories, true)
    .setAllowInvalid(false)
    .build();

  const subcategoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(subcategories, true)
    .setAllowInvalid(false)
    .build();

  const paymentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(paymentMethods, true)
    .setAllowInvalid(false)
    .build();

  const frequencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(GM.RECURRING_FREQUENCIES, true)
    .setAllowInvalid(false)
    .build();

  const yesNoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange("B5").setDataValidation(accountRule);
  sheet.getRange("B6").setDataValidation(categoryRule);
  sheet.getRange("B7").setDataValidation(subcategoryRule);
  sheet.getRange("B8").setDataValidation(paymentRule);
  sheet.getRange("G3").setDataValidation(frequencyRule);
  sheet.getRange("G5").setDataValidation(yesNoRule).setValue("Yes");
  sheet.getRange("G6").setDataValidation(yesNoRule).setValue("No");

  const defaultAccount = accounts.indexOf("Business Checking") >= 0
    ? "Business Checking"
    : (accounts[0] || "");

  const defaultPaymentMethod = paymentMethods.indexOf("Debit Card") >= 0
    ? "Debit Card"
    : (paymentMethods[0] || "");

  if (defaultAccount) {
    sheet.getRange("B5").setValue(defaultAccount);
  }

  if (defaultPaymentMethod) {
    sheet.getRange("B8").setValue(defaultPaymentMethod);
  }

  sheet.getRange("A10:E10")
    .merge()
    .setValue("Menu → Save Scheduled Transaction")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.HEADER)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("F10:K10")
    .merge()
    .setValue("Select a row below to edit or delete")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.MUTED)
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true, GM.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.getRange("A12:K12")
    .merge()
    .setValue("Upcoming Cash Flow — Next 7 Days")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("A13:K13")
    .setValues([[
      "Due",
      "Payee",
      "Amount",
      "Frequency",
      "Account",
      "Category",
      "Subcategory",
      "Payment Method",
      "Action",
      "Notes",
      "Schedule ID"
    ]])
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.HEADER)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const headers = [
    "Next Due",
    "Payee",
    "Amount",
    "Frequency",
    "Account",
    "Category",
    "Subcategory",
    "Payment Method",
    "Active",
    "Notes",
    "Schedule ID"
  ];

  sheet.getRange(18, 1, 1, headers.length)
    .setValues([headers])
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.hideColumns(11);

  clearScheduledEditState_();
  getRecurringTransactionsSheet_();
  refreshScheduledTransactions();
}


function saveScheduledTransaction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    throw new Error("Scheduled sheet not found.");
  }

  const values = {
    payee: String(sheet.getRange("B3").getValue() || "").trim(),
    amount: Number(sheet.getRange("B4").getValue()),
    account: String(sheet.getRange("B5").getValue() || "").trim(),
    category: String(sheet.getRange("B6").getValue() || "").trim(),
    subcategory: String(sheet.getRange("B7").getValue() || "").trim(),
    paymentMethod: String(sheet.getRange("B8").getValue() || "").trim(),
    frequency: String(sheet.getRange("G3").getValue() || "").trim(),
    nextDue: sheet.getRange("G4").getValue(),
    active: String(sheet.getRange("G5").getValue() || "").trim(),
    autoCreate: String(sheet.getRange("G6").getValue() || "").trim(),
    notes: String(sheet.getRange("G7").getValue() || "").trim()
  };

  const errors = [];

  if (!values.payee) {
    errors.push("Enter a payee.");
  }

  if (!isFinite(values.amount) || values.amount === 0) {
    errors.push("Enter a non-zero amount.");
  }

  if (!values.account) {
    errors.push("Choose an account.");
  }

  if (!values.category) {
    errors.push("Choose a category.");
  }

  if (!values.paymentMethod) {
    errors.push("Choose a payment method.");
  }

  if (!values.frequency) {
    errors.push("Choose a frequency.");
  }

  if (
    !(values.nextDue instanceof Date) ||
    isNaN(values.nextDue.getTime())
  ) {
    errors.push("Enter a valid next due date.");
  }

  if (errors.length > 0) {
    SpreadsheetApp.getUi().alert(
      "Scheduled transaction could not be saved:\n\n" +
        errors.join("\n")
    );
    return;
  }

  const dataSheet = getRecurringTransactionsSheet_();
  const headers = dataSheet
    .getRange(1, 1, 1, dataSheet.getLastColumn())
    .getValues()[0];

  const map = getHeaderMap_(headers);

  requireHeaders_(map, [
    "Schedule ID",
    "Payee",
    "Amount",
    "Account",
    "Category",
    "Subcategory",
    "Frequency",
    "Next Due",
    "Active",
    "Auto Create",
    "Notes",
    "Updated By",
    "Updated At",
    "Last Generated Due",
    "Payment Method"
  ]);

  const editId = PropertiesService.getUserProperties()
    .getProperty("GM_EDIT_SCHEDULE_ID");

  let rowNumber = 0;
  let record = new Array(dataSheet.getLastColumn()).fill("");

  if (editId) {
    rowNumber = findRecurringTransactionRowById_(editId);

    if (!rowNumber) {
      clearScheduledEditState_();
      throw new Error(
        "The scheduled transaction being edited could not be found."
      );
    }

    record = dataSheet
      .getRange(rowNumber, 1, 1, dataSheet.getLastColumn())
      .getValues()[0];
  } else {
    rowNumber = dataSheet.getLastRow() + 1;
    record[map["Schedule ID"]] = createRecurringTransactionId_();
  }

  record[map.Payee] = values.payee;
  record[map.Amount] = values.amount;
  record[map.Account] = values.account;
  record[map.Category] = values.category;
  record[map.Subcategory] = values.subcategory;
  record[map["Payment Method"]] = values.paymentMethod;
  record[map.Frequency] = values.frequency;
  record[map["Next Due"]] = values.nextDue;
  record[map.Active] = values.active || "Yes";
  record[map["Auto Create"]] = values.autoCreate || "No";
  record[map.Notes] = values.notes;
  record[map["Updated By"]] =
    Session.getActiveUser().getEmail() || "Gathering Moss";
  record[map["Updated At"]] = new Date();

  dataSheet
    .getRange(rowNumber, 1, 1, record.length)
    .setValues([record]);

  ss.toast(
    editId
      ? "Scheduled transaction updated."
      : "Scheduled transaction saved.",
    GM.APP_NAME,
    4
  );

  SpreadsheetApp.flush();
  clearScheduledForm();
  refreshScheduledTransactions();

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }
}


function clearScheduledForm() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    return;
  }

  const accounts = getEntryAccountNames_();
  const paymentMethods = getConfiguredPaymentMethods_();

  const defaultAccount = accounts.indexOf("Business Checking") >= 0
    ? "Business Checking"
    : (accounts[0] || "");

  const defaultPaymentMethod = paymentMethods.indexOf("Debit Card") >= 0
    ? "Debit Card"
    : (paymentMethods[0] || "");

  [
    "B3",
    "B4",
    "B6",
    "B7",
    "G3",
    "G7"
  ].forEach(function(a1) {
    sheet.getRange(a1).clearContent();
  });

  sheet.getRange("B5").setValue(defaultAccount);
  sheet.getRange("B8").setValue(defaultPaymentMethod);
  sheet.getRange("G4")
    .setValue(new Date())
    .setNumberFormat("m/d/yyyy");
  sheet.getRange("G5").setValue("Yes");
  sheet.getRange("G6").setValue("No");

  clearScheduledEditState_();

  sheet.getRange("A1:K1")
    .setValue("Scheduled Transactions");

  sheet.activate();
  sheet.setActiveRange(sheet.getRange("B3"));
}


function refreshScheduledTransactions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.SCHEDULED);

  const dataSheet = getRecurringTransactionsSheet_();

  if (!sheet) {
    throw new Error("Scheduled sheet not found.");
  }

  sheet.getRange("A14:K17")
    .clearContent()
    .clearFormat();

  const lastRow = sheet.getLastRow();

  if (lastRow > 18) {
    sheet.getRange(19, 1, lastRow - 18, 11)
      .clearContent()
      .clearFormat();
  }

  const values = dataSheet.getDataRange().getValues();

  if (values.length < 2) {
    sheet.getRange("A14")
      .setValue("Nothing is scheduled for the next 7 days.")
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    sheet.getRange("A19")
      .setValue("No scheduled transactions have been created yet.")
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    return;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Schedule ID",
    "Payee",
    "Amount",
    "Account",
    "Category",
    "Subcategory",
    "Payment Method",
    "Frequency",
    "Next Due",
    "Active",
    "Auto Create",
    "Notes"
  ]);

  const schedules = values
    .slice(1)
    .filter(function(row) {
      return String(row[map["Schedule ID"]] || "").trim() !== "";
    })
    .sort(function(a, b) {
      return new Date(a[map["Next Due"]]).getTime() -
        new Date(b[map["Next Due"]]).getTime();
    });

  const today = startOfScheduledDay_(new Date());
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 7);

  const upcoming = schedules
    .filter(function(row) {
      const due = startOfScheduledDay_(row[map["Next Due"]]);
      const active = String(row[map.Active] || "")
        .trim()
        .toLowerCase() === "yes";

      return active && due >= today && due <= endDate;
    })
    .slice(0, 4)
    .map(function(row) {
      return [
        row[map["Next Due"]],
        row[map.Payee],
        Number(row[map.Amount] || 0),
        row[map.Frequency],
        row[map.Account],
        row[map.Category],
        row[map.Subcategory],
        row[map["Payment Method"]],
        String(row[map["Auto Create"]] || "") === "Yes"
          ? "Auto"
          : "Review",
        row[map.Notes],
        row[map["Schedule ID"]]
      ];
    });

  if (upcoming.length === 0) {
    sheet.getRange("A14")
      .setValue("Nothing is scheduled for the next 7 days.")
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);
  } else {
    sheet.getRange(14, 1, upcoming.length, 11)
      .setValues(upcoming)
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

    sheet.getRange(14, 1, upcoming.length, 1)
      .setNumberFormat("m/d/yyyy");

    sheet.getRange(14, 3, upcoming.length, 1)
      .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  }

  const rows = schedules.map(function(row) {
    return [
      row[map["Next Due"]],
      row[map.Payee],
      Number(row[map.Amount] || 0),
      row[map.Frequency],
      row[map.Account],
      row[map.Category],
      row[map.Subcategory],
      row[map["Payment Method"]],
      row[map.Active],
      row[map.Notes],
      row[map["Schedule ID"]]
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(19, 1, rows.length, 11)
      .setValues(rows)
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

    sheet.getRange(19, 1, rows.length, 1)
      .setNumberFormat("m/d/yyyy");

    sheet.getRange(19, 3, rows.length, 1)
      .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  }

  SpreadsheetApp.flush();
}


/**
 * Creates transactions whose due date has arrived.
 * Auto Create = Yes creates an Uncleared manual transaction.
 * Auto Create = No creates a Needs Review scheduled transaction.
 */
function processDueScheduledTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = getRecurringTransactionsSheet_();
  const manualSheet = getManualTransactionsSheet_();
  const values = scheduleSheet.getDataRange().getValues();

  if (values.length < 2) {
    ss.toast("No scheduled transactions exist.", GM.APP_NAME, 4);
    return;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Schedule ID",
    "Payee",
    "Amount",
    "Account",
    "Category",
    "Subcategory",
    "Payment Method",
    "Frequency",
    "Next Due",
    "Active",
    "Auto Create",
    "Notes",
    "Last Generated Due"
  ]);

  const manualHeaders = manualSheet
    .getRange(1, 1, 1, manualSheet.getLastColumn())
    .getValues()[0];

  const manualMap = getHeaderMap_(manualHeaders);

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
    "Source",
    "Status",
    "Entered By",
    "Entered At",
    "Schedule ID",
    "Scheduled Due Key"
  ]);

  const today = startOfScheduledDay_(new Date());
  const rowsToAppend = [];
  let createdCount = 0;
  let reviewCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];

    if (
      String(row[map.Active] || "")
        .trim()
        .toLowerCase() !== "yes"
    ) {
      continue;
    }

    let dueDate = startOfScheduledDay_(row[map["Next Due"]]);
    let safety = 0;

    while (dueDate <= today && safety < 24) {
      const scheduleId = String(
        row[map["Schedule ID"]] || ""
      ).trim();

      const dueKey = Utilities.formatDate(
        dueDate,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      );

      if (!scheduledOccurrenceExists_(scheduleId, dueKey)) {
        const autoCreate =
          String(row[map["Auto Create"]] || "")
            .trim()
            .toLowerCase() === "yes";

        const output = new Array(
          manualSheet.getLastColumn()
        ).fill("");

        output[manualMap["Transaction ID"]] =
          createManualTransactionId_();

        output[manualMap.Date] = new Date(dueDate);
        output[manualMap.Account] = row[map.Account];
        output[manualMap.Payee] = row[map.Payee];
        output[manualMap.Amount] = Number(row[map.Amount] || 0);
        output[manualMap.Category] = row[map.Category];
        output[manualMap.Subcategory] = row[map.Subcategory];
        output[manualMap["Payment Method"]] =
          row[map["Payment Method"]];
        output[manualMap.Notes] = row[map.Notes];
        output[manualMap.Source] = "Scheduled";
        output[manualMap.Status] =
          autoCreate ? "Uncleared" : "Needs Review";
        output[manualMap["Entered By"]] =
          Session.getActiveUser().getEmail() ||
          "Gathering Moss";
        output[manualMap["Entered At"]] = new Date();
        output[manualMap["Schedule ID"]] = scheduleId;
        output[manualMap["Scheduled Due Key"]] = dueKey;

        rowsToAppend.push(output);
        createdCount++;

        if (!autoCreate) {
          reviewCount++;
        }
      }

      scheduleSheet
        .getRange(
          rowIndex + 1,
          map["Last Generated Due"] + 1
        )
        .setValue(new Date(dueDate));

      dueDate = calculateNextScheduledDate_(
        dueDate,
        row[map.Frequency]
      );

      safety++;
    }

    scheduleSheet
      .getRange(
        rowIndex + 1,
        map["Next Due"] + 1
      )
      .setValue(dueDate);
  }

  if (rowsToAppend.length > 0) {
    manualSheet
      .getRange(
        manualSheet.getLastRow() + 1,
        1,
        rowsToAppend.length,
        rowsToAppend[0].length
      )
      .setValues(rowsToAppend);
  }

  SpreadsheetApp.flush();

  if (ss.getSheetByName(GM.SHEETS.REVIEW)) {
    refreshReview();
  }

  if (ss.getSheetByName(GM.SHEETS.REGISTER)) {
    refreshRegister();
  }

  if (ss.getSheetByName(GM.SHEETS.SCHEDULED)) {
    refreshScheduledTransactions();
  }

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  ss.toast(
    createdCount +
      " due transaction" +
      (createdCount === 1 ? " was" : "s were") +
      " created. " +
      reviewCount +
      " require review.",
    GM.APP_NAME,
    6
  );
}


function scheduledOccurrenceExists_(scheduleId, dueKey) {
  const sheet = getManualTransactionsSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return false;
  }

  const map = getHeaderMap_(values[0]);

  if (
    map["Schedule ID"] === undefined ||
    map["Scheduled Due Key"] === undefined
  ) {
    return false;
  }

  for (let index = 1; index < values.length; index++) {
    if (
      String(values[index][map["Schedule ID"]] || "") ===
        scheduleId &&
      String(values[index][map["Scheduled Due Key"]] || "") ===
        dueKey
    ) {
      return true;
    }
  }

  return false;
}


function calculateNextScheduledDate_(dateValue, frequency) {
  const date = new Date(dateValue);

  switch (String(frequency || "")) {
    case "Weekly":
      date.setDate(date.getDate() + 7);
      break;

    case "Every 2 Weeks":
      date.setDate(date.getDate() + 14);
      break;

    case "Monthly":
      date.setMonth(date.getMonth() + 1);
      break;

    case "Quarterly":
      date.setMonth(date.getMonth() + 3);
      break;

    case "Yearly":
      date.setFullYear(date.getFullYear() + 1);
      break;

    default:
      throw new Error(
        "Unsupported recurring frequency: " + frequency
      );
  }

  return startOfScheduledDay_(date);
}


function startOfScheduledDay_(value) {
  const date = value instanceof Date
    ? new Date(value)
    : new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error(
      "A scheduled transaction contains an invalid date."
    );
  }

  date.setHours(0, 0, 0, 0);
  return date;
}


function editSelectedScheduledTransaction() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    throw new Error("Scheduled sheet not found.");
  }

  const row = sheet.getActiveCell().getRow();

  if (row < 19) {
    SpreadsheetApp.getUi().alert(
      "Select a scheduled transaction row first."
    );
    return;
  }

  const scheduleId = String(
    sheet.getRange(row, 11).getValue() || ""
  ).trim();

  if (!scheduleId) {
    SpreadsheetApp.getUi().alert(
      "The selected row is not editable."
    );
    return;
  }

  loadScheduledTransactionIntoForm_(scheduleId);
}


function deleteSelectedScheduledTransaction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    throw new Error("Scheduled sheet not found.");
  }

  const row = sheet.getActiveCell().getRow();

  if (row < 19) {
    SpreadsheetApp.getUi().alert(
      "Select a scheduled transaction row first."
    );
    return;
  }

  const scheduleId = String(
    sheet.getRange(row, 11).getValue() || ""
  ).trim();

  const payee = String(
    sheet.getRange(row, 2).getValue() || ""
  ).trim();

  if (!scheduleId) {
    SpreadsheetApp.getUi().alert(
      "The selected row is not deletable."
    );
    return;
  }

  const response = SpreadsheetApp.getUi().alert(
    "Delete Scheduled Transaction",
    "Delete the recurring schedule for " +
      payee +
      "?\n\nThis cannot be undone.",
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (
    response !== SpreadsheetApp.getUi().Button.YES
  ) {
    return;
  }

  const dataRow =
    findRecurringTransactionRowById_(scheduleId);

  if (!dataRow) {
    SpreadsheetApp.getUi().alert(
      "The scheduled transaction could not be found."
    );
    return;
  }

  getRecurringTransactionsSheet_()
    .deleteRow(dataRow);

  refreshScheduledTransactions();

  ss.toast(
    "Scheduled transaction deleted.",
    GM.APP_NAME,
    4
  );
}


function loadScheduledTransactionIntoForm_(scheduleId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.SCHEDULED);
  const dataSheet = getRecurringTransactionsSheet_();
  const rowNumber =
    findRecurringTransactionRowById_(scheduleId);

  if (!sheet || !rowNumber) {
    throw new Error(
      "The scheduled transaction could not be loaded."
    );
  }

  const headers = dataSheet
    .getRange(1, 1, 1, dataSheet.getLastColumn())
    .getValues()[0];

  const map = getHeaderMap_(headers);

  requireHeaders_(map, [
    "Payee",
    "Amount",
    "Account",
    "Category",
    "Subcategory",
    "Payment Method",
    "Frequency",
    "Next Due",
    "Active",
    "Auto Create",
    "Notes"
  ]);

  const row = dataSheet
    .getRange(
      rowNumber,
      1,
      1,
      dataSheet.getLastColumn()
    )
    .getValues()[0];

  sheet.getRange("B3").setValue(row[map.Payee]);
  sheet.getRange("B4").setValue(row[map.Amount]);
  sheet.getRange("B5").setValue(row[map.Account]);
  sheet.getRange("B6")
    .setValue(row[map.Category]);
  sheet.getRange("B7").setValue(row[map.Subcategory]);
  sheet.getRange("B8")
    .setValue(row[map["Payment Method"]]);
  sheet.getRange("G3").setValue(row[map.Frequency]);
  sheet.getRange("G4").setValue(row[map["Next Due"]]);
  sheet.getRange("G5").setValue(row[map.Active]);
  sheet.getRange("G6").setValue(row[map["Auto Create"]]);
  sheet.getRange("G7").setValue(row[map.Notes]);

  PropertiesService.getUserProperties()
    .setProperty(
      "GM_EDIT_SCHEDULE_ID",
      scheduleId
    );

  sheet.getRange("A1:K1")
    .setValue("Edit Scheduled Transaction");

  sheet.setActiveRange(sheet.getRange("B3"));
}


function getRecurringTransactionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(
    GM.DATABASE.RECURRING_TRANSACTIONS
  );

  if (!sheet) {
    sheet = ss.insertSheet(
      GM.DATABASE.RECURRING_TRANSACTIONS
    );
  }

  const requiredHeaders = [
    "Schedule ID",
    "Payee",
    "Amount",
    "Account",
    "Category",
    "Subcategory",
    "Frequency",
    "Next Due",
    "Active",
    "Auto Create",
    "Notes",
    "Updated By",
    "Updated At",
    "Last Generated Due",
    "Payment Method",
    "Occurrence Limit",
    "Occurrences Generated",
    "Completed At"
  ];

  ensureSheetHeaders_(sheet, requiredHeaders);
  sheet.setFrozenRows(1);

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


function findRecurringTransactionRowById_(scheduleId) {
  const sheet = getRecurringTransactionsSheet_();
  const values = sheet.getDataRange().getValues();
  const map = getHeaderMap_(values[0]);

  if (map["Schedule ID"] === undefined) {
    return 0;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (
      String(
        values[rowIndex][map["Schedule ID"]] || ""
      ).trim() === String(scheduleId || "").trim()
    ) {
      return rowIndex + 1;
    }
  }

  return 0;
}


function ensureSheetHeaders_(sheet, requiredHeaders) {
  if (sheet.getMaxColumns() < requiredHeaders.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredHeaders.length - sheet.getMaxColumns()
    );
  }

  const existing = sheet
    .getRange(
      1,
      1,
      1,
      Math.max(
        sheet.getLastColumn(),
        requiredHeaders.length
      )
    )
    .getValues()[0];

  const existingMap = {};

  existing.forEach(function(header, index) {
    const clean = String(header || "").trim();

    if (clean) {
      existingMap[clean] = index;
    }
  });

  requiredHeaders.forEach(function(header) {
    if (existingMap[header] !== undefined) {
      return;
    }

    let targetColumn = 1;

    while (
      targetColumn <= sheet.getMaxColumns() &&
      String(
        sheet.getRange(1, targetColumn).getValue() || ""
      ).trim() !== ""
    ) {
      targetColumn++;
    }

    if (targetColumn > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }

    sheet.getRange(1, targetColumn).setValue(header);
    existingMap[header] = targetColumn - 1;
  });
}


function clearScheduledEditState_() {
  PropertiesService.getUserProperties()
    .deleteProperty("GM_EDIT_SCHEDULE_ID");
}


function createRecurringTransactionId_() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss"
  );

  const randomPart =
    Math.floor(1000 + Math.random() * 9000);

  return "REC-" + timestamp + "-" + randomPart;
}

