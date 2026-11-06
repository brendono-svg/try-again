import type { Account, AppState, ImportRecord, Owner, ParsedStatement, Transaction } from '../types';
import { categorise, matchTransfers, ownAccountKeys, recategoriseAll } from './categorise';

export const STORAGE_KEY = 'household-budget-v1';

export function emptyState(): AppState {
  return {
    version: 1,
    accounts: {},
    transactions: [],
    imports: [],
    rules: [],
    budgets: {},
    settings: { householdNames: [], meLabel: 'Me', partnerLabel: 'Partner', savingsTarget: 0.2 },
  };
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function accountIdFor(st: Pick<ParsedStatement, 'bank' | 'accountNumber'>): string {
  return `${st.bank}:${st.accountNumber.replace(/[^0-9A-Za-z]/g, '')}`;
}

export function guessOwner(st: ParsedStatement): Owner {
  const holder = `${st.holder ?? ''} ${st.product ?? ''}`;
  if (/joint|\s&\s|\band\b/i.test(holder)) return 'joint';
  return st.bank === 'ASB' ? 'partner' : 'me';
}

export function accountLabel(a: Account): string {
  if (a.nickname) return a.nickname;
  const tail = a.number.replace(/[^0-9A-Za-z]/g, '').slice(-4);
  const product = a.product ?? a.kind;
  const name = product.toLowerCase().startsWith(a.bank.toLowerCase()) ? product : `${a.bank} ${product}`;
  return `${name} …${tail}`;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function txnKey(t: Pick<Transaction, 'accountId' | 'date' | 'amount' | 'description'>): string {
  return `${t.accountId}|${t.date}|${t.amount.toFixed(2)}|${norm(t.description).slice(0, 40)}`;
}

export interface ImportOutcome {
  state: AppState;
  record: ImportRecord;
}

/**
 * Merge a parsed statement into the store. Statements often overlap (e.g. card
 * statements include a few days from the previous period), so a transaction is
 * only added if the store doesn't already hold as many identical ones.
 */
export function importStatement(state: AppState, st: ParsedStatement, fileName: string): ImportOutcome {
  const accountId = accountIdFor(st);
  const accounts = { ...state.accounts };
  const existingAccount = accounts[accountId];
  if (!existingAccount) {
    accounts[accountId] = {
      id: accountId,
      bank: st.bank,
      number: st.accountNumber,
      holder: st.holder,
      product: st.product,
      kind: st.kind,
      owner: guessOwner(st),
    };
  } else {
    accounts[accountId] = {
      ...existingAccount,
      holder: existingAccount.holder ?? st.holder,
      product: existingAccount.product ?? st.product,
    };
  }

  const importId = uid('imp_');
  const existingCounts = new Map<string, number>();
  for (const t of state.transactions) {
    const k = txnKey(t);
    existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1);
  }
  const seenInFile = new Map<string, number>();
  const keys = ownAccountKeys(Object.values(accounts));
  const added: Transaction[] = [];
  let duplicates = 0;
  for (const p of st.transactions) {
    const base = { ...p, accountId };
    const k = txnKey(base);
    const n = (seenInFile.get(k) ?? 0) + 1;
    seenInFile.set(k, n);
    if (n <= (existingCounts.get(k) ?? 0)) {
      duplicates++;
      continue;
    }
    const cat = categorise(p, state.rules, state.settings, keys);
    added.push({ ...base, id: uid('t_'), importId, category: cat.category, categorySource: cat.source });
  }

  const record: ImportRecord = {
    id: importId,
    fileName,
    importedAt: new Date().toISOString(),
    accountId,
    format: st.format,
    periodStart: st.periodStart,
    periodEnd: st.periodEnd,
    openingBalance: st.openingBalance,
    closingBalance: st.closingBalance,
    reconciled: st.reconciled,
    card: st.card,
    added: added.length,
    duplicates,
    warnings: st.warnings,
  };

  const transactions = matchTransfers(
    [...state.transactions, ...added].sort((a, b) => a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId)),
  );
  return { state: { ...state, accounts, transactions, imports: [...state.imports, record] }, record };
}

export function removeImport(state: AppState, importId: string): AppState {
  return {
    ...state,
    transactions: state.transactions.filter((t) => t.importId !== importId),
    imports: state.imports.filter((i) => i.id !== importId),
  };
}

export function removeAccount(state: AppState, accountId: string): AppState {
  const accounts = { ...state.accounts };
  delete accounts[accountId];
  return {
    ...state,
    accounts,
    transactions: state.transactions.filter((t) => t.accountId !== accountId),
    imports: state.imports.filter((i) => i.accountId !== accountId),
  };
}

/** Move everything from one account into another (e.g. a CSV whose account number couldn't be read). */
export function mergeAccounts(state: AppState, fromId: string, intoId: string): AppState {
  if (fromId === intoId) return state;
  const accounts = { ...state.accounts };
  delete accounts[fromId];
  const moved = state.transactions.map((t) => (t.accountId === fromId ? { ...t, accountId: intoId } : t));
  const counts = new Map<string, number>();
  // Drop exact duplicates created by the merge (same key appearing more often than in either source).
  const fromCounts = new Map<string, number>();
  const intoCounts = new Map<string, number>();
  for (const t of state.transactions) {
    const k = txnKey({ ...t, accountId: intoId });
    if (t.accountId === fromId) fromCounts.set(k, (fromCounts.get(k) ?? 0) + 1);
    if (t.accountId === intoId) intoCounts.set(k, (intoCounts.get(k) ?? 0) + 1);
  }
  const transactions = moved.filter((t) => {
    if (t.accountId !== intoId) return true;
    const k = txnKey(t);
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    return n <= Math.max(fromCounts.get(k) ?? 0, intoCounts.get(k) ?? 0);
  });
  return {
    ...state,
    accounts,
    transactions,
    imports: state.imports.map((i) => (i.accountId === fromId ? { ...i, accountId: intoId } : i)),
  };
}

export function withRecategorise(state: AppState): AppState {
  return {
    ...state,
    transactions: recategoriseAll(state.transactions, state.rules, state.settings, Object.values(state.accounts)),
  };
}

// ---------- persistence (IndexedDB, falling back to localStorage) ----------

const DB_NAME = 'household-budget';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadState(): Promise<AppState> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(STORAGE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (value) return normaliseState(value as AppState);
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normaliseState(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return emptyState();
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  } catch {
    /* fall back */
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable – data lives for this session only */
  }
}

export function normaliseState(s: Partial<AppState>): AppState {
  const base = emptyState();
  return {
    ...base,
    ...s,
    settings: { ...base.settings, ...(s.settings ?? {}) },
    accounts: s.accounts ?? {},
    transactions: s.transactions ?? [],
    imports: s.imports ?? [],
    rules: s.rules ?? [],
    budgets: s.budgets ?? {},
    version: 1,
  };
}

/** Merge a backup file (e.g. from your partner's browser) into the current data. */
export function mergeBackup(state: AppState, incoming: AppState): AppState {
  const accounts = { ...incoming.accounts, ...state.accounts };
  const counts = new Map<string, number>();
  for (const t of state.transactions) counts.set(txnKey(t), (counts.get(txnKey(t)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const extra = incoming.transactions.filter((t) => {
    const k = txnKey(t);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > (counts.get(k) ?? 0);
  });
  const importIds = new Set(state.imports.map((i) => i.id));
  const ruleKeys = new Set(state.rules.map((r) => `${r.contains.toLowerCase()}|${r.category}`));
  return withRecategorise({
    ...state,
    accounts,
    transactions: [...state.transactions, ...extra].sort((a, b) => a.date.localeCompare(b.date)),
    imports: [...state.imports, ...incoming.imports.filter((i) => !importIds.has(i.id))],
    rules: [...state.rules, ...incoming.rules.filter((r) => !ruleKeys.has(`${r.contains.toLowerCase()}|${r.category}`))],
    budgets: { ...incoming.budgets, ...state.budgets },
    settings: {
      ...state.settings,
      householdNames: Array.from(new Set([...state.settings.householdNames, ...incoming.settings.householdNames])),
    },
  });
}
