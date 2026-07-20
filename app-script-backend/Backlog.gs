/**
 * ============================================================
 * Gathering Moss Financial Center
 * Backlog.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

/**
 * Bulk-categorizes old uncategorized Tiller transactions so the
 * Review queue can focus on the financial restart date forward.
 */
function archiveHistoricalBacklog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const startDate = getFinancialStartDate_();

  const formattedDate = Utilities.formatDate(
    startDate,
    Session.getScriptTimeZone(),
    "MMMM d, yyyy"
  );

  const response = ui.alert(
    "Archive Historical Backlog",
    "All uncategorized bank transactions dated before " +
      formattedDate +
      " will be assigned to Historical Income or Historical Expense.\n\n" +
      "The transactions will remain in Tiller, but they will no longer " +
      "appear in Review or affect the current workflow.\n\nProceed?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  ensureHistoricalCategories_();

  const transactions = getTillerTransactionsSheet_();
  const values = transactions.getDataRange().getValues();

  if (values.length < 2) {
    ss.toast("No Tiller transactions were found.", GM.APP_NAME, 4);
    return;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Date",
    "Amount",
    "Category"
  ]);

  const categoryValues = [];
  let archivedCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const currentCategory = String(row[map.Category] || "").trim();
    const transactionDate = normalizeBacklogDate_(row[map.Date]);
    let newCategory = currentCategory;

    const isUncategorized =
      currentCategory === "" ||
      currentCategory.toLowerCase() === "uncategorized";

    if (
      isUncategorized &&
      transactionDate &&
      transactionDate.getTime() < startDate.getTime()
    ) {
      const amount = Number(row[map.Amount] || 0);

      if (amount > 0) {
        newCategory = GM.HISTORICAL.INCOME_CATEGORY;
        incomeCount++;
      } else {
        newCategory = GM.HISTORICAL.EXPENSE_CATEGORY;
        expenseCount++;
      }

      archivedCount++;
    }

    categoryValues.push([newCategory]);
  }

  if (archivedCount === 0) {
    ss.toast(
      "No uncategorized transactions were found before the start date.",
      GM.APP_NAME,
      5
    );
    return;
  }

  transactions
    .getRange(2, map.Category + 1, categoryValues.length, 1)
    .setValues(categoryValues);

  SpreadsheetApp.flush();

  if (ss.getSheetByName(GM.SHEETS.REVIEW)) {
    refreshReview();
  }

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  hideBackendSheets();

  ui.alert(
    "Historical Backlog Complete",
    archivedCount + " transactions were archived.\n\n" +
      "Historical Income: " + incomeCount + "\n" +
      "Historical Expense: " + expenseCount + "\n\n" +
      "Financial Start Date: " + formattedDate,
    ui.ButtonSet.OK
  );
}


/**
 * Reads the Financial Start Date from Settings using the cell
 * location that Settings.gs actually recorded when it built the
 * sheet, rather than a hardcoded coordinate that can go stale as
 * the Settings layout evolves.
 */
function getFinancialStartDate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName(GM.SHEETS.SETTINGS);

  if (!settings) {
    throw new Error(
      'Settings sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  const savedCell = PropertiesService
    .getDocumentProperties()
    .getProperty("GM_FINANCIAL_START_DATE_CELL");

  const cellReference = savedCell || "G32";

  const value = settings.getRange(cellReference).getValue();

  if (!(value instanceof Date) || isNaN(value.getTime())) {
    throw new Error(
      "Enter a valid Financial Start Date in Settings cell " +
      cellReference +
      "."
    );
  }

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return date;
}


function ensureHistoricalCategories_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const candidates = [
    GM.DATABASE.CATEGORIES,
    "Categories"
  ];

  let sheet = null;

  for (let i = 0; i < candidates.length; i++) {
    sheet = ss.getSheetByName(candidates[i]);

    if (sheet) {
      break;
    }
  }

  if (!sheet) {
    throw new Error(
      'Tiller Categories sheet not found. Expected "' +
      GM.DATABASE.CATEGORIES +
      '" or "Categories".'
    );
  }

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("The Tiller Categories sheet has no header row.");
  }

  const map = getHeaderMap_(values[0]);

  if (map.Category === undefined) {
    throw new Error(
      'The Tiller Categories sheet does not contain a "Category" column.'
    );
  }

  const existing = new Set(
    values.slice(1).map(function(row) {
      return String(row[map.Category] || "").trim().toLowerCase();
    })
  );

  const categoriesToAdd = [
    {
      name: GM.HISTORICAL.INCOME_CATEGORY,
      type: "Income"
    },
    {
      name: GM.HISTORICAL.EXPENSE_CATEGORY,
      type: "Expense"
    }
  ];

  categoriesToAdd.forEach(function(category) {
    if (existing.has(category.name.toLowerCase())) {
      return;
    }

    const newRow = new Array(values[0].length).fill("");
    newRow[map.Category] = category.name;

    if (map.Group !== undefined) {
      newRow[map.Group] = GM.HISTORICAL.GROUP;
    }

    if (map.Type !== undefined) {
      newRow[map.Type] = category.type;
    }

    if (map.Hide !== undefined) {
      newRow[map.Hide] = "Hide";
    } else if (map["Hide From Reports"] !== undefined) {
      newRow[map["Hide From Reports"]] = "Hide";
    }

    sheet.appendRow(newRow);
  });
}


function normalizeBacklogDate_(value) {
  const date = value instanceof Date
    ? new Date(value)
    : new Date(value);

  if (isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

