/**
 * Unified master lists for HSN/SAC, Units, Expense categories.
 * Merges legacy keys so Invoice, WO, PO, and Master Data stay in sync.
 */
const SAC_KEYS = ['freegstbill_custom_sac', 'fgsb_custom_sac'];
const UNIT_KEYS = ['freegstbill_custom_units', 'fgsb_custom_units'];
const EXP_KEYS = ['freegstbill_expense_categories', 'fgsb_expense_categories'];

function readMerged(keys) {
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(arr)) continue;
      for (const x of arr) {
        const v = String(x || '').trim();
        if (v && !seen.has(v)) { seen.add(v); out.push(v); }
      }
    } catch { /* ignore */ }
  }
  return out;
}

function writePrimary(keys, arr) {
  const primary = keys[0];
  localStorage.setItem(primary, JSON.stringify(arr));
  // mirror to legacy key so older code paths still see updates
  if (keys[1]) localStorage.setItem(keys[1], JSON.stringify(arr));
}

export function getHsnMaster() {
  return readMerged(SAC_KEYS);
}

export function addHsnCode(code) {
  const t = String(code || '').trim();
  if (!t) return getHsnMaster();
  const arr = getHsnMaster();
  if (!arr.includes(t)) arr.push(t);
  writePrimary(SAC_KEYS, arr);
  return arr;
}

export function removeHsnCode(code) {
  const arr = getHsnMaster().filter(x => x !== code);
  writePrimary(SAC_KEYS, arr);
  return arr;
}

export function getUnitMaster() {
  const base = ['Nos', 'Hrs', 'Days', 'Kg', 'Ltr', 'Mtr', 'Sqft', 'Job', 'Pcs', 'Set'];
  const custom = readMerged(UNIT_KEYS);
  return [...new Set([...base, ...custom])];
}

export function addUnit(unit) {
  const t = String(unit || '').trim();
  if (!t) return getUnitMaster();
  const custom = readMerged(UNIT_KEYS);
  if (!custom.includes(t)) custom.push(t);
  writePrimary(UNIT_KEYS, custom);
  return getUnitMaster();
}

export function removeUnit(unit) {
  const custom = readMerged(UNIT_KEYS).filter(x => x !== unit);
  writePrimary(UNIT_KEYS, custom);
  return getUnitMaster();
}

export function getExpenseCategories() {
  return readMerged(EXP_KEYS);
}

export function addExpenseCategory(cat) {
  const t = String(cat || '').trim();
  if (!t) return getExpenseCategories();
  const arr = getExpenseCategories();
  if (!arr.includes(t)) arr.push(t);
  writePrimary(EXP_KEYS, arr);
  return arr;
}

export function removeExpenseCategory(cat) {
  const arr = getExpenseCategories().filter(x => x !== cat);
  writePrimary(EXP_KEYS, arr);
  return arr;
}
