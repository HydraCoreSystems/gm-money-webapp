/**
 * ============================================================
 * Gathering Moss Financial Center
 * MerchantMemory.gs
 *
 * Version: 0.17.0
 *
 * Merchant Memory
 *
 * Learns merchants as transactions are approved and
 * automatically suggests Category / Subcategory for
 * future transactions.
 *
 * Database:
 *   GM_MerchantMemory
 *
 * All confidence math reads from GM.MERCHANT_MEMORY in
 * Config.gs, so there is one source of truth for the
 * thresholds instead of duplicated numbers.
 *
 * ============================================================
 */

const GM_MERCHANT_MEMORY = {
  SHEET: "GM_MerchantMemory",

  HEADERS: [
    "Merchant Key",
    "Preferred Merchant",
    "Category",
    "Subcategory",
    "Times Used",
    "First Seen",
    "Last Seen",
    "Confidence",
    "Locked"
  ]
};


/* ============================================================
   Sheet
============================================================ */

function getMerchantMemorySheet_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    ss.getSheetByName(GM_MERCHANT_MEMORY.SHEET);

  if (!sheet) {

    sheet =
      ss.insertSheet(GM_MERCHANT_MEMORY.SHEET);

    sheet
      .getRange(
        1,
        1,
        1,
        GM_MERCHANT_MEMORY.HEADERS.length
      )
      .setValues([
        GM_MERCHANT_MEMORY.HEADERS
      ]);

    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }

  return sheet;
}


/* ============================================================
   Public Lookup
============================================================ */

function lookupMerchantMemory_(merchantName) {

  const key =
    normalizeMerchantKey_(merchantName);

  if (!key) return null;

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2)
    return null;

  for (let i = 1; i < values.length; i++) {

    if (
      String(values[i][0]) === key
    ) {

      return {

        merchantKey:
          values[i][0],

        merchant:
          values[i][1],

        category:
          values[i][2],

        subcategory:
          values[i][3],

        uses:
          Number(values[i][4]),

        firstSeen:
          values[i][5],

        lastSeen:
          values[i][6],

        confidence:
          Number(values[i][7]),

        locked:
          String(values[i][8])
            .toLowerCase() === "yes"

      };

    }

  }

  return null;

}


/* ============================================================
   Learn
============================================================ */

function learnMerchant_(

  merchant,

  category,

  subcategory

) {

  merchant =
    String(merchant || "").trim();

  category =
    String(category || "").trim();

  subcategory =
    String(subcategory || "").trim();

  if (
    !merchant ||
    !category
  ) {
    return;
  }

  const key =
    normalizeMerchantKey_(merchant);

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  const now =
    new Date();

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(values[i][0]) !== key
    ) {
      continue;
    }

    const row = i + 1;

    const locked =
      String(values[i][8])
        .toLowerCase() === "yes";

    const uses =
      Number(values[i][4] || 0) + 1;

    let confidence =
      Number(
        values[i][7] ||
        GM.MERCHANT_MEMORY.STARTING_CONFIDENCE
      );

    if (!locked) {

      if (
        values[i][2] === category &&
        values[i][3] === subcategory
      ) {

        confidence =
          Math.min(
            100,
            confidence +
              GM.MERCHANT_MEMORY.REPEAT_MATCH_INCREASE
          );

      } else {

        confidence =
          Math.max(
            GM.MERCHANT_MEMORY.MINIMUM_CONFIDENCE,
            confidence -
              GM.MERCHANT_MEMORY.CONFLICT_DECREASE
          );

        if (
          confidence <
          GM.MERCHANT_MEMORY.REPLACEMENT_THRESHOLD
        ) {

          sheet
            .getRange(row,3)
            .setValue(category);

          sheet
            .getRange(row,4)
            .setValue(
              subcategory
            );

        }

      }

    }

    sheet
      .getRange(row,5)
      .setValue(uses);

    sheet
      .getRange(row,7)
      .setValue(now);

    sheet
      .getRange(row,8)
      .setValue(confidence);

    return;

  }

  sheet.appendRow([

    key,

    merchant,

    category,

    subcategory,

    1,

    now,

    now,

    GM.MERCHANT_MEMORY.STARTING_CONFIDENCE,

    "No"

  ]);

}


/* ============================================================
   Apply Memory
============================================================ */

function applyMerchantMemory_(transaction) {

  const memory =
    lookupMerchantMemory_(
      transaction.description
    );

  if (!memory)
    return transaction;

  transaction.memoryFound = true;

  transaction.memoryConfidence =
    memory.confidence;

  if (
    !transaction.category &&
    memory.confidence >=
      GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
  ) {

    transaction.category =
      memory.category;

  }

  if (
    !transaction.subcategory &&
    memory.confidence >=
      GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
  ) {

    transaction.subcategory =
      memory.subcategory;

  }

  transaction.memoryMerchant =
    memory.merchant;

  return transaction;

}


/* ============================================================
   Normalize
============================================================ */

function normalizeMerchantKey_(text) {

  text =
    String(text || "")
      .toLowerCase();

  text =
    text.replace(
      /[^a-z0-9 ]/g,
      " "
    );

  text =
    text.replace(
      /\b\d+\b/g,
      " "
    );

  const remove = [

    "visa",
    "mastercard",
    "debit",
    "credit",
    "purchase",
    "pending",
    "online",
    "ach",
    "payment",
    "checkcard",
    "check",
    "pos",
    "inc",
    "llc",
    "co",
    "corp"

  ];

  remove.forEach(function(word){

    text =
      text.replace(

        new RegExp(
          "\\b"+word+"\\b",
          "g"
        ),

        " "

      );

  });

  text =
    text.replace(
      /\s+/g,
      " "
    ).trim();

  return text;

}


/* ============================================================
   Manual Lock
============================================================ */

function lockMerchantMemory_(merchant){

  const key =
    normalizeMerchantKey_(
      merchant
    );

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  for(
    let i=1;
    i<values.length;
    i++
  ){

    if(values[i][0]===key){

      sheet
        .getRange(i+1,9)
        .setValue("Yes");

      return true;

    }

  }

  return false;

}


/* ============================================================
   Manual Unlock
============================================================ */

function unlockMerchantMemory_(merchant){

  const key =
    normalizeMerchantKey_(
      merchant
    );

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  for(
    let i=1;
    i<values.length;
    i++
  ){

    if(values[i][0]===key){

      sheet
        .getRange(i+1,9)
        .setValue("No");

      return true;

    }

  }

  return false;

}


/* ============================================================
   Confidence Helpers
============================================================ */

function merchantMemoryCanAutoApply_(
  confidence
){

  return (
    Number(confidence||0)
    >=
    GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
  );

}


function merchantMemoryShouldSuggest_(
  confidence
){

  return (
    Number(confidence||0)
    >=
    GM.MERCHANT_MEMORY.MIN_SUGGEST_CONFIDENCE
  );

}


/* ============================================================
   Merchant Memory Maintenance
============================================================ */

function rebuildMerchantMemory_() {

  const manual =
    getManualTransactionsSheet_();

  const values =
    manual.getDataRange().getValues();

  if (values.length < 2) {
    return;
  }

  const map =
    getHeaderMap_(values[0]);

  requireHeaders_(map, [
    "Payee",
    "Category",
    "Subcategory"
  ]);

  const sheet =
    getMerchantMemorySheet_();

  if (sheet.getLastRow() > 1) {
    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        sheet.getLastColumn()
      )
      .clearContent();
  }

  values
    .slice(1)
    .forEach(function(row) {

      learnMerchant_(

        row[map.Payee],

        row[map.Category],

        row[map.Subcategory]

      );

    });

}


/* ============================================================
   Merchant Search
============================================================ */

function merchantMemorySearch_(text) {

  const key =
    normalizeMerchantKey_(text);

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  const matches = [];

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const merchantKey =
      String(values[i][0] || "");

    if (
      merchantKey.indexOf(key) >= 0 ||
      key.indexOf(merchantKey) >= 0
    ) {

      matches.push({

        merchant:
          values[i][1],

        category:
          values[i][2],

        subcategory:
          values[i][3],

        confidence:
          Number(values[i][7])

      });

    }

  }

  matches.sort(function(a,b){

    return b.confidence-a.confidence;

  });

  return matches;

}


/* ============================================================
   Delete Merchant
============================================================ */

function deleteMerchantMemory_(merchant){

  const key =
    normalizeMerchantKey_(
      merchant
    );

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  for(
    let i=1;
    i<values.length;
    i++
  ){

    if(
      String(values[i][0])===key
    ){

      sheet.deleteRow(i+1);
      return true;

    }

  }

  return false;

}


/* ============================================================
   Rename Merchant
============================================================ */

function renameMerchantMemory_(

  oldMerchant,

  newMerchant

){

  const key =
    normalizeMerchantKey_(
      oldMerchant
    );

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  for(
    let i=1;
    i<values.length;
    i++
  ){

    if(
      String(values[i][0])===key
    ){

      sheet.getRange(i+1,1)
        .setValue(
          normalizeMerchantKey_(
            newMerchant
          )
        );

      sheet.getRange(i+1,2)
        .setValue(newMerchant);

      return true;

    }

  }

  return false;

}


/* ============================================================
   Statistics
============================================================ */

function merchantMemoryStats_(){

  const sheet =
    getMerchantMemorySheet_();

  const values =
    sheet.getDataRange().getValues();

  let locked = 0;

  let auto = 0;

  for(
    let i=1;
    i<values.length;
    i++
  ){

    if(
      String(values[i][8]).toLowerCase()
      ===
      "yes"
    ){
      locked++;
    }

    if(
      Number(values[i][7])
      >=
      GM.MERCHANT_MEMORY.MIN_AUTO_CONFIDENCE
    ){
      auto++;
    }

  }

  return{

    merchants:
      Math.max(
        values.length-1,
        0
      ),

    locked:locked,

    autoLearned:auto

  };

}


/* ============================================================
   End MerchantMemory.gs
============================================================ */
