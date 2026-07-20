/**
 * ============================================================
 * Gathering Moss Financial Center
 * Code.gs
 *
 * Version: 0.18.0
 * ============================================================
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Gathering Moss")
    .addItem("Initialize Financial Center", "gmInitialize")
    .addItem("Refresh Live Dropdowns", "installLiveSettingsDropdowns")
    .addItem("Sort Categories A-Z", "sortCategoriesAlphabetically")
    .addSeparator()
    .addItem("Save Entry", "saveEntry")
    .addItem("Clear Entry Form", "clearEntryForm")
    .addItem("Refresh Entry Spending Chart", "refreshEntrySpendingChart")
    .addItem("Refresh Entry Income Chart", "refreshEntryIncomeChart")
    .addSeparator()
    .addItem("Save Scheduled Transaction", "saveScheduledTransaction")
    .addItem("Clear Scheduled Form", "clearScheduledForm")
    .addItem("Process Due Scheduled Transactions", "processDueScheduledTransactions")
    .addItem("Refresh Scheduled Transactions", "refreshScheduledTransactions")
    .addItem("Edit Selected Scheduled Transaction", "editSelectedScheduledTransaction")
    .addItem("Delete Selected Scheduled Transaction", "deleteSelectedScheduledTransaction")
    .addSeparator()
    .addItem("Install Scheduled Automation", "installScheduledAutomation")
    .addItem("Remove Scheduled Automation", "removeScheduledAutomation")
    .addSeparator()
    .addItem("Refresh Register", "refreshRegister")
    .addItem("Apply Register Filter", "applyRegisterFilter")
    .addItem("Clear Register Filter", "clearRegisterFilter")
    .addItem("Match Selected Register Transactions", "matchSelectedRegisterTransactions")
    .addItem("Edit Selected Register Transaction", "editSelectedRegisterTransaction")
    .addItem("Delete Selected Register Transaction", "deleteSelectedRegisterTransaction")
    .addSeparator()
    .addItem("Refresh Review", "refreshReview")
    .addItem("Find Possible Matches", "findPossibleMatches")
    .addItem("Confirm Selected Matches", "confirmSelectedMatches")
    .addItem("Approve Selected Transactions", "approveSelectedTransactions")
    .addSeparator()
    .addItem("Archive Historical Backlog", "archiveHistoricalBacklog")
    .addSeparator()
    .addItem("Refresh Home Dashboard", "refreshHomeDashboard")
    .addItem("Rebuild Home Dashboard", "buildHomeDashboard")
    .addSeparator()
    .addItem("Hide Backend Sheets", "hideBackendSheets")
    .addItem("Show Backend Sheets", "showBackendSheets")
    .addToUi();
}


function gmInitialize() {
  try {
    ensureManualTransactionScheduleColumns_();
    buildSettingsSheet();
    buildHomeDashboard();
    buildEntrySheet();
    buildScheduledSheet();
    buildRegisterSheet();
    buildReviewSheet();

    if (
      typeof buildMerchantManagerSheet === "function"
    ) {
      buildMerchantManagerSheet();
    }

    installLiveSettingsDropdowns();
    installScheduledAutomation();
    hideBackendSheets();

    SpreadsheetApp.flush();

    SpreadsheetApp.getUi().alert(
      "Gathering Moss initialized successfully.\n\n" +
      "Scheduled transaction automation is installed and will run daily.\n\n" +
      "Settings dropdowns are live and update automatically."
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "Initialization failed:\n\n" + error.message
    );
    throw error;
  }
}

