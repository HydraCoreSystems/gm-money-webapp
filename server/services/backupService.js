import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, recalculateAllAccountBalances } from '../db.js';
import { ImportService } from './importService.js';
import { MerchantMemoryService } from './merchantMemory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export class BackupService {
  /**
   * Creates an automated or manual SQLite snapshot in backups/
   */
  static createSnapshot() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `gathering_moss_backup_${timestamp}.db`;
    const destPath = path.join(BACKUPS_DIR, backupFilename);
    const srcPath = path.join(DATA_DIR, 'gathering_moss.db');

    if (fs.existsSync(srcPath)) {
      // Checkpoint WAL to main DB before copying
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (e) {
        // checkpoint attempt
      }
      fs.copyFileSync(srcPath, destPath);
    }

    return {
      filename: backupFilename,
      path: destPath,
      timestamp: new Date().toISOString(),
      size: fs.existsSync(destPath) ? fs.statSync(destPath).size : 0
    };
  }

  /**
   * Lists available local database backups
   */
  static listBackups() {
    if (!fs.existsSync(BACKUPS_DIR)) return [];

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.db') || f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          created_at: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return files;
  }

  /**
   * Exports entire database state as portable JSON
   */
  static exportFullJSON() {
    const accounts = db.prepare('SELECT * FROM accounts').all();
    const categories = db.prepare('SELECT * FROM categories').all();
    const subcategories = db.prepare('SELECT * FROM subcategories').all();
    const transactions = db.prepare('SELECT * FROM transactions').all();
    const merchantRules = db.prepare('SELECT * FROM merchant_memory').all();
    const scheduled = db.prepare('SELECT * FROM scheduled_transactions').all();
    const profiles = db.prepare('SELECT * FROM import_profiles').all();

    return {
      app: 'Gathering Moss Financial Center',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      data: {
        accounts,
        categories,
        subcategories,
        transactions,
        merchant_memory: merchantRules,
        scheduled_transactions: scheduled,
        import_profiles: profiles
      }
    };
  }

  /**
   * Exports all transactions to standard CSV format
   */
  static exportTransactionsCSV(accountId = null) {
    let query = `
      SELECT
        t.date,
        a.name as account_name,
        t.payee,
        COALESCE(c.name, 'Uncategorized') as category,
        COALESCE(sub.name, '') as subcategory,
        t.transaction_type,
        t.amount,
        COALESCE(t.memo, '') as memo,
        t.cleared_status,
        COALESCE(t.reference_num, '') as reference_num,
        t.review_status
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
    `;
    const params = [];
    if (accountId) {
      query += ` WHERE t.account_id = ?`;
      params.push(accountId);
    }
    query += ` ORDER BY t.date DESC, t.id DESC`;

    const rows = db.prepare(query).all(...params);

    // Build CSV
    const headers = ['Date', 'Account', 'Payee', 'Category', 'Subcategory', 'Type', 'Amount', 'Memo', 'Cleared Status', 'Reference #', 'Review Status'];
    const escapeCell = (val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvLines = [headers.join(',')];
    rows.forEach(r => {
      csvLines.push([
        r.date,
        escapeCell(r.account_name),
        escapeCell(r.payee),
        escapeCell(r.category),
        escapeCell(r.subcategory),
        r.transaction_type,
        r.amount.toFixed(2),
        escapeCell(r.memo),
        r.cleared_status,
        escapeCell(r.reference_num),
        r.review_status
      ].join(','));
    });

    return csvLines.join('\r\n');
  }

  /**
   * Imports legacy Google Sheets / Tiller exported data
   */
  static importLegacyGoogleSheets(csvContent, defaultAccountId = null) {
    const rows = ImportService.parseCSV(csvContent);
    if (rows.length < 2) throw new Error('Legacy CSV is empty');

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1);

    const getIdx = (candidates) => headers.findIndex(h => candidates.some(c => h.includes(c)));

    const dateIdx = getIdx(['date']);
    const descIdx = getIdx(['description', 'payee', 'merchant']);
    const catIdx = getIdx(['category']);
    const amountIdx = getIdx(['amount']);
    const accIdx = getIdx(['account']);
    const memoIdx = getIdx(['memo', 'full description', 'note']);
    const refIdx = getIdx(['transaction id', 'check', 'id']);
    const bizAreaIdx = getIdx(['business area']); // Old field to safely archive into memo if present

    if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
      throw new Error('CSV missing required Date, Description, or Amount columns');
    }

    // Cache categories & accounts
    const existingAccounts = db.prepare('SELECT id, name FROM accounts').all();
    const accountMap = {};
    existingAccounts.forEach(a => {
      accountMap[a.name.toLowerCase().trim()] = a.id;
    });

    const defaultAccount = defaultAccountId || existingAccounts[0]?.id;

    const existingCategories = db.prepare('SELECT id, name FROM categories').all();
    const catMap = {};
    existingCategories.forEach(c => {
      catMap[c.name.toLowerCase().trim()] = c.id;
    });

    const existingSubs = db.prepare('SELECT id, category_id, name FROM subcategories').all();
    const subMap = {};
    existingSubs.forEach(s => {
      subMap[`${s.category_id}:${s.name.toLowerCase().trim()}`] = s.id;
    });

    const insertTrans = db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, original_description, amount, transaction_type,
        category_id, subcategory_id, memo, reference_num, cleared_status,
        review_status, fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cleared', 'approved', ?)
    `);

    let importedCount = 0;
    let duplicateCount = 0;

    for (const row of dataRows) {
      if (row.length === 0 || row.every(c => !c)) continue;

      const rawDate = row[dateIdx];
      const isoDate = ImportService.normalizeDate(rawDate);
      if (!isoDate) continue;

      const rawDesc = row[descIdx] || 'Legacy Transaction';
      const rawAmount = ImportService.parseAmount(row[amountIdx]);
      const rawCat = catIdx >= 0 ? (row[catIdx] || '').trim() : '';
      const rawAcc = accIdx >= 0 ? (row[accIdx] || '').trim() : '';
      let rawMemo = memoIdx >= 0 ? (row[memoIdx] || '').trim() : '';
      const rawRef = refIdx >= 0 ? (row[refIdx] || '').trim() : '';
      const rawBizArea = bizAreaIdx >= 0 ? (row[bizAreaIdx] || '').trim() : '';

      if (rawBizArea) {
        rawMemo = rawMemo ? `${rawMemo} [Legacy Area: ${rawBizArea}]` : `[Legacy Area: ${rawBizArea}]`;
      }

      // Determine Account
      let targetAccountId = defaultAccount;
      if (rawAcc && accountMap[rawAcc.toLowerCase()]) {
        targetAccountId = accountMap[rawAcc.toLowerCase()];
      } else if (rawAcc) {
        // Auto-provision new account if named
        db.prepare(`
          INSERT INTO accounts (name, type, opening_balance, current_balance, active, notes)
          VALUES (?, 'checking', 0, 0, 1, 'Imported from Legacy Migration')
        `).run(rawAcc);
        const newAccId = db.prepare('SELECT last_insert_rowid() as id').get().id;
        accountMap[rawAcc.toLowerCase()] = newAccId;
        targetAccountId = newAccId;
      }

      // Determine Category / Subcategory
      let categoryId = null;
      let subcategoryId = null;

      if (rawCat) {
        // If legacy category has format "Category: Subcategory" or "Category - Subcategory"
        const parts = rawCat.split(/[:\->\/]/).map(p => p.trim());
        const primaryCat = parts[0];
        const subCat = parts.length > 1 ? parts[1] : null;

        if (catMap[primaryCat.toLowerCase()]) {
          categoryId = catMap[primaryCat.toLowerCase()];
        } else {
          // Provision category
          const catType = rawAmount < 0 ? 'expense' : 'income';
          db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(primaryCat, catType);
          categoryId = db.prepare('SELECT last_insert_rowid() as id').get().id;
          catMap[primaryCat.toLowerCase()] = categoryId;
        }

        if (subCat && categoryId) {
          const subKey = `${categoryId}:${subCat.toLowerCase()}`;
          if (subMap[subKey]) {
            subcategoryId = subMap[subKey];
          } else {
            db.prepare('INSERT INTO subcategories (category_id, name) VALUES (?, ?)').run(categoryId, subCat);
            subcategoryId = db.prepare('SELECT last_insert_rowid() as id').get().id;
            subMap[subKey] = subcategoryId;
          }
        }
      }

      const normalizedMerchant = MerchantMemoryService.normalizeRawDescription(rawDesc);
      const fingerprint = ImportService.generateFingerprint(targetAccountId, isoDate, rawAmount, normalizedMerchant, rawRef);

      try {
        insertTrans.run(
          targetAccountId,
          isoDate,
          MerchantMemoryService.formatProperTitle(normalizedMerchant) || rawDesc,
          rawDesc,
          rawAmount,
          rawAmount < 0 ? 'expense' : 'income',
          categoryId,
          subcategoryId,
          rawMemo || null,
          rawRef || null,
          fingerprint
        );
        importedCount++;

        // Learn merchant pattern if category was present
        if (categoryId) {
          MerchantMemoryService.learn(rawDesc, normalizedMerchant, categoryId, subcategoryId);
        }
      } catch (err) {
        duplicateCount++;
      }
    }

    recalculateAllAccountBalances();

    return {
      success: true,
      imported_count: importedCount,
      duplicate_count: duplicateCount
    };
  }
}
