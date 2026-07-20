/**
 * ============================================================
 * Gathering Moss Financial Center
 * Config.gs
 *
 * Version: 0.17.0
 * ============================================================
 */

const GM = {

  APP_NAME: "Gathering Moss Financial Center",

  VERSION: "0.17.0",

  BUILD_DATE: "2026-07-16",

  SHEETS: {
    HOME: "Home",
    ENTRY: "Entry",
    REVIEW: "Review",
    REGISTER: "Register",
    SCHEDULED: "Scheduled",
    REPORTS: "Reports",
    SETTINGS: "Settings"
  },

  DATABASE: {
    TRANSACTIONS: "DB_Transactions",
    BALANCES: "DB_Balances",
    ACCOUNTS: "DB_Accounts",
    CATEGORIES: "DB_Categories",
    AUTOCAT: "DB_AutoCat",
    MANUAL_TRANSACTIONS: "GM_ManualTransactions",
    RECURRING_TRANSACTIONS: "GM_RecurringTransactions",
    TRANSACTION_METADATA: "GM_TransactionMeta",
    MERCHANT_MEMORY: "GM_MerchantMemory"
  },

  HISTORICAL: {
    GROUP: "Historical Backlog",
    INCOME_CATEGORY: "Historical Income",
    EXPENSE_CATEGORY: "Historical Expense"
  },

  MERCHANT_MEMORY: {
    MIN_SUGGEST_CONFIDENCE: 70,
    MIN_AUTO_CONFIDENCE: 90,
    STARTING_CONFIDENCE: 75,
    REPEAT_MATCH_INCREASE: 4,
    CONFLICT_DECREASE: 12,
    MINIMUM_CONFIDENCE: 40,
    REPLACEMENT_THRESHOLD: 70
  },

  MATCHING: {
    MIN_CONFIDENCE: 70,
    MAX_DAY_DIFFERENCE: 7,
    MAX_AMOUNT_DIFFERENCE: 0.01
  },

  COLORS: {
    PRIMARY: "#1F5A36",
    ACCENT: "#2E7048",
    LIGHT: "#DCE9DF",
    HEADER: "#123D25",
    WHITE: "#FFFFFF",
    WARNING: "#B97818",
    ERROR: "#9F2F2F",
    GRAY: "#D3DAD5",
    PAGE: "#D7DED8",
    PANEL: "#F0F4F1",
    INPUT: "#E5EEE7",
    BORDER: "#82988A",
    TEXT: "#173522",
    MUTED: "#5C6F62",
    DEEP: "#0D2F1C",
    SAGE: "#BFD0C3"
  },

  /**
   * Windows Phone-style "live tile" accent palette, used on the
   * Home dashboard. CANVAS is the dark backdrop the tiles float
   * on; GUTTER is the thin dark seam drawn between tiles. Each
   * TILE_ color is a genuine Windows Phone accent color, chosen
   * so every tile reads as its own distinct block, the way the
   * Start screen worked.
   */
  METRO: {
    CANVAS: "#EDF1EA",
    GUTTER: "#C9D2C6",
    TILE_TEXT: "#FFFFFF",
    TILE_TEXT_MUTED: "#5C6F62",
    TILE_CASH: "#008A00",
    TILE_PROJECTED: "#0050EF",
    TILE_INCOME: "#00ABA9",
    TILE_EXPENSES: "#FA6800",
    TILE_REVIEW: "#D80073",
    TILE_UNCLEARED: "#6A00FF"
  },

  PAYMENT_METHODS: [
    "Debit Card",
    "Credit Card",
    "Cash",
    "Check",
    "ACH",
    "Wire",
    "PayPal",
    "Venmo",
    "Shopify Payout",
    "Square",
    "Other"
  ],

  REVIEW_STATUS: [
    "Needs Review",
    "Approved",
    "Reconciled"
  ],

  TAX_STATUS: [
    "Tax Deductible",
    "Not Deductible",
    "Partial"
  ],

  RECURRING_FREQUENCIES: [
    "Weekly",
    "Every 2 Weeks",
    "Monthly",
    "Quarterly",
    "Yearly"
  ]

};
