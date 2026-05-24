// Phase 3B.2 — Data Import Foundation: activity event payload builders (pure functions)

import {
  IMPORT_ACTION_TYPES,
  type ImportBatchCreatedPayload,
  type ImportFileParsedPayload,
  type ImportValidationCompletedPayload,
  type ImportDuplicatesDetectedPayload,
  type ImportApprovedPayload,
  type ImportCommitStartedPayload,
  type ImportCommitCompletedPayload,
  type ImportCommitFailedPayload,
  type ImportCanceledPayload,
} from './import.types'

export function buildImportBatchCreatedPayload(params: {
  batchId:    string
  tenantId:   string
  sourceType: string
  filename:   string | null
  uploadedBy: string
}): ImportBatchCreatedPayload {
  return {
    action_type: IMPORT_ACTION_TYPES.IMPORT_BATCH_CREATED,
    batch_id:    params.batchId,
    tenant_id:   params.tenantId,
    source_type: params.sourceType,
    filename:    params.filename,
    uploaded_by: params.uploadedBy,
  }
}

export function buildImportFileParsedPayload(params: {
  batchId:    string
  tenantId:   string
  totalRows:  number
  parsedRows: number
}): ImportFileParsedPayload {
  return {
    action_type:  IMPORT_ACTION_TYPES.IMPORT_FILE_PARSED,
    batch_id:     params.batchId,
    tenant_id:    params.tenantId,
    total_rows:   params.totalRows,
    parsed_rows:  params.parsedRows,
  }
}

export function buildImportValidationCompletedPayload(params: {
  batchId:     string
  tenantId:    string
  validRows:   number
  invalidRows: number
}): ImportValidationCompletedPayload {
  return {
    action_type:  IMPORT_ACTION_TYPES.IMPORT_VALIDATION_COMPLETED,
    batch_id:     params.batchId,
    tenant_id:    params.tenantId,
    valid_rows:   params.validRows,
    invalid_rows: params.invalidRows,
  }
}

export function buildImportDuplicatesDetectedPayload(params: {
  batchId:       string
  tenantId:      string
  duplicateRows: number
  uniqueRows:    number
}): ImportDuplicatesDetectedPayload {
  return {
    action_type:    IMPORT_ACTION_TYPES.IMPORT_DUPLICATES_DETECTED,
    batch_id:       params.batchId,
    tenant_id:      params.tenantId,
    duplicate_rows: params.duplicateRows,
    unique_rows:    params.uniqueRows,
  }
}

export function buildImportApprovedPayload(params: {
  batchId:    string
  tenantId:   string
  approvedBy: string
  rowCount:   number
  async:      boolean
}): ImportApprovedPayload {
  return {
    action_type: IMPORT_ACTION_TYPES.IMPORT_APPROVED,
    batch_id:    params.batchId,
    tenant_id:   params.tenantId,
    approved_by: params.approvedBy,
    row_count:   params.rowCount,
    async:       params.async,
  }
}

export function buildImportCommitStartedPayload(params: {
  batchId:  string
  tenantId: string
}): ImportCommitStartedPayload {
  return {
    action_type: IMPORT_ACTION_TYPES.IMPORT_COMMIT_STARTED,
    batch_id:    params.batchId,
    tenant_id:   params.tenantId,
  }
}

export function buildImportCommitCompletedPayload(params: {
  batchId:          string
  tenantId:         string
  committedRows:    number
  skippedRows:      number
  failedCommitRows: number
}): ImportCommitCompletedPayload {
  return {
    action_type:         IMPORT_ACTION_TYPES.IMPORT_COMMIT_COMPLETED,
    batch_id:            params.batchId,
    tenant_id:           params.tenantId,
    committed_rows:      params.committedRows,
    skipped_rows:        params.skippedRows,
    failed_commit_rows:  params.failedCommitRows,
  }
}

export function buildImportCommitFailedPayload(params: {
  batchId:  string
  tenantId: string
  error:    string
}): ImportCommitFailedPayload {
  return {
    action_type: IMPORT_ACTION_TYPES.IMPORT_COMMIT_FAILED,
    batch_id:    params.batchId,
    tenant_id:   params.tenantId,
    error:       params.error,
  }
}

export function buildImportCanceledPayload(params: {
  batchId:    string
  tenantId:   string
  canceledBy: string
}): ImportCanceledPayload {
  return {
    action_type: IMPORT_ACTION_TYPES.IMPORT_CANCELED,
    batch_id:    params.batchId,
    tenant_id:   params.tenantId,
    canceled_by: params.canceledBy,
  }
}
