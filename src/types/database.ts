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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          group_id: string
          id?: string
          leave_request_id?: string | null
          payload?: Json
          settlement_id?: string | null
          study_log_id?: string | null
          submission_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          group_id?: string
          id?: string
          leave_request_id?: string | null
          payload?: Json
          settlement_id?: string | null
          study_log_id?: string | null
          submission_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "activity_events_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_limits: {
        Row: {
          id: boolean
          max_groups: number
          max_total_members: number
        }
        Insert: {
          id?: boolean
          max_groups?: number
          max_total_members?: number
        }
        Update: {
          id?: boolean
          max_groups?: number
          max_total_members?: number
        }
        Relationships: []
      }
      declaration_flags: {
        Row: {
          comment: string
          created_at: string
          flagger_id: string
          study_log_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          flagger_id: string
          study_log_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          flagger_id?: string
          study_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "declaration_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "declaration_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "declaration_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "declaration_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "declaration_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "declaration_flags_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "declaration_flags_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      failure_reports: {
        Row: {
          category: string | null
          next_plan_text: string | null
          outcome: string | null
          reason_text: string | null
          report_due_at: string
          reported_at: string | null
          resolved_at: string | null
          review_due_at: string | null
          status: string
          study_log_id: string
          unrealistic_streak: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          next_plan_text?: string | null
          outcome?: string | null
          reason_text?: string | null
          report_due_at: string
          reported_at?: string | null
          resolved_at?: string | null
          review_due_at?: string | null
          status?: string
          study_log_id: string
          unrealistic_streak?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          next_plan_text?: string | null
          outcome?: string | null
          reason_text?: string | null
          report_due_at?: string
          reported_at?: string | null
          resolved_at?: string | null
          review_due_at?: string | null
          status?: string
          study_log_id?: string
          unrealistic_streak?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failure_reports_study_log_id_user_id_fkey"
            columns: ["study_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      group_settings: {
        Row: {
          ai_fallback_minutes: number
          appeals_per_week: number
          declaration_cutoff: string
          dispute_cutoff: string
          dispute_window_hours: number
          first_declaration_reminder: string
          flag_window_hours: number
          group_id: string
          image_retention_days: number
          invite_minutes: number
          judge_grace_minutes: number
          last_declaration_reminder: string
          makeup_hours: number
          makeup_per_overdue: number
          makeup_per_streak: number
          makeup_since: string | null
          max_attempts: number
          max_members: number
          min_explanation_chars: number
          passing_score: number
          photo_gap_minutes: number
          penalty_excuse_rejected: number
          penalty_fake_evidence: number
          penalty_late_payment: number
          penalty_no_declaration: number
          penalty_slacked: number
          penalty_unrealistic_streak: number
          penalty_unrevised: number
          report_deadline: string
          report_reminder_times: string[]
          resend_cutoff: string
          resend_minutes: number
          rest_days_per_week: number
          review_deadline: string
          review_hours: number
          review_reminder_times: string[]
          revision_minutes: number
          settlement_time: string
          settlement_weekday: number
          slack_streak_threshold: number
          start_photo_required: boolean
          storage_soft_limit_mb: number
          submit_deadline_max: string
          unrealistic_streak_threshold: number
          updated_at: string
        }
        Insert: {
          ai_fallback_minutes?: number
          appeals_per_week?: number
          declaration_cutoff?: string
          dispute_cutoff?: string
          dispute_window_hours?: number
          first_declaration_reminder?: string
          flag_window_hours?: number
          group_id: string
          image_retention_days?: number
          invite_minutes?: number
          judge_grace_minutes?: number
          last_declaration_reminder?: string
          makeup_hours?: number
          makeup_per_overdue?: number
          makeup_per_streak?: number
          makeup_since?: string | null
          max_attempts?: number
          max_members?: number
          min_explanation_chars?: number
          passing_score?: number
          photo_gap_minutes?: number
          penalty_excuse_rejected?: number
          penalty_fake_evidence?: number
          penalty_late_payment?: number
          penalty_no_declaration?: number
          penalty_slacked?: number
          penalty_unrealistic_streak?: number
          penalty_unrevised?: number
          report_deadline?: string
          report_reminder_times?: string[]
          resend_cutoff?: string
          resend_minutes?: number
          rest_days_per_week?: number
          review_deadline?: string
          review_hours?: number
          review_reminder_times?: string[]
          revision_minutes?: number
          settlement_time?: string
          settlement_weekday?: number
          slack_streak_threshold?: number
          start_photo_required?: boolean
          storage_soft_limit_mb?: number
          submit_deadline_max?: string
          unrealistic_streak_threshold?: number
          updated_at?: string
        }
        Update: {
          ai_fallback_minutes?: number
          appeals_per_week?: number
          declaration_cutoff?: string
          dispute_cutoff?: string
          dispute_window_hours?: number
          first_declaration_reminder?: string
          flag_window_hours?: number
          group_id?: string
          image_retention_days?: number
          invite_minutes?: number
          judge_grace_minutes?: number
          last_declaration_reminder?: string
          makeup_hours?: number
          makeup_per_overdue?: number
          makeup_per_streak?: number
          makeup_since?: string | null
          max_attempts?: number
          max_members?: number
          min_explanation_chars?: number
          passing_score?: number
          photo_gap_minutes?: number
          penalty_excuse_rejected?: number
          penalty_fake_evidence?: number
          penalty_late_payment?: number
          penalty_no_declaration?: number
          penalty_slacked?: number
          penalty_unrealistic_streak?: number
          penalty_unrevised?: number
          report_deadline?: string
          report_reminder_times?: string[]
          resend_cutoff?: string
          resend_minutes?: number
          rest_days_per_week?: number
          review_deadline?: string
          review_hours?: number
          review_reminder_times?: string[]
          revision_minutes?: number
          settlement_time?: string
          settlement_weekday?: number
          slack_streak_threshold?: number
          start_photo_required?: boolean
          storage_soft_limit_mb?: number
          submit_deadline_max?: string
          unrealistic_streak_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          group_id: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      judge_appeals: {
        Row: {
          created_at: string
          reason: string
          resolved_at: string | null
          review_due_at: string
          status: string
          study_log_id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reason: string
          resolved_at?: string | null
          review_due_at: string
          status?: string
          study_log_id: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          reason?: string
          resolved_at?: string | null
          review_due_at?: string
          status?: string
          study_log_id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_appeals_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: true
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "judge_appeals_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: true
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_appeals_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "judge_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "judge_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "judge_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          cancelled_from: string | null
          created_at: string
          end_date: string
          id: string
          reason: string
          resolved_at: string | null
          review_due_at: string
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          cancelled_from?: string | null
          created_at?: string
          end_date: string
          id?: string
          reason: string
          resolved_at?: string | null
          review_due_at: string
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          cancelled_from?: string | null
          created_at?: string
          end_date?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          review_due_at?: string
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      makeup_debts: {
        Row: {
          count: number
          created_at: string
          dedupe_key: string
          due_at: string
          id: string
          period_end: string | null
          reason: string
          study_log_id: string | null
          user_id: string
          waived: string | null
        }
        Insert: {
          count: number
          created_at?: string
          dedupe_key: string
          due_at: string
          id?: string
          period_end?: string | null
          reason: string
          study_log_id?: string | null
          user_id: string
          waived?: string | null
        }
        Update: {
          count?: number
          created_at?: string
          dedupe_key?: string
          due_at?: string
          id?: string
          period_end?: string | null
          reason?: string
          study_log_id?: string | null
          user_id?: string
          waived?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makeup_debts_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "makeup_debts_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "makeup_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "makeup_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "makeup_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          event_id: string
          id: string
          pushed_at: string | null
          read_at: string | null
          recipient_id: string
          requires_action: boolean
          title: string
          url: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          event_id: string
          id?: string
          pushed_at?: string | null
          read_at?: string | null
          recipient_id: string
          requires_action?: boolean
          title: string
          url?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          pushed_at?: string | null
          read_at?: string | null
          recipient_id?: string
          requires_action?: boolean
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      peer_reviews: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          id: string
          reviewer_id: string
          subject_id: string
          subject_type: string
          verdict: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          reviewer_id: string
          subject_id: string
          subject_type: string
          verdict?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          reviewer_id?: string
          subject_id?: string
          subject_type?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "peer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "peer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "peer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      penalties: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          late_settlement_id: string | null
          points: number
          reason: string
          settlement_id: string | null
          study_log_id: string | null
          user_id: string
          waived: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          late_settlement_id?: string | null
          points: number
          reason: string
          settlement_id?: string | null
          study_log_id?: string | null
          user_id: string
          waived?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          late_settlement_id?: string | null
          points?: number
          reason?: string
          settlement_id?: string | null
          study_log_id?: string | null
          user_id?: string
          waived?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "penalties_late_settlement_id_fkey"
            columns: ["late_settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "penalties_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          group_id: string
          id: string
          is_admin: boolean
          left_reason: string | null
          notifications_verified_at: string | null
          payee_id: string | null
          paypay_link: string | null
          removed_by: string | null
          rules_accepted_at: string | null
          season_themes: boolean
          seen_tips: string[]
          trial_ends_at: string
          ui_theme: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name: string
          group_id: string
          id?: string
          is_admin?: boolean
          left_reason?: string | null
          notifications_verified_at?: string | null
          payee_id?: string | null
          paypay_link?: string | null
          removed_by?: string | null
          rules_accepted_at?: string | null
          season_themes?: boolean
          seen_tips?: string[]
          trial_ends_at: string
          ui_theme?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name?: string
          group_id?: string
          id?: string
          is_admin?: boolean
          left_reason?: string | null
          notifications_verified_at?: string | null
          payee_id?: string | null
          paypay_link?: string | null
          removed_by?: string | null
          rules_accepted_at?: string | null
          season_themes?: boolean
          seen_tips?: string[]
          trial_ends_at?: string
          ui_theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rest_days: {
        Row: {
          created_at: string
          date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rest_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rest_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rest_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rest_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rest_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_yen: number
          completed_at: string | null
          created_at: string
          debtor_id: string
          id: string
          payee_id: string
          period_end: string
          sent_at: string | null
          status: string
        }
        Insert: {
          amount_yen: number
          completed_at?: string | null
          created_at?: string
          debtor_id: string
          id?: string
          payee_id: string
          period_end: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          amount_yen?: number
          completed_at?: string | null
          created_at?: string
          debtor_id?: string
          id?: string
          payee_id?: string
          period_end?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      study_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          date: string
          declaration: string | null
          declared_at: string | null
          dispute_window_ends_at: string | null
          id: string
          invalidated_at: string | null
          is_makeup: boolean
          missed_at: string | null
          original_declaration: string | null
          passed_at: string | null
          passphrase: string | null
          revised_at: string | null
          revision_due_at: string | null
          status: string
          target_end_time: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          date: string
          declaration?: string | null
          declared_at?: string | null
          dispute_window_ends_at?: string | null
          id?: string
          invalidated_at?: string | null
          is_makeup?: boolean
          missed_at?: string | null
          original_declaration?: string | null
          passed_at?: string | null
          passphrase?: string | null
          revised_at?: string | null
          revision_due_at?: string | null
          status: string
          target_end_time?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          date?: string
          declaration?: string | null
          declared_at?: string | null
          dispute_window_ends_at?: string | null
          id?: string
          invalidated_at?: string | null
          is_makeup?: boolean
          missed_at?: string | null
          original_declaration?: string | null
          passed_at?: string | null
          passphrase?: string | null
          revised_at?: string | null
          revision_due_at?: string | null
          status?: string
          target_end_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      study_photos: {
        Row: {
          id: string
          image_path: string | null
          images_purged_at: string | null
          kind: string
          study_log_id: string
          taken_at: string
          thumb_path: string | null
          user_id: string
        }
        Insert: {
          id?: string
          image_path?: string | null
          images_purged_at?: string | null
          kind: string
          study_log_id: string
          taken_at?: string
          thumb_path?: string | null
          user_id: string
        }
        Update: {
          id?: string
          image_path?: string | null
          images_purged_at?: string | null
          kind?: string
          study_log_id?: string
          taken_at?: string
          thumb_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_photos_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_disputes: {
        Row: {
          first_flagged_at: string
          resend_due_at: string
          resolved_at: string | null
          review_due_at: string | null
          status: string
          study_log_id: string
        }
        Insert: {
          first_flagged_at?: string
          resend_due_at: string
          resolved_at?: string | null
          review_due_at?: string | null
          status?: string
          study_log_id: string
        }
        Update: {
          first_flagged_at?: string
          resend_due_at?: string
          resolved_at?: string | null
          review_due_at?: string | null
          status?: string
          study_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_disputes_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: true
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "submission_disputes_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: true
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_flags: {
        Row: {
          comment: string
          created_at: string
          flagger_id: string
          study_log_id: string
          withdrawn_at: string | null
        }
        Insert: {
          comment: string
          created_at?: string
          flagger_id: string
          study_log_id: string
          withdrawn_at?: string | null
        }
        Update: {
          comment?: string
          created_at?: string
          flagger_id?: string
          study_log_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "submission_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "submission_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "submission_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "submission_flags_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["study_log_id"]
          },
          {
            foreignKeyName: "submission_flags_study_log_id_fkey"
            columns: ["study_log_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          ai_feedback: string | null
          ai_model: string | null
          ai_passphrase_found: boolean | null
          ai_score: number | null
          attempt_no: number | null
          elapsed_minutes: number | null
          explanation: string | null
          id: string
          image_paths: string[]
          images_purged_at: string | null
          judge_error: string | null
          judged_at: string | null
          kind: string
          learned_text: string | null
          reject_reason: string | null
          self_rating: number | null
          status: string
          struggled_text: string | null
          study_log_id: string
          submitted_at: string
          thumb_path: string | null
          unverified_at: string | null
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          ai_model?: string | null
          ai_passphrase_found?: boolean | null
          ai_score?: number | null
          attempt_no?: number | null
          elapsed_minutes?: number | null
          explanation?: string | null
          id?: string
          image_paths: string[]
          images_purged_at?: string | null
          judge_error?: string | null
          judged_at?: string | null
          kind: string
          learned_text?: string | null
          reject_reason?: string | null
          self_rating?: number | null
          status?: string
          struggled_text?: string | null
          study_log_id: string
          submitted_at?: string
          thumb_path?: string | null
          unverified_at?: string | null
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          ai_model?: string | null
          ai_passphrase_found?: boolean | null
          ai_score?: number | null
          attempt_no?: number | null
          elapsed_minutes?: number | null
          explanation?: string | null
          id?: string
          image_paths?: string[]
          images_purged_at?: string | null
          judge_error?: string | null
          judged_at?: string | null
          kind?: string
          learned_text?: string | null
          reject_reason?: string | null
          self_rating?: number | null
          status?: string
          struggled_text?: string | null
          study_log_id?: string
          submitted_at?: string
          thumb_path?: string | null
          unverified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_study_log_id_user_id_fkey"
            columns: ["study_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "study_logs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          ai_model: string | null
          ai_summary: string | null
          created_at: string
          self_note: string | null
          self_note_updated_at: string | null
          stats: Json
          user_id: string
          week_end: string
        }
        Insert: {
          ai_model?: string | null
          ai_summary?: string | null
          created_at?: string
          self_note?: string | null
          self_note_updated_at?: string | null
          stats: Json
          user_id: string
          week_end: string
        }
        Update: {
          ai_model?: string | null
          ai_summary?: string | null
          created_at?: string
          self_note?: string | null
          self_note_updated_at?: string | null
          stats?: Json
          user_id?: string
          week_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "daily_history"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "makeup_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "penalty_summary"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "weekly_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      daily_history: {
        Row: {
          attempts: number | null
          date: string | null
          declaration: string | null
          elapsed_minutes: number | null
          failure_category: string | null
          final_score: number | null
          in_trial: boolean | null
          kind: string | null
          penalty_points: number | null
          penalty_reason: string | null
          study_log_id: string | null
          submitted_hour: number | null
          trial_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
      makeup_summary: {
        Row: {
          completed: number | null
          next_due_at: string | null
          open: number | null
          overdue: number | null
          owed: number | null
          remaining: number | null
          reviewing: number | null
          trial_owed: number | null
          user_id: string | null
        }
        Relationships: []
      }
      penalty_summary: {
        Row: {
          display_name: string | null
          open_settlement_id: string | null
          this_week_points: number | null
          this_week_trial_points: number | null
          total_points: number | null
          trial_points: number | null
          unsettled_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
      received_objections: {
        Row: {
          by_user_id: string | null
          kind: string | null
          occurred_at: string | null
          reason: string | null
          study_log_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      weekly_stats: {
        Row: {
          achievement_rate: number | null
          avg_elapsed_minutes: number | null
          avg_score: number | null
          completed_days: number | null
          counted_days: number | null
          penalty_points: number | null
          trial_points: number | null
          user_id: string | null
          week_end: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_rules: { Args: { p_user_id: string }; Returns: string }
      add_study_photo: {
        Args: {
          p_image_path: string
          p_study_log_id: string
          p_thumb_path: string
          p_user_id: string
        }
        Returns: {
          id: string
          image_path: string | null
          images_purged_at: string | null
          kind: string
          study_log_id: string
          taken_at: string
          thumb_path: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "study_photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      advance_disputes: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      appeal_judgement: {
        Args: { p_reason: string; p_study_log_id: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      assign_payee: {
        Args: { p_admin_id: string; p_payee_id: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      award_makeups: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cancel_leave: {
        Args: { p_leave_request_id: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_rest_day: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cast_review: {
        Args: {
          p_comment: string
          p_reviewer_id: string
          p_subject_id: string
          p_subject_type: string
          p_verdict: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_declarations: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_makeup_week: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_overdue_logs: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_passed_logs: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_push_subscription: {
        Args: { p_endpoint: string; p_user_id: string }
        Returns: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "push_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_settlement: {
        Args: { p_payee_id: string; p_settlement_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group: {
        Args: {
          p_avatar_url: string
          p_display_name: string
          p_group_name: string
          p_user_id: string
        }
        Returns: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          group_id: string
          id: string
          is_admin: boolean
          left_reason: string | null
          notifications_verified_at: string | null
          payee_id: string | null
          paypay_link: string | null
          removed_by: string | null
          rules_accepted_at: string | null
          season_themes: boolean
          seen_tips: string[]
          trial_ends_at: string
          ui_theme: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invite: {
        Args: { p_code_hash: string; p_user_id: string }
        Returns: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notifications: {
        Args: { p_event_id: string; p_items: Json }
        Returns: {
          body: string
          created_at: string
          event_id: string
          id: string
          pushed_at: string | null
          read_at: string | null
          recipient_id: string
          requires_action: boolean
          title: string
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_submission: {
        Args: {
          p_image_paths: string[]
          p_learned: string
          p_self_rating: number
          p_struggled: string
          p_study_log_id: string
          p_thumb_path: string
          p_user_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_weekly_reviews: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      declare_goal: {
        Args: {
          p_declaration: string
          p_end_time: string
          p_passphrase: string
          p_user_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      declare_makeup: {
        Args: { p_declaration: string; p_passphrase: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_push_subscription: {
        Args: { p_endpoint: string; p_user_id?: string }
        Returns: undefined
      }
      due_appeal_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      due_deadline_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      due_image_purges: {
        Args: { p_limit?: number }
        Returns: {
          image_paths: string[]
          submission_id: string
        }[]
      }
      due_photo_purges: {
        Args: { p_limit?: number }
        Returns: {
          image_path: string
          photo_id: string
        }[]
      }
      due_makeup_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      due_submit_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_appeals: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_reports: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_reviews: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_revisions: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      file_failure_report: {
        Args: {
          p_category: string
          p_study_log_id: string
          p_text: string
          p_user_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      flag_declaration: {
        Args: {
          p_comment: string
          p_flagger_id: string
          p_study_log_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flag_submission: {
        Args: {
          p_comment: string
          p_flagger_id: string
          p_study_log_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      give_up_day: {
        Args: { p_study_log_id: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_group: {
        Args: {
          p_avatar_url: string
          p_bootstrap?: boolean
          p_display_name: string
          p_invite_hash: string
          p_user_id: string
        }
        Returns: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          group_id: string
          id: string
          is_admin: boolean
          left_reason: string | null
          notifications_verified_at: string | null
          payee_id: string | null
          paypay_link: string | null
          removed_by: string | null
          rules_accepted_at: string | null
          season_themes: boolean
          seen_tips: string[]
          trial_ends_at: string
          ui_theme: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      late_payment_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      leave_group: {
        Args: { p_member_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_images_purged: {
        Args: { p_submission_ids: string[] }
        Returns: number
      }
      mark_photos_purged: {
        Args: { p_photo_ids: string[] }
        Returns: number
      }
      mark_notifications_pushed: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      mark_settlement_sent: {
        Args: { p_debtor_id: string; p_settlement_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_tip_seen: {
        Args: { p_tip: string; p_user_id: string }
        Returns: undefined
      }
      pass_unjudged: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_judge_error: {
        Args: { p_message: string; p_submission_id: string }
        Returns: undefined
      }
      record_judgement: {
        Args: {
          p_feedback: string
          p_model: string
          p_passphrase_found: boolean
          p_score: number
          p_submission_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_push_success: { Args: { p_endpoint: string }; Returns: undefined }
      record_standings: {
        Args: {
          p_changes: Json
          p_group_id: string
          p_previous_id: string
          p_snapshot: Json
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_weekly_summary: {
        Args: {
          p_model: string
          p_summary: string
          p_user_id: string
          p_week_end: string
        }
        Returns: undefined
      }
      register_rest_day: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_member: {
        Args: { p_admin_id: string; p_member_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rename_group: {
        Args: { p_admin_id: string; p_name: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_not_received: {
        Args: { p_payee_id: string; p_settlement_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_leave: {
        Args: {
          p_end: string
          p_reason: string
          p_start: string
          p_user_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resend_evidence: {
        Args: {
          p_explanation: string
          p_image_paths: string[]
          p_study_log_id: string
          p_thumb_path: string
          p_user_id: string
        }
        Returns: {
          ai_feedback: string | null
          ai_model: string | null
          ai_passphrase_found: boolean | null
          ai_score: number | null
          attempt_no: number | null
          elapsed_minutes: number | null
          explanation: string | null
          id: string
          image_paths: string[]
          images_purged_at: string | null
          judge_error: string | null
          judged_at: string | null
          kind: string
          learned_text: string | null
          reject_reason: string | null
          self_rating: number | null
          status: string
          struggled_text: string | null
          study_log_id: string
          submitted_at: string
          thumb_path: string | null
          unverified_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_tips: { Args: { p_user_id: string }; Returns: undefined }
      revise_declaration: {
        Args: {
          p_declaration: string
          p_study_log_id: string
          p_user_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_declaration_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      run_weekly_settlement: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent: string
          p_user_id: string
        }
        Returns: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "push_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_weekly_note: {
        Args: { p_note: string; p_user_id: string; p_week_end: string }
        Returns: undefined
      }
      set_admin: {
        Args: { p_admin_id: string; p_is_admin: boolean; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_ui_theme: {
        Args: { p_season_themes: boolean; p_theme: string; p_user_id: string }
        Returns: undefined
      }
      tick: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      trial_ending_reminders: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_group_settings: {
        Args: { p_admin_id: string; p_changes: Json }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_flag: {
        Args: { p_flagger_id: string; p_study_log_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          group_id: string
          id: string
          leave_request_id: string | null
          payload: Json
          settlement_id: string | null
          study_log_id: string | null
          submission_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
