// ============================================================
// Phase 3B — Static Skill Definitions Module
//
// IMPORTANT: This is a CONDENSED OPERATIONAL SEED derived from
// Phase 3B Skills & Playbooks Pack v1.0. It captures the key
// operational rules — toneRules, messagingRules, requiredElements,
// forbiddenElements, ctaGuidance, complianceNotes — that the
// Copywriting Agent needs to enforce. It is NOT a verbatim
// reproduction of the full Pack document (which includes narrative
// explanations, history, and extended examples not needed here).
//
// Do not expand this module with additional content.
// Do not modify skill values without updating the Pack source.
// A future skills database table can replace this module behind
// the same getSkillDefinition(slug, version) interface without
// any service or repository contract changes.
// ============================================================

import type { CopywritingSkillDefinition } from './copywriting-agent.types'

// ---- Static skill library at v1 ----

const SKILL_LIBRARY: CopywritingSkillDefinition[] = [

  // ---- Context Skills ----

  {
    skillSlug:    'cold_outreach',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Professional and observational. Lead with a specific insight, not a pitch. Avoid sounding like a mass email. Short sentences. No enthusiasm punctuation.',
    messagingRules: 'This is first contact with a merchant who has not engaged before. Must establish relevance through specificity — industry context, business type, or operational observation. Must not claim prior familiarity. Must invite, not pressure.',
    requiredElements: [
      'One specific observation relevant to this merchant or industry',
      'One clear CTA for a statement review or processing cost conversation',
    ],
    forbiddenElements: [
      'Inbound acknowledgment language (Thanks for reaching out, Got your inquiry)',
      'References to prior communication',
      'Savings claims without calculated data',
      'Statement review references without a submitted statement',
    ],
    ctaGuidance:   'Offer a statement review or 15-minute processing conversation. Frame as low-friction. Do not pressure.',
    complianceNotes: 'No savings promises. No knowledge of current processor unless verified. No inbound framing.',
    examples: [
      'Field-based contractors often process a mix of consumer and business cards without clear visibility into category assignments.',
      'Worth a look at your statement? I can usually find something worth discussing in the first review.',
    ],
    antiPatterns: [
      'Generic "I came across your business" opener',
      'Feature-listing the 321 Swipe platform',
      'Making savings promises in the first message',
    ],
  },

  {
    skillSlug:    'new_inquiry_response',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Warm but efficient. Responsive. Acknowledge specifically. Do not re-introduce the company as if the merchant is unfamiliar with 321 Swipe — they reached out.',
    messagingRules: 'This merchant raised their hand. Response must acknowledge what they submitted and advance quickly to the next step (statement submission or scheduling). Do not restart the awareness conversation.',
    requiredElements: [
      'Explicit acknowledgment of the inquiry or form submission',
      'Clear next step: statement submission link or scheduling offer',
    ],
    forbiddenElements: [
      'Cold-discovery language (I came across your business)',
      'Savings claims before any review',
      'Re-introducing 321 Swipe as if unknown to the merchant',
    ],
    ctaGuidance: 'Advance to statement submission or scheduling. Do not re-explain the offer from scratch.',
    complianceNotes: 'No cold-outreach language. No savings promises before review.',
    examples: [
      'Got your request — happy to take a look at your processing setup.',
      'Your inquiry came through — here is the next step to get your statement reviewed.',
    ],
    antiPatterns: [
      'Using the same opener as a cold email',
      'Treating the merchant like they have never heard of 321 Swipe',
      'Explaining the statement review from scratch as if this is cold outreach',
    ],
  },

  {
    skillSlug:    'statement_submitted_confirmation',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Professional and prompt. Specific timeline. No filler. No findings language.',
    messagingRules: 'Confirm receipt explicitly. Set a specific review timeline. Do not hint at findings. Do not claim the review is in progress unless it is.',
    requiredElements: [
      'Explicit confirmation of statement receipt',
      'Specific review timeline',
      'One CTA: scheduling link or timeline confirmation',
    ],
    forbiddenElements: [
      'Any reference to what the review might find',
      'Savings hints or promises before review is complete',
      'Claiming the review is in progress unless it actually is',
    ],
    ctaGuidance: 'Set a specific next step — either a scheduling link for the review discussion or a specific date they will hear back.',
    complianceNotes: 'No findings language. No savings promises. No review progress claims unless true.',
    examples: [
      'Received your statement — I will have a review ready within two business days.',
      'Got your processing statement — here is a link to schedule our review discussion.',
    ],
    antiPatterns: [
      'Saying "Here is what we found" before the review is done',
      'Hinting at potential savings before any analysis',
      'Generic "We will be in touch soon" without a specific timeline',
    ],
  },

  {
    skillSlug:    'statement_review_follow_up',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Warm and professional. Finding-forward. Translate findings into operational language the merchant understands.',
    messagingRules: 'Reference the completed review. Lead with at least one finding from review_summary. Advance toward the next step. Do not overwhelm with data.',
    requiredElements: [
      'Reference to the completed review',
      'At least one specific finding from review_summary',
      'One CTA: schedule review call or discussion',
    ],
    forbiddenElements: [
      'Findings not in review_summary',
      'Guaranteed savings language',
      'Fabricated analysis results',
    ],
    ctaGuidance: 'Offer a call to walk through the review findings. Specific scheduling link preferred.',
    complianceNotes: 'All findings must come from review_summary. Savings amount only if calculated_savings_amount exists.',
    examples: [
      'Based on your statement, there is an interchange category issue worth discussing.',
      'The review flagged a pattern in your card-not-present transactions that is worth a closer look.',
    ],
    antiPatterns: [
      'Inventing findings not in the review summary',
      'Rounding up or exaggerating the savings amount',
      'Claiming a specific dollar impact without calculated_savings_amount',
    ],
  },

  {
    skillSlug:    'statement_not_submitted_follow_up',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Brief and low-friction. No guilt. Acknowledge prior contact without summarizing it verbatim.',
    messagingRules: 'Reduce friction to statement submission. At sequence 2: explain the process and make it easy. At sequence 3: ask one direct question. At sequence 4: offer graceful exit.',
    requiredElements: [
      'Acknowledgment of prior contact',
      'Low-friction ask or exit offer',
    ],
    forbiddenElements: [
      'Guilt language',
      'Claims about what the prior message said without prior_campaign_messages data',
      'Pressure language',
    ],
    ctaGuidance: 'Match CTA to sequence position: submission link (seq 2), direct question (seq 3), exit offer (seq 4).',
    complianceNotes: 'No savings claims. No invented prior message content.',
    examples: [
      'Happy to pull the statement together — here is the link if that is easier.',
      'Did the timing not work out? Happy to close this out if so.',
    ],
    antiPatterns: [
      'Guilt tripping: "I have reached out several times"',
      'Restating the entire prior message verbatim',
      'Overselling at a late sequence position',
    ],
  },

  {
    skillSlug:    'proposal_follow_up',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Short and direct. Non-pushy. No deadline pressure. Reference proposal briefly.',
    messagingRules: 'Acknowledge the sent proposal. Ask where they are in the process or offer to answer questions. No new promises or claims beyond the proposal scope.',
    requiredElements: [
      'Brief reference to the sent proposal',
      'One ask: status question or invitation to discuss',
    ],
    forbiddenElements: [
      'Deadline pressure',
      'New savings claims or promises not in the proposal',
      'Timing claims if proposal_sent_at is missing',
    ],
    ctaGuidance: 'Remove friction from the next conversation. "Happy to answer any questions" or "Would it help to walk through the numbers?"',
    complianceNotes: 'No false urgency. No new claims beyond proposal scope.',
    examples: [
      'Any questions on the proposal? Happy to walk through anything.',
      'Where are you in the process — still worth a conversation?',
    ],
    antiPatterns: [
      'Manufacturing a deadline: "This offer expires Friday"',
      'Adding new promises not in the original proposal',
      'Using the same opener as the original proposal email',
    ],
  },

  {
    skillSlug:    'no_response_follow_up',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Very short. Different angle from prior. No apology. No guilt. No recap of prior pitch.',
    messagingRules: 'Use a different angle than the prior message. Must be shorter than the prior version where applicable. One question or one observation. Do not summarize the prior email.',
    requiredElements: [
      'Different opening angle from prior message',
      'One ask or observation',
    ],
    forbiddenElements: [
      'Guilt or passive-aggression',
      'Summarizing prior messages verbatim',
      'Urgency manufacturing',
    ],
    ctaGuidance: 'Soft and binary where possible. "Worth a 15-minute call?" or "Did the timing not work out?"',
    complianceNotes: 'No urgency manufacturing. No guilt language.',
    examples: [
      'Still worth a look?',
      'Different angle: wanted to ask about your card mix specifically.',
    ],
    antiPatterns: [
      'Repeating the same message with a different subject',
      'Guilt-tripping: "I have tried reaching you several times"',
      'Long no-response emails at sequence 3+',
    ],
  },

  {
    skillSlug:    're_engagement',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Brief. Acknowledge time gap lightly without apology or guilt. Fresh framing.',
    messagingRules: 'Acknowledge that time has passed (lightly, non-apologetically). Present a fresh or updated reason to reconnect. Do not resurrect the prior sequence verbatim.',
    requiredElements: [
      'Light acknowledgment of elapsed time',
      'Fresh reason to reconnect',
    ],
    forbiddenElements: [
      'Apology for the time gap',
      'Guilt-inducing language',
      'Repeating the original cold outreach pitch verbatim',
    ],
    ctaGuidance: 'Low pressure. Same strategy CTA.',
    complianceNotes: 'No guilt language. No invented new context.',
    examples: [
      'Checking back in — still relevant for Apex HVAC?',
      'Worth revisiting now that Q2 is wrapping up?',
    ],
    antiPatterns: [
      'Apologizing: "I am sorry for the delay in following up"',
      'Blaming the merchant for not responding',
      'Using the exact same cold outreach message',
    ],
  },

  {
    skillSlug:    'event_expo_follow_up',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Warm and specific. Reference the event. If conversation_notes present, reference specific discussion details.',
    messagingRules: 'Open by referencing the meeting at the event. If notes exist, tie the offer to what was discussed. If no notes, reference the event only — do not fabricate conversation details.',
    requiredElements: [
      'Reference to the event by name',
      'Next step offer: review or call',
    ],
    forbiddenElements: [
      'Fabricated conversation details when conversation_notes is absent',
      '"As we discussed" without conversation_notes',
    ],
    ctaGuidance: 'Statement review or review call. Reference the conversation thread where notes exist.',
    complianceNotes: 'No fabricated conversation content. Notes must exist before referencing specific discussions.',
    examples: [
      'Good meeting you at the HVAC Summit — wanted to follow up on what we discussed.',
      'Following up from the Expo — worth a statement review based on what you mentioned?',
    ],
    antiPatterns: [
      'Fabricating conversation details when no notes are available',
      'Treating the event follow-up like a cold email',
      'Ignoring the event context entirely',
    ],
  },

  {
    skillSlug:    'referral_request',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Warm and natural. Gratitude-first. Non-transactional.',
    messagingRules: 'Open with acknowledgment of delivered value. Describe the ideal referral specifically. Keep the ask natural and light.',
    requiredElements: [
      'Acknowledgment of existing relationship or delivered value',
      'Specific description of who would benefit from a referral',
    ],
    forbiddenElements: [
      'Savings promises to the referral target',
      'Transactional tone',
    ],
    ctaGuidance: '"If you know someone who might benefit, I would be grateful for an introduction."',
    complianceNotes: 'No savings promises for the referral target. Relationship gate required.',
    examples: [
      'Enjoyed working through your statement review — wanted to ask if you know anyone else who might find it useful.',
    ],
    antiPatterns: [
      'Asking for a referral before delivering value',
      'Making savings promises about the referral outcome',
      'Sounding transactional: "For every referral you send..."',
    ],
  },

  {
    skillSlug:    'customer_nurture',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Relationship-appropriate. Warm check-in. Not a sales pitch.',
    messagingRules: 'Read as a check-in from an existing relationship. Must not re-introduce 321 Swipe. Must not sound like prospecting. Offer an account review or check-in naturally.',
    requiredElements: [
      'Acknowledgment of the existing relationship',
      'One offer or check-in point',
    ],
    forbiddenElements: [
      'Cold-outreach language',
      'Re-pitching 321 Swipe to an existing customer',
      'Prospecting tone',
    ],
    ctaGuidance: 'Account review, scheduling link for check-in, or specific operational question.',
    complianceNotes: 'No cold language. No re-pitching.',
    examples: [
      'Checking in on the account — wanted to see if a quarterly review would be useful.',
      'Any changes in your processing volume worth discussing?',
    ],
    antiPatterns: [
      'Treating an existing customer like a cold prospect',
      'Re-explaining what 321 Swipe does',
      'Generic "Just checking in" opener',
    ],
  },

  // ---- Partner Skills ----

  {
    skillSlug:    'certainpath_member_messaging',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Professional. Natural reference to shared CertainPath connection. Not over-referenced.',
    messagingRules: 'Reference the CertainPath membership once and naturally. Lead primarily with the review offer. Do not make the partnership the entire message.',
    requiredElements: [
      'One natural reference to CertainPath shared context',
      'Statement review or processing review offer',
    ],
    forbiddenElements: [
      'Claiming exclusive or preferred CertainPath partnership without authorization',
      'Referencing CertainPath more than once in the body',
    ],
    ctaGuidance: 'Same as context skill CTA guidance. Statement review focus.',
    complianceNotes: 'Partner membership must be confirmed. No exclusivity claims without partner_claims_authorized.',
    examples: [
      'A lot of CertainPath members have found the statement review useful — happy to do the same for your business.',
    ],
    antiPatterns: [
      'Making CertainPath the entire message',
      'Claiming exclusivity not authorized',
      'Using CertainPath language for BCSG members or vice versa',
    ],
  },

  {
    skillSlug:    'blue_collar_success_group_messaging',
    skillVersion: 1,
    category:     'context',
    toneRules:    'Professional. Natural BCSG reference. Operational angle appropriate to BCSG membership profile.',
    messagingRules: 'Reference BCSG membership once and naturally. Do not auto-add home services language unless BCSG context specifically supports it.',
    requiredElements: [
      'One natural reference to BCSG shared context',
      'Review or processing offer',
    ],
    forbiddenElements: [
      'Home services contractor language unless BCSG profile specifically supports it',
      'Exclusivity claims without authorization',
    ],
    ctaGuidance: 'Statement review offer. Partner context as secondary framing.',
    complianceNotes: 'Partner membership must be confirmed. BCSG does not automatically imply home services.',
    examples: [
      'Many BCSG members have found a statement review useful for understanding their current processing costs.',
    ],
    antiPatterns: [
      'Using home services language for all BCSG members regardless of industry',
      'Claiming official BCSG endorsement without authorization',
    ],
  },

  // ---- Audience Skills ----

  {
    skillSlug:    'home_services_contractor',
    skillVersion: 1,
    category:     'audience',
    toneRules:    'Industry-aware. Reference field payment realities. Acknowledge owner-operator context and skepticism about generic processor outreach.',
    messagingRules: 'May reference: field payments across technicians, seasonal volume swings, mix of consumer and business card types, interchange category inefficiency. Must not claim knowledge of the merchant specific situation without verified data.',
    requiredElements: [
      'At least one industry-specific observation relevant to home services',
    ],
    forbiddenElements: [
      'Generic processor outreach language that ignores industry context',
      'Specific claims about merchant operations without verified data',
    ],
    ctaGuidance: 'Frame the review in terms of home services operational realities.',
    complianceNotes: 'Do not claim knowledge of specific rates or current processor without verified data.',
    examples: [
      'Field-based contractors often process a mix of consumer and business cards across technicians without clear visibility into category assignments.',
      'Seasonal volume swings in home services often affect interchange category patterns in ways that are worth reviewing.',
    ],
    antiPatterns: [
      'Generic "we work with businesses like yours" without industry specificity',
      'Claiming knowledge of the merchant rates without data',
    ],
  },

  // ---- Positioning Skills ----

  {
    skillSlug:    'statement_analysis_positioning',
    skillVersion: 1,
    category:     'positioning',
    toneRules:    'Analytical. Position the review as an objective analysis, not a sales pitch.',
    messagingRules: 'Frame the statement review as revealing hidden cost structure and category inefficiencies. Not a generic processor comparison. Not a pitch.',
    requiredElements: [
      'Framing the review as an analysis of the merchant actual statement',
    ],
    forbiddenElements: [
      'Framing as a generic rate comparison pitch',
      'Savings promises without analysis data',
    ],
    ctaGuidance: 'Offer the analysis as the starting point.',
    complianceNotes: 'No savings promises without analysis. No rate comparison claims.',
    examples: [
      'The review looks at how your transactions are categorized and what that means for your interchange costs.',
    ],
    antiPatterns: [
      'Making it sound like a pitch to switch processors',
      'Promising savings before any analysis is done',
    ],
  },

  {
    skillSlug:    'savings_review_positioning',
    skillVersion: 1,
    category:     'positioning',
    toneRules:    'Possibility-framed. Never guaranteed. Use "potential" or "worth reviewing" language.',
    messagingRules: 'Frame the offer around what the review could find in terms of savings potential. Must not state a specific amount unless calculated_savings_amount is confirmed. May use "savings potential" or "possible savings" framing freely.',
    requiredElements: [
      'Savings possibility framing (not guaranteed)',
    ],
    forbiddenElements: [
      'Specific dollar or percentage savings claims without calculated_savings_amount',
      'Guaranteed savings language',
    ],
    ctaGuidance: 'Frame the CTA around discovering what the review might find.',
    complianceNotes: 'Specific amounts only when calculated_savings_amount is present. Never guarantee savings.',
    examples: [
      'Most reviews find something worth discussing — worth 15 minutes to find out?',
      'The review found a $380/month savings opportunity in your interchange structure.',
    ],
    antiPatterns: [
      'Stating specific savings without calculated_savings_amount',
      'Using "guaranteed" or "certain" language about savings',
    ],
  },

  {
    skillSlug:    'trust_building_advisor',
    skillVersion: 1,
    category:     'positioning',
    toneRules:    'Advisor-first. Lead with industry knowledge or observation before asking. Establish credibility before the ask.',
    messagingRules: 'Position 321 Swipe as an advisor, not a vendor. Lead with a specific industry observation or insight before the CTA.',
    requiredElements: [
      'One credibility-establishing observation before the CTA',
    ],
    forbiddenElements: [
      'Leading with a pitch before establishing any value',
    ],
    ctaGuidance: 'CTA comes after trust is established, not before.',
    complianceNotes: 'Observations must be grounded in real industry context.',
    examples: [
      'Most processors do not explain how interchange categories work — our review does.',
    ],
    antiPatterns: [
      'Opening with "We can save you money" before any context',
      'Feature-listing without industry framing',
    ],
  },

  // ---- Tone Skills ----

  {
    skillSlug:    'executive_brevity',
    skillVersion: 1,
    category:     'tone',
    toneRules:    'Short declarative sentences. No hedging. No filler. Paragraph max: 1-2 sentences. Body: 4-6 sentences for short, 1-3 for ultra_short. CTA: one direct line.',
    messagingRules: 'Every word must earn its place. No filler openers. No padding. Structure: observation → implication → CTA.',
    requiredElements: [
      'Direct, no-filler structure',
      'CTA on its own line or clearly separated',
    ],
    forbiddenElements: [
      'Hedging language (might possibly, could potentially)',
      'Multi-sentence paragraph filler',
    ],
    ctaGuidance: 'One line. Direct. "Worth 15 minutes?" or "Interested?"',
    complianceNotes: 'No banned filler phrases.',
    examples: [
      'Field contractors often overpay on interchange. Worth a statement review?',
    ],
    antiPatterns: [
      'Long multi-paragraph body for a brevity-tone message',
      'Hedging: "I was just wondering if you might possibly be interested"',
    ],
  },

  {
    skillSlug:    'warm_conversational',
    skillVersion: 1,
    category:     'tone',
    toneRules:    'Warm but professional. Flowing sentences. 2-3 sentence paragraphs allowed. More context per paragraph. Total: 4-10 sentences.',
    messagingRules: 'Conversational but not casual. More context and explanation allowed. CTA may have softer framing.',
    requiredElements: [
      'Warm but professional tone throughout',
    ],
    forbiddenElements: [
      'Overly casual language ("Hey!", "Wanted to chat")',
      'Cold formal tone',
    ],
    ctaGuidance: '"Happy to schedule a time" or "Let me know if you have questions."',
    complianceNotes: 'No banned filler openers despite the warmer tone.',
    examples: [
      'It was great hearing from you — happy to take a look at your processing setup and share what the review finds.',
    ],
    antiPatterns: [
      'Using warm tone as an excuse for filler openers',
      'Sounding overly casual or sales-y despite the warmer register',
    ],
  },

  // ---- Compliance Skill ----

  {
    skillSlug:    'compliance_forbidden_claims',
    skillVersion: 1,
    category:     'compliance',
    toneRules:    'N/A — compliance skill governs content prohibitions, not tone.',
    messagingRules: 'Every generated version must be checked against this skill. All prohibited claims and banned phrases must be absent.',
    requiredElements: [],
    forbiddenElements: [
      'I hope this email finds you well',
      'Just checking in',
      'I wanted to reach out',
      'Touching base',
      'Circling back',
      'Following up on my previous email',
      'I came across your business',
      'I stumbled upon your company',
      'We can save you money',
      'Guaranteed savings',
      'Best rates',
      'Lowest rates',
      'No-brainer',
      'Game changer',
      'Specific dollar savings without calculated_savings_amount',
      'Review complete claim without statement_review_completed = true',
      'Partner claims without confirmed membership',
      'Exclusivity claims without partner_claims_authorized',
      'Deceptive urgency language',
      'Guaranteed outcomes',
    ],
    ctaGuidance: 'CTA must not contain any prohibited claims.',
    complianceNotes: 'This skill is always present. Its prohibitions override all other skill instructions.',
    examples: [],
    antiPatterns: [
      'Any of the listed forbidden elements appearing in subject, body, or preview',
    ],
  },

]

// ---- Lookup function ----

export function getSkillDefinition(
  skillSlug:    string,
  skillVersion: number
): CopywritingSkillDefinition | null {
  return SKILL_LIBRARY.find(
    s => s.skillSlug === skillSlug && s.skillVersion === skillVersion
  ) ?? null
}

export function getAllSkillDefinitions(): readonly CopywritingSkillDefinition[] {
  return SKILL_LIBRARY
}
