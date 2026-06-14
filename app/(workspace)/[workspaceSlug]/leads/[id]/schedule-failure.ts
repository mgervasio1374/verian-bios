// PROD-BUG-001: translate a campaign_schedule_items.status_reason into plain
// operator language for the lead detail failure banner. Pure + testable.

export function describeScheduleFailure(reason: string | null): string {
  switch (reason) {
    case 'no_contact':
    case 'no_contact_email':
      return 'No contact is linked to this lead. Add a contact to the company, then re-assign the campaign.'
    case 'no_email_asset':
      return 'A step in the sequence has no email asset. Fix the sequence, then re-assign.'
    case 'no_sequence_step':
      return 'A sequence step is missing. Re-create the sequence, then re-assign.'
    case 'asset_not_found':
      return 'The email asset for a step was deleted. Restore or replace it, then re-assign.'
    default:
      return `This campaign couldn't send (${reason ?? 'unknown reason'}).`
  }
}

export function dedupeFailureReasons(items: { status_reason: string | null }[]): (string | null)[] {
  return Array.from(new Set(items.map(i => i.status_reason)))
}
