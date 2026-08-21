import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const deployDir = path.join(repoRoot, "deploy");

const generatedFile = path.join(deployDir, "production-reset.sql");

const sourceFiles = [
    path.join(deployDir, "src", "preflight.sql"),
    path.join(deployDir, "src", "clear.sql"),
    path.join(repoRoot, "supabase", "migrations", "001_enable_rls_financial_center.sql"),
    path.join(deployDir, "src", "enroll.sql"),
    path.join(deployDir, "src", "verify.sql"),
];

console.log("=== DEPLOY ARTIFACT FRESHNESS TEST ===");

// Check generated file exists
assert.ok(fs.existsSync(generatedFile), "Generated file exists: " + generatedFile);
console.log("PASS: generated file exists.");

const generatedMtime = fs.statSync(generatedFile).mtimeMs;
let allFresh = true;

for (const src of sourceFiles) {
    assert.ok(fs.existsSync(src), "Source file exists: " + src);
    const srcMtime = fs.statSync(src).mtimeMs;
    const relName = path.relative(repoRoot, src);
    if (srcMtime > generatedMtime) {
        console.log("FAIL: source file %s is newer than generated file.", relName);
        console.log("  Source timestamp:    %s", new Date(srcMtime).toISOString());
        console.log("  Generated timestamp: %s", new Date(generatedMtime).toISOString());
        console.log("  Fix: regenerate with 'pwsh -Command ...' or 'bash deploy/generate.sh'");
        allFresh = false;
    } else {
        console.log("PASS: %s <= generated", relName);
    }
}

assert.ok(allFresh, "All source files are not newer than the generated file. Regenerate deploy/production-reset.sql.");
console.log("ALL FRESHNESS CHECKS PASSED.");
