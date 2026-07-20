/**
 * ============================================================
 * Gathering Moss Financial Center
 * MerchantManager.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

const GM_MERCHANT_MANAGER_SHEET = "Merchant Memory";


/* ============================================================
   Build Merchant Manager
============================================================ */

function buildMerchantManagerSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(GM_MERCHANT_MANAGER_SHEET);
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
  sheet.setFrozenRows(5);

  sheet.setColumnWidth(1, 55);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 250);
  sheet.setColumnWidth(4, 190);
  sheet.setColumnWidth(5, 170);
  sheet.setColumnWidth(6, 95);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 110);
  sheet.setColumnWidth(10, 90);
  sheet.setColumnWidth(11, 150);

  sheet.setRowHeight(1, 42);
  sheet.setRowHeight(2, 28);
  sheet.setRowHeight(3, 34);
  sheet.setRowHeight(4, 28);
  sheet.setRowHeight(5, 30);

  sheet.getRange("A1:K1")
    .merge()
    .setValue("Merchant Memory")
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontSize(18)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A2:B2")
    .merge()
    .setValue("Learned Merchants")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("C2:D2")
    .merge()
    .setValue("Auto-Ready")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER)
    .setHorizontalAlignment("right");

  sheet.getRange("E2:F2")
    .merge()
    .setValue("0")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true);

  sheet.getRange("G2:H2")
    .merge()
    .setValue("Locked")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER)
    .setHorizontalAlignment("right");

  sheet.getRange("I2:J2")
    .merge()
    .setValue("0")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true);

  sheet.getRange("K2")
    .setValue("0 total")
    .setBackground("#F7FBF7")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true);

  sheet.getRange("A3:B3")
    .merge()
    .setValue("Search")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER);

  sheet.getRange("C3:F3")
    .merge()
    .setBackground("#F7FBF7")
    .setBorder(true, true, true, true, true, true);

  sheet.getRange("G3:H3")
    .merge()
    .setValue("Confidence")
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.HEADER)
    .setHorizontalAlignment("right");

  const confidenceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      ["All", "Auto-Ready", "Learning", "Locked"],
      true
    )
    .setAllowInvalid(false)
    .build();

  sheet.getRange("I3:K3")
    .merge()
    .setValue("All")
    .setBackground("#F7FBF7")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setDataValidation(confidenceRule)
    .setBorder(true, true, true, true, true, true);

  sheet.getRange("A4:K4")
    .merge()
    .setValue(
      "Select a merchant row, then use Gathering Moss → Merchant Memory to edit, lock, unlock, or delete it."
    )
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.HEADER)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const headers = [
    "Select",
    "Preferred Merchant",
    "Merchant Key",
    "Category",
    "Subcategory",
    "Times Used",
    "Confidence",
    "First Seen",
    "Last Seen",
    "Locked",
    "Status"
  ];

  sheet.getRange(5, 1, 1, headers.length)
    .setValues([headers])
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.hideColumns(3);

  refreshMerchantManager();
}


/* ============================================================
   Refresh Merchant Manager
============================================================ */

function refreshMerchantManager() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!sheet) {
    throw new Error(
      'Merchant Memory sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow > 5) {
    sheet.getRange(6, 1, lastRow - 5, 11)
      .clearContent()
      .clearDataValidations()
      .clearNote()
      .clearFormat();
  }

  const memorySheet = getMerchantMemorySheet_();
  const values = memorySheet.getDataRange().getValues();

  if (values.length < 2) {
    updateMerchantManagerStats_(sheet, {
      merchants: 0,
      autoLearned: 0,
      locked: 0
    });

    sheet.getRange("A6")
      .setValue("No merchants have been learned yet.")
      .setFontStyle("italic")
      .setFontColor("#666666");

    return;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Merchant Key",
    "Preferred Merchant",
    "Category",
    "Subcategory",
    "Times Used",
    "First Seen",
    "Last Seen",
    "Confidence",
    "Locked"
  ]);

  const searchText = normalizeMerchantManagerSearch_(
    sheet.getRange("C3").getValue()
  );

  const filter = String(
    sheet.getRange("I3").getValue() || "All"
  ).trim();

  const records = values.slice(1)
    .filter(function(row) {
      return String(row[map["Merchant Key"]] || "").trim() !== "";
    })
    .map(function(row) {
      const confidence = Number(row[map.Confidence] || 0);
      const locked = String(row[map.Locked] || "")
        .trim()
        .toLowerCase() === "yes";

      return {
        merchantKey: String(row[map["Merchant Key"]] || "").trim(),
        merchant: String(row[map["Preferred Merchant"]] || "").trim(),
        category: String(row[map.Category] || "").trim(),
        subcategory: String(row[map.Subcategory] || "").trim(),
        timesUsed: Number(row[map["Times Used"]] || 0),
        firstSeen: row[map["First Seen"]],
        lastSeen: row[map["Last Seen"]],
        confidence: confidence,
        locked: locked,
        status: merchantManagerStatus_(confidence, locked)
      };
    });

  const stats = {
    merchants: records.length,
    autoLearned: records.filter(function(record) {
      return record.confidence >= GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE;
    }).length,
    locked: records.filter(function(record) {
      return record.locked;
    }).length
  };

  updateMerchantManagerStats_(sheet, stats);

  const filtered = records.filter(function(record) {
    if (searchText) {
      const haystack = normalizeMerchantManagerSearch_([
        record.merchant,
        record.merchantKey,
        record.category,
        record.subcategory
      ].join(" "));

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
    if (a.locked !== b.locked) {
      return a.locked ? -1 : 1;
    }

    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }

    return a.merchant.localeCompare(b.merchant);
  });

  if (filtered.length === 0) {
    sheet.getRange("A6")
      .setValue("No merchants match the current search or filter.")
      .setFontStyle("italic")
      .setFontColor("#666666");

    return;
  }

  const output = filtered.map(function(record) {
    return [
      false,
      record.merchant,
      record.merchantKey,
      record.category,
      record.subcategory,
      record.timesUsed,
      record.confidence,
      record.firstSeen,
      record.lastSeen,
      record.locked ? "Yes" : "No",
      record.status
    ];
  });

  sheet.getRange(6, 1, output.length, 11)
    .setValues(output)
    .setVerticalAlignment("middle")
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#D7DDE1",
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange(6, 1, output.length, 1)
    .insertCheckboxes();

  sheet.getRange(6, 6, output.length, 2)
    .setNumberFormat("0");

  sheet.getRange(6, 8, output.length, 2)
    .setNumberFormat("m/d/yyyy");

  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(getTillerCategoryNames_(), true)
    .setAllowInvalid(false)
    .build();

  const subcategoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(getConfiguredSubcategoryNames_(""), true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(6, 4, output.length, 1)
    .setDataValidation(categoryRule);

  sheet.getRange(6, 5, output.length, 1)
    .setDataValidation(subcategoryRule);

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$A6=TRUE')
      .setBackground("#E8F5E9")
      .setRanges([
        sheet.getRange(6, 1, output.length, 11)
      ])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThanOrEqualTo(
        GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
      )
      .setBackground("#E8F5E9")
      .setFontColor("#1B5E20")
      .setRanges([
        sheet.getRange(6, 7, output.length, 1)
      ])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Yes")
      .setBackground("#E3F2FD")
      .setFontColor("#0D47A1")
      .setRanges([
        sheet.getRange(6, 10, output.length, 1)
      ])
      .build()
  ]);

  SpreadsheetApp.flush();
}


/* ============================================================
   Apply Merchant Manager Filter
============================================================ */

function applyMerchantManagerFilter() {
  refreshMerchantManager();
}


function clearMerchantManagerFilter() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!sheet) {
    throw new Error("Merchant Memory sheet not found.");
  }

  sheet.getRange("C3").clearContent();
  sheet.getRange("I3").setValue("All");

  refreshMerchantManager();
}


/* ============================================================
   Save Edited Merchant Rows
============================================================ */

function saveSelectedMerchantMemoryRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const manager = ss.getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!manager || manager.getLastRow() < 6) {
    ss.toast("There are no merchant rows to save.", GM.APP_NAME, 4);
    return;
  }

  const values = manager
    .getRange(6, 1, manager.getLastRow() - 5, 11)
    .getValues();

  const memory = getMerchantMemorySheet_();
  const memoryValues = memory.getDataRange().getValues();
  const map = getHeaderMap_(memoryValues[0]);
  const rowByKey = {};

  for (let index = 1; index < memoryValues.length; index++) {
    const key = String(
      memoryValues[index][map["Merchant Key"]] || ""
    ).trim();

    if (key) {
      rowByKey[key] = index + 1;
    }
  }

  const errors = [];
  let savedCount = 0;

  values.forEach(function(row, index) {
    if (row[0] !== true) {
      return;
    }

    const managerRow = index + 6;
    const preferredMerchant = String(row[1] || "").trim();
    const originalKey = String(row[2] || "").trim();
    const category = String(row[3] || "").trim();
    const subcategory = String(row[4] || "").trim();

    if (!originalKey || !rowByKey[originalKey]) {
      errors.push(
        "Row " + managerRow + ": the merchant record could not be found."
      );
      return;
    }

    if (!preferredMerchant) {
      errors.push(
        "Row " + managerRow + ": Preferred Merchant cannot be blank."
      );
      return;
    }

    if (!category) {
      errors.push(
        "Row " + managerRow + ": choose a Category."
      );
      return;
    }

    const memoryRow = rowByKey[originalKey];
    const newKey = normalizeMerchantKey_(preferredMerchant);

    memory.getRange(memoryRow, map["Merchant Key"] + 1)
      .setValue(newKey);

    memory.getRange(memoryRow, map["Preferred Merchant"] + 1)
      .setValue(preferredMerchant);

    memory.getRange(memoryRow, map.Category + 1)
      .setValue(category);

    memory.getRange(memoryRow, map.Subcategory + 1)
      .setValue(subcategory);

    memory.getRange(memoryRow, map["Last Seen"] + 1)
      .setValue(new Date());

    savedCount++;
  });

  SpreadsheetApp.flush();
  refreshMerchantManager();

  if (errors.length > 0) {
    SpreadsheetApp.getUi().alert(
      "Some merchant changes were not saved:\n\n" +
        errors.join("\n")
    );
  }

  if (savedCount > 0) {
    ss.toast(
      savedCount +
        " merchant record" +
        (savedCount === 1 ? " was" : "s were") +
        " updated.",
      GM.APP_NAME,
      5
    );
  }
}


/* ============================================================
   Lock Selected Merchants
============================================================ */

function lockSelectedMerchantMemory() {
  updateSelectedMerchantLocks_(true);
}


function unlockSelectedMerchantMemory() {
  updateSelectedMerchantLocks_(false);
}


function updateSelectedMerchantLocks_(lockValue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const manager = ss.getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!manager || manager.getLastRow() < 6) {
    ss.toast("There are no merchant rows to update.", GM.APP_NAME, 4);
    return;
  }

  const values = manager
    .getRange(6, 1, manager.getLastRow() - 5, 11)
    .getValues();

  const memory = getMerchantMemorySheet_();
  const memoryValues = memory.getDataRange().getValues();
  const map = getHeaderMap_(memoryValues[0]);
  const rowByKey = {};

  for (let index = 1; index < memoryValues.length; index++) {
    const key = String(
      memoryValues[index][map["Merchant Key"]] || ""
    ).trim();

    if (key) {
      rowByKey[key] = index + 1;
    }
  }

  let updated = 0;

  values.forEach(function(row) {
    if (row[0] !== true) {
      return;
    }

    const key = String(row[2] || "").trim();
    const memoryRow = rowByKey[key];

    if (!memoryRow) {
      return;
    }

    memory.getRange(memoryRow, map.Locked + 1)
      .setValue(lockValue ? "Yes" : "No");

    updated++;
  });

  SpreadsheetApp.flush();
  refreshMerchantManager();

  ss.toast(
    updated +
      " merchant record" +
      (updated === 1 ? " was" : "s were") +
      (lockValue ? " locked." : " unlocked."),
    GM.APP_NAME,
    5
  );
}


/* ============================================================
   Delete Selected Merchants
============================================================ */

function deleteSelectedMerchantMemory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const manager = ss.getSheetByName(GM_MERCHANT_MANAGER_SHEET);

  if (!manager || manager.getLastRow() < 6) {
    ss.toast("There are no merchant rows to delete.", GM.APP_NAME, 4);
    return;
  }

  const values = manager
    .getRange(6, 1, manager.getLastRow() - 5, 11)
    .getValues();

  const selected = values.filter(function(row) {
    return row[0] === true && String(row[2] || "").trim() !== "";
  });

  if (selected.length === 0) {
    ui.alert("Check at least one merchant row first.");
    return;
  }

  const response = ui.alert(
    "Delete Merchant Memory",
    "Delete " +
      selected.length +
      " selected merchant record" +
      (selected.length === 1 ? "" : "s") +
      "?\n\nThis removes the learned merchant rules and cannot be undone.",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const keys = new Set(
    selected.map(function(row) {
      return String(row[2] || "").trim();
    })
  );

  const memory = getMerchantMemorySheet_();
  const memoryValues = memory.getDataRange().getValues();
  const map = getHeaderMap_(memoryValues[0]);
  const rowsToDelete = [];

  for (let index = 1; index < memoryValues.length; index++) {
    const key = String(
      memoryValues[index][map["Merchant Key"]] || ""
    ).trim();

    if (keys.has(key)) {
      rowsToDelete.push(index + 1);
    }
  }

  rowsToDelete
    .sort(function(a, b) {
      return b - a;
    })
    .forEach(function(rowNumber) {
      memory.deleteRow(rowNumber);
    });

  SpreadsheetApp.flush();
  refreshMerchantManager();

  ss.toast(
    rowsToDelete.length +
      " merchant record" +
      (rowsToDelete.length === 1 ? " was" : "s were") +
      " deleted.",
    GM.APP_NAME,
    5
  );
}


/* ============================================================
   Rebuild Merchant Memory
============================================================ */

function rebuildMerchantMemoryFromHistory() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    "Rebuild Merchant Memory",
    "Rebuild merchant memory from existing manual transaction history?\n\n" +
      "This replaces the current learned merchant records.",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  rebuildMerchantMemory_();
  refreshMerchantManager();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Merchant Memory was rebuilt from transaction history.",
    GM.APP_NAME,
    5
  );
}


/* ============================================================
   Merchant Manager Helpers
============================================================ */

function updateMerchantManagerStats_(sheet, stats) {
  sheet.getRange("E2:F2")
    .setValue(Number(stats.autoLearned || 0));

  sheet.getRange("I2:J2")
    .setValue(Number(stats.locked || 0));

  sheet.getRange("K2")
    .setValue(Number(stats.merchants || 0) + " total");
}


function merchantManagerStatus_(confidence, locked) {
  if (locked) {
    return "Locked";
  }

  if (
    Number(confidence || 0) >=
    GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
  ) {
    return "Auto-Ready";
  }

  return "Learning";
}


function normalizeMerchantManagerSearch_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

