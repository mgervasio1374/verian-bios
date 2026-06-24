// MCM v2 — Generic agent skill shape (seed-agent-skills slice). Generalizes the
// copywriting-only skill model to every Class A (learning) + Class B (governance)
// agent. A skill is a glass-box, human-readable unit of agent guidance.
//
// House style for ALL seed CONTENT authored against this shape: no em/en dashes
// (use a plain hyphen or rephrase) and no unsupported rate/savings claims. The
// legacy copywriting module predates this rule and keeps its own richer shape.

export interface AgentSkillDefinition {
  skillSlug:         string
  skillVersion:      number
  category:          string
  name:              string
  guidance:          string
  requiredElements:  string[]
  forbiddenElements: string[]
  examples:          string[]
  antiPatterns:      string[]
}
