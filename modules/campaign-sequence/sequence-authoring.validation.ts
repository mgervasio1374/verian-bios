export interface StepDraft {
  step_number: number
  day_offset: number
  campaignEmailAssetId: string
  is_recurring?: boolean
}

export interface ManualSequenceDraft {
  steps: StepDraft[]
}

export function validateManualSequenceDraft(input: ManualSequenceDraft): string[] {
  const errors: string[] = []
  const { steps } = input

  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push('A sequence must have at least 1 step.')
    return errors
  }

  if (steps.length > 5) {
    errors.push('A manual sequence may have at most 5 steps.')
  }

  // step_numbers must be contiguous 1..N
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].step_number !== i + 1) {
      errors.push(
        `Step numbers must be contiguous starting from 1 (found ${sorted[i].step_number} at position ${i + 1}).`
      )
      break
    }
  }

  for (const step of steps) {
    if (!step.campaignEmailAssetId || step.campaignEmailAssetId.trim() === '') {
      errors.push(`Step ${step.step_number} must have an email asset selected.`)
    }
    if (!Number.isInteger(step.day_offset) || step.day_offset < 0) {
      errors.push(`Step ${step.step_number} day offset must be a non-negative integer.`)
    }
    if (step.is_recurring === true) {
      errors.push(`Step ${step.step_number} must not be recurring (manual sequences only).`)
    }
  }

  return errors
}
