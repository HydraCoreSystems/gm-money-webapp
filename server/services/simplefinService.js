import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, recalculateAccountBalance } from '../db.js';
import { MerchantMemoryService } from './merchantMemory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_LOCAL_PATH = path.join(__dirname, '..', '..', '.env.local');

export class SimplefinService {
  /**
   * Retrieves SimpleFIN Access URL from environment or .env.local
   */
  static getAccessUrl() {
    if (process.env.SIMPLEFIN_ACCESS_URL) {
      return process.env.SIMPLEFIN_ACCESS_URL.trim();
    }

    if (fs.existsSync(ENV_LOCAL_PATH)) {
      const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf-8');
      const match = content.match(/SIMPLEFIN_ACCESS_URL="?([^"\r\n]+)"?/);
      if (match) {
        return match[1].trim();
      }
    }

    throw new Error('SIMPLEFIN_ACCESS_URL not configured. Please set it in .env.local');
  }

  /**
   * Fetches accounts and normalized transactions from SimpleFIN API
   */
  static async fetchBankData({ days = 7 } = {}) {
    const accessUrl = this.getAccessUrl();
    const parsedUrl = new URL(accessUrl);
    const username = parsedUrl.username;
    const password = parsedUrl.password;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const startTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const queryParams = new URLSearchParams({
      'start-date': startTimestamp.toString(),
      'pending': '1'
    });

    const apiUrl = `${parsedUrl.origin}${parsedUrl.pathname}/accounts?${queryParams.toString()}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': authHeader
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SimpleFIN API error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (data.errors && data.errors.length > 0) {
      console.warn('[SimpleFIN] Warnings from API:', data.errors);
    }

    const accounts = [];

    for (const rawAcc of (data.accounts || [])) {
      const rawTxList = rawAcc.transactions || [];
      // Strictly enforce >= startTimestamp
      const filteredTx = rawTxList.filter(t => {
        const txTime = t.posted || t.transacted_at;
        return txTime && txTime >= startTimestamp;
      });

      // Track occurrence sequence for duplicate fingerprinting
      const occurrenceMap = new Map();

      const normalizedTransactions = filteredTx.map(t => {
        const txTime = t.posted || t.transacted_at;
        const dateStr = new Date(txTime * 1000).toISOString().split('T')[0];
        const amount = parseFloat(t.amount);
        const payee = (t.payee || t.description || 'Unknown Payee').trim();
        const originalDesc = (t.description || payee).trim();

        // Standard occurrence tracking: accountId|date|amount|payee
        const baseKey = `${rawAcc.id}|${dateStr}|${amount.toFixed(2)}|${payee.toUpperCase()}`;
        const occ = (occurrenceMap.get(baseKey) || 0) + 1;
        occurrenceMap.set(baseKey, occ);

        // Deterministic SHA-256 fingerprint
        const fingerprint = crypto
          .createHash('sha256')
          .update(`${baseKey}|${occ}`)
          .digest('hex');

        let txType = 'expense';
        if (amount > 0) {
          txType = 'income';
        }
        if (payee.toLowerCase().includes('transfer') || originalDesc.toLowerCase().includes('transfer')) {
          txType = 'transfer';
        }

        return {
          reference_id: t.id,
          date: dateStr,
          amount,
          payee,
          original_description: originalDesc,
          memo: t.memo || '',
          transaction_type: txType,
          fingerprint
        };
      });

      accounts.push({
        id: rawAcc.id,
        name: rawAcc.name,
        currency: rawAcc.currency || 'USD',
        balance: parseFloat(rawAcc.balance) || 0,
        institution: rawAcc.org?.name || 'PNC Bank',
        transactions: normalizedTransactions
      });
    }

    return {
      accounts,
      startTimestamp,
      startDateIso: new Date(startTimestamp * 1000).toISOString().split('T')[0]
    };
  }

  /**
   * Matches a SimpleFIN account to a local database account or creates it
   */
  static findOrCreateAccount(sfinAccount) {
    const sfinName = sfinAccount.name || '';
    const inst = sfinAccount.institution || 'PNC Bank';

    // 1. Check for explicit number match (e.g. 5681 or 1354)
    const numberMatch = sfinName.match(/\b(\d{4})\b/);
    if (numberMatch) {
      const num = numberMatch[1];
      const existing = db.prepare('SELECT * FROM accounts WHERE name LIKE ?').get(`%${num}%`);
      if (existing) {
        return existing;
      }
    }

    // 2. If it's Business Checking, map to primary checking
    if (sfinName.toLowerCase().includes('checking')) {
      const primaryChecking = db.prepare("SELECT * FROM accounts WHERE type = 'checking' ORDER BY id ASC LIMIT 1").get();
      if (primaryChecking) {
        // Update institution to PNC Bank and refine name if still default
        if (primaryChecking.name === 'Gathering Moss Business Checking' && !primaryChecking.name.includes('5681')) {
          db.prepare("UPDATE accounts SET name = ?, institution = ? WHERE id = ?")
            .run('Gathering Moss Business Checking (5681)', inst, primaryChecking.id);
          return db.prepare('SELECT * FROM accounts WHERE id = ?').get(primaryChecking.id);
        }
        return primaryChecking;
      }
    }

    // 3. Otherwise find by exact name
    const byName = db.prepare('SELECT * FROM accounts WHERE name = ?').get(sfinName);
    if (byName) return byName;

    // 4. If not found, create new account
    const accType = sfinName.toLowerCase().includes('savings') ? 'savings' : 'checking';
    const stmt = db.prepare(`
      INSERT INTO accounts (name, institution, type, opening_balance, current_balance, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertName = sfinName.includes(inst) ? sfinName : `${inst} ${sfinName}`;
    stmt.run(insertName, inst, accType, 0, sfinAccount.balance, 'Auto-created via SimpleFIN Bridge');
    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(newId);
  }

  /**
   * Synchronizes 7-day SimpleFIN transactions into local database
   */
  static async sync({ days = 7 } = {}) {
    const bankData = await this.fetchBankData({ days });
    let totalImported = 0;
    let totalDuplicates = 0;
    const accountResults = [];

    const checkStmt = db.prepare(`
      SELECT id FROM transactions 
      WHERE fingerprint = ? OR reference_num = ?
      LIMIT 1
    `);

    const insertStmt = db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, original_description, amount, 
        transaction_type, category_id, subcategory_id, memo, 
        reference_num, cleared_status, review_status, fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uncleared', ?, ?)
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const sfinAcc of bankData.accounts) {
        const localAcc = this.findOrCreateAccount(sfinAcc);
        let accImported = 0;
        let accDuplicates = 0;

        // Record import history row
        const importHistStmt = db.prepare(`
          INSERT INTO import_history (filename, account_id, total_rows, new_count, duplicate_count, status)
          VALUES (?, ?, ?, ?, ?, 'in_progress')
        `);
        importHistStmt.run(
          `SimpleFIN Sync (${days}d) - ${sfinAcc.name}`,
          localAcc.id,
          sfinAcc.transactions.length,
          0,
          0
        );
        const importId = db.prepare('SELECT last_insert_rowid() as id').get().id;

        for (const t of sfinAcc.transactions) {
          const existing = checkStmt.get(t.fingerprint, t.reference_id);
          if (existing) {
            accDuplicates++;
            continue;
          }

          // Auto-categorization using Merchant Memory
          let categoryId = null;
          let subcategoryId = null;
          let reviewStatus = 'pending_review';

          const match = MerchantMemoryService.match(t.original_description);
          if (match && match.confidence >= 0.7) {
            categoryId = match.category_id || null;
            subcategoryId = match.subcategory_id || null;
            reviewStatus = 'approved';
          }

          insertStmt.run(
            localAcc.id,
            t.date,
            t.payee,
            t.original_description,
            t.amount,
            t.transaction_type,
            categoryId,
            subcategoryId,
            t.memo || null,
            t.reference_id,
            reviewStatus,
            t.fingerprint
          );
          accImported++;
        }

        // Update import history record
        db.prepare(`
          UPDATE import_history 
          SET new_count = ?, duplicate_count = ?, status = 'completed'
          WHERE id = ?
        `).run(accImported, accDuplicates, importId);

        // Update account live balance directly from bank reported balance
        db.prepare(`
          UPDATE accounts 
          SET current_balance = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(sfinAcc.balance, localAcc.id);

        // Calculate opening balance atomically so opening + sum(transactions) == current_balance
        const sumResult = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total 
          FROM transactions 
          WHERE account_id = ?
        `).get(localAcc.id);

        const calculatedOpening = Math.round((sfinAcc.balance - sumResult.total) * 100) / 100;
        db.prepare(`
          UPDATE accounts 
          SET opening_balance = ? 
          WHERE id = ?
        `).run(calculatedOpening, localAcc.id);

        totalImported += accImported;
        totalDuplicates += accDuplicates;

        accountResults.push({
          account_id: localAcc.id,
          account_name: localAcc.name,
          institution: localAcc.institution,
          balance: sfinAcc.balance,
          opening_balance: calculatedOpening,
          imported: accImported,
          duplicates: accDuplicates,
          total_feed_transactions: sfinAcc.transactions.length
        });
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[SimpleFIN] Sync transaction aborted, rolled back:', err);
      throw err;
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      days_synced: days,
      total_imported: totalImported,
      total_duplicates: totalDuplicates,
      accounts: accountResults
    };
  }
}
