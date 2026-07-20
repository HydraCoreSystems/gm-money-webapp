/**
 * ============================================================
 * Gathering Moss Financial Center
 * Settings.gs
 *
 * Version: 0.19.0
 *
 * Microsoft Money category model:
 * Category -> Subcategory, with each Category tagged Income or
 * Expense. Tagging lives on the Category (not the Subcategory),
 * since Money's own categories carried an Income/Expense identity
 * as part of the category itself, not as a separate field a
 * person could set inconsistently.
 * ============================================================
 */

const GM_SETTINGS_DEFAULT_CATEGORY_STRUCTURE = [
  ["Advertising", "Online Advertising", "Expense"],
  ["Advertising", "Printed Materials", "Expense"],
  ["Advertising", "Promotions & Giveaways", "Expense"],

  ["Automobile", "Fuel", "Expense"],
  ["Automobile", "Maintenance & Repairs", "Expense"],
  ["Automobile", "Mileage", "Expense"],
  ["Automobile", "Parking & Tolls", "Expense"],

  ["Banking", "Bank Fees", "Expense"],
  ["Banking", "Interest Expense", "Expense"],
  ["Banking", "Payment Processing Fees", "Expense"],

  ["Business Services", "Accounting", "Expense"],
  ["Business Services", "Legal", "Expense"],
  ["Business Services", "Professional Services", "Expense"],

  ["Equipment", "Electronics & Sensors", "Expense"],
  ["Equipment", "Pumps & Plumbing", "Expense"],
  ["Equipment", "Tools", "Expense"],
  ["Equipment", "Other Equipment", "Expense"],

  ["Inventory", "Plant Inventory", "Expense"],
  ["Inventory", "Product Components", "Expense"],
  ["Inventory", "Inventory Adjustment", "Expense"],

  ["Meals", "Business Meals", "Expense"],
  ["Meals", "Dining Out", "Expense"],

  ["Office", "Office Supplies", "Expense"],
  ["Office", "Labels & Printed Materials", "Expense"],

  ["Plants & Growing", "Fertilizer & Nutrients", "Expense"],
  ["Plants & Growing", "Growing Media & Amendments", "Expense"],
  ["Plants & Growing", "Pots, Trays & Growing Supplies", "Expense"],
  ["Plants & Growing", "Pest Control", "Expense"],

  ["Product Development", "Research & Development", "Expense"],
  ["Product Development", "Samples & Testing", "Expense"],

  ["Sales Income", "Plant Sales", "Income"],
  ["Sales Income", "3D Printed Product Sales", "Income"],
  ["Sales Income", "HydraTower Sales", "Income"],
  ["Sales Income", "HydraCore Revenue", "Income"],
  ["Sales Income", "PropBox Sales", "Income"],
  ["Sales Income", "Shipping Income", "Income"],
  ["Sales Income", "Other Business Income", "Income"],

  ["Shipping", "Postage", "Expense"],
  ["Shipping", "Packaging Materials", "Expense"],
  ["Shipping", "Damaged or Lost Shipments", "Expense"],

  ["Software & Online Services", "Software Subscriptions", "Expense"],
  ["Software & Online Services", "Website & Domain", "Expense"],
  ["Software & Online Services", "Marketplace Fees", "Expense"],

  ["Taxes & Licenses", "Licenses & Permits", "Expense"],
  ["Taxes & Licenses", "Sales Tax", "Expense"],
  ["Taxes & Licenses", "Other Taxes", "Expense"],

  ["3D Printing", "Filament", "Expense"],
  ["3D Printing", "Printer Parts & Maintenance", "Expense"],

  ["Utilities", "Electric", "Expense"],
  ["Utilities", "Internet", "Expense"],
  ["Utilities", "Phone", "Expense"],
  ["Utilities", "Water", "Expense"],

  ["Other Expense", "Customer Refunds", "Expense"],
  ["Other Expense", "General Business Expense", "Expense"],
  ["Other Expense", "Insurance", "Expense"]
];

const GM_SETTINGS_DEFAULT_TRANSACTION_TYPES = [
  "Expense",
  "Income",
  "Transfer"
];


/* ============================================================
   Build Settings Sheet
============================================================ */

function buildSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.SHEETS.SETTINGS);

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.SETTINGS);
  }

  const preserved = readExistingSettings_(sheet);

  sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  ).breakApart();

  sheet.clear();
  sheet.clearFormats();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(3);

  if (sheet.getMaxColumns() < 12) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      12 - sheet.getMaxColumns()
    );
  }

  const widths = [
    205, 245, 90, 205, 28, 175,
    28, 175, 28, 175, 28, 175
  ];

  widths.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  sheet.setRowHeight(1, 44);

  sheet.getRange("A1:L1")
    .merge()
    .setValue(GM.APP_NAME + " Settings")
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setFontSize(17)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const categoryStructure = sortCategoryStructure_(
    preserved.categoryStructure.length > 0
      ? normalizeCategoryStructure_(preserved.categoryStructure)
      : GM_SETTINGS_DEFAULT_CATEGORY_STRUCTURE.slice()
  );

  const paymentMethods = preserved.paymentMethods.length > 0
    ? uniqueSettingsValues_(preserved.paymentMethods)
    : GM.PAYMENT_METHODS.slice();

  const transactionTypes = preserved.transactionTypes.length > 0
    ? uniqueSettingsValues_(preserved.transactionTypes)
    : GM_SETTINGS_DEFAULT_TRANSACTION_TYPES.slice();

  const frequencies = preserved.frequencies.length > 0
    ? uniqueSettingsValues_(preserved.frequencies)
    : GM.RECURRING_FREQUENCIES.slice();

  buildCategoryStructureSection_(sheet, categoryStructure);

  buildEditableSettingsList_(
    sheet, "D3", "D4", "Payment Methods", paymentMethods, 100
  );

  buildEditableSettingsList_(
    sheet, "F3", "F4", "Transaction Types", transactionTypes, 20
  );

  buildEditableSettingsList_(
    sheet, "H3", "H4", "Frequencies", frequencies, 20
  );

  buildEditableSettingsList_(
    sheet, "J3", "J4", "Yes / No", ["Yes", "No"], 10
  );

  buildSettingsInformationSections_(sheet, preserved.startDate);
  SpreadsheetApp.flush();
}


/* ============================================================
   Categories and Subcategories
============================================================ */

function buildCategoryStructureSection_(sheet, rows) {
  sheet.getRange("A3:C3")
    .setValues([["Category", "Subcategory", "Type"]])
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("A4:C100")
    .setBackground(GM.COLORS.INPUT)
    .setFontColor(GM.COLORS.TEXT)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setWrap(true);

  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Income", "Expense"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange("C4:C100").setDataValidation(typeRule);

  if (rows.length > 0) {
    sheet.getRange(4, 1, Math.min(rows.length, 97), 3)
      .setValues(rows.slice(0, 97));
  }

  sheet.getRange("A3:C3").setNote(
    "Microsoft Money-style structure. Use a broad Category, a more specific Subcategory, and mark each Category Income or Expense. Add or remove rows directly below."
  );
}


/* ============================================================
   Editable Lists
============================================================ */

function buildEditableSettingsList_(
  sheet,
  headerCell,
  firstValueCell,
  title,
  values,
  endRow
) {
  const header = sheet.getRange(headerCell);
  const start = sheet.getRange(firstValueCell);
  const startRow = start.getRow();
  const startColumn = start.getColumn();
  const rowCount = endRow - startRow + 1;

  header
    .setValue(title)
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange(startRow, startColumn, rowCount, 1)
    .setBackground(GM.COLORS.INPUT)
    .setFontColor(GM.COLORS.TEXT)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setWrap(true);

  if (values.length > 0) {
    sheet.getRange(
      startRow,
      startColumn,
      Math.min(values.length, rowCount),
      1
    ).setValues(
      values.slice(0, rowCount).map(function(value) {
        return [value];
      })
    );
  }

  header.setNote(
    "Edit the list directly below. Dropdowns throughout the Financial Center use this live range."
  );
}


/* ============================================================
   Information Sections
============================================================ */

function buildSettingsInformationSections_(sheet, preservedStartDate) {
  sheet.getRange("F24:G24")
    .merge()
    .setValue("System Information")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const systemInfo = [
    ["Version", GM.VERSION],
    ["Build Date", GM.BUILD_DATE],
    ["Application", GM.APP_NAME]
  ];

  sheet.getRange("F25:G27")
    .setValues(systemInfo)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange("F25:F27")
    .setBackground(GM.COLORS.LIGHT)
    .setFontWeight("bold")
    .setFontColor(GM.COLORS.TEXT);

  sheet.getRange("G25:G27")
    .setBackground(GM.COLORS.PANEL)
    .setFontColor(GM.COLORS.TEXT);

  sheet.getRange("H24:H24")
    .setValue("Review Status")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("H25:H27")
    .setValues(GM.REVIEW_STATUS.map(function(value) { return [value]; }))
    .setBackground(GM.COLORS.INPUT)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange("J24:J24")
    .setValue("Tax Status")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("J25:J27")
    .setValues(GM.TAX_STATUS.map(function(value) { return [value]; }))
    .setBackground(GM.COLORS.INPUT)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange("F31:G31")
    .merge()
    .setValue("Financial Controls")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("F32")
    .setValue("Financial Start Date")
    .setFontWeight("bold")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.TEXT);

  sheet.getRange("G32")
    .setValue(preservedStartDate || new Date())
    .setNumberFormat("m/d/yyyy")
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange("F33")
    .setValue("Historical Group")
    .setFontWeight("bold")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.TEXT);

  sheet.getRange("G33")
    .setValue(GM.HISTORICAL.GROUP)
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange("F34")
    .setValue("Archive Rule")
    .setFontWeight("bold")
    .setBackground(GM.COLORS.LIGHT)
    .setFontColor(GM.COLORS.TEXT);

  sheet.getRange("G34")
    .setValue("Uncategorized before start date")
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true, true, true, true, true, true,
      GM.COLORS.BORDER,
      SpreadsheetApp.BorderStyle.SOLID
    );

  PropertiesService.getDocumentProperties()
    .setProperty("GM_FINANCIAL_START_DATE_CELL", "G32");
}


/* ============================================================
   Live Range Access
============================================================ */

function getSettingsListRange_(heading) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.SETTINGS);

  if (!sheet) {
    throw new Error("Settings sheet not found.");
  }

  const definitions = {
    "Categories": "A4:A100",
    "Subcategories": "B4:B100",
    "Payment Methods": "D4:D100",
    "Transaction Types": "F4:F20",
    "Frequencies": "H4:H20",
    "Yes / No": "J4:J10",
    "Review Status": "H25:H27",
    "Tax Status": "J25:J27"
  };

  if (!definitions[heading]) {
    throw new Error('Unknown Settings list: "' + heading + '".');
  }

  return sheet.getRange(definitions[heading]);
}


function getConfiguredCategoryNames_() {
  const rows = getConfiguredCategoryStructure_();
  return uniqueSettingsValues_(rows.map(function(row) { return row[0]; }));
}


function getConfiguredSubcategoryNames_(category) {
  const cleanCategory = String(category || "").trim().toLowerCase();
  const rows = getConfiguredCategoryStructure_();

  const values = rows
    .filter(function(row) {
      return !cleanCategory || row[0].toLowerCase() === cleanCategory;
    })
    .map(function(row) { return row[1]; });

  return uniqueSettingsValues_(values);
}


/**
 * Returns "Income" or "Expense" for a configured Category, read
 * from the Type column in Settings. If the category isn't found,
 * or has no Type set, defaults to "Expense" — the same default
 * the Transaction Type field itself already uses.
 */
function getConfiguredCategoryType_(category) {
  const cleanCategory = String(category || "").trim().toLowerCase();

  if (!cleanCategory) {
    return "Expense";
  }

  const rows = getConfiguredCategoryStructure_();

  const match = rows.find(function(row) {
    return String(row[0] || "").trim().toLowerCase() === cleanCategory;
  });

  if (!match) {
    return "Expense";
  }

  const type = String(match[2] || "").trim();

  return type === "Income" ? "Income" : "Expense";
}


function getConfiguredCategoryStructure_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(GM.SHEETS.SETTINGS);

  if (!sheet) {
    throw new Error("Settings sheet not found.");
  }

  return normalizeCategoryStructure_(sheet.getRange("A4:C100").getDisplayValues());
}


function getConfiguredPaymentMethods_() {
  return readNonblankSettingsRange_(getSettingsListRange_("Payment Methods"));
}


function getConfiguredTransactionTypes_() {
  return readNonblankSettingsRange_(getSettingsListRange_("Transaction Types"));
}


function getConfiguredFrequencies_() {
  return readNonblankSettingsRange_(getSettingsListRange_("Frequencies"));
}


function readNonblankSettingsRange_(range) {
  return uniqueSettingsValues_(range.getValues().map(function(row) {
    return row[0];
  }));
}


/* ============================================================
   Preserve Existing Settings
============================================================ */

function readExistingSettings_(sheet) {
  const result = {
    categoryStructure: [],
    paymentMethods: [],
    transactionTypes: [],
    frequencies: [],
    startDate: null
  };

  if (!sheet || sheet.getLastRow() < 1) {
    return result;
  }

  try {
    result.categoryStructure = readCategoryStructureByHeadings_(sheet);

    result.paymentMethods = readSheetColumnByHeading_(sheet, "Payment Methods");
    result.transactionTypes = readSheetColumnByHeading_(sheet, "Transaction Types");
    result.frequencies = readSheetColumnByHeading_(sheet, "Frequencies");

    const savedCell = PropertiesService
      .getDocumentProperties()
      .getProperty("GM_FINANCIAL_START_DATE_CELL");

    if (savedCell) {
      const value = sheet.getRange(savedCell).getValue();
      if (value instanceof Date && !isNaN(value.getTime())) {
        result.startDate = value;
      }
    }

    if (!result.startDate) {
      const legacyCandidates = ["F16", "H32", "G32"];

      for (let index = 0; index < legacyCandidates.length; index++) {
        const value = sheet.getRange(legacyCandidates[index]).getValue();
        if (value instanceof Date && !isNaN(value.getTime())) {
          result.startDate = value;
          break;
        }
      }
    }
  } catch (error) {}

  return result;
}


function readCategoryStructureByHeadings_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();

  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < values[rowIndex].length - 1; columnIndex++) {
      const first = String(values[rowIndex][columnIndex] || "").trim();
      const second = String(values[rowIndex][columnIndex + 1] || "").trim();

      if (first === "Category" && second === "Subcategory") {
        const third = String(
          values[rowIndex][columnIndex + 2] || ""
        ).trim();

        const hasTypeColumn = third === "Type";
        const rows = [];

        for (let nextRow = rowIndex + 1; nextRow < values.length; nextRow++) {
          const category = String(values[nextRow][columnIndex] || "").trim();
          const subcategory = String(values[nextRow][columnIndex + 1] || "").trim();

          const type = hasTypeColumn
            ? String(values[nextRow][columnIndex + 2] || "").trim()
            : "";

          if (!category && !subcategory) {
            break;
          }

          if (category) {
            rows.push([category, subcategory, type]);
          }
        }

        return normalizeCategoryStructure_(rows);
      }
    }
  }

  return [];
}


function readSheetColumnByHeading_(sheet, heading) {
  const values = sheet.getDataRange().getValues();

  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < values[rowIndex].length; columnIndex++) {
      if (String(values[rowIndex][columnIndex] || "").trim() === heading) {
        const output = [];

        for (let nextRow = rowIndex + 1; nextRow < values.length; nextRow++) {
          const value = String(values[nextRow][columnIndex] || "").trim();
          if (!value) {
            break;
          }
          output.push(value);
        }

        return output;
      }
    }
  }

  return [];
}


/* ============================================================
   Helpers
============================================================ */

function normalizeCategoryStructure_(rows) {
  const categoryTypes = {};

  (rows || []).forEach(function(row) {
    const category = String((row || [])[0] || "").trim();
    const type = String((row || [])[2] || "").trim();

    if (!category) {
      return;
    }

    const key = category.toLowerCase();

    if (
      (type === "Income" || type === "Expense") &&
      !categoryTypes[key]
    ) {
      categoryTypes[key] = type;
    }
  });

  const output = [];
  const seen = new Set();

  (rows || []).forEach(function(row) {
    const category = String((row || [])[0] || "").trim();
    const subcategory = String((row || [])[1] || "").trim();

    if (!category) {
      return;
    }

    const key = (category + "\u0000" + subcategory).toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const type = categoryTypes[category.toLowerCase()] || "Expense";

    output.push([category, subcategory, type]);
  });

  return output;
}


/**
 * Sorts the Category/Subcategory table by Type first (Income
 * before Expense), then Category, then Subcategory within each
 * Category — so every dropdown that reads from this table (Entry,
 * Scheduled, Review, Merchant Manager, and the "live" range-based
 * dropdowns) naturally groups Income and Expense categories
 * together, the closest approximation Sheets allows to Money's
 * indented Income/Expense category tree.
 */
function sortCategoryStructure_(rows) {
  return (rows || []).slice().sort(function(a, b) {
    const typeA = String((a || [])[2] || "Expense");
    const typeB = String((b || [])[2] || "Expense");

    if (typeA !== typeB) {
      return typeA === "Income" ? -1 : 1;
    }

    const categoryA = String((a || [])[0] || "").toLowerCase();
    const categoryB = String((b || [])[0] || "").toLowerCase();

    if (categoryA !== categoryB) {
      return categoryA < categoryB ? -1 : 1;
    }

    const subcategoryA = String((a || [])[1] || "").toLowerCase();
    const subcategoryB = String((b || [])[1] || "").toLowerCase();

    if (subcategoryA === subcategoryB) {
      return 0;
    }

    return subcategoryA < subcategoryB ? -1 : 1;
  });
}


/**
 * Menu command: re-sorts the existing Category/Subcategory table
 * in place — by Type, then Category, then Subcategory — without
 * rebuilding the rest of the Settings sheet. Lets the person clean
 * up the list right after typing in new categories, without
 * needing a full Initialize.
 */
function sortCategoriesAlphabetically() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.SETTINGS);

  if (!sheet) {
    throw new Error(
      'Settings sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  const rows = normalizeCategoryStructure_(
    sheet.getRange("A4:C100").getDisplayValues()
  );

  const sorted = sortCategoryStructure_(rows);

  sheet.getRange("A4:C100").clearContent();

  if (sorted.length > 0) {
    sheet
      .getRange(4, 1, Math.min(sorted.length, 97), 3)
      .setValues(sorted.slice(0, 97));
  }

  SpreadsheetApp.flush();

  ss.toast(
    "Categories sorted by type and name.",
    GM.APP_NAME,
    4
  );
}


function uniqueSettingsValues_(values) {
  const output = [];
  const seen = new Set();

  (values || []).forEach(function(value) {
    const clean = String(value || "").trim();
    const key = clean.toLowerCase();

    if (!clean || seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(clean);
  });

  return output;
}

