/**
 * Work Order helpers – line items, remaining qty, budget ceiling
 */

export function emptyWOItem() {
  return {
    id: 'wi_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    description: '',
    hsn: '',
    unit: 'Nos',
    qty: 1,
    rate: 0,
    amount: 0,
    costHead: '',
  };
}

export function calcItemAmount(item) {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  return +(qty * rate).toFixed(2);
}

export function calcWOUsage(wo, allBills) {
  if (!wo) return { billedAmount: 0, remaining: 0, linkedInvoiceIds: [], billedByItem: {}, remainingByItem: [] };

  const linked = (allBills || []).filter(b => {
    if (b.status === 'cancelled') return false;
    if (b.workOrderId && b.workOrderId === wo.id) return true;
    const woNo = wo.woNumber || wo.id;
    const billWo = b.data?.details?.workOrderNo || b.data?.workOrderNo || b.workOrderNo;
    return woNo && billWo && String(billWo) === String(woNo);
  });

  let billedAmount = 0;
  const billedByItem = {};

  linked.forEach(bill => {
    billedAmount += Number(bill.totalAmount) || 0;
    (bill.data?.items || []).forEach(it => {
      const key = (it.description || it.name || '').trim().toLowerCase();
      if (!key) return;
      // Invoice lines use `quantity`; WO lines use `qty` — count both
      const q = Number(it.quantity ?? it.qty) || 0;
      billedByItem[key] = (billedByItem[key] || 0) + q;
    });
  });

  const remainingByItem = (wo.items || []).map(it => {
    const key = (it.description || '').trim().toLowerCase();
    const orig = Number(it.qty) || 0;
    const used = billedByItem[key] || 0;
    return {
      description: it.description,
      originalQty: orig,
      billedQty: used,
      remainingQty: Math.max(0, orig - used),
      rate: Number(it.rate) || 0,
      hsn: it.hsn,
      unit: it.unit,
      costHead: it.costHead,
    };
  });

  const remaining = Math.max(0, (Number(wo.approvedBudget) || 0) - billedAmount);
  return {
    billedAmount,
    remaining,
    linkedInvoiceIds: linked.map(b => b.id),
    billedByItem,
    remainingByItem,
  };
}

export function deriveWOStatus(wo, allBills) {
  const { billedAmount, remaining } = calcWOUsage(wo, allBills);
  const budget = Number(wo.approvedBudget) || 0;
  if (wo.status === 'cancelled') return 'cancelled';
  if (budget <= 0) return wo.status || 'draft';
  if (billedAmount <= 0.01) return wo.status === 'approved' || wo.status === 'in-progress' ? wo.status : (wo.status || 'draft');
  if (remaining <= 0.01) return 'completed';
  return 'partial';
}

export function canInvoiceAgainstWO(wo, invoiceTotal, allBills, invoiceItems) {
  if (!wo) return { ok: false, reason: 'Work Order not found' };
  if (wo.status === 'cancelled' || wo.status === 'draft') {
    return { ok: false, reason: 'Work Order is not approved' };
  }
  const usage = calcWOUsage(wo, allBills);
  if (Number(invoiceTotal) > usage.remaining + 5.0) {
    return {
      ok: false,
      reason: `Invoice ₹${Number(invoiceTotal).toFixed(2)} exceeds remaining WO budget ₹${usage.remaining.toFixed(2)} (₹5 tolerance)`,
    };
  }
  // Qty guard when items present — hard stop on over-billing (e.g. WO 100, invoice 101)
  if (invoiceItems && invoiceItems.length && usage.remainingByItem.length) {
    for (const it of invoiceItems) {
      const key = (it.description || it.name || '').trim().toLowerCase();
      if (!key) continue;
      const row = usage.remainingByItem.find(r => (r.description || '').trim().toLowerCase() === key);
      const invQty = Number(it.quantity ?? it.qty) || 0;
      if (row && invQty > row.remainingQty + 0.0001) {
        return {
          ok: false,
          reason: `Cannot bill ${invQty} of "${it.description || it.name}" — Work Order has only ${row.remainingQty} remaining (already billed ${row.billedQty} of ${row.originalQty})`,
        };
      }
    }
  }
  // Also block if any line has no match but WO has a closed (0 remaining) line with same name
  return { ok: true };
}

export function woItemsToInvoiceItems(woItems, allBills, wo) {
  const usage = wo ? calcWOUsage(wo, allBills) : { remainingByItem: [] };
  const remMap = {};
  (usage.remainingByItem || []).forEach(r => {
    remMap[(r.description || '').trim().toLowerCase()] = r.remainingQty;
  });

  return (woItems || []).map((it, idx) => {
    const key = (it.description || it.name || '').trim().toLowerCase();
    const rem = remMap[key];
    const qty = rem != null ? Math.min(Number(it.qty) || Number(it.quantity) || 0, rem) : (Number(it.qty) || Number(it.quantity) || 1);
    const rate = Number(it.rate) || 0;
    const desc = it.description || it.name || '';
    return {
      id: 'item_' + Date.now().toString(36) + '_' + idx,
      name: desc,
      description: '',
      hsn: it.hsn || it.sac || '',
      unit: it.unit || 'Nos',
      quantity: qty > 0 ? qty : 0,
      rate,
      discount: 0,
      discountType: 'fixed',
      taxPercent: Number(it.taxPercent) || Number(it.taxRate) || 18,
      cessPercent: 0,
      costCenterId: it.costCenterId || it.costHead || '',
    };
  }).filter(it => Number(it.quantity) > 0);
}
