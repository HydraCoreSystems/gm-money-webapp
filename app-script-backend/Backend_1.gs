/**
 * ============================================================
 * Gathering Moss Financial Center
 * Backend.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

function hideBackendSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const visibleSheetNames = new Set([
    GM.SHEETS.HOME,
    GM.SHEETS.ENTRY,
    GM.SHEETS.REVIEW,
    GM.SHEETS.REGISTER,
    GM.SHEETS.SCHEDULED,
    GM.SHEETS.REPORTS,
    GM.SHEETS.SETTINGS
  ]);

  const home = ss.getSheetByName(GM.SHEETS.HOME);

  if (home) {
    ss.setActiveSheet(home);
  }

  let hiddenCount = 0;

  ss.getSheets().forEach(function(sheet) {
    if (
      !visibleSheetNames.has(sheet.getName()) &&
      !sheet.isSheetHidden()
    ) {
      sheet.hideSheet();
      hiddenCount++;
    }
  });

  SpreadsheetApp.flush();

  ss.toast(
    hiddenCount +
      " backend sheet" +
      (hiddenCount === 1 ? " was" : "s were") +
      " hidden.",
    GM.APP_NAME,
    3
  );
}


function showBackendSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let shownCount = 0;

  ss.getSheets().forEach(function(sheet) {
    if (sheet.isSheetHidden()) {
      sheet.showSheet();
      shownCount++;
    }
  });

  SpreadsheetApp.flush();

  ss.toast(
    shownCount +
      " hidden sheet" +
      (shownCount === 1 ? " was" : "s were") +
      " shown.",
    GM.APP_NAME,
    3
  );
}
