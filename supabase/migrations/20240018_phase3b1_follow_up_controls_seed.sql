-- ============================================================
-- MIGRATION 20240018: PHASE 3B-1 — FOLLOW-UP ACCOUNTABILITY
-- Seeds platform-level system_controls for the future
-- Human Handoff & Follow-Up Accountability Engine.
--
-- All controls seed with value=false (disabled by default).
-- is_enabled=true means the control row is active/visible in UI.
-- No integration, webhook, service, or table is created here.
--
-- Activation requires:
--   1. Legal/compliance review
--   2. Written employee disclosure
--   3. Workspace admin sign-off
--   4. Microsoft 365 admin approval for Graph OAuth registration
-- ============================================================

INSERT INTO system_controls (tenant_id, key, label, description, value, is_enabled, scope)
VALUES
  (
    NULL,
    'outlook_monitoring_enabled',
    'Outlook Monitoring',
    'Gates all Microsoft Graph / Outlook email signal ingestion. Disabled by default. Requires legal review and employee disclosure before activation.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'calendar_monitoring_enabled',
    'Calendar Monitoring',
    'Gates Microsoft Graph calendar event monitoring. Disabled by default. Only metadata (participants, time) is read — no event body content.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'follow_up_accountability_enabled',
    'Follow-Up Accountability',
    'Controls whether Verian creates follow-up obligations when human handoff signals are detected. Requires outlook_monitoring_enabled or calendar_monitoring_enabled.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'follow_up_auto_task_creation_enabled',
    'Follow-Up Auto Task Creation',
    'Controls whether Verian automatically creates CRM tasks from follow-up obligations. Requires follow_up_accountability_enabled.',
    'false', true, 'platform'
  ),
  (
    NULL,
    'follow_up_escalations_enabled',
    'Follow-Up Escalations',
    'Controls whether missed follow-up obligations trigger escalation notifications to workspace admins. Requires follow_up_accountability_enabled.',
    'false', true, 'platform'
  )
ON CONFLICT (key) WHERE tenant_id IS NULL DO NOTHING;
