# Gathering Moss Financial Center

A modern, standalone financial-management application built specifically for **Gathering Moss LLC**, inspired by the classic desktop workflow of **Microsoft Money**.

---

## Key Highlights

- **Zero Cloud / Bank Feed Subscriptions**: No Plaid, Tiller, or monthly SaaS costs. You own 100% of your data.
- **Universal CSV Importer**: Drag & drop CSV downloads from Chase, Capital One, Discover, Amex, PayPal, or any bank.
- **Cryptographic Deduplication**: Re-importing overlapping statement periods automatically ignores already-imported transactions.
- **Merchant Memory**: Learns vendor naming patterns (stripping store numbers & noise) and auto-suggests Category & Subcategory.
- **Natural Transaction Entry**: Type positive amounts for expenses (e.g. `48.99`) without minus sign confusion.
- **Account Register & Running Balances**: Instant search, sorting, inline editing, and cleared-status cycling.
- **Statement Reconciliation**: Traditional Microsoft Money statement balance matching to `$0.00` difference.
- **Scheduled Bills & Cash Projections**: Recurring frequencies (weekly, bi-weekly, monthly, etc.) with a 30/60/90-day cash flow projection engine.
- **Financial Reports & Statements**: Structured Profit & Loss (P&L), Spending by Category with subcategory drilldown, and monthly cash flow trends.
- **One-Click Backups & Migration**: 1-click download of the SQLite database (`gathering_moss.db`), automatic local snapshots, full CSV/JSON export, and legacy Google Sheets migration tool.

---

## Quick Start

### 1. Launch the Application

```bash
cd C:\Users\pwach\.gemini\antigravity\scratch\gathering-moss-financial-center
npm start
```

### 2. Open in Browser

Visit **`http://localhost:3000`** in your browser.

---

## Technology Stack

- **Backend**: Node.js + Express (Pure JavaScript)
- **Database**: Native `node:sqlite` (`gathering_moss.db`) with WAL mode enabled
- **Frontend**: Single Page Application (HTML5, Vanilla CSS Design System, ES6 Modules, Chart.js)

---

## Data & Backups Location

- **Database File**: `data/gathering_moss.db`
- **Snapshots**: `data/backups/`
