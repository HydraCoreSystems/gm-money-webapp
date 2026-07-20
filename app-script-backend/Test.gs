/**
 * Read-only diagnostic — does not modify anything.
 * Reports exactly what charts (if any) exist on the Entry sheet,
 * and their position/size, directly to the execution log.
 */
function gmDiagnoseEntryChart() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GM.SHEETS.ENTRY);

  if (!sheet) {
    console.log("Entry sheet not found.");
    return;
  }

  const charts = sheet.getCharts();

  console.log("Number of charts found on Entry sheet: " + charts.length);

  charts.forEach(function(chart, index) {
    const containerInfo = chart.getContainerInfo();

    console.log(
      "Chart " + index + ": " +
      "anchorRow=" + containerInfo.getAnchorRow() +
      ", anchorColumn=" + containerInfo.getAnchorColumn() +
      ", offsetX=" + containerInfo.getOffsetX() +
      ", offsetY=" + containerInfo.getOffsetY()
    );

    const options = chart.getOptions();
    console.log(
      "Chart " + index + " width/height option: " +
      options.get("width") + " x " + options.get("height")
    );
  });

  const p1q1 = sheet.getRange("P1:Q1").getDisplayValues();
  console.log("P1:Q1 contents: " + JSON.stringify(p1q1));

  const dataRange = sheet.getRange("P1:Q20").getDisplayValues();
  console.log("P1:Q20 contents: " + JSON.stringify(dataRange));
}

