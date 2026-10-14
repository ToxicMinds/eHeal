export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      audio_tracks: {
        Row: {
          consultation_id: string
          created_at: string
          duration_seconds: number | null
          format: string
          id: string
          offset_seconds: number
          sha256: string
          size_bytes: number
          speaker: Database["public"]["Enums"]["speaker"]
          storage_path: string
          validation: Database["public"]["Enums"]["track_validation"]
          validation_error: string | null
        }
        Insert: {
          consultation_id: string
          created_at?: string
          duration_seconds?: number | null
          format: string
          id?: string
          offset_seconds?: number
          sha256: string
          size_bytes: number
          speaker: Database["public"]["Enums"]["speaker"]
          storage_path: string
          validation?: Database["public"]["Enums"]["track_validation"]
          validation_error?: string | null
        }
        Update: {
          consultation_id?: string
          created_at?: string
          duration_seconds?: number | null
          format?: string
          id?: string
          offset_seconds?: number
          sha256?: string
          size_bytes?: number
          speaker?: Database["public"]["Enums"]["speaker"]
          storage_path?: string
          validation?: Database["public"]["Enums"]["track_validation"]
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_tracks_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string
          actor_role: string
          consultation_id: string
          event_hash: string
          event_id: string
          event_type: string
          metadata_without_clinical_content: Json
          previous_event_hash: string | null
          resource_id: string | null
          resource_type: string
          result: string
          seq: number
          timestamp_utc: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          consultation_id: string
          event_hash: string
          event_id: string
          event_type: string
          metadata_without_clinical_content?: Json
          previous_event_hash?: string | null
          resource_id?: string | null
          resource_type: string
          result: string
          seq?: never
          timestamp_utc: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          consultation_id?: string
          event_hash?: string
          event_id?: string
          event_type?: string
          metadata_without_clinical_content?: Json
          previous_event_hash?: string | null
          resource_id?: string | null
          resource_type?: string
          result?: string
          seq?: never
          timestamp_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          consent_recorded_at: string | null
          consent_recorded_by: string | null
          consent_withdrawn_at: string | null
          consent_withdrawn_by: string | null
          created_at: string
          fee_cents: number | null
          id: string
          invite_token: string
          language: Database["public"]["Enums"]["consultation_language"]
          paid_amount_cents: number | null
          paid_at: string | null
          practitioner_id: string
          recorded_together: boolean
          scenario_notes: string
          scheduled_at: string
          status: Database["public"]["Enums"]["consultation_status"]
          stripe_checkout_session_id: string | null
          synthetic_patient_ref: string
          updated_at: string
        }
        Insert: {
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          consent_withdrawn_at?: string | null
          consent_withdrawn_by?: string | null
          created_at?: string
          fee_cents?: number | null
          id?: string
          invite_token?: string
          language: Database["public"]["Enums"]["consultation_language"]
          paid_amount_cents?: number | null
          paid_at?: string | null
          practitioner_id: string
          recorded_together?: boolean
          scenario_notes?: string
          scheduled_at: string
          status: Database["public"]["Enums"]["consultation_status"]
          stripe_checkout_session_id?: string | null
          synthetic_patient_ref: string
          updated_at?: string
        }
        Update: {
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          consent_withdrawn_at?: string | null
          consent_withdrawn_by?: string | null
          created_at?: string
          fee_cents?: number | null
          id?: string
          invite_token?: string
          language?: Database["public"]["Enums"]["consultation_language"]
          paid_amount_cents?: number | null
          paid_at?: string | null
          practitioner_id?: string
          recorded_together?: boolean
          scenario_notes?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["consultation_status"]
          stripe_checkout_session_id?: string | null
          synthetic_patient_ref?: string
          updated_at?: string
        }
        Relationships: []
      }
      engines: {
        Row: {
          label: string
          last_seen_at: string | null
          user_id: string
        }
        Insert: {
          label: string
          last_seen_at?: string | null
          user_id: string
        }
        Update: {
          label?: string
          last_seen_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      form_answers: {
        Row: {
          evidence: number[]
          field_key: string
          form_id: string
          machine_text: string | null
          position: number
          practitioner_text: string | null
          review: string
        }
        Insert: {
          evidence?: number[]
          field_key: string
          form_id: string
          machine_text?: string | null
          position: number
          practitioner_text?: string | null
          review?: string
        }
        Update: {
          evidence?: number[]
          field_key?: string
          form_id?: string
          machine_text?: string | null
          position?: number
          practitioner_text?: string | null
          review?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_answers_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_jobs: {
        Row: {
          attempt: number
          claimed_at: string | null
          consultation_id: string
          engine_user_id: string | null
          error_category: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          metrics: Json
          queued_at: string
          status: Database["public"]["Enums"]["job_status"]
          transcript_id: string
        }
        Insert: {
          attempt?: number
          claimed_at?: string | null
          consultation_id: string
          engine_user_id?: string | null
          error_category?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          queued_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          transcript_id: string
        }
        Update: {
          attempt?: number
          claimed_at?: string | null
          consultation_id?: string
          engine_user_id?: string | null
          error_category?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          queued_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_jobs_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_jobs_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          definition: Json
          practitioner_id: string
          updated_at: string
        }
        Insert: {
          definition: Json
          practitioner_id: string
          updated_at?: string
        }
        Update: {
          definition?: Json
          practitioner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          consultation_id: string
          created_at: string
          id: string
          job_id: string
          status: string
          template: Json
          transcript_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          consultation_id: string
          created_at?: string
          id?: string
          job_id: string
          status?: string
          template: Json
          transcript_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          consultation_id?: string
          created_at?: string
          id?: string
          job_id?: string
          status?: string
          template?: Json
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "form_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          confidence: number | null
          end_seconds: number
          id: string
          machine_text: string
          overlap: boolean | null
          position: number
          possibly_not_speech: boolean
          review_status: string
          reviewed_text: string | null
          speaker: Database["public"]["Enums"]["speaker"]
          start_seconds: number
          transcript_id: string
        }
        Insert: {
          confidence?: number | null
          end_seconds: number
          id: string
          machine_text: string
          overlap?: boolean | null
          position: number
          possibly_not_speech?: boolean
          review_status?: string
          reviewed_text?: string | null
          speaker: Database["public"]["Enums"]["speaker"]
          start_seconds: number
          transcript_id: string
        }
        Update: {
          confidence?: number | null
          end_seconds?: number
          id?: string
          machine_text?: string
          overlap?: boolean | null
          position?: number
          possibly_not_speech?: boolean
          review_status?: string
          reviewed_text?: string | null
          speaker?: Database["public"]["Enums"]["speaker"]
          start_seconds?: number
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_jobs: {
        Row: {
          attempt: number
          claimed_at: string | null
          consultation_id: string
          engine_user_id: string | null
          error_category: string | null
          failed_speaker: Database["public"]["Enums"]["speaker"] | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          metrics: Json
          queued_at: string
          requested_by: string
          stage: Database["public"]["Enums"]["job_stage"] | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempt?: number
          claimed_at?: string | null
          consultation_id: string
          engine_user_id?: string | null
          error_category?: string | null
          failed_speaker?: Database["public"]["Enums"]["speaker"] | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          queued_at?: string
          requested_by: string
          stage?: Database["public"]["Enums"]["job_stage"] | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempt?: number
          claimed_at?: string | null
          consultation_id?: string
          engine_user_id?: string | null
          error_category?: string | null
          failed_speaker?: Database["public"]["Enums"]["speaker"] | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          queued_at?: string
          requested_by?: string
          stage?: Database["public"]["Enums"]["job_stage"] | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          consultation_id: string
          created_at: string
          id: string
          job_id: string
          low_confidence_threshold: number
          ordering: Database["public"]["Enums"]["transcript_ordering"]
          review_status: Database["public"]["Enums"]["transcript_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: string
          tracks: Json
        }
        Insert: {
          consultation_id: string
          created_at?: string
          id?: string
          job_id: string
          low_confidence_threshold: number
          ordering: Database["public"]["Enums"]["transcript_ordering"]
          review_status?: Database["public"]["Enums"]["transcript_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version: string
          tracks: Json
        }
        Update: {
          consultation_id?: string
          created_at?: string
          id?: string
          job_id?: string
          low_confidence_threshold?: number
          ordering?: Database["public"]["Enums"]["transcript_ordering"]
          review_status?: Database["public"]["Enums"]["transcript_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: string
          tracks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "transcription_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_form: { Args: { p_form_id: string }; Returns: Json }
      cancel_transcription: {
        Args: { p_consultation_id: string }
        Returns: Json
      }
      confirm_audio_deleted: {
        Args: { p_consultation_id: string }
        Returns: Json
      }
      create_consultation: {
        Args: {
          p_consent_recorded: boolean
          p_fee_cents?: number
          p_language: Database["public"]["Enums"]["consultation_language"]
          p_scenario_notes?: string
          p_scheduled_at: string
          p_synthetic_patient_ref: string
        }
        Returns: Json
      }
      declare_recorded_together: {
        Args: { p_consultation_id: string; p_recorded_together: boolean }
        Returns: Json
      }
      engine_claim_form_job: { Args: never; Returns: Json }
      engine_claim_job: { Args: never; Returns: Json }
      engine_complete_form_job: {
        Args: {
          p_answers: Json
          p_attempt: number
          p_job_id: string
          p_metrics?: Json
        }
        Returns: Json
      }
      engine_complete_job: {
        Args: {
          p_attempt: number
          p_job_id: string
          p_metrics?: Json
          p_transcript: Json
        }
        Returns: Json
      }
      engine_fail_form_job: {
        Args: { p_attempt: number; p_error_category: string; p_job_id: string }
        Returns: Json
      }
      engine_fail_job: {
        Args: {
          p_attempt: number
          p_error_category: string
          p_job_id: string
          p_metrics?: Json
          p_speaker?: Database["public"]["Enums"]["speaker"]
        }
        Returns: Json
      }
      engine_form_heartbeat: {
        Args: { p_attempt: number; p_job_id: string }
        Returns: Json
      }
      engine_heartbeat: {
        Args: {
          p_attempt: number
          p_audio_seconds?: number
          p_job_id: string
          p_stage: Database["public"]["Enums"]["job_stage"]
        }
        Returns: Json
      }
      engine_status: { Args: never; Returns: Json }
      invite_details: { Args: { p_token: string }; Returns: Json }
      record_consent: { Args: { p_consultation_id: string }; Returns: Json }
      record_payment: {
        Args: {
          p_amount_cents: number
          p_consultation_id: string
          p_session_id: string
        }
        Returns: Json
      }
      register_audio_track: {
        Args: {
          p_consultation_id: string
          p_duration_seconds?: number
          p_format: string
          p_sha256: string
          p_size_bytes: number
          p_speaker: Database["public"]["Enums"]["speaker"]
        }
        Returns: Json
      }
      register_engine: {
        Args: { p_label: string; p_user_id: string }
        Returns: undefined
      }
      remove_audio_track: {
        Args: {
          p_consultation_id: string
          p_speaker: Database["public"]["Enums"]["speaker"]
        }
        Returns: Json
      }
      review_form_answer: {
        Args: {
          p_decision: string
          p_field_key: string
          p_form_id: string
          p_text?: string
        }
        Returns: Json
      }
      set_form_template: { Args: { p_definition: Json }; Returns: Json }
      start_form: { Args: { p_consultation_id: string }; Returns: Json }
      start_transcription: {
        Args: { p_consultation_id: string }
        Returns: Json
      }
      verify_audit_chain: {
        Args: { p_consultation_id: string }
        Returns: boolean
      }
      withdraw_consent: { Args: { p_consultation_id: string }; Returns: Json }
    }
    Enums: {
      consultation_language: "en" | "de" | "sk" | "auto"
      consultation_status:
        | "consent_pending"
        | "ready_for_audio"
        | "audio_imported"
        | "transcription_processing"
        | "transcription_failed"
        | "transcript_ready"
        | "transcript_under_review"
        | "transcript_reviewed"
        | "extraction_processing"
        | "extraction_failed"
        | "draft_ready"
        | "under_review"
        | "approved"
        | "corrected"
        | "consent_withdrawn"
        | "archived"
      job_stage:
        | "validating"
        | "transcribing_practitioner"
        | "transcribing_patient"
        | "merging"
      job_status: "queued" | "processing" | "completed" | "failed" | "cancelled"
      speaker: "practitioner" | "patient"
      track_validation: "pending" | "valid" | "invalid"
      transcript_ordering: "exact" | "approximate"
      transcript_review_status:
        | "unreviewed"
        | "under_review"
        | "reviewed"
        | "superseded"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      consultation_language: ["en", "de", "sk", "auto"],
      consultation_status: [
        "consent_pending",
        "ready_for_audio",
        "audio_imported",
        "transcription_processing",
        "transcription_failed",
        "transcript_ready",
        "transcript_under_review",
        "transcript_reviewed",
        "extraction_processing",
        "extraction_failed",
        "draft_ready",
        "under_review",
        "approved",
        "corrected",
        "consent_withdrawn",
        "archived",
      ],
      job_stage: [
        "validating",
        "transcribing_practitioner",
        "transcribing_patient",
        "merging",
      ],
      job_status: ["queued", "processing", "completed", "failed", "cancelled"],
      speaker: ["practitioner", "patient"],
      track_validation: ["pending", "valid", "invalid"],
      transcript_ordering: ["exact", "approximate"],
      transcript_review_status: [
        "unreviewed",
        "under_review",
        "reviewed",
        "superseded",
      ],
    },
  },
} as const

