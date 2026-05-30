export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string | null
          company_id: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          metadata: Json
          monthly_revenue: number | null
          name: string
          owner_id: string | null
          processor: string | null
          renewal_date: string | null
          status: string
          tags: string[] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          account_type?: string | null
          company_id?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          monthly_revenue?: number | null
          name: string
          owner_id?: string | null
          processor?: string | null
          renewal_date?: string | null
          status?: string
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          account_type?: string | null
          company_id?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          metadata?: Json
          monthly_revenue?: number | null
          name?: string
          owner_id?: string | null
          processor?: string | null
          renewal_date?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          activity_type: string
          body: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          lead_id: string | null
          metadata: Json
          occurred_at: string | null
          opportunity_id: string | null
          outcome: string | null
          performed_by: string | null
          subject: string | null
          tenant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          activity_type: string
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          performed_by?: string | null
          subject?: string | null
          tenant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          activity_type?: string
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          performed_by?: string | null
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_source: string | null
          event_summary: string | null
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json
          occurred_at: string
          properties: Json
          session_id: string | null
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_source?: string | null
          event_summary?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          properties?: Json
          session_id?: string | null
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_source?: string | null
          event_summary?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          properties?: Json
          session_id?: string | null
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_decisions: {
        Row: {
          id: string
          tenant_id: string
          workspace_id: string | null
          agent_name: string
          agent_version: string | null
          decision_type: string
          decision_status: string
          entity_type: string | null
          entity_id: string | null
          lead_id: string | null
          contact_id: string | null
          company_id: string | null
          draft_id: string | null
          recommendation_id: string | null
          campaign_id: string | null
          workflow_run_id: string | null
          ai_usage_event_id: string | null
          confidence: number | null
          recommended_action: string | null
          approval_required: boolean
          human_override: boolean
          short_reason: string | null
          input_snapshot: Json | null
          output_summary: Json | null
          learning_tags: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          workspace_id?: string | null
          agent_name: string
          agent_version?: string | null
          decision_type: string
          decision_status?: string
          entity_type?: string | null
          entity_id?: string | null
          lead_id?: string | null
          contact_id?: string | null
          company_id?: string | null
          draft_id?: string | null
          recommendation_id?: string | null
          campaign_id?: string | null
          workflow_run_id?: string | null
          ai_usage_event_id?: string | null
          confidence?: number | null
          recommended_action?: string | null
          approval_required?: boolean
          human_override?: boolean
          short_reason?: string | null
          input_snapshot?: Json | null
          output_summary?: Json | null
          learning_tags?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          workspace_id?: string | null
          agent_name?: string
          agent_version?: string | null
          decision_type?: string
          decision_status?: string
          entity_type?: string | null
          entity_id?: string | null
          lead_id?: string | null
          contact_id?: string | null
          company_id?: string | null
          draft_id?: string | null
          recommendation_id?: string | null
          campaign_id?: string | null
          workflow_run_id?: string | null
          ai_usage_event_id?: string | null
          confidence?: number | null
          recommended_action?: string | null
          approval_required?: boolean
          human_override?: boolean
          short_reason?: string | null
          input_snapshot?: Json | null
          output_summary?: Json | null
          learning_tags?: string[] | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_ai_usage_event_id_fkey"
            columns: ["ai_usage_event_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_recommendations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agent_run_id: string | null
          body: string | null
          confidence: number | null
          created_at: string
          evidence: Json
          expires_at: string | null
          id: string
          metadata: Json
          outcome: string | null
          outcome_at: string | null
          outcome_notes: string | null
          outcome_status: string | null
          priority: string
          prompt_config_id: string | null
          raw_output: Json
          reason: string | null
          recommendation_type: string
          rejected_at: string | null
          rejected_by: string | null
          requires_approval: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          source_agent: string | null
          status: string
          subject_id: string
          subject_type: string
          tenant_id: string
          title: string
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agent_run_id?: string | null
          body?: string | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          metadata?: Json
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          outcome_status?: string | null
          priority?: string
          prompt_config_id?: string | null
          raw_output?: Json
          reason?: string | null
          recommendation_type: string
          rejected_at?: string | null
          rejected_by?: string | null
          requires_approval?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          source_agent?: string | null
          status?: string
          subject_id: string
          subject_type: string
          tenant_id: string
          title: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agent_run_id?: string | null
          body?: string | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          metadata?: Json
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          outcome_status?: string | null
          priority?: string
          prompt_config_id?: string | null
          raw_output?: Json
          reason?: string | null
          recommendation_type?: string
          rejected_at?: string | null
          rejected_by?: string | null
          requires_approval?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          source_agent?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          title?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_recommendations_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recommendations_prompt_config_id_fkey"
            columns: ["prompt_config_id"]
            isOneToOne: false
            referencedRelation: "prompt_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recommendations_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recommendations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_steps: {
        Row: {
          agent_run_id: string
          completed_at: string | null
          confidence: number | null
          created_at: string
          decision_summary: string | null
          duration_ms: number | null
          error_message: string | null
          guardrail_status: string | null
          id: string
          input: Json
          input_summary: string | null
          metadata: Json
          output: Json
          output_summary: string | null
          started_at: string | null
          status: string
          step_index: number
          step_name: string
          tenant_id: string
        }
        Insert: {
          agent_run_id: string
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          decision_summary?: string | null
          duration_ms?: number | null
          error_message?: string | null
          guardrail_status?: string | null
          id?: string
          input?: Json
          input_summary?: string | null
          metadata?: Json
          output?: Json
          output_summary?: string | null
          started_at?: string | null
          status?: string
          step_index?: number
          step_name: string
          tenant_id: string
        }
        Update: {
          agent_run_id?: string
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          decision_summary?: string | null
          duration_ms?: number | null
          error_message?: string | null
          guardrail_status?: string | null
          id?: string
          input?: Json
          input_summary?: string | null
          metadata?: Json
          output?: Json
          output_summary?: string | null
          started_at?: string | null
          status?: string
          step_index?: number
          step_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_steps_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_run_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_name: string
          completed_at: string | null
          completion_tokens: number | null
          confidence: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_snapshot: Json
          killed_by: string | null
          killed_reason: string | null
          metadata: Json
          model_used: string | null
          output_snapshot: Json
          prompt_tokens: number | null
          run_type: string | null
          started_at: string
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          trigger_event: string | null
          trigger_id: string | null
          trigger_source: string | null
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          completion_tokens?: number | null
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_snapshot?: Json
          killed_by?: string | null
          killed_reason?: string | null
          metadata?: Json
          model_used?: string | null
          output_snapshot?: Json
          prompt_tokens?: number | null
          run_type?: string | null
          started_at?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          trigger_event?: string | null
          trigger_id?: string | null
          trigger_source?: string | null
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          completion_tokens?: number | null
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_snapshot?: Json
          killed_by?: string | null
          killed_reason?: string | null
          metadata?: Json
          model_used?: string | null
          output_snapshot?: Json
          prompt_tokens?: number | null
          run_type?: string | null
          started_at?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          trigger_event?: string | null
          trigger_id?: string | null
          trigger_source?: string | null
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budget_events: {
        Row: {
          id: string
          tenant_id: string
          event_type: string
          agent_name: string
          budget_level: string
          policy_id: string | null
          limit_usd: number | null
          consumed_usd: number | null
          blocked_call_context: Json | null
          lead_id: string | null
          campaign_id: string | null
          override_approved_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          event_type: string
          agent_name: string
          budget_level: string
          policy_id?: string | null
          limit_usd?: number | null
          consumed_usd?: number | null
          blocked_call_context?: Json | null
          lead_id?: string | null
          campaign_id?: string | null
          override_approved_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          event_type?: string
          agent_name?: string
          budget_level?: string
          policy_id?: string | null
          limit_usd?: number | null
          consumed_usd?: number | null
          blocked_call_context?: Json | null
          lead_id?: string | null
          campaign_id?: string | null
          override_approved_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ai_budget_policies: {
        Row: {
          id: string
          tenant_id: string
          workspace_id: string | null
          budget_level: string
          scope_key: string | null
          limit_usd: number
          warn_threshold_pct: number
          alert_threshold_pct: number
          is_active: boolean
          override_requires_approval: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          workspace_id?: string | null
          budget_level: string
          scope_key?: string | null
          limit_usd: number
          warn_threshold_pct?: number
          alert_threshold_pct?: number
          is_active?: boolean
          override_requires_approval?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          workspace_id?: string | null
          budget_level?: string
          scope_key?: string | null
          limit_usd?: number
          warn_threshold_pct?: number
          alert_threshold_pct?: number
          is_active?: boolean
          override_requires_approval?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          id: string
          tenant_id: string
          workspace_id: string | null
          agent_name: string
          feature_name: string | null
          provider: string
          model_name: string
          prompt_tokens: number | null
          completion_tokens: number | null
          total_tokens: number | null
          estimated_cost_usd: number | null
          provider_request_id: string | null
          decision_id: string | null
          related_entity_type: string | null
          related_entity_id: string | null
          lead_id: string | null
          draft_id: string | null
          campaign_id: string | null
          campaign_asset_id: string | null
          success: boolean
          error_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          workspace_id?: string | null
          agent_name: string
          feature_name?: string | null
          provider?: string
          model_name: string
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          estimated_cost_usd?: number | null
          provider_request_id?: string | null
          decision_id?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
          lead_id?: string | null
          draft_id?: string | null
          campaign_id?: string | null
          campaign_asset_id?: string | null
          success?: boolean
          error_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          workspace_id?: string | null
          agent_name?: string
          feature_name?: string | null
          provider?: string
          model_name?: string
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          estimated_cost_usd?: number | null
          provider_request_id?: string | null
          decision_id?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
          lead_id?: string | null
          draft_id?: string | null
          campaign_id?: string | null
          campaign_asset_id?: string | null
          success?: boolean
          error_reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          approved_by: string | null
          assignee_id: string | null
          created_at: string
          decided_at: string | null
          decision: Json
          expires_at: string | null
          id: string
          job_execution_id: string | null
          payload: Json
          request_type: string
          requested_by_agent: boolean
          requested_by_system: boolean
          status: string
          subject_id: string | null
          subject_type: string | null
          summary: string | null
          tenant_id: string
          updated_at: string
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          approved_by?: string | null
          assignee_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Json
          expires_at?: string | null
          id?: string
          job_execution_id?: string | null
          payload?: Json
          request_type: string
          requested_by_agent?: boolean
          requested_by_system?: boolean
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          summary?: string | null
          tenant_id: string
          updated_at?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          approved_by?: string | null
          assignee_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Json
          expires_at?: string | null
          id?: string
          job_execution_id?: string | null
          payload?: Json
          request_type?: string
          requested_by_agent?: boolean
          requested_by_system?: boolean
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          summary?: string | null
          tenant_id?: string
          updated_at?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_job_execution_id_fkey"
            columns: ["job_execution_id"]
            isOneToOne: false
            referencedRelation: "job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_links: {
        Row: {
          artifact_id: string
          created_at: string
          created_by: string | null
          id: string
          link_id: string
          link_type: string
          tenant_id: string
        }
        Insert: {
          artifact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_id: string
          link_type: string
          tenant_id: string
        }
        Update: {
          artifact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_id?: string
          link_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_links_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          artifact_id: string
          change_notes: string | null
          created_at: string
          created_by: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          storage_bucket: string
          storage_path: string
          tenant_id: string
          version_number: number
        }
        Insert: {
          artifact_id: string
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
          tenant_id: string
          version_number: number
        }
        Update: {
          artifact_id?: string
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          account_id: string | null
          artifact_type: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          current_version_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          file_size_bytes: number | null
          id: string
          is_latest: boolean
          lead_id: string | null
          metadata: Json
          mime_type: string | null
          name: string
          opportunity_id: string | null
          status: string
          storage_bucket: string
          storage_path: string | null
          subject_id: string | null
          subject_type: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
          workspace_id: string | null
        }
        Insert: {
          account_id?: string | null
          artifact_type: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          lead_id?: string | null
          metadata?: Json
          mime_type?: string | null
          name: string
          opportunity_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          account_id?: string | null
          artifact_type?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          current_version_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          lead_id?: string | null
          metadata?: Json
          mime_type?: string | null
          name?: string
          opportunity_id?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_artifacts_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_failures: {
        Row: {
          context: Json
          correlation_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          failure_type: string
          id: string
          job_execution_id: string | null
          module: string | null
          payload_snapshot: Json
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          severity: string
          stack_trace: string | null
          status: string
          tenant_id: string
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failure_type: string
          id?: string
          job_execution_id?: string | null
          module?: string | null
          payload_snapshot?: Json
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          tenant_id: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failure_type?: string
          id?: string
          job_execution_id?: string | null
          module?: string | null
          payload_snapshot?: Json
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          severity?: string
          stack_trace?: string | null
          status?: string
          tenant_id?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_failures_job_execution_id_fkey"
            columns: ["job_execution_id"]
            isOneToOne: false
            referencedRelation: "job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_failures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_failures_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_profiles: {
        Row: {
          accent_color: string | null
          app_name: string | null
          created_at: string
          custom_css: string | null
          favicon_url: string | null
          font_family: string | null
          id: string
          logo_url: string | null
          metadata: Json
          primary_color: string | null
          secondary_color: string | null
          support_email: string | null
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          accent_color?: string | null
          app_name?: string | null
          created_at?: string
          custom_css?: string | null
          favicon_url?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          metadata?: Json
          primary_color?: string | null
          secondary_color?: string | null
          support_email?: string | null
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          accent_color?: string | null
          app_name?: string | null
          created_at?: string
          custom_css?: string | null
          favicon_url?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          metadata?: Json
          primary_color?: string | null
          secondary_color?: string | null
          support_email?: string | null
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branding_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_email_assets: {
        Row: {
          id: string
          tenant_id: string
          workspace_id: string | null
          campaign_type: string
          asset_name: string
          subject_template: string
          body_template_html: string
          body_template_text: string
          personalization_fields: string[]
          required_fields: string[]
          fallback_values: Json
          status: string
          llm_generated: boolean
          ai_usage_event_id: string | null
          decision_id: string | null
          approved_by: string | null
          approved_at: string | null
          performance_summary: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          workspace_id?: string | null
          campaign_type: string
          asset_name: string
          subject_template: string
          body_template_html: string
          body_template_text: string
          personalization_fields?: string[]
          required_fields?: string[]
          fallback_values?: Json
          status?: string
          llm_generated?: boolean
          ai_usage_event_id?: string | null
          decision_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          performance_summary?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          workspace_id?: string | null
          campaign_type?: string
          asset_name?: string
          subject_template?: string
          body_template_html?: string
          body_template_text?: string
          personalization_fields?: string[]
          required_fields?: string[]
          fallback_values?: Json
          status?: string
          llm_generated?: boolean
          ai_usage_event_id?: string | null
          decision_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          performance_summary?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_email_sends: {
        Row: {
          id: string
          tenant_id: string
          asset_id: string
          lead_id: string
          contact_id: string | null
          rendered_subject: string
          rendered_body_html: string | null
          rendered_body_text: string | null
          personalization_snapshot: Json
          missing_required_fields: string[] | null
          send_status: string
          email_send_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          asset_id: string
          lead_id: string
          contact_id?: string | null
          rendered_subject: string
          rendered_body_html?: string | null
          rendered_body_text?: string | null
          personalization_snapshot: Json
          missing_required_fields?: string[] | null
          send_status?: string
          email_send_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          asset_id?: string
          lead_id?: string
          contact_id?: string | null
          rendered_subject?: string
          rendered_body_html?: string | null
          rendered_body_text?: string | null
          personalization_snapshot?: Json
          missing_required_fields?: string[] | null
          send_status?: string
          email_send_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_email_sends_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "campaign_email_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      churn_risk_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "churn_risk_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_risk_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          annual_revenue: number | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          domain: string | null
          employee_count: number | null
          id: string
          industry: string | null
          metadata: Json
          name: string
          owner_id: string | null
          phone: string | null
          source: string | null
          state: string | null
          status: string
          tags: string[] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          website: string | null
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          annual_revenue?: number | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          metadata?: Json
          name: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          annual_revenue?: number | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          metadata?: Json
          name?: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      company_scores: {
        Row: {
          agent_run_id: string | null
          company_id: string
          confidence: number | null
          created_at: string
          dimensions: Json
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_type: string
          score_version: string
          scored_at: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          company_id: string
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_type: string
          score_version?: string
          scored_at?: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          company_id?: string
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_type?: string
          score_version?: string
          scored_at?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_scores_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          department: string | null
          do_not_contact: boolean
          email: string | null
          first_name: string
          id: string
          is_primary_contact: boolean
          last_name: string
          metadata: Json
          owner_id: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[] | null
          tenant_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name: string
          id?: string
          is_primary_contact?: boolean
          last_name: string
          metadata?: Json
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          tenant_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name?: string
          id?: string
          is_primary_contact?: boolean
          last_name?: string
          metadata?: Json
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          channel: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          direction: string | null
          id: string
          lead_id: string | null
          metadata: Json
          opportunity_id: string | null
          status: string
          subject: string | null
          tenant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          channel: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opportunity_id?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          channel?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          opportunity_id?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_configs: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          layout: Json
          name: string
          slug: string
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          layout?: Json
          name: string
          slug: string
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          layout?: Json
          name?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          artifact_id: string
          artifact_version_id: string | null
          created_at: string
          error_message: string | null
          extraction_type: string
          id: string
          model_used: string | null
          processed_at: string | null
          raw_text: string | null
          status: string
          structured_data: Json
          tenant_id: string
        }
        Insert: {
          artifact_id: string
          artifact_version_id?: string | null
          created_at?: string
          error_message?: string | null
          extraction_type: string
          id?: string
          model_used?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: string
          structured_data?: Json
          tenant_id: string
        }
        Update: {
          artifact_id?: string
          artifact_version_id?: string | null
          created_at?: string
          error_message?: string | null
          extraction_type?: string
          id?: string
          model_used?: string | null
          processed_at?: string | null
          raw_text?: string | null
          status?: string
          structured_data?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_artifact_version_id_fkey"
            columns: ["artifact_version_id"]
            isOneToOne: false
            referencedRelation: "artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_settings: {
        Row: {
          created_at: string
          created_by: string | null
          dns_records: Json
          domain: string
          id: string
          is_verified: boolean
          resend_domain_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dns_records?: Json
          domain: string
          id?: string
          is_verified?: boolean
          resend_domain_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dns_records?: Json
          domain?: string
          id?: string
          is_verified?: boolean
          resend_domain_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_draft_versions: {
        Row: {
          body_html: string | null
          body_text: string
          company_id: string | null
          created_at: string
          created_by_agent: boolean
          email_draft_id: string
          id: string
          improvement_from_original: number | null
          improvement_from_previous: number | null
          lead_id: string | null
          metadata: Json
          quality_review_id: string | null
          quality_score: number | null
          quality_status: string | null
          rewrite_reason: string | null
          risk_flags: Json
          strengths: Json
          subject: string
          tenant_id: string
          version_number: number
          version_type: string
          weaknesses: Json
          workspace_id: string | null
        }
        Insert: {
          body_html?: string | null
          body_text: string
          company_id?: string | null
          created_at?: string
          created_by_agent?: boolean
          email_draft_id: string
          id?: string
          improvement_from_original?: number | null
          improvement_from_previous?: number | null
          lead_id?: string | null
          metadata?: Json
          quality_review_id?: string | null
          quality_score?: number | null
          quality_status?: string | null
          rewrite_reason?: string | null
          risk_flags?: Json
          strengths?: Json
          subject: string
          tenant_id: string
          version_number: number
          version_type: string
          weaknesses?: Json
          workspace_id?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string
          company_id?: string | null
          created_at?: string
          created_by_agent?: boolean
          email_draft_id?: string
          id?: string
          improvement_from_original?: number | null
          improvement_from_previous?: number | null
          lead_id?: string | null
          metadata?: Json
          quality_review_id?: string | null
          quality_score?: number | null
          quality_status?: string | null
          rewrite_reason?: string | null
          risk_flags?: Json
          strengths?: Json
          subject?: string
          tenant_id?: string
          version_number?: number
          version_type?: string
          weaknesses?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_draft_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_draft_versions_email_draft_id_fkey"
            columns: ["email_draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_draft_versions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_draft_versions_quality_review_id_fkey"
            columns: ["quality_review_id"]
            isOneToOne: false
            referencedRelation: "email_quality_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_draft_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_draft_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drafts: {
        Row: {
          ai_generation_metadata: Json
          approval_request_id: string | null
          approved_at: string | null
          approved_by: string | null
          bcc_emails: string[] | null
          body_html: string | null
          body_text: string | null
          campaign_assignment_id: string | null
          cc_emails: string[] | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          generated_by_ai: boolean
          id: string
          lead_id: string | null
          opportunity_id: string | null
          prompt_config_id: string | null
          rejected_at: string | null
          sender_identity_id: string | null
          sent_at: string | null
          source_asset_id: string | null
          source_type: string | null
          status: string
          subject: string
          subject_id: string | null
          subject_type: string | null
          superseded_at: string | null
          template_id: string | null
          tenant_id: string
          to_email: string
          to_name: string | null
          updated_at: string
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_generation_metadata?: Json
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          campaign_assignment_id?: string | null
          cc_emails?: string[] | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          generated_by_ai?: boolean
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          prompt_config_id?: string | null
          rejected_at?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          source_asset_id?: string | null
          source_type?: string | null
          status?: string
          subject: string
          subject_id?: string | null
          subject_type?: string | null
          superseded_at?: string | null
          template_id?: string | null
          tenant_id: string
          to_email: string
          to_name?: string | null
          updated_at?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_generation_metadata?: Json
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          campaign_assignment_id?: string | null
          cc_emails?: string[] | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          generated_by_ai?: boolean
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          prompt_config_id?: string | null
          rejected_at?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          source_asset_id?: string | null
          source_type?: string | null
          status?: string
          subject?: string
          subject_id?: string | null
          subject_type?: string | null
          superseded_at?: string | null
          template_id?: string | null
          tenant_id?: string
          to_email?: string
          to_name?: string | null
          updated_at?: string
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_campaign_assignment_id_fkey"
            columns: ["campaign_assignment_id"]
            isOneToOne: false
            referencedRelation: "campaign_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_prompt_config_id_fkey"
            columns: ["prompt_config_id"]
            isOneToOne: false
            referencedRelation: "prompt_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "sender_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          created_at: string
          email_send_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider_event_id: string | null
          resend_message_id: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          email_send_id?: string | null
          event_type: string
          id?: string
          occurred_at: string
          payload?: Json
          provider_event_id?: string | null
          resend_message_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          email_send_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_event_id?: string | null
          resend_message_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_email_send_id_fkey"
            columns: ["email_send_id"]
            isOneToOne: false
            referencedRelation: "email_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_quality_reviews: {
        Row: {
          agent_run_id: string | null
          best_version_id: string | null
          best_version_number: number | null
          best_version_score: number | null
          brand_fit_score: number | null
          brevity_score: number | null
          company_id: string | null
          created_at: string
          cta_score: number | null
          email_draft_id: string
          human_tone_score: number | null
          id: string
          lead_id: string | null
          opening_score: number | null
          overall_score: number
          personalization_score: number | null
          review_summary: string | null
          rewrite_iterations: number
          rewrite_loop_status: string | null
          risk_flags: Json
          rubric_version: string
          spam_risk_score: number | null
          status: string
          strengths: Json
          subject_score: number | null
          suggested_body: string | null
          suggested_overall_score: number | null
          suggested_review_summary: string | null
          suggested_risk_flags: Json
          suggested_status: string | null
          suggested_subject: string | null
          suggested_weaknesses: Json
          target_score: number
          tenant_id: string
          trust_score: number | null
          value_clarity_score: number | null
          weaknesses: Json
          workspace_id: string | null
        }
        Insert: {
          agent_run_id?: string | null
          best_version_id?: string | null
          best_version_number?: number | null
          best_version_score?: number | null
          brand_fit_score?: number | null
          brevity_score?: number | null
          company_id?: string | null
          created_at?: string
          cta_score?: number | null
          email_draft_id: string
          human_tone_score?: number | null
          id?: string
          lead_id?: string | null
          opening_score?: number | null
          overall_score: number
          personalization_score?: number | null
          review_summary?: string | null
          rewrite_iterations?: number
          rewrite_loop_status?: string | null
          risk_flags?: Json
          rubric_version?: string
          spam_risk_score?: number | null
          status?: string
          strengths?: Json
          subject_score?: number | null
          suggested_body?: string | null
          suggested_overall_score?: number | null
          suggested_review_summary?: string | null
          suggested_risk_flags?: Json
          suggested_status?: string | null
          suggested_subject?: string | null
          suggested_weaknesses?: Json
          target_score?: number
          tenant_id: string
          trust_score?: number | null
          value_clarity_score?: number | null
          weaknesses?: Json
          workspace_id?: string | null
        }
        Update: {
          agent_run_id?: string | null
          best_version_id?: string | null
          best_version_number?: number | null
          best_version_score?: number | null
          brand_fit_score?: number | null
          brevity_score?: number | null
          company_id?: string | null
          created_at?: string
          cta_score?: number | null
          email_draft_id?: string
          human_tone_score?: number | null
          id?: string
          lead_id?: string | null
          opening_score?: number | null
          overall_score?: number
          personalization_score?: number | null
          review_summary?: string | null
          rewrite_iterations?: number
          rewrite_loop_status?: string | null
          risk_flags?: Json
          rubric_version?: string
          spam_risk_score?: number | null
          status?: string
          strengths?: Json
          subject_score?: number | null
          suggested_body?: string | null
          suggested_overall_score?: number | null
          suggested_review_summary?: string | null
          suggested_risk_flags?: Json
          suggested_status?: string | null
          suggested_subject?: string | null
          suggested_weaknesses?: Json
          target_score?: number
          tenant_id?: string
          trust_score?: number | null
          value_clarity_score?: number | null
          weaknesses?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_quality_reviews_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_quality_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_quality_reviews_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_quality_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_quality_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          draft_id: string | null
          error_message: string | null
          failure_reason: string | null
          id: string
          message_version_id: string | null
          metadata: Json
          resend_message_id: string | null
          sender_identity_id: string | null
          sent_at: string | null
          status: string
          strategy_id: string | null
          subject: string
          tenant_id: string
          to_email: string
          triggered_by: string | null
          workspace_id: string | null
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          failure_reason?: string | null
          id?: string
          message_version_id?: string | null
          metadata?: Json
          resend_message_id?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          status?: string
          strategy_id?: string | null
          subject: string
          tenant_id: string
          to_email: string
          triggered_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          failure_reason?: string | null
          id?: string
          message_version_id?: string | null
          metadata?: Json
          resend_message_id?: string | null
          sender_identity_id?: string | null
          sent_at?: string | null
          status?: string
          strategy_id?: string | null
          subject?: string
          tenant_id?: string
          to_email?: string
          triggered_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_message_version_id_fkey"
            columns: ["message_version_id"]
            isOneToOne: false
            referencedRelation: "message_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "sender_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "message_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html_template: string | null
          body_text_template: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          industry_profile_id: string | null
          is_active: boolean
          name: string
          slug: string
          subject_template: string
          template_type: string
          tenant_id: string
          updated_at: string
          variables: Json
          workspace_id: string | null
        }
        Insert: {
          body_html_template?: string | null
          body_text_template?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name: string
          slug: string
          subject_template: string
          template_type: string
          tenant_id: string
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Update: {
          body_html_template?: string | null
          body_text_template?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          subject_template?: string
          template_type?: string
          tenant_id?: string
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_industry_profile_id_fkey"
            columns: ["industry_profile_id"]
            isOneToOne: false
            referencedRelation: "industry_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_dispatch_queue: {
        Row: {
          attempts: number
          created_at: string
          dispatched_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          payload: Json
          status: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          payload?: Json
          status?: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          payload?: Json
          status?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_dispatch_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_dispatch_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_records: {
        Row: {
          artifact_id: string | null
          created_at: string
          evidence_type: string
          field_path: string | null
          id: string
          notes: string | null
          source_id: string | null
          source_type: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          value_snapshot: Json | null
          weight: number | null
          workflow_run_id: string | null
          workspace_id: string | null
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string
          evidence_type: string
          field_path?: string | null
          id?: string
          notes?: string | null
          source_id?: string | null
          source_type?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          value_snapshot?: Json | null
          weight?: number | null
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          artifact_id?: string | null
          created_at?: string
          evidence_type?: string
          field_path?: string | null
          id?: string
          notes?: string | null
          source_id?: string | null
          source_type?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          value_snapshot?: Json | null
          weight?: number | null
          workflow_run_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_records_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_entitlements: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          expires_at: string | null
          feature_slug: string
          id: string
          tenant_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          feature_slug: string
          id?: string
          tenant_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          feature_slug?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fit_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fit_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fit_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fit_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrail_events: {
        Row: {
          action_taken: string
          agent_run_id: string | null
          context: Json
          control_key: string | null
          guardrail_name: string
          guardrail_type: string
          id: string
          metadata: Json
          reason: string | null
          severity: string
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          triggered_at: string
          workspace_id: string | null
        }
        Insert: {
          action_taken: string
          agent_run_id?: string | null
          context?: Json
          control_key?: string | null
          guardrail_name: string
          guardrail_type: string
          id?: string
          metadata?: Json
          reason?: string | null
          severity?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          triggered_at?: string
          workspace_id?: string | null
        }
        Update: {
          action_taken?: string
          agent_run_id?: string | null
          context?: Json
          control_key?: string | null
          guardrail_name?: string
          guardrail_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          severity?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          triggered_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_events_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardrail_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardrail_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_profiles: {
        Row: {
          created_at: string
          description: string | null
          feature_defaults: Json
          id: string
          is_active: boolean
          name: string
          pipeline_defaults: Json
          prompt_defaults: Json
          scoring_defaults: Json
          slug: string
          updated_at: string
          workflow_defaults: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_defaults?: Json
          id?: string
          is_active?: boolean
          name: string
          pipeline_defaults?: Json
          prompt_defaults?: Json
          scoring_defaults?: Json
          slug: string
          updated_at?: string
          workflow_defaults?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_defaults?: Json
          id?: string
          is_active?: boolean
          name?: string
          pipeline_defaults?: Json
          prompt_defaults?: Json
          scoring_defaults?: Json
          slug?: string
          updated_at?: string
          workflow_defaults?: Json
        }
        Relationships: []
      }
      job_executions: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          failed_at: string | null
          id: string
          inngest_run_id: string | null
          input: Json
          job_type: string
          output: Json
          started_at: string | null
          status: string
          tenant_id: string
          workflow_run_id: string | null
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          inngest_run_id?: string | null
          input?: Json
          job_type: string
          output?: Json
          started_at?: string | null
          status?: string
          tenant_id: string
          workflow_run_id?: string | null
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          inngest_run_id?: string | null
          input?: Json
          job_type?: string
          output?: Json
          started_at?: string | null
          status?: string
          tenant_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_executions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          id: string
          tenant_id: string
          workspace_id: string
          source_type: string
          source_name: string | null
          original_filename: string | null
          uploaded_by: string
          approved_by: string | null
          status: string
          total_rows: number
          parsed_rows: number
          valid_rows: number
          invalid_rows: number
          duplicate_rows: number
          committed_rows: number
          failed_commit_rows: number
          default_lead_status: string
          default_workflow_status: string
          workflow_enabled_default: boolean
          column_mapping: Json
          metadata: Json
          created_at: string
          validated_at: string | null
          approved_at: string | null
          committed_at: string | null
          failed_at: string | null
          canceled_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          workspace_id: string
          source_type: string
          source_name?: string | null
          original_filename?: string | null
          uploaded_by: string
          approved_by?: string | null
          status?: string
          total_rows?: number
          parsed_rows?: number
          valid_rows?: number
          invalid_rows?: number
          duplicate_rows?: number
          committed_rows?: number
          failed_commit_rows?: number
          default_lead_status?: string
          default_workflow_status?: string
          workflow_enabled_default?: boolean
          column_mapping?: Json
          metadata?: Json
          created_at?: string
          validated_at?: string | null
          approved_at?: string | null
          committed_at?: string | null
          failed_at?: string | null
          canceled_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          workspace_id?: string
          source_type?: string
          source_name?: string | null
          original_filename?: string | null
          uploaded_by?: string
          approved_by?: string | null
          status?: string
          total_rows?: number
          parsed_rows?: number
          valid_rows?: number
          invalid_rows?: number
          duplicate_rows?: number
          committed_rows?: number
          failed_commit_rows?: number
          default_lead_status?: string
          default_workflow_status?: string
          workflow_enabled_default?: boolean
          column_mapping?: Json
          metadata?: Json
          created_at?: string
          validated_at?: string | null
          approved_at?: string | null
          committed_at?: string | null
          failed_at?: string | null
          canceled_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          id: string
          import_batch_id: string
          tenant_id: string
          workspace_id: string
          row_number: number
          raw_data: Json
          normalized_data: Json
          validation_status: string
          validation_errors: Json
          duplicate_status: string
          duplicate_matches: Json
          commit_status: string
          commit_error: string | null
          target_company_id: string | null
          target_contact_id: string | null
          target_lead_id: string | null
          created_at: string
          validated_at: string | null
          committed_at: string | null
        }
        Insert: {
          id?: string
          import_batch_id: string
          tenant_id: string
          workspace_id: string
          row_number: number
          raw_data?: Json
          normalized_data?: Json
          validation_status?: string
          validation_errors?: Json
          duplicate_status?: string
          duplicate_matches?: Json
          commit_status?: string
          commit_error?: string | null
          target_company_id?: string | null
          target_contact_id?: string | null
          target_lead_id?: string | null
          created_at?: string
          validated_at?: string | null
          committed_at?: string | null
        }
        Update: {
          id?: string
          import_batch_id?: string
          tenant_id?: string
          workspace_id?: string
          row_number?: number
          raw_data?: Json
          normalized_data?: Json
          validation_status?: string
          validation_errors?: Json
          duplicate_status?: string
          duplicate_matches?: Json
          commit_status?: string
          commit_error?: string | null
          target_company_id?: string | null
          target_contact_id?: string | null
          target_lead_id?: string | null
          created_at?: string
          validated_at?: string | null
          committed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_target_contact_id_fkey"
            columns: ["target_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_target_lead_id_fkey"
            columns: ["target_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          converted_at: string | null
          converted_to_opportunity_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          disqualification_reason: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          metadata: Json
          name: string
          priority: string
          source: string | null
          stage: string
          status: string
          tags: string[] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workflow_enabled: boolean
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          converted_at?: string | null
          converted_to_opportunity_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          disqualification_reason?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          metadata?: Json
          name: string
          priority?: string
          source?: string | null
          stage?: string
          status?: string
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workflow_enabled?: boolean
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          converted_at?: string | null
          converted_to_opportunity_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          disqualification_reason?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          metadata?: Json
          name?: string
          priority?: string
          source?: string | null
          stage?: string
          status?: string
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workflow_enabled?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          role_id: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          role_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          role_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          account_id: string | null
          body: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          lead_id: string | null
          opportunity_id: string | null
          pinned: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          body: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          pinned?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          body?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          pinned?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          link: string | null
          metadata: Json
          notification_type: string
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: string
          tenant_id: string
          title: string | null
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          notification_type: string
          read_at?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: string
          tenant_id: string
          title?: string | null
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
          title?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string | null
          closed_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          metadata: Json
          name: string
          owner_id: string | null
          probability: number | null
          stage: string
          status: string
          tags: string[] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          metadata?: Json
          name: string
          owner_id?: string | null
          probability?: number | null
          stage?: string
          status?: string
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          metadata?: Json
          name?: string
          owner_id?: string | null
          probability?: number | null
          stage?: string
          status?: string
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string | null
          id: string
          module: string
          slug: string
        }
        Insert: {
          description?: string | null
          id?: string
          module: string
          slug: string
        }
        Update: {
          description?: string | null
          id?: string
          module?: string
          slug?: string
        }
        Relationships: []
      }
      pipeline_stage_configs: {
        Row: {
          color: string | null
          created_at: string
          entry_conditions: Json
          exit_conditions: Json
          id: string
          industry_profile_id: string | null
          is_terminal: boolean
          name: string
          pipeline_type: string
          position: number
          slug: string
          tenant_id: string
          terminal_outcome: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          industry_profile_id?: string | null
          is_terminal?: boolean
          name: string
          pipeline_type: string
          position: number
          slug: string
          tenant_id: string
          terminal_outcome?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          entry_conditions?: Json
          exit_conditions?: Json
          id?: string
          industry_profile_id?: string | null
          is_terminal?: boolean
          name?: string
          pipeline_type?: string
          position?: number
          slug?: string
          tenant_id?: string
          terminal_outcome?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_configs_industry_profile_id_fkey"
            columns: ["industry_profile_id"]
            isOneToOne: false
            referencedRelation: "industry_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          module: string
          name: string
          priority: number
          rule_type: string
          slug: string
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module: string
          name: string
          priority?: number
          rule_type: string
          slug: string
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          priority?: number
          rule_type?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_configs: {
        Row: {
          active_version_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          industry_profile_id: string | null
          is_active: boolean
          metadata: Json
          module: string
          name: string
          purpose: string
          slug: string
          tenant_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          metadata?: Json
          module: string
          name: string
          purpose: string
          slug: string
          tenant_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          metadata?: Json
          module?: string
          name?: string
          purpose?: string
          slug?: string
          tenant_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_prompt_configs_active_version"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_configs_industry_profile_id_fkey"
            columns: ["industry_profile_id"]
            isOneToOne: false
            referencedRelation: "industry_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: string | null
          id: string
          max_tokens: number
          model: string
          prompt_config_id: string
          system_prompt: string
          temperature: number
          tenant_id: string | null
          user_prompt_template: string
          variables: Json
          version: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          max_tokens?: number
          model?: string
          prompt_config_id: string
          system_prompt: string
          temperature?: number
          tenant_id?: string | null
          user_prompt_template: string
          variables?: Json
          version: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          max_tokens?: number
          model?: string
          prompt_config_id?: string
          system_prompt?: string
          temperature?: number
          tenant_id?: string | null
          user_prompt_template?: string
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_config_id_fkey"
            columns: ["prompt_config_id"]
            isOneToOne: false
            referencedRelation: "prompt_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_captures: {
        Row: {
          attachment_names: string[] | null
          attachments_count: number
          capture_confidence: number | null
          capture_source: string
          created_at: string
          deleted_at: string | null
          id: string
          match_status: string
          matched_at: string | null
          matched_by_user_id: string | null
          matched_company_id: string | null
          matched_contact_id: string | null
          matched_lead_id: string | null
          raw_body_excerpt: string | null
          raw_message_id: string | null
          raw_received_at: string | null
          raw_recipient_email: string | null
          raw_sender_email: string | null
          raw_subject: string | null
          resolved_event_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attachment_names?: string[] | null
          attachments_count?: number
          capture_confidence?: number | null
          capture_source: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          match_status?: string
          matched_at?: string | null
          matched_by_user_id?: string | null
          matched_company_id?: string | null
          matched_contact_id?: string | null
          matched_lead_id?: string | null
          raw_body_excerpt?: string | null
          raw_message_id?: string | null
          raw_received_at?: string | null
          raw_recipient_email?: string | null
          raw_sender_email?: string | null
          raw_subject?: string | null
          resolved_event_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attachment_names?: string[] | null
          attachments_count?: number
          capture_confidence?: number | null
          capture_source?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          match_status?: string
          matched_at?: string | null
          matched_by_user_id?: string | null
          matched_company_id?: string | null
          matched_contact_id?: string | null
          matched_lead_id?: string | null
          raw_body_excerpt?: string | null
          raw_message_id?: string | null
          raw_received_at?: string | null
          raw_recipient_email?: string | null
          raw_sender_email?: string | null
          raw_subject?: string | null
          resolved_event_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_captures_matched_by_user_id_fkey"
            columns: ["matched_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_matched_company_id_fkey"
            columns: ["matched_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_resolved_event_id_fkey"
            columns: ["resolved_event_id"]
            isOneToOne: false
            referencedRelation: "proposal_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_events: {
        Row: {
          account_id: string | null
          capture_id: string | null
          capture_source: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          deleted_at: string | null
          estimated_savings: number | null
          id: string
          lead_id: string | null
          opportunity_id: string | null
          proposal_amount: number | null
          proposal_currency: string
          proposal_reference: string | null
          proposal_sent_at: string
          proposal_status: string
          sender_user_id: string | null
          tenant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          capture_id?: string | null
          capture_source: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_savings?: number | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          proposal_amount?: number | null
          proposal_currency?: string
          proposal_reference?: string | null
          proposal_sent_at: string
          proposal_status?: string
          sender_user_id?: string | null
          tenant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          capture_id?: string | null
          capture_source?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_savings?: number | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          proposal_amount?: number | null
          proposal_currency?: string
          proposal_reference?: string | null
          proposal_sent_at?: string
          proposal_status?: string
          sender_user_id?: string | null
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "proposal_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_follow_up_commitments: {
        Row: {
          assigned_to_user_id: string | null
          commitment_status: string
          completed_at: string | null
          completed_by_user_id: string | null
          completion_notes: string | null
          created_at: string
          draft_id: string | null
          follow_up_due_at: string
          follow_up_sequence: number
          id: string
          lead_id: string | null
          proposal_event_id: string
          schedule_rule_key: string
          tenant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          commitment_status?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          draft_id?: string | null
          follow_up_due_at: string
          follow_up_sequence?: number
          id?: string
          lead_id?: string | null
          proposal_event_id: string
          schedule_rule_key: string
          tenant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to_user_id?: string | null
          commitment_status?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          completion_notes?: string | null
          created_at?: string
          draft_id?: string | null
          follow_up_due_at?: string
          follow_up_sequence?: number
          id?: string
          lead_id?: string | null
          proposal_event_id?: string
          schedule_rule_key?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_follow_up_commitments_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_follow_up_commitments_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_follow_up_commitments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_follow_up_commitments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_follow_up_commitments_proposal_event_id_fkey"
            columns: ["proposal_event_id"]
            isOneToOne: false
            referencedRelation: "proposal_events"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number | null
          recommendation_id: string
          tenant_id: string
          useful: boolean | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          recommendation_id: string
          tenant_id: string
          useful?: boolean | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          recommendation_id?: string
          tenant_id?: string
          useful?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "agent_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_configs: {
        Row: {
          created_at: string
          created_by: string | null
          dimensions: Json
          id: string
          industry_profile_id: string | null
          is_active: boolean
          name: string
          prompt_config_id: string | null
          score_type: string
          slug: string
          subject_type: string
          tenant_id: string
          thresholds: Json
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name: string
          prompt_config_id?: string | null
          score_type: string
          slug: string
          subject_type: string
          tenant_id: string
          thresholds?: Json
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name?: string
          prompt_config_id?: string | null
          score_type?: string
          slug?: string
          subject_type?: string
          tenant_id?: string
          thresholds?: Json
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scoring_configs_industry_profile_id_fkey"
            columns: ["industry_profile_id"]
            isOneToOne: false
            referencedRelation: "industry_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_configs_prompt_config_id_fkey"
            columns: ["prompt_config_id"]
            isOneToOne: false
            referencedRelation: "prompt_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sender_identities: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          domain_settings_id: string | null
          email: string
          id: string
          is_default: boolean
          is_verified: boolean
          metadata: Json
          name: string
          reply_to: string | null
          resend_identity_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          domain_settings_id?: string | null
          email: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          metadata?: Json
          name: string
          reply_to?: string | null
          resend_identity_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          domain_settings_id?: string | null
          email?: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          metadata?: Json
          name?: string
          reply_to?: string | null
          resend_identity_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sender_identities_domain_settings_id_fkey"
            columns: ["domain_settings_id"]
            isOneToOne: false
            referencedRelation: "domain_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sender_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sender_identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          reason: string | null
          rule_type: string
          tenant_id: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          rule_type: string
          tenant_id: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          reason?: string | null
          rule_type?: string
          tenant_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_controls: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          label: string
          scope: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          label: string
          scope?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          label?: string
          scope?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_controls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          event_version: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload: Json
          source: string | null
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          event_version?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload?: Json
          source?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          event_version?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload?: Json
          source?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          created_by_agent: boolean
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          opportunity_id: string | null
          outcome_notes: string | null
          priority: string
          recommendation_id: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_agent?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          outcome_notes?: string | null
          priority?: string
          recommendation_id?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_agent?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          outcome_notes?: string | null
          priority?: string
          recommendation_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "agent_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          industry_type: string | null
          metadata: Json
          name: string
          plan_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry_type?: string | null
          metadata?: Json
          name: string
          plan_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry_type?: string | null
          metadata?: Json
          name?: string
          plan_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      unsubscribes: {
        Row: {
          created_at: string
          email: string
          email_send_id: string | null
          id: string
          reason: string | null
          source: string | null
          tenant_id: string
          unsubscribed_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_send_id?: string | null
          id?: string
          reason?: string | null
          source?: string | null
          tenant_id: string
          unsubscribed_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_send_id?: string | null
          id?: string
          reason?: string | null
          source?: string | null
          tenant_id?: string
          unsubscribed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unsubscribes_email_send_id_fkey"
            columns: ["email_send_id"]
            isOneToOne: false
            referencedRelation: "email_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unsubscribes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      urgency_scores: {
        Row: {
          confidence: number | null
          created_at: string
          dimensions: Json
          generated_at: string | null
          id: string
          is_current: boolean
          model_used: string | null
          reasoning: string | null
          score: number
          score_version: string
          scoring_config_id: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dimensions?: Json
          generated_at?: string | null
          id?: string
          is_current?: boolean
          model_used?: string | null
          reasoning?: string | null
          score?: number
          score_version?: string
          scoring_config_id?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "urgency_scores_scoring_config_id_fkey"
            columns: ["scoring_config_id"]
            isOneToOne: false
            referencedRelation: "scoring_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urgency_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error_message: string | null
          event_type: string | null
          headers: Json
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          received_at: string
          source: string
          tenant_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_type?: string | null
          headers?: Json
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          source: string
          tenant_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_type?: string | null
          headers?: Json
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          source?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_configs: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          industry_profile_id: string | null
          is_active: boolean
          name: string
          requires_approval: boolean
          slug: string
          steps: Json
          tenant_id: string
          trigger_event: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name: string
          requires_approval?: boolean
          slug: string
          steps?: Json
          tenant_id: string
          trigger_event: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          industry_profile_id?: string | null
          is_active?: boolean
          name?: string
          requires_approval?: boolean
          slug?: string
          steps?: Json
          tenant_id?: string
          trigger_event?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_configs_industry_profile_id_fkey"
            columns: ["industry_profile_id"]
            isOneToOne: false
            referencedRelation: "industry_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          metadata: Json
          started_at: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          trigger_event_id: string | null
          workflow_config_id: string | null
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          trigger_event_id?: string | null
          workflow_config_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          trigger_event_id?: string | null
          workflow_config_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "system_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          metadata: Json
          name: string
          slug: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          metadata?: Json
          name: string
          slug: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          metadata?: Json
          name?: string
          slug?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_workspace_ids: { Args: never; Returns: string[] }
      current_role_slug: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      current_workspace_id: { Args: never; Returns: string }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      upsert_current_score: {
        Args: {
          p_confidence?: number
          p_dimensions?: Json
          p_model_used?: string
          p_reasoning?: string
          p_score: number
          p_score_version?: string
          p_scoring_config_id?: string
          p_subject_id: string
          p_subject_type: string
          p_table: string
          p_tenant_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
