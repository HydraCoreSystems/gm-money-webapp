/**
 * Add these columns to the existing GM_ManualTransactions backend
 * without changing the visible Entry form.
 */
function ensureManualTransactionScheduleColumns_() {
  const sheet = getManualTransactionsSheet_();
  const requiredHeaders = [
    "Transaction ID", "Date", "Account", "Payee", "Amount",
    "Category", "Subcategory", "Payment Method", "Notes",
    "Source", "Status", "Matched Bank Key", "Reconciled Date",
    "Entered By", "Entered At", "Schedule ID", "Scheduled Due Key"
  ];

  ensureSheetHeaders_(sheet, requiredHeaders);
}
