/**
 * Double-entry journal helpers + financial statements
 */
export const ACCOUNTS = {
  SALES: 'Sales',
  CGST_OUT: 'Output CGST',
  SGST_OUT: 'Output SGST',
  IGST_OUT: 'Output IGST',
  DEBTORS: 'Sundry Debtors',
  ADVANCE_RECEIVED: 'Advance from Customers',
  CREDITORS: 'Sundry Creditors',
  CASH_BANK: 'Bank',
  CASH: 'Cash',
  ROUND_OFF: 'Round Off',
  DIRECT: 'Direct Costs',
  INDIRECT: 'Indirect Expenses',
  ITC_CGST: 'Input CGST',
  ITC_SGST: 'Input SGST',
  ITC_IGST: 'Input IGST',
  CAPITAL: 'Capital',
  RE: 'Retained Earnings',
  CY_PL: 'Current Year P&L',
};

/**
 * Explicit account types — single source of truth for statements.
 * Chart of Accounts may override via accountTypeOverrides map passed into
 * balanceSheet / computeTradingPnL / siteWisePnL (name → type).
 * Types: asset | liability | equity | income | expense
 */
export const ACCOUNT_TYPES = {
  [ACCOUNTS.SALES]: 'income',
  [ACCOUNTS.CGST_OUT]: 'liability',
  [ACCOUNTS.SGST_OUT]: 'liability',
  [ACCOUNTS.IGST_OUT]: 'liability',
  [ACCOUNTS.DEBTORS]: 'asset',
  [ACCOUNTS.ADVANCE_RECEIVED]: 'liability',
  [ACCOUNTS.CREDITORS]: 'liability',
  [ACCOUNTS.CASH_BANK]: 'asset',
  [ACCOUNTS.CASH]: 'asset',
  [ACCOUNTS.ROUND_OFF]: 'expense', // P&L — never park rounding on BS forever
  [ACCOUNTS.DIRECT]: 'expense',
  [ACCOUNTS.INDIRECT]: 'expense',
  [ACCOUNTS.ITC_CGST]: 'asset',
  [ACCOUNTS.ITC_SGST]: 'asset',
  [ACCOUNTS.ITC_IGST]: 'asset',
  [ACCOUNTS.CAPITAL]: 'equity',
  [ACCOUNTS.RE]: 'equity',
  [ACCOUNTS.CY_PL]: 'equity',
};

/** Money helper — round to 2 dp after arithmetic (paise-safe display) */
export function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Sprint 1: Soft-delete / reverse flag — active books ignore reversed journals. */
export function isActiveJournal(j) {
  if (!j) return false;
  if (j.IsReversed === true || j.isReversed === true || j.reversed === true) return false;
  return true;
}

export function activeJournals(journals) {
  const list = journals || [];
  const reversedIds = new Set(list.map(j => j.reversesId).filter(Boolean));
  return list.filter(j => isActiveJournal(j) && !reversedIds.has(j.id));
}



/**
 * Classify account name → type.
 * Priority: overrides (from Chart of Accounts) → ACCOUNT_TYPES → heuristics → null
 */
export function classifyAccount(accountName, overrides = null) {
  if (!accountName) return null;
  const n = String(accountName);
  if (overrides && overrides[n]) return overrides[n];
  if (ACCOUNT_TYPES[n]) return ACCOUNT_TYPES[n];
  // Heuristics only as last resort (legacy journals with free-typed names)
  if (/sales|income|revenue|round\s*off/i.test(n)) return /round/i.test(n) ? 'expense' : 'income';
  if (/expense|cost|salary|rent|purchase|direct|indirect/i.test(n)) return 'expense';
  if (/bank|cash|debtor|input|asset|stock|inventory|receivable/i.test(n)) return 'asset';
  if (/creditor|output|liabilit|payable|gst payable|loan/i.test(n)) return 'liability';
  if (/capital|equity|retained|drawing|current year/i.test(n)) return 'equity';
  return null; // unclassified — statements will surface under "Unclassified"
}

/** Direct vs indirect expense routing from expense category / flags */
export function expensePlAccount(exp) {
  const cat = String(exp?.category || '').toLowerCase();
  const head = String(exp?.itrHead || exp?.plHead || '').toLowerCase();
  const directHints = /material|subcontract|labour|labor|direct|wo\b|work\s*order|site\s*cost|cogs|purchase/;
  if (exp?.isDirect === true || exp?.directCost === true) return ACCOUNTS.DIRECT;
  if (directHints.test(cat) || directHints.test(head)) return ACCOUNTS.DIRECT;
  return ACCOUNTS.INDIRECT;
}

export function journalFromTaxInvoice(bill) {
  const total = Number(bill.totalAmount) || 0;
  const tax = Number(bill.totalTaxAmount) || 0;
  const taxable = total - tax;
  const data = bill.data || {};
  const totals = data.totals || {};
  const cgst = Number(totals.cgst) || 0;
  const sgst = Number(totals.sgst) || 0;
  const igst = Number(totals.igst) || 0;

  const entries = [
    { account: ACCOUNTS.DEBTORS, debit: total, credit: 0 },
    { account: ACCOUNTS.SALES, debit: 0, credit: Math.max(0, taxable) },
  ];
  if (cgst > 0) entries.push({ account: ACCOUNTS.CGST_OUT, debit: 0, credit: cgst });
  if (sgst > 0) entries.push({ account: ACCOUNTS.SGST_OUT, debit: 0, credit: sgst });
  if (igst > 0) entries.push({ account: ACCOUNTS.IGST_OUT, debit: 0, credit: igst });

  const dr = entries.reduce((s, e) => s + e.debit, 0);
  const cr = entries.reduce((s, e) => s + e.credit, 0);
  const diff = +(dr - cr).toFixed(2);
  if (Math.abs(diff) >= 0.01) {
    if (diff > 0) entries.push({ account: ACCOUNTS.ROUND_OFF, debit: 0, credit: diff });
    else entries.push({ account: ACCOUNTS.ROUND_OFF, debit: -diff, credit: 0 });
  }

  return {
    id: 'jnl_inv_' + (bill.id || bill.invoiceNumber),
    date: bill.invoiceDate || bill.data?.details?.invoiceDate,
    narration: `Invoice ${bill.invoiceNumber} — ${bill.clientName || bill.data?.client?.name || ''}`,
    refType: 'invoice',
    refId: bill.id || bill.invoiceNumber,
    party: bill.clientName || bill.data?.client?.name || '',
    clientName: bill.clientName || bill.data?.client?.name || '',
    costCenterId: bill.costCenterId || bill.data?.costCenterId || null,
    site: bill.site || bill.data?.site || null,
    entries,
  };
}

export function journalFromPayment(bill, paymentAmount, mode = 'bank', paymentMeta = {}) {
  const amt = Number(paymentAmount) || 0;
  if (amt <= 0) return null;
  const bankAcc = String(mode).toLowerCase().includes('cash') ? ACCOUNTS.CASH : ACCOUNTS.CASH_BANK;
  const party = bill.data?.client?.name || bill.clientName || paymentMeta.party || '';
  const payDate = paymentMeta.date || new Date().toISOString().split('T')[0];
  const payId = paymentMeta.id || String(Date.now());
  const isAdvance = /advance/i.test(String(mode)) || /advance/i.test(String(paymentMeta.note || ''))
    || (bill.invoiceType || bill.data?.invoiceType || '').toLowerCase().includes('proforma');
  const creditAcc = isAdvance ? ACCOUNTS.ADVANCE_RECEIVED : ACCOUNTS.DEBTORS;
  return {
    site: bill.site || bill.data?.site || paymentMeta.site || null,
    costCenterId: bill.costCenterId || bill.data?.costCenterId || paymentMeta.costCenterId || null,
    workOrderId: bill.workOrderId || bill.data?.workOrderId || paymentMeta.workOrderId || null,
    id: 'jnl_pay_' + (bill.id || bill.invoiceNumber) + '_' + payId,
    date: payDate,
    narration: isAdvance
      ? `Advance received — ${party || 'customer'}`
      : `Receipt against ${bill.invoiceNumber || bill.id || ''} — ${party || 'customer'}`,
    refType: isAdvance ? 'advance' : 'payment',
    refId: bill.id || bill.invoiceNumber,
    party,
    clientName: party,
    againstInvoice: bill.invoiceNumber || bill.id || '',
    invoiceNumber: bill.invoiceNumber || '',
    site: bill.site || bill.data?.site || null,
    costCenterId: bill.costCenterId || bill.data?.costCenterId || null,
    entries: [
      { account: bankAcc, debit: amt, credit: 0, party },
      { account: creditAcc, debit: 0, credit: amt, party },
    ],
  };
}


/** Reversing entry for a prior payment journal (unpaid / void receipt). */
export function journalReversePayment(originalJournal, reason = 'Payment reversed') {
  if (!originalJournal?.entries?.length) return null;
  return {
    id: 'jnl_rev_' + (originalJournal.id || Date.now()),
    date: new Date().toISOString().split('T')[0],
    narration: reason + (originalJournal.narration ? ` — was: ${originalJournal.narration}` : ''),
    refType: 'payment-reversal',
    refId: originalJournal.refId || originalJournal.id,
    party: originalJournal.party || originalJournal.clientName || '',
    clientName: originalJournal.clientName || originalJournal.party || '',
    site: originalJournal.site || null,
    costCenterId: originalJournal.costCenterId || null,
    reversesId: originalJournal.id,
    entries: (originalJournal.entries || []).map(e => ({
      account: e.account,
      debit: Number(e.credit) || 0,
      credit: Number(e.debit) || 0,
      party: e.party,
    })),
  };
}

export function journalFromExpense(exp) {
  const amt = money(exp.amount);
  const gst = money(exp.gstAmount);
  const total = money(amt + gst);
  if (total <= 0) return null;
  const plAcc = expensePlAccount(exp);
  const entries = [
    { account: plAcc, debit: amt, credit: 0 },
  ];
  if (gst > 0) {
    if (exp.interstate) entries.push({ account: ACCOUNTS.ITC_IGST, debit: gst, credit: 0 });
    else {
      const half = +(gst / 2).toFixed(2);
      entries.push({ account: ACCOUNTS.ITC_CGST, debit: half, credit: 0 });
      entries.push({ account: ACCOUNTS.ITC_SGST, debit: +(gst - half).toFixed(2), credit: 0 });
    }
  }
  entries.push({ account: ACCOUNTS.CASH_BANK, debit: 0, credit: total });
  return {
    id: 'jnl_exp_' + (exp.id || Date.now()),
    date: exp.date,
    narration: exp.description || 'Expense',
    refType: 'expense',
    refId: exp.id,
    costCenterId: exp.costCenterId || null,
    site: exp.site || null,
    entries,
  };
}

export function trialBalance(journals, untilDate) {
  const map = {};
  activeJournals(journals).forEach(j => {
    if (untilDate && j.date && j.date > untilDate) return;
    (j.entries || []).forEach(e => {
      if (!map[e.account]) map[e.account] = { account: e.account, debit: 0, credit: 0 };
      map[e.account].debit += Number(e.debit) || 0;
      map[e.account].credit += Number(e.credit) || 0;
    });
  });
  return Object.values(map)
    .map(r => ({
      ...r,
      debit: +r.debit.toFixed(2),
      credit: +r.credit.toFixed(2),
      balance: +(r.debit - r.credit).toFixed(2),
    }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

/** Classify TB rows into BS / P&L buckets by account name heuristics + type map */
/** @deprecated heuristics kept for reference — prefer classifyAccount() */
const BS_ASSET = /bank|cash|debtor|input|asset|stock|inventory|receivable/i;
const BS_LIAB = /creditor|output|liabilit|payable|gst payable|loan/i;
const BS_EQ = /capital|equity|retained|drawing/i;
const PL_INC = /sales|income|revenue/i;
const PL_EXP = /expense|cost|salary|rent|purchase|direct|indirect|round\s*off/i;

/**
 * Unified P&L from journals using classifyAccount (optional CoA overrides).
 * Single netProfit used by Balance Sheet, Trading P&L, and Site-Wise P&L.
 */
export function computeTradingPnL(journals, fromDate, toDate, accountTypeOverrides = null) {
  let sales = 0, purchases = 0, expenses = 0, otherIncome = 0;
  const unclassified = [];
  activeJournals(journals).forEach(j => {
    const d = j.date || '';
    if (fromDate && d < fromDate) return;
    if (toDate && d > toDate) return;
    // Skip period-close journals when computing operating P&L for a range
    if (j.refType === 'period-close') return;
    (j.entries || []).forEach(e => {
      const acc = e.account || '';
      const type = classifyAccount(acc, accountTypeOverrides);
      const cr = money(e.credit);
      const dr = money(e.debit);
      if (type === 'income') {
        if (/purchase|direct/i.test(acc) && !/sales/i.test(acc)) {
          // defensive — should not be income
        } else {
          sales += cr - dr;
        }
      } else if (type === 'expense') {
        if (/^direct costs$/i.test(acc) || (/direct/i.test(acc) && !/indirect/i.test(acc))) {
          purchases += dr - cr;
        } else {
          expenses += dr - cr;
        }
      } else if (type == null && acc) {
        unclassified.push(acc);
      }
    });
  });
  sales = money(sales);
  purchases = money(purchases);
  expenses = money(expenses);
  const grossProfit = money(sales - purchases);
  const netProfit = money(grossProfit - expenses);
  return {
    sales, purchases, expenses, otherIncome,
    grossProfit, netProfit,
    unclassified: [...new Set(unclassified)],
  };
}

export function balanceSheet(journals, asOfDate, accountTypeOverrides = null) {
  const tb = trialBalance(journals, asOfDate);
  const assets = [], liabilities = [], equity = [];
  const unclassified = [];
  let income = 0, expense = 0;
  tb.forEach(r => {
    const n = r.account;
    const type = classifyAccount(n, accountTypeOverrides);
    const bal = money(r.balance); // debit positive
    if (type === 'income') { income += money(r.credit - r.debit); return; }
    if (type === 'expense') { expense += money(r.debit - r.credit); return; }
    if (type === 'asset') assets.push({ ...r, amount: bal });
    else if (type === 'liability') liabilities.push({ ...r, amount: money(-bal) });
    else if (type === 'equity') equity.push({ ...r, amount: money(-bal) });
    else {
      unclassified.push(n);
      // Do NOT silently park unknown accounts on BS — surface as equity "Unclassified"
      equity.push({ ...r, amount: money(-bal), account: n + ' (unclassified)' });
    }
  });
  const netProfit = money(income - expense);
  if (Math.abs(netProfit) > 0.001) {
    equity.push({ account: ACCOUNTS.CY_PL || 'Current Year P&L', amount: netProfit, debit: 0, credit: 0, balance: 0 });
  }
  const totalAssets = money(assets.reduce((s, a) => s + (a.amount || 0), 0));
  const totalLE = money(
    liabilities.reduce((s, a) => s + (a.amount || 0), 0)
    + equity.reduce((s, a) => s + (a.amount || 0), 0)
  );
  return {
    assets, liabilities, equity,
    totalAssets,
    totalLiabilitiesAndEquity: totalLE,
    netProfit,
    income: money(income),
    expense: money(expense),
    unclassified,
  };
}

/** Site-wise P&L — same classifier as computeTradingPnL */
export function siteWisePnL(journals, fromDate, toDate, accountTypeOverrides = null) {
  journals = activeJournals(journals);
  const bySite = {};
  (journals || []).forEach(j => {
    const d = j.date || '';
    if (fromDate && d < fromDate) return;
    if (toDate && d > toDate) return;
    if (j.refType === 'period-close') return;
    const site = j.site || 'Unassigned';
    if (!bySite[site]) bySite[site] = { site, income: 0, expense: 0 };
    (j.entries || []).forEach(e => {
      const type = classifyAccount(e.account, accountTypeOverrides);
      if (type === 'income') bySite[site].income += money(e.credit) - money(e.debit);
      if (type === 'expense') bySite[site].expense += money(e.debit) - money(e.credit);
    });
  });
  return Object.values(bySite).map(s => ({
    ...s,
    income: money(s.income),
    expense: money(s.expense),
    profit: money(s.income - s.expense),
  }));
}

/**
 * Year-end close: reverse each income/expense TB balance into Retained Earnings
 * and post a balancing Current Year P&L transfer. Returns a journal (does not save).
 */
export function periodCloseJournal(journals, fyEndDate, accountTypeOverrides = null) {
  const tb = trialBalance(journals, fyEndDate);
  const entries = [];
  let net = 0;
  tb.forEach(r => {
    const type = classifyAccount(r.account, accountTypeOverrides);
    if (type !== 'income' && type !== 'expense') return;
    if (r.account === ACCOUNTS.CY_PL || r.account === 'Current Year P&L') return;
    const bal = money(r.balance); // debit − credit
    if (Math.abs(bal) < 0.005) return;
    // Close: reverse the balance so P&L accounts zero
    if (bal > 0) {
      // net debit (expense-like) → credit the P&L account, debit RE or vice versa
      entries.push({ account: r.account, debit: 0, credit: bal });
      net -= bal;
    } else {
      entries.push({ account: r.account, debit: -bal, credit: 0 });
      net += -bal;
    }
  });
  net = money(net);
  if (!entries.length || Math.abs(net) < 0.01) {
    // Fallback to net-profit only transfer if no line balances
    const { netProfit } = computeTradingPnL(journals, null, fyEndDate, accountTypeOverrides);
    if (Math.abs(netProfit) < 0.01) return null;
    return {
      id: 'jnl_close_' + fyEndDate,
      date: fyEndDate,
      narration: `Period close — transfer P&L to Retained Earnings`,
      refType: 'period-close',
      refId: fyEndDate,
      entries: netProfit >= 0
        ? [
            { account: ACCOUNTS.CY_PL, debit: netProfit, credit: 0 },
            { account: ACCOUNTS.RE, debit: 0, credit: netProfit },
          ]
        : [
            { account: ACCOUNTS.RE, debit: Math.abs(netProfit), credit: 0 },
            { account: ACCOUNTS.CY_PL, debit: 0, credit: Math.abs(netProfit) },
          ],
    };
  }
  // Balance into Retained Earnings
  if (net > 0) {
    entries.push({ account: ACCOUNTS.RE, debit: 0, credit: net });
  } else {
    entries.push({ account: ACCOUNTS.RE, debit: money(-net), credit: 0 });
  }
  return {
    id: 'jnl_close_' + fyEndDate,
    date: fyEndDate,
    narration: `Period close — zero P&L accounts into Retained Earnings`,
    refType: 'period-close',
    refId: fyEndDate,
    entries,
  };
}

export function bankBalance(journals, accountName = 'Bank') {
  let bal = 0;
  (journals || []).forEach(j => {
    (j.entries || []).forEach(e => {
      if ((e.account || '').toLowerCase() === accountName.toLowerCase()
        || (accountName === 'Bank' && /^(bank|cash\/bank)$/i.test(e.account || ''))) {
        bal += (Number(e.debit) || 0) - (Number(e.credit) || 0);
      }
    });
  });
  return +bal.toFixed(2);
}


/** Soft freeze: invoices older than N days (settings) cannot be edited */
export function isPeriodFrozen(dateStr) {
  try {
    const freezeDays = Number(localStorage.getItem('fgsb_freeze_days') || '0');
    if (!freezeDays || !dateStr) return false;
    const invD = new Date(dateStr);
    const diff = Math.floor((Date.now() - invD.getTime()) / 86400000);
    return diff > freezeDays;
  } catch {
    return false;
  }
}

/** Month lock list in localStorage key fgsb_locked_months (YYYY-MM strings) */
export function isMonthLocked(dateStr) {
  try {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime()) && /^\d{4}-\d{2}$/.test(String(dateStr))) {
      return JSON.parse(localStorage.getItem('fgsb_locked_months') || '[]').includes(String(dateStr));
    }
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const locked = JSON.parse(localStorage.getItem('fgsb_locked_months') || '[]');
    return locked.includes(key);
  } catch {
    return false;
  }
}

export function lockMonth(yyyyMm) {
  const key = String(yyyyMm || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return;
  const locked = JSON.parse(localStorage.getItem('fgsb_locked_months') || '[]');
  if (!locked.includes(key)) locked.push(key);
  localStorage.setItem('fgsb_locked_months', JSON.stringify(locked));
}

export function unlockMonth(yyyyMm) {
  const key = String(yyyyMm || '').slice(0, 7);
  let locked = JSON.parse(localStorage.getItem('fgsb_locked_months') || '[]');
  locked = locked.filter(m => m !== key);
  localStorage.setItem('fgsb_locked_months', JSON.stringify(locked));
}


/** Sprint 3: Aggregate income/expense by workOrderId on journal headers. */
export function woWisePnL(journals, fromDate, toDate, accountTypeOverrides = null) {
  const map = {};
  activeJournals(journals).forEach(j => {
    const d = j.date || '';
    if (fromDate && d < fromDate) return;
    if (toDate && d > toDate) return;
    if (j.refType === 'period-close') return;
    const wo = j.workOrderId || j.woNumber || j.workOrderNo || 'Unassigned';
    if (!map[wo]) map[wo] = { workOrderId: wo, income: 0, expense: 0, net: 0 };
    (j.entries || []).forEach(e => {
      const type = classifyAccount(e.account || '', accountTypeOverrides);
      const cr = money(e.credit);
      const dr = money(e.debit);
      if (type === 'income') map[wo].income += cr - dr;
      else if (type === 'expense') map[wo].expense += dr - cr;
    });
  });
  return Object.values(map).map(r => ({
    ...r,
    income: money(r.income),
    expense: money(r.expense),
    net: money(r.income - r.expense),
  })).sort((a, b) => b.net - a.net);
}
