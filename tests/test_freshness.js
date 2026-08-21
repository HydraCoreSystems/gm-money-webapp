import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionReset, sourceFiles } from "../deploy/generate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const deployDir = path.join(repoRoot, "deploy");

const generatedFile = path.join(deployDir, "production-reset.sql");

console.log("=== DEPLOY ARTIFACT FRESHNESS TEST ===");

// Check generated file exists
assert.ok(fs.existsSync(generatedFile), "Generated file exists: " + generatedFile);
console.log("PASS: generated file exists.");

for (const src of sourceFiles) {
    assert.ok(fs.existsSync(src), "Source file exists: " + src);
    const relName = path.relative(repoRoot, src);
    console.log("PASS: source exists: %s", relName);
}

const actual = fs.readFileSync(generatedFile, "utf8");
assert.strictEqual(actual, buildProductionReset(), "Generated deployment SQL is stale; run node deploy/generate.mjs");
assert.ok(!actual.includes("\\echo"), "Deployment SQL must be compatible with Supabase SQL Editor (no psql meta-commands)");
console.log("PASS: generated SQL exactly matches canonical sources and is SQL Editor compatible.");
