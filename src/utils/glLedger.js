export const DOCSTATUS = {
  DRAFT: 0,
  SUBMITTED: 1,
  CANCELLED: 2,
};

export const normalizeMoney = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
};

export function makeGLEntry({
  referenceType,
  referenceId,
  entryType,
  debitAccount,
  creditAccount,
  amount,
  narration,
  metadata = {},
}) {
  const safeAmount = normalizeMoney(amount);

  if (!referenceType || !referenceId) {
    throw new Error('GL entry requires referenceType and referenceId');
  }

  if (!debitAccount || !creditAccount) {
    throw new Error('GL entry requires both debit and credit accounts');
  }

  if (safeAmount <= 0) {
    throw new Error('GL entry amount must be greater than zero');
  }

  const entry = {
    id: `gl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    referenceType,
    referenceId,
    type: 'general_ledger',
    entryType: entryType || 'invoice',
    docstatus: DOCSTATUS.SUBMITTED,
    narration: narration || 'General ledger posting',
    amount: safeAmount,
    debit: {
      account: debitAccount,
      amount: safeAmount,
      type: 'debit',
    },
    credit: {
      account: creditAccount,
      amount: safeAmount,
      type: 'credit',
    },
    createdAt: new Date().toISOString(),
    metadata,
  };

  if (entry.debit.amount !== entry.credit.amount) {
    throw new Error('GL debit/credit mismatch: ledger totals must match');
  }

  return entry;
}

export function reverseGLEntry(entry) {
  if (!entry || !entry.debit || !entry.credit) {
    throw new Error('reverseGLEntry requires a valid GL entry');
  }

  return {
    ...entry,
    id: `gl_rev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    reversalOf: entry.id,
    type: 'general_ledger_reversal',
    narration: `${entry.narration || 'Reversal'} (reversing journal entry)`,
    debit: {
      ...entry.credit,
      type: 'debit',
      amount: normalizeMoney(entry.credit.amount),
    },
    credit: {
      ...entry.debit,
      type: 'credit',
      amount: normalizeMoney(entry.debit.amount),
    },
    amount: normalizeMoney(entry.amount),
    createdAt: new Date().toISOString(),
  };
}

export function buildInvoiceLedgerEntries(invoice, accounts) {
  const amount = normalizeMoney(invoice.total || invoice.amount || 0);
  const debitAccount = accounts?.debitAccount || 'Cash/Bank';
  const creditAccount = accounts?.creditAccount || 'Sales';

  return {
    invoice: makeGLEntry({
      referenceType: 'invoice',
      referenceId: invoice.id || invoice.invoiceId || invoice.number,
      entryType: 'invoice_sale',
      debitAccount,
      creditAccount,
      amount,
      narration: `Invoice ${invoice.number || invoice.id} posting`,
      metadata: { invoice },
    }),
    reversal: null,
  };
}
