/**
 * ============================================================
 * Gathering Moss Financial Center
 * Matching.gs
 *
 * Version: 0.17.0
 * ============================================================
 */


/* ============================================================
   Find Possible Matches
============================================================ */

function findPossibleMatches() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const review = ss.getSheetByName(GM.SHEETS.REVIEW);
  const manual = getManualTransactionsSheet_();

  if (!review || review.getLastRow() < 3) {
    ss.toast(
      "There are no transactions waiting in Review.",
      GM.APP_NAME,
      4
    );
    return;
  }

  prepareMatchingColumns_(review);

  const reviewRowCount = review.getLastRow() - 2;
  const reviewValues = review
    .getRange(3, 1, reviewRowCount, 16)
    .getValues();

  const manualValues = manual.getDataRange().getValues();

  if (manualValues.length < 2) {
    ss.toast(
      "There are no manual transactions available to match.",
      GM.APP_NAME,
      4
    );
    return;
  }

  const manualMap = getHeaderMap_(manualValues[0]);

  requireHeaders_(manualMap, [
    "Transaction ID",
    "Date",
    "Account",
    "Payee",
    "Amount",
    "Category",
    "Subcategory",
    "Notes",
    "Status"
  ]);

  const uncleared = manualValues
    .slice(1)
    .filter(function(row) {
      return String(row[manualMap.Status] || "")
        .trim()
        .toLowerCase() === "uncleared";
    });

  const suggestions = [];
  let matchCount = 0;

  reviewValues.forEach(function(reviewRow) {
    const sourceRow = Number(reviewRow[9]);
    const transactionKey = String(reviewRow[10] || "").trim();

    if (
      sourceRow < 0 ||
      transactionKey.indexOf("SCHEDULED|") === 0
    ) {
      suggestions.push(["", "", "", "", ""]);
      return;
    }

    const bestMatch = findBestManualMatch_(
      reviewRow[1],
      reviewRow[2],
      Number(reviewRow[3] || 0),
      reviewRow[6],
      uncleared,
      manualMap
    );

    if (bestMatch) {
      matchCount++;

      suggestions.push([
        bestMatch.payee,
        bestMatch.date,
        bestMatch.amount,
        bestMatch.confidence + "%",
        bestMatch.transactionId
      ]);
    } else {
      suggestions.push(["", "", "", "", ""]);
    }
  });

  review
    .getRange(3, 12, suggestions.length, 5)
    .setValues(suggestions);

  review
    .getRange(3, 13, suggestions.length, 1)
    .setNumberFormat("m/d/yyyy");

  review
    .getRange(3, 14, suggestions.length, 1)
    .setNumberFormat('$#,##0.00;[Red]-$#,##0.00');

  applyMatchingSuggestionNotes_(review, reviewValues, suggestions);

  review.showColumns(12, 4);
  review.hideColumns(16);

  SpreadsheetApp.flush();

  ss.toast(
    matchCount +
      " possible match" +
      (matchCount === 1 ? " was" : "es were") +
      " found.",
    GM.APP_NAME,
    5
  );
}


/* ============================================================
   Confirm Selected Matches
============================================================ */

function confirmSelectedMatches() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const review = ss.getSheetByName(GM.SHEETS.REVIEW);
  const manual = getManualTransactionsSheet_();
  const source = getTillerTransactionsSheet_();

  if (!review || review.getLastRow() < 3) {
    ss.toast(
      "There are no Review transactions to match.",
      GM.APP_NAME,
      4
    );
    return;
  }

  prepareMatchingColumns_(review);

  const rowCount = review.getLastRow() - 2;
  const reviewValues = review
    .getRange(3, 1, rowCount, 16)
    .getValues();

  const manualValues = manual.getDataRange().getValues();

  if (manualValues.length < 2) {
    ss.toast(
      "There are no manual transactions available to match.",
      GM.APP_NAME,
      4
    );
    return;
  }

  const manualMap = getHeaderMap_(manualValues[0]);

  requireHeaders_(manualMap, [
    "Transaction ID",
    "Payee",
    "Category",
    "Subcategory",
    "Notes",
    "Status",
    "Matched Bank Key"
  ]);

  const sourceHeaders = source
    .getRange(1, 1, 1, source.getLastColumn())
    .getValues()[0];

  const sourceMap = getHeaderMap_(sourceHeaders);

  requireHeaders_(sourceMap, [
    "Category"
  ]);

  const manualRowById = {};

  for (let rowIndex = 1; rowIndex < manualValues.length; rowIndex++) {
    const transactionId = String(
      manualValues[rowIndex][manualMap["Transaction ID"]] || ""
    ).trim();

    if (transactionId) {
      manualRowById[transactionId] = rowIndex + 1;
    }
  }

  const rowsToDelete = [];
  const errors = [];
  let matchedCount = 0;

  reviewValues.forEach(function(row, index) {
    if (row[0] !== true) {
      return;
    }

    const reviewRowNumber = index + 3;
    const sourceRow = Number(row[9]);
    const bankTransactionKey = String(row[10] || "").trim();
    const manualTransactionId = String(row[15] || "").trim();

    if (
      sourceRow < 0 ||
      bankTransactionKey.indexOf("SCHEDULED|") === 0
    ) {
      errors.push(
        "Review row " +
          reviewRowNumber +
          ": scheduled transactions cannot be matched to bank transactions."
      );
      return;
    }

    if (!manualTransactionId) {
      errors.push(
        "Review row " +
          reviewRowNumber +
          ": no suggested manual match is available."
      );
      return;
    }

    const manualRowNumber = manualRowById[manualTransactionId];

    if (!manualRowNumber) {
      errors.push(
        "Review row " +
          reviewRowNumber +
          ": the manual transaction could not be found."
      );
      return;
    }

    if (
      !sourceRow ||
      sourceRow < 2 ||
      sourceRow > source.getLastRow() ||
      !bankTransactionKey
    ) {
      errors.push(
        "Review row " +
          reviewRowNumber +
          ": the bank transaction could not be identified."
      );
      return;
    }

    const manualRecord = manual
      .getRange(
        manualRowNumber,
        1,
        1,
        manual.getLastColumn()
      )
      .getValues()[0];

    const payee = String(
      manualRecord[manualMap.Payee] || ""
    ).trim();

    const category = String(
      manualRecord[manualMap.Category] || ""
    ).trim();

    const subcategory = String(
      manualRecord[manualMap.Subcategory] || ""
    ).trim();

    const notes = String(
      manualRecord[manualMap.Notes] || ""
    ).trim();

    if (!category) {
      errors.push(
        "Review row " +
          reviewRowNumber +
          ": the matched manual transaction has no Category."
      );
      return;
    }

    ensureTillerCategoryExists_(category);

    source
      .getRange(sourceRow, sourceMap.Category + 1)
      .setValue(category);

    if (sourceMap["Categorized By"] !== undefined) {
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

    if (sourceMap["Categorized Date"] !== undefined) {
      source
        .getRange(
          sourceRow,
          sourceMap["Categorized Date"] + 1
        )
        .setValue(new Date());
    }

    manual
      .getRange(
        manualRowNumber,
        manualMap.Status + 1
      )
      .setValue("Cleared");

    manual
      .getRange(
        manualRowNumber,
        manualMap["Matched Bank Key"] + 1
      )
      .setValue(bankTransactionKey);

    saveTransactionMetadata_(
      bankTransactionKey,
      sourceRow,
      subcategory,
      notes,
      "Approved"
    );

    if (typeof learnMerchant_ === "function") {
      learnMerchant_(
        payee || row[2],
        category,
        subcategory
      );

      const bankDescription = String(row[2] || "").trim();

      if (
        bankDescription &&
        normalizeMatchingMerchant_(bankDescription) !==
          normalizeMatchingMerchant_(payee)
      ) {
        learnMerchant_(
          bankDescription,
          category,
          subcategory
        );
      }
    }

    rowsToDelete.push(reviewRowNumber);
    matchedCount++;
  });

  SpreadsheetApp.flush();

  rowsToDelete
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
    SpreadsheetApp.getUi().alert(
      "Some matches could not be completed:\n\n" +
        errors.join("\n")
    );
  }

  if (matchedCount > 0) {
    ss.toast(
      matchedCount +
        " transaction" +
        (matchedCount === 1 ? " was" : "s were") +
        " matched and cleared.",
      GM.APP_NAME,
      5
    );
  }
}


/* ============================================================
   Matching Columns
============================================================ */

function prepareMatchingColumns_(review) {
  const requiredColumns = 16;

  if (review.getMaxColumns() < requiredColumns) {
    review.insertColumnsAfter(
      review.getMaxColumns(),
      requiredColumns - review.getMaxColumns()
    );
  }

  const headers = [
    "Suggested Payee",
    "Manual Date",
    "Manual Amount",
    "Confidence",
    "Manual Transaction ID"
  ];

  review
    .getRange(1, 12, 1, headers.length)
    .setValues([headers])
    .setBackground(GM.COLORS.HEADER)
    .setFontColor(GM.COLORS.WHITE)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  review.setColumnWidth(12, 220);
  review.setColumnWidth(13, 105);
  review.setColumnWidth(14, 115);
  review.setColumnWidth(15, 95);
  review.setColumnWidth(16, 120);

  review.showColumns(12, 4);
  review.hideColumns(16);

  if (review.getLastRow() > 2) {
    review
      .getRange(
        3,
        12,
        review.getLastRow() - 2,
        5
      )
      .clearContent()
      .clearNote()
      .clearFormat();
  }
}


/* ============================================================
   Best Match
============================================================ */

function findBestManualMatch_(
  bankDate,
  bankPayee,
  bankAmount,
  bankAccount,
  unclearedRows,
  manualMap
) {
  let best = null;

  unclearedRows.forEach(function(row) {
    const manualAmount = Number(row[manualMap.Amount] || 0);
    const amountDifference = Math.abs(
      Math.abs(manualAmount) -
        Math.abs(Number(bankAmount || 0))
    );

    if (amountDifference > 0.01) {
      return;
    }

    const manualAccount = String(
      row[manualMap.Account] || ""
    ).trim();

    if (
      normalizeMatchText_(manualAccount) !==
      normalizeMatchText_(bankAccount)
    ) {
      return;
    }

    const dayDifference = dateDifferenceInDays_(
      bankDate,
      row[manualMap.Date]
    );

    if (dayDifference > 7) {
      return;
    }

    const manualPayee = String(
      row[manualMap.Payee] || ""
    ).trim();

    const merchantScore = merchantSimilarityScore_(
      bankPayee,
      manualPayee
    );

    const confidence = calculateMatchConfidence_(
      dayDifference,
      amountDifference,
      merchantScore
    );

    if (confidence < 70) {
      return;
    }

    const candidate = {
      transactionId: String(
        row[manualMap["Transaction ID"]] || ""
      ).trim(),

      date: row[manualMap.Date],
      payee: manualPayee,
      amount: manualAmount,
      confidence: confidence,
      merchantScore: merchantScore,
      dayDifference: dayDifference
    };

    if (
      !best ||
      candidate.confidence > best.confidence ||
      (
        candidate.confidence === best.confidence &&
        candidate.dayDifference < best.dayDifference
      )
    ) {
      best = candidate;
    }
  });

  return best;
}


/* ============================================================
   Match Confidence
============================================================ */

function calculateMatchConfidence_(
  dayDifference,
  amountDifference,
  merchantScore
) {
  const amountScore = amountDifference <= 0.001
    ? 30
    : Math.max(0, 30 - Math.round(amountDifference * 100));

  const dateScore = Math.max(
    0,
    30 - (Math.round(dayDifference) * 4)
  );

  const merchantPoints = Math.round(
    Math.max(0, Math.min(1, merchantScore)) * 40
  );

  return Math.max(
    0,
    Math.min(
      100,
      amountScore + dateScore + merchantPoints
    )
  );
}


/* ============================================================
   Merchant Similarity
============================================================ */

function merchantSimilarityScore_(
  firstValue,
  secondValue
) {
  const first = normalizeMatchingMerchant_(firstValue);
  const second = normalizeMatchingMerchant_(secondValue);

  if (!first || !second) {
    return 0;
  }

  if (first === second) {
    return 1;
  }

  if (
    first.indexOf(second) >= 0 ||
    second.indexOf(first) >= 0
  ) {
    return 0.93;
  }

  const memoryScore = merchantMemorySimilarityBoost_(
    firstValue,
    secondValue
  );

  const tokenScore = matchingTokenSimilarity_(
    first,
    second
  );

  const prefixScore = matchingPrefixSimilarity_(
    first,
    second
  );

  return Math.max(
    memoryScore,
    tokenScore,
    prefixScore
  );
}


function merchantMemorySimilarityBoost_(
  firstValue,
  secondValue
) {
  if (typeof lookupMerchantMemory_ !== "function") {
    return 0;
  }

  const firstMemory = lookupMerchantMemory_(firstValue);
  const secondMemory = lookupMerchantMemory_(secondValue);

  if (
    firstMemory &&
    secondMemory &&
    String(firstMemory.merchantKey || "") &&
    String(firstMemory.merchantKey || "") ===
      String(secondMemory.merchantKey || "")
  ) {
    return 1;
  }

  if (
    firstMemory &&
    normalizeMatchingMerchant_(firstMemory.merchant) ===
      normalizeMatchingMerchant_(secondValue)
  ) {
    return 0.97;
  }

  if (
    secondMemory &&
    normalizeMatchingMerchant_(secondMemory.merchant) ===
      normalizeMatchingMerchant_(firstValue)
  ) {
    return 0.97;
  }

  return 0;
}


function matchingTokenSimilarity_(
  first,
  second
) {
  const firstTokens = first
    .split(" ")
    .filter(Boolean);

  const secondTokens = second
    .split(" ")
    .filter(Boolean);

  if (
    firstTokens.length === 0 ||
    secondTokens.length === 0
  ) {
    return 0;
  }

  const firstSet = new Set(firstTokens);
  const secondSet = new Set(secondTokens);

  let intersection = 0;

  firstSet.forEach(function(token) {
    if (secondSet.has(token)) {
      intersection++;
    }
  });

  const union = new Set(
    firstTokens.concat(secondTokens)
  ).size;

  const jaccard = union > 0
    ? intersection / union
    : 0;

  const coverage = intersection /
    Math.max(
      Math.min(firstSet.size, secondSet.size),
      1
    );

  return Math.max(
    jaccard,
    coverage * 0.9
  );
}


function matchingPrefixSimilarity_(
  first,
  second
) {
  const firstCompact = first.replace(/\s+/g, "");
  const secondCompact = second.replace(/\s+/g, "");

  const minimumLength = Math.min(
    firstCompact.length,
    secondCompact.length
  );

  if (minimumLength < 4) {
    return 0;
  }

  let commonPrefix = 0;

  for (
    let index = 0;
    index < minimumLength;
    index++
  ) {
    if (
      firstCompact.charAt(index) !==
      secondCompact.charAt(index)
    ) {
      break;
    }

    commonPrefix++;
  }

  return commonPrefix / Math.max(
    firstCompact.length,
    secondCompact.length,
    1
  );
}


/* ============================================================
   Merchant Normalization
============================================================ */

function normalizeMatchingMerchant_(value) {
  if (typeof normalizeMerchantKey_ === "function") {
    return normalizeMerchantKey_(value);
  }

  const stopWords = new Set([
    "debit",
    "credit",
    "card",
    "purchase",
    "payment",
    "pos",
    "ach",
    "web",
    "online",
    "pending",
    "check",
    "visa",
    "mastercard",
    "inc",
    "llc",
    "com",
    "co",
    "corp"
  ]);

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(function(token) {
      return token && !stopWords.has(token);
    })
    .join(" ");
}


/* ============================================================
   Suggestion Notes
============================================================ */

function applyMatchingSuggestionNotes_(
  review,
  reviewValues,
  suggestions
) {
  suggestions.forEach(function(suggestion, index) {
    if (!suggestion[4]) {
      return;
    }

    const reviewRow = index + 3;
    const bankDescription = String(
      reviewValues[index][2] || ""
    ).trim();

    const note = [
      "Possible manual transaction match",
      "Bank description: " + bankDescription,
      "Manual payee: " + suggestion[0],
      "Manual date: " + formatMatchingDate_(suggestion[1]),
      "Manual amount: " + suggestion[2],
      "Confidence: " + suggestion[3]
    ].join("\n");

    review
      .getRange(reviewRow, 12)
      .setNote(note)
      .setBackground("#FFF8E1");

    review
      .getRange(reviewRow, 15)
      .setFontWeight("bold");
  });
}


/* ============================================================
   Shared Matching Helpers
============================================================ */

function normalizeMatchText_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function dateDifferenceInDays_(
  firstValue,
  secondValue
) {
  const firstDate = firstValue instanceof Date
    ? new Date(firstValue)
    : new Date(firstValue);

  const secondDate = secondValue instanceof Date
    ? new Date(secondValue)
    : new Date(secondValue);

  if (
    isNaN(firstDate.getTime()) ||
    isNaN(secondDate.getTime())
  ) {
    return 999;
  }

  firstDate.setHours(0, 0, 0, 0);
  secondDate.setHours(0, 0, 0, 0);

  return Math.abs(
    firstDate.getTime() -
      secondDate.getTime()
  ) / 86400000;
}


function formatMatchingDate_(value) {
  const date = value instanceof Date
    ? value
    : new Date(value);

  if (isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "M/d/yyyy"
  );
}
