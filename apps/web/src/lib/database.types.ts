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
          id: string
          language: Database["public"]["Enums"]["consultation_language"]
          practitioner_id: string
          recorded_together: boolean
          scenario_notes: string
          scheduled_at: string
          status: Database["public"]["Enums"]["consultation_status"]
          synthetic_patient_ref: string
          updated_at: string
        }
        Insert: {
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          consent_withdrawn_at?: string | null
          consent_withdrawn_by?: string | null
          created_at?: string
          id?: string
          language: Database["public"]["Enums"]["consultation_language"]
          practitioner_id: string
          recorded_together?: boolean
          scenario_notes?: string
          scheduled_at: string
          status: Database["public"]["Enums"]["consultation_status"]
          synthetic_patient_ref: string
          updated_at?: string
        }
        Update: {
          consent_recorded_at?: string | null
          consent_recorded_by?: string | null
          consent_withdrawn_at?: string | null
          consent_withdrawn_by?: string | null
          created_at?: string
          id?: string
          language?: Database["public"]["Enums"]["consultation_language"]
          practitioner_id?: string
          recorded_together?: boolean
          scenario_notes?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["consultation_status"]
          synthetic_patient_ref?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_consultation: {
        Args: {
          p_consent_recorded: boolean
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
      record_consent: { Args: { p_consultation_id: string }; Returns: Json }
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
      remove_audio_track: {
        Args: {
          p_consultation_id: string
          p_speaker: Database["public"]["Enums"]["speaker"]
        }
        Returns: Json
      }
      verify_audit_chain: {
        Args: { p_consultation_id: string }
        Returns: boolean
      }
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
      speaker: "practitioner" | "patient"
      track_validation: "pending" | "valid" | "invalid"
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
      speaker: ["practitioner", "patient"],
      track_validation: ["pending", "valid", "invalid"],
    },
  },
} as const

