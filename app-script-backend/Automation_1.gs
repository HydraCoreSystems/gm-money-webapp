/**
 * ============================================================
 * Gathering Moss Financial Center
 * Automation.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

const GM_SCHEDULED_TRIGGER_HANDLER =
  "scheduledDailyTrigger";


function installScheduledAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      "Open the Gathering Moss spreadsheet before installing automation."
    );
  }

  PropertiesService.getScriptProperties()
    .setProperty("GM_SPREADSHEET_ID", ss.getId());

  removeScheduledAutomation_(false);

  ScriptApp.newTrigger(
    GM_SCHEDULED_TRIGGER_HANDLER
  )
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();

  ss.toast(
    "Scheduled transaction automation installed. It will run daily around 3:00 AM.",
    GM.APP_NAME,
    6
  );
}


function removeScheduledAutomation() {
  removeScheduledAutomation_(true);
}


function removeScheduledAutomation_(showToast) {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  triggers.forEach(function(trigger) {
    if (
      trigger.getHandlerFunction() ===
      GM_SCHEDULED_TRIGGER_HANDLER
    ) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  if (showToast) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (ss) {
      ss.toast(
        removed > 0
          ? "Scheduled transaction automation removed."
          : "No scheduled transaction automation was installed.",
        GM.APP_NAME,
        5
      );
    }
  }
}


function scheduledDailyTrigger() {
  const spreadsheetId =
    PropertiesService.getScriptProperties()
      .getProperty("GM_SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error(
      "Gathering Moss spreadsheet ID is missing. Run Install Scheduled Automation."
    );
  }

  const ss = SpreadsheetApp.openById(
    spreadsheetId
  );

  processDueScheduledTransactionsForSpreadsheet_(ss);
}


function processDueScheduledTransactionsForSpreadsheet_(ss) {
  const scheduleSheet = ss.getSheetByName(
    GM.DATABASE.RECURRING_TRANSACTIONS
  );

  const manualSheet = ss.getSheetByName(
    GM.DATABASE.MANUAL_TRANSACTIONS
  );

  if (!scheduleSheet || !manualSheet) {
    throw new Error(
      "Scheduled or manual transaction backend sheet is missing."
    );
  }

  ensureAutomationRecurringHeaders_(scheduleSheet);
  ensureAutomationManualHeaders_(manualSheet);

  const scheduleValues =
    scheduleSheet.getDataRange().getValues();

  if (scheduleValues.length < 2) {
    return;
  }

  const scheduleMap =
    automationHeaderMap_(scheduleValues[0]);

  automationRequireHeaders_(scheduleMap, [
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

  const manualValues =
    manualSheet.getDataRange().getValues();

  const manualMap =
    automationHeaderMap_(manualValues[0]);

  automationRequireHeaders_(manualMap, [
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

  const existingOccurrences = new Set();

  for (
    let rowIndex = 1;
    rowIndex < manualValues.length;
    rowIndex++
  ) {
    const scheduleId = String(
      manualValues[rowIndex][
        manualMap["Schedule ID"]
      ] || ""
    ).trim();

    const dueKey = String(
      manualValues[rowIndex][
        manualMap["Scheduled Due Key"]
      ] || ""
    ).trim();

    if (scheduleId && dueKey) {
      existingOccurrences.add(
        scheduleId + "|" + dueKey
      );
    }
  }

  const today = automationStartOfDay_(
    new Date()
  );

  const rowsToAppend = [];

  for (
    let rowIndex = 1;
    rowIndex < scheduleValues.length;
    rowIndex++
  ) {
    const row = scheduleValues[rowIndex];

    if (
      String(row[scheduleMap.Active] || "")
        .trim()
        .toLowerCase() !== "yes"
    ) {
      continue;
    }

    let dueDate = automationStartOfDay_(
      row[scheduleMap["Next Due"]]
    );

    let safety = 0;

    while (dueDate <= today && safety < 24) {
      const scheduleId = String(
        row[scheduleMap["Schedule ID"]] || ""
      ).trim();

      const dueKey = Utilities.formatDate(
        dueDate,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      );

      const occurrenceKey =
        scheduleId + "|" + dueKey;

      if (
        !existingOccurrences.has(occurrenceKey)
      ) {
        const autoCreate =
          String(
            row[scheduleMap["Auto Create"]] || ""
          )
            .trim()
            .toLowerCase() === "yes";

        const outputRow = new Array(
          manualValues[0].length
        ).fill("");

        outputRow[
          manualMap["Transaction ID"]
        ] = createAutomationTransactionId_();

        outputRow[manualMap.Date] =
          new Date(dueDate);

        outputRow[manualMap.Account] =
          row[scheduleMap.Account];

        outputRow[manualMap.Payee] =
          row[scheduleMap.Payee];

        outputRow[manualMap.Amount] =
          Number(row[scheduleMap.Amount] || 0);

        outputRow[manualMap.Category] =
          row[scheduleMap.Category];

        outputRow[
          manualMap.Subcategory
        ] = row[scheduleMap.Subcategory];

        outputRow[
          manualMap["Payment Method"]
        ] = row[scheduleMap["Payment Method"]];

        outputRow[manualMap.Notes] =
          row[scheduleMap.Notes];

        outputRow[manualMap.Source] =
          "Scheduled";

        outputRow[manualMap.Status] =
          autoCreate
            ? "Uncleared"
            : "Needs Review";

        outputRow[
          manualMap["Entered By"]
        ] = "Scheduled Automation";

        outputRow[
          manualMap["Entered At"]
        ] = new Date();

        outputRow[
          manualMap["Schedule ID"]
        ] = scheduleId;

        outputRow[
          manualMap["Scheduled Due Key"]
        ] = dueKey;

        rowsToAppend.push(outputRow);
        existingOccurrences.add(occurrenceKey);
      }

      scheduleSheet
        .getRange(
          rowIndex + 1,
          scheduleMap["Last Generated Due"] + 1
        )
        .setValue(new Date(dueDate));

      dueDate = automationNextDate_(
        dueDate,
        row[scheduleMap.Frequency]
      );

      safety++;
    }

    scheduleSheet
      .getRange(
        rowIndex + 1,
        scheduleMap["Next Due"] + 1
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
}


function ensureAutomationRecurringHeaders_(sheet) {
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
    "Payment Method"
  ];

  ensureAutomationHeaders_(
    sheet,
    requiredHeaders
  );
}


function ensureAutomationManualHeaders_(sheet) {
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

  ensureAutomationHeaders_(
    sheet,
    requiredHeaders
  );
}


function ensureAutomationHeaders_(
  sheet,
  requiredHeaders
) {
  if (
    sheet.getMaxColumns() <
    requiredHeaders.length
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredHeaders.length -
        sheet.getMaxColumns()
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

  const map = automationHeaderMap_(existing);

  requiredHeaders.forEach(function(header) {
    if (map[header] !== undefined) {
      return;
    }

    let targetColumn = 1;

    while (
      targetColumn <= sheet.getMaxColumns() &&
      String(
        sheet
          .getRange(1, targetColumn)
          .getValue() || ""
      ).trim() !== ""
    ) {
      targetColumn++;
    }

    if (
      targetColumn > sheet.getMaxColumns()
    ) {
      sheet.insertColumnAfter(
        sheet.getMaxColumns()
      );
    }

    sheet
      .getRange(1, targetColumn)
      .setValue(header);

    map[header] = targetColumn - 1;
  });
}


function automationHeaderMap_(headers) {
  const map = {};

  headers.forEach(function(header, index) {
    const clean = String(
      header || ""
    ).trim();

    if (clean) {
      map[clean] = index;
    }
  });

  return map;
}


function automationRequireHeaders_(
  map,
  headers
) {
  const missing = headers.filter(
    function(header) {
      return map[header] === undefined;
    }
  );

  if (missing.length > 0) {
    throw new Error(
      "Required scheduled column(s) not found: " +
        missing.join(", ")
    );
  }
}


function automationStartOfDay_(value) {
  const date = value instanceof Date
    ? new Date(value)
    : new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error(
      "A scheduled transaction contains an invalid due date."
    );
  }

  date.setHours(0, 0, 0, 0);
  return date;
}


function automationNextDate_(
  dateValue,
  frequency
) {
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
      date.setFullYear(
        date.getFullYear() + 1
      );
      break;

    default:
      throw new Error(
        "Unsupported recurring frequency: " +
          frequency
      );
  }

  return automationStartOfDay_(date);
}


function createAutomationTransactionId_() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss"
  );

  const randomPart =
    Math.floor(1000 + Math.random() * 9000);

  return (
    "SCH-" +
    timestamp +
    "-" +
    randomPart
  );
}
