/**
 * ============================================================
 * Gathering Moss Financial Center
 * Transactions.gs
 *
 * Version: 0.17.0
 * ============================================================
 */


/* ============================================================
   Review Sheet
============================================================ */

function buildReviewSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(GM.SHEETS.REVIEW);
  const oldInbox = ss.getSheetByName("Inbox");

  if (!sheet && oldInbox) {
    oldInbox.setName(GM.SHEETS.REVIEW);
    sheet = oldInbox;
  }

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.REVIEW);
  }

  sheet
    .getRange(
      1,
      1,
      sheet.getMaxRows(),
      sheet.getMaxColumns()
    )
    .breakApart();

  sheet.clear();
  sheet.clearFormats();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(2);

  sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  ).setBackground(GM.COLORS.PAGE);

  const headers = [
    "Approve",
    "Date",
    "Description",
    "Amount",
    "Category",
    "Subcategory",
    "Account",
    "Institution",
    "Notes",
    "Source Row",
    "Transaction Key"
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet
    .getRange("A2:K2")
    .merge()
    .setValue(
      "Check Approve, complete any missing details, then use " +
      "Gathering Moss → Approve Selected Transactions."
    )
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.HEADER)
    .setFontWeight("bold")
    .setVerticalAlignment("middle");

  sheet.setColumnWidth(1, 75);
  sheet.setColumnWidth(2, 105);
  sheet.setColumnWidth(3, 340);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 190);
  sheet.setColumnWidth(6, 170);
  sheet.setColumnWidth(7, 170);
  sheet.setColumnWidth(8, 120);
  sheet.setColumnWidth(9, 260);
  sheet.setColumnWidth(10, 90);
  sheet.setColumnWidth(11, 120);

  sheet.hideColumns(10, 2);

  refreshReview();
}


/* ============================================================
   Refresh Review
============================================================ */

function refreshReview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = getTillerTransactionsSheet_();
  const review = ss.getSheetByName(GM.SHEETS.REVIEW);

  if (!review) {
    throw new Error(
      'Review sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  prepareReviewBaseColumns_(review);

  const clearRowCount = review.getMaxRows() - 2;

  if (clearRowCount > 0) {
    review
      .getRange(
        3,
        1,
        clearRowCount,
        Math.max(16, review.getLastColumn())
      )
      .clearContent()
      .clearDataValidations()
      .clearNote()
      .clearFormat();

    review
      .getRange(
        1,
        1,
        review.getMaxRows(),
        review.getMaxColumns()
      )
      .setBackground(GM.COLORS.PAGE);
  }

  const records = [];

  addScheduledReviewRecords_(records);
  addBankReviewRecords_(records, source);

  if (records.length === 0) {
    review
      .getRange("A3")
      .setValue("Nothing currently needs review.")
      .setFontStyle("italic")
      .setFontColor("#666666");

    return;
  }

  records.sort(function(a, b) {
    return reviewDateValue_(b.values[1]) -
      reviewDateValue_(a.values[1]);
  });

  const rows = records.map(function(record) {
    return record.values;
  });

  review
    .getRange(3, 1, rows.length, 11)
    .setValues(rows);

  review
    .getRange(3, 1, rows.length, 1)
    .insertCheckboxes();

  review
    .getRange(3, 2, rows.length, 1)
    .setNumberFormat("m/d/yyyy");

  review
    .getRange(3, 4, rows.length, 1)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  applyReviewValidation_(review, rows.length);
  applyReviewFormatting_(review, rows.length);
  applyReviewMemoryNotes_(review, records);

  SpreadsheetApp.flush();
}


/* ============================================================
   Scheduled Review Records
============================================================ */

function addScheduledReviewRecords_(records) {
  const manual = getManualTransactionsSheet_();
  const values = manual.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const map = getHeaderMap_(values[0]);

  const required = [
    "Transaction ID",
    "Date",
    "Payee",
    "Amount",
    "Category",
    "Subcategory",
    "Account",
    "Notes",
    "Status"
  ];

  const missing = required.filter(function(header) {
    return map[header] === undefined;
  });

  if (missing.length > 0) {
    return;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const status = String(row[map.Status] || "").trim();

    if (status !== "Needs Review") {
      continue;
    }

    const payee = String(row[map.Payee] || "").trim();
    const existingCategory = cleanReviewCategory_(
      row[map.Category]
    );

    const existingSubcategory = String(
      row[map.Subcategory] || ""
    ).trim();

    const memory = getMerchantReviewSuggestion_(
      payee,
      existingCategory,
      existingSubcategory
    );

    records.push({
      values: [
        false,
        row[map.Date],
        payee,
        Number(row[map.Amount] || 0),
        memory.category,
        memory.subcategory,
        row[map.Account],
        "Scheduled",
        row[map.Notes],
        -(rowIndex + 1),
        "SCHEDULED|" + row[map["Transaction ID"]]
      ],

      memory: memory
    });
  }
}


/* ============================================================
   Bank Review Records
============================================================ */

function addBankReviewRecords_(records, source) {
  const values = source.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Date",
    "Description",
    "Amount",
    "Account",
    "Category"
  ]);

  const approvedKeys = getApprovedTransactionKeys_();

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const sourceCategory = String(
      row[map.Category] || ""
    ).trim();

    if (
      sourceCategory !== "" &&
      sourceCategory.toLowerCase() !== "uncategorized"
    ) {
      continue;
    }

    const transactionKey = buildTransactionKey_(
      row[map.Date],
      row[map.Description],
      row[map.Amount],
      row[map.Account]
    );

    if (approvedKeys.has(transactionKey)) {
      continue;
    }

    const description = String(
      row[map.Description] || ""
    ).trim();

    const memory = getMerchantReviewSuggestion_(
      description,
      "",
      ""
    );

    records.push({
      values: [
        false,
        row[map.Date],
        description,
        Number(row[map.Amount] || 0),
        memory.category,
        memory.subcategory,
        row[map.Account],
        map.Institution !== undefined
          ? row[map.Institution]
          : "",
        "",
        rowIndex + 1,
        transactionKey
      ],

      memory: memory
    });
  }
}


/* ============================================================
   Merchant Memory Suggestions
============================================================ */

function getMerchantReviewSuggestion_(
  description,
  existingCategory,
  existingSubcategory
) {
  const result = {
    found: false,
    category: cleanReviewCategory_(existingCategory),
    subcategory: String(existingSubcategory || "").trim(),
    confidence: 0,
    merchant: "",
    autoAppliedCategory: false,
    autoAppliedSubcategory: false
  };

  if (
    typeof lookupMerchantMemory_ !== "function"
  ) {
    return result;
  }

  const memory = lookupMerchantMemory_(description);

  if (!memory) {
    return result;
  }

  result.found = true;
  result.confidence = Number(memory.confidence || 0);
  result.merchant = String(memory.merchant || "").trim();

  const canAutoApply =
    typeof merchantMemoryCanAutoApply_ === "function"
      ? merchantMemoryCanAutoApply_(result.confidence)
      : result.confidence >= 90;

  const shouldSuggest =
    typeof merchantMemoryShouldSuggest_ === "function"
      ? merchantMemoryShouldSuggest_(result.confidence)
      : result.confidence >= 70;

  if (!shouldSuggest) {
    return result;
  }

  if (
    !result.category &&
    canAutoApply &&
    cleanReviewCategory_(memory.category)
  ) {
    result.category = cleanReviewCategory_(memory.category);
    result.autoAppliedCategory = true;
  }

  if (
    !result.subcategory &&
    canAutoApply &&
    String(memory.subcategory || "").trim()
  ) {
    result.subcategory = String(
      memory.subcategory || ""
    ).trim();

    result.autoAppliedSubcategory = true;
  }

  return result;
}


/* ============================================================
   Review Validation
============================================================ */

function applyReviewValidation_(review, rowCount) {
  const categoryNames = getConfiguredCategoryNames_();
  const subcategoryNames = getConfiguredSubcategoryNames_("");

  const categoryRule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(categoryNames, true)
    .setAllowInvalid(false)
    .build();

  const subcategoryRule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(subcategoryNames, true)
    .setAllowInvalid(false)
    .build();

  review
    .getRange(3, 5, rowCount, 1)
    .setDataValidation(categoryRule);

  review
    .getRange(3, 6, rowCount, 1)
    .setDataValidation(subcategoryRule);
}


/* ============================================================
   Review Formatting
============================================================ */

function applyReviewFormatting_(review, rowCount) {
  review
    .getRange(3, 1, rowCount, 11)
    .setVerticalAlignment("middle")
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

  review
    .getRange(3, 3, rowCount, 1)
    .setWrap(true);

  review
    .getRange(3, 9, rowCount, 1)
    .setWrap(true);

  review.setConditionalFormatRules([
    SpreadsheetApp
      .newConditionalFormatRule()
      .whenFormulaSatisfied('=$A3=TRUE')
      .setBackground("#E8F5E9")
      .setRanges([
        review.getRange(3, 1, rowCount, 9)
      ])
      .build(),

    SpreadsheetApp
      .newConditionalFormatRule()
      .whenTextEqualTo("Scheduled")
      .setBackground("#FFF8E1")
      .setRanges([
        review.getRange(3, 8, rowCount, 1)
      ])
      .build()
  ]);
}


/* ============================================================
   Merchant Memory Notes
============================================================ */

function applyReviewMemoryNotes_(review, records) {
  records.forEach(function(record, index) {
    const memory = record.memory;

    if (!memory || !memory.found) {
      return;
    }

    const row = index + 3;

    const noteLines = [
      "Merchant Memory",
      "Merchant: " + (
        memory.merchant ||
        String(record.values[2] || "")
      ),
      "Confidence: " + memory.confidence + "%"
    ];

    if (
      memory.autoAppliedCategory ||
      memory.autoAppliedSubcategory
    ) {
      noteLines.push("Values were filled automatically.");
    } else {
      noteLines.push(
        "Memory found, but confidence was not high enough to fill values automatically."
      );
    }

    const note = noteLines.join("\n");

    review
      .getRange(row, 3)
      .setNote(note);

    if (memory.autoAppliedCategory) {
      review
        .getRange(row, 5)
        .setNote(note)
        .setBackground("#EEF7EE")
        .setFontWeight("bold");
    }

    if (memory.autoAppliedSubcategory) {
      review
        .getRange(row, 6)
        .setNote(note)
        .setBackground("#EEF7EE")
        .setFontWeight("bold");
    }
  });
}


/* ============================================================
   Approve Selected Transactions
============================================================ */

function approveSelectedTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const review = ss.getSheetByName(GM.SHEETS.REVIEW);
  const source = getTillerTransactionsSheet_();

  if (!review || review.getLastRow() < 3) {
    SpreadsheetApp
      .getUi()
      .alert(
        "There are no Review transactions to approve."
      );

    return;
  }

  const rowCount = review.getLastRow() - 2;

  const values = review
    .getRange(3, 1, rowCount, 11)
    .getValues();

  const sourceHeaders = source
    .getRange(
      1,
      1,
      1,
      source.getLastColumn()
    )
    .getValues()[0];

  const sourceMap = getHeaderMap_(sourceHeaders);

  requireHeaders_(sourceMap, [
    "Category"
  ]);

  const manual = getManualTransactionsSheet_();
  const manualHeaders = manual
    .getRange(
      1,
      1,
      1,
      manual.getLastColumn()
    )
    .getValues()[0];

  const manualMap = getHeaderMap_(manualHeaders);

  const errors = [];
  const approvedRows = [];
  let approvedCount = 0;

  values.forEach(function(row, index) {
    if (row[0] !== true) {
      return;
    }

    const reviewRow = index + 3;
    const description = String(row[2] || "").trim();
    const category = cleanReviewCategory_(row[4]);
    const subcategory = String(row[5] || "").trim();
    const notes = String(row[8] || "").trim();
    const sourceRow = Number(row[9]);
    const transactionKey = String(row[10] || "").trim();

    if (!category) {
      errors.push(
        "Review row " +
        reviewRow +
        ": choose a Category."
      );

      return;
    }

    if (
      sourceRow < 0 &&
      transactionKey.indexOf("SCHEDULED|") === 0
    ) {
      const approved = approveScheduledReviewTransaction_(
        manual,
        manualMap,
        Math.abs(sourceRow),
        reviewRow,
        description,
        category,
        subcategory,
        notes,
        errors
      );

      if (approved) {
        approvedRows.push(reviewRow);
        approvedCount++;
      }

      return;
    }

    const approved = approveBankReviewTransaction_(
      source,
      sourceMap,
      sourceRow,
      reviewRow,
      description,
      category,
      subcategory,
      notes,
      transactionKey,
      errors
    );

    if (approved) {
      approvedRows.push(reviewRow);
      approvedCount++;
    }
  });

  SpreadsheetApp.flush();

  approvedRows
    .sort(function(a, b) {
      return b - a;
    })
    .forEach(function(rowNumber) {
      review.deleteRow(rowNumber);
    });

  if (ss.getSheetByName(GM.SHEETS.REGISTER)) {
    refreshRegister();
  }

  if (ss.getSheetByName(GM.SHEETS.HOME)) {
    refreshHomeDashboard();
  }

  SpreadsheetApp.flush();

  if (errors.length > 0) {
    SpreadsheetApp
      .getUi()
      .alert(
        "Some transactions were not approved:\n\n" +
        errors.join("\n")
      );
  }

  if (approvedCount > 0) {
    ss.toast(
      approvedCount +
      " transaction" +
      (approvedCount === 1 ? " was" : "s were") +
      " approved.",
      GM.APP_NAME,
      4
    );
  }
}


/* ============================================================
   Approve Scheduled Review Transaction
============================================================ */

function approveScheduledReviewTransaction_(
  manual,
  manualMap,
  manualRow,
  reviewRow,
  description,
  category,
  subcategory,
  notes,
  errors
) {
  if (
    manualRow < 2 ||
    manualRow > manual.getLastRow()
  ) {
    errors.push(
      "Review row " +
      reviewRow +
      ": the scheduled transaction could not be found."
    );

    return false;
  }

  requireHeaders_(manualMap, [
    "Category",
    "Subcategory",
    "Notes",
    "Status"
  ]);

  manual
    .getRange(
      manualRow,
      manualMap.Category + 1
    )
    .setValue(category);

  manual
    .getRange(
      manualRow,
      manualMap.Subcategory + 1
    )
    .setValue(subcategory);

  manual
    .getRange(
      manualRow,
      manualMap.Notes + 1
    )
    .setValue(notes);

  manual
    .getRange(
      manualRow,
      manualMap.Status + 1
    )
    .setValue("Uncleared");

  learnApprovedMerchant_(
    description,
    category,
    subcategory
  );

  return true;
}


/* ============================================================
   Approve Bank Review Transaction
============================================================ */

function approveBankReviewTransaction_(
  source,
  sourceMap,
  sourceRow,
  reviewRow,
  description,
  category,
  subcategory,
  notes,
  transactionKey,
  errors
) {
  if (!sourceRow || sourceRow < 2) {
    errors.push(
      "Review row " +
      reviewRow +
      ": source transaction could not be identified."
    );

    return false;
  }

  if (sourceRow > source.getLastRow()) {
    errors.push(
      "Review row " +
      reviewRow +
      ": source transaction row no longer exists."
    );

    return false;
  }

  if (!transactionKey) {
    errors.push(
      "Review row " +
      reviewRow +
      ": transaction key could not be created."
    );

    return false;
  }

  ensureTillerCategoryExists_(category);

  source
    .getRange(
      sourceRow,
      sourceMap.Category + 1
    )
    .setValue(category);

  if (
    sourceMap["Categorized By"] !== undefined
  ) {
    source
      .getRange(
        sourceRow,
        sourceMap["Categorized By"] + 1
      )
      .setValue(
        Session.getActiveUser().getEmail() ||
        "Gathering Moss"
      );
  }

  if (
    sourceMap["Categorized Date"] !== undefined
  ) {
    source
      .getRange(
        sourceRow,
        sourceMap["Categorized Date"] + 1
      )
      .setValue(new Date());
  }

  saveTransactionMetadata_(
    transactionKey,
    sourceRow,
    subcategory,
    notes,
    "Approved"
  );

  learnApprovedMerchant_(
    description,
    category,
    subcategory
  );

  return true;
}


/* ============================================================
   Category + Subcategory Combination
============================================================ */

/**
 * Combines Category and Subcategory into a single "Category:
 * Subcategory" display string, mirroring how Microsoft Money
 * showed a two-level category in the register even though it
 * was edited as two separate fields.
 *
 * NOT used when writing back to Tiller's own Category column —
 * Tiller enforces its own data validation there, restricted to
 * Tiller's own category list, and a combined string like this
 * will never match it. Approving a transaction writes the plain
 * Category to Tiller; Subcategory is tracked separately in
 * GM_TransactionMeta. This helper is kept in case a combined
 * display string is useful somewhere within Gathering Moss's
 * own sheets, which aren't subject to Tiller's validation.
 */
function combineCategorySubcategory_(category, subcategory) {
  const cleanCategory = String(category || "").trim();
  const cleanSubcategory = String(subcategory || "").trim();

  if (!cleanCategory) {
    return cleanSubcategory;
  }

  if (!cleanSubcategory) {
    return cleanCategory;
  }

  return cleanCategory + ": " + cleanSubcategory;
}


/* ============================================================
   Merchant Learning
============================================================ */

function learnApprovedMerchant_(
  description,
  category,
  subcategory
) {
  if (
    typeof learnMerchant_ !== "function"
  ) {
    return;
  }

  try {
    learnMerchant_(
      description,
      category,
      subcategory
    );
  } catch (error) {
    console.error(
      "Merchant Memory could not learn merchant: " +
      error.message
    );
  }
}


/* ============================================================
   Review Base Columns
============================================================ */

function prepareReviewBaseColumns_(review) {
  const requiredColumns = 16;

  if (
    review.getMaxColumns() < requiredColumns
  ) {
    review.insertColumnsAfter(
      review.getMaxColumns(),
      requiredColumns -
      review.getMaxColumns()
    );
  }

  review.showColumns(1, 9);
  review.hideColumns(10, 2);

  if (review.getMaxColumns() >= 12) {
    review.hideColumns(12, 5);
  }
}


/* ============================================================
   Tiller Transactions
============================================================ */

function getTillerTransactionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const candidates = [
    GM.DATABASE.TRANSACTIONS,
    "Transactions"
  ];

  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {
    const sheet = ss.getSheetByName(
      candidates[index]
    );

    if (sheet) {
      return sheet;
    }
  }

  throw new Error(
    'Tiller transaction sheet not found. Expected "' +
    GM.DATABASE.TRANSACTIONS +
    '" or "Transactions".'
  );
}


/* ============================================================
   Tiller Categories
============================================================ */

function getTillerCategoryNames_() {
  const configured = getConfiguredCategoryNames_();

  return configured.length > 0
    ? configured
    : ["Uncategorized"];
}


/**
 * Tiller enforces its own data validation on its Category column,
 * restricted to whatever category names already exist in Tiller's
 * own Categories sheet — a completely separate list from Gathering
 * Moss's own Category/Subcategory table in Settings. Writing a
 * Gathering Moss category Tiller has never seen before would be
 * rejected by that validation. This adds the category as a new
 * row in Tiller's Categories sheet first (if it isn't already
 * there), so the write that follows always succeeds — the same
 * pattern Backlog.gs already uses for the Historical Income and
 * Historical Expense categories.
 */
function ensureTillerCategoryExists_(categoryName) {
  const cleanName = String(categoryName || "").trim();

  if (!cleanName) {
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const candidates = [
    GM.DATABASE.CATEGORIES,
    "Categories"
  ];

  let sheet = null;

  for (let index = 0; index < candidates.length; index++) {
    sheet = ss.getSheetByName(candidates[index]);

    if (sheet) {
      break;
    }
  }

  if (!sheet) {
    return;
  }

  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    return;
  }

  const map = getHeaderMap_(values[0]);

  if (map.Category === undefined) {
    return;
  }

  const alreadyExists = values.slice(1).some(function(row) {
    return String(row[map.Category] || "")
      .trim()
      .toLowerCase() === cleanName.toLowerCase();
  });

  if (alreadyExists) {
    return;
  }

  const newRow = new Array(values[0].length).fill("");
  newRow[map.Category] = cleanName;

  if (map.Group !== undefined) {
    newRow[map.Group] = "Gathering Moss";
  }

  sheet.appendRow(newRow);
}


/* ============================================================
   Transaction Metadata Sheet
============================================================ */

function getTransactionMetadataSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "GM_TransactionMeta";

  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet
    .getRange(
      1,
      1,
      Math.max(sheet.getMaxRows(), 2),
      Math.max(sheet.getMaxColumns(), 7)
    )
    .clearDataValidations();

  const requiredHeaders = [
    "Transaction Key",
    "Source Row",
    "Subcategory",
    "Notes",
    "Review Status",
    "Updated By",
    "Updated At"
  ];

  ensureSheetHeaders_(
    sheet,
    requiredHeaders
  );

  sheet.setFrozenRows(1);

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}


/* ============================================================
   Approved Keys
============================================================ */

function getApprovedTransactionKeys_() {
  const sheet = getTransactionMetadataSheet_();
  const values = sheet.getDataRange().getValues();
  const approvedKeys = new Set();

  if (values.length < 2) {
    return approvedKeys;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Transaction Key",
    "Review Status"
  ]);

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const key = String(
      values[rowIndex][map["Transaction Key"]] ||
      ""
    ).trim();

    const status = String(
      values[rowIndex][map["Review Status"]] ||
      ""
    ).trim().toLowerCase();

    if (
      key &&
      status === "approved"
    ) {
      approvedKeys.add(key);
    }
  }

  return approvedKeys;
}


/* ============================================================
   Save Transaction Metadata
============================================================ */

function saveTransactionMetadata_(
  transactionKey,
  sourceRow,
  subcategory,
  notes,
  reviewStatus
) {
  const sheet = getTransactionMetadataSheet_();
  const values = sheet.getDataRange().getValues();
  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Transaction Key",
    "Source Row",
    "Subcategory",
    "Notes",
    "Review Status",
    "Updated By",
    "Updated At"
  ]);

  let targetRow = 0;

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    if (
      String(
        values[rowIndex][
          map["Transaction Key"]
        ] || ""
      ).trim() === transactionKey
    ) {
      targetRow = rowIndex + 1;
      break;
    }
  }

  if (!targetRow) {
    targetRow = sheet.getLastRow() + 1;
  }

  const record = new Array(
    sheet.getLastColumn()
  ).fill("");

  record[map["Transaction Key"]] =
    transactionKey;

  record[map["Source Row"]] =
    sourceRow;

  record[map.Subcategory] =
    subcategory;

  record[map.Notes] =
    notes;

  record[map["Review Status"]] =
    reviewStatus;

  record[map["Updated By"]] =
    Session.getActiveUser().getEmail() ||
    "Gathering Moss";

  record[map["Updated At"]] =
    new Date();

  sheet
    .getRange(
      targetRow,
      1,
      1,
      record.length
    )
    .setValues([record]);
}


/* ============================================================
   Transaction Key
============================================================ */

function buildTransactionKey_(
  dateValue,
  description,
  amount,
  account
) {
  const date = dateValue instanceof Date
    ? Utilities.formatDate(
        dateValue,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      )
    : String(dateValue || "").trim();

  const cleanDescription = String(
    description || ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  const numericAmount = Number(amount || 0);

  const cleanAmount = isFinite(numericAmount)
    ? numericAmount.toFixed(2)
    : "0.00";

  const cleanAccount = String(
    account || ""
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return [
    date,
    cleanDescription,
    cleanAmount,
    cleanAccount
  ].join("|");
}


/* ============================================================
   Shared Header Helpers
============================================================ */

function getHeaderMap_(headers) {
  const map = {};

  headers.forEach(function(header, index) {
    const cleanHeader = String(
      header || ""
    ).trim();

    if (cleanHeader !== "") {
      map[cleanHeader] = index;
    }
  });

  return map;
}


function requireHeaders_(
  headerMap,
  requiredHeaders
) {
  const missing = requiredHeaders.filter(
    function(header) {
      return headerMap[header] === undefined;
    }
  );

  if (missing.length > 0) {
    throw new Error(
      "Required column(s) not found: " +
      missing.join(", ")
    );
  }
}


/* ============================================================
   Review Helpers
============================================================ */

function cleanReviewCategory_(value) {
  const category = String(value || "").trim();

  if (
    category.toLowerCase() ===
    "uncategorized"
  ) {
    return "";
  }

  return category;
}


function reviewDateValue_(value) {
  const date = value instanceof Date
    ? value
    : new Date(value);

  if (isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime();
}
