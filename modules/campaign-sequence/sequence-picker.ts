export interface SequenceOption {
  id:               string
  name:             string
  campaignTypeSlug: string
}

/**
 * Returns sequences whose campaignTypeSlug matches typeSlug.
 * Returns [] when typeSlug is empty (no type selected — caller should hide the picker).
 */
export function sequencesForType(
  sequences: SequenceOption[],
  typeSlug: string,
): SequenceOption[] {
  if (!typeSlug) return []
  return sequences.filter(s => s.campaignTypeSlug === typeSlug)
}
