// House-style scrub — deterministic, constant rules applied to outbound copy.
//
// This is NOT a learning-loop feature and NOT (yet) operator-editable. It is a
// fixed set of rules that run at the universal render chokepoint and at
// generation, so no "AI tell" punctuation reaches an email subject or body.
//
// v1 rule: eliminate em dashes (—) and en-dashes-as-punctuation (–), the #1
// "written by AI" tell. A numeric en-dash range (10–15) collapses to a hyphen;
// every other em/en dash (and its HTML entity forms) becomes a comma.
//
// The rule list is intentionally an ordered, named array so future constant
// rules can be appended without touching callers. The editable/DB-backed style
// guide is explicitly out of scope for v1.

export interface HouseStyleOptions {
  /** Input is an HTML fragment. The transforms only target dash characters and
   *  their entity forms, so tag/attribute structure is never parsed or altered. */
  html?: boolean
}

interface HouseStyleRule {
  name: string
  apply: (text: string) => string
}

// Entity forms for em (—) and en (–) dashes.
const EM_DASH_ENTITIES = /&mdash;|&#8212;|&#x2014;/gi
const EN_DASH_ENTITIES = /&ndash;|&#8211;|&#x2013;/gi

const RULES: HouseStyleRule[] = [
  {
    // Normalize entity forms to their characters so a single set of char rules
    // covers literal-character and HTML-entity inputs alike.
    name: 'normalize-dash-entities',
    apply: (t) => t.replace(EM_DASH_ENTITIES, '—').replace(EN_DASH_ENTITIES, '–'),
  },
  {
    // A numeric range (digit – digit) is a real range: collapse to a hyphen and
    // drop any surrounding spaces. e.g. "10 – 15" -> "10-15", "9–5" -> "9-5".
    name: 'numeric-en-dash-range',
    apply: (t) => t.replace(/(\d)\s*–\s*(\d)/g, '$1-$2'),
  },
  {
    // Any remaining en-dash is punctuation, not a range — treat it as an em-dash.
    name: 'en-dash-as-em',
    apply: (t) => t.replace(/–/g, '—'),
  },
  {
    // Em-dash punctuation becomes a comma, absorbing surrounding whitespace so
    // "word — word" and "word—word" both yield "word, word".
    name: 'em-dash-to-comma',
    apply: (t) => t.replace(/\s*—\s*/g, ', '),
  },
  {
    // Collapse any doubled commas the previous rule may have created next to an
    // existing comma (e.g. "word, — word" -> "word, , word" -> "word, word").
    name: 'collapse-duplicate-commas',
    apply: (t) => t.replace(/,(?:\s*,)+/g, ','),
  },
]

/**
 * Apply the constant house-style rules to a piece of copy. Pure and idempotent:
 * the output contains no em/en dashes or their entity forms, and running it a
 * second time produces an identical result.
 */
export function applyHouseStyle(text: string, _opts: HouseStyleOptions = {}): string {
  if (!text) return text
  let result = text
  for (const rule of RULES) {
    result = rule.apply(result)
  }
  return result
}

/** Exposed for tests/observability — the ordered rule names applied in v1. */
export const HOUSE_STYLE_RULE_NAMES = RULES.map(r => r.name)
