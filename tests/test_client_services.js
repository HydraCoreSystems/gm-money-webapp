import assert from "node:assert";

// Import pure utility functions (no Supabase dependency, testable in Node.js)
const {
  safeFloat, toCents, fromCents,
  extractAmount, parseCSV, detectCSVProfile,
  normalizeDate, normalizeDescription, determineType, formatPayee
} = await import("../client/js/services/utils.js");

const fingerprintModule = await import("../client/js/services/fingerprint.js");
const { buildBaseKey, generateFingerprint } = fingerprintModule;

console.log("================================================================");
console.log("  GATHERING MOSS - CLIENT SERVICE TESTS (Supabase Architecture)");
console.log("================================================================`n");

// ============================================================
// Test 1: safeFloat cent precision
// ============================================================
console.log("--- Test 1: safeFloat cent precision ---");
assert.strictEqual(safeFloat(null), 0, "null -> 0");
assert.strictEqual(safeFloat(undefined), 0, "undefined -> 0");
assert.strictEqual(safeFloat(""), 0, "empty -> 0");
assert.strictEqual(safeFloat("48.99"), 48.99, "string number");
assert.strictEqual(safeFloat("\$48.99"), 48.99, "with dollar sign");
assert.strictEqual(safeFloat("\$1,234.56"), 1234.56, "with comma");
assert.strictEqual(safeFloat("0.333"), 0.33, "rounds to cents");
assert.strictEqual(safeFloat("0.335"), 0.34, "rounds up");
assert.strictEqual(safeFloat(48.999), 49.00, "floating point rounding");
assert.strictEqual(safeFloat("\$0.00"), 0, "zero");
console.log("  OK safeFloat passes all edge cases");

// ============================================================
// Test 2: toCents / fromCents integer cent arithmetic
// ============================================================
console.log("`n--- Test 2: toCents / fromCents ---");
assert.strictEqual(toCents(48.99), 4899);
assert.strictEqual(toCents(0), 0);
assert.strictEqual(toCents(-27.95), -2795);
assert.strictEqual(toCents("\$110.70"), 11070);
assert.strictEqual(fromCents(4899), 48.99);
assert.strictEqual(fromCents(-2795), -27.95);
assert.strictEqual(fromCents(toCents(48.99) + toCents(-27.95)), 21.04, "full round-trip through cents");
console.log("  OK toCents/fromCents round-trip correctly");

// ============================================================
// Test 3: extractAmount (PNC-style amounts)
// ============================================================
console.log("`n--- Test 3: extractAmount (PNC format) ---");
assert.strictEqual(extractAmount("- \$13.9"), -13.9, "PNC pending single decimal");
assert.strictEqual(extractAmount("- \$15.83"), -15.83, "PNC expense");
assert.strictEqual(extractAmount("- \$27.95"), -27.95, "PNC expense 2dp");
assert.strictEqual(extractAmount("- \$36"), -36, "PNC fee integer");
assert.strictEqual(extractAmount("+ \$110.7"), 110.7, "PNC income single decimal");
assert.strictEqual(extractAmount("+ \$48.07"), 48.07, "PNC credit");
assert.strictEqual(extractAmount("+ \$195.56"), 195.56, "PNC income 2dp");
assert.strictEqual(extractAmount("\$4"), 4, "PNC positive no sign");
assert.strictEqual(extractAmount("(48.99)"), -48.99, "accounting negative");
assert.strictEqual(extractAmount("48.99-"), -48.99, "trailing negative");
assert.strictEqual(extractAmount("-\$14.99"), -14.99, "leading negative");
assert.strictEqual(extractAmount("\$0.00"), null, "zero returns null");
assert.strictEqual(extractAmount(""), null, "empty returns null");
assert.strictEqual(extractAmount(null), null, "null returns null");
console.log("  OK extractAmount handles all PNC and standard formats");

// ============================================================
// Test 4: parseCSV (RFC 4180 with PNC data)
// ============================================================
console.log("`n--- Test 4: parseCSV (PNC format) ---");
const pncCsv = '"Transaction Date","Transaction Description","Amount"\n"PENDING - 08/19/2026","HP *ALL- IN PLAN CARD2617","- \$13.9"\n"2026-08-19","AMAZON.COM*5A6 SEATTLE WA","- \$27.95"\n"2026-08-18","InstPmntIn STP","+ \$110.7"\n"2026-08-17","OVERDRAFT ITEM FEE","- \$36"';
const rows = parseCSV(pncCsv);

assert.strictEqual(rows.length, 5, "5 rows (header + 4 data)");
assert.deepStrictEqual(rows[0], ["Transaction Date", "Transaction Description", "Amount"], "headers");
assert.strictEqual(rows[1][0], "PENDING - 08/19/2026", "pending date row");
assert.strictEqual(rows[1][1], "HP *ALL- IN PLAN CARD2617", "description with comma");
assert.strictEqual(rows[1][2], "- \$13.9", "PNC amount single decimal");
assert.strictEqual(rows[4][1], "OVERDRAFT ITEM FEE");

const bomCsv = "\uFEFFDate,Payee,Amount\n2026-01-01,Test,\$10.00";
const bomRows = parseCSV(bomCsv);
assert.strictEqual(bomRows[0][0], "Date", "BOM stripped from first header");
console.log("  OK parseCSV handles PNC format, quoted commas, BOM");

// ============================================================
// Test 5: detectCSVProfile
// ============================================================
console.log("`n--- Test 5: detectCSVProfile ---");
const pncHeaders = ["Transaction Date", "Transaction Description", "Amount"];
const pncProfile = detectCSVProfile(pncHeaders);
assert.ok(pncProfile, "PNC profile detected");
assert.strictEqual(pncProfile.name, "PNC Bank CSV");
assert.strictEqual(pncProfile.institution, "PNC Bank");
assert.strictEqual(pncProfile.dateCol, "Transaction Date");
assert.strictEqual(pncProfile.payeeCol, "Transaction Description");
assert.strictEqual(pncProfile.amountCol, "Amount");
assert.strictEqual(pncProfile.mode, "single_signed");

const chaseHeaders = ["Details", "Posting Date", "Description", "Amount", "Type", "Balance", "Check or Slip #"];
const chaseProfile = detectCSVProfile(chaseHeaders);
assert.ok(chaseProfile, "Chase profile detected");
assert.strictEqual(chaseProfile.name, "Chase Checking / Savings");

const unknownHeaders = ["Foo", "Bar", "Baz"];
const unknownProfile = detectCSVProfile(unknownHeaders);
assert.strictEqual(unknownProfile, null, "unknown headers return null");
console.log("  OK detectCSVProfile identifies PNC and Chase");

// ============================================================
// Test 6: normalizeDate
// ============================================================
console.log("`n--- Test 6: normalizeDate ---");
assert.strictEqual(normalizeDate("2026-08-19"), "2026-08-19", "ISO date");
assert.strictEqual(normalizeDate("PENDING - 08/19/2026"), "2026-08-19", "PNC pending date");
assert.strictEqual(normalizeDate("PENDING - 8/9/2026"), "2026-08-09", "PNC pending single digit");
assert.strictEqual(normalizeDate("08/19/2026"), "2026-08-19", "US slash date");
assert.strictEqual(normalizeDate("20260819"), "2026-08-19", "compact YYYYMMDD");
assert.strictEqual(normalizeDate("19/08/2026"), "2026-08-19", "DD/MM/YYYY auto-detected");
assert.strictEqual(normalizeDate(""), null, "empty returns null");
assert.strictEqual(normalizeDate("not a date"), null, "invalid returns null");
console.log("  OK normalizeDate handles ISO, PNC pending, US, compact, DD/MM");

// ============================================================
// Test 7: normalizeDescription (PNC noise stripping)
// ============================================================
console.log("`n--- Test 7: normalizeDescription (PNC) ---");
assert.strictEqual(
  normalizeDescription("HP *ALL- IN PLAN CARD2617"),
  "HP *ALL- IN PLAN",
  "strips CARDxxxx"
);
assert.strictEqual(
  normalizeDescription("AMAZON.COM*5A6 SEATTLE WA POS PURCHASE POSxxxx0101 xxx8289"),
  "AMAZON.COM*5A6 SEATTLE WA xxx8289",
  "strips POS noise and POSxxx refs, leaves short xxx suffix"
);
assert.strictEqual(
  normalizeDescription("FORT WAYNE RURAL KING FORT WAYNE IN DEBIT CARD PURCHASE xxxxxxxxxxxxxxxx5259"),
  "FORT WAYNE RURAL KING FORT WAYNE IN",
  "strips DEBIT CARD PURCHASE and masked card"
);
assert.strictEqual(
  normalizeDescription("InstPmntIn STP FBO In Search Of In 08/18 8K4V1"),
  "InstPmntIn In Search Of In 08/18 8K4V1",
  "strips STP FBO, retains date and code suffix"
);
assert.strictEqual(
  normalizeDescription("ONLINE TRANSFER FROM XXXXX1354"),
  "XXXXX1354",
  "strips transfer prefix"
);
assert.strictEqual(
  normalizeDescription("ANTHROPIC* CLAUDE SUB ANTHROPIC.C CA RECURRING DEBIT CARD xxxxxxxxxxxxxxxx5259"),
  "ANTHROPIC* CLAUDE SUB ANTHROPIC.C CA",
  "strips recurring debit card and masked card, retains state"
);
assert.strictEqual(
  normalizeDescription("SHOPIFY CAPITAL SHOPIFY CORPORATE ACH xxxxx3754"),
  "SHOPIFY CAPITAL SHOPIFY xxxxx3754",
  "strips corporate ach, keeps short x-ref"
);
console.log("  OK normalizeDescription strips PNC noise patterns");

// ============================================================
// Test 8: determineType
// ============================================================
console.log("`n--- Test 8: determineType ---");
assert.strictEqual(determineType(-27.95, "AMAZON.COM PURCHASE"), "expense", "neg amount purchase");
assert.strictEqual(determineType(110.7, "InstPmntIn STP FBO"), "income", "InstPmntIn is income");
assert.strictEqual(determineType(55.06, "SHOPIFY GATHERIN TRANSFER CORPORATE ACH"), "income", "Shopify transfer is income");
assert.strictEqual(determineType(-36, "OVERDRAFT ITEM FEE"), "expense", "overdraft fee is expense");
assert.strictEqual(determineType(4, "ONLINE TRANSFER FROM"), "income", "online transfer is income");
assert.strictEqual(determineType(-14.71, "SHOPIFY CAPITAL"), "expense", "Shopify Capital is expense");
assert.strictEqual(determineType(-20, "ANTHROPIC CLAUDE SUB"), "expense", "subscription is expense");
assert.strictEqual(determineType(48.07, "VISA PAYMENT CREDIT"), "income", "payment credit is income");
assert.strictEqual(
  determineType(526.84, "Plant Identification Payment", true),
  "income",
  "PNC signed credit remains income even when its description contains payment"
);
assert.strictEqual(
  determineType(-526.84, "Plant Identification Refund", true),
  "expense",
  "PNC signed debit remains expense even when its description contains refund"
);
console.log("  OK determineType correctly identifies PNC transaction types");

// ============================================================
// Test 9: Fingerprint generation (signed amounts, occurrence numbering)
// ============================================================
console.log("`n--- Test 9: Fingerprint generation (occurrence-based) ---");
// Same inputs + same occurrence = same fingerprint
const fp1 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON.COM", 1);
const fp2 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON.COM", 1);
assert.strictEqual(fp1, fp2, "same inputs + same occurrence = same fingerprint");

// Different occurrence = different fingerprint (two identical purchases)
const fp2occ = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON.COM", 2);
assert.notStrictEqual(fp1, fp2occ, "different occurrence produces different fingerprint");

// Debit vs refund: different signed amounts → different fingerprints
const fpDebit = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1);
const fpCredit = await generateFingerprint(1, "2026-08-19", 27.95, "AMAZON", 1);
assert.notStrictEqual(fpDebit, fpCredit, "debit and refund never collide");

// Different payee
const fp3 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON.COM*5A6", 1);
assert.notStrictEqual(fp1, fp3, "different payee produces different fingerprint");

// Different date
const fp4 = await generateFingerprint(1, "2026-08-20", -27.95, "AMAZON.COM", 1);
assert.notStrictEqual(fp1, fp4, "different date produces different fingerprint");

// Different account
const fp6 = await generateFingerprint(2, "2026-08-19", -27.95, "AMAZON.COM", 1);
assert.notStrictEqual(fp1, fp6, "different account produces different fingerprint");

// SHA-256 hex length
assert.strictEqual(fp1.length, 64, "SHA-256 produces 64 hex chars");

// baseKey test
const key1 = buildBaseKey(1, "2026-08-19", -27.95, "AMAZON.COM");
const key2 = buildBaseKey(1, "2026-08-19", -27.95, "AMAZON.COM");
const key3 = buildBaseKey(1, "2026-08-19", 27.95, "AMAZON.COM");
assert.strictEqual(key1, key2, "same base key for same params");
assert.notStrictEqual(key1, key3, "debit and refund base keys differ (sign preserved)");
console.log("  OK fingerprint uses signed amounts, occurrence numbering, SHA-256");

// ============================================================
// Test 10: formatPayee
// ============================================================
console.log("`n--- Test 10: formatPayee ---");
assert.strictEqual(formatPayee("AMAZON.COM"), "Amazon.com");
assert.strictEqual(formatPayee("USPS POSTAGE"), "USPS Postage");
assert.strictEqual(formatPayee("HP *ALL- IN PLAN"), "HP *all- IN Plan");
assert.strictEqual(formatPayee(""), "");
console.log("  OK formatPayee title-cases correctly");

// ============================================================
// Test 11: Balance calculation (cent-precision)
// ============================================================
console.log("`n--- Test 11: Balance calculation (cent precision) ---");
const transactions = [
  { amount: -48.99 },
  { amount: -27.11 },
  { amount: 110.70 },
  { amount: 4.00 },
  { amount: -15.83 }
];
const openBal = 2500.00;
const openCents = toCents(openBal);
const transCents = transactions.reduce((sum, t) => sum + toCents(t.amount), 0);
const expectedBal = (openCents + transCents) / 100;
assert.strictEqual(expectedBal, 2522.77, "exact cent calculation");
console.log("  OK balance calculation uses exact integer cents");

// ============================================================
// Test 12: Import dedup scenarios (debit/refund, identical purchases, reimport)
// ============================================================
console.log("`n--- Test 12: Import dedup scenarios ---");

// Simulate: generate fingerprints for a CSV, then simulate importing again

// Scenario A: Debit and refund on same date do NOT collide
const fpA1 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1);
const fpA2 = await generateFingerprint(1, "2026-08-19", 27.95, "AMAZON", 1);
assert.notStrictEqual(fpA1, fpA2, "SCENARIO A: debit and refund fingerprints differ");

// Scenario B: Two identical purchases on same date get distinct occurrence numbers
const fpB1 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1);
const fpB2 = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 2);
assert.notStrictEqual(fpB1, fpB2, "SCENARIO B: two identical purchases get distinct fingerprints");

// Scenario C: Reimporting same CSV is idempotent
// Simulate first import: build fingerprints for rows with occurrences 1, 2, 1, 1
// (rows: Amazon -$27.95, Amazon -$27.95, Meijer -$15.83, HP -$13.90)
const firstImport = [
  await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1),
  await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 2),
  await generateFingerprint(1, "2026-08-19", -15.83, "MEIJER", 1),
  await generateFingerprint(1, "2026-08-19", -13.90, "HP ALL-IN PLAN", 1)
];

// Simulate second import: same CSV produces same occurrence sequences
const secondImport = [
  await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1),
  await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 2),
  await generateFingerprint(1, "2026-08-19", -15.83, "MEIJER", 1),
  await generateFingerprint(1, "2026-08-19", -13.90, "HP ALL-IN PLAN", 1)
];

const fpSet = new Set(firstImport);
let newInSecond = 0;
secondImport.forEach(fp => { if (!fpSet.has(fp)) newInSecond++; });
assert.strictEqual(newInSecond, 0,
  "SCENARIO C: reimporting same CSV produces zero new fingerprints");

// Scenario D: Third import with an additional new row
// Same CSV as first import, plus one new row (Rural King -$23.05)
const thirdImport = [
  ...secondImport,
  await generateFingerprint(1, "2026-08-19", -23.05, "FORT WAYNE RURAL KING", 1)
];
let newInThird = 0;
thirdImport.forEach(fp => { if (!fpSet.has(fp)) newInThird++; });
assert.strictEqual(newInThird, 1,
  "SCENARIO D: CSV with 1 new row + 4 existing = 1 new fingerprint");

// Scenario E: Refund vs original purchase
// Original: Amazon -$27.95 (occurrence 1)
// Refund:   Amazon +$27.95 (occurrence 1, because different base key)
const fpOrig = await generateFingerprint(1, "2026-08-19", -27.95, "AMAZON", 1);
const fpRefund = await generateFingerprint(1, "2026-08-19", 27.95, "AMAZON", 1);
assert.notStrictEqual(fpOrig, fpRefund,
  "SCENARIO E: refund and original purchase have different fingerprints");
const refundSet = new Set([fpOrig]);
assert.strictEqual(refundSet.has(fpRefund), false,
  "SCENARIO E: refund is NOT flagged as duplicate of purchase");

console.log("  OK all dedup scenarios pass: debit/refund, identical purchases, idempotent reimport");

console.log("`n================================================================");
console.log("  ALL CLIENT SERVICE TESTS PASSED");
console.log("================================================================");
