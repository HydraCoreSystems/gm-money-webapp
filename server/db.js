import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory path
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'gathering_moss.db');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    -- Accounts table
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT,
      type TEXT NOT NULL CHECK(type IN ('checking', 'savings', 'credit_card', 'cash', 'loan', 'other')),
      opening_balance REAL DEFAULT 0.00,
      current_balance REAL DEFAULT 0.00,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'transfer')),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Subcategories table
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, name)
    );

    -- Import Profiles table
    CREATE TABLE IF NOT EXISTS import_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      institution TEXT,
      date_format TEXT DEFAULT 'YYYY-MM-DD',
      has_header INTEGER DEFAULT 1,
      column_mappings TEXT NOT NULL, -- JSON string
      amount_format TEXT NOT NULL,   -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Import History table
    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_hash TEXT,
      import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      account_id INTEGER REFERENCES accounts(id),
      profile_id INTEGER REFERENCES import_profiles(id),
      total_rows INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
      duplicate_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed'
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      date TEXT NOT NULL, -- ISO YYYY-MM-DD
      posted_date TEXT,
      payee TEXT NOT NULL,
      original_description TEXT,
      amount REAL NOT NULL, -- Standard sign: negative for expense/debit, positive for income/credit
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('expense', 'income', 'transfer')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      memo TEXT,
      payment_method TEXT,
      reference_num TEXT,
      cleared_status TEXT DEFAULT 'uncleared' CHECK(cleared_status IN ('uncleared', 'cleared', 'reconciled')),
      review_status TEXT DEFAULT 'approved' CHECK(review_status IN ('pending_review', 'approved')),
      transfer_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      transfer_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      import_id INTEGER REFERENCES import_history(id) ON DELETE SET NULL,
      fingerprint TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Merchant Memory table
    CREATE TABLE IF NOT EXISTS merchant_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_merchant TEXT NOT NULL UNIQUE,
      match_pattern TEXT NOT NULL,
      match_type TEXT DEFAULT 'contains' CHECK(match_type IN ('exact', 'contains', 'regex', 'prefix')),
      display_payee TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      confidence REAL DEFAULT 1.0,
      times_seen INTEGER DEFAULT 1,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_confirmed DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Scheduled Transactions table
    CREATE TABLE IF NOT EXISTS scheduled_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payee TEXT NOT NULL,
      amount REAL NOT NULL, -- Always positive in configuration; transaction_type determines sign
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('expense', 'income', 'transfer')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      payment_method TEXT,
      frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
      next_due_date TEXT NOT NULL, -- YYYY-MM-DD
      auto_create INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      memo TEXT,
      last_generated_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Transaction Splits table (for dividing one transaction across multiple categories)
    CREATE TABLE IF NOT EXISTS transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Transaction Attachments table (for receipts, invoices, PDF/images)
    CREATE TABLE IF NOT EXISTS transaction_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Account Reconciliation History table
    CREATE TABLE IF NOT EXISTS reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      statement_date TEXT NOT NULL,
      statement_balance REAL NOT NULL,
      cleared_balance REAL NOT NULL,
      difference REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for ultra-fast query performance
    CREATE INDEX IF NOT EXISTS idx_trans_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id, subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_trans_fingerprint ON transactions(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(review_status);
    CREATE INDEX IF NOT EXISTS idx_merchant_pattern ON merchant_memory(match_pattern);
    CREATE INDEX IF NOT EXISTS idx_splits_trans ON transaction_splits(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_trans ON transaction_attachments(transaction_id);
  `);

  const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  }

  seedDefaultData();
  recalculateAllAccountBalances();
}

function seedDefaultData() {
  // Check if categories already exist
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    const seedCategories = [
      {
        name: 'Plants',
        type: 'expense',
        subcategories: ['Plant Inventory', 'Growing Media', 'Fertilizer', 'Pots & Trays', 'Seeds & Cuttings', 'Pest Management']
      },
      {
        name: '3D Printing',
        type: 'expense',
        subcategories: ['Filament', 'Printer Parts', 'Tools', 'Resin', 'Maintenance & Upgrades']
      },
      {
        name: 'Shipping',
        type: 'expense',
        subcategories: ['Postage', 'Packaging', 'Shipping Supplies', 'Labels & Tape']
      },
      {
        name: 'Software',
        type: 'expense',
        subcategories: ['Shopify', 'ChatGPT', 'Web Hosting', 'Subscriptions', 'Accounting & Tools']
      },
      {
        name: 'Meals',
        type: 'expense',
        subcategories: ['Restaurants', 'Groceries', 'Business Travel Meals']
      },
      {
        name: 'Office',
        type: 'expense',
        subcategories: ['Office Supplies', 'Equipment', 'Printing', 'Furniture']
      },
      {
        name: 'Utilities',
        type: 'expense',
        subcategories: ['Electricity', 'Water', 'Internet', 'Phone']
      },
      {
        name: 'Taxes & Licenses',
        type: 'expense',
        subcategories: ['State Taxes', 'Federal Taxes', 'Business License', 'Registered Agent']
      },
      {
        name: 'Banking & Fees',
        type: 'expense',
        subcategories: ['Bank Service Fees', 'Payment Processing Fees', 'Interest Expense']
      },
      {
        name: 'Income',
        type: 'income',
        subcategories: ['Plant Sales', '3D Printed Product Sales', 'Shipping Income', 'Custom Orders', 'Interest Income', 'Other Income']
      },
      {
        name: 'Transfer',
        type: 'transfer',
        subcategories: ['Internal Transfer', 'Owner Draw', 'Owner Contribution', 'Credit Card Payment']
      }
    ];

    const insertCat = db.prepare('INSERT INTO categories (name, type, sort_order) VALUES (?, ?, ?)');
    const insertSub = db.prepare('INSERT INTO subcategories (category_id, name, sort_order) VALUES (?, ?, ?)');

    seedCategories.forEach((cat, cIdx) => {
      insertCat.run(cat.name, cat.type, cIdx * 10);
      const catId = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat.name).id;
      cat.subcategories.forEach((sub, sIdx) => {
        insertSub.run(catId, sub, sIdx * 10);
      });
    });
  }

  // Check accounts
  const accCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
  if (accCount === 0) {
    const insertAcc = db.prepare(`
      INSERT INTO accounts (name, institution, type, opening_balance, current_balance, active, notes)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    insertAcc.run('Gathering Moss Business Checking', 'Chase', 'checking', 2500.00, 2500.00, 'Primary operational checking account');
    insertAcc.run('Gathering Moss Credit Card', 'Capital One', 'credit_card', 0.00, 0.00, 'Business purchasing credit card');
    insertAcc.run('Business Savings & Reserve', 'Chase', 'savings', 5000.00, 5000.00, 'Tax and reserve savings');
    insertAcc.run('Cash on Hand', 'Local', 'cash', 150.00, 150.00, 'Petty cash for farmers markets & local events');
  }

  // Pre-seed merchant memory rules
  const memCount = db.prepare('SELECT COUNT(*) as count FROM merchant_memory').get().count;
  if (memCount === 0) {
    const getCatId = (name) => db.prepare('SELECT id FROM categories WHERE name = ?').get(name)?.id;
    const getSubId = (catId, name) => db.prepare('SELECT id FROM subcategories WHERE category_id = ? AND name = ?').get(catId, name)?.id;

    const plantsId = getCatId('Plants');
    const printingId = getCatId('3D Printing');
    const shippingId = getCatId('Shipping');
    const softwareId = getCatId('Software');
    const mealsId = getCatId('Meals');
    const officeId = getCatId('Office');
    const incomeId = getCatId('Income');

    const rules = [
      {
        pattern: 'USPS',
        normalized: 'USPS',
        display: 'United States Postal Service',
        cat: shippingId,
        sub: getSubId(shippingId, 'Postage')
      },
      {
        pattern: 'PIRATE SHIP',
        normalized: 'PIRATE SHIP',
        display: 'Pirate Ship Postage',
        cat: shippingId,
        sub: getSubId(shippingId, 'Postage')
      },
      {
        pattern: 'SHOPIFY',
        normalized: 'SHOPIFY',
        display: 'Shopify',
        cat: softwareId,
        sub: getSubId(softwareId, 'Shopify')
      },
      {
        pattern: 'OPENAI',
        normalized: 'OPENAI',
        display: 'OpenAI / ChatGPT',
        cat: softwareId,
        sub: getSubId(softwareId, 'ChatGPT')
      },
      {
        pattern: 'CHATGPT',
        normalized: 'CHATGPT',
        display: 'OpenAI / ChatGPT',
        cat: softwareId,
        sub: getSubId(softwareId, 'ChatGPT')
      },
      {
        pattern: 'MICRO CENTER',
        normalized: 'MICRO CENTER',
        display: 'Micro Center',
        cat: printingId,
        sub: getSubId(printingId, 'Filament')
      },
      {
        pattern: 'BAMBU LAB',
        normalized: 'BAMBU LAB',
        display: 'Bambu Lab',
        cat: printingId,
        sub: getSubId(printingId, 'Filament')
      },
      {
        pattern: 'CHICK-FIL-A',
        normalized: 'CHICK-FIL-A',
        display: 'Chick-fil-A',
        cat: mealsId,
        sub: getSubId(mealsId, 'Restaurants')
      },
      {
        pattern: 'HOME DEPOT',
        normalized: 'HOME DEPOT',
        display: 'The Home Depot',
        cat: plantsId,
        sub: getSubId(plantsId, 'Pots & Trays')
      },
      {
        pattern: 'SQUARE INC',
        normalized: 'SQUARE INC',
        display: 'Square Sales Deposit',
        cat: incomeId,
        sub: getSubId(incomeId, 'Plant Sales')
      },
      {
        pattern: 'STRIPE',
        normalized: 'STRIPE',
        display: 'Stripe Payout',
        cat: incomeId,
        sub: getSubId(incomeId, '3D Printed Product Sales')
      }
    ];

    const insertMem = db.prepare(`
      INSERT INTO merchant_memory (normalized_merchant, match_pattern, match_type, display_payee, category_id, subcategory_id, confidence, times_seen)
      VALUES (?, ?, 'contains', ?, ?, ?, 1.0, 5)
    `);

    rules.forEach(r => {
      if (r.cat) {
        insertMem.run(r.normalized, r.pattern, r.display, r.cat, r.sub || null);
      }
    });
  }

  // Pre-seed sample import profiles
  const profileCount = db.prepare('SELECT COUNT(*) as count FROM import_profiles').get().count;
  if (profileCount === 0) {
    const insertProfile = db.prepare(`
      INSERT INTO import_profiles (name, institution, date_format, has_header, column_mappings, amount_format)
      VALUES (?, ?, ?, 1, ?, ?)
    `);

    insertProfile.run(
      'Chase Checking / Savings CSV',
      'Chase',
      'MM/DD/YYYY',
      JSON.stringify({
        date: 'Posting Date',
        alt_date: 'Transaction Date',
        payee: 'Description',
        amount: 'Amount',
        type: 'Type',
        memo: 'Memo',
        ref: 'Check or Slip #'
      }),
      JSON.stringify({
        mode: 'single_signed',
        positive_is_credit: true
      })
    );

    insertProfile.run(
      'Capital One Credit Card CSV',
      'Capital One',
      'YYYY-MM-DD',
      JSON.stringify({
        date: 'Transaction Date',
        posted_date: 'Posted Date',
        payee: 'Description',
        debit: 'Debit',
        credit: 'Credit',
        category: 'Category'
      }),
      JSON.stringify({
        mode: 'split_debit_credit',
        debit_positive: true // in CC statements Debit is an expense, Credit is payment
      })
    );

    insertProfile.run(
      'Discover Card CSV',
      'Discover',
      'MM/DD/YYYY',
      JSON.stringify({
        date: 'Trans. Date',
        posted_date: 'Post Date',
        payee: 'Description',
        amount: 'Amount',
        category: 'Category'
      }),
      JSON.stringify({
        mode: 'single_signed',
        positive_is_credit: false // in Discover, positive is charge/expense
      })
    );

    insertProfile.run(
      'Generic Bank Standard CSV',
      'Generic',
      'AUTO',
      JSON.stringify({
        date: 'Date',
        payee: 'Payee',
        description: 'Description',
        amount: 'Amount',
        debit: 'Debit',
        credit: 'Credit',
        memo: 'Memo'
      }),
      JSON.stringify({
        mode: 'auto'
      })
    );
  }
}

export function recalculateAllAccountBalances() {
  const accounts = db.prepare('SELECT id, opening_balance FROM accounts').all();
  const updateBal = db.prepare('UPDATE accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  accounts.forEach(acc => {
    const sumRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as net_activity
      FROM transactions
      WHERE account_id = ? AND review_status = 'approved'
    `).get(acc.id);

    const newBalance = Number((acc.opening_balance + sumRow.net_activity).toFixed(2));
    updateBal.run(newBalance, acc.id);
  });
}

export function recalculateAccountBalance(accountId) {
  const acc = db.prepare('SELECT id, opening_balance FROM accounts WHERE id = ?').get(accountId);
  if (!acc) return;

  const sumRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as net_activity
    FROM transactions
    WHERE account_id = ? AND review_status = 'approved'
  `).get(accountId);

  const newBalance = Number((acc.opening_balance + sumRow.net_activity).toFixed(2));
  db.prepare('UPDATE accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, accountId);
}
