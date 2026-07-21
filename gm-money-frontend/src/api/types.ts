export type CategoryGroup = {
  type: "Income" | "Expense";
  categories: { name: string; subcategories: string[] }[];
};

export type FormOptions = {
  categoryGroups: CategoryGroup[];
  accounts: string[];
  paymentMethods: string[];
};

export type CreateTransactionPayload = {
  date: string;
  account: string;
  payee: string;
  amount: number;
  category: string;
  subcategory: string;
  paymentMethod: string;
  notes: string;
  enteredBy: string;
};

export type CreateTransactionResult = {
  transactionId?: string;
  amount?: number;
  type?: "Income" | "Expense";
  duplicate?: boolean;
  message?: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: string[] };

export type RegisterStatus = "Uncleared" | "Cleared" | "Reconciled";

export type RegisterEntry = {
  transactionId: string;
  date: string;
  payee: string;
  category: string;
  subcategory: string;
  paymentMethod: string;
  amount: number;
  runningBalance: number;
  status: RegisterStatus;
  source: "Manual" | "Bank";
  notes: string;
};

export type RegisterData = {
  account: string;
  bankBalance: number;
  projectedBalance: number;
  entries: RegisterEntry[];
  totalCount: number;
  truncated: boolean;
};

export type UpdateTransactionPayload = CreateTransactionPayload & {
  transactionId: string;
};

export type UpdateTransactionResult = {
  transactionId: string;
  amount: number;
  type: "Income" | "Expense";
};

export type DeleteTransactionResult = {
  transactionId: string;
};

export type UpdateTransactionStatusResult = {
  transactionId: string;
  status: RegisterStatus;
};

export type MatchTransactionPayload = {
  transactionId: string;
  bankDate: string;
  bankDescription: string;
  bankAmount: number;
  bankAccount: string;
};

export type MatchTransactionResult = {
  transactionId: string;
  bankKey: string;
};

export type ReviewTransaction = {
  sourceRow: number;
  date: string;
  description: string;
  amount: number;
  account: string;
  transactionKey: string;
};

export type ApproveTransactionPayload = {
  sourceRow: number;
  category: string;
  subcategory: string;
  notes: string;
};

export type ApproveTransactionResult = {
  sourceRow: number;
  transactionKey: string;
};

export type DashboardRecentTransaction = {
  date: string;
  payee: string;
  category: string;
  subcategory: string;
  amount: number;
  status: RegisterStatus;
  account: string;
};

export type DashboardAccountBalance = {
  account: string;
  balance: number;
};

export type DashboardData = {
  currentCash: number;
  projectedCash: number;
  incomeThisMonth: number;
  expensesThisMonth: number;
  pendingReviewCount: number;
  unclearedCount: number;
  accountBalances: DashboardAccountBalance[];
  recentTransactions: DashboardRecentTransaction[];
};

export type AddCategoryPayload = {
  name: string;
  type: "Income" | "Expense";
};

export type ScheduledTransaction = {
  scheduleId: string;
  payee: string;
  amount: number;
  account: string;
  category: string;
  subcategory: string;
  paymentMethod: string;
  frequency: string;
  nextDue: string;
  active: boolean;
  autoCreate: boolean;
  notes: string;
};

export type ScheduledTransactionPayload = {
  payee: string;
  amount: number;
  account: string;
  category: string;
  subcategory: string;
  paymentMethod: string;
  frequency: string;
  nextDue: string;
  active: boolean;
  autoCreate: boolean;
  notes: string;
};

export type UpdateScheduledTransactionPayload = ScheduledTransactionPayload & {
  scheduleId: string;
};

export type MerchantMemoryStatus = "Locked" | "Auto-Ready" | "Learning";

export type MerchantMemoryRecord = {
  merchantKey: string;
  merchant: string;
  category: string;
  subcategory: string;
  timesUsed: number;
  firstSeen: string;
  lastSeen: string;
  confidence: number;
  locked: boolean;
  status: MerchantMemoryStatus;
};

export type MerchantMemoryStats = {
  merchants: number;
  autoLearned: number;
  locked: number;
};

export type MerchantMemoryData = {
  records: MerchantMemoryRecord[];
  stats: MerchantMemoryStats;
};

export type GetMerchantMemoryPayload = {
  search?: string;
  filter?: "All" | "Auto-Ready" | "Learning" | "Locked";
};

export type UpdateMerchantMemoryPayload = {
  merchantKey: string;
  preferredMerchant: string;
  category: string;
  subcategory: string;
};

export type AddCategoryResult = {
  name: string;
  type: "Income" | "Expense";
};

export type AddSubcategoryPayload = {
  category: string;
  subcategory: string;
};

export type AddSubcategoryResult = {
  category: string;
  subcategory: string;
};

export type DeleteSubcategoryPayload = {
  category: string;
  subcategory: string;
};

export type DeleteCategoryPayload = {
  category: string;
};

export type AddPaymentMethodPayload = {
  name: string;
};

export type DeletePaymentMethodPayload = {
  name: string;
};
