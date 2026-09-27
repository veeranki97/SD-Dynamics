import { useState, useEffect } from 'react';
import { Plus, Trash2, ClipboardList } from 'lucide-react';
import {
  getAllWorkOrders, saveWorkOrder, deleteWorkOrder,
  getAllBills, getAllClients, getAllCostCenters,
} from '../store';
import { calcWOUsage, emptyWOItem, calcItemAmount, deriveWOStatus } from '../utils/workOrder';
import { formatCurrency } from '../utils';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import ActionMenu from './ActionMenu';
import { getHsnMaster, getUnitMaster } from '../utils/masterData';

function calcWOTotals(items, taxRate, clientState, hostState) {
  const sub = (items || []).reduce((s, it) => s + calcItemAmount(it), 0);
  const rate = Number(taxRate) || 0;
  const gst = +(sub * rate / 100).toFixed(2);
  const same =
    (clientState || '').trim().toLowerCase() === (hostState || '').trim().toLowerCase()
    && !!(clientState || '').trim();
  let cgst = 0, sgst = 0, igst = 0;
  if (rate > 0) {
    if (same) {
      cgst = +(gst / 2).toFixed(2);
      sgst = +(gst - cgst).toFixed(2);
    } else {
      igst = gst;
    }
  }
  return { sub, gst, cgst, sgst, igst, total: +(sub + gst).toFixed(2), isInterstate: !same };
}

export default function WorkOrdersView() {
  const [list, setList] = useState([]);
  const [bills, setBills] = useState([]);
  const [clients, setClients] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [hsnMaster, setHsnMaster] = useState([]);
  const [unitMaster, setUnitMaster] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHsnMaster(getHsnMaster());
    setUnitMaster(getUnitMaster());
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [wos, bs, cs] = await Promise.all([getAllWorkOrders(), getAllBills(), getAllClients()]);
      setList(wos || []);
      setBills(bs || []);
      setClients((cs || []).filter(c => !c.isVendor && c.type !== 'vendor'));
      getAllCostCenters().then(setCostCenters).catch(() => {});
    } catch {
      toast('Failed to load Work Orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form) return;
    const t = calcWOTotals(form.items, form.taxRate ?? 18, form.clientState, form.hostState);
    if (Math.abs((Number(form.approvedBudget) || 0) - t.total) > 0.009) {
      setForm(prev => (prev ? { ...prev, approvedBudget: t.total } : prev));
    }
  }, [form?.items, form?.taxRate, form?.clientState, form?.hostState]);

  const openNew = () =>
    setForm({
      id: 'wo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      woNumber: '',
      clientName: '',
      clientState: '',
      site: 'Main Site',
      title: '',
      approvedBudget: 0,
      taxRate: 18,
      status: 'approved',
      date: new Date().toISOString().split('T')[0],
      periodStart: '',
      periodEnd: '',
      notes: '',
      items: [emptyWOItem()],
      createdAt: new Date().toISOString(),
    });

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const row = { ...items[idx], [field]: value };
      if (field === 'qty' || field === 'rate') row.amount = calcItemAmount(row);
      items[idx] = row;
      const t = calcWOTotals(items, prev.taxRate ?? 18, prev.clientState, prev.hostState);
      return { ...prev, items, approvedBudget: t.total };
    });
  };

  const addItem = () => setForm(prev => prev ? { ...prev, items: [...(prev.items || []), emptyWOItem()] } : prev);
  const removeItem = (idx) =>
    setForm(prev => prev ? { ...prev, items: (prev.items || []).filter((_, i) => i !== idx) } : prev);

  const save = async () => {
    if (!(form.clientName || '').trim()) { toast('Client is required', 'error'); return; }
    if (!(form.title || '').trim()) { toast('Title of work is required', 'error'); return; }
    let woNumber = form.woNumber;
    if (!(woNumber || '').trim()) {
      const n = list.length + 1;
      const y = new Date().getFullYear();
      const fy = new Date().getMonth() >= 3
        ? `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`
        : `${String(y - 1).slice(-2)}-${String(y).slice(-2)}`;
      woNumber = `WO/${fy}/${String(n).padStart(3, '0')}`;
    }
    const items = (form.items || []).map(it => ({ ...it, amount: calcItemAmount(it) }));
    const t = calcWOTotals(items, form.taxRate ?? 18, form.clientState, form.hostState);
    try {
      await saveWorkOrder({
        ...form, woNumber, items,
        approvedBudget: t.total,
        taxable: t.sub, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total,
      }, { overwrite: true });
      toast('Work Order saved', 'success');
      setForm(null);
      load();
    } catch (e) {
      toast(e.message || 'Save failed', 'error');
    }
  };

  const remove = async (id) => {
    const ok = await confirmAction({
      title: 'Delete Work Order?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteWorkOrder(id);
      toast('Deleted', 'success');
      load();
    } catch (e) {
      toast(e.message || 'Delete failed', 'error');
    }
  };

  if (loading) return <div className="page"><p>Loading…</p></div>;

  if (form) {
    const t = calcWOTotals(form.items, form.taxRate ?? 18, form.clientState, form.hostState);
    return (
      <div className="page" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{form.woNumber ? `Edit ${form.woNumber}` : 'New Work Order'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save}>Save Work Order</button>
          </div>
        </div>

        <div className="glass-panel p-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">WO NUMBER</label>
            <input className="form-input" value={form.woNumber || ''} placeholder="Auto on save"
              onChange={e => setForm({ ...form, woNumber: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">DATE</label>
            <input type="date" className="form-input" value={form.date || ''}
              onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">CLIENT *</label>
            <input className="form-input" list="wo-clients" value={form.clientName || ''}
              onChange={e => {
                const name = e.target.value;
                const c = clients.find(x => x.name === name);
                setForm({
                  ...form,
                  clientName: name,
                  clientState: c?.state || form.clientState || '',
                  site: c?.site || (Array.isArray(c?.sites) && c.sites[0]) || form.site || '',
                });
              }} />
            <datalist id="wo-clients">
              {clients.map(c => <option key={c.id || c.name} value={c.name} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">SITE</label>
            <input className="form-input" value={form.site || ''}
              onChange={e => setForm({ ...form, site: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">STATUS</label>
            <select className="form-input" value={form.status || 'approved'}
              onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="in-progress">In Progress</option>
              <option value="partial">Partial</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">GST %</label>
            <input type="number" className="form-input" value={form.taxRate ?? 18}
              onChange={e => setForm({ ...form, taxRate: Number(e.target.value) || 0 })} />
          </div>
          <div className="form-group">
            <label className="form-label">PERIOD START</label>
            <input type="date" className="form-input" value={form.periodStart || ''}
              onChange={e => setForm({ ...form, periodStart: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">PERIOD END</label>
            <input type="date" className="form-input" value={form.periodEnd || ''}
              onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">TITLE OF WORK *</label>
            <input className="form-input" value={form.title || ''}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Fills invoice Work Description" />
          </div>
        </div>

        <div className="glass-panel p-4" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>Line items</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
              <Plus size={14} /> Add row
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>HSN/SAC</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Cost centre</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(form.items || []).map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td>
                      <input className="form-input" value={it.description || ''}
                        onChange={e => updateItem(idx, 'description', e.target.value)} />
                    </td>
                    <td>
                      <input className="form-input" style={{ width: 100 }} list={`wo-hsn-${idx}`}
                        value={it.hsn || ''} placeholder="Type…"
                        onChange={e => updateItem(idx, 'hsn', e.target.value)} />
                      <datalist id={`wo-hsn-${idx}`}>
                        {hsnMaster.map(h => <option key={h} value={h} />)}
                      </datalist>
                    </td>
                    <td>
                      <input className="form-input" style={{ width: 80 }} list={`wo-unit-${idx}`}
                        value={it.unit || ''}
                        onChange={e => updateItem(idx, 'unit', e.target.value)} />
                      <datalist id={`wo-unit-${idx}`}>
                        {unitMaster.map(u => <option key={u} value={u} />)}
                      </datalist>
                    </td>
                    <td>
                      <input type="number" className="form-input" style={{ width: 70 }} value={it.qty ?? ''}
                        onChange={e => updateItem(idx, 'qty', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="form-input" style={{ width: 90 }} value={it.rate ?? ''}
                        onChange={e => updateItem(idx, 'rate', e.target.value)} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(calcItemAmount(it))}</td>
                    <td>
                      <select className="form-input" style={{ width: 130 }}
                        value={it.costCenterId || it.costHead || ''}
                        onChange={e => {
                          updateItem(idx, 'costCenterId', e.target.value);
                          updateItem(idx, 'costHead', e.target.value);
                        }}>
                        <option value="">—</option>
                        {(costCenters || []).map(cc => (
                          <option key={cc.id || cc.name} value={cc.id || cc.name}>{cc.name || cc.id}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn-icon" onClick={() => removeItem(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'right', marginTop: 12, lineHeight: 1.7, fontSize: '0.95rem' }}>
            <div>Taxable: <b>{formatCurrency(t.sub)}</b></div>
            {t.isInterstate
              ? <div>IGST: <b>{formatCurrency(t.igst)}</b></div>
              : (
                <>
                  <div>CGST: <b>{formatCurrency(t.cgst)}</b></div>
                  <div>SGST: <b>{formatCurrency(t.sgst)}</b></div>
                </>
              )}
            <div style={{ fontSize: '1.05rem' }}>
              Total (Approved Budget incl. GST): <b>{formatCurrency(t.total)}</b>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">NOTES</label>
            <textarea className="form-input" rows={2} value={form.notes || ''}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={22} /> Work Orders
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Project budgets — invoices cannot exceed remaining qty / budget
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> New Work Order
        </button>
      </div>
      <div className="table-responsive">
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>WO #</th>
              <th>Client</th>
              <th>Site</th>
              <th>Title</th>
              <th>Budget</th>
              <th>Billed</th>
              <th>Remaining</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(woRow => {
              const { billedAmount, remaining } = calcWOUsage(woRow, bills);
              return (
                <tr key={woRow.id}>
                  <td><strong>{woRow.woNumber || woRow.id}</strong></td>
                  <td>{woRow.clientName}</td>
                  <td>{woRow.site}</td>
                  <td>{woRow.title}</td>
                  <td>{formatCurrency(woRow.approvedBudget)}</td>
                  <td>{formatCurrency(billedAmount)}</td>
                  <td style={{ color: remaining < 1 ? '#dc2626' : remaining < 5000 ? '#d97706' : undefined }}>
                    {formatCurrency(remaining)}
                  </td>
                  <td>{deriveWOStatus(woRow, bills)}</td>
                  <td>
                    <ActionMenu items={[
                      { label: 'Edit', onClick: () => setForm({ ...woRow, items: (woRow.items && woRow.items.length) ? woRow.items : [emptyWOItem()] }) },
                      { label: 'Copy', onClick: () => setForm({ ...woRow, id: 'wo_' + Date.now().toString(36), woNumber: '', items: (woRow.items || []).map(it => ({ ...it })) }) },
                      { label: 'Delete', danger: true, onClick: () => remove(woRow.id) },
                    ]} />
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No work orders yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
