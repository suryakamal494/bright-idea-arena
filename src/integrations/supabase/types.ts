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
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          link: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          link?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_assignments: {
        Row: {
          created_at: string
          id: string
          judge_id: string
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          judge_id: string
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          judge_id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_revocations: {
        Row: {
          created_at: string
          restricted: boolean
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          restricted?: boolean
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          restricted?: boolean
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_revocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string
          email: string
          full_name: string
          grade: number | null
          id: string
          parent_email: string | null
          phone: string | null
          school_name: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          grade?: number | null
          id: string
          parent_email?: string | null
          phone?: string | null
          school_name?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          grade?: number | null
          id?: string
          parent_email?: string | null
          phone?: string | null
          school_name?: string | null
        }
        Relationships: []
      }
      rubric_criteria: {
        Row: {
          description: string | null
          id: string
          max_score: number
          name: string
          sort_order: number
          track_id: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          max_score?: number
          name: string
          sort_order?: number
          track_id?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          max_score?: number
          name?: string
          sort_order?: number
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          criterion_scores: Json
          feedback: string | null
          id: string
          judge_id: string
          submission_id: string
          submitted: boolean
          updated_at: string
        }
        Insert: {
          criterion_scores?: Json
          feedback?: string | null
          id?: string
          judge_id: string
          submission_id: string
          submitted?: boolean
          updated_at?: string
        }
        Update: {
          criterion_scores?: Json
          feedback?: string | null
          id?: string
          judge_id?: string
          submission_id?: string
          submitted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_settings: {
        Row: {
          id: string
          stage1_deadline: string | null
          stage1_open: boolean
          stage2_deadline: string | null
          stage2_open: boolean
          track_id: string | null
        }
        Insert: {
          id?: string
          stage1_deadline?: string | null
          stage1_open?: boolean
          stage2_deadline?: string | null
          stage2_open?: boolean
          track_id?: string | null
        }
        Update: {
          id?: string
          stage1_deadline?: string | null
          stage1_open?: boolean
          stage2_deadline?: string | null
          stage2_open?: boolean
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_settings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: true
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_files: {
        Row: {
          created_at: string
          id: string
          name: string
          submission_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          submission_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          submission_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          evidence_links: string | null
          id: string
          links: string | null
          methodology: string | null
          problem_statement: string | null
          prototype_status: string | null
          sdg_tags: string[] | null
          stage: number
          status: string
          submitted_at: string | null
          team_code: string | null
          team_id: string
          technical_reasoning: string | null
          test_outcomes: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          evidence_links?: string | null
          id?: string
          links?: string | null
          methodology?: string | null
          problem_statement?: string | null
          prototype_status?: string | null
          sdg_tags?: string[] | null
          stage: number
          status?: string
          submitted_at?: string | null
          team_code?: string | null
          team_id: string
          technical_reasoning?: string | null
          test_outcomes?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          evidence_links?: string | null
          id?: string
          links?: string | null
          methodology?: string | null
          problem_statement?: string | null
          prototype_status?: string | null
          sdg_tags?: string[] | null
          stage?: number
          status?: string
          submitted_at?: string | null
          team_code?: string | null
          team_id?: string
          technical_reasoning?: string | null
          test_outcomes?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          is_captain: boolean
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_captain?: boolean
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_captain?: boolean
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_id: string | null
          created_at: string
          id: string
          join_code: string
          locked: boolean
          name: string
          team_code: string | null
          track_id: string | null
        }
        Insert: {
          captain_id?: string | null
          created_at?: string
          id?: string
          join_code: string
          locked?: boolean
          name: string
          team_code?: string | null
          track_id?: string | null
        }
        Update: {
          captain_id?: string | null
          created_at?: string
          id?: string
          join_code?: string
          locked?: boolean
          name?: string
          team_code?: string | null
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_team: {
        Args: { p_name: string; p_track_id: string }
        Returns: {
          captain_id: string | null
          created_at: string
          id: string
          join_code: string
          locked: boolean
          name: string
          team_code: string | null
          track_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disband_team: { Args: never; Returns: undefined }
      effective_stage_settings: {
        Args: { p_stage: number; p_track_id: string }
        Returns: Record<string, unknown>
      }
      generate_team_code: { Args: { p_slug: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_school_coordinator: { Args: { _school: string }; Returns: boolean }
      is_team_coordinator: {
        Args: { _team_id: string; _uid: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      join_team: {
        Args: { p_code: string }
        Returns: {
          captain_id: string | null
          created_at: string
          id: string
          join_code: string
          locked: boolean
          name: string
          team_code: string | null
          track_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_team: { Args: never; Returns: undefined }
      request_coordinator_role: { Args: never; Returns: undefined }
      revoke_parent_access: { Args: { p_token: string }; Returns: boolean }
      transfer_captaincy: { Args: { p_user_id: string }; Returns: undefined }
      upsert_submission: {
        Args: { p_payload: Json; p_stage: number; p_submit?: boolean }
        Returns: {
          evidence_links: string | null
          id: string
          links: string | null
          methodology: string | null
          problem_statement: string | null
          prototype_status: string | null
          sdg_tags: string[] | null
          stage: number
          status: string
          submitted_at: string | null
          team_code: string | null
          team_id: string
          technical_reasoning: string | null
          test_outcomes: string | null
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "student" | "coordinator" | "judge" | "admin" | "mentor"
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
  public: {
    Enums: {
      app_role: ["student", "coordinator", "judge", "admin", "mentor"],
    },
  },
} as const
