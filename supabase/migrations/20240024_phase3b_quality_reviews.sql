-- Phase 3B: Quality Reviews table
-- Produced by the Quality Review Agent (evaluation-only, advisory signals).

create table if not exists public.quality_reviews (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants(id) on delete cascade,
  strategy_id                     uuid not null references public.message_strategies(id) on delete cascade,
  version_id                      uuid not null references public.message_versions(id) on delete cascade,
  lead_id                         uuid not null references public.leads(id) on delete cascade,
  company_id                      uuid references public.companies(id) on delete set null,
  campaign_id                     uuid,
  agent_run_id                    uuid references public.agent_runs(id) on delete set null,

  message_type                    text not null,
  version_label                   text not null,
  strategy_angle                  text not null,

  composite_score                 integer not null default 0,
  score_band                      text not null default 'needs_review',
  rank_position                   integer not null default 1,
  is_recommended                  boolean not null default false,

  strategic_fit_score             integer not null default 0,
  compliance_confidence_score     integer not null default 0,
  cta_clarity_score               integer not null default 0,
  specificity_score               integer not null default 0,
  tone_fit_score                  integer not null default 0,
  differentiation_score           integer not null default 0,
  subject_body_consistency_score  integer not null default 0,
  readability_score               integer not null default 0,
  risk_score                      integer not null default 0,

  score_breakdown                 jsonb not null default '{}',
  scoring_reasoning               jsonb not null default '{}',

  strengths                       text[] not null default '{}',
  weaknesses                      text[] not null default '{}',
  risk_flags                      jsonb not null default '[]',
  compliance_flags                jsonb not null default '[]',

  human_review_notes              text,
  recommended_edits               text[] not null default '{}',
  compared_against_version_ids    uuid[] not null default '{}',
  comparison_summary              text not null default '',

  superseded_at                   timestamptz,
  created_by_agent                text not null default 'quality_review_agent',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Indexes
create index if not exists idx_quality_reviews_tenant_strategy
  on public.quality_reviews(tenant_id, strategy_id);

create index if not exists idx_quality_reviews_tenant_version
  on public.quality_reviews(tenant_id, version_id);

create index if not exists idx_quality_reviews_tenant_recommended
  on public.quality_reviews(tenant_id, is_recommended);

create index if not exists idx_quality_reviews_tenant_band
  on public.quality_reviews(tenant_id, score_band);

create index if not exists idx_quality_reviews_strategy_rank
  on public.quality_reviews(strategy_id, rank_position);

create index if not exists idx_quality_reviews_agent_run
  on public.quality_reviews(agent_run_id);

-- RLS
alter table public.quality_reviews enable row level security;

create policy "tenant_isolation_select" on public.quality_reviews
  for select using (tenant_id = public.current_tenant_id());

-- Trigger
create trigger set_quality_reviews_updated_at
  before update on public.quality_reviews
  for each row execute function public.update_updated_at();
