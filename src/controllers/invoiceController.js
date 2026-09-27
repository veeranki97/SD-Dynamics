import { makeGLEntry, reverseGLEntry, DOCSTATUS } from '../utils/glLedger.js';
import { softDeleteRecord, filterActiveRecords, isSoftDeleted } from '../utils/softDelete.js';

export async function submitInvoice(req, res) {
  try {
    const invoice = req.body || {};
    const ledgerEntries = [];

    const entry = makeGLEntry({
      referenceType: 'invoice',
      referenceId: invoice.id || invoice.invoiceId || invoice.number,
      entryType: 'invoice_sale',
      debitAccount: invoice.accounts?.debitAccount || 'Cash/Bank',
      creditAccount: invoice.accounts?.creditAccount || 'Sales',
      amount: invoice.total || invoice.amount || 0,
      narration: `Invoice ${invoice.number || invoice.id} received`,
      metadata: { invoice },
    });

    ledgerEntries.push(entry);

    if (req.db && typeof req.db === 'object' && req.db.invoices) {
      req.db.invoices.push({ ...invoice, docstatus: DOCSTATUS.SUBMITTED, ledgerEntries });
    }

    res.json({ ok: true, ledgerEntries, message: 'Invoice submitted' });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function updateInvoiceStatus(req, res) {
  try {
    const invoice = req.body || {};
    const previousStatus = req.previousStatus || invoice.previousStatus || 'Pending';
    const nextStatus = invoice.status || 'Pending';
    const ledgerEntries = [];

    const didReverse =
      previousStatus && nextStatus &&
      previousStatus.toLowerCase() !== nextStatus.toLowerCase() &&
      ['paid', 'pending', 'unpaid'].includes(previousStatus.toLowerCase()) &&
      ['paid', 'pending', 'unpaid'].includes(nextStatus.toLowerCase());

    if (didReverse && previousStatus.toLowerCase() === 'paid' && ['pending', 'unpaid'].includes(nextStatus.toLowerCase())) {
      const originalLedger = makeGLEntry({
        referenceType: 'invoice',
        referenceId: invoice.id || invoice.invoiceId || invoice.number,
        entryType: 'invoice_reversal',
        debitAccount: invoice.accounts?.creditAccount || 'Sales',
        creditAccount: invoice.accounts?.debitAccount || 'Cash/Bank',
        amount: invoice.total || invoice.amount || 0,
        narration: `Reversal for ${invoice.number || invoice.id}`,
        metadata: { reason: 'Status reverted:Paid->Pending/Unpaid' },
      });

      ledgerEntries.push(reverseGLEntry(originalLedger));
    }

    res.json({ ok: true, reversed: ledgerEntries.length > 0, ledgerEntries });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function deleteInvoiceSoft(req, res) {
  try {
    const record = req.record || req.body || {};
    const result = softDeleteRecord(record, req.user?.id || 'system');

    if (req.db && Array.isArray(req.db.invoices)) {
      req.db.invoices = req.db.invoices.map((item) =>
        item.id === record.id ? result : item
      );
    }

    res.json({ ok: true, deleted: true, record: result });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export function applySoftDeleteFilter(records = []) {
  return filterActiveRecords(records);
}

export function ensureNonDeletedQuery(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => !isSoftDeleted(item));
}
