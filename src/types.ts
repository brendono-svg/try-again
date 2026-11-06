export type Owner = 'me' | 'partner' | 'joint';
export type Bank = 'Westpac' | 'ASB' | 'Other';
export type AccountKind = 'transaction' | 'savings' | 'credit' | 'loan' | 'other';

export interface Account {
  id: string;
  bank: Bank;
  number: string;
  /** Name printed on the statement (e.g. "Orr Brendon Laurence"). */
  holder?: string;
  /** Product name from the statement (e.g. "Westpac Everyday"). */
  product?: string;
  kind: AccountKind;
  owner: Owner;
  nickname?: string;
}

/** A transaction as it comes out of a statement parser (before categorising). */
export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  /** Negative = money out, positive = money in. */
  amount: number;
  description: string;
  otherParty?: string;
  particulars?: string;
  reference?: string;
  type?: string;
  balance?: number;
  cardholder?: string;
}

export interface CardDetails {
  dueDate?: string;
  minimumPayment?: number;
  creditLimit?: number;
  overdue?: number;
}

export interface ParsedStatement {
  bank: Bank;
  accountNumber: string;
  holder?: string;
  product?: string;
  kind: AccountKind;
  periodStart?: string;
  periodEnd?: string;
  /** Balances use the same sign convention as transactions: a credit card debt is negative. */
  openingBalance?: number;
  closingBalance?: number;
  transactions: ParsedTransaction[];
  /** true = opening + transactions = closing, false = mismatch, undefined = could not check. */
  reconciled?: boolean;
  card?: CardDetails;
  format: string;
  warnings: string[];
}

export type CategorySource = 'manual' | 'user-rule' | 'rule' | 'transfer-match' | 'default';

export interface Transaction extends ParsedTransaction {
  id: string;
  accountId: string;
  importId: string;
  category: string;
  categorySource: CategorySource;
  note?: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  importedAt: string;
  accountId: string;
  format: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  reconciled?: boolean;
  card?: CardDetails;
  added: number;
  duplicates: number;
  warnings: string[];
}

export interface UserRule {
  id: string;
  /** Case-insensitive text to look for in the description. */
  contains: string;
  category: string;
  /** Optionally only apply to money in (+) or money out (-). */
  direction?: 'in' | 'out';
}

export interface Settings {
  /** Names (surnames, first names) used by household members – payments to/from these are transfers. */
  householdNames: string[];
  meLabel: string;
  partnerLabel: string;
  /** Savings goal as a share of income, e.g. 0.2 for 20%. */
  savingsTarget: number;
}

export interface AppState {
  version: 1;
  accounts: Record<string, Account>;
  transactions: Transaction[];
  imports: ImportRecord[];
  rules: UserRule[];
  /** Monthly budget per category name. */
  budgets: Record<string, number>;
  settings: Settings;
}
