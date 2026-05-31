export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  decision_ledger: {
    Tables: {
      agent_runs: {
        Row: {
          action_id: string | null
          agent_type: string
          artifacts: Json
          error_message: string | null
          finished_at: string | null
          goal_id: string | null
          id: string
          input_summary: string | null
          metadata: Json
          output_summary: string | null
          run_status: string
          started_at: string
        }
        Insert: {
          action_id?: string | null
          agent_type: string
          artifacts?: Json
          error_message?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          input_summary?: string | null
          metadata?: Json
          output_summary?: string | null
          run_status?: string
          started_at?: string
        }
        Update: {
          action_id?: string | null
          agent_type?: string
          artifacts?: Json
          error_message?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          input_summary?: string | null
          metadata?: Json
          output_summary?: string | null
          run_status?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pr_worker_runs: {
        Row: {
          action_id: string
          branch_name: string | null
          codex_session_id: string | null
          error_log: string | null
          finished_at: string | null
          metadata: Json
          pr_url: string | null
          run_id: string
          started_at: string
          status: string
          worker_subject: string
        }
        Insert: {
          action_id: string
          branch_name?: string | null
          codex_session_id?: string | null
          error_log?: string | null
          finished_at?: string | null
          metadata?: Json
          pr_url?: string | null
          run_id?: string
          started_at?: string
          status?: string
          worker_subject?: string
        }
        Update: {
          action_id?: string
          branch_name?: string | null
          codex_session_id?: string | null
          error_log?: string | null
          finished_at?: string | null
          metadata?: Json
          pr_url?: string | null
          run_id?: string
          started_at?: string
          status?: string
          worker_subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pr_worker_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_gates: {
        Row: {
          action_id: string | null
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          gate_type: string
          goal_id: string | null
          id: string
          metadata: Json
          reason: string | null
          requested_at: string
          requested_by: string
          status: string
        }
        Insert: {
          action_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          gate_type?: string
          goal_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Update: {
          action_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          gate_type?: string
          goal_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_gates_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_gates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_runs: {
        Row: {
          action_id: string | null
          agent_run_id: string | null
          details: Json
          evaluated_at: string
          evaluator: string
          fail_reasons: string[]
          goal_id: string | null
          id: string
          max_score: number
          rubric_ref: string | null
          score: number | null
          verdict: string
        }
        Insert: {
          action_id?: string | null
          agent_run_id?: string | null
          details?: Json
          evaluated_at?: string
          evaluator?: string
          fail_reasons?: string[]
          goal_id?: string | null
          id?: string
          max_score?: number
          rubric_ref?: string | null
          score?: number | null
          verdict?: string
        }
        Update: {
          action_id?: string | null
          agent_run_id?: string | null
          details?: Json
          evaluated_at?: string
          evaluator?: string
          fail_reasons?: string[]
          goal_id?: string | null
          id?: string
          max_score?: number
          rubric_ref?: string | null
          score?: number | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_runs_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_runs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contexts: {
        Row: {
          content: string
          created_at: string
          freshness_at: string | null
          goal_id: string
          id: string
          metadata: Json
          node_id: string | null
          source_type: string
          source_uri: string | null
        }
        Insert: {
          content: string
          created_at?: string
          freshness_at?: string | null
          goal_id: string
          id?: string
          metadata?: Json
          node_id?: string | null
          source_type: string
          source_uri?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          freshness_at?: string | null
          goal_id?: string
          id?: string
          metadata?: Json
          node_id?: string | null
          source_type?: string
          source_uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_contexts_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contexts_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "goal_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_node_lesson_matches: {
        Row: {
          coverage_snapshot_id: string | null
          created_at: string
          goal_node_id: string
          id: string
          lesson_id: string
          lesson_version_id: string | null
          rationale: string | null
          score: number
          selected: boolean
        }
        Insert: {
          coverage_snapshot_id?: string | null
          created_at?: string
          goal_node_id: string
          id?: string
          lesson_id: string
          lesson_version_id?: string | null
          rationale?: string | null
          score: number
          selected?: boolean
        }
        Update: {
          coverage_snapshot_id?: string | null
          created_at?: string
          goal_node_id?: string
          id?: string
          lesson_id?: string
          lesson_version_id?: string | null
          rationale?: string | null
          score?: number
          selected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "goal_node_lesson_matches_goal_node_id_fkey"
            columns: ["goal_node_id"]
            isOneToOne: false
            referencedRelation: "goal_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_nodes: {
        Row: {
          created_at: string
          depends_on_node_ids: string[]
          fallback_node_id: string | null
          goal_id: string
          id: string
          label: string
          metadata: Json
          node_type: string
          owner_type: Database["decision_ledger"]["Enums"]["owner_type_enum"]
          parent_node_id: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          depends_on_node_ids?: string[]
          fallback_node_id?: string | null
          goal_id: string
          id?: string
          label: string
          metadata?: Json
          node_type?: string
          owner_type?: Database["decision_ledger"]["Enums"]["owner_type_enum"]
          parent_node_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          depends_on_node_ids?: string[]
          fallback_node_id?: string | null
          goal_id?: string
          id?: string
          label?: string
          metadata?: Json
          node_type?: string
          owner_type?: Database["decision_ledger"]["Enums"]["owner_type_enum"]
          parent_node_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_nodes_fallback_node_id_fkey"
            columns: ["fallback_node_id"]
            isOneToOne: false
            referencedRelation: "goal_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_nodes_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "goal_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          metadata: Json
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lesson_dev_proposals: {
        Row: {
          candidate_lesson_slug: string | null
          capability_slug: string
          evidence: Json
          gap_ids: string[]
          id: string
          metadata: Json
          outcome_slug: string
          owner_approval: Database["decision_ledger"]["Enums"]["owner_approval_state"]
          owner_review_reason: string | null
          owner_reviewed_at: string | null
          owner_reviewed_by: string | null
          priority: string
          proposed_at: string
          proposed_by: string
          rationale: string | null
          status: string
          updated_at: string
          weakest_axis: string
        }
        Insert: {
          candidate_lesson_slug?: string | null
          capability_slug: string
          evidence?: Json
          gap_ids?: string[]
          id?: string
          metadata?: Json
          outcome_slug?: string
          owner_approval?: Database["decision_ledger"]["Enums"]["owner_approval_state"]
          owner_review_reason?: string | null
          owner_reviewed_at?: string | null
          owner_reviewed_by?: string | null
          priority?: string
          proposed_at?: string
          proposed_by?: string
          rationale?: string | null
          status?: string
          updated_at?: string
          weakest_axis: string
        }
        Update: {
          candidate_lesson_slug?: string | null
          capability_slug?: string
          evidence?: Json
          gap_ids?: string[]
          id?: string
          metadata?: Json
          outcome_slug?: string
          owner_approval?: Database["decision_ledger"]["Enums"]["owner_approval_state"]
          owner_review_reason?: string | null
          owner_reviewed_at?: string | null
          owner_reviewed_by?: string | null
          priority?: string
          proposed_at?: string
          proposed_by?: string
          rationale?: string | null
          status?: string
          updated_at?: string
          weakest_axis?: string
        }
        Relationships: []
      }
      lesson_gaps: {
        Row: {
          action_id: string
          blocker_score: number | null
          capability_score: number | null
          detected_at: string
          evidence: Json
          evidence_score: number | null
          goal_id: string | null
          id: string
          metadata: Json
          prerequisite_score: number | null
          score: number
          status: string
          top_mappings: Json
          updated_at: string
          weakest_axis: string
        }
        Insert: {
          action_id: string
          blocker_score?: number | null
          capability_score?: number | null
          detected_at?: string
          evidence?: Json
          evidence_score?: number | null
          goal_id?: string | null
          id?: string
          metadata?: Json
          prerequisite_score?: number | null
          score: number
          status?: string
          top_mappings?: Json
          updated_at?: string
          weakest_axis: string
        }
        Update: {
          action_id?: string
          blocker_score?: number | null
          capability_score?: number | null
          detected_at?: string
          evidence?: Json
          evidence_score?: number | null
          goal_id?: string | null
          id?: string
          metadata?: Json
          prerequisite_score?: number | null
          score?: number
          status?: string
          top_mappings?: Json
          updated_at?: string
          weakest_axis?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_gaps_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposed_actions: {
        Row: {
          action_type: string
          description: string | null
          estimated_effort_hours: number | null
          goal_id: string
          id: string
          metadata: Json
          node_id: string | null
          owner_approval: Database["decision_ledger"]["Enums"]["owner_approval"]
          priority: string
          proposed_at: string
          proposed_by: string
          rationale: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          description?: string | null
          estimated_effort_hours?: number | null
          goal_id: string
          id?: string
          metadata?: Json
          node_id?: string | null
          owner_approval?: Database["decision_ledger"]["Enums"]["owner_approval"]
          priority?: string
          proposed_at?: string
          proposed_by?: string
          rationale?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          description?: string | null
          estimated_effort_hours?: number | null
          goal_id?: string
          id?: string
          metadata?: Json
          node_id?: string | null
          owner_approval?: Database["decision_ledger"]["Enums"]["owner_approval"]
          priority?: string
          proposed_at?: string
          proposed_by?: string
          rationale?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposed_actions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposed_actions_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "goal_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          action_id: string
          assignee_ref: string | null
          assignee_type: string
          confidence: number | null
          dry_run: boolean
          due_at: string | null
          goal_id: string
          id: string
          metadata: Json
          scheduled_at: string
          scheduled_by: string
        }
        Insert: {
          action_id: string
          assignee_ref?: string | null
          assignee_type?: string
          confidence?: number | null
          dry_run?: boolean
          due_at?: string | null
          goal_id: string
          id?: string
          metadata?: Json
          scheduled_at?: string
          scheduled_by?: string
        }
        Update: {
          action_id?: string
          assignee_ref?: string | null
          assignee_type?: string
          confidence?: number | null
          dry_run?: boolean
          due_at?: string | null
          goal_id?: string
          id?: string
          metadata?: Json
          scheduled_at?: string
          scheduled_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "proposed_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_owner_pending_lesson_proposals: {
        Row: {
          candidate_lesson_slug: string | null
          capability_slug: string | null
          gap_ids: string[] | null
          gate_id: string | null
          gate_metadata: Json | null
          gate_status: string | null
          outcome_slug: string | null
          owner_approval:
            | Database["decision_ledger"]["Enums"]["owner_approval_state"]
            | null
          priority: string | null
          proposal_id: string | null
          proposal_status: string | null
          rationale: string | null
          requested_at: string | null
          weakest_axis: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_ai_pr_worker_run: {
        Args: {
          p_action_id: string
          p_branch_name?: string
          p_codex_session_id?: string
          p_error_log?: string
          p_finished_at?: string
          p_metadata?: Json
          p_pr_url?: string
          p_requested_status: string
          p_worker_subject?: string
        }
        Returns: {
          action_id: string
          branch_name: string | null
          codex_session_id: string | null
          error_log: string | null
          finished_at: string | null
          metadata: Json
          pr_url: string | null
          run_id: string
          started_at: string
          status: string
          worker_subject: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_pr_worker_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_lesson_proposal: {
        Args: { p_decision: string; p_gate_id: string; p_reason?: string }
        Returns: {
          action_id: string | null
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          gate_type: string
          goal_id: string | null
          id: string
          metadata: Json
          reason: string | null
          requested_at: string
          requested_by: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_gates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_lesson_proposal: {
        Args: { p_gate_id: string; p_reason: string }
        Returns: {
          action_id: string | null
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          gate_type: string
          goal_id: string | null
          id: string
          metadata: Json
          reason: string | null
          requested_at: string
          requested_by: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_gates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_action_backlink: {
        Args: { p_action_id: string; p_backlink: Json }
        Returns: {
          action_type: string
          description: string | null
          estimated_effort_hours: number | null
          goal_id: string
          id: string
          metadata: Json
          node_id: string | null
          owner_approval: Database["decision_ledger"]["Enums"]["owner_approval"]
          priority: string
          proposed_at: string
          proposed_by: string
          rationale: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "proposed_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      owner_approval: "pending" | "approved" | "rejected"
      owner_approval_state:
        | "auto"
        | "pending_owner_review"
        | "approved"
        | "rejected"
        | "blocked"
      owner_type_enum: "user" | "ai" | "both" | "external" | "blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_response_feedback: {
        Row: {
          assistant_message_preview: string | null
          chat_context: string
          comment: string | null
          context_id: string | null
          created_at: string
          id: string
          message_id: string
          rating: string
          reason: string | null
          user_id: string
        }
        Insert: {
          assistant_message_preview?: string | null
          chat_context: string
          comment?: string | null
          context_id?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating: string
          reason?: string | null
          user_id: string
        }
        Update: {
          assistant_message_preview?: string | null
          chat_context?: string
          comment?: string | null
          context_id?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      artifacts: {
        Row: {
          artifact_type: string
          body: string | null
          content: string
          created_at: string
          id: string
          milestone_id: string
          milestone_title: string | null
          planner_goal: string | null
          step_id: string
          step_title: string | null
          task_id: string | null
          title: string | null
          track_id: string | null
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_type: string
          body?: string | null
          content: string
          created_at?: string
          id?: string
          milestone_id: string
          milestone_title?: string | null
          planner_goal?: string | null
          step_id: string
          step_title?: string | null
          task_id?: string | null
          title?: string | null
          track_id?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_type?: string
          body?: string | null
          content?: string
          created_at?: string
          id?: string
          milestone_id?: string
          milestone_title?: string | null
          planner_goal?: string | null
          step_id?: string
          step_title?: string | null
          task_id?: string | null
          title?: string | null
          track_id?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      atom_search_index: {
        Row: {
          atom_id: string
          capability_outputs: string[]
          embedding: string | null
          embedding_model: string | null
          estimated_minutes: number | null
          goal_tags: string[]
          hard_prerequisites: string[]
          persona_tags: string[]
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          atom_id: string
          capability_outputs?: string[]
          embedding?: string | null
          embedding_model?: string | null
          estimated_minutes?: number | null
          goal_tags?: string[]
          hard_prerequisites?: string[]
          persona_tags?: string[]
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          atom_id?: string
          capability_outputs?: string[]
          embedding?: string | null
          embedding_model?: string | null
          estimated_minutes?: number | null
          goal_tags?: string[]
          hard_prerequisites?: string[]
          persona_tags?: string[]
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atom_search_index_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: true
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_id: string | null
          actor_type: string
          audit_id: string
          created_at: string
          event_type: string
          message: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string
          run_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          audit_id?: string
          created_at?: string
          event_type: string
          message?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type: string
          run_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          audit_id?: string
          created_at?: string
          event_type?: string
          message?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scheduler_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      capabilities: {
        Row: {
          description: string
          domain_id: string
          id: string
          label: string
          rubric_criteria: string
          slug: string
        }
        Insert: {
          description?: string
          domain_id: string
          id?: string
          label: string
          rubric_criteria?: string
          slug: string
        }
        Update: {
          description?: string
          domain_id?: string
          id?: string
          label?: string
          rubric_criteria?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          ai_tools_used: string[]
          artifact_urls: string[]
          completed_at: string
          created_at: string
          criteria_count: number
          criteria_labels: string[]
          goal_summary: string
          id: string
          learner_name: string | null
          milestone_count: number
          plan_id: string
          plan_title: string | null
          shared_at: string | null
          track_id: string | null
          user_id: string
        }
        Insert: {
          ai_tools_used?: string[]
          artifact_urls?: string[]
          completed_at: string
          created_at?: string
          criteria_count?: number
          criteria_labels?: string[]
          goal_summary: string
          id?: string
          learner_name?: string | null
          milestone_count?: number
          plan_id: string
          plan_title?: string | null
          shared_at?: string | null
          track_id?: string | null
          user_id: string
        }
        Update: {
          ai_tools_used?: string[]
          artifact_urls?: string[]
          completed_at?: string
          created_at?: string
          criteria_count?: number
          criteria_labels?: string[]
          goal_summary?: string
          id?: string
          learner_name?: string | null
          milestone_count?: number
          plan_id?: string
          plan_title?: string | null
          shared_at?: string | null
          track_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      competency_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string
          capability_id: string
          evidence_ids: string[]
          id: string
          rubric_results: Json
          score: number
          user_id: string
        }
        Insert: {
          assessed_at?: string
          assessed_by: string
          capability_id: string
          evidence_ids?: string[]
          id?: string
          rubric_results?: Json
          score: number
          user_id: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string
          capability_id?: string
          evidence_ids?: string[]
          id?: string
          rubric_results?: Json
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competency_assessments_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      compiled_plans: {
        Row: {
          coverage_score: number | null
          created_at: string
          goal: string
          parent_plan_id: string | null
          persona_id: string | null
          plan_id: string
          plan_seed: string | null
          rationale: string | null
          status: string
          steps: Json
          unsupported_capabilities: Json
          user_id: string
        }
        Insert: {
          coverage_score?: number | null
          created_at?: string
          goal: string
          parent_plan_id?: string | null
          persona_id?: string | null
          plan_id?: string
          plan_seed?: string | null
          rationale?: string | null
          status?: string
          steps?: Json
          unsupported_capabilities?: Json
          user_id: string
        }
        Update: {
          coverage_score?: number | null
          created_at?: string
          goal?: string
          parent_plan_id?: string | null
          persona_id?: string | null
          plan_id?: string
          plan_seed?: string | null
          rationale?: string | null
          status?: string
          steps?: Json
          unsupported_capabilities?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compiled_plans_parent_plan_id_fkey"
            columns: ["parent_plan_id"]
            isOneToOne: false
            referencedRelation: "compiled_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "compiled_plans_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      coverage_index_snapshots: {
        Row: {
          built_at: string
          content_hash: string
          id: string
          payload: Json
          schema_version: string
        }
        Insert: {
          built_at?: string
          content_hash: string
          id?: string
          payload: Json
          schema_version: string
        }
        Update: {
          built_at?: string
          content_hash?: string
          id?: string
          payload?: Json
          schema_version?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          description: string
          icon: string | null
          id: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          description?: string
          icon?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          description?: string
          icon?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      email_notification_log: {
        Row: {
          email_type: string
          id: string
          metadata: Json | null
          sent_at: string
          user_id: string
        }
        Insert: {
          email_type: string
          id?: string
          metadata?: Json | null
          sent_at?: string
          user_id: string
        }
        Update: {
          email_type?: string
          id?: string
          metadata?: Json | null
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          frequency: string
          graduation_emails: boolean
          last_reminder_sent_at: string | null
          milestone_emails: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          frequency?: string
          graduation_emails?: boolean
          last_reminder_sent_at?: string | null
          milestone_emails?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          frequency?: string
          graduation_emails?: boolean
          last_reminder_sent_at?: string | null
          milestone_emails?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evidence_submissions: {
        Row: {
          content: string
          id: string
          lesson_id: string
          metadata: Json | null
          plan_node_id: string | null
          submitted_at: string
          type: string
          user_id: string
        }
        Insert: {
          content: string
          id?: string
          lesson_id: string
          metadata?: Json | null
          plan_node_id?: string | null
          submitted_at?: string
          type: string
          user_id: string
        }
        Update: {
          content?: string
          id?: string
          lesson_id?: string
          metadata?: Json | null
          plan_node_id?: string | null
          submitted_at?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_results: {
        Row: {
          attempt_number: number
          code: string
          created_at: string
          exercise_id: string
          id: string
          lesson_id: string
          matched_patterns: string[]
          missing_patterns: string[]
          passed: boolean
          user_id: string
        }
        Insert: {
          attempt_number?: number
          code: string
          created_at?: string
          exercise_id: string
          id?: string
          lesson_id: string
          matched_patterns?: string[]
          missing_patterns?: string[]
          passed?: boolean
          user_id: string
        }
        Update: {
          attempt_number?: number
          code?: string
          created_at?: string
          exercise_id?: string
          id?: string
          lesson_id?: string
          matched_patterns?: string[]
          missing_patterns?: string[]
          passed?: boolean
          user_id?: string
        }
        Relationships: []
      }
      goal_history: {
        Row: {
          created_at: string
          ended_at: string | null
          goal: string
          id: string
          plan_id: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          goal: string
          id?: string
          plan_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          goal?: string
          id?: string
          plan_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          constraints: Json | null
          created_at: string
          current_skill: string | null
          deadline: string | null
          domain_ids: string[]
          environment: string | null
          id: string
          learning_style: string | null
          outcome: string
          preferred_tools: string[]
          status: string
          structured_intent: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          constraints?: Json | null
          created_at?: string
          current_skill?: string | null
          deadline?: string | null
          domain_ids?: string[]
          environment?: string | null
          id?: string
          learning_style?: string | null
          outcome: string
          preferred_tools?: string[]
          status?: string
          structured_intent?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          constraints?: Json | null
          created_at?: string
          current_skill?: string | null
          deadline?: string | null
          domain_ids?: string[]
          environment?: string | null
          id?: string
          learning_style?: string | null
          outcome?: string
          preferred_tools?: string[]
          status?: string
          structured_intent?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      graduation_decisions: {
        Row: {
          certificate_id: string | null
          competency_summary: Json
          created_at: string
          decided_at: string
          decision: Json
          goal_id: string | null
          goal_slug: string | null
          id: string
          persona_slug: string | null
          plan_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          certificate_id?: string | null
          competency_summary?: Json
          created_at?: string
          decided_at?: string
          decision?: Json
          goal_id?: string | null
          goal_slug?: string | null
          id?: string
          persona_slug?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          certificate_id?: string | null
          competency_summary?: Json
          created_at?: string
          decided_at?: string
          decision?: Json
          goal_id?: string | null
          goal_slug?: string | null
          id?: string
          persona_slug?: string | null
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_decisions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_decisions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "compiled_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      improvement_findings: {
        Row: {
          atom_id: string | null
          capability: string | null
          detected_at: string
          evidence: Json
          finding_id: string
          finding_type: string
          persona_id: string | null
          severity: string
          source_job: string | null
          status: string
        }
        Insert: {
          atom_id?: string | null
          capability?: string | null
          detected_at?: string
          evidence: Json
          finding_id?: string
          finding_type: string
          persona_id?: string | null
          severity: string
          source_job?: string | null
          status?: string
        }
        Update: {
          atom_id?: string | null
          capability?: string | null
          detected_at?: string
          evidence?: Json
          finding_id?: string
          finding_type?: string
          persona_id?: string | null
          severity?: string
          source_job?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_findings_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
          {
            foreignKeyName: "improvement_findings_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "improvement_findings_source_job_fkey"
            columns: ["source_job"]
            isOneToOne: false
            referencedRelation: "improvement_jobs"
            referencedColumns: ["job_id"]
          },
        ]
      }
      improvement_jobs: {
        Row: {
          completed_at: string | null
          error: string | null
          job_id: string
          job_type: string
          payload: Json
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          job_id?: string
          job_type: string
          payload?: Json
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          job_id?: string
          job_type?: string
          payload?: Json
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      improvement_proposals: {
        Row: {
          acknowledged: boolean
          delivered_at: string | null
          delivery_channel: string | null
          detailed_markdown: string
          finding_ids: string[]
          generated_at: string
          proposal_id: string
          source_job: string | null
          summary: string
        }
        Insert: {
          acknowledged?: boolean
          delivered_at?: string | null
          delivery_channel?: string | null
          detailed_markdown: string
          finding_ids: string[]
          generated_at?: string
          proposal_id?: string
          source_job?: string | null
          summary: string
        }
        Update: {
          acknowledged?: boolean
          delivered_at?: string | null
          delivery_channel?: string | null
          detailed_markdown?: string
          finding_ids?: string[]
          generated_at?: string
          proposal_id?: string
          source_job?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvement_proposals_source_job_fkey"
            columns: ["source_job"]
            isOneToOne: true
            referencedRelation: "improvement_jobs"
            referencedColumns: ["job_id"]
          },
        ]
      }
      learner_api_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          key_hint: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          key_hint?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          key_hint?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learner_profile: {
        Row: {
          available_ai_tools: string[]
          can_use_local_tools: boolean | null
          cli_familiarity: string | null
          created_at: string
          display_name: string | null
          experience_summary: string | null
          locale: string
          operating_system: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_ai_tools?: string[]
          can_use_local_tools?: boolean | null
          cli_familiarity?: string | null
          created_at?: string
          display_name?: string | null
          experience_summary?: string | null
          locale?: string
          operating_system?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_ai_tools?: string[]
          can_use_local_tools?: boolean | null
          cli_familiarity?: string | null
          created_at?: string
          display_name?: string | null
          experience_summary?: string | null
          locale?: string
          operating_system?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learner_state: {
        Row: {
          active_task_id: string | null
          active_track_id: string | null
          blockers: string[]
          created_at: string
          deadline_text: string | null
          existing_materials: string | null
          preferred_pace: string | null
          signals: Json
          skill_level: string | null
          target_outcome: string | null
          updated_at: string
          user_id: string
          weekly_time_budget: string | null
        }
        Insert: {
          active_task_id?: string | null
          active_track_id?: string | null
          blockers?: string[]
          created_at?: string
          deadline_text?: string | null
          existing_materials?: string | null
          preferred_pace?: string | null
          signals?: Json
          skill_level?: string | null
          target_outcome?: string | null
          updated_at?: string
          user_id: string
          weekly_time_budget?: string | null
        }
        Update: {
          active_task_id?: string | null
          active_track_id?: string | null
          blockers?: string[]
          created_at?: string
          deadline_text?: string | null
          existing_materials?: string | null
          preferred_pace?: string | null
          signals?: Json
          skill_level?: string | null
          target_outcome?: string | null
          updated_at?: string
          user_id?: string
          weekly_time_budget?: string | null
        }
        Relationships: []
      }
      lesson_anchors: {
        Row: {
          anchor_id: string
          description: string | null
          ordered_atom_ids: Json
          persona_id: string
          required_capabilities: Json
          yaml_hash: string | null
        }
        Insert: {
          anchor_id: string
          description?: string | null
          ordered_atom_ids?: Json
          persona_id: string
          required_capabilities?: Json
          yaml_hash?: string | null
        }
        Update: {
          anchor_id?: string
          description?: string | null
          ordered_atom_ids?: Json
          persona_id?: string
          required_capabilities?: Json
          yaml_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_anchors_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      lesson_atom_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          atom_id: string
          audit_id: string
          before_state: Json | null
          occurred_at: string
          version_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          atom_id: string
          audit_id?: string
          before_state?: Json | null
          occurred_at?: string
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          atom_id?: string
          audit_id?: string
          before_state?: Json | null
          occurred_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_atom_audit_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
          {
            foreignKeyName: "lesson_atom_audit_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "lesson_atom_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      lesson_atom_capabilities: {
        Row: {
          atom_id: string
          capability: string
          direction: string
        }
        Insert: {
          atom_id: string
          capability: string
          direction: string
        }
        Update: {
          atom_id?: string
          capability?: string
          direction?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_atom_capabilities_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
        ]
      }
      lesson_atom_prerequisites: {
        Row: {
          atom_id: string
          prerequisite_atom_id: string
          strength: string
        }
        Insert: {
          atom_id: string
          prerequisite_atom_id: string
          strength: string
        }
        Update: {
          atom_id?: string
          prerequisite_atom_id?: string
          strength?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_atom_prerequisites_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
          {
            foreignKeyName: "lesson_atom_prerequisites_prerequisite_atom_id_fkey"
            columns: ["prerequisite_atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
        ]
      }
      lesson_atom_versions: {
        Row: {
          atom_id: string
          body_markdown: string | null
          imported_at: string
          imported_by: string
          metadata: Json
          status: string
          version_id: string
          yaml_content: Json
          yaml_hash: string | null
        }
        Insert: {
          atom_id: string
          body_markdown?: string | null
          imported_at?: string
          imported_by?: string
          metadata?: Json
          status: string
          version_id?: string
          yaml_content?: Json
          yaml_hash?: string | null
        }
        Update: {
          atom_id?: string
          body_markdown?: string | null
          imported_at?: string
          imported_by?: string
          metadata?: Json
          status?: string
          version_id?: string
          yaml_content?: Json
          yaml_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_atom_versions_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
        ]
      }
      lesson_atoms: {
        Row: {
          atom_id: string
          created_at: string
          current_version_id: string | null
          source_path: string
          updated_at: string
        }
        Insert: {
          atom_id: string
          created_at?: string
          current_version_id?: string | null
          source_path: string
          updated_at?: string
        }
        Update: {
          atom_id?: string
          created_at?: string
          current_version_id?: string | null
          source_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_atoms_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_atom_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      lesson_chat_messages: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          messages: Json
          summary_key_points: string[]
          summary_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          messages?: Json
          summary_key_points?: string[]
          summary_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          messages?: Json
          summary_key_points?: string[]
          summary_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_feedback: {
        Row: {
          adjustment_proposal: Json | null
          clarity_rating: number
          comment: string | null
          created_at: string
          difficulty_rating: number
          id: string
          lesson_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustment_proposal?: Json | null
          clarity_rating: number
          comment?: string | null
          created_at?: string
          difficulty_rating: number
          id?: string
          lesson_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustment_proposal?: Json | null
          clarity_rating?: number
          comment?: string | null
          created_at?: string
          difficulty_rating?: number
          id?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentor_memory: {
        Row: {
          bullets: string[]
          created_at: string
          id: string
          source: string
          task_id: string | null
          title: string
          track_id: string | null
          user_id: string
        }
        Insert: {
          bullets?: string[]
          created_at?: string
          id?: string
          source?: string
          task_id?: string | null
          title: string
          track_id?: string | null
          user_id: string
        }
        Update: {
          bullets?: string[]
          created_at?: string
          id?: string
          source?: string
          task_id?: string | null
          title?: string
          track_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mentor_memory_archive: {
        Row: {
          archived_at: string
          bullets: string[]
          compaction_id: string | null
          created_at: string
          id: string
          original_id: string
          source: string
          task_id: string | null
          title: string
          track_id: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string
          bullets?: string[]
          compaction_id?: string | null
          created_at: string
          id?: string
          original_id: string
          source?: string
          task_id?: string | null
          title: string
          track_id?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string
          bullets?: string[]
          compaction_id?: string | null
          created_at?: string
          id?: string
          original_id?: string
          source?: string
          task_id?: string | null
          title?: string
          track_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mentor_sessions: {
        Row: {
          active_plan_id: string | null
          canonical_goal_key: string
          completed_at: string | null
          created_at: string
          current_lesson_id: string | null
          goal: string
          goal_id: string | null
          hearing_answers: Json
          hearing_insights: Json
          history_summary: string | null
          id: string
          messages: Json
          persona_ids: string[]
          phase: string
          summary_key_points: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_plan_id?: string | null
          canonical_goal_key: string
          completed_at?: string | null
          created_at?: string
          current_lesson_id?: string | null
          goal: string
          goal_id?: string | null
          hearing_answers?: Json
          hearing_insights?: Json
          history_summary?: string | null
          id?: string
          messages?: Json
          persona_ids?: string[]
          phase?: string
          summary_key_points?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_plan_id?: string | null
          canonical_goal_key?: string
          completed_at?: string | null
          created_at?: string
          current_lesson_id?: string | null
          goal?: string
          goal_id?: string | null
          hearing_answers?: Json
          hearing_insights?: Json
          history_summary?: string | null
          id?: string
          messages?: Json
          persona_ids?: string[]
          phase?: string
          summary_key_points?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_progress: {
        Row: {
          created_at: string
          evidence_rule: string | null
          id: string
          milestone_id: string
          milestone_title: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
          verification_summary: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          evidence_rule?: string | null
          id?: string
          milestone_id: string
          milestone_title?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
          verification_summary?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          evidence_rule?: string | null
          id?: string
          milestone_id?: string
          milestone_title?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          verification_summary?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "compiled_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          outcome: string | null
          phase: string | null
          sort_order: number
          status: string
          title: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          outcome?: string | null
          phase?: string | null
          sort_order?: number
          status?: string
          title: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          outcome?: string | null
          phase?: string | null
          sort_order?: number
          status?: string
          title?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      nightly_digest: {
        Row: {
          created_at: string
          digest_id: string
          failed_stages: string[]
          finished_at: string | null
          judge_score_histogram: Json
          new_gap_count: number
          new_proposal_count: number
          pending_owner_review_count: number
          run_date: string
          started_at: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          digest_id?: string
          failed_stages?: string[]
          finished_at?: string | null
          judge_score_histogram?: Json
          new_gap_count?: number
          new_proposal_count?: number
          pending_owner_review_count?: number
          run_date: string
          started_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          digest_id?: string
          failed_stages?: string[]
          finished_at?: string | null
          judge_score_histogram?: Json
          new_gap_count?: number
          new_proposal_count?: number
          pending_owner_review_count?: number
          run_date?: string
          started_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          in_app_artifact_verified: boolean
          in_app_lesson_recommendation: boolean
          in_app_milestone: boolean
          in_app_plan_revision: boolean
          in_app_streak: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          in_app_artifact_verified?: boolean
          in_app_lesson_recommendation?: boolean
          in_app_milestone?: boolean
          in_app_plan_revision?: boolean
          in_app_streak?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          in_app_artifact_verified?: boolean
          in_app_lesson_recommendation?: boolean
          in_app_milestone?: boolean
          in_app_plan_revision?: boolean
          in_app_streak?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      persona_versions: {
        Row: {
          imported_at: string
          persona_id: string
          version_id: string
          yaml_content: Json
          yaml_hash: string | null
        }
        Insert: {
          imported_at?: string
          persona_id: string
          version_id?: string
          yaml_content?: Json
          yaml_hash?: string | null
        }
        Update: {
          imported_at?: string
          persona_id?: string
          version_id?: string
          yaml_content?: Json
          yaml_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_versions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          current_version_id: string | null
          persona_id: string
          source_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          persona_id: string
          source_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          persona_id?: string
          source_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "persona_versions"
            referencedColumns: ["version_id"]
          },
        ]
      }
      plan_revisions: {
        Row: {
          changes_summary: string
          created_at: string
          id: string
          new_node_ids: string[]
          plan_id: string
          reason: string
          superseded_node_ids: string[]
        }
        Insert: {
          changes_summary?: string
          created_at?: string
          id?: string
          new_node_ids?: string[]
          plan_id: string
          reason: string
          superseded_node_ids?: string[]
        }
        Update: {
          changes_summary?: string
          created_at?: string
          id?: string
          new_node_ids?: string[]
          plan_id?: string
          reason?: string
          superseded_node_ids?: string[]
        }
        Relationships: []
      }
      recommendation_events: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          plan_node_id: string | null
          reason_detail: string
          reason_type: string
          score: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          plan_node_id?: string | null
          reason_detail?: string
          reason_type: string
          score?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          plan_node_id?: string | null
          reason_detail?: string
          reason_type?: string
          score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      scheduler_runs: {
        Row: {
          created_at: string
          cron_expression: string | null
          error_message: string | null
          finished_at: string | null
          job_name: Database["public"]["Enums"]["scheduler_job_name"]
          outcome_summary: Json
          run_id: string
          scheduled_at: string
          started_at: string
          status: Database["public"]["Enums"]["scheduler_run_status"]
          triggered_by: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string | null
          error_message?: string | null
          finished_at?: string | null
          job_name: Database["public"]["Enums"]["scheduler_job_name"]
          outcome_summary?: Json
          run_id?: string
          scheduled_at: string
          started_at?: string
          status?: Database["public"]["Enums"]["scheduler_run_status"]
          triggered_by?: string
        }
        Update: {
          created_at?: string
          cron_expression?: string | null
          error_message?: string | null
          finished_at?: string | null
          job_name?: Database["public"]["Enums"]["scheduler_job_name"]
          outcome_summary?: Json
          run_id?: string
          scheduled_at?: string
          started_at?: string
          status?: Database["public"]["Enums"]["scheduler_run_status"]
          triggered_by?: string
        }
        Relationships: []
      }
      task_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          do_text: string | null
          elapsed_minutes: number | null
          id: string
          learn_text: string | null
          plan_id: string
          relevant_lesson_ids: string[]
          started_at: string | null
          status: string
          task_id: string
          title: string | null
          updated_at: string
          why_text: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          do_text?: string | null
          elapsed_minutes?: number | null
          id?: string
          learn_text?: string | null
          plan_id: string
          relevant_lesson_ids?: string[]
          started_at?: string | null
          status?: string
          task_id: string
          title?: string | null
          updated_at?: string
          why_text?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          do_text?: string | null
          elapsed_minutes?: number | null
          id?: string
          learn_text?: string | null
          plan_id?: string
          relevant_lesson_ids?: string[]
          started_at?: string | null
          status?: string
          task_id?: string
          title?: string | null
          updated_at?: string
          why_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "compiled_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      telemetry_events: {
        Row: {
          atom_id: string | null
          atom_version_id: string | null
          event_id: string
          event_name: string
          occurred_at: string
          plan_id: string | null
          properties: Json
          request_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          atom_id?: string | null
          atom_version_id?: string | null
          event_id?: string
          event_name: string
          occurred_at?: string
          plan_id?: string | null
          properties?: Json
          request_id?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          atom_id?: string | null
          atom_version_id?: string | null
          event_id?: string
          event_name?: string
          occurred_at?: string
          plan_id?: string | null
          properties?: Json
          request_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "lesson_atoms"
            referencedColumns: ["atom_id"]
          },
          {
            foreignKeyName: "telemetry_events_atom_version_id_fkey"
            columns: ["atom_version_id"]
            isOneToOne: false
            referencedRelation: "lesson_atom_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "telemetry_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "compiled_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      unsupported_goal_log: {
        Row: {
          created_at: string
          goal: string
          hearing: Json | null
          id: string
          matched_intent: string
          normalized_goal: string
          support_status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          goal: string
          hearing?: Json | null
          id?: string
          matched_intent?: string
          normalized_goal: string
          support_status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          goal?: string
          hearing?: Json | null
          id?: string
          matched_intent?: string
          normalized_goal?: string
          support_status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_personas: {
        Row: {
          assigned_at: string
          persona_id: string
          user_id: string
          weight: number
        }
        Insert: {
          assigned_at?: string
          persona_id: string
          user_id: string
          weight?: number
        }
        Update: {
          assigned_at?: string
          persona_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          course_id: string | null
          id: string
          lesson_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          course_id?: string | null
          id?: string
          lesson_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          course_id?: string | null
          id?: string
          lesson_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workspace_snapshots: {
        Row: {
          created_at: string
          goal_key: string
          id: string
          saved_at: string
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_key: string
          id?: string
          saved_at?: string
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_key?: string
          id?: string
          saved_at?: string
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      capability_state_vw: {
        Row: {
          capability_id: string | null
          latest_assessed_at: string | null
          latest_score: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competency_assessments_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      log_daily_unsupported_capabilities: {
        Args: { target_day?: string }
        Returns: number
      }
      search_atoms_by_embedding: {
        Args: {
          goal_filter?: string[]
          match_count?: number
          persona_filter?: string[]
          query_embedding: string
        }
        Returns: {
          atom_id: string
          capability_outputs: string[]
          estimated_minutes: number
          goal_tags: string[]
          hard_prerequisites: string[]
          persona_tags: string[]
          similarity: number
          summary: string
          title: string
        }[]
      }
    }
    Enums: {
      scheduler_job_name:
        | "matcher_sweep"
        | "gap_scan"
        | "proposer_run"
        | "judge_run"
        | "nightly_digest"
      scheduler_run_status:
        | "running"
        | "success"
        | "failed"
        | "skipped_duplicate"
        | "skipped_upstream_failed"
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
  decision_ledger: {
    Enums: {
      owner_approval: ["pending", "approved", "rejected"],
      owner_approval_state: [
        "auto",
        "pending_owner_review",
        "approved",
        "rejected",
        "blocked",
      ],
      owner_type_enum: ["user", "ai", "both", "external", "blocked"],
    },
  },
  public: {
    Enums: {
      scheduler_job_name: [
        "matcher_sweep",
        "gap_scan",
        "proposer_run",
        "judge_run",
        "nightly_digest",
      ],
      scheduler_run_status: [
        "running",
        "success",
        "failed",
        "skipped_duplicate",
        "skipped_upstream_failed",
      ],
    },
  },
} as const

