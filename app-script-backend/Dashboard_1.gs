/**
 * ============================================================
 * Gathering Moss Financial Center
 * Dashboard.gs
 *
 * Version: 0.17.1
 *
 * GM_HOME_OFFSET controls how many blank canvas-colored columns
 * sit as a margin on the left (and, mirrored, on the right) of
 * the dashboard content, so the tiles and panels read as
 * centered in the window rather than pinned to the left edge.
 * ============================================================
 */

const GM_HOME_OFFSET = 2;
const GM_HOME_CONTENT_WIDTH = 12;
const GM_HOME_TOTAL_WIDTH = GM_HOME_CONTENT_WIDTH + (GM_HOME_OFFSET * 2);
const GM_HOME_MARGIN_WIDTH = 20;


function buildHomeDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GM.SHEETS.HOME);

  if (!sheet) {
    sheet = ss.insertSheet(GM.SHEETS.HOME);
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
  sheet.setFrozenRows(2);

  if (sheet.getMaxColumns() < GM_HOME_TOTAL_WIDTH) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      GM_HOME_TOTAL_WIDTH - sheet.getMaxColumns()
    );
  }

  sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  ).setBackground(GM.METRO.CANVAS);

  for (
    let column = 1 + GM_HOME_OFFSET;
    column <= GM_HOME_OFFSET + GM_HOME_CONTENT_WIDTH;
    column++
  ) {
    sheet.setColumnWidth(column, 120);
  }

  for (let column = 1; column <= GM_HOME_OFFSET; column++) {
    sheet.setColumnWidth(column, GM_HOME_MARGIN_WIDTH);
  }

  for (
    let column = GM_HOME_TOTAL_WIDTH - GM_HOME_OFFSET + 1;
    column <= GM_HOME_TOTAL_WIDTH;
    column++
  ) {
    sheet.setColumnWidth(column, GM_HOME_MARGIN_WIDTH);
  }

  sheet.setRowHeight(1, 46);
  sheet.setRowHeight(2, 28);
  sheet.setRowHeight(4, 30);
  sheet.setRowHeights(5, 3, 34);
  sheet.setRowHeight(10, 28);

  sheet.getRange(1, 1 + GM_HOME_OFFSET, 1, 12)
    .merge()
    .setValue(GM.APP_NAME)
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setFontSize(20)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange(2, 1 + GM_HOME_OFFSET, 1, 2)
    .merge()
    .setValue("Version " + GM.VERSION)
    .setFontWeight("bold")
    .setFontColor(GM.METRO.TILE_TEXT_MUTED)
    .setBackground(GM.METRO.CANVAS);

  sheet.getRange(2, 10 + GM_HOME_OFFSET, 1, 3)
    .merge()
    .setValue(
      "Last refreshed: " +
      formatDashboardTimestamp_(new Date())
    )
    .setHorizontalAlignment("right")
    .setFontColor(GM.METRO.TILE_TEXT_MUTED)
    .setBackground(GM.METRO.CANVAS);

  const cardTitles = [
    { title: "Current Cash", color: GM.METRO.TILE_CASH },
    { title: "Projected Cash", color: GM.METRO.TILE_PROJECTED },
    { title: "Income This Month", color: GM.METRO.TILE_INCOME },
    { title: "Expenses This Month", color: GM.METRO.TILE_EXPENSES },
    { title: "Pending Review", color: GM.METRO.TILE_REVIEW },
    { title: "Uncleared", color: GM.METRO.TILE_UNCLEARED }
  ];

  cardTitles.forEach(function(card, index) {
    const startColumn = (index * 2) + 1 + GM_HOME_OFFSET;

    sheet.getRange(4, startColumn, 1, 2)
      .merge()
      .setValue(card.title)
      .setBackground(card.color)
      .setFontColor(GM.METRO.TILE_TEXT)
      .setFontWeight("bold")
      .setFontSize(10)
      .setHorizontalAlignment("left")
      .setVerticalAlignment("middle");

    sheet.getRange(5, startColumn, 3, 2)
      .merge()
      .setValue("--")
      .setBackground(card.color)
      .setFontSize(26)
      .setFontWeight("bold")
      .setFontColor(GM.METRO.TILE_TEXT)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");

    sheet.getRange(4, startColumn, 4, 2)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        GM.METRO.GUTTER,
        SpreadsheetApp.BorderStyle.SOLID_THICK
      );
  });

  sheet.getRange(10, 1 + GM_HOME_OFFSET, 10, 8)
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      GM.METRO.GUTTER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  sheet.getRange(10, 10 + GM_HOME_OFFSET, 10, 3)
    .setBackground(GM.COLORS.PANEL)
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      GM.METRO.GUTTER,
      SpreadsheetApp.BorderStyle.SOLID_THICK
    );

  sheet.getRange(10, 1 + GM_HOME_OFFSET, 1, 8)
    .merge()
    .setValue("Recent Transactions")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold");

  sheet.getRange(10, 10 + GM_HOME_OFFSET, 1, 3)
    .merge()
    .setValue("Account Balances")
    .setBackground(GM.COLORS.PRIMARY)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold");

  sheet.getRange(11, 1 + GM_HOME_OFFSET, 1, 8)
    .setValues([[
      "Date",
      "Payee",
      "Category",
      "Subcategory",
      "Amount",
      "Status",
      "Account",
      "Notes"
    ]])
    .setBackground(GM.COLORS.SAGE)
    .setFontColor(GM.COLORS.DEEP)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange(11, 10 + GM_HOME_OFFSET, 1, 3)
    .setValues([[
      "Account",
      "Balance",
      "Updated"
    ]])
    .setBackground(GM.COLORS.SAGE)
    .setFontColor(GM.COLORS.DEEP)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.setColumnWidth(1 + GM_HOME_OFFSET, 95);
  sheet.setColumnWidth(2 + GM_HOME_OFFSET, 210);
  sheet.setColumnWidth(3 + GM_HOME_OFFSET, 150);
  sheet.setColumnWidth(4 + GM_HOME_OFFSET, 165);
  sheet.setColumnWidth(5 + GM_HOME_OFFSET, 105);
  sheet.setColumnWidth(6 + GM_HOME_OFFSET, 105);
  sheet.setColumnWidth(7 + GM_HOME_OFFSET, 150);
  sheet.setColumnWidth(8 + GM_HOME_OFFSET, 230);
  sheet.setColumnWidth(9 + GM_HOME_OFFSET, 30);
  sheet.setColumnWidth(10 + GM_HOME_OFFSET, 175);
  sheet.setColumnWidth(11 + GM_HOME_OFFSET, 115);
  sheet.setColumnWidth(12 + GM_HOME_OFFSET, 125);

  refreshHomeDashboard();
}


function refreshHomeDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.HOME);

  if (!sheet) {
    throw new Error(
      'Home sheet not found. Run "Initialize Financial Center" first.'
    );
  }

  const balances = getLatestAccountBalances_();

  const currentCash = balances.reduce(
    function(total, item) {
      return total + item.balance;
    },
    0
  );

  const manualSummary =
    getManualDashboardSummary_();

  const projectedCash =
    currentCash +
    manualSummary.unclearedNet;

  const pendingReview =
    getPendingReviewCount_();

  setDashboardCard_(
    sheet, 5, 1 + GM_HOME_OFFSET, 3, 2,
    currentCash,
    "currency"
  );

  setDashboardCard_(
    sheet, 5, 3 + GM_HOME_OFFSET, 3, 2,
    projectedCash,
    "currency"
  );

  setDashboardCard_(
    sheet, 5, 5 + GM_HOME_OFFSET, 3, 2,
    manualSummary.incomeThisMonth,
    "currency"
  );

  setDashboardCard_(
    sheet, 5, 7 + GM_HOME_OFFSET, 3, 2,
    manualSummary.expensesThisMonth,
    "currency"
  );

  setDashboardCard_(
    sheet, 5, 9 + GM_HOME_OFFSET, 3, 2,
    pendingReview,
    "number"
  );

  setDashboardCard_(
    sheet, 5, 11 + GM_HOME_OFFSET, 3, 2,
    manualSummary.unclearedCount,
    "number"
  );

  populateRecentTransactions_(
    sheet,
    manualSummary.recentTransactions
  );

  populateAccountBalances_(
    sheet,
    balances
  );

  sheet.getRange(2, 10 + GM_HOME_OFFSET, 1, 3)
    .setValue(
      "Last refreshed: " +
      formatDashboardTimestamp_(
        new Date()
      )
    )
    .setHorizontalAlignment("right")
    .setFontColor(GM.METRO.TILE_TEXT_MUTED);

  SpreadsheetApp.flush();
}


function setDashboardCard_(
  sheet,
  row,
  column,
  numRows,
  numColumns,
  value,
  type
) {
  const range = sheet.getRange(row, column, numRows, numColumns);

  range.setValue(value);

  if (type === "currency") {
    range.setNumberFormat(
      '$#,##0.00;[Red]-$#,##0.00'
    );
  } else {
    range.setNumberFormat("0");
  }
}


function getManualDashboardSummary_() {
  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();

  const entries = buildRegisterEntries_(manual, source, "");

  const summary = {
    incomeThisMonth: 0,
    expensesThisMonth: 0,
    unclearedNet: 0,
    unclearedCount: 0,
    recentTransactions: []
  };

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  entries.forEach(function(entry) {
    const date = entry.date instanceof Date
      ? entry.date
      : new Date(entry.date);

    const status = String(entry.status || "")
      .trim()
      .toLowerCase();

    if (
      !isNaN(date.getTime()) &&
      date.getMonth() === month &&
      date.getFullYear() === year
    ) {
      if (entry.amount > 0) {
        summary.incomeThisMonth += entry.amount;
      } else if (entry.amount < 0) {
        summary.expensesThisMonth += Math.abs(entry.amount);
      }
    }

    if (status === "uncleared") {
      summary.unclearedNet += entry.amount;
      summary.unclearedCount++;
    }
  });

  summary.recentTransactions = entries
    .slice()
    .sort(function(a, b) {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateB - dateA;
      }

      return 0;
    })
    .slice(0, 8)
    .map(function(entry) {
      return [
        entry.date,
        entry.payee,
        entry.category,
        entry.subcategory,
        entry.amount,
        entry.status,
        entry.account,
        entry.notes
      ];
    });

  return summary;
}


function getPendingReviewCount_() {
  const source =
    getTillerTransactionsSheet_();

  const values =
    source.getDataRange().getValues();

  if (values.length < 2) {
    return 0;
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Date",
    "Description",
    "Amount",
    "Account",
    "Category"
  ]);

  const approvedKeys =
    getApprovedTransactionKeys_();

  let count = 0;

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    const category = String(
      row[map.Category] || ""
    ).trim();

    if (
      category !== "" &&
      category.toLowerCase() !==
        "uncategorized"
    ) {
      continue;
    }

    const transactionKey =
      buildTransactionKey_(
        row[map.Date],
        row[map.Description],
        row[map.Amount],
        row[map.Account]
      );

    if (
      !approvedKeys.has(
        transactionKey
      )
    ) {
      count++;
    }
  }

  return count;
}


function getLatestAccountBalances_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName("Balance History");

  if (!sheet) {
    throw new Error(
      'Tiller sheet "Balance History" was not found.'
    );
  }

  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const map = getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Date",
    "Time",
    "Account",
    "Balance"
  ]);

  const latestByAccount = {};

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    const account = String(
      row[map.Account] || ""
    ).trim();

    if (!account) {
      continue;
    }

    const timestamp =
      combineBalanceDateTime_(
        row[map.Date],
        row[map.Time]
      );

    if (
      !latestByAccount[account] ||
      timestamp >
        latestByAccount[account].timestamp
    ) {
      const balance = Number(
        row[map.Balance]
      );

      latestByAccount[account] = {
        account: account,
        balance: isFinite(balance)
          ? balance
          : 0,
        timestamp: timestamp
      };
    }
  }

  return Object.keys(
    latestByAccount
  )
    .map(function(account) {
      return latestByAccount[account];
    })
    .sort(function(a, b) {
      return a.account.localeCompare(
        b.account
      );
    });
}


function populateRecentTransactions_(
  sheet,
  transactions
) {
  sheet.getRange(12, 1 + GM_HOME_OFFSET, 8, 8)
    .clearContent()
    .clearFormat();

  if (transactions.length === 0) {
    sheet.getRange(12, 1 + GM_HOME_OFFSET)
      .setValue(
        "No manual transactions have been entered yet."
      )
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    return;
  }

  sheet.getRange(
    12,
    1 + GM_HOME_OFFSET,
    transactions.length,
    8
  )
    .setValues(transactions)
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

  sheet.getRange(
    12,
    1 + GM_HOME_OFFSET,
    transactions.length,
    1
  )
    .setNumberFormat("m/d/yyyy");

  sheet.getRange(
    12,
    2 + GM_HOME_OFFSET,
    transactions.length,
    1
  )
    .setWrap(true);

  sheet.getRange(
    12,
    8 + GM_HOME_OFFSET,
    transactions.length,
    1
  )
    .setWrap(true);

  sheet.getRange(
    12,
    5 + GM_HOME_OFFSET,
    transactions.length,
    1
  )
    .setNumberFormat(
      '$#,##0.00;[Red]-$#,##0.00'
    );

  sheet.autoResizeRows(12, transactions.length);
}


function populateAccountBalances_(
  sheet,
  balances
) {
  sheet.getRange(12, 10 + GM_HOME_OFFSET, 8, 3)
    .clearContent()
    .clearFormat();

  if (balances.length === 0) {
    sheet.getRange(12, 10 + GM_HOME_OFFSET)
      .setValue(
        "No account balances found."
      )
      .setFontStyle("italic")
      .setFontColor(GM.COLORS.MUTED);

    return;
  }

  const output = balances
    .slice(0, 8)
    .map(function(item) {
      return [
        item.account,
        item.balance,
        new Date(item.timestamp)
      ];
    });

  sheet.getRange(
    12,
    10 + GM_HOME_OFFSET,
    output.length,
    3
  )
    .setValues(output)
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

  sheet.getRange(
    12,
    11 + GM_HOME_OFFSET,
    output.length,
    1
  )
    .setNumberFormat(
      '$#,##0.00;[Red]-$#,##0.00'
    );

  sheet.getRange(
    12,
    12 + GM_HOME_OFFSET,
    output.length,
    1
  )
    .setNumberFormat(
      "m/d/yyyy h:mm AM/PM"
    );
}


function formatDashboardTimestamp_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "MMM d, yyyy h:mm a"
  );
}
