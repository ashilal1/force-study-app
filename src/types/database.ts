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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          declaration_cutoff: string
          dispute_cutoff: string
          dispute_window_hours: number
          flag_window_hours: number
          id: boolean
          image_retention_days: number
          invite_minutes: number
          judge_grace_minutes: number
          last_declaration_reminder: string
          max_attempts: number
          max_members: number
          min_explanation_chars: number
          passing_score: number
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
          review_reminder_times: string[]
          revision_minutes: number
          settlement_time: string
          settlement_weekday: number
          storage_soft_limit_mb: number
          submit_deadline_max: string
          unrealistic_streak_threshold: number
          updated_at: string
        }
        Insert: {
          declaration_cutoff?: string
          dispute_cutoff?: string
          dispute_window_hours?: number
          flag_window_hours?: number
          id?: boolean
          image_retention_days?: number
          invite_minutes?: number
          judge_grace_minutes?: number
          last_declaration_reminder?: string
          max_attempts?: number
          max_members?: number
          min_explanation_chars?: number
          passing_score?: number
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
          review_reminder_times?: string[]
          revision_minutes?: number
          settlement_time?: string
          settlement_weekday?: number
          storage_soft_limit_mb?: number
          submit_deadline_max?: string
          unrealistic_streak_threshold?: number
          updated_at?: string
        }
        Update: {
          declaration_cutoff?: string
          dispute_cutoff?: string
          dispute_window_hours?: number
          flag_window_hours?: number
          id?: boolean
          image_retention_days?: number
          invite_minutes?: number
          judge_grace_minutes?: number
          last_declaration_reminder?: string
          max_attempts?: number
          max_members?: number
          min_explanation_chars?: number
          passing_score?: number
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
          review_reminder_times?: string[]
          revision_minutes?: number
          settlement_time?: string
          settlement_weekday?: number
          storage_soft_limit_mb?: number
          submit_deadline_max?: string
          unrealistic_streak_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "study_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          id: string
          is_admin: boolean
          notifications_verified_at: string | null
          payee_id: string | null
          paypay_link: string | null
          trial_ends_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name: string
          id: string
          is_admin?: boolean
          notifications_verified_at?: string | null
          payee_id?: string | null
          paypay_link?: string | null
          trial_ends_at: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name?: string
          id?: string
          is_admin?: boolean
          notifications_verified_at?: string | null
          payee_id?: string | null
          paypay_link?: string | null
          trial_ends_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_leave: {
        Args: { p_leave_request_id: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
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
      create_invite: {
        Args: { p_code_hash: string; p_user_id: string }
        Returns: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
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
      expire_reviews: {
        Args: never
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
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
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          id: string
          is_admin: boolean
          notifications_verified_at: string | null
          payee_id: string | null
          paypay_link: string | null
          trial_ends_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_pushed: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      record_push_success: { Args: { p_endpoint: string }; Returns: undefined }
      register_rest_day: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
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
