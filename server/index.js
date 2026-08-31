import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, initDatabase, recalculateAccountBalance, recalculateAllAccountBalances } from './db.js';
import { MerchantMemoryService } from './services/merchantMemory.js';
import { ImportService } from './services/importService.js';
import { SchedulerService } from './services/schedulerService.js';
import { ReconciliationService } from './services/reconciliationService.js';
import { ReportService } from './services/reportService.js';
import { BackupService } from './services/backupService.js';
import { SimplefinService } from './services/simplefinService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENTS_DIR = path.join(__dirname, '..', 'data', 'attachments');

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// Initialize DB schema & initial seed
initDatabase();

// Process any due auto-create scheduled items on boot
try {
  SchedulerService.processDueScheduledTransactions();
} catch (e) {
  console.error('Error processing due scheduled transactions:', e);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'client')));

// -------------------------------------------------------------
// 1. ACCOUNTS API
// -------------------------------------------------------------
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY active DESC, type, name').all();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { name, institution, type, opening_balance = 0, notes } = req.body;
    if (!name || !type) return res.status(400).json({ success: false, error: 'Name and type are required' });

    const openBal = parseFloat(opening_balance) || 0;
    const stmt = db.prepare(`
      INSERT INTO accounts (name, institution, type, opening_balance, current_balance, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(name.trim(), institution?.trim() || null, type, openBal, openBal, notes?.trim() || null);
    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    recalculateAccountBalance(newId);

    res.json({ success: true, account_id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/accounts/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, institution, type, opening_balance, notes, active } = req.body;

    const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ success: false, error: 'Account not found' });

    const openBal = opening_balance !== undefined ? parseFloat(opening_balance) : current.opening_balance;
    const isActive = active !== undefined ? (active ? 1 : 0) : current.active;

    db.prepare(`
      UPDATE accounts
      SET name = ?, institution = ?, type = ?, opening_balance = ?, notes = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name?.trim() || current.name,
      institution?.trim() ?? current.institution,
      type || current.type,
      openBal,
      notes?.trim() ?? current.notes,
      isActive,
      id
    );

    recalculateAccountBalance(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const transCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?').get(id).count;
    if (transCount > 0) {
      db.prepare('UPDATE accounts SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      return res.json({ success: true, message: 'Account has transactions and was archived.' });
    }

    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 2. CATEGORIES & SUBCATEGORIES API
// -------------------------------------------------------------
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY type, sort_order, name').all();
    const subcategories = db.prepare('SELECT * FROM subcategories ORDER BY sort_order, name').all();

    const catCounts = db.prepare(`
      SELECT category_id, subcategory_id, COUNT(*) as count
      FROM transactions
      GROUP BY category_id, subcategory_id
    `).all();

    const catMap = {};
    categories.forEach(c => {
      catMap[c.id] = {
        ...c,
        transaction_count: 0,
        subcategories: []
      };
    });

    subcategories.forEach(s => {
      if (catMap[s.category_id]) {
        catMap[s.category_id].subcategories.push({
          ...s,
          transaction_count: 0
        });
      }
    });

    catCounts.forEach(row => {
      if (row.category_id && catMap[row.category_id]) {
        catMap[row.category_id].transaction_count += row.count;
        if (row.subcategory_id) {
          const sub = catMap[row.category_id].subcategories.find(s => s.id === row.subcategory_id);
          if (sub) sub.transaction_count += row.count;
        }
      }
    });

    res.json({ success: true, categories: Object.values(catMap) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { name, type = 'expense' } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Category name is required' });

    db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name.trim(), type);
    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    res.json({ success: true, category_id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/categories/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, type } = req.body;
    db.prepare('UPDATE categories SET name = ?, type = ? WHERE id = ?').run(name.trim(), type, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/categories/:id/subcategories', (req, res) => {
  try {
    const category_id = parseInt(req.params.id, 10);
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Subcategory name is required' });

    db.prepare('INSERT INTO subcategories (category_id, name) VALUES (?, ?)').run(category_id, name.trim());
    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    res.json({ success: true, subcategory_id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/subcategories/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name } = req.body;
    db.prepare('UPDATE subcategories SET name = ? WHERE id = ?').run(name.trim(), id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/subcategories/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM subcategories WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. TRANSACTIONS & REGISTER API (With Splits & Attachments)
// -------------------------------------------------------------
app.get('/api/transactions', (req, res) => {
  try {
    const {
      account_id,
      search,
      category_id,
      subcategory_id,
      cleared_status,
      review_status = 'approved',
      start_date,
      end_date,
      limit = 500,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        t.*,
        a.name as account_name,
        a.type as account_type,
        c.name as category_name,
        sub.name as subcategory_name,
        ta.name as transfer_account_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN subcategories sub ON t.subcategory_id = sub.id
      LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
      WHERE 1=1
    `;
    const params = [];

    if (account_id) {
      query += ` AND t.account_id = ?`;
      params.push(parseInt(account_id, 10));
    }
    if (review_status && review_status !== 'all') {
      query += ` AND t.review_status = ?`;
      params.push(review_status);
    }
    if (cleared_status && cleared_status !== 'all') {
      query += ` AND t.cleared_status = ?`;
      params.push(cleared_status);
    }
    if (category_id) {
      query += ` AND t.category_id = ?`;
      params.push(parseInt(category_id, 10));
    }
    if (subcategory_id) {
      query += ` AND t.subcategory_id = ?`;
      params.push(parseInt(subcategory_id, 10));
    }
    if (start_date) {
      query += ` AND t.date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND t.date <= ?`;
      params.push(end_date);
    }
    if (search) {
      query += ` AND (t.payee LIKE ? OR t.memo LIKE ? OR t.original_description LIKE ? OR t.reference_num LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ` ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const transactions = db.prepare(query).all(...params);

    // Attach splits and attachments metadata
    if (transactions.length > 0) {
      const transIds = transactions.map(t => t.id);
      const idPlaceholders = transIds.map(() => '?').join(',');

      const allSplits = db.prepare(`
        SELECT s.*, c.name as category_name, sub.name as subcategory_name
        FROM transaction_splits s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN subcategories sub ON s.subcategory_id = sub.id
        WHERE s.transaction_id IN (${idPlaceholders})
      `).all(...transIds);

      const allAttachments = db.prepare(`
        SELECT id, transaction_id, filename, original_name, mime_type, file_size, created_at
        FROM transaction_attachments
        WHERE transaction_id IN (${idPlaceholders})
      `).all(...transIds);

      const splitsMap = {};
      allSplits.forEach(s => {
        if (!splitsMap[s.transaction_id]) splitsMap[s.transaction_id] = [];
        splitsMap[s.transaction_id].push(s);
      });

      const attachmentsMap = {};
      allAttachments.forEach(a => {
        if (!attachmentsMap[a.transaction_id]) attachmentsMap[a.transaction_id] = [];
        attachmentsMap[a.transaction_id].push(a);
      });

      transactions.forEach(t => {
        t.splits = splitsMap[t.id] || [];
        t.attachments = attachmentsMap[t.id] || [];
        t.has_splits = t.splits.length > 0;
        t.has_attachments = t.attachments.length > 0;
      });
    }

    // Running balances calculation if viewing single account
    if (account_id) {
      const acc = db.prepare('SELECT opening_balance FROM accounts WHERE id = ?').get(account_id);
      if (acc) {
        const allAsc = db.prepare(`
          SELECT id, amount FROM transactions
          WHERE account_id = ? AND review_status = 'approved'
          ORDER BY date ASC, id ASC
        `).all(account_id);

        const balanceMap = {};
        let bal = acc.opening_balance;
        allAsc.forEach(t => {
          bal += t.amount;
          balanceMap[t.id] = Number(bal.toFixed(2));
        });

        transactions.forEach(t => {
          t.running_balance = balanceMap[t.id] !== undefined ? balanceMap[t.id] : null;
        });
      }
    }

    res.json({ success: true, count: transactions.length, transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions', (req, res) => {
  try {
    const {
      account_id,
      date = new Date().toISOString().slice(0, 10),
      payee,
      amount,
      transaction_type = 'expense',
      category_id,
      subcategory_id,
      memo,
      payment_method,
      reference_num,
      cleared_status = 'uncleared',
      transfer_account_id,
      splits = [],
      learn_merchant = true
    } = req.body;

    if (!account_id || !payee || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Account, Payee, and Amount are required' });
    }

    const rawAbsAmount = Math.abs(parseFloat(amount) || 0);

    let finalAmount = 0;
    if (transaction_type === 'expense') {
      finalAmount = -rawAbsAmount;
    } else if (transaction_type === 'income') {
      finalAmount = rawAbsAmount;
    } else if (transaction_type === 'transfer') {
      finalAmount = -rawAbsAmount;
    }

    const normalizedMerchant = MerchantMemoryService.normalizeRawDescription(payee);
    const fingerprint = ImportService.generateFingerprint(account_id, date, finalAmount, normalizedMerchant, reference_num);

    const insertStmt = db.prepare(`
      INSERT INTO transactions (
        account_id, date, payee, original_description, amount, transaction_type,
        category_id, subcategory_id, memo, payment_method, reference_num,
        cleared_status, review_status, transfer_account_id, fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
    `);

    insertStmt.run(
      account_id,
      date,
      payee.trim(),
      payee.trim(),
      finalAmount,
      transaction_type,
      category_id || null,
      subcategory_id || null,
      memo?.trim() || null,
      payment_method || null,
      reference_num?.trim() || null,
      cleared_status,
      transfer_account_id || null,
      fingerprint
    );

    const newTransId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    // Handle Split records if provided
    if (splits && splits.length > 0) {
      const insertSplit = db.prepare(`
        INSERT INTO transaction_splits (transaction_id, category_id, subcategory_id, amount, memo)
        VALUES (?, ?, ?, ?, ?)
      `);
      splits.forEach(s => {
        insertSplit.run(
          newTransId,
          s.category_id || null,
          s.subcategory_id || null,
          parseFloat(s.amount) || 0,
          s.memo?.trim() || null
        );
      });
    }

    // Reciprocal transfer leg
    if (transaction_type === 'transfer' && transfer_account_id) {
      const sourceAcc = db.prepare('SELECT name FROM accounts WHERE id = ?').get(account_id);
      const recipFingerprint = ImportService.generateFingerprint(transfer_account_id, date, rawAbsAmount, `Transfer from ${sourceAcc?.name || 'Account'}`);

      insertStmt.run(
        transfer_account_id,
        date,
        `Transfer from ${sourceAcc?.name || 'Account'}`,
        `Transfer from ${sourceAcc?.name || 'Account'}`,
        rawAbsAmount,
        'transfer',
        category_id || null,
        subcategory_id || null,
        memo ? `[Transfer] ${memo}` : '[Transfer]',
        payment_method || null,
        reference_num?.trim() || null,
        cleared_status,
        account_id,
        recipFingerprint
      );

      const recipId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(recipId, newTransId);
      db.prepare('UPDATE transactions SET transfer_transaction_id = ? WHERE id = ?').run(newTransId, recipId);

      recalculateAccountBalance(transfer_account_id);
    }

    recalculateAccountBalance(account_id);

    if (learn_merchant && category_id && transaction_type === 'expense' && splits.length === 0) {
      MerchantMemoryService.learn(payee, payee, category_id, subcategory_id);
    }

    res.json({ success: true, transaction_id: newTransId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Transaction not found' });

    const {
      account_id = existing.account_id,
      date = existing.date,
      payee = existing.payee,
      amount,
      transaction_type = existing.transaction_type,
      category_id,
      subcategory_id,
      memo,
      payment_method,
      reference_num,
      cleared_status = existing.cleared_status,
      review_status = existing.review_status,
      splits,
      learn_merchant = true
    } = req.body;

    let finalAmount = existing.amount;
    if (amount !== undefined) {
      const absAmount = Math.abs(parseFloat(amount) || 0);
      finalAmount = transaction_type === 'expense' ? -absAmount : absAmount;
    }

    db.prepare(`
      UPDATE transactions
      SET account_id = ?, date = ?, payee = ?, amount = ?, transaction_type = ?,
          category_id = ?, subcategory_id = ?, memo = ?, payment_method = ?,
          reference_num = ?, cleared_status = ?, review_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      account_id,
      date,
      payee.trim(),
      finalAmount,
      transaction_type,
      category_id !== undefined ? (category_id || null) : existing.category_id,
      subcategory_id !== undefined ? (subcategory_id || null) : existing.subcategory_id,
      memo !== undefined ? (memo?.trim() || null) : existing.memo,
      payment_method !== undefined ? payment_method : existing.payment_method,
      reference_num !== undefined ? (reference_num?.trim() || null) : existing.reference_num,
      cleared_status,
      review_status,
      id
    );

    // Update Splits if provided
    if (splits !== undefined) {
      db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?').run(id);
      if (Array.isArray(splits) && splits.length > 0) {
        const insertSplit = db.prepare(`
          INSERT INTO transaction_splits (transaction_id, category_id, subcategory_id, amount, memo)
          VALUES (?, ?, ?, ?, ?)
        `);
        splits.forEach(s => {
          insertSplit.run(
            id,
            s.category_id || null,
            s.subcategory_id || null,
            parseFloat(s.amount) || 0,
            s.memo?.trim() || null
          );
        });
      }
    }

    recalculateAccountBalance(account_id);
    if (existing.account_id !== account_id) {
      recalculateAccountBalance(existing.account_id);
    }

    if (learn_merchant && category_id && transaction_type === 'expense' && (!splits || splits.length === 0)) {
      MerchantMemoryService.learn(existing.original_description || payee, payee, category_id, subcategory_id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Transaction not found' });

    if (existing.transfer_transaction_id) {
      const recip = db.prepare('SELECT account_id FROM transactions WHERE id = ?').get(existing.transfer_transaction_id);
      db.prepare('DELETE FROM transactions WHERE id = ?').run(existing.transfer_transaction_id);
      if (recip) recalculateAccountBalance(recip.account_id);
    }

    // Delete attachment files
    const attachments = db.prepare('SELECT filename FROM transaction_attachments WHERE transaction_id = ?').all(id);
    attachments.forEach(a => {
      const fPath = path.join(ATTACHMENTS_DIR, a.filename);
      if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
    });

    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    recalculateAccountBalance(existing.account_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/transactions/:id/cleared', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT cleared_status FROM transactions WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Transaction not found' });

    const nextStatus = existing.cleared_status === 'cleared' ? 'uncleared' : 'cleared';
    db.prepare('UPDATE transactions SET cleared_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextStatus, id);

    res.json({ success: true, cleared_status: nextStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch Register Operations (Bulk Categorization, Bulk Cleared, Bulk Delete)
app.post('/api/transactions/batch-update', (req, res) => {
  try {
    const { action, transaction_ids, category_id, subcategory_id, cleared_status } = req.body;
    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'transaction_ids array is required' });
    }

    const placeholders = transaction_ids.map(() => '?').join(',');
    const affectedAccounts = new Set();

    const affectedTrans = db.prepare(`SELECT account_id FROM transactions WHERE id IN (${placeholders})`).all(...transaction_ids);
    affectedTrans.forEach(t => affectedAccounts.add(t.account_id));

    if (action === 'set_category') {
      db.prepare(`
        UPDATE transactions
        SET category_id = ?, subcategory_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `).run(category_id || null, subcategory_id || null, ...transaction_ids);
    } else if (action === 'set_cleared') {
      db.prepare(`
        UPDATE transactions
        SET cleared_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `).run(cleared_status || 'cleared', ...transaction_ids);
    } else if (action === 'delete') {
      // Delete attachments
      const attachments = db.prepare(`SELECT filename FROM transaction_attachments WHERE transaction_id IN (${placeholders})`).all(...transaction_ids);
      attachments.forEach(a => {
        const fPath = path.join(ATTACHMENTS_DIR, a.filename);
        if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
      });

      db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...transaction_ids);
    }

    affectedAccounts.forEach(accId => recalculateAccountBalance(accId));

    res.json({ success: true, updated_count: transaction_ids.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch approval for Review Queue
app.post('/api/transactions/batch-approve', (req, res) => {
  try {
    const { items, learn = true } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, error: 'Items array is required' });

    const updateStmt = db.prepare(`
      UPDATE transactions
      SET payee = ?, category_id = ?, subcategory_id = ?, review_status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const affectedAccounts = new Set();

    items.forEach(item => {
      const trans = db.prepare('SELECT * FROM transactions WHERE id = ?').get(item.id);
      if (trans) {
        affectedAccounts.add(trans.account_id);
        const finalPayee = item.payee || trans.payee;
        const catId = item.category_id !== undefined ? item.category_id : trans.category_id;
        const subId = item.subcategory_id !== undefined ? item.subcategory_id : trans.subcategory_id;

        updateStmt.run(finalPayee, catId, subId, item.id);

        if (learn && catId) {
          MerchantMemoryService.learn(trans.original_description || finalPayee, finalPayee, catId, subId);
        }
      }
    });

    affectedAccounts.forEach(accId => recalculateAccountBalance(accId));

    res.json({ success: true, approved_count: items.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3B. RECEIPT & INVOICE ATTACHMENTS API
// -------------------------------------------------------------
app.post('/api/transactions/:id/attachments', (req, res) => {
  try {
    const transId = parseInt(req.params.id, 10);
    const { original_name = 'receipt.png', mime_type = 'image/png', base64_data } = req.body;

    if (!base64_data) return res.status(400).json({ success: false, error: 'base64_data is required' });

    // Clean base64 header if present
    const cleanBase64 = base64_data.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = path.extname(original_name) || (mime_type.includes('pdf') ? '.pdf' : '.png');
    const storedFilename = `receipt_${transId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const destPath = path.join(ATTACHMENTS_DIR, storedFilename);

    fs.writeFileSync(destPath, buffer);

    db.prepare(`
      INSERT INTO transaction_attachments (transaction_id, filename, original_name, mime_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `).run(transId, storedFilename, original_name, mime_type, buffer.length);

    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    res.json({
      success: true,
      attachment: {
        id: newId,
        transaction_id: transId,
        filename: storedFilename,
        original_name,
        mime_type,
        file_size: buffer.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/attachments/:id/view', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const att = db.prepare('SELECT * FROM transaction_attachments WHERE id = ?').get(id);
    if (!att) return res.status(404).send('Attachment not found');

    const filePath = path.join(ATTACHMENTS_DIR, att.filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/attachments/:id/download', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const att = db.prepare('SELECT * FROM transaction_attachments WHERE id = ?').get(id);
    if (!att) return res.status(404).send('Attachment not found');

    const filePath = path.join(ATTACHMENTS_DIR, att.filename);
    res.download(filePath, att.original_name);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.delete('/api/attachments/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const att = db.prepare('SELECT * FROM transaction_attachments WHERE id = ?').get(id);
    if (att) {
      const filePath = path.join(ATTACHMENTS_DIR, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.prepare('DELETE FROM transaction_attachments WHERE id = ?').run(id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. MERCHANT MEMORY API
// -------------------------------------------------------------
app.get('/api/merchant-memory', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT m.*, c.name as category_name, sub.name as subcategory_name
      FROM merchant_memory m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN subcategories sub ON m.subcategory_id = sub.id
      ORDER BY m.times_seen DESC, m.confidence DESC
    `).all();

    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/merchant-memory', (req, res) => {
  try {
    const { normalized_merchant, match_pattern, match_type = 'contains', display_payee, category_id, subcategory_id, confidence = 1.0 } = req.body;
    if (!match_pattern || !display_payee) {
      return res.status(400).json({ success: false, error: 'Pattern and Display Payee are required' });
    }

    const norm = normalized_merchant || MerchantMemoryService.normalizeRawDescription(match_pattern);
    db.prepare(`
      INSERT INTO merchant_memory (normalized_merchant, match_pattern, match_type, display_payee, category_id, subcategory_id, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(norm, match_pattern.trim(), match_type, display_payee.trim(), category_id || null, subcategory_id || null, confidence);

    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    res.json({ success: true, rule_id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/merchant-memory/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { match_pattern, match_type, display_payee, category_id, subcategory_id, confidence } = req.body;

    db.prepare(`
      UPDATE merchant_memory
      SET match_pattern = ?, match_type = ?, display_payee = ?, category_id = ?,
          subcategory_id = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(match_pattern.trim(), match_type, display_payee.trim(), category_id || null, subcategory_id || null, confidence, id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/merchant-memory/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM merchant_memory WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/merchant-memory/test', (req, res) => {
  try {
    const { description } = req.body;
    const match = MerchantMemoryService.match(description);
    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/merchant-memory/reprocess', (req, res) => {
  try {
    const updatedCount = MerchantMemoryService.reclassifyPendingTransactions();
    res.json({ success: true, updated_count: updatedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5. SCHEDULED BILLS & DEPOSITS API
// -------------------------------------------------------------
app.get('/api/scheduled', (req, res) => {
  try {
    const scheduled = db.prepare(`
      SELECT s.*, a.name as account_name, c.name as category_name, sub.name as subcategory_name
      FROM scheduled_transactions s
      JOIN accounts a ON s.account_id = a.id
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN subcategories sub ON s.subcategory_id = sub.id
      ORDER BY s.next_due_date ASC
    `).all();

    res.json({ success: true, scheduled });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scheduled', (req, res) => {
  try {
    const {
      payee,
      amount,
      account_id,
      transaction_type = 'expense',
      category_id,
      subcategory_id,
      payment_method,
      frequency = 'monthly',
      next_due_date = new Date().toISOString().slice(0, 10),
      auto_create = 0,
      memo
    } = req.body;

    if (!payee || !amount || !account_id) {
      return res.status(400).json({ success: false, error: 'Payee, Amount, and Account are required' });
    }

    db.prepare(`
      INSERT INTO scheduled_transactions (
        payee, amount, account_id, transaction_type, category_id, subcategory_id,
        payment_method, frequency, next_due_date, auto_create, memo
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payee.trim(),
      Math.abs(parseFloat(amount)),
      account_id,
      transaction_type,
      category_id || null,
      subcategory_id || null,
      payment_method || null,
      frequency,
      next_due_date,
      auto_create ? 1 : 0,
      memo?.trim() || null
    );

    const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    res.json({ success: true, scheduled_id: newId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/scheduled/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { payee, amount, account_id, transaction_type, category_id, subcategory_id, payment_method, frequency, next_due_date, auto_create, active, memo } = req.body;

    db.prepare(`
      UPDATE scheduled_transactions
      SET payee = ?, amount = ?, account_id = ?, transaction_type = ?,
          category_id = ?, subcategory_id = ?, payment_method = ?,
          frequency = ?, next_due_date = ?, auto_create = ?, active = ?, memo = ?
      WHERE id = ?
    `).run(
      payee.trim(),
      Math.abs(parseFloat(amount)),
      account_id,
      transaction_type,
      category_id || null,
      subcategory_id || null,
      payment_method || null,
      frequency,
      next_due_date,
      auto_create ? 1 : 0,
      active ? 1 : 0,
      memo?.trim() || null,
      id
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/scheduled/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM scheduled_transactions WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scheduled/:id/record', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { date } = req.body;
    const result = SchedulerService.recordScheduledTransaction(id, date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/scheduled/projection', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const projection = SchedulerService.getCashFlowProjection(days);
    res.json({ success: true, projection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 6. CSV IMPORT API
// -------------------------------------------------------------
app.post('/api/import/preview', (req, res) => {
  try {
    const { csv_content, account_id, custom_profile } = req.body;
    if (!csv_content || !account_id) {
      return res.status(400).json({ success: false, error: 'CSV content and account_id are required' });
    }

    const preview = ImportService.previewImport(csv_content, parseInt(account_id, 10), custom_profile);
    res.json({ success: true, preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/import/process', (req, res) => {
  try {
    const { filename, account_id, transactions, auto_approve_confidence = 0.95 } = req.body;
    if (!account_id || !transactions) {
      return res.status(400).json({ success: false, error: 'account_id and transactions are required' });
    }

    const result = ImportService.processImport({
      filename,
      accountId: parseInt(account_id, 10),
      transactions,
      autoApproveConfidence: parseFloat(auto_approve_confidence)
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/import/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT * FROM import_profiles ORDER BY name').all();
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/import/profiles', (req, res) => {
  try {
    const { name, institution, date_format = 'YYYY-MM-DD', column_mappings, amount_format } = req.body;
    db.prepare(`
      INSERT INTO import_profiles (name, institution, date_format, column_mappings, amount_format)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, institution, date_format, JSON.stringify(column_mappings), JSON.stringify(amount_format));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/import/history', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT h.*, a.name as account_name
      FROM import_history h
      LEFT JOIN accounts a ON h.account_id = a.id
      ORDER BY h.import_date DESC
      LIMIT 20
    `).all();

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 7. STATEMENT RECONCILIATION API
// -------------------------------------------------------------
app.post('/api/reconciliation/start', (req, res) => {
  try {
    const { account_id, statement_date, statement_balance } = req.body;
    if (!account_id || !statement_date || statement_balance === undefined) {
      return res.status(400).json({ success: false, error: 'account_id, statement_date, and statement_balance are required' });
    }

    const data = ReconciliationService.getReconciliationData(
      parseInt(account_id, 10),
      statement_date,
      parseFloat(statement_balance)
    );

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/reconciliation/commit', (req, res) => {
  try {
    const { account_id, statement_date, statement_balance, cleared_transaction_ids } = req.body;
    const result = ReconciliationService.commitReconciliation({
      accountId: parseInt(account_id, 10),
      statementDate: statement_date,
      statementBalance: parseFloat(statement_balance),
      clearedTransactionIds: cleared_transaction_ids
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 8. REPORTS API
// -------------------------------------------------------------
app.get('/api/reports/dashboard', (req, res) => {
  try {
    const summary = ReportService.getDashboardSummary();
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/spending-category', (req, res) => {
  try {
    const { start_date, end_date, account_id } = req.query;
    const data = ReportService.getSpendingByCategory({
      startDate: start_date,
      endDate: end_date,
      accountId: account_id ? parseInt(account_id, 10) : null
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/profit-loss', (req, res) => {
  try {
    const { start_date, end_date, account_id } = req.query;
    const data = ReportService.getProfitAndLoss({
      startDate: start_date,
      endDate: end_date,
      accountId: account_id ? parseInt(account_id, 10) : null
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/cash-flow', (req, res) => {
  try {
    const months = parseInt(req.query.months, 10) || 12;
    const trend = ReportService.getMonthlyCashFlowTrend(months);
    res.json({ success: true, trend });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/payees', (req, res) => {
  try {
    const { start_date, end_date, limit = 20 } = req.query;
    const payees = ReportService.getPayeeSpending({
      startDate: start_date,
      endDate: end_date,
      limit: parseInt(limit, 10)
    });
    res.json({ success: true, payees });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 9. BACKUP, EXPORT & MIGRATION API
// -------------------------------------------------------------
app.get('/api/backup/download-db', (req, res) => {
  try {
    const snapshot = BackupService.createSnapshot();
    res.download(snapshot.path, snapshot.filename);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup/create-snapshot', (req, res) => {
  try {
    const snapshot = BackupService.createSnapshot();
    res.json({ success: true, snapshot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/list', (req, res) => {
  try {
    const backups = BackupService.listBackups();
    res.json({ success: true, backups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/export-json', (req, res) => {
  try {
    const data = BackupService.exportFullJSON();
    res.setHeader('Content-Disposition', `attachment; filename=gathering_moss_export_${new Date().toISOString().slice(0, 10)}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/export-csv', (req, res) => {
  try {
    const accountId = req.query.account_id ? parseInt(req.query.account_id, 10) : null;
    const csvData = BackupService.exportTransactionsCSV(accountId);
    res.setHeader('Content-Disposition', `attachment; filename=gathering_moss_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup/clear-transactions', (req, res) => {
  try {
    // Create automatic safety snapshot first
    BackupService.createSnapshot();

    db.exec(`
      DELETE FROM transaction_attachments;
      DELETE FROM transaction_splits;
      DELETE FROM transactions;
      DELETE FROM import_history;
      DELETE FROM reconciliations;
    `);

    recalculateAllAccountBalances();
    res.json({ success: true, message: 'All transactions cleared. Safety backup saved.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup/legacy-migration', (req, res) => {
  try {
    const { csv_content, default_account_id } = req.body;
    if (!csv_content) return res.status(400).json({ success: false, error: 'CSV content is required' });

    const result = BackupService.importLegacyGoogleSheets(csv_content, default_account_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 10. BANK FEED (SIMPLEFIN BRIDGE) API
// -------------------------------------------------------------
app.get('/api/bank-feed/status', async (req, res) => {
  try {
    let configured = false;
    try {
      SimplefinService.getAccessUrl();
      configured = true;
    } catch {
      configured = false;
    }

    const lastImport = db.prepare(`
      SELECT * FROM import_history 
      WHERE filename LIKE '%SimpleFIN%' 
      ORDER BY import_date DESC 
      LIMIT 1
    `).get();

    res.json({
      success: true,
      configured,
      institution: 'PNC Bank',
      last_sync: lastImport?.import_date || null,
      last_import: lastImport || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bank-feed/sync', async (req, res) => {
  try {
    const days = parseInt(req.body.days || req.query.days || '7', 10);
    const result = await SimplefinService.sync({ days });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gathering Moss Financial Center server running on http://localhost:${PORT}`);
});
