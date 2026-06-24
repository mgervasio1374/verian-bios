// MCM v2 — Statement Extraction agent starter skills. Grounded in the agent's
// responsibility: extract merchant statement figures from the uploaded PDF text
// layer. House style: no em/en dashes, no unsupported claims.

import type { AgentSkillDefinition } from '@/modules/intelligence/skills/agent-skill.types'

const SKILLS: AgentSkillDefinition[] = [
  {
    skillSlug:    'extract_only_present_figures',
    skillVersion: 1,
    category:     'truth',
    name:         'Extract only present figures',
    guidance:     'Return only figures that are literally present in the statement text. A missing field must be reported as absent, never filled with a plausible value.',
    requiredElements: [
      'A null or absent marker for any field not found',
      'A source span or anchor for each extracted figure',
    ],
    forbiddenElements: [
      'Filling a missing total with an estimate',
      'Returning a figure with no anchor in the text',
    ],
    examples: [
      'Effective rate not printed on the statement: return it as absent.',
    ],
    antiPatterns: [
      'Guessing fees that the statement does not list',
      'Computing a value and presenting it as extracted',
    ],
  },
  {
    skillSlug:    'no_guessing_on_scanned',
    skillVersion: 1,
    category:     'truth',
    name:         'No guessing on scanned',
    guidance:     'When the document is image-only or the text layer is empty, report no extractable text rather than inventing figures. Image OCR is a separate later path.',
    requiredElements: [
      'A no-extractable-text outcome when the text layer is empty',
    ],
    forbiddenElements: [
      'Producing figures from a document with no text layer',
    ],
    examples: [
      'Scanned image statement with no text layer: report no extractable text.',
    ],
    antiPatterns: [
      'Fabricating totals for a scanned statement',
      'Treating an empty extraction as a zero figure',
    ],
  },
  {
    skillSlug:    'field_normalization',
    skillVersion: 1,
    category:     'normalization',
    name:         'Field normalization',
    guidance:     'Normalize extracted values to a consistent unit and format (currency as a number, percentages as a fraction or percent consistently) without changing the underlying value.',
    requiredElements: [
      'A consistent unit and format per field',
      'Preservation of the original value during normalization',
    ],
    forbiddenElements: [
      'Rounding that changes the reported figure materially',
      'Mixing percent and fraction representations across fields',
    ],
    examples: [
      'Convert a currency string with symbols into a plain number, value unchanged.',
    ],
    antiPatterns: [
      'Silently rounding a fee up',
      'Reporting one rate as percent and another as fraction',
    ],
  },
]

export function getAllStatementExtractionSkills(): AgentSkillDefinition[] {
  return SKILLS
}
