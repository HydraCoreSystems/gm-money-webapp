import { db } from '../db.js';
import { BackupService } from '../services/backupService.js';

export function clearTransactions() {
  console.log('--- Step 1: Creating Safety Backup Snapshot ---');
  const snapshot = BackupService.createSnapshot();
  console.log(`✓ Safety snapshot created at: ${snapshot.path} (${snapshot.size} bytes)`);

  console.log('\n--- Step 2: Clearing Transactional Data ---');
  db.exec('BEGIN TRANSACTION;');
  try {
    // Delete dependent tables first
    db.exec('DELETE FROM transaction_attachments;');
    db.exec('DELETE FROM transaction_splits;');
    db.exec('DELETE FROM reconciliations;');
    db.exec('DELETE FROM import_history;');
    db.exec('DELETE FROM transactions;');

    // Reset account balances to clean starting state
    db.exec('UPDATE accounts SET opening_balance = 0, current_balance = 0, updated_at = CURRENT_TIMESTAMP;');

    db.exec('COMMIT;');
    console.log('✓ Successfully cleared transactions, splits, attachments, reconciliations, and import history.');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Failed to clear transactions, rolled back:', err);
    throw err;
  }

  const remaining = db.prepare('SELECT count(*) as count FROM transactions').get().count;
  console.log(`\nVerified: ${remaining} transactions remaining in database.`);
  return { success: true, snapshot: snapshot.filename, remaining };
}

// Execute if run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  clearTransactions();
}
