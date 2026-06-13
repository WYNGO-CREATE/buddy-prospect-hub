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
      agency_settings: {
        Row: {
          activity: string | null
          business_brief: string | null
          call_donts: string | null
          call_dos: string | null
          default_tone: string | null
          id: boolean
          logo_url: string | null
          name: string
          philosophy: string | null
          target_client: string | null
          updated_at: string
          value_props: string | null
          website_url: string | null
        }
        Insert: {
          activity?: string | null
          business_brief?: string | null
          call_donts?: string | null
          call_dos?: string | null
          default_tone?: string | null
          id?: boolean
          logo_url?: string | null
          name?: string
          philosophy?: string | null
          target_client?: string | null
          updated_at?: string
          value_props?: string | null
          website_url?: string | null
        }
        Update: {
          activity?: string | null
          business_brief?: string | null
          call_donts?: string | null
          call_dos?: string | null
          default_tone?: string | null
          id?: boolean
          logo_url?: string | null
          name?: string
          philosophy?: string | null
          target_client?: string | null
          updated_at?: string
          value_props?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      ai_generations: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json
          kind: string
          model: string | null
          output: Json | null
          owner_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input: Json
          kind: string
          model?: string | null
          output?: Json | null
          owner_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          kind?: string
          model?: string | null
          output?: Json | null
          owner_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          address: string | null
          bic: string | null
          city: string | null
          custom_mentions: string | null
          default_vat_rate: number
          email: string | null
          iban: string | null
          id: boolean
          is_ei: boolean
          late_penalty: string | null
          legal_form: string | null
          legal_name: string | null
          logo_url: string | null
          payment_terms_days: number
          phone: string | null
          postal_code: string | null
          rne_registered: boolean
          siret: string | null
          trade_name: string | null
          updated_at: string
          vat_number: string | null
          vat_regime: string
        }
        Insert: {
          address?: string | null
          bic?: string | null
          city?: string | null
          custom_mentions?: string | null
          default_vat_rate?: number
          email?: string | null
          iban?: string | null
          id?: boolean
          is_ei?: boolean
          late_penalty?: string | null
          legal_form?: string | null
          legal_name?: string | null
          logo_url?: string | null
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          rne_registered?: boolean
          siret?: string | null
          trade_name?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_regime?: string
        }
        Update: {
          address?: string | null
          bic?: string | null
          city?: string | null
          custom_mentions?: string | null
          default_vat_rate?: number
          email?: string | null
          iban?: string | null
          id?: boolean
          is_ei?: boolean
          late_penalty?: string | null
          legal_form?: string | null
          legal_name?: string | null
          logo_url?: string | null
          payment_terms_days?: number
          phone?: string | null
          postal_code?: string | null
          rne_registered?: boolean
          siret?: string | null
          trade_name?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_regime?: string
        }
        Relationships: []
      }
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
      call_scripts: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          is_shared: boolean
          kind: Database["public"]["Enums"]["call_script_kind"]
          owner_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_shared?: boolean
          kind: Database["public"]["Enums"]["call_script_kind"]
          owner_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_shared?: boolean
          kind?: Database["public"]["Enums"]["call_script_kind"]
          owner_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_sites: {
        Row: {
          created_at: string
          custom_domain: string | null
          domain_status: string | null
          html: string | null
          html_path: string | null
          id: string
          owner_id: string
          preview_id: string | null
          prospect_id: string
          published_at: string | null
          slug: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          domain_status?: string | null
          html?: string | null
          html_path?: string | null
          id?: string
          owner_id: string
          preview_id?: string | null
          prospect_id: string
          published_at?: string | null
          slug?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          domain_status?: string | null
          html?: string | null
          html_path?: string | null
          id?: string
          owner_id?: string
          preview_id?: string | null
          prospect_id?: string
          published_at?: string | null
          slug?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sites_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: false
            referencedRelation: "prospect_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sites_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          last_no: number
          type: string
          year: number
        }
        Insert: {
          last_no?: number
          type: string
          year: number
        }
        Update: {
          last_no?: number
          type?: string
          year?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_address: string | null
          client_city: string | null
          client_delivery_address: string | null
          client_email: string | null
          client_is_pro: boolean
          client_name: string | null
          client_postal_code: string | null
          client_siret: string | null
          converted_from: string | null
          created_at: string
          due_date: string | null
          id: string
          issue_date: string | null
          lines: Json
          notes: string | null
          number: string | null
          owner_id: string
          paid_at: string | null
          prospect_id: string | null
          sent_at: string | null
          service_date_text: string | null
          status: string
          total_ht: number
          total_ttc: number
          total_vat: number
          type: string
          updated_at: string
        }
        Insert: {
          client_address?: string | null
          client_city?: string | null
          client_delivery_address?: string | null
          client_email?: string | null
          client_is_pro?: boolean
          client_name?: string | null
          client_postal_code?: string | null
          client_siret?: string | null
          converted_from?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string | null
          lines?: Json
          notes?: string | null
          number?: string | null
          owner_id: string
          paid_at?: string | null
          prospect_id?: string | null
          sent_at?: string | null
          service_date_text?: string | null
          status?: string
          total_ht?: number
          total_ttc?: number
          total_vat?: number
          type: string
          updated_at?: string
        }
        Update: {
          client_address?: string | null
          client_city?: string | null
          client_delivery_address?: string | null
          client_email?: string | null
          client_is_pro?: boolean
          client_name?: string | null
          client_postal_code?: string | null
          client_siret?: string | null
          converted_from?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string | null
          lines?: Json
          notes?: string | null
          number?: string | null
          owner_id?: string
          paid_at?: string | null
          prospect_id?: string | null
          sent_at?: string | null
          service_date_text?: string | null
          status?: string
          total_ht?: number
          total_ttc?: number
          total_vat?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_converted_from_fkey"
            columns: ["converted_from"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          is_shared: boolean
          name: string
          owner_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          owner_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_verifications: {
        Row: {
          details: Json | null
          email: string
          expires_at: string
          provider: string
          raw_result: string | null
          status: string
          verified_at: string
        }
        Insert: {
          details?: Json | null
          email: string
          expires_at?: string
          provider?: string
          raw_result?: string | null
          status: string
          verified_at?: string
        }
        Update: {
          details?: Json | null
          email?: string
          expires_at?: string
          provider?: string
          raw_result?: string | null
          status?: string
          verified_at?: string
        }
        Relationships: []
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
      gmail_accounts: {
        Row: {
          access_token: string
          created_at: string
          email: string
          expires_at: string
          id: string
          is_active: boolean
          last_history_id: string | null
          last_sync_at: string | null
          refresh_token: string
          scope: string | null
          sync_error: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          last_sync_at?: string | null
          refresh_token: string
          scope?: string | null
          sync_error?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          last_sync_at?: string | null
          refresh_token?: string
          scope?: string | null
          sync_error?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          from_email: string | null
          id: string
          is_archived: boolean
          is_read: boolean
          occurred_at: string
          owner_id: string
          prospect_id: string | null
          recipient_email: string | null
          sender_email: string | null
          sender_name: string | null
          source: string
          subject: string | null
          thread_id: string | null
          to_email: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          from_email?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean
          occurred_at?: string
          owner_id: string
          prospect_id?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          source?: string
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          content?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          from_email?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean
          occurred_at?: string
          owner_id?: string
          prospect_id?: string | null
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          source?: string
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          lead_token: string | null
          phone: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          lead_token?: string | null
          phone?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          lead_token?: string | null
          phone?: string | null
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
      prospect_postcards: {
        Row: {
          address_line: string | null
          city: string | null
          country: string
          created_at: string
          error: string | null
          id: string
          message: string | null
          owner_id: string
          postal_code: string | null
          preview_url: string | null
          prospect_id: string
          provider: string
          provider_id: string | null
          recipient_name: string | null
          recto_image_url: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          country?: string
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          owner_id: string
          postal_code?: string | null
          preview_url?: string | null
          prospect_id: string
          provider?: string
          provider_id?: string | null
          recipient_name?: string | null
          recto_image_url?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          country?: string
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          owner_id?: string
          postal_code?: string | null
          preview_url?: string | null
          prospect_id?: string
          provider?: string
          provider_id?: string | null
          recipient_name?: string | null
          recto_image_url?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_postcards_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_previews: {
        Row: {
          expires_at: string
          generated_at: string
          generated_by: string | null
          html_url: string
          id: string
          model: string | null
          opened_at: string | null
          prospect_id: string
          sector: string | null
          slug: string
          source_data: Json
          template: string
          view_count: number
        }
        Insert: {
          expires_at?: string
          generated_at?: string
          generated_by?: string | null
          html_url: string
          id?: string
          model?: string | null
          opened_at?: string | null
          prospect_id: string
          sector?: string | null
          slug: string
          source_data?: Json
          template: string
          view_count?: number
        }
        Update: {
          expires_at?: string
          generated_at?: string
          generated_by?: string | null
          html_url?: string
          id?: string
          model?: string | null
          opened_at?: string | null
          prospect_id?: string
          sector?: string | null
          slug?: string
          source_data?: Json
          template?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "prospect_previews_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          apollo_id: string | null
          apollo_synced_at: string | null
          brief_activity: string | null
          brief_enriched_at: string | null
          brief_keywords: string[] | null
          brief_objective: string | null
          brief_tone: string | null
          company: string | null
          company_domain: string | null
          company_size: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          industry: string | null
          last_name: string
          linkedin_url: string | null
          location: string | null
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          photo_url: string | null
          seniority: string | null
          siret: string | null
          source: string | null
          status: Database["public"]["Enums"]["prospect_status"]
          tags: string[]
          title: string | null
          updated_at: string
          website: string | null
          website_checked_at: string | null
          website_score: number | null
          website_status: string | null
        }
        Insert: {
          apollo_id?: string | null
          apollo_synced_at?: string | null
          brief_activity?: string | null
          brief_enriched_at?: string | null
          brief_keywords?: string[] | null
          brief_objective?: string | null
          brief_tone?: string | null
          company?: string | null
          company_domain?: string | null
          company_size?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          industry?: string | null
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id: string
          phone?: string | null
          photo_url?: string | null
          seniority?: string | null
          siret?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          website?: string | null
          website_checked_at?: string | null
          website_score?: number | null
          website_status?: string | null
        }
        Update: {
          apollo_id?: string | null
          apollo_synced_at?: string | null
          brief_activity?: string | null
          brief_enriched_at?: string | null
          brief_keywords?: string[] | null
          brief_objective?: string | null
          brief_tone?: string | null
          company?: string | null
          company_domain?: string | null
          company_size?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          industry?: string | null
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          photo_url?: string | null
          seniority?: string | null
          siret?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          website?: string | null
          website_checked_at?: string | null
          website_score?: number | null
          website_status?: string | null
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
      workflow_run_events: {
        Row: {
          detail: string | null
          executed_at: string
          id: string
          run_id: string
          status: string
          step_id: string | null
        }
        Insert: {
          detail?: string | null
          executed_at?: string
          id?: string
          run_id: string
          status: string
          step_id?: string | null
        }
        Update: {
          detail?: string | null
          executed_at?: string
          id?: string
          run_id?: string
          status?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          current_step_id: string | null
          id: string
          last_error: string | null
          next_run_at: string | null
          owner_id: string
          prospect_id: string
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          current_step_id?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          owner_id: string
          prospect_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          current_step_id?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          owner_id?: string
          prospect_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          body: string | null
          created_at: string
          delay_days: number
          id: string
          kind: Database["public"]["Enums"]["workflow_step_kind"]
          position: number
          subject: string | null
          template_id: string | null
          workflow_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delay_days?: number
          id?: string
          kind: Database["public"]["Enums"]["workflow_step_kind"]
          position: number
          subject?: string | null
          template_id?: string | null
          workflow_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delay_days?: number
          id?: string
          kind?: Database["public"]["Enums"]["workflow_step_kind"]
          position?: number
          subject?: string | null
          template_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          trigger_status: Database["public"]["Enums"]["prospect_status"] | null
          trigger_type: Database["public"]["Enums"]["workflow_trigger"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          trigger_status?: Database["public"]["Enums"]["prospect_status"] | null
          trigger_type?: Database["public"]["Enums"]["workflow_trigger"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          trigger_status?: Database["public"]["Enums"]["prospect_status"] | null
          trigger_type?: Database["public"]["Enums"]["workflow_trigger"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      call_edge_function: { Args: { fn_name: string }; Returns: number }
      find_prospect_by_email: {
        Args: { p_email: string; p_owner_id: string }
        Returns: string
      }
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
      next_document_number: { Args: { p_type: string }; Returns: string }
      prospects_last_contact: {
        Args: never
        Returns: {
          last_contact_at: string
          prospect_id: string
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
      call_script_kind: "script" | "objection"
      message_channel: "email" | "linkedin" | "call" | "whatsapp" | "note"
      message_direction: "inbound" | "outbound"
      prospect_status:
        | "nouveau"
        | "en_cours"
        | "interesse"
        | "converti"
        | "perdu"
        | "a_relancer"
      workflow_run_status:
        | "running"
        | "completed"
        | "paused"
        | "cancelled"
        | "errored"
      workflow_step_kind: "email" | "linkedin_task" | "note" | "wait"
      workflow_trigger: "manual" | "on_status"
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
      app_role: ["admin", "collaborator"],
      call_script_kind: ["script", "objection"],
      message_channel: ["email", "linkedin", "call", "whatsapp", "note"],
      message_direction: ["inbound", "outbound"],
      prospect_status: [
        "nouveau",
        "en_cours",
        "interesse",
        "converti",
        "perdu",
        "a_relancer",
      ],
      workflow_run_status: [
        "running",
        "completed",
        "paused",
        "cancelled",
        "errored",
      ],
      workflow_step_kind: ["email", "linkedin_task", "note", "wait"],
      workflow_trigger: ["manual", "on_status"],
    },
  },
} as const
