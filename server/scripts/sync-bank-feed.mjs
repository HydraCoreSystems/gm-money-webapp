import { SimplefinService } from '../services/simplefinService.js';

async function main() {
  const days = parseInt(process.env.SYNC_DAYS || process.argv[2] || '7', 10);
  console.log('================================================================');
  console.log(`  GATHERING MOSS FINANCIAL CENTER — SIMPLEFIN BANK FEED SYNC`);
  console.log(`  Window: Last ${days} days`);
  console.log('================================================================\n');

  try {
    console.log('Connecting to SimpleFIN Bridge API...');
    const result = await SimplefinService.sync({ days });

    console.log('\n✓ Sync Completed Successfully!\n');
    console.log(`Summary:`);
    console.log(`  - Total Imported:   ${result.total_imported}`);
    console.log(`  - Duplicates:       ${result.total_duplicates}`);
    console.log(`  - Sync Timestamp:   ${result.timestamp}`);
    console.log('\nAccounts Updated:');

    for (const acc of result.accounts) {
      console.log(`  * [${acc.institution}] ${acc.account_name} (ID: ${acc.account_id})`);
      console.log(`    - Bank Balance:    $${acc.balance.toFixed(2)}`);
      console.log(`    - Opening Balance: $${acc.opening_balance.toFixed(2)}`);
      console.log(`    - New Tx Imported: ${acc.imported} (of ${acc.total_feed_transactions} in feed, ${acc.duplicates} skipped duplicates)`);
    }

    console.log('\n================================================================\n');
  } catch (err) {
    console.error('\n✗ Sync Failed:', err.message);
    process.exit(1);
  }
}

main();
