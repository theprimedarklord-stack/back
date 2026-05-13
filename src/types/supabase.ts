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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      ai_chat_settings: {
        Row: {
          created_at: string | null
          id: number
          max_tokens: number | null
          model: string
          provider: string
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          max_tokens?: number | null
          model: string
          provider?: string
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          max_tokens?: number | null
          model?: string
          provider?: string
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_outline_settings: {
        Row: {
          auto_scroll: boolean | null
          connections_enabled: boolean | null
          created_at: string | null
          default_actions: Json | null
          id: number
          model: string
          provider: string
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_scroll?: boolean | null
          connections_enabled?: boolean | null
          created_at?: string | null
          default_actions?: Json | null
          id?: number
          model: string
          provider?: string
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_scroll?: boolean | null
          connections_enabled?: boolean | null
          created_at?: string | null
          default_actions?: Json | null
          id?: number
          model?: string
          provider?: string
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_outline_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_recommendations_cache: {
        Row: {
          cache_key: string
          context_hash: string
          created_at: string | null
          expires_at: string
          goal_id: number | null
          id: number
          model_used: string
          recommendations: Json
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          cache_key: string
          context_hash: string
          created_at?: string | null
          expires_at: string
          goal_id?: number | null
          id?: number
          model_used: string
          recommendations: Json
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          cache_key?: string
          context_hash?: string
          created_at?: string | null
          expires_at?: string
          goal_id?: number | null
          id?: number
          model_used?: string
          recommendations?: Json
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_cache_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          context: Json | null
          created_at: string | null
          enabled: boolean | null
          format: Json | null
          id: number
          language: string | null
          max_tokens: number | null
          model: string | null
          provider: string | null
          recommendation_type: Json | null
          recommendations_count: number | null
          temperature: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          format?: Json | null
          id?: number
          language?: string | null
          max_tokens?: number | null
          model?: string | null
          provider?: string | null
          recommendation_type?: Json | null
          recommendations_count?: number | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          format?: Json | null
          id?: number
          language?: string | null
          max_tokens?: number | null
          model?: string | null
          provider?: string | null
          recommendation_type?: Json | null
          recommendations_count?: number | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      card_images: {
        Row: {
          card_id: number
          created_at: string | null
          id: number
          image_url: string
          side: string
        }
        Insert: {
          card_id: number
          created_at?: string | null
          id?: number
          image_url: string
          side: string
        }
        Update: {
          card_id?: number
          created_at?: string | null
          id?: number
          image_url?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_images_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_reviews: {
        Row: {
          card_id: number | null
          current_zone: number | null
          finished_at: string | null
          id: number
          is_correct: boolean | null
          mode: string | null
          next_zone: number | null
          notes: string | null
          started_at: string | null
          time_spent: string | null
          user_id: string | null
        }
        Insert: {
          card_id?: number | null
          current_zone?: number | null
          finished_at?: string | null
          id?: number
          is_correct?: boolean | null
          mode?: string | null
          next_zone?: number | null
          notes?: string | null
          started_at?: string | null
          time_spent?: string | null
          user_id?: string | null
        }
        Update: {
          card_id?: number | null
          current_zone?: number | null
          finished_at?: string | null
          id?: number
          is_correct?: boolean | null
          mode?: string | null
          next_zone?: number | null
          notes?: string | null
          started_at?: string | null
          time_spent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      card_zone_history: {
        Row: {
          card_id: number | null
          changed_at: string | null
          id: number
          user_id: string | null
          zone: number | null
        }
        Insert: {
          card_id?: number | null
          changed_at?: string | null
          id?: number
          user_id?: string | null
          zone?: number | null
        }
        Update: {
          card_id?: number | null
          changed_at?: string | null
          id?: number
          user_id?: string | null
          zone?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_zone_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_zone_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cards: {
        Row: {
          card_class: string | null
          created_at: string
          current_streak: number | null
          description: string | null
          essence: string | null
          failed_reviews: number | null
          id: number
          is_archived: boolean | null
          is_edited: boolean | null
          last_edited_at: string | null
          last_reviewed_at: string | null
          links: string | null
          name: string | null
          next_review_at: string | null
          organization_id: string | null
          subject: string | null
          successful_reviews: number | null
          tag: string | null
          timezone: string | null
          type: string | null
          user_id: string | null
          zone: number | null
        }
        Insert: {
          card_class?: string | null
          created_at?: string
          current_streak?: number | null
          description?: string | null
          essence?: string | null
          failed_reviews?: number | null
          id?: number
          is_archived?: boolean | null
          is_edited?: boolean | null
          last_edited_at?: string | null
          last_reviewed_at?: string | null
          links?: string | null
          name?: string | null
          next_review_at?: string | null
          organization_id?: string | null
          subject?: string | null
          successful_reviews?: number | null
          tag?: string | null
          timezone?: string | null
          type?: string | null
          user_id?: string | null
          zone?: number | null
        }
        Update: {
          card_class?: string | null
          created_at?: string
          current_streak?: number | null
          description?: string | null
          essence?: string | null
          failed_reviews?: number | null
          id?: number
          is_archived?: boolean | null
          is_edited?: boolean | null
          last_edited_at?: string | null
          last_reviewed_at?: string | null
          links?: string | null
          name?: string | null
          next_review_at?: string | null
          organization_id?: string | null
          subject?: string | null
          successful_reviews?: number | null
          tag?: string | null
          timezone?: string | null
          type?: string | null
          user_id?: string | null
          zone?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      goal_subgoals: {
        Row: {
          ai_metadata: Json | null
          completed: boolean | null
          created_at: string | null
          generated_by: string | null
          goal_id: number | null
          id: number
          text: string
        }
        Insert: {
          ai_metadata?: Json | null
          completed?: boolean | null
          created_at?: string | null
          generated_by?: string | null
          goal_id?: number | null
          id?: number
          text: string
        }
        Update: {
          ai_metadata?: Json | null
          completed?: boolean | null
          created_at?: string | null
          generated_by?: string | null
          goal_id?: number | null
          id?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_subgoals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          ai_metadata: Json | null
          category: string | null
          confidence: number | null
          created_at: string | null
          deadline: string | null
          description: string
          generated_by: string | null
          id: number
          keywords: string[] | null
          priority: string | null
          project_id: number | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_metadata?: Json | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          deadline?: string | null
          description: string
          generated_by?: string | null
          id?: number
          keywords?: string[] | null
          priority?: string | null
          project_id?: number | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_metadata?: Json | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          deadline?: string | null
          description?: string
          generated_by?: string | null
          id?: number
          keywords?: string[] | null
          priority?: string | null
          project_id?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_card_history: {
        Row: {
          created_at: string | null
          id: number
          map_card_id: number
          operation_data: Json
          operation_type: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          map_card_id: number
          operation_data: Json
          operation_type: string
          user_id: string
          version: number
        }
        Update: {
          created_at?: string | null
          id?: number
          map_card_id?: number
          operation_data?: Json
          operation_type?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_card_history_map_card_id_fkey"
            columns: ["map_card_id"]
            isOneToOne: false
            referencedRelation: "map_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_card_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      map_cards: {
        Row: {
          aliases: string | null
          card_id: number | null
          created_at: string | null
          created_date: string | null
          data_core: Json
          id: number
          main_idea: string | null
          manual_links: string | null
          note_type: string | null
          organization_id: string | null
          own_understanding: string | null
          source: string | null
          tags: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aliases?: string | null
          card_id?: number | null
          created_at?: string | null
          created_date?: string | null
          data_core: Json
          id?: number
          main_idea?: string | null
          manual_links?: string | null
          note_type?: string | null
          organization_id?: string | null
          own_understanding?: string | null
          source?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aliases?: string | null
          card_id?: number | null
          created_at?: string | null
          created_date?: string | null
          data_core?: Json
          id?: number
          main_idea?: string | null
          manual_links?: string | null
          note_type?: string | null
          organization_id?: string | null
          own_understanding?: string | null
          source?: string | null
          tags?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_delivered: boolean | null
          is_read: boolean | null
          receiver_id: string
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_delivered?: boolean | null
          is_read?: boolean | null
          receiver_id: string
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_delivered?: boolean | null
          is_read?: boolean | null
          receiver_id?: string
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          content: string | null
          id: string
          read: boolean | null
          timestamp: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          read?: boolean | null
          timestamp?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          read?: boolean | null
          timestamp?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      org_feature_flags: {
        Row: {
          flags: Json
          org_id: string
          updated_at: string | null
        }
        Insert: {
          flags?: Json
          org_id: string
          updated_at?: string | null
        }
        Update: {
          flags?: Json
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_feature_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_limits: {
        Row: {
          limits: Json
          org_id: string
          updated_at: string | null
        }
        Insert: {
          limits?: Json
          org_id: string
          updated_at?: string | null
        }
        Update: {
          limits?: Json
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_organization_members: {
        Row: {
          created_at: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      org_organizations: {
        Row: {
          color: string | null
          created_at: string | null
          created_by_user_id: string
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by_user_id: string
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by_user_id?: string
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_organizations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      org_permissions: {
        Row: {
          action: string
          entity_type: string
          id: number
          role: string
        }
        Insert: {
          action: string
          entity_type: string
          id?: number
          role: string
        }
        Update: {
          action?: string
          entity_type?: string
          id?: number
          role?: string
        }
        Relationships: []
      }
      org_project_members: {
        Row: {
          created_at: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "org_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      org_projects: {
        Row: {
          created_at: string | null
          created_by_user_id: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          created_by_user_id: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_projects_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "org_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          id: number
          keywords: string[] | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: number
          keywords?: string[] | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: number
          keywords?: string[] | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          confidence: number | null
          created_at: string | null
          entity_type: string
          goal_id: number | null
          id: number
          model_used: string | null
          payload: Json
          project_id: number | null
          prompt_version: string | null
          source: string
          status: string | null
          task_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence?: number | null
          created_at?: string | null
          entity_type?: string
          goal_id?: number | null
          id?: number
          model_used?: string | null
          payload: Json
          project_id?: number | null
          prompt_version?: string | null
          source?: string
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence?: number | null
          created_at?: string | null
          entity_type?: string
          goal_id?: number | null
          id?: number
          model_used?: string | null
          payload?: Json
          project_id?: number | null
          prompt_version?: string | null
          source?: string
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_card_links: {
        Row: {
          card_id: number
          created_at: string | null
          id: number
          task_id: string
        }
        Insert: {
          card_id: number
          created_at?: string | null
          id?: number
          task_id: string
        }
        Update: {
          card_id?: number
          created_at?: string | null
          id?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_card_links_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_card_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_cards: {
        Row: {
          actions: Json | null
          activity_history: Json | null
          additional_content: string | null
          attachments: string[] | null
          category: string | null
          column_id: string | null
          content: string | null
          created_at: string
          custom_color: string | null
          description: string | null
          id: number
          is_active: boolean | null
          links: string[] | null
          notification_sent: boolean | null
          priority: string | null
          reminder_date: string
          repeat_frequency: string | null
          tags: string[] | null
          timezone: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          actions?: Json | null
          activity_history?: Json | null
          additional_content?: string | null
          attachments?: string[] | null
          category?: string | null
          column_id?: string | null
          content?: string | null
          created_at?: string
          custom_color?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          links?: string[] | null
          notification_sent?: boolean | null
          priority?: string | null
          reminder_date: string
          repeat_frequency?: string | null
          tags?: string[] | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          actions?: Json | null
          activity_history?: Json | null
          additional_content?: string | null
          attachments?: string[] | null
          category?: string | null
          column_id?: string | null
          content?: string | null
          created_at?: string
          custom_color?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          links?: string[] | null
          notification_sent?: boolean | null
          priority?: string | null
          reminder_date?: string
          repeat_frequency?: string | null
          tags?: string[] | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          ai_metadata: Json | null
          confidence: number | null
          created_at: string | null
          deadline: string | null
          description: string
          generated_by: string | null
          goal_id: number | null
          id: string
          priority: string | null
          status: string
          status_history: Json | null
          subgoal_id: number | null
          topic: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_metadata?: Json | null
          confidence?: number | null
          created_at?: string | null
          deadline?: string | null
          description: string
          generated_by?: string | null
          goal_id?: number | null
          id?: string
          priority?: string | null
          status?: string
          status_history?: Json | null
          subgoal_id?: number | null
          topic: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_metadata?: Json | null
          confidence?: number | null
          created_at?: string | null
          deadline?: string | null
          description?: string
          generated_by?: string | null
          goal_id?: number | null
          id?: string
          priority?: string | null
          status?: string
          status_history?: Json | null
          subgoal_id?: number | null
          topic?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_subgoal_id_fkey"
            columns: ["subgoal_id"]
            isOneToOne: false
            referencedRelation: "goal_subgoals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          animation_reduced: boolean | null
          auto_save_interval_sec: number | null
          calendar_view: string | null
          compact_mode: boolean | null
          created_at: string | null
          custom_accent_color: string | null
          date_format: string | null
          default_landing_page: string | null
          enable_beta_features: boolean | null
          font_size: number | null
          high_contrast_mode: boolean | null
          keyboard_shortcuts: boolean | null
          language: string | null
          on_this_page_display_mode: string | null
          preferred_card_view: string | null
          preferred_layout: string | null
          reduce_motion: boolean | null
          remember_last_section: boolean | null
          show_tooltips: boolean | null
          sidebar_mode: string | null
          sidebar_width: number | null
          sound_enabled: boolean | null
          theme: string | null
          time_format: string | null
          timezone: string | null
          tts_enabled: boolean | null
          user_id: string
        }
        Insert: {
          animation_reduced?: boolean | null
          auto_save_interval_sec?: number | null
          calendar_view?: string | null
          compact_mode?: boolean | null
          created_at?: string | null
          custom_accent_color?: string | null
          date_format?: string | null
          default_landing_page?: string | null
          enable_beta_features?: boolean | null
          font_size?: number | null
          high_contrast_mode?: boolean | null
          keyboard_shortcuts?: boolean | null
          language?: string | null
          on_this_page_display_mode?: string | null
          preferred_card_view?: string | null
          preferred_layout?: string | null
          reduce_motion?: boolean | null
          remember_last_section?: boolean | null
          show_tooltips?: boolean | null
          sidebar_mode?: string | null
          sidebar_width?: number | null
          sound_enabled?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          tts_enabled?: boolean | null
          user_id: string
        }
        Update: {
          animation_reduced?: boolean | null
          auto_save_interval_sec?: number | null
          calendar_view?: string | null
          compact_mode?: boolean | null
          created_at?: string | null
          custom_accent_color?: string | null
          date_format?: string | null
          default_landing_page?: string | null
          enable_beta_features?: boolean | null
          font_size?: number | null
          high_contrast_mode?: boolean | null
          keyboard_shortcuts?: boolean | null
          language?: string | null
          on_this_page_display_mode?: string | null
          preferred_card_view?: string | null
          preferred_layout?: string | null
          reduce_motion?: boolean | null
          remember_last_section?: boolean | null
          show_tooltips?: boolean | null
          sidebar_mode?: string | null
          sidebar_width?: number | null
          sound_enabled?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          tts_enabled?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          cognito_sub: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: number
          is_admin: boolean
          last_active_org_id: string | null
          role: string | null
          theme: string | null
          theme_index: number | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          cognito_sub?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: number
          is_admin?: boolean
          last_active_org_id?: string | null
          role?: string | null
          theme?: string | null
          theme_index?: number | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          cognito_sub?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: number
          is_admin?: boolean
          last_active_org_id?: string | null
          role?: string | null
          theme?: string | null
          theme_index?: number | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_last_active_org_id_fkey"
            columns: ["last_active_org_id"]
            isOneToOne: false
            referencedRelation: "org_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedbacks: {
        Row: {
          id: number
          user_id: string | null
          type: string
          message: string
          contact: string | null
          url: string | null
          status: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: number
          user_id?: string | null
          type: string
          message: string
          contact?: string | null
          url?: string | null
          status?: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string | null
          type?: string
          message?: string
          contact?: string | null
          url?: string | null
          status?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedbacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_private_chat: {
        Args: { user1: string; user2: string }
        Returns: {
          id: string
        }[]
      }
      get_app_org_id: { Args: never; Returns: string }
      get_current_user_id: { Args: never; Returns: string }
      set_rls_context: {
        Args: { p_org_id?: string; p_user_id: string }
        Returns: undefined
      }
      user_has_org_role: {
        Args: { org_id: string; required_roles: string[] }
        Returns: boolean
      }
      user_has_project_role: {
        Args: { proj_id: string; required_roles: string[] }
        Returns: boolean
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
