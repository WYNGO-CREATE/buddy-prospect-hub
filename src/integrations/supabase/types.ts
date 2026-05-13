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
      call_logs: {
        Row: {
          called_at: string
          created_at: string
          duration_minutes: number | null
          id: string
          outcome: string | null
          owner_id: string
          prospect_id: string
          summary: string | null
        }
        Insert: {
          called_at?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          outcome?: string | null
          owner_id: string
          prospect_id: string
          summary?: string | null
        }
        Update: {
          called_at?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          outcome?: string | null
          owner_id?: string
          prospect_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          owner_id: string
          prospect_id: string
          reason: string | null
          scheduled_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          owner_id: string
          prospect_id: string
          reason?: string | null
          scheduled_at: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          owner_id?: string
          prospect_id?: string
          reason?: string | null
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      prospect_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          prospect_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          prospect_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          prospect_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_comments_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          owner_id: string
          payload: Json | null
          prospect_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          owner_id: string
          payload?: Json | null
          prospect_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          owner_id?: string
          payload?: Json | null
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_events_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["prospect_status"]
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id: string
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      find_prospect_duplicates: {
        Args: {
          _email?: string
          _exclude_id?: string
          _phone?: string
          _website?: string
        }
        Returns: {
          company: string
          email: string
          first_name: string
          id: string
          last_name: string
          match_email: boolean
          match_phone: boolean
          match_website: boolean
          owner_id: string
          owner_name: string
          phone: string
          status: Database["public"]["Enums"]["prospect_status"]
          website: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      leaderboard_month: {
        Args: never
        Returns: {
          calls_count: number
          converted_count: number
          owner_id: string
          owner_name: string
          prospects_count: number
        }[]
      }
      search_prospects: {
        Args: { _limit?: number; _q: string }
        Returns: {
          company: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          website: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "collaborator"
      prospect_status:
        | "nouveau"
        | "en_cours"
        | "interesse"
        | "converti"
        | "perdu"
        | "a_relancer"
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
    Enums: {
      app_role: ["admin", "collaborator"],
      prospect_status: [
        "nouveau",
        "en_cours",
        "interesse",
        "converti",
        "perdu",
        "a_relancer",
      ],
    },
  },
} as const
