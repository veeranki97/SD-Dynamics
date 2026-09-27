import fs from 'fs';
import path from 'path';

const DEFAULT_AUDIT_DIR = path.join(process.cwd(), 'data', 'activity-logs');

export function jsonDiff(before = {}, after = {}) {
  const walk = (a, b, parent = '') => {
    const result = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

    for (const key of keys) {
      const p = parent ? `${parent}.${key}` : key;
      const av = a?.[key];
      const bv = b?.[key];

      if (JSON.stringify(av) === JSON.stringify(bv)) continue;

      if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) {
        const nested = walk(av, bv, p);
        if (Object.keys(nested).length) result[key] = nested;
      } else {
        result[key] = { before: av, after: bv, path: p };
      }
    }

    return result;
  };

  return walk(before, after);
}

export function writeAuditLog(logEntry, baseDir = DEFAULT_AUDIT_DIR) {
  const dir = baseDir;
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}_${(logEntry?.entityType || 'audit')}_${(logEntry?.entityId || 'record')}.json`;
  const filePath = path.join(dir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2), 'utf8');
  return filePath;
}

export function auditDiffMiddleware(options = {}) {
  const { getOriginal = null, storageDir = DEFAULT_AUDIT_DIR } = options;

  return async function auditMiddleware(req, res, next) {
    try {
      if (!['PUT', 'PATCH'].includes((req.method || '').toUpperCase())) return next();

      const original = getOriginal ? await getOriginal(req) : (req.originalRecord || req.body || {});
      const before = typeof original === 'object' ? original : {};
      const after = typeof req.body === 'object' ? req.body : {};
      const diff = jsonDiff(before, after);

      req.auditDiff = diff;
      const auditEntry = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        method: req.method,
        path: req.originalUrl || req.url,
        user: req.user || { id: 'system', name: 'system' },
        timestamp: new Date().toISOString(),
        entityType: req.params?.entityType || req.baseUrl?.split('/').filter(Boolean).pop() || 'record',
        entityId: req.params?.id || req.body?.id || before?.id || null,
        before,
        after,
        diff,
      };

      const logger = res.locals?.auditLogger || null;
      if (logger && typeof logger === 'function') {
        logger(auditEntry);
      } else {
        writeAuditLog(auditEntry, storageDir);
      }

      next();
    } catch (error) {
      console.error('Audit log failed:', error);
      next();
    }
  };
}
