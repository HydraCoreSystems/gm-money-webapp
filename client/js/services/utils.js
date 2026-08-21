/**
 * Pure utility functions for Gathering Moss Financial Center.
 * No external dependencies. Safe to import in Node.js and browser.
 */

/**
 * Converts a value to exact 2-decimal float, avoiding NaN.
 */
export function safeFloat(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const cleaned = String(val).replace(/[\$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : Math.round(n * 100) / 100;
}

/**
 * Converts dollar amount to integer cents.
 */
export function toCents(dollars) {
  return Math.round(safeFloat(dollars) * 100);
}

/**
 * Converts integer cents back to dollar number.
 */
export function fromCents(cents) {
  return Math.round(cents) / 100;
}

/**
 * Extracts a signed dollar amount from a raw string.
 * Handles: "- $48.99", "+ $110.70", "(48.99)", "48.99-", "$4", "- $36"
 */
export function extractAmount(str) {
  if (!str) return null;
  const raw = String(str).trim();
  if (raw === '' || raw === '-' || raw === '$') return null;

  const isAccountingNegative = /^\(.*\)$/.test(raw);
  const isTrailingNegative = /[\d\.]+\-$/.test(raw);
  const isLeadingNegative = raw.includes('-') || /\bDR\b/i.test(raw);
  const isNegative = isAccountingNegative || isTrailingNegative || isLeadingNegative;

  const cleaned = raw.replace(/[^\d\.]/g, '');
  if (!cleaned || cleaned === '.') return null;

  const num = parseFloat(cleaned);
  if (isNaN(num) || num === 0) return null;

  const signedNum = isNegative ? -num : num;
  return Math.round(signedNum * 100) / 100;
}

/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted cells, escaped quotes (""), newlines within quotes.
 */
export function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  let content = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Detects the CSV profile from headers.
 */
export function detectCSVProfile(headers) {
  if (!headers || headers.length === 0) return null;
  const norm = headers.map(h => h.toLowerCase().trim());

  // PNC Bank: "Transaction Date", "Transaction Description", "Amount"
  if (norm.some(h => h === 'transaction date') && norm.some(h => h.includes('description')) && norm.some(h => h === 'amount')) {
    return {
      name: 'PNC Bank CSV',
      institution: 'PNC Bank',
      dateCol: 'Transaction Date',
      payeeCol: 'Transaction Description',
      amountCol: 'Amount',
      mode: 'single_signed',
      dateFormat: 'YYYY-MM-DD',
      positiveIsCredit: true
    };
  }

  // Chase Checking/Savings
  if (norm.includes('details') && (norm.includes('posting date') || norm.includes('transaction date')) && norm.includes('amount')) {
    return {
      name: 'Chase Checking / Savings',
      institution: 'Chase',
      dateCol: norm.includes('posting date') ? 'Posting Date' : 'Transaction Date',
      payeeCol: 'Description',
      amountCol: 'Amount',
      mode: 'single_signed',
      dateFormat: 'MM/DD/YYYY'
    };
  }

  return null;
}

/**
 * Normalizes a date string to ISO YYYY-MM-DD.
 */
export function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.trim().replace(/^['"]|['"]$/g, '');

  // Handle PNC "PENDING - 08/19/2026" format
  const pendMatch = clean.match(/PENDING\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (pendMatch) {
    return `${pendMatch[3]}-${pendMatch[1].padStart(2, '0')}-${pendMatch[2].padStart(2, '0')}`;
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10);
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slashParts = clean.split(/[\/\-\.]/);
  if (slashParts.length === 3) {
    let [p1, p2, p3] = slashParts.map(s => parseInt(s, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;
    if (p3 < 100) p3 += 2000;
    if (p1 > 12 && p2 <= 12) {
      return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Strips noise from bank descriptions to extract clean merchant name.
 */
export function normalizeDescription(raw) {
  if (!raw) return '';
  let cleaned = raw.trim();

  cleaned = cleaned
    .replace(/CARD\d{4,}/gi, '')
    .replace(/POS\s*PURCHASE/gi, '')
    .replace(/POS\s*x{3,}\d*/gi, '')
    .replace(/DEBIT\s*CARD\s*PURCHASE/gi, '')
    .replace(/RECURRING\s*DEBIT\s*CARD/gi, '')
    .replace(/VISA\s*PAYMENT\s*CREDIT/gi, '')
    .replace(/ACH\s*CREDIT/gi, '')
    .replace(/CORPORATE\s*ACH/gi, '')
    .replace(/ONLINE\s*TRANSFER\s*FROM/gi, '')
    .replace(/x{6,}\d*/gi, '')
    .replace(/STP\s*FBO/gi, '')
    .replace(/VIS\s*\d+/gi, '')
    .replace(/TRANSFER\s*CORPORATE\s*ACH/i, '')
    .replace(/\b[A-Z]{2}\b\s+\d{5}\b/g, '')
    .replace(/\d{3}[-.]?\d{3}[-.]?\d{4}/g, '')
    .replace(/\s[*#]\s*\w*\d\w*\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || raw.trim();
}

/**
 * Determines transaction type from amount sign and description.
 */
export function determineType(amount, description, signedAmountIsAuthoritative = false) {
  // Bank formats such as PNC provide a signed amount. In those formats the
  // bank's sign is the source of truth; description keywords must never turn
  // a deposit into a payment (or vice versa).
  if (signedAmountIsAuthoritative) return amount >= 0 ? 'income' : 'expense';

  const desc = (description || '').toLowerCase();
  const creditKeywords = /(deposit|credit|refund|payroll|transfer from|payment credit|instpmntin|shopify.*transfer)/i;
  const debitKeywords = /(purchase|card|pos|debit|plan|sub|store|fee|payment|overdraft|shopify capital)/i;

  if (creditKeywords.test(desc) && !debitKeywords.test(desc)) return 'income';
  if (debitKeywords.test(desc) && !creditKeywords.test(desc)) return 'expense';
  return amount >= 0 ? 'income' : 'expense';
}

/**
 * Cleans a payee name to proper title case for display.
 */
export function formatPayee(raw) {
  if (!raw) return '';
  const acronyms = ['USPS', 'UPS', 'LLC', 'INC', 'IRS', 'ACH', 'POS', 'ATM', 'HP', 'STP', 'FBO', 'AI', 'API', 'AWS', 'PC', 'CA', 'IN'];
  return raw
    .toLowerCase()
    .split(' ')
    .map(w => {
      const up = w.toUpperCase();
      if (acronyms.includes(up)) return up;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}
