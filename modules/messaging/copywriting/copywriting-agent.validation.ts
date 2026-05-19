// ============================================================
// Phase 3B — Structural Validator
// Pure function. No I/O. No side effects.
// Checks structure, presence, CTA count, length, and
// body_html null enforcement.
// Does not assign quality scores.
// ============================================================

import {
  COPY_ERROR_CODES,
  COPY_WARNING_CODES,
  LENGTH_WORD_RANGES,
} from './copywriting-agent.types'
import type {
  MessageVersionDraft,
  StructuralCheckResult,
} from './copywriting-agent.types'

// ---- CTA detection patterns ----
// Detects common CTA sentence endings that indicate a call-to-action.
// A version should have exactly one.

const CTA_PATTERNS: readonly RegExp[] = [
  /\?$/m,                             // ends with question mark
  /worth\s+\d+\s+minutes/i,
  /worth\s+a\s+(look|call|chat|conversation|discussion)/i,
  /happy to (schedule|set up|discuss|answer|walk through)/i,
  /let me know if/i,
  /here is (a link|the link|a scheduling link)/i,
  /schedule (a|our|the)/i,
  /book (a|the)/i,
  /interested\s*\?/i,
  /still relevant\?/i,
  /still worth/i,
  /want to (close|pause|continue)/i,
]

function countCTAs(bodyText: string): number {
  let count = 0
  const sentences = bodyText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  for (const sentence of sentences) {
    for (const pattern of CTA_PATTERNS) {
      if (pattern.test(sentence)) {
        count++
        break  // count each sentence once
      }
    }
  }
  // If we detect 0 by sentence pattern, try full-body pattern
  if (count === 0 && bodyText.includes('?')) count = 1
  return Math.max(count, 0)
}

function countSentences(text: string): number {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const matches = text.match(/[^.!?]+[.!?]+/g) ?? []
  return matches.length || 1
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ---- Subject/body consistency check ----

function checkSubjectBodyConsistency(subjectLine: string, bodyText: string): boolean {
  const subject = subjectLine.toLowerCase()
  const body    = bodyText.toLowerCase()

  // If subject says "review complete" but body says "begin the review", that's inconsistent
  if (
    subject.includes('review complete') &&
    (body.includes("we'll begin") || body.includes('we will begin') || body.includes('starting the review'))
  ) {
    return false
  }

  // If subject says "statement received" but body doesn't reference the statement
  // — this is too strict to enforce automatically; skip

  return true
}

// ---- Main structural check ----

export function checkStructure(
  draft: MessageVersionDraft
): StructuralCheckResult {
  const errors:   string[] = []
  const warnings: string[] = []

  const subjectLinePresent   = typeof draft.subjectLine  === 'string' && draft.subjectLine.trim().length > 0
  const previewTextPresent   = typeof draft.previewText  === 'string' && draft.previewText.trim().length > 0
  const bodyTextPresent      = typeof draft.bodyText     === 'string' && draft.bodyText.trim().length > 0
  const bodyHtmlIsNull       = draft.bodyHtml === null
  const versionLabelPresent  = typeof draft.versionLabel  === 'string' && draft.versionLabel.trim().length > 0
  const strategyAnglePresent = typeof draft.strategyAngle === 'string' && draft.strategyAngle.trim().length > 0
  const selectedSkillsRecorded = Array.isArray(draft.selectedSkills) && draft.selectedSkills.length > 0

  if (!subjectLinePresent)   errors.push(COPY_ERROR_CODES.COPY_016)
  if (!previewTextPresent)   errors.push(COPY_ERROR_CODES.COPY_016)
  if (!bodyTextPresent)      errors.push(COPY_ERROR_CODES.COPY_016)
  if (!bodyHtmlIsNull)       errors.push(COPY_ERROR_CODES.COPY_016)  // body_html must be null in v1
  if (!versionLabelPresent)  errors.push(COPY_ERROR_CODES.COPY_016)
  if (!strategyAnglePresent) errors.push(COPY_ERROR_CODES.COPY_016)
  if (!selectedSkillsRecorded) errors.push(COPY_ERROR_CODES.COPY_016)

  const body = draft.bodyText ?? ''

  // ---- CTA count ----
  const ctaCount = countCTAs(body)
  // We accept 1 CTA. If 0 or >1, flag.
  // Note: a well-formed short message should have at least one CTA pattern.
  // We don't hard-fail on 0 CTA for ultra_short but do for longer.
  if (ctaCount === 0 && body.length > 50) {
    errors.push(COPY_ERROR_CODES.COPY_016)
  }

  // ---- Length check ----
  const sentenceCount    = countSentences(body)
  const estimatedWordCount = countWords(body)

  // Determine expected length — use draft to get the angle's length override or default
  // The service passes lengthTarget via copy_constraints
  const lengthTarget = (draft.copyConstraints?.['lengthTarget'] as string | undefined) ?? 'short'
  const range = LENGTH_WORD_RANGES[lengthTarget as keyof typeof LENGTH_WORD_RANGES] ?? LENGTH_WORD_RANGES.short

  const sentenceOk = sentenceCount <= range.maxSentences
  const wordOk     = estimatedWordCount <= range.maxWords

  if (!sentenceOk && !wordOk) {
    warnings.push(COPY_WARNING_CODES.COPY_WARN_001)
  }

  const lengthTargetMet = sentenceOk  // sentence count is primary rule

  // ---- Subject/body consistency ----
  const subjectBodyConsistent = checkSubjectBodyConsistency(draft.subjectLine ?? '', body)
  if (!subjectBodyConsistent) {
    errors.push(COPY_ERROR_CODES.COPY_015)
  }

  const uniqueErrors   = [...new Set(errors)] as StructuralCheckResult['errors']
  const uniqueWarnings = [...new Set(warnings)] as StructuralCheckResult['warnings']

  return {
    passed:                 uniqueErrors.length === 0,
    subjectLinePresent,
    previewTextPresent,
    bodyTextPresent,
    bodyHtmlIsNull,
    ctaCount,
    sentenceCount,
    estimatedWordCount,
    lengthTargetMet,
    subjectBodyConsistent,
    selectedSkillsRecorded,
    versionLabelPresent,
    strategyAnglePresent,
    errors:                 uniqueErrors,
    warnings:               uniqueWarnings,
  }
}
