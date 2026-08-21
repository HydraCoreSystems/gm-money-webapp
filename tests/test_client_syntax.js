import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(repoRoot, 'client', 'js');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? jsFiles(full) : entry.name.endsWith('.js') ? [full] : [];
  });
}

console.log('=== CLIENT SHIPPED-CODE CHECKS ===');
for (const file of jsFiles(clientRoot)) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `${path.relative(repoRoot, file)} failed syntax check:\n${result.stderr}`);
}
console.log('PASS: every shipped client JavaScript file parses.');

const migration = fs.readFileSync(path.join(repoRoot, 'supabase', 'migrations', '001_enable_rls_financial_center.sql'), 'utf8');
assert.ok(!/account_id\s*=\s*p_account_id\s+AND\s+review_status\s*=\s*'approved'/i.test(migration), 'Account balance must include every imported bank transaction, including pending-review rows');
console.log('PASS: account balance calculation includes pending-review transactions.');
