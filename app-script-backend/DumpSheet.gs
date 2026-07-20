function gmDumpSheetInventory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  let output = "SHEET INVENTORY\n";
  output += "================\n\n";

  sheets.forEach(function(sheet) {
    const name = sheet.getName();
    const hidden = sheet.isSheetHidden() ? " [HIDDEN]" : "";
    const rows = sheet.getLastRow();
    const cols = sheet.getLastColumn();

    output += "TAB: " + name + hidden + "\n";
    output += "Rows: " + rows + ", Columns: " + cols + "\n";

    if (rows >= 1 && cols >= 1) {
      const headers = sheet.getRange(1, 1, 1, cols).getDisplayValues()[0];
      output += "Headers: " + headers.join(" | ") + "\n";
    } else {
      output += "Headers: (empty sheet)\n";
    }

    output += "\n";
  });

  const docSheet = ss.getSheetByName("GM_SheetInventory") ||
    ss.insertSheet("GM_SheetInventory");

  docSheet.clear();
  docSheet.getRange(1, 1).setValue(output);
  docSheet.setColumnWidth(1, 900);
  docSheet.getRange(1,1).setWrap(true);

  ss.toast("Inventory written to GM_SheetInventory tab.");
}