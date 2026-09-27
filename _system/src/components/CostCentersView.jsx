import { suggestGstRate } from '../utils/hsnRates';
import { getHsnMaster, addHsnCode, removeHsnCode, getUnitMaster, addUnit, removeUnit, getExpenseCategories, addExpenseCategory, removeExpenseCategory } from '../utils/masterData';
import { useState, useEffect } from 'react';
import { getAllCostCenters, saveCostCenter, deleteCostCenter } from '../store';
import { toast } from './Toast';
import { confirmAction, promptAction } from './ConfirmModal';
import ActionMenu from './ActionMenu';

const SAC_KEY = 'freegstbill_custom_sac';
const UNIT_KEY = 'freegstbill_custom_units';
const EXP_KEY = 'freegstbill_expense_categories';

function loadJson(key, fallback = []) {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(a) ? a : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

const TABS = [
  { id: 'cc', label: 'Cost Centres' },
  { id: 'hsn', label: 'HSN / SAC' },
  { id: 'units', label: 'Units' },
  { id: 'exp', label: 'Expense categories' },
];

export default function CostCentersView() {
  const [tab, setTab] = useState('cc');
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [editing, setEditing] = useState(null);
  const [hsnList, setHsnList] = useState(() => getHsnMaster());
  const [unitList, setUnitList] = useState(() => getUnitMaster());
  const [expList, setExpList] = useState(() => getExpenseCategories());

  const load = () => getAllCostCenters().then(setList).catch(() => toast('Failed to load cost centres', 'error'));
  useEffect(() => { load(); }, []);

  const addOrSave = async () => {
    if (!name.trim()) { toast('Name required', 'warning'); return; }
    const id = editing?.id || ('cc_' + Date.now().toString(36));
    await saveCostCenter({ id, name: name.trim(), parentId: parentId || null, active: true });
    setName(''); setParentId(''); setEditing(null);
    load();
    toast(editing ? 'Cost Centre updated' : 'Cost Centre saved', 'success');
  };

  const startEdit = (c) => {
    setEditing(c);
    setName(c.name || '');
    setParentId(c.parentId || '');
  };

  const remove = async (id) => {
    const ok = await confirmAction({
      title: 'Delete cost centre?',
      message: 'This cannot be undone. Invoices already using it keep the old name.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteCostCenter(id);
      load();
      toast('Deleted', 'success');
    } catch (e) {
      toast(e.message || 'Delete failed', 'error');
    }
  };

  const addHsn = async () => {
    const v = await promptAction({
      title: 'Add HSN / SAC',
      message: 'Enter 2, 4, 6 or 8 digit code',
      placeholder: 'e.g. 998599',
      confirmLabel: 'Save',
    });
    if (v == null) return;
    const t = String(v).trim();
    if (!/^\d{2}$|^\d{4}$|^\d{6}$|^\d{8}$/.test(t)) {
      toast('HSN/SAC must be 2, 4, 6 or 8 digits', 'error');
      return;
    }
    if (hsnList.includes(t)) { toast('Already in list', 'info'); return; }
    setHsnList(addHsnCode(t));
    toast(`HSN/SAC ${t} saved — available on Invoice, WO, PO`, 'success');
  };

  const removeHsn = async (code) => {
    const ok = await confirmAction({ title: 'Remove HSN/SAC?', message: code, confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setHsnList(removeHsnCode(code));
    toast('Removed', 'success');
  };

  const addUnit = async () => {
    const v = await promptAction({
      title: 'Add unit',
      message: 'e.g. Nos, Hrs, Sqft, Job',
      placeholder: 'Unit',
      confirmLabel: 'Save',
    });
    if (v == null) return;
    const t = String(v).trim();
    if (!t) return;
    if (unitList.includes(t)) { toast('Already in list', 'info'); return; }
    setUnitList(addUnit(t));
    toast(`Unit "${t}" saved`, 'success');
  };

  const removeUnit = async (u) => {
    const ok = await confirmAction({ title: 'Remove unit?', message: u, confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setUnitList(removeUnit(u));
    toast('Removed', 'success');
  };

  const addExp = async () => {
    const v = await promptAction({
      title: 'Add expense category',
      message: 'e.g. Direct Labor, Travel, Materials',
      placeholder: 'Category',
      confirmLabel: 'Save',
    });
    if (v == null) return;
    const t = String(v).trim();
    if (!t) return;
    if (expList.includes(t)) { toast('Already in list', 'info'); return; }
    setExpList(addExpenseCategory(t));
    toast(`Category "${t}" saved`, 'success');
  };

  const removeExp = async (c) => {
    const ok = await confirmAction({ title: 'Remove category?', message: c, confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    setExpList(removeExpenseCategory(c));
    toast('Removed', 'success');
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <h1 style={{ marginBottom: 4 }}>Master data</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        Cost centres, HSN/SAC, units and expense categories used on invoices, work orders, POs and expenses.
      </p>

      {/* Tab bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20,
        borderBottom: '1px solid var(--border, #e5e7eb)', paddingBottom: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            style={{
              borderRadius: '8px 8px 0 0',
              borderBottom: tab === t.id ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
              marginBottom: -1,
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cc' && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Sites / departments for invoices, expenses, work orders, and site-wise P&amp;L.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <input
              className="form-input"
              style={{ flex: '1 1 200px' }}
              placeholder="e.g. Chirala Site / Tower A"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <select className="form-input" style={{ flex: '0 1 180px' }} value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">— No parent (root) —</option>
              {list.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={addOrSave}>
              {editing ? 'Update' : 'Add'}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setName(''); setParentId(''); }}>
                Cancel
              </button>
            )}
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>PARENT</th>
                  <th>ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{list.find(x => x.id === c.parentId)?.name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.id}</td>
                    <td>
                      <ActionMenu
                        items={[
                          { label: 'Edit', onClick: () => startEdit(c) },
                          { label: 'Delete', onClick: () => remove(c.id), danger: true },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No cost centres yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'hsn' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Codes appear in Invoice, Work Order and Purchase Order HSN/SAC dropdowns.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={addHsn}>＋ Add HSN / SAC</button>
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>CODE</th><th>TYPE</th><th>DESCRIPTION</th><th>GST %</th><th></th></tr></thead>
              <tbody>
                {hsnList.map(code => {
                  const info = (() => {
                    try {
                      const s = suggestGstRate(code);
                      if (s && (s.label || s.rate != null)) return s;
                    } catch { /* */ }
                    const isService = /^99/.test(String(code));
                    return { label: isService ? 'Service (SAC)' : 'Goods (HSN)', rate: null, kind: isService ? 'service' : 'goods' };
                  })();
                  const isService = /^99/.test(String(code)) || /service/i.test(info.label || '');
                  return (
                  <tr key={code}>
                    <td style={{ fontFamily: 'monospace' }}>{code}</td>
                    <td>{isService ? 'Service' : 'Goods'}</td>
                    <td>{info.label || '—'}</td>
                    <td>{info.rate != null ? info.rate + '%' : '—'}</td>
                    <td style={{ width: 80 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeHsn(code)}>Remove</button>
                    </td>
                  </tr>
                  );
                })}
                {!hsnList.length && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No codes yet — click Add</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'units' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Units for line items (Nos, Hrs, Sqft, …).
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={addUnit}>＋ Add unit</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unitList.map(u => (
              <span key={u} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2, #f3f4f6)',
                border: '1px solid var(--border, #e5e7eb)',
              }}>
                {u}
                <button type="button" className="btn-icon" style={{ fontSize: 12 }} onClick={() => removeUnit(u)} title="Remove">×</button>
              </span>
            ))}
          </div>
        </>
      )}

      {tab === 'exp' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Categories for expense vouchers and P&amp;L grouping.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={addExp}>＋ Add category</button>
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>CATEGORY</th><th></th></tr></thead>
              <tbody>
                {expList.map(c => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td style={{ width: 80 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeExp(c)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {!expList.length && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No categories yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
