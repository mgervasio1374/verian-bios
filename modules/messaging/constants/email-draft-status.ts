export const EDITABLE_EMAIL_DRAFT_STATUSES = ['draft', 'pending_approval', 'rejected'] as const

export type EditableEmailDraftStatus = typeof EDITABLE_EMAIL_DRAFT_STATUSES[number]
