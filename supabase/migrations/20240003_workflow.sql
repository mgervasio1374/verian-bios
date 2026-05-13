-- ============================================================
-- MIGRATION 003: WORKFLOW / RUNTIME LAYER
-- system_events, event_dispatch_queue, workflow_runs,
-- job_executions, approval_requests, webhook_events,
-- automation_failures, notification_queue
-- ============================================================

-- -------------------------------------------------------
-- SYSTEM EVENTS (immutable event log)
-- -------------------------------------------------------
CREATE TABLE system_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid REFERENCES workspaces(id),
  event_type       text NOT NULL,
  event_version    text NOT NULL DEFAULT 'v1',
  payload          jsonb NOT NULL DEFAULT '{}',
  source           text,
  actor_id         uuid,
  subject_type     text,
  subject_id       uuid,
  idempotency_key  text UNIQUE,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_events_tenant ON system_events(tenant_id, event_type, occurred_at DESC);
CREATE INDEX idx_system_events_subject ON system_events(tenant_id, subject_type, subject_id);

-- -------------------------------------------------------
-- EVENT DISPATCH QUEUE (outbox pattern)
-- -------------------------------------------------------
CREATE TABLE event_dispatch_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid REFERENCES workspaces(id),
  event_type       text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}',
  idempotency_key  text UNIQUE NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  dispatched_at    timestamptz,
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_dispatch_pending ON event_dispatch_queue(status, created_at)
  WHERE status = 'pending';

-- -------------------------------------------------------
-- WORKFLOW RUNS
-- -------------------------------------------------------
CREATE TABLE workflow_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id         uuid REFERENCES workspaces(id),
  workflow_config_id   uuid,
  trigger_event_id     uuid REFERENCES system_events(id),
  status               text NOT NULL DEFAULT 'pending',
  subject_type         text,
  subject_id           uuid,
  started_at           timestamptz,
  completed_at         timestamptz,
  failed_at            timestamptz,
  error_message        text,
  context              jsonb NOT NULL DEFAULT '{}',
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_runs_tenant ON workflow_runs(tenant_id, status, created_at DESC);
CREATE INDEX idx_workflow_runs_subject ON workflow_runs(tenant_id, subject_type, subject_id);

-- -------------------------------------------------------
-- JOB EXECUTIONS
-- -------------------------------------------------------
CREATE TABLE job_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_run_id   uuid REFERENCES workflow_runs(id),
  job_type          text NOT NULL,
  inngest_run_id    text,
  status            text NOT NULL DEFAULT 'pending',
  attempt           int NOT NULL DEFAULT 1,
  input             jsonb NOT NULL DEFAULT '{}',
  output            jsonb NOT NULL DEFAULT '{}',
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_executions_run ON job_executions(workflow_run_id);
CREATE INDEX idx_job_executions_inngest ON job_executions(inngest_run_id) WHERE inngest_run_id IS NOT NULL;

-- -------------------------------------------------------
-- APPROVAL REQUESTS
-- -------------------------------------------------------
CREATE TABLE approval_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id        uuid REFERENCES workspaces(id),
  workflow_run_id     uuid REFERENCES workflow_runs(id),
  job_execution_id    uuid REFERENCES job_executions(id),
  request_type        text NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  requested_by_system boolean NOT NULL DEFAULT true,
  assignee_id         uuid REFERENCES auth.users(id),
  subject_type        text,
  subject_id          uuid,
  payload             jsonb NOT NULL DEFAULT '{}',
  decision            jsonb NOT NULL DEFAULT '{}',
  approved_by         uuid REFERENCES auth.users(id),
  decided_at          timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER approval_requests_updated_at BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_approval_requests_tenant ON approval_requests(tenant_id, status);
CREATE INDEX idx_approval_requests_assignee ON approval_requests(assignee_id, status);

-- -------------------------------------------------------
-- WEBHOOK EVENTS (raw inbound)
-- -------------------------------------------------------
CREATE TABLE webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  source        text NOT NULL,
  event_type    text,
  headers       jsonb NOT NULL DEFAULT '{}',
  payload       jsonb NOT NULL DEFAULT '{}',
  processed     boolean NOT NULL DEFAULT false,
  processed_at  timestamptz,
  error_message text,
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(source, received_at)
  WHERE processed = false;

-- -------------------------------------------------------
-- AUTOMATION FAILURES
-- -------------------------------------------------------
CREATE TABLE automation_failures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_run_id   uuid REFERENCES workflow_runs(id),
  job_execution_id  uuid REFERENCES job_executions(id),
  failure_type      text NOT NULL,
  error_code        text,
  error_message     text,
  stack_trace       text,
  context           jsonb NOT NULL DEFAULT '{}',
  resolved          boolean NOT NULL DEFAULT false,
  resolved_by       uuid REFERENCES auth.users(id),
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_failures_tenant ON automation_failures(tenant_id, resolved);

-- -------------------------------------------------------
-- NOTIFICATION QUEUE
-- -------------------------------------------------------
CREATE TABLE notification_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id       uuid REFERENCES workspaces(id),
  recipient_id       uuid NOT NULL REFERENCES auth.users(id),
  channel            text NOT NULL,
  notification_type  text NOT NULL,
  title              text,
  body               text,
  link               text,
  read_at            timestamptz,
  sent_at            timestamptz,
  status             text NOT NULL DEFAULT 'pending',
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_queue_recipient ON notification_queue(recipient_id, status);
