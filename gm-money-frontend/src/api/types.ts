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
