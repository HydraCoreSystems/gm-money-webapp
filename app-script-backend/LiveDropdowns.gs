/**
 * ============================================================
 * Gathering Moss Financial Center
 * LiveDropdowns.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

/**
 * Installs range-based dropdowns throughout the Financial Center.
 * Once installed, edits made directly in Settings are reflected
 * automatically without rebuilding the destination sheets.
 */
function installLiveSettingsDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  applyEntryLiveDropdowns_(ss);
  applyScheduledLiveDropdowns_(ss);
  applyReviewLiveDropdowns_(ss);
  applyMerchantManagerLiveDropdowns_(ss);

  SpreadsheetApp.flush();

  ss.toast(
    "Live Settings dropdowns are installed.",
    GM.APP_NAME,
    4
  );
}


function applyEntryLiveDropdowns_(ss) {
  const sheet = ss.getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    return;
  }

  applyLiveValidationByLabel_(
    sheet,
    "Category",
    getSettingsListRange_("Categories")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Subcategory",
    getSettingsListRange_("Subcategories")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Payment Method",
    getSettingsListRange_("Payment Methods")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Transaction Type",
    getSettingsListRange_("Transaction Types")
  );
}


function applyScheduledLiveDropdowns_(ss) {
  const sheet = ss.getSheetByName(GM.SHEETS.SCHEDULED);

  if (!sheet) {
    return;
  }

  applyLiveValidationByLabel_(
    sheet,
    "Category",
    getSettingsListRange_("Categories")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Subcategory",
    getSettingsListRange_("Subcategories")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Payment Method",
    getSettingsListRange_("Payment Methods")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Frequency",
    getSettingsListRange_("Frequencies")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Active",
    getSettingsListRange_("Yes / No")
  );

  applyLiveValidationByLabel_(
    sheet,
    "Auto Create",
    getSettingsListRange_("Yes / No")
  );
}


function applyReviewLiveDropdowns_(ss) {
  const sheet = ss.getSheetByName(GM.SHEETS.REVIEW);

  if (!sheet || sheet.getMaxRows() < 3) {
    return;
  }

  applyLiveValidationByHeader_(
    sheet,
    1,
    3,
    "Category",
    getSettingsListRange_("Categories")
  );

  applyLiveValidationByHeader_(
    sheet,
    1,
    3,
    "Subcategory",
    getSettingsListRange_("Subcategories")
  );
}


function applyMerchantManagerLiveDropdowns_(ss) {
  const sheet = ss.getSheetByName("Merchant Memory");

  if (!sheet || sheet.getMaxRows() < 6) {
    return;
  }

  applyLiveValidationByHeader_(
    sheet,
    5,
    6,
    "Category",
    getSettingsListRange_("Categories")
  );

  applyLiveValidationByHeader_(
    sheet,
    5,
    6,
    "Subcategory",
    getSettingsListRange_("Subcategories")
  );
}


function applyLiveValidationByLabel_(
  sheet,
  label,
  sourceRange
) {
  const data = sheet.getDataRange().getDisplayValues();

  for (
    let rowIndex = 0;
    rowIndex < data.length;
    rowIndex++
  ) {
    for (
      let columnIndex = 0;
      columnIndex < data[rowIndex].length;
      columnIndex++
    ) {
      if (
        String(data[rowIndex][columnIndex] || "").trim() !==
        label
      ) {
        continue;
      }

      if (sheet.isColumnHiddenByUser(columnIndex + 1)) {
        continue;
      }

      const targetColumn = columnIndex + 2;

      if (targetColumn > sheet.getMaxColumns()) {
        return;
      }

      const target = sheet.getRange(
        rowIndex + 1,
        targetColumn
      );

      target.setDataValidation(
        createLiveRangeValidation_(sourceRange)
      );

      return;
    }
  }
}


function applyLiveValidationByHeader_(
  sheet,
  headerRow,
  firstDataRow,
  header,
  sourceRange
) {
  const headers = sheet
    .getRange(
      headerRow,
      1,
      1,
      sheet.getLastColumn()
    )
    .getDisplayValues()[0];

  const index = headers.findIndex(function(value) {
    return String(value || "").trim() === header;
  });

  if (index === -1) {
    return;
  }

  const rowCount =
    sheet.getMaxRows() - firstDataRow + 1;

  sheet.getRange(
    firstDataRow,
    index + 1,
    rowCount,
    1
  ).setDataValidation(
    createLiveRangeValidation_(sourceRange)
  );
}


function createLiveRangeValidation_(sourceRange) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(false)
    .build();
}


/* ============================================================
   Cascading Category → Subcategory
   ============================================================
   Google Apps Script only allows one onEdit(e) simple trigger
   per project, so this single dispatcher watches every edit in
   the spreadsheet and only acts when it lands on a Category
   field/column on a Gathering Moss sheet. When it does, the
   adjacent Subcategory field's dropdown is narrowed to match
   that category, and the current Subcategory value is cleared
   if it no longer belongs to the new category — the same
   behavior Microsoft Money's category picker had.
============================================================ */

function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  try {
    handleFormCategoryCascade_(e, GM.SHEETS.ENTRY, "D9", "D10");
    handleFormCategoryCascade_(e, GM.SHEETS.SCHEDULED, "B6", "B7");
    handleEntryCategoryTypeSync_(e);
  } catch (error) {
    console.error(
      "Gathering Moss cascading dropdown error: " + error.message
    );
  }

  handleEntrySaveCheckbox_(e);
}


/**
 * When the person picks a Category on the Entry form, Transaction
 * Type automatically follows whatever that Category is configured
 * as (Income or Expense) in Settings — the same way Microsoft
 * Money's own categories carried their Income/Expense identity,
 * so the two fields can never end up disagreeing with each other.
 */
function handleEntryCategoryTypeSync_(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== GM.SHEETS.ENTRY) {
    return;
  }

  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) {
    return;
  }

  if (range.getA1Notation() !== "D9") {
    return;
  }

  const category = String(range.getValue() || "").trim();

  if (!category) {
    return;
  }

  const type = getConfiguredCategoryType_(category);

  sheet.getRange("D8").setValue(type);
}


/**
 * Turns the checkbox at Entry!E16 into a real "Save Entry" button.
 * Checking it runs saveEntry() immediately, then the checkbox is
 * reset back to unchecked — success, validation failure, or any
 * unexpected error — so it's never left stuck in the checked
 * state and can be clicked again right away.
 */
function handleEntrySaveCheckbox_(e) {
  const range = e.range;
  const sheet = range.getSheet();

  console.log(
    "Save checkbox handler fired. Sheet: " +
    sheet.getName() +
    ", Cell: " +
    range.getA1Notation() +
    ", Value: " +
    range.getValue()
  );

  if (sheet.getName() !== GM.SHEETS.ENTRY) {
    console.log("Skipped: not the Entry sheet.");
    return;
  }

  if (range.getA1Notation() !== "E16") {
    console.log("Skipped: not cell E16.");
    return;
  }

  if (range.getValue() !== true) {
    console.log("Skipped: checkbox is not checked.");
    return;
  }

  console.log("Conditions matched. Calling saveEntry()...");

  try {
    saveEntry();
    console.log("saveEntry() finished without throwing.");
  } catch (error) {
    console.error(
      "Gathering Moss Save Entry checkbox error: " + error.message
    );
  } finally {
    console.log("Resetting checkbox to false.");
    sheet.getRange("E16").setValue(false);
  }
}


/**
 * Handles single-record form layouts (Entry, Scheduled) where the
 * Category and Subcategory fields sit at fixed, known cells.
 */
function handleFormCategoryCascade_(
  e,
  sheetName,
  categoryCellA1,
  subcategoryCellA1
) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== sheetName) {
    return;
  }

  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) {
    return;
  }

  if (range.getA1Notation() !== categoryCellA1) {
    return;
  }

  applySubcategoryCascade_(
    String(range.getValue() || "").trim(),
    sheet.getRange(subcategoryCellA1)
  );
}


function applySubcategoryCascade_(category, subcategoryRange) {
  const subcategories = category
    ? getConfiguredSubcategoryNames_(category)
    : getConfiguredSubcategoryNames_("");

  if (subcategories.length === 0) {
    subcategoryRange.clearDataValidations();
    subcategoryRange.clearContent();
    return;
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(subcategories, true)
    .setAllowInvalid(false)
    .build();

  subcategoryRange.setDataValidation(rule);

  const currentValue = String(
    subcategoryRange.getValue() || ""
  ).trim();

  if (currentValue && subcategories.indexOf(currentValue) === -1) {
    subcategoryRange.clearContent();
  }
}

