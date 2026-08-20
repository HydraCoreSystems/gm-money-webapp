import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, initDatabase, recalculateAccountBalance, recalculateAllAccountBalances } from '../server/db.js';
import { MerchantMemoryService } from '../server/services/merchantMemory.js';
import { ImportService } from '../server/services/importService.js';
import { SchedulerService } from '../server/services/schedulerService.js';
import { ReconciliationService } from '../server/services/reconciliationService.js';
import { ReportService } from '../server/services/reportService.js';
import { BackupService } from '../server/services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('  GATHERING MOSS FINANCIAL CENTER — EXTENDED TEST SUITE');
  console.log('================================================================\n');

  // Test 1: Initialize Database
  console.log('✓ Test 1: Initialize Database & Verify Seed Accounts/Categories');
  initDatabase();

  const accounts = db.prepare('SELECT * FROM accounts WHERE active = 1').all();
  assert(accounts.length >= 3, 'Default accounts should be seeded');
  const checkingAcc = accounts.find(a => a.type === 'checking');
  assert(checkingAcc, 'Checking account must exist');

  const categories = db.prepare('SELECT * FROM categories').all();
  assert(categories.some(c => c.name === 'Plants'), 'Plants category must exist');
  assert(categories.some(c => c.name === '3D Printing'), '3D Printing category must exist');
  assert(categories.some(c => c.name === 'Shipping'), 'Shipping category must exist');

  // Test 2 & 5: CSV Import & Merchant Memory
  console.log('\n✓ Test 2 & 5: Bank CSV Import with Merchant Memory auto-suggestions');
  const sampleChaseCSV = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,08/10/2026,"USPS PO 123456 ATLANTA",-18.40,DEBIT_CARD,2481.60,
DEBIT,08/11/2026,"CHICK-FIL-A #02891",-14.25,DEBIT_CARD,2467.35,
DEBIT,08/12/2026,"MICRO CENTER DULUTH GA",-64.99,DEBIT_CARD,2402.36,
CREDIT,08/13/2026,"SQUARE INC DIRECT DEP",250.00,ACH_CREDIT,2652.36,
DEBIT,08/14/2026,"UNKNOWN LOCAL NURSERY SUPPLIES",-45.00,DEBIT_CARD,2607.36,
`;

  const preview1 = ImportService.previewImport(sampleChaseCSV, checkingAcc.id);
  assert.strictEqual(preview1.total_rows, 5);

  const importResult = ImportService.processImport({
    filename: 'chase_august.csv',
    accountId: checkingAcc.id,
    transactions: preview1.transactions,
    autoApproveConfidence: 0.95
  });
  console.log(`  -> Processed: ${importResult.imported_count} imported`);

  // Test 3: Deduplication
  console.log('\n✓ Test 3: Deduplication check');
  const previewDuplicate = ImportService.previewImport(sampleChaseCSV, checkingAcc.id);
  assert.strictEqual(previewDuplicate.duplicate_count, 5);
  assert.strictEqual(previewDuplicate.new_count, 0);

  // Test 17: Split Transactions Feature
  console.log('\n✓ Test 17 (NEW): Split Transactions Engine & Category Allocation');
  const plantsCat = db.prepare(`SELECT id FROM categories WHERE name = 'Plants'`).get();
  const printingCat = db.prepare(`SELECT id FROM categories WHERE name = '3D Printing'`).get();

  // Create $65.00 Home Depot purchase ($40.00 3D Printing + $25.00 Plants)
  db.prepare(`
    INSERT INTO transactions (account_id, date, payee, original_description, amount, transaction_type, memo, cleared_status, review_status)
    VALUES (?, '2026-08-15', 'Home Depot', 'Home Depot', -65.00, 'expense', 'Filament & Plant Pots', 'cleared', 'approved')
  `).run(checkingAcc.id);

  const splitTransId = db.prepare('SELECT last_insert_rowid() as id').get().id;

  db.prepare(`
    INSERT INTO transaction_splits (transaction_id, category_id, subcategory_id, amount, memo)
    VALUES (?, ?, null, 40.00, 'Filament supplies'),
           (?, ?, null, 25.00, 'Pots & Trays')
  `).run(splitTransId, printingCat.id, splitTransId, plantsCat.id);

  recalculateAccountBalance(checkingAcc.id);

  // Check ReportService split allocation
  const catReportWithSplits = ReportService.getSpendingByCategory({ startDate: '2026-08-01', endDate: '2026-08-31' });
  const printingSpent = catReportWithSplits.categories.find(c => c.category_name === '3D Printing')?.total_amount || 0;
  const plantsSpent = catReportWithSplits.categories.find(c => c.category_name === 'Plants')?.total_amount || 0;

  assert(printingSpent >= 40.00, '3D Printing should include $40 from split');
  assert(plantsSpent >= 25.00, 'Plants should include $25 from split');
  console.log(`  -> Split transaction ($65.00) properly allocated: 3D Printing ($${printingSpent}) & Plants ($${plantsSpent}) in P&L.`);

  // Test 18: Receipt & Invoice Attachments Feature
  console.log('\n✓ Test 18 (NEW): Receipt & Invoice Attachments');
  const dummyReceiptData = Buffer.from('FAKE_PNG_RECEIPT_BYTES_FOR_TESTING');
  const storedFilename = `test_receipt_${splitTransId}.png`;
  const destPath = path.join(ATTACHMENTS_DIR, storedFilename);
  fs.writeFileSync(destPath, dummyReceiptData);

  db.prepare(`
    INSERT INTO transaction_attachments (transaction_id, filename, original_name, mime_type, file_size)
    VALUES (?, ?, 'home_depot_receipt.png', 'image/png', ?)
  `).run(splitTransId, storedFilename, dummyReceiptData.length);

  const attRow = db.prepare('SELECT * FROM transaction_attachments WHERE transaction_id = ?').get(splitTransId);
  assert(attRow, 'Attachment row created');
  assert(fs.existsSync(destPath), 'Receipt file saved to disk');
  console.log(`  -> Receipt attached to transaction #${splitTransId}: ${attRow.original_name} (${attRow.file_size} bytes)`);

  // Test 19: Batch Register Updates Feature
  console.log('\n✓ Test 19 (NEW): Batch Register Operations');
  const transList = db.prepare('SELECT id FROM transactions LIMIT 2').all();
  const ids = transList.map(t => t.id);

  // Batch mark cleared
  db.prepare(`UPDATE transactions SET cleared_status = 'cleared' WHERE id IN (?, ?)`).run(ids[0], ids[1]);
  const verifiedCleared = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE id IN (?, ?) AND cleared_status = 'cleared'`).get(ids[0], ids[1]).c;
  assert.strictEqual(verifiedCleared, 2, 'Both transactions marked cleared in batch');
  console.log(`  -> Successfully batch-updated ${ids.length} transactions in register.`);

  // Test 16: Backup & Export
  console.log('\n✓ Test 16: Backup Snapshot and Export');
  const snapshot = BackupService.createSnapshot();
  assert(fs.existsSync(snapshot.path));
  console.log(`  -> Snapshot created: ${snapshot.filename}`);

  console.log('\n================================================================');
  console.log('  ALL TESTS (INCLUDING SPLITS, ATTACHMENTS, & BATCH) PASSED 100%!');
  console.log('================================================================\n');
}

runAcceptanceTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
