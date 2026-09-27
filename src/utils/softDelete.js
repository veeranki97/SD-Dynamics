export const withSoftDelete = (record) => ({
  ...record,
  is_deleted: !!record?.is_deleted,
  deleted_at: record?.deleted_at || null,
});

export const isSoftDeleted = (record) => !!record?.is_deleted || !!record?.deleted_at;

export const filterActiveRecords = (items = []) =>
  (Array.isArray(items) ? items : []).filter((item) => !isSoftDeleted(item));

export const softDeleteRecord = (record, deletedBy = 'system') => ({
  ...record,
  is_deleted: true,
  deleted_at: new Date().toISOString(),
  deleted_by: deletedBy,
  docstatus: 2,
});

export const restoreSoftDeletedRecord = (record) => ({
  ...record,
  is_deleted: false,
  deleted_at: null,
  deleted_by: null,
  docstatus: record?.docstatus ?? 0,
});

export const withReadOnlyGuard = (record, options = {}) => {
  const { submittedDocstatus = 1 } = options;
  const docstatus = Number(record?.docstatus ?? 0);
  return {
    ...record,
    is_read_only: docstatus === submittedDocstatus,
    readonly: docstatus === submittedDocstatus,
  };
};
