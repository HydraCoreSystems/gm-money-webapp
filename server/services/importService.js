import crypto from 'node:crypto';
import { db, recalculateAccountBalance } from '../db.js';
import { MerchantMemoryService } from './merchantMemory.js';

export class ImportService {
  /**
   * RFC 4180-compliant pure JS CSV parser
   * Handles quoted cells, escaped quotes (""), newlines within quotes, BOM markers
   */
  static parseCSV(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') return [];

    // Strip UTF-8 BOM if present
    let text = csvContent.charCodeAt(0) === 0xFEFF ? csvContent.slice(1) : csvContent;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote
            currentCell += '"';
            i += 2;
            continue;
          } else {
            // Closing quote
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

    // Last row if not empty
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Normalizes dates from various formats to ISO YYYY-MM-DD
   */
  static normalizeDate(dateStr, profileFormat = 'AUTO') {
    if (!dateStr) return null;
    const clean = dateStr.trim().replace(/^['"]|['"]$/g, '');

    // 1. ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      return clean.slice(0, 10);
    }

    // 2. YYYYMMDD
    if (/^\d{8}$/.test(clean)) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    }

    // 3. MM/DD/YYYY or M/D/YYYY
    const slashParts = clean.split(/[\/\-\.]/);
    if (slashParts.length === 3) {
      let [p1, p2, p3] = slashParts.map(s => parseInt(s, 10));
      if (p3 < 100) p3 += 2000;

      if (profileFormat === 'DD/MM/YYYY' || (p1 > 12 && p2 <= 12)) {
        // Day/Month/Year
        const month = String(p2).padStart(2, '0');
        const day = String(p1).padStart(2, '0');
        return `${p3}-${month}-${day}`;
      } else {
        // Month/Day/Year (Standard US)
        const month = String(p1).padStart(2, '0');
        const day = String(p2).padStart(2, '0');
        return `${p3}-${month}-${day}`;
      }
    }

    // Fallback: Date.parse
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }

    return null;
  }

  /**
   * Parses string amount into standard float
   * Standard convention: negative = expense/debit, positive = income/credit
   */
  static parseAmount(str) {
    if (str === undefined || str === null) return 0;
    let s = String(str).trim();
    if (!s) return 0;

    let isNegative = false;

    // Check for parenthesized negative e.g. ($45.99) or (45.99)
    if (/^\(.*\)$/.test(s)) {
      isNegative = true;
      s = s.slice(1, -1);
    } else if (s.startsWith('-') || s.endsWith('-')) {
      isNegative = true;
      s = s.replace(/\-/g, '');
    } else if (s.startsWith('+')) {
      s = s.replace(/\+/g, '');
    }

    // Strip currency symbols and commas
    s = s.replace(/[\$\€\£\¥\,]/g, '').trim();
    const num = parseFloat(s);
    if (isNaN(num)) return 0;

    return Number((isNegative ? -Math.abs(num) : num).toFixed(2));
  }

  /**
   * Automatically recognizes bank institution and CSV layout
   */
  static detectProfile(headers) {
    const norm = headers.map(h => h.toLowerCase().trim());

    // Chase Checking/Savings
    if (norm.includes('details') && (norm.includes('posting date') || norm.includes('transaction date')) && norm.includes('amount')) {
      return {
        name: 'Chase Checking / Savings',
        institution: 'Chase',
        dateCol: norm.includes('posting date') ? 'Posting Date' : 'Transaction Date',
        payeeCol: 'Description',
        amountCol: 'Amount',
        typeCol: 'Type',
        refCol: 'Check or Slip #',
        memoCol: 'Memo',
        mode: 'single_signed',
        invertSign: false
      };
    }

    // Capital One
    if (norm.includes('transaction date') && (norm.includes('debit') || norm.includes('credit')) && norm.includes('card no.')) {
      return {
        name: 'Capital One Credit Card',
        institution: 'Capital One',
        dateCol: 'Transaction Date',
        postedDateCol: 'Posted Date',
        payeeCol: 'Description',
        debitCol: 'Debit',
        creditCol: 'Credit',
        categoryCol: 'Category',
        mode: 'split_debit_credit',
        debitIsExpense: true
      };
    }

    // Discover Card
    if (norm.includes('trans. date') && norm.includes('post date') && norm.includes('amount')) {
      return {
        name: 'Discover Card',
        institution: 'Discover',
        dateCol: 'Trans. Date',
        postedDateCol: 'Post Date',
        payeeCol: 'Description',
        amountCol: 'Amount',
        categoryCol: 'Category',
        mode: 'single_signed',
        invertSign: true // In Discover CSV, positive amount is a charge/expense
      };
    }

    // American Express
    if (norm.includes('date') && norm.includes('description') && (norm.includes('amount') || norm.includes('extended details'))) {
      return {
        name: 'American Express',
        institution: 'American Express',
        dateCol: 'Date',
        payeeCol: 'Description',
        amountCol: 'Amount',
        memoCol: 'Extended Details',
        refCol: 'Reference',
        mode: 'single_signed',
        invertSign: true // Amex positive is charge
      };
    }

    // PayPal
    if (norm.includes('date') && norm.includes('gross') && (norm.includes('name') || norm.includes('item title'))) {
      return {
        name: 'PayPal Activity',
        institution: 'PayPal',
        dateCol: 'Date',
        payeeCol: norm.includes('name') ? 'Name' : 'Item Title',
        amountCol: 'Gross',
        feeCol: 'Fee',
        typeCol: 'Type',
        statusCol: 'Status',
        mode: 'single_signed',
        invertSign: false
      };
    }

    // Tiller / Legacy Google Sheets Financial Center Export
    if (norm.includes('date') && norm.includes('description') && norm.includes('category') && norm.includes('amount') && (norm.includes('account') || norm.includes('transaction id'))) {
      return {
        name: 'Legacy Financial Center / Tiller Export',
        institution: 'Tiller / Legacy',
        dateCol: 'Date',
        payeeCol: 'Description',
        amountCol: 'Amount',
        categoryCol: 'Category',
        accountCol: 'Account',
        refCol: 'Transaction ID',
        memoCol: 'Full Description',
        mode: 'single_signed',
        invertSign: false
      };
    }

    // Generic Header Matcher
    const findCol = (candidates) => {
      const idx = norm.findIndex(h => candidates.some(c => h.includes(c)));
      return idx >= 0 ? headers[idx] : null;
    };

    const dateCol = findCol(['date', 'posted', 'trans date', 'time']);
    const payeeCol = findCol(['payee', 'description', 'merchant', 'name', 'memo']);
    const amountCol = findCol(['amount', 'net']);
    const debitCol = findCol(['debit', 'withdrawal', 'expense', 'payment']);
    const creditCol = findCol(['credit', 'deposit', 'income']);
    const refCol = findCol(['check', 'ref', 'trans id', 'id', 'reference']);
    const memoCol = findCol(['memo', 'notes', 'extended']);

    if (debitCol && creditCol) {
      return {
        name: 'Generic Split Debit/Credit CSV',
        institution: 'Generic',
        dateCol: dateCol || headers[0],
        payeeCol: payeeCol || headers[1],
        debitCol,
        creditCol,
        refCol,
        memoCol,
        mode: 'split_debit_credit',
        debitIsExpense: true
      };
    }

    return {
      name: 'Generic Bank CSV',
      institution: 'Generic',
      dateCol: dateCol || headers[0],
      payeeCol: payeeCol || (headers[1] || headers[0]),
      amountCol: amountCol || headers[headers.length - 1],
      refCol,
      memoCol,
      mode: 'single_signed',
      invertSign: false
    };
  }

  /**
   * Generates a cryptographic hash fingerprint to guarantee duplicate prevention
   */
  static generateFingerprint(accountId, date, amount, normalizedPayee, refNum = '') {
    const raw = `${accountId}|${date}|${Math.abs(amount).toFixed(2)}|${normalizedPayee.toUpperCase()}|${(refNum || '').trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Previews CSV import without committing, detecting duplicates and mapping
   */
  static previewImport(csvContent, accountId, customProfile = null) {
    const rows = this.parseCSV(csvContent);
    if (rows.length < 2) {
      throw new Error('CSV file is empty or missing headers');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const profile = customProfile || this.detectProfile(headers);

    const headerIndex = {};
    headers.forEach((h, idx) => {
      headerIndex[h.trim()] = idx;
    });

    const getVal = (row, colName) => {
      if (!colName || headerIndex[colName] === undefined) return '';
      return (row[headerIndex[colName]] || '').trim();
    };

    const previewList = [];
    let duplicateCount = 0;
    let newCount = 0;
    let errorCount = 0;

    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const row = dataRows[rIdx];
      if (row.length === 0 || row.every(c => !c)) continue;

      try {
        const rawDate = getVal(row, profile.dateCol);
        const isoDate = this.normalizeDate(rawDate, profile.dateFormat);
        if (!isoDate) {
          errorCount++;
          continue;
        }

        const rawPayee = getVal(row, profile.payeeCol) || 'Unknown Payee';
        const rawRef = getVal(row, profile.refCol);
        const rawMemo = getVal(row, profile.memoCol);

        let finalAmount = 0;
        if (profile.mode === 'split_debit_credit') {
          const debit = this.parseAmount(getVal(row, profile.debitCol));
          const credit = this.parseAmount(getVal(row, profile.creditCol));
          if (debit > 0) {
            finalAmount = -Math.abs(debit);
          } else if (credit > 0) {
            finalAmount = Math.abs(credit);
          } else {
            // maybe signed in debit or credit cell
            finalAmount = credit !== 0 ? credit : -Math.abs(debit);
          }
        } else {
          const parsed = this.parseAmount(getVal(row, profile.amountCol));
          finalAmount = profile.invertSign ? -parsed : parsed;
        }

        if (finalAmount === 0 && !rawPayee) {
          errorCount++;
          continue;
        }

        const normalizedMerchant = MerchantMemoryService.normalizeRawDescription(rawPayee);
        const fingerprint = this.generateFingerprint(accountId, isoDate, finalAmount, normalizedMerchant, rawRef);

        // Duplicate check against existing transactions
        const existing = db.prepare('SELECT id, payee, date, amount FROM transactions WHERE fingerprint = ?').get(fingerprint);
        const isDuplicate = !!existing;

        if (isDuplicate) {
          duplicateCount++;
        } else {
          newCount++;
        }

        // Run merchant memory suggestion
        const match = MerchantMemoryService.match(rawPayee);

        previewList.push({
          row_index: rIdx + 1,
          date: isoDate,
          original_description: rawPayee,
          payee: match?.display_payee || MerchantMemoryService.formatProperTitle(normalizedMerchant),
          amount: finalAmount,
          transaction_type: finalAmount < 0 ? 'expense' : 'income',
          suggested_category_id: match?.category_id || null,
          suggested_subcategory_id: match?.subcategory_id || null,
          suggested_category_name: match?.category_name || null,
          suggested_subcategory_name: match?.subcategory_name || null,
          confidence: match?.confidence || 0,
          reference_num: rawRef,
          memo: rawMemo,
          fingerprint,
          is_duplicate: isDuplicate
        });
      } catch (err) {
        errorCount++;
      }
    }

    return {
      profile,
      headers,
      total_rows: previewList.length,
      new_count: newCount,
      duplicate_count: duplicateCount,
      error_count: errorCount,
      transactions: previewList
    };
  }

  /**
   * Finalizes import of transactions into SQLite database and Review queue
   */
  static processImport({ filename, accountId, transactions, autoApproveConfidence = 0.95 }) {
    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions provided for import');
    }

    // 1. Create import history record
    const insertHistory = db.prepare(`
      INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, error_count, status)
      VALUES (?, ?, ?, ?, ?, ?, 'completed')
    `);

    const newRows = transactions.filter(t => !t.is_duplicate);
    const duplicates = transactions.filter(t => t.is_duplicate);

    insertHistory.run(
      filename || 'manual_import.csv',
      accountId,
      transactions.length,
      newRows.length,
      duplicates.length,
      0
    );

    const historyId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    // 2. Insert new transactions
    const insertTrans = db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, original_description, amount, transaction_type,
        category_id, subcategory_id, memo, reference_num, cleared_status,
        review_status, import_id, fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cleared', ?, ?, ?)
    `);

    let importedCount = 0;

    for (const t of newRows) {
      // Auto-approve if high confidence, else send to review queue
      const willApprove = t.confidence >= autoApproveConfidence && t.suggested_category_id !== null;
      const reviewStatus = willApprove ? 'approved' : 'pending_review';

      try {
        insertTrans.run(
          accountId,
          t.date,
          t.payee || t.original_description,
          t.original_description,
          t.amount,
          t.amount < 0 ? 'expense' : 'income',
          t.suggested_category_id || null,
          t.suggested_subcategory_id || null,
          t.memo || null,
          t.reference_num || null,
          reviewStatus,
          historyId,
          t.fingerprint
        );
        importedCount++;
      } catch (err) {
        // If unique constraint triggers, skip duplicate
      }
    }

    // 3. Recalculate account balance
    recalculateAccountBalance(accountId);

    return {
      import_id: historyId,
      total_processed: transactions.length,
      imported_count: importedCount,
      duplicate_count: duplicates.length,
      review_required_count: newRows.filter(t => t.confidence < autoApproveConfidence || !t.suggested_category_id).length
    };
  }
}
