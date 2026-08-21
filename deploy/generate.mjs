import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deployDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(deployDir);

export const sourceFiles = [
  path.join(deployDir, 'src', 'preflight.sql'),
  path.join(deployDir, 'src', 'clear.sql'),
  path.join(repoRoot, 'supabase', 'migrations', '001_enable_rls_financial_center.sql'),
  path.join(deployDir, 'src', 'enroll.sql'),
  path.join(deployDir, 'src', 'verify.sql'),
];

const labels = ['preflight', 'clear', 'migrate', 'enroll', 'verify'];

export function buildProductionReset() {
  const parts = [`-- Gathering Moss Financial Center — Production Reset & Deployment
-- GENERATED FILE — do not edit directly.
-- Compatible with the Supabase Dashboard SQL Editor.
-- Replace {{PHIL_UUID}} and {{CRYSTAL_UUID}}, then run the complete file.

BEGIN;

SELECT 'GATHERING MOSS — PRODUCTION RESET STARTED' AS deployment_status;
`];

  sourceFiles.forEach((file, index) => {
    parts.push(`\n-- ================================================================\n-- PHASE: ${labels[index]}\n-- ================================================================\n`);
    parts.push(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trimEnd());
    parts.push('\n');
  });

  parts.push(`
SELECT 'DEPLOYMENT VERIFIED — COMMITTING' AS deployment_status;
COMMIT;
SELECT 'DEPLOYMENT SUCCESSFUL — BOTH OWNERS ENROLLED' AS deployment_status;
`);
  return parts.join('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = path.join(deployDir, 'production-reset.sql');
  fs.writeFileSync(output, buildProductionReset(), 'utf8');
  console.log(`Generated: ${output}`);
}
