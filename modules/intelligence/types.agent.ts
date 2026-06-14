import type { Database } from '@/types/database'

// ---- Database row types ----

export type AgentRunRow       = Database['public']['Tables']['agent_runs']['Row']
export type AgentRunStepRow   = Database['public']['Tables']['agent_run_steps']['Row']
export type GuardrailEventRow = Database['public']['Tables']['guardrail_events']['Row']
export type SystemControlRow  = Database['public']['Tables']['system_controls']['Row']
export type CompanyScoreRow   = Database['public']['Tables']['company_scores']['Row']
export type ActivityEventRow  = Database['public']['Tables']['activity_events']['Row']

// ---- Agent run status ----

export const AgentRunStatus = {
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  CANCELLED: 'cancelled',
  KILLED:    'killed',
} as const
export type AgentRunStatus = typeof AgentRunStatus[keyof typeof AgentRunStatus]

// ---- Agent run type ----

export const AgentRunType = {
  CLASSIFICATION: 'classification',
  GENERATION:     'generation',
  SCORING:        'scoring',
  ANALYSIS:       'analysis',
  NOTIFICATION:   'notification',
} as const
export type AgentRunType = typeof AgentRunType[keyof typeof AgentRunType]

// ---- Agent run step status ----

export const AgentRunStepStatus = {
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  SKIPPED:   'skipped',
} as const
export type AgentRunStepStatus = typeof AgentRunStepStatus[keyof typeof AgentRunStepStatus]

// ---- Guardrail severity ----

export const GuardrailSeverity = {
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
} as const
export type GuardrailSeverity = typeof GuardrailSeverity[keyof typeof GuardrailSeverity]

// ---- Guardrail status ----

export const GuardrailStatus = {
  OPEN:         'open',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED:     'resolved',
} as const
export type GuardrailStatus = typeof GuardrailStatus[keyof typeof GuardrailStatus]

// ---- System control keys ----
// These exact string values are checked by services at runtime.
// Phase 3B-1 keys seed as value=false and must not be enabled without team approval.

export const SystemControlKey = {
  // Phase 3A — agent layer
  GLOBAL_AGENT_PAUSE:                  'global_agent_pause',
  EMAIL_SENDING_ENABLED:               'email_sending_enabled',
  CAMPAIGN_SENDING_ENABLED:            'campaign_sending_enabled',
  RECOMMENDATION_ENGINE_ENABLED:       'recommendation_engine_enabled',
  AUTO_TASK_CREATION_ENABLED:          'auto_task_creation_enabled',
  AGENT_ENABLED:                       'agent.enabled',
  // Agent sweep — flips agent-specific action-contract enforcement from advisory
  // (record-only) to fail-closed. Defaults false; BASE_BLOCKED is always enforced.
  AGENT_ACTION_ENFORCEMENT_ENABLED:    'agent_action_enforcement_enabled',
  // Agent sweep — the manual→automation bridge. When on, MCM campaign drafts are
  // quality-scored at promote time and a draft scoring >=85 (+ learning confidence)
  // auto-approves. Defaults false → the MCM path is unchanged until flipped.
  QUALITY_AUTO_APPROVE_ENABLED:        'quality_auto_approve_enabled',
  // Agent sweep — wires the copywriting agent's body generation to a real LLM
  // (OpenRouter gpt-4o-mini via the existing client). Defaults false → deterministic
  // rule-based generation, unchanged. LLM output passes the SAME compliance/structural
  // guardrails; deterministic fallback on any LLM failure.
  COPYWRITING_AGENT_LLM_ENABLED:       'copywriting_agent_llm_enabled',
  AGENT_CONFIDENCE_THRESHOLD_MIN:      'agent.confidence_threshold.min',
  AGENT_STATEMENT_CLASSIFIER_ENABLED:  'agent.statement_classifier.enabled',
  AGENT_PROPOSAL_BUILDER_ENABLED:      'agent.proposal_builder.enabled',
  AGENT_COMPANY_SCORING_ENABLED:       'agent.company_scoring.enabled',

  // Phase 3B — Revenue Learning Engine
  EMAIL_GENERATION_ENGINE:             'email_generation_engine',
  REQUIRE_STRATEGY_REVIEW:             'require_strategy_review',
  REQUIRE_MESSAGE_APPROVAL:            'require_message_approval',

  // Phase 3B-1 — Human Handoff & Follow-Up Accountability (future, disabled by default)
  OUTLOOK_MONITORING_ENABLED:              'outlook_monitoring_enabled',
  CALENDAR_MONITORING_ENABLED:             'calendar_monitoring_enabled',
  FOLLOW_UP_ACCOUNTABILITY_ENABLED:        'follow_up_accountability_enabled',
  FOLLOW_UP_AUTO_TASK_CREATION_ENABLED:    'follow_up_auto_task_creation_enabled',
  FOLLOW_UP_ESCALATIONS_ENABLED:           'follow_up_escalations_enabled',

  // Manual Campaign Mode — disabled by default until per-sequence sender is wired
  CAMPAIGN_SCHEDULER_ENABLED:              'campaign_scheduler_enabled',
  // Manual Campaign Mode — approval routing; disabled by default
  CAMPAIGN_APPROVAL_ROUTING_ENABLED:       'campaign_approval_routing_enabled',
  // Manual Campaign Mode — send dispatch; disabled by default
  CAMPAIGN_SEND_DISPATCH_ENABLED:          'campaign_send_dispatch_enabled',
} as const
export type SystemControlKey = typeof SystemControlKey[keyof typeof SystemControlKey]

// ---- Recommendation outcome status ----

export const RecommendationOutcomeStatus = {
  PENDING:    'pending',
  ACCEPTED:   'accepted',
  ACTED_ON:   'acted_on',    // recommendation was acted upon (email sent, approval given, etc.)
  REJECTED:   'rejected',
  EXPIRED:    'expired',
  DISMISSED:  'dismissed',
  SUPERSEDED: 'superseded',
} as const
export type RecommendationOutcomeStatus =
  typeof RecommendationOutcomeStatus[keyof typeof RecommendationOutcomeStatus]

// ---- Activity event types ----

export const ActivityEventType = {
  // Phase 3A — agent lifecycle (internal operational signals)
  AGENT_RUN_STARTED:             'agent_run_started',
  AGENT_RUN_COMPLETED:           'agent_run_completed',
  AGENT_RUN_FAILED:              'agent_run_failed',
  COMPANY_SCORED:                'company_scored',
  RECOMMENDATION_GENERATED:      'recommendation_generated',
  RECOMMENDATION_TASK_CREATED:   'recommendation_task_created',

  // Phase 3A — recommendation lifecycle
  RECOMMENDATION_COMPLETED:    'recommendation_completed',

  // Phase 3A — email quality
  EMAIL_QUALITY_REVIEWED:      'email_quality_reviewed',

  // Phase 3A — system controls audit trail
  SYSTEM_CONTROL_UPDATED:      'system_control_updated',

  // Phase 3A — document vault signals
  DOCUMENT_LINKED_TO_COMPANY:  'document_linked_to_company',
  PROPOSAL_GENERATED:          'proposal_generated',
  ANALYSIS_REPORT_GENERATED:   'analysis_report_generated',

  // Phase 3A — intake and CRM signals
  STATEMENT_UPLOADED:   'statement_uploaded',
  FORM_SUBMITTED:       'form_submitted',
  EMAIL_OPENED:         'email_opened',
  EMAIL_CLICKED:        'email_clicked',
  EMAIL_BOUNCED:        'email_bounced',
  PROPOSAL_SENT:        'proposal_sent',
  PROPOSAL_APPROVED:    'proposal_approved',
  PROPOSAL_REJECTED:    'proposal_rejected',
  PAGE_VIEW:            'page_view',
  LINK_CLICKED:         'link_clicked',
  CHAT_STARTED:         'chat_started',
  CALENDLY_BOOKED:      'calendly_booked',
  LEAD_STAGE_CHANGED:   'lead_stage_changed',

  // Phase 3A — manual campaign assignment
  MANUAL_CAMPAIGN_DRAFT_CREATED:    'manual_campaign_draft_created',

  // Phase 3A — email rewrite loop
  EMAIL_REWRITE_LOOP_COMPLETED:     'email_rewrite_loop_completed',
  EMAIL_BEST_REWRITE_APPLIED:        'email_best_rewrite_applied',
  EMAIL_REWRITE_VERSION_APPLIED:     'email_rewrite_version_applied',

  // Phase 3B — Revenue Learning Engine
  MESSAGE_STRATEGY_GENERATED:      'message_strategy_generated',
  MESSAGE_STRATEGY_APPROVED:        'message_strategy_approved',
  MESSAGE_STRATEGY_OVERRIDDEN:      'message_strategy_overridden',
  MESSAGE_VERSIONS_GENERATED:       'message_versions_generated',

  // Phase 3B-1 — Human Handoff & Follow-Up Accountability (future)
  OUTLOOK_EMAIL_SENT:                'outlook_email_sent',
  OUTLOOK_EMAIL_RECEIVED:            'outlook_email_received',
  OUTLOOK_REPLY_DETECTED:            'outlook_reply_detected',
  CALENDAR_MEETING_CREATED:          'calendar_meeting_created',
  CALENDAR_MEETING_COMPLETED:        'calendar_meeting_completed',
  HUMAN_HANDOFF_DETECTED:            'human_handoff_detected',
  FOLLOW_UP_OBLIGATION_CREATED:      'follow_up_obligation_created',
  FOLLOW_UP_OBLIGATION_COMPLETED:    'follow_up_obligation_completed',
  FOLLOW_UP_OBLIGATION_MISSED:       'follow_up_obligation_missed',
  FOLLOW_UP_ESCALATED:               'follow_up_escalated',

  // Phase 3B — Quality Review Agent
  QUALITY_REVIEW_COMPLETED:          'quality_review_completed',
  QUALITY_REVIEW_NO_RECOMMENDATION:  'quality_review_no_recommendation',

  // Phase 3B — Human Review / Approval Bridge (additive)
  HRB_ACTION_SELECTED:               'HRB_ACTION_SELECTED',
  HRB_ACTION_DESELECTED:             'HRB_ACTION_DESELECTED',
  HRB_ACTION_REJECTED:               'HRB_ACTION_REJECTED',
  HRB_ACTION_APPROVED:               'HRB_ACTION_APPROVED',
  HRB_ACTION_REGENERATION_REQUESTED: 'HRB_ACTION_REGENERATION_REQUESTED',
  HRB_ACTION_RETURNED_TO_STRATEGY:   'HRB_ACTION_RETURNED_TO_STRATEGY',

  // Phase 3B — Send / Email Draft Bridge (additive)
  SEB_ACTION_DRAFT_CREATED:          'SEB_ACTION_DRAFT_CREATED',
  SEB_ACTION_DRAFT_CREATION_BLOCKED: 'SEB_ACTION_DRAFT_CREATION_BLOCKED',

  // Phase 3B — Event Tracking / Send Outcome Tracking (additive)
  ET_SEND_INITIATED:        'ET_SEND_INITIATED',
  ET_SEND_SUCCEEDED:        'ET_SEND_SUCCEEDED',
  ET_SEND_FAILED:           'ET_SEND_FAILED',
  ET_EMAIL_DELIVERED:       'ET_EMAIL_DELIVERED',
  ET_EMAIL_BOUNCED:         'ET_EMAIL_BOUNCED',
  ET_EMAIL_COMPLAINED:      'ET_EMAIL_COMPLAINED',
  ET_EMAIL_DELIVERY_FAILED: 'ET_EMAIL_DELIVERY_FAILED',
  ET_EMAIL_OPENED:          'ET_EMAIL_OPENED',
  ET_EMAIL_CLICKED:         'ET_EMAIL_CLICKED',

  // Phase 3B — Learning Agent (additive)
  LA_SIGNALS_COMPUTED:           'LA_SIGNALS_COMPUTED',
  LA_SIGNALS_COMPUTATION_FAILED: 'LA_SIGNALS_COMPUTATION_FAILED',

  // Phase 3B.2 — Data Import Foundation (additive)
  IMPORT_BATCH_CREATED:        'IMPORT_BATCH_CREATED',
  IMPORT_FILE_PARSED:          'IMPORT_FILE_PARSED',
  IMPORT_VALIDATION_COMPLETED: 'IMPORT_VALIDATION_COMPLETED',
  IMPORT_DUPLICATES_DETECTED:  'IMPORT_DUPLICATES_DETECTED',
  IMPORT_APPROVED:             'IMPORT_APPROVED',
  IMPORT_COMMIT_STARTED:       'IMPORT_COMMIT_STARTED',
  IMPORT_COMMIT_COMPLETED:     'IMPORT_COMMIT_COMPLETED',
  IMPORT_COMMIT_FAILED:        'IMPORT_COMMIT_FAILED',
  IMPORT_CANCELED:             'IMPORT_CANCELED',

  // Phase 3C.1 — System Intelligence (additive)
  SYSTEM_ERROR_DIAGNOSIS:           'SYSTEM_ERROR_DIAGNOSIS',
  SYSTEM_WORKFLOW_RECOMMENDATION:   'SYSTEM_WORKFLOW_RECOMMENDATION',
  SYSTEM_PERFORMANCE_WARNING:       'SYSTEM_PERFORMANCE_WARNING',
  SYSTEM_IMPORT_HEALTH:             'SYSTEM_IMPORT_HEALTH',
  SYSTEM_DOCUMENTATION_NEEDED:      'SYSTEM_DOCUMENTATION_NEEDED',

  // Phase 3C.2 — Structured Error Lifecycle (additive)
  SE_ERROR_RESOLVED:      'SE_ERROR_RESOLVED',
  SE_ERROR_INVESTIGATING: 'SE_ERROR_INVESTIGATING',
  SE_ERROR_IGNORED:       'SE_ERROR_IGNORED',
  SE_REC_DISMISSED:       'SE_REC_DISMISSED',

  // Phase 3C.3 — System Recommendation Generator (additive)
  SYSTEM_REC_GENERATOR_RUN:    'SYSTEM_REC_GENERATOR_RUN',
  SYSTEM_REC_GENERATOR_FAILED: 'SYSTEM_REC_GENERATOR_FAILED',

  // Phase 3K — Campaign asset draft creation
  CAMPAIGN_ASSET_DRAFT_CREATED: 'campaign_asset_draft_created',

  // Phase 3M — Campaign Work Queue & Assignment-to-Draft Linkage (additive)
  CAMPAIGN_DRAFT_CREATED_FROM_ASSIGNMENT: 'campaign_draft_created_from_assignment',

  // Phase 3L — Campaign Assignment Model (additive)
  CAMPAIGN_ASSIGNED:               'campaign_assigned',
  CAMPAIGN_ASSIGNMENT_PROPOSED:    'campaign_assignment_proposed',
  CAMPAIGN_ASSIGNMENT_APPROVED:    'campaign_assignment_approved',
  CAMPAIGN_ASSIGNMENT_REJECTED:    'campaign_assignment_rejected',
  CAMPAIGN_ASSIGNMENT_PAUSED:      'campaign_assignment_paused',
  CAMPAIGN_ASSIGNMENT_RESUMED:     'campaign_assignment_resumed',
  CAMPAIGN_ASSIGNMENT_RETIRED:     'campaign_assignment_retired',
  CAMPAIGN_ASSIGNMENT_COMPLETED:   'campaign_assignment_completed',

  // Phase 3N — Proposal Capture & Follow-Up (additive)
  // Note: PROPOSAL_SENT/PROPOSAL_APPROVED/PROPOSAL_REJECTED exist above (Phase 3A, AI-generated
  // proposals). These constants use distinct identifiers for the Phase 3N capture pipeline.
  PROPOSAL_SENT_RECORDED:       'proposal_sent_recorded',
  PROPOSAL_CAPTURE_INGESTED:    'proposal_capture_ingested',
  PROPOSAL_CAPTURE_MATCHED:     'proposal_capture_matched',
  PROPOSAL_CAPTURE_REVIEWED:    'proposal_capture_reviewed',
  PROPOSAL_STATUS_UPDATED:      'proposal_status_updated',
  PROPOSAL_FOLLOW_UP_CREATED:      'proposal_follow_up_created',
  PROPOSAL_FOLLOW_UP_COMPLETED:    'proposal_follow_up_completed',
  PROPOSAL_FOLLOW_UP_SKIPPED:      'proposal_follow_up_skipped',
  PROPOSAL_FOLLOW_UP_RESCHEDULED:  'proposal_follow_up_rescheduled',

  // Phase 3S — Proposal Follow-Up Draft Generation (additive)
  PROPOSAL_FOLLOW_UP_DRAFT_CREATED:           'proposal_follow_up_draft_created',
  PROPOSAL_FOLLOW_UP_DRAFT_GENERATION_FAILED: 'proposal_follow_up_draft_generation_failed',

  // Phase 3T — Proposal Follow-Up Approved Send (additive)
  PROPOSAL_FOLLOW_UP_DRAFT_SENT: 'proposal_follow_up_draft_sent',
} as const
export type ActivityEventType = typeof ActivityEventType[keyof typeof ActivityEventType]
