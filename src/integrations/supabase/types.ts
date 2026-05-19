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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          requested_area: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          requested_area: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          requested_area?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      ad_anomalies: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          channel_id: string | null
          detected_at: string
          expected: number
          id: string
          kind: string
          metric: string
          narrative: string | null
          observed: number
          pct_change: number | null
          platform: string
          resolved_at: string | null
          scope_id: string | null
          scope_label: string | null
          scope_type: string
          severity: string
          std_dev: number | null
          suggested_action: string | null
          z_score: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel_id?: string | null
          detected_at?: string
          expected: number
          id?: string
          kind: string
          metric: string
          narrative?: string | null
          observed: number
          pct_change?: number | null
          platform: string
          resolved_at?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type: string
          severity: string
          std_dev?: number | null
          suggested_action?: string | null
          z_score?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel_id?: string | null
          detected_at?: string
          expected?: number
          id?: string
          kind?: string
          metric?: string
          narrative?: string | null
          observed?: number
          pct_change?: number | null
          platform?: string
          resolved_at?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type?: string
          severity?: string
          std_dev?: number | null
          suggested_action?: string | null
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_anomalies_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_channels: {
        Row: {
          api_endpoint: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          platform: string
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          platform: string
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      ad_execution_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          after_value: Json | null
          baseline_id: string | null
          before_value: Json | null
          campaign_id: string | null
          created_at: string
          delta_pct: number | null
          error_message: string | null
          executor: string | null
          guardrail_results: Json | null
          id: string
          platform: string | null
          recommendation_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          spend_impact_cents: number | null
          success: boolean
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: string
          after_value?: Json | null
          baseline_id?: string | null
          before_value?: Json | null
          campaign_id?: string | null
          created_at?: string
          delta_pct?: number | null
          error_message?: string | null
          executor?: string | null
          guardrail_results?: Json | null
          id?: string
          platform?: string | null
          recommendation_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          spend_impact_cents?: number | null
          success?: boolean
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          after_value?: Json | null
          baseline_id?: string | null
          before_value?: Json | null
          campaign_id?: string | null
          created_at?: string
          delta_pct?: number | null
          error_message?: string | null
          executor?: string | null
          guardrail_results?: Json | null
          id?: string
          platform?: string | null
          recommendation_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          spend_impact_cents?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ad_execution_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_execution_log_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "guardrail_baseline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_execution_log_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ad_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_forecasts: {
        Row: {
          channel_id: string | null
          confidence: number | null
          forecast_value: number
          generated_at: string
          horizon_days: number
          id: string
          lower_bound: number | null
          metric: string
          model: string
          narrative: string | null
          platform: string
          scope_id: string | null
          scope_label: string | null
          scope_type: string
          series: Json | null
          upper_bound: number | null
          valid_until: string | null
        }
        Insert: {
          channel_id?: string | null
          confidence?: number | null
          forecast_value: number
          generated_at?: string
          horizon_days: number
          id?: string
          lower_bound?: number | null
          metric: string
          model?: string
          narrative?: string | null
          platform: string
          scope_id?: string | null
          scope_label?: string | null
          scope_type: string
          series?: Json | null
          upper_bound?: number | null
          valid_until?: string | null
        }
        Update: {
          channel_id?: string | null
          confidence?: number | null
          forecast_value?: number
          generated_at?: string
          horizon_days?: number
          id?: string
          lower_bound?: number | null
          metric?: string
          model?: string
          narrative?: string | null
          platform?: string
          scope_id?: string | null
          scope_label?: string | null
          scope_type?: string
          series?: Json | null
          upper_bound?: number | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_forecasts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_frequency_rollup: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          channel_id: string
          computed_at: string
          conversions_30d: number
          conversions_7d: number
          id: string
          imp_per_conv_30d: number | null
          imp_per_conv_7d: number | null
          impressions_30d: number
          impressions_7d: number
          platform: string
          saturation_score: number
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          channel_id: string
          computed_at?: string
          conversions_30d?: number
          conversions_7d?: number
          id?: string
          imp_per_conv_30d?: number | null
          imp_per_conv_7d?: number | null
          impressions_30d?: number
          impressions_7d?: number
          platform: string
          saturation_score?: number
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          channel_id?: string
          computed_at?: string
          conversions_30d?: number
          conversions_7d?: number
          id?: string
          imp_per_conv_30d?: number | null
          imp_per_conv_7d?: number | null
          impressions_30d?: number
          impressions_7d?: number
          platform?: string
          saturation_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_frequency_rollup_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_guardrails: {
        Row: {
          auto_execute_enabled: boolean
          auto_execute_max_budget_change_pct: number
          auto_execute_max_impact_cents: number
          auto_execute_min_confidence: number
          channel_id: string
          daily_spend_cap_cents: number
          daily_spend_cap_multiplier: number
          max_24h_cumulative_delta_pct: number
          max_bid_change_pct: number
          max_budget_change_pct: number
          pause_window: string | null
          paused: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_execute_enabled?: boolean
          auto_execute_max_budget_change_pct?: number
          auto_execute_max_impact_cents?: number
          auto_execute_min_confidence?: number
          channel_id: string
          daily_spend_cap_cents?: number
          daily_spend_cap_multiplier?: number
          max_24h_cumulative_delta_pct?: number
          max_bid_change_pct?: number
          max_budget_change_pct?: number
          pause_window?: string | null
          paused?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_execute_enabled?: boolean
          auto_execute_max_budget_change_pct?: number
          auto_execute_max_impact_cents?: number
          auto_execute_min_confidence?: number
          channel_id?: string
          daily_spend_cap_cents?: number
          daily_spend_cap_multiplier?: number
          max_24h_cumulative_delta_pct?: number
          max_bid_change_pct?: number
          max_budget_change_pct?: number
          pause_window?: string | null
          paused?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_guardrails_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_guardrails_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_performance_daily: {
        Row: {
          channel_id: string
          clicks: number
          conversions: number
          cpa: number | null
          created_at: string
          date: string
          id: string
          impressions: number
          ingest_request_id: string | null
          revenue: number
          roas: number | null
          source: string
          spend: number
          updated_at: string
        }
        Insert: {
          channel_id: string
          clicks?: number
          conversions?: number
          cpa?: number | null
          created_at?: string
          date: string
          id?: string
          impressions?: number
          ingest_request_id?: string | null
          revenue?: number
          roas?: number | null
          source?: string
          spend?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string
          clicks?: number
          conversions?: number
          cpa?: number | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          ingest_request_id?: string | null
          revenue?: number
          roas?: number | null
          source?: string
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_performance_daily_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_performance_facts: {
        Row: {
          ad_group_id: string | null
          ad_group_name: string | null
          ad_id: string | null
          ad_name: string | null
          attribution_window: string | null
          audience_id: string | null
          audience_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          channel_id: string
          clicks: number
          conversions: number
          created_at: string
          creative_id: string | null
          creative_name: string | null
          date: string
          device: string | null
          dim_hash: string | null
          geo_country: string | null
          geo_dma: string | null
          geo_region: string | null
          geo_zip: string | null
          hour: number | null
          id: string
          impressions: number
          ingest_request_id: string | null
          network: string | null
          placement: string | null
          platform: string
          revenue: number
          source: string
          spend: number
          updated_at: string
          view_through_conversions: number
        }
        Insert: {
          ad_group_id?: string | null
          ad_group_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          attribution_window?: string | null
          audience_id?: string | null
          audience_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          channel_id: string
          clicks?: number
          conversions?: number
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          date: string
          device?: string | null
          dim_hash?: string | null
          geo_country?: string | null
          geo_dma?: string | null
          geo_region?: string | null
          geo_zip?: string | null
          hour?: number | null
          id?: string
          impressions?: number
          ingest_request_id?: string | null
          network?: string | null
          placement?: string | null
          platform: string
          revenue?: number
          source?: string
          spend?: number
          updated_at?: string
          view_through_conversions?: number
        }
        Update: {
          ad_group_id?: string | null
          ad_group_name?: string | null
          ad_id?: string | null
          ad_name?: string | null
          attribution_window?: string | null
          audience_id?: string | null
          audience_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          channel_id?: string
          clicks?: number
          conversions?: number
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          date?: string
          device?: string | null
          dim_hash?: string | null
          geo_country?: string | null
          geo_dma?: string | null
          geo_region?: string | null
          geo_zip?: string | null
          hour?: number | null
          id?: string
          impressions?: number
          ingest_request_id?: string | null
          network?: string | null
          placement?: string | null
          platform?: string
          revenue?: number
          source?: string
          spend?: number
          updated_at?: string
          view_through_conversions?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_performance_facts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_recommendations: {
        Row: {
          channel_id: string | null
          confidence: number
          created_at: string
          executed_at: string | null
          expires_at: string | null
          id: string
          ingest_request_id: string | null
          kind: string
          payload: Json
          projected_impact_cents: number
          rationale: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rollback_state: Json | null
          source: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          confidence?: number
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          ingest_request_id?: string | null
          kind: string
          payload?: Json
          projected_impact_cents?: number
          rationale?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rollback_state?: Json | null
          source?: string
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          confidence?: number
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          ingest_request_id?: string | null
          kind?: string
          payload?: Json
          projected_impact_cents?: number
          rationale?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rollback_state?: Json | null
          source?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_recommendations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_recommendations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_reconciliation_log: {
        Row: {
          channel_id: string | null
          created_at: string
          date: string
          flagged: boolean
          id: string
          lindy_value: number | null
          metric: string
          native_value: number | null
          variance_pct: number | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          date: string
          flagged?: boolean
          id?: string
          lindy_value?: number | null
          metric: string
          native_value?: number | null
          variance_pct?: number | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          date?: string
          flagged?: boolean
          id?: string
          lindy_value?: number | null
          metric?: string
          native_value?: number | null
          variance_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_reconciliation_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_saturation_curves: {
        Row: {
          channel_id: string | null
          current_daily_spend: number | null
          current_roas: number | null
          curve_points: Json
          efficient_spend_ceiling: number | null
          generated_at: string
          id: string
          platform: string
          reallocation_delta: number | null
          recommendation: string | null
          scope_id: string | null
          scope_label: string | null
          scope_type: string
          target_roas: number | null
        }
        Insert: {
          channel_id?: string | null
          current_daily_spend?: number | null
          current_roas?: number | null
          curve_points: Json
          efficient_spend_ceiling?: number | null
          generated_at?: string
          id?: string
          platform: string
          reallocation_delta?: number | null
          recommendation?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type: string
          target_roas?: number | null
        }
        Update: {
          channel_id?: string | null
          current_daily_spend?: number | null
          current_roas?: number | null
          curve_points?: Json
          efficient_spend_ceiling?: number | null
          generated_at?: string
          id?: string
          platform?: string
          reallocation_delta?: number | null
          recommendation?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type?: string
          target_roas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_saturation_curves_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ad_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_dispatch_log: {
        Row: {
          channel: string | null
          channels_sent: string[]
          created_at: string
          email_message_id: string | null
          error: string | null
          event_type: string
          id: string
          payload: Json
          sms_sid: string | null
          success: boolean
        }
        Insert: {
          channel?: string | null
          channels_sent?: string[]
          created_at?: string
          email_message_id?: string | null
          error?: string | null
          event_type: string
          id?: string
          payload?: Json
          sms_sid?: string | null
          success?: boolean
        }
        Update: {
          channel?: string | null
          channels_sent?: string[]
          created_at?: string
          email_message_id?: string | null
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          sms_sid?: string | null
          success?: boolean
        }
        Relationships: []
      }
      ambassador_event_rsvps: {
        Row: {
          attended: boolean
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          notes: string | null
          party_size: number
          phone: string | null
        }
        Insert: {
          attended?: boolean
          created_at?: string
          email: string
          event_id: string
          id?: string
          name: string
          notes?: string | null
          party_size?: number
          phone?: string | null
        }
        Update: {
          attended?: boolean
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          party_size?: number
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ambassador_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_events: {
        Row: {
          city: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          host_user_id: string
          id: string
          max_attendees: number | null
          slug: string
          starts_at: string
          state: string | null
          status: string
          street_address: string | null
          title: string
          updated_at: string
          venue_name: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          host_user_id: string
          id?: string
          max_attendees?: number | null
          slug: string
          starts_at: string
          state?: string | null
          status?: string
          street_address?: string | null
          title: string
          updated_at?: string
          venue_name?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          host_user_id?: string
          id?: string
          max_attendees?: number | null
          slug?: string
          starts_at?: string
          state?: string | null
          status?: string
          street_address?: string | null
          title?: string
          updated_at?: string
          venue_name?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      ambassador_profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          impact_tracking_url: string | null
          instagram: string | null
          photo_url: string | null
          rescue_partner_id: string | null
          status: string
          tiktok: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          handle: string
          id?: string
          impact_tracking_url?: string | null
          instagram?: string | null
          photo_url?: string | null
          rescue_partner_id?: string | null
          status?: string
          tiktok?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          impact_tracking_url?: string | null
          instagram?: string | null
          photo_url?: string | null
          rescue_partner_id?: string | null
          status?: string
          tiktok?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_profiles_rescue_partner_id_fkey"
            columns: ["rescue_partner_id"]
            isOneToOne: false
            referencedRelation: "rescue_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attribution_dedup_log: {
        Row: {
          contributing_channels: Json
          conversion_id: string
          dedup_at: string
          id: string
          revenue_cents: number | null
          rule: string
          winning_channel: string
        }
        Insert: {
          contributing_channels?: Json
          conversion_id: string
          dedup_at?: string
          id?: string
          revenue_cents?: number | null
          rule?: string
          winning_channel: string
        }
        Update: {
          contributing_channels?: Json
          conversion_id?: string
          dedup_at?: string
          id?: string
          revenue_cents?: number | null
          rule?: string
          winning_channel?: string
        }
        Relationships: []
      }
      attribution_paths: {
        Row: {
          computed_at: string
          id: string
          last_touch_credit: Json | null
          order_date: string
          order_id: string
          order_revenue_cents: number
          position_based_credit: Json | null
          time_decay_credit: Json | null
          touchpoints: Json
          user_id: string | null
        }
        Insert: {
          computed_at?: string
          id?: string
          last_touch_credit?: Json | null
          order_date: string
          order_id: string
          order_revenue_cents?: number
          position_based_credit?: Json | null
          time_decay_credit?: Json | null
          touchpoints: Json
          user_id?: string | null
        }
        Update: {
          computed_at?: string
          id?: string
          last_touch_credit?: Json | null
          order_date?: string
          order_id?: string
          order_revenue_cents?: number
          position_based_credit?: Json | null
          time_decay_credit?: Json | null
          touchpoints?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      audience_bid_modifiers: {
        Row: {
          active: boolean
          audience_key: string
          channel: string
          id: string
          modifier_pct: number
          rationale: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience_key: string
          channel: string
          id?: string
          modifier_pct?: number
          rationale?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience_key?: string
          channel?: string
          id?: string
          modifier_pct?: number
          rationale?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audience_propensity_scores: {
        Row: {
          computed_at: string
          expires_at: string | null
          features: Json | null
          id: string
          model_version: string
          percentile: number | null
          score: number
          score_type: string
          user_id: string | null
          visitor_id: string | null
        }
        Insert: {
          computed_at?: string
          expires_at?: string | null
          features?: Json | null
          id?: string
          model_version?: string
          percentile?: number | null
          score: number
          score_type: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          computed_at?: string
          expires_at?: string | null
          features?: Json | null
          id?: string
          model_version?: string
          percentile?: number | null
          score?: number
          score_type?: string
          user_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      auto_translations: {
        Row: {
          created_at: string
          id: number
          lang: string
          source_hash: string
          source_text: string
          translated_text: string
        }
        Insert: {
          created_at?: string
          id?: number
          lang: string
          source_hash: string
          source_text: string
          translated_text: string
        }
        Update: {
          created_at?: string
          id?: number
          lang?: string
          source_hash?: string
          source_text?: string
          translated_text?: string
        }
        Relationships: []
      }
      autopilot_state: {
        Row: {
          alert_email: string
          cadence_hours: number
          confidence_threshold: number
          enabled: boolean
          id: number
          last_autopilot_run_at: string | null
          last_harvest_instagram_at: string | null
          last_harvest_legacy_at: string | null
          min_exposures_per_arm: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          alert_email?: string
          cadence_hours?: number
          confidence_threshold?: number
          enabled?: boolean
          id?: number
          last_autopilot_run_at?: string | null
          last_harvest_instagram_at?: string | null
          last_harvest_legacy_at?: string | null
          min_exposures_per_arm?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          alert_email?: string
          cadence_hours?: number
          confidence_threshold?: number
          enabled?: boolean
          id?: number
          last_autopilot_run_at?: string | null
          last_harvest_instagram_at?: string | null
          last_harvest_legacy_at?: string | null
          min_exposures_per_arm?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bm_finance_entries: {
        Row: {
          account_code: string | null
          account_name: string | null
          amount_cents: number
          category: string
          channel: string | null
          created_at: string
          currency: string | null
          date: string
          entry_type: string
          external_id: string
          id: string
          memo: string | null
          sku: string | null
          source: string | null
          state: string | null
          subcategory: string | null
          units: number | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_code?: string | null
          account_name?: string | null
          amount_cents: number
          category: string
          channel?: string | null
          created_at?: string
          currency?: string | null
          date: string
          entry_type: string
          external_id: string
          id?: string
          memo?: string | null
          sku?: string | null
          source?: string | null
          state?: string | null
          subcategory?: string | null
          units?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_code?: string | null
          account_name?: string | null
          amount_cents?: number
          category?: string
          channel?: string | null
          created_at?: string
          currency?: string | null
          date?: string
          entry_type?: string
          external_id?: string
          id?: string
          memo?: string | null
          sku?: string | null
          source?: string | null
          state?: string | null
          subcategory?: string | null
          units?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      business_expense_facts: {
        Row: {
          account: string | null
          account_id: string | null
          amount_cents: number
          category: string
          created_at: string
          currency: string
          date: string
          dim_hash: string | null
          external_id: string | null
          id: string
          memo: string | null
          metadata: Json
          source: string
          subcategory: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account?: string | null
          account_id?: string | null
          amount_cents?: number
          category: string
          created_at?: string
          currency?: string
          date: string
          dim_hash?: string | null
          external_id?: string | null
          id?: string
          memo?: string | null
          metadata?: Json
          source?: string
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account?: string | null
          account_id?: string | null
          amount_cents?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string
          dim_hash?: string | null
          external_id?: string | null
          id?: string
          memo?: string | null
          metadata?: Json
          source?: string
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      business_revenue_facts: {
        Row: {
          channel: string
          cogs_cents: number
          created_at: string
          customer_segment: string | null
          date: string
          dim_hash: string | null
          discount_cents: number
          gross_revenue_cents: number
          id: string
          margin_cents: number
          net_revenue_cents: number
          orders: number
          product_name: string | null
          shipping_cents: number
          sku: string | null
          source: string
          state: string | null
          tax_cents: number
          unique_customers: number
          units: number
          updated_at: string
        }
        Insert: {
          channel: string
          cogs_cents?: number
          created_at?: string
          customer_segment?: string | null
          date: string
          dim_hash?: string | null
          discount_cents?: number
          gross_revenue_cents?: number
          id?: string
          margin_cents?: number
          net_revenue_cents?: number
          orders?: number
          product_name?: string | null
          shipping_cents?: number
          sku?: string | null
          source?: string
          state?: string | null
          tax_cents?: number
          unique_customers?: number
          units?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          cogs_cents?: number
          created_at?: string
          customer_segment?: string | null
          date?: string
          dim_hash?: string | null
          discount_cents?: number
          gross_revenue_cents?: number
          id?: string
          margin_cents?: number
          net_revenue_cents?: number
          orders?: number
          product_name?: string | null
          shipping_cents?: number
          sku?: string | null
          source?: string
          state?: string | null
          tax_cents?: number
          unique_customers?: number
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      cart_abandonments: {
        Row: {
          created_at: string
          email: string | null
          id: string
          items: Json
          notes: string | null
          opened_at: string
          resolved_at: string | null
          source: string
          status: string
          subtotal_cents: number
          total_bottles: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          notes?: string | null
          opened_at?: string
          resolved_at?: string | null
          source?: string
          status?: string
          subtotal_cents?: number
          total_bottles?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          notes?: string | null
          opened_at?: string
          resolved_at?: string | null
          source?: string
          status?: string
          subtotal_cents?: number
          total_bottles?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      channel_attribution_events: {
        Row: {
          channel: string | null
          event_type: string
          id: string
          landing_url: string | null
          metadata: Json
          occurred_at: string
          order_id: string | null
          order_value_cents: number | null
          referrer: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          channel?: string | null
          event_type: string
          id?: string
          landing_url?: string | null
          metadata?: Json
          occurred_at?: string
          order_id?: string | null
          order_value_cents?: number | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          channel?: string | null
          event_type?: string
          id?: string
          landing_url?: string | null
          metadata?: Json
          occurred_at?: string
          order_id?: string | null
          order_value_cents?: number | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      channel_performance_daily: {
        Row: {
          attributed_revenue_cents: number
          attribution_quality: string
          campaign_id: string | null
          channel: string
          computed_at: string
          conversions: number
          day: string
          id: string
          platform_reported_revenue_cents: number
          spend_cents: number
        }
        Insert: {
          attributed_revenue_cents?: number
          attribution_quality?: string
          campaign_id?: string | null
          channel: string
          computed_at?: string
          conversions?: number
          day: string
          id?: string
          platform_reported_revenue_cents?: number
          spend_cents?: number
        }
        Update: {
          attributed_revenue_cents?: number
          attribution_quality?: string
          campaign_id?: string | null
          channel?: string
          computed_at?: string
          conversions?: number
          day?: string
          id?: string
          platform_reported_revenue_cents?: number
          spend_cents?: number
        }
        Relationships: []
      }
      channel_sync_status: {
        Row: {
          channel_id: string
          error_message: string | null
          id: string
          last_backup_sync: string | null
          last_primary_sync: string | null
          last_sync_source: string | null
          sync_status: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          error_message?: string | null
          id?: string
          last_backup_sync?: string | null
          last_primary_sync?: string | null
          last_sync_source?: string | null
          sync_status?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          error_message?: string | null
          id?: string
          last_backup_sync?: string | null
          last_primary_sync?: string | null
          last_sync_source?: string | null
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_status_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_content: {
        Row: {
          content: Json
          id: string
          page: string
          section_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          id?: string
          page: string
          section_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: string
          page?: string
          section_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      compliance_audits: {
        Row: {
          created_at: string
          error: string | null
          fail_count: number | null
          finished_at: string | null
          id: string
          ok_count: number | null
          source: string
          started_at: string
          status: string
          topic_count: number | null
          triggered_by: string
          warn_count: number | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          fail_count?: number | null
          finished_at?: string | null
          id?: string
          ok_count?: number | null
          source?: string
          started_at?: string
          status?: string
          topic_count?: number | null
          triggered_by?: string
          warn_count?: number | null
        }
        Update: {
          created_at?: string
          error?: string | null
          fail_count?: number | null
          finished_at?: string | null
          id?: string
          ok_count?: number | null
          source?: string
          started_at?: string
          status?: string
          topic_count?: number | null
          triggered_by?: string
          warn_count?: number | null
        }
        Relationships: []
      }
      compliance_findings: {
        Row: {
          audit_id: string
          citations: Json | null
          created_at: string
          findings: Json | null
          id: string
          recommendations: Json | null
          status: string
          summary: string | null
          topic: string
        }
        Insert: {
          audit_id: string
          citations?: Json | null
          created_at?: string
          findings?: Json | null
          id?: string
          recommendations?: Json | null
          status: string
          summary?: string | null
          topic: string
        }
        Update: {
          audit_id?: string
          citations?: Json | null
          created_at?: string
          findings?: Json | null
          id?: string
          recommendations?: Json | null
          status?: string
          summary?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_findings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "compliance_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      content_index: {
        Row: {
          author: string | null
          body_html: string | null
          cover_image_url: string | null
          excerpt: string | null
          external_id: string | null
          id: string
          is_public: boolean
          published_at: string | null
          raw: Json | null
          slug: string
          source: string
          synced_at: string
          tags: string[] | null
          title: string
          type: string
        }
        Insert: {
          author?: string | null
          body_html?: string | null
          cover_image_url?: string | null
          excerpt?: string | null
          external_id?: string | null
          id?: string
          is_public?: boolean
          published_at?: string | null
          raw?: Json | null
          slug: string
          source?: string
          synced_at?: string
          tags?: string[] | null
          title: string
          type?: string
        }
        Update: {
          author?: string | null
          body_html?: string | null
          cover_image_url?: string | null
          excerpt?: string | null
          external_id?: string | null
          id?: string
          is_public?: boolean
          published_at?: string | null
          raw?: Json | null
          slug?: string
          source?: string
          synced_at?: string
          tags?: string[] | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      content_redirects: {
        Row: {
          created_at: string
          from_path: string
          hits: number
          id: string
          last_hit_at: string | null
          source: string
          status_code: number
          to_path: string
        }
        Insert: {
          created_at?: string
          from_path: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          source?: string
          status_code?: number
          to_path: string
        }
        Update: {
          created_at?: string
          from_path?: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          source?: string
          status_code?: number
          to_path?: string
        }
        Relationships: []
      }
      creative_fatigue: {
        Row: {
          channel: string
          computed_at: string
          creative_id: string
          ctr_30d_baseline: number
          ctr_7d: number
          fatigue_score: number
          id: string
          impressions_7d: number
        }
        Insert: {
          channel: string
          computed_at?: string
          creative_id: string
          ctr_30d_baseline?: number
          ctr_7d?: number
          fatigue_score?: number
          id?: string
          impressions_7d?: number
        }
        Update: {
          channel?: string
          computed_at?: string
          creative_id?: string
          ctr_30d_baseline?: number
          ctr_7d?: number
          fatigue_score?: number
          id?: string
          impressions_7d?: number
        }
        Relationships: []
      }
      customer_cohorts: {
        Row: {
          acquisition_month: string | null
          avg_order_value_cents: number
          churn_probability: number | null
          computed_at: string
          customer_email: string | null
          days_since_last_order: number | null
          first_order_at: string | null
          id: string
          is_club_member: boolean
          last_order_at: string | null
          lifetime_revenue_cents: number
          orders_count: number
          predicted_ltv_cents: number | null
          segment: string | null
          state: string | null
          user_id: string | null
        }
        Insert: {
          acquisition_month?: string | null
          avg_order_value_cents?: number
          churn_probability?: number | null
          computed_at?: string
          customer_email?: string | null
          days_since_last_order?: number | null
          first_order_at?: string | null
          id?: string
          is_club_member?: boolean
          last_order_at?: string | null
          lifetime_revenue_cents?: number
          orders_count?: number
          predicted_ltv_cents?: number | null
          segment?: string | null
          state?: string | null
          user_id?: string | null
        }
        Update: {
          acquisition_month?: string | null
          avg_order_value_cents?: number
          churn_probability?: number | null
          computed_at?: string
          customer_email?: string | null
          days_since_last_order?: number | null
          first_order_at?: string | null
          id?: string
          is_club_member?: boolean
          last_order_at?: string | null
          lifetime_revenue_cents?: number
          orders_count?: number
          predicted_ltv_cents?: number | null
          segment?: string | null
          state?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      customer_favorite_rescues: {
        Row: {
          created_at: string
          id: string
          rescue_partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rescue_partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rescue_partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorite_rescues_rescue_partner_id_fkey"
            columns: ["rescue_partner_id"]
            isOneToOne: false
            referencedRelation: "rescue_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_favorites: {
        Row: {
          created_at: string
          id: string
          product_handle: string
          product_image_url: string | null
          product_price: string | null
          product_title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_handle: string
          product_image_url?: string | null
          product_price?: string | null
          product_title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_handle?: string
          product_image_url?: string | null
          product_price?: string | null
          product_title?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          default_ups_access_point: Json | null
          display_name: string | null
          email: string | null
          favorite_rescue_id: string | null
          id: string
          pet_birth_date: string | null
          pet_name: string | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          updated_at: string
          vinoshipper_customer_id: string | null
          vinoshipper_linked_at: string | null
          wine_preferences: string[] | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          default_ups_access_point?: Json | null
          display_name?: string | null
          email?: string | null
          favorite_rescue_id?: string | null
          id: string
          pet_birth_date?: string | null
          pet_name?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
          vinoshipper_customer_id?: string | null
          vinoshipper_linked_at?: string | null
          wine_preferences?: string[] | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          default_ups_access_point?: Json | null
          display_name?: string | null
          email?: string | null
          favorite_rescue_id?: string | null
          id?: string
          pet_birth_date?: string | null
          pet_name?: string | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
          vinoshipper_customer_id?: string | null
          vinoshipper_linked_at?: string | null
          wine_preferences?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_favorite_rescue_id_fkey"
            columns: ["favorite_rescue_id"]
            isOneToOne: false
            referencedRelation: "rescue_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_signals: {
        Row: {
          churn_risk_score: number
          email: string
          id: string
          last_order_at: string | null
          ltv_cents: number
          purchase_count: number
          source: string
          state: string | null
          tier: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          churn_risk_score?: number
          email: string
          id?: string
          last_order_at?: string | null
          ltv_cents?: number
          purchase_count?: number
          source?: string
          state?: string | null
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          churn_risk_score?: number
          email?: string
          id?: string
          last_order_at?: string | null
          ltv_cents?: number
          purchase_count?: number
          source?: string
          state?: string | null
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dayparting_recommendations: {
        Row: {
          basis_conversions: number
          campaign_id: string | null
          channel: string
          computed_at: string
          day_of_week: number
          hour_of_day: number
          id: string
          recommended_bid_modifier_pct: number
        }
        Insert: {
          basis_conversions?: number
          campaign_id?: string | null
          channel: string
          computed_at?: string
          day_of_week: number
          hour_of_day: number
          id?: string
          recommended_bid_modifier_pct?: number
        }
        Update: {
          basis_conversions?: number
          campaign_id?: string | null
          channel?: string
          computed_at?: string
          day_of_week?: number
          hour_of_day?: number
          id?: string
          recommended_bid_modifier_pct?: number
        }
        Relationships: []
      }
      depletion_report_lines: {
        Row: {
          account_name: string | null
          ai_confidence: number | null
          auto_published: boolean
          cases: number | null
          city: string | null
          created_account_id: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          match_status: string
          matched_account_id: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          phone: string | null
          premise_type: string | null
          raw_row: Json | null
          report_id: string
          sku: string | null
          state: string | null
          street_address: string | null
          units: number | null
          zip: string | null
        }
        Insert: {
          account_name?: string | null
          ai_confidence?: number | null
          auto_published?: boolean
          cases?: number | null
          city?: string | null
          created_account_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          match_status?: string
          matched_account_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          phone?: string | null
          premise_type?: string | null
          raw_row?: Json | null
          report_id: string
          sku?: string | null
          state?: string | null
          street_address?: string | null
          units?: number | null
          zip?: string | null
        }
        Update: {
          account_name?: string | null
          ai_confidence?: number | null
          auto_published?: boolean
          cases?: number | null
          city?: string | null
          created_account_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          match_status?: string
          matched_account_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          phone?: string | null
          premise_type?: string | null
          raw_row?: Json | null
          report_id?: string
          sku?: string | null
          state?: string | null
          street_address?: string | null
          units?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "depletion_report_lines_created_account_id_fkey"
            columns: ["created_account_id"]
            isOneToOne: false
            referencedRelation: "sales_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depletion_report_lines_matched_account_id_fkey"
            columns: ["matched_account_id"]
            isOneToOne: false
            referencedRelation: "sales_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depletion_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "depletion_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      depletion_reports: {
        Row: {
          ai_summary: string | null
          auto_published_count: number
          created_at: string
          distributor: string | null
          filename: string
          id: string
          matched_lines: number
          new_account_lines: number
          period_label: string | null
          raw_preview: string | null
          status: string
          total_lines: number
          unmatched_lines: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          auto_published_count?: number
          created_at?: string
          distributor?: string | null
          filename: string
          id?: string
          matched_lines?: number
          new_account_lines?: number
          period_label?: string | null
          raw_preview?: string | null
          status?: string
          total_lines?: number
          unmatched_lines?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          auto_published_count?: number
          created_at?: string
          distributor?: string | null
          filename?: string
          id?: string
          matched_lines?: number
          new_account_lines?: number
          period_label?: string | null
          raw_preview?: string | null
          status?: string
          total_lines?: number
          unmatched_lines?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      donation_requests: {
        Row: {
          affiliate_interest: string | null
          created_at: string
          ein: string | null
          email: string
          event_date: string | null
          event_description: string
          event_name: string
          event_url: string | null
          first_name: string
          how_heard: string | null
          how_intend_to_use: string | null
          id: string
          irs_letter_path: string | null
          is_nonprofit: string | null
          is_virtual: string | null
          last_name: string
          mailing_city: string | null
          mailing_state: string | null
          mailing_street: string | null
          mailing_zip: string | null
          num_attendees: string | null
          org_name: string
          other_beverages: string | null
          participated_before: string | null
          partnered_before: string | null
          services: string[] | null
          sponsor_benefits: string
          sponsorship_file_path: string | null
          telephone: string
          venue_city: string | null
          venue_name: string | null
          venue_state: string | null
          venue_street: string | null
          venue_zip: string | null
          who_know: string | null
        }
        Insert: {
          affiliate_interest?: string | null
          created_at?: string
          ein?: string | null
          email: string
          event_date?: string | null
          event_description: string
          event_name: string
          event_url?: string | null
          first_name: string
          how_heard?: string | null
          how_intend_to_use?: string | null
          id?: string
          irs_letter_path?: string | null
          is_nonprofit?: string | null
          is_virtual?: string | null
          last_name: string
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mailing_zip?: string | null
          num_attendees?: string | null
          org_name: string
          other_beverages?: string | null
          participated_before?: string | null
          partnered_before?: string | null
          services?: string[] | null
          sponsor_benefits: string
          sponsorship_file_path?: string | null
          telephone: string
          venue_city?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_street?: string | null
          venue_zip?: string | null
          who_know?: string | null
        }
        Update: {
          affiliate_interest?: string | null
          created_at?: string
          ein?: string | null
          email?: string
          event_date?: string | null
          event_description?: string
          event_name?: string
          event_url?: string | null
          first_name?: string
          how_heard?: string | null
          how_intend_to_use?: string | null
          id?: string
          irs_letter_path?: string | null
          is_nonprofit?: string | null
          is_virtual?: string | null
          last_name?: string
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mailing_zip?: string | null
          num_attendees?: string | null
          org_name?: string
          other_beverages?: string | null
          participated_before?: string | null
          partnered_before?: string | null
          services?: string[] | null
          sponsor_benefits?: string
          sponsorship_file_path?: string | null
          telephone?: string
          venue_city?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_street?: string | null
          venue_zip?: string | null
          who_know?: string | null
        }
        Relationships: []
      }
      dropship_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          message: string | null
          order_id: string | null
          partner_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          message?: string | null
          order_id?: string | null
          partner_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          message?: string | null
          order_id?: string | null
          partner_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dropship_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dropship_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dropship_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dropship_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          partner_sku: string | null
          product_title: string
          quantity: number
          sku: string
          unit_cost_cents: number
          unit_retail_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          partner_sku?: string | null
          product_title: string
          quantity?: number
          sku: string
          unit_cost_cents?: number
          unit_retail_cents?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          partner_sku?: string | null
          product_title?: string
          quantity?: number
          sku?: string
          unit_cost_cents?: number
          unit_retail_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "dropship_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dropship_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dropship_orders: {
        Row: {
          carrier: string | null
          cost_cents: number
          created_at: string
          customer_email: string | null
          customer_name: string | null
          delivered_at: string | null
          fulfillment_status_detail: string
          id: string
          notes: string | null
          partner_id: string
          partner_order_id: string | null
          shipped_at: string | null
          shipping_address: Json | null
          simulated: boolean
          status: string
          submitted_at: string | null
          subtotal_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vendor_order_id: string | null
          vinoshipper_order_id: string | null
          vs_tracking_mismatch: string | null
          vs_tracking_relayed_at: string | null
          vs_tracking_verified_at: string | null
        }
        Insert: {
          carrier?: string | null
          cost_cents?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          fulfillment_status_detail?: string
          id?: string
          notes?: string | null
          partner_id: string
          partner_order_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          simulated?: boolean
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_order_id?: string | null
          vinoshipper_order_id?: string | null
          vs_tracking_mismatch?: string | null
          vs_tracking_relayed_at?: string | null
          vs_tracking_verified_at?: string | null
        }
        Update: {
          carrier?: string | null
          cost_cents?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          fulfillment_status_detail?: string
          id?: string
          notes?: string | null
          partner_id?: string
          partner_order_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          simulated?: boolean
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vendor_order_id?: string | null
          vinoshipper_order_id?: string | null
          vs_tracking_mismatch?: string | null
          vs_tracking_relayed_at?: string | null
          vs_tracking_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dropship_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dropship_partners: {
        Row: {
          api_base_url: string | null
          api_key_secret_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          fulfills_from_us: boolean
          id: string
          last_health_check_at: string | null
          last_health_status: string | null
          name: string
          notes: string | null
          notify_on_new_order: boolean
          payout_terms: string | null
          simulation_mode: boolean
          slug: string
          status: string
          updated_at: string
          vendor_credentials: Json
          vendor_type: string
          webhook_secret: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_key_secret_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          fulfills_from_us?: boolean
          id?: string
          last_health_check_at?: string | null
          last_health_status?: string | null
          name: string
          notes?: string | null
          notify_on_new_order?: boolean
          payout_terms?: string | null
          simulation_mode?: boolean
          slug: string
          status?: string
          updated_at?: string
          vendor_credentials?: Json
          vendor_type?: string
          webhook_secret?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_key_secret_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          fulfills_from_us?: boolean
          id?: string
          last_health_check_at?: string | null
          last_health_status?: string | null
          name?: string
          notes?: string | null
          notify_on_new_order?: boolean
          payout_terms?: string | null
          simulation_mode?: boolean
          slug?: string
          status?: string
          updated_at?: string
          vendor_credentials?: Json
          vendor_type?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      dropship_payouts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_count: number
          paid_at: string | null
          partner_id: string
          period_end: string
          period_start: string
          receipt_url: string | null
          status: string
          total_cost_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_count?: number
          paid_at?: string | null
          partner_id: string
          period_end: string
          period_start: string
          receipt_url?: string | null
          status?: string
          total_cost_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_count?: number
          paid_at?: string | null
          partner_id?: string
          period_end?: string
          period_start?: string
          receipt_url?: string | null
          status?: string
          total_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dropship_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dropship_skus: {
        Row: {
          ai_curated_at: string | null
          auto_curate: boolean
          badges: string[] | null
          category: string | null
          collection: string | null
          cost_cents: number
          created_at: string
          fulfillment_mode: string
          gallery_urls: string[] | null
          id: string
          is_active: boolean
          is_featured: boolean
          last_availability_check: string | null
          last_synced_at: string | null
          long_description: string | null
          min_margin_percent: number | null
          mock_review_count: number
          mock_star_rating: number | null
          notes: string | null
          partner_id: string
          partner_sku: string | null
          product_image_url: string | null
          product_title: string
          retail_cents: number
          short_description: string | null
          sku: string
          storefront_sort: number
          target_margin_percent: number | null
          updated_at: string
          vendor_availability: string
          vendor_product_id: string | null
          vendor_variant_id: string | null
          vinoshipper_product_id: string | null
        }
        Insert: {
          ai_curated_at?: string | null
          auto_curate?: boolean
          badges?: string[] | null
          category?: string | null
          collection?: string | null
          cost_cents?: number
          created_at?: string
          fulfillment_mode?: string
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          last_availability_check?: string | null
          last_synced_at?: string | null
          long_description?: string | null
          min_margin_percent?: number | null
          mock_review_count?: number
          mock_star_rating?: number | null
          notes?: string | null
          partner_id: string
          partner_sku?: string | null
          product_image_url?: string | null
          product_title: string
          retail_cents?: number
          short_description?: string | null
          sku: string
          storefront_sort?: number
          target_margin_percent?: number | null
          updated_at?: string
          vendor_availability?: string
          vendor_product_id?: string | null
          vendor_variant_id?: string | null
          vinoshipper_product_id?: string | null
        }
        Update: {
          ai_curated_at?: string | null
          auto_curate?: boolean
          badges?: string[] | null
          category?: string | null
          collection?: string | null
          cost_cents?: number
          created_at?: string
          fulfillment_mode?: string
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          last_availability_check?: string | null
          last_synced_at?: string | null
          long_description?: string | null
          min_margin_percent?: number | null
          mock_review_count?: number
          mock_star_rating?: number | null
          notes?: string | null
          partner_id?: string
          partner_sku?: string | null
          product_image_url?: string | null
          product_title?: string
          retail_cents?: number
          short_description?: string | null
          sku?: string
          storefront_sort?: number
          target_margin_percent?: number | null
          updated_at?: string
          vendor_availability?: string
          vendor_product_id?: string | null
          vendor_variant_id?: string | null
          vinoshipper_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dropship_skus_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      executive_decisions: {
        Row: {
          action_kind: string
          action_payload: Json
          approved_at: string | null
          approved_by: string | null
          auto_executable: boolean
          category: string
          confidence: number | null
          created_at: string
          estimated_impact_cents: number | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          narrative: string | null
          priority: number
          recommended_action: string
          related_record_ids: string[] | null
          scope: string
          scope_id: string | null
          source_engine: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_kind: string
          action_payload?: Json
          approved_at?: string | null
          approved_by?: string | null
          auto_executable?: boolean
          category: string
          confidence?: number | null
          created_at?: string
          estimated_impact_cents?: number | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          narrative?: string | null
          priority?: number
          recommended_action: string
          related_record_ids?: string[] | null
          scope: string
          scope_id?: string | null
          source_engine?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_kind?: string
          action_payload?: Json
          approved_at?: string | null
          approved_by?: string | null
          auto_executable?: boolean
          category?: string
          confidence?: number | null
          created_at?: string
          estimated_impact_cents?: number | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          narrative?: string | null
          priority?: number
          recommended_action?: string
          related_record_ids?: string[] | null
          scope?: string
          scope_id?: string | null
          source_engine?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: string
          user_id: string | null
          variant_id: string
          visitor_id: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: string
          user_id?: string | null
          variant_id: string
          visitor_id: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: string
          user_id?: string | null
          variant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "experiment_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_events: {
        Row: {
          created_at: string
          event_type: string
          experiment_id: string
          goal_key: string | null
          id: string
          metadata: Json
          revenue_cents: number | null
          user_id: string | null
          variant_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          experiment_id: string
          goal_key?: string | null
          id?: string
          metadata?: Json
          revenue_cents?: number | null
          user_id?: string | null
          variant_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          experiment_id?: string
          goal_key?: string | null
          id?: string
          metadata?: Json
          revenue_cents?: number | null
          user_id?: string | null
          variant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "experiment_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_templates: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          slot_key: string
          updated_at: string
          use_media_pool: boolean
          variant_configs: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          slot_key: string
          updated_at?: string
          use_media_pool?: boolean
          variant_configs?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          slot_key?: string
          updated_at?: string
          use_media_pool?: boolean
          variant_configs?: Json
        }
        Relationships: []
      }
      experiment_variants: {
        Row: {
          config: Json
          conversions: number
          created_at: string
          experiment_id: string
          exposures: number
          id: string
          is_control: boolean
          key: string
          name: string
          revenue_cents: number
          updated_at: string
          weight: number
        }
        Insert: {
          config?: Json
          conversions?: number
          created_at?: string
          experiment_id: string
          exposures?: number
          id?: string
          is_control?: boolean
          key: string
          name: string
          revenue_cents?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          config?: Json
          conversions?: number
          created_at?: string
          experiment_id?: string
          exposures?: number
          id?: string
          is_control?: boolean
          key?: string
          name?: string
          revenue_cents?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          key: string
          name: string
          primary_metric: Database["public"]["Enums"]["experiment_metric"]
          segment: Json
          slot_key: string
          starts_at: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          traffic_pct: number
          updated_at: string
          use_bandit: boolean
          winner_variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          key: string
          name: string
          primary_metric?: Database["public"]["Enums"]["experiment_metric"]
          segment?: Json
          slot_key: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          traffic_pct?: number
          updated_at?: string
          use_bandit?: boolean
          winner_variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          key?: string
          name?: string
          primary_metric?: Database["public"]["Enums"]["experiment_metric"]
          segment?: Json
          slot_key?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          traffic_pct?: number
          updated_at?: string
          use_bandit?: boolean
          winner_variant_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      frequency_cap_status: {
        Row: {
          capped: boolean
          channel: string
          computed_at: string
          id: string
          impressions_7d: number
          last_seen: string | null
          visitor_key: string
        }
        Insert: {
          capped?: boolean
          channel: string
          computed_at?: string
          id?: string
          impressions_7d?: number
          last_seen?: string | null
          visitor_key: string
        }
        Update: {
          capped?: boolean
          channel?: string
          computed_at?: string
          id?: string
          impressions_7d?: number
          last_seen?: string | null
          visitor_key?: string
        }
        Relationships: []
      }
      gift_certificates: {
        Row: {
          code: string
          created_at: string
          deliver_on: string | null
          id: string
          personal_note: string | null
          purchaser_email: string | null
          purchaser_user_id: string
          recipient_email: string
          recipient_name: string
          redeemed_at: string | null
          redeemed_by_email: string | null
          sent_at: string | null
          shipments_count: number
          status: string
          tier: string
          total_cents: number
          updated_at: string
          vinoshipper_gift_id: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          deliver_on?: string | null
          id?: string
          personal_note?: string | null
          purchaser_email?: string | null
          purchaser_user_id: string
          recipient_email: string
          recipient_name: string
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          sent_at?: string | null
          shipments_count?: number
          status?: string
          tier: string
          total_cents?: number
          updated_at?: string
          vinoshipper_gift_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          deliver_on?: string | null
          id?: string
          personal_note?: string | null
          purchaser_email?: string | null
          purchaser_user_id?: string
          recipient_email?: string
          recipient_name?: string
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          sent_at?: string | null
          shipments_count?: number
          status?: string
          tier?: string
          total_cents?: number
          updated_at?: string
          vinoshipper_gift_id?: string | null
        }
        Relationships: []
      }
      guardrail_baseline: {
        Row: {
          baseline_daily_budget_cents: number | null
          baseline_mtd_spend_cents: number | null
          campaign_id: string | null
          captured_at: string
          channel_id: string | null
          id: string
          is_current: boolean
          metadata: Json
          platform: string
          source: string
        }
        Insert: {
          baseline_daily_budget_cents?: number | null
          baseline_mtd_spend_cents?: number | null
          campaign_id?: string | null
          captured_at?: string
          channel_id?: string | null
          id?: string
          is_current?: boolean
          metadata?: Json
          platform: string
          source?: string
        }
        Update: {
          baseline_daily_budget_cents?: number | null
          baseline_mtd_spend_cents?: number | null
          campaign_id?: string | null
          captured_at?: string
          channel_id?: string | null
          id?: string
          is_current?: boolean
          metadata?: Json
          platform?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_baseline_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ad_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_jobs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          items_found: number
          items_new: number
          metadata: Json
          source: string
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_new?: number
          metadata?: Json
          source: string
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_new?: number
          metadata?: Json
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      holdout_assignments: {
        Row: {
          assigned_at: string
          bucket: number
          in_holdout: boolean
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          assigned_at?: string
          bucket: number
          in_holdout: boolean
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          assigned_at?: string
          bucket?: number
          in_holdout?: boolean
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      impact_events: {
        Row: {
          bottles: number
          created_at: string
          customer_email: string | null
          donation_cents: number
          id: string
          metadata: Json | null
          occurred_at: string
          rescue_partner_id: string | null
          source: string
          user_id: string | null
          vinoshipper_order_id: string | null
        }
        Insert: {
          bottles?: number
          created_at?: string
          customer_email?: string | null
          donation_cents?: number
          id?: string
          metadata?: Json | null
          occurred_at?: string
          rescue_partner_id?: string | null
          source?: string
          user_id?: string | null
          vinoshipper_order_id?: string | null
        }
        Update: {
          bottles?: number
          created_at?: string
          customer_email?: string | null
          donation_cents?: number
          id?: string
          metadata?: Json | null
          occurred_at?: string
          rescue_partner_id?: string | null
          source?: string
          user_id?: string | null
          vinoshipper_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_events_rescue_partner_id_fkey"
            columns: ["rescue_partner_id"]
            isOneToOne: false
            referencedRelation: "rescue_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_health_checks: {
        Row: {
          ambassador_profile_id: string | null
          check_type: string
          checked_at: string
          details: Json | null
          http_status: number | null
          id: string
          latency_ms: number | null
          message: string | null
          status: string
          target: string | null
        }
        Insert: {
          ambassador_profile_id?: string | null
          check_type: string
          checked_at?: string
          details?: Json | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          status: string
          target?: string | null
        }
        Update: {
          ambassador_profile_id?: string | null
          check_type?: string
          checked_at?: string
          details?: Json | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_health_checks_ambassador_profile_id_fkey"
            columns: ["ambassador_profile_id"]
            isOneToOne: false
            referencedRelation: "ambassador_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incrementality_tests: {
        Row: {
          channel: string
          control_conversions: number
          created_at: string
          end_at: string | null
          exposed_conversions: number
          holdout_pct: number
          id: string
          lift_pct: number | null
          name: string
          notes: string | null
          p_value: number | null
          start_at: string
          status: string
        }
        Insert: {
          channel: string
          control_conversions?: number
          created_at?: string
          end_at?: string | null
          exposed_conversions?: number
          holdout_pct?: number
          id?: string
          lift_pct?: number | null
          name: string
          notes?: string | null
          p_value?: number | null
          start_at: string
          status?: string
        }
        Update: {
          channel?: string
          control_conversions?: number
          created_at?: string
          end_at?: string | null
          exposed_conversions?: number
          holdout_pct?: number
          id?: string
          lift_pct?: number | null
          name?: string
          notes?: string | null
          p_value?: number | null
          start_at?: string
          status?: string
        }
        Relationships: []
      }
      integration_credential_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          credential_id: string | null
          credential_key: string
          event_type: string
          id: string
          notes: string | null
          occurred_at: string
          provider: string
          scope: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          credential_id?: string | null
          credential_key: string
          event_type: string
          id?: string
          notes?: string | null
          occurred_at?: string
          provider: string
          scope: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          credential_id?: string | null
          credential_key?: string
          event_type?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          provider?: string
          scope?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          credential_key: string
          credential_value: string
          id: string
          notes: string | null
          provider: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credential_key: string
          credential_value: string
          id?: string
          notes?: string | null
          provider: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credential_key?: string
          credential_value?: string
          id?: string
          notes?: string | null
          provider?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      kennel_bid_modifiers: {
        Row: {
          computed_at: string
          day_of_week: number
          modifier: number
          notes: string | null
          sample_avg_revenue_cents: number | null
          sample_days: number | null
          source_window_days: number
          updated_at: string
        }
        Insert: {
          computed_at?: string
          day_of_week: number
          modifier?: number
          notes?: string | null
          sample_avg_revenue_cents?: number | null
          sample_days?: number | null
          source_window_days?: number
          updated_at?: string
        }
        Update: {
          computed_at?: string
          day_of_week?: number
          modifier?: number
          notes?: string | null
          sample_avg_revenue_cents?: number | null
          sample_days?: number | null
          source_window_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      kennel_entity_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          friendly_name: string
          id: string
          notes: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          friendly_name: string
          id?: string
          notes?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          friendly_name?: string
          id?: string
          notes?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      kennel_keyword_ideas: {
        Row: {
          ad_group_id: string
          campaign_id: string | null
          competition: string | null
          cpc_micros: number | null
          created_at: string
          executed_resource_name: string | null
          execution_response: Json | null
          id: string
          keyword: string
          match_type: string
          platform: string
          reasoning: string | null
          recommended_action: string
          recommended_bid_micros: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          source: string
          status: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          ad_group_id: string
          campaign_id?: string | null
          competition?: string | null
          cpc_micros?: number | null
          created_at?: string
          executed_resource_name?: string | null
          execution_response?: Json | null
          id?: string
          keyword: string
          match_type?: string
          platform: string
          reasoning?: string | null
          recommended_action: string
          recommended_bid_micros?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source: string
          status?: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          ad_group_id?: string
          campaign_id?: string | null
          competition?: string | null
          cpc_micros?: number | null
          created_at?: string
          executed_resource_name?: string | null
          execution_response?: Json | null
          id?: string
          keyword?: string
          match_type?: string
          platform?: string
          reasoning?: string | null
          recommended_action?: string
          recommended_bid_micros?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source?: string
          status?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      kennel_keyword_settings: {
        Row: {
          auto_apply: boolean
          auto_pause_enabled: boolean
          bid_lower_gate_pct: number
          bid_lower_step_pct: number
          bid_optimization_enabled: boolean
          bid_raise_gate_pct: number
          bid_raise_step_pct: number
          budget_ceiling_cents: number
          budget_floor_cents: number
          budget_pacing_enabled: boolean
          engine_enabled: boolean
          lookback_days: number
          max_daily_adds: number
          max_daily_bid_changes: number
          max_daily_budget_shift_pct: number
          min_clicks_for_bid_change: number
          pause_threshold_cents: number
          pause_zero_conv_days: number
          platform: string
          target_roas: number
          updated_at: string
        }
        Insert: {
          auto_apply?: boolean
          auto_pause_enabled?: boolean
          bid_lower_gate_pct?: number
          bid_lower_step_pct?: number
          bid_optimization_enabled?: boolean
          bid_raise_gate_pct?: number
          bid_raise_step_pct?: number
          budget_ceiling_cents?: number
          budget_floor_cents?: number
          budget_pacing_enabled?: boolean
          engine_enabled?: boolean
          lookback_days?: number
          max_daily_adds?: number
          max_daily_bid_changes?: number
          max_daily_budget_shift_pct?: number
          min_clicks_for_bid_change?: number
          pause_threshold_cents?: number
          pause_zero_conv_days?: number
          platform: string
          target_roas?: number
          updated_at?: string
        }
        Update: {
          auto_apply?: boolean
          auto_pause_enabled?: boolean
          bid_lower_gate_pct?: number
          bid_lower_step_pct?: number
          bid_optimization_enabled?: boolean
          bid_raise_gate_pct?: number
          bid_raise_step_pct?: number
          budget_ceiling_cents?: number
          budget_floor_cents?: number
          budget_pacing_enabled?: boolean
          engine_enabled?: boolean
          lookback_days?: number
          max_daily_adds?: number
          max_daily_bid_changes?: number
          max_daily_budget_shift_pct?: number
          min_clicks_for_bid_change?: number
          pause_threshold_cents?: number
          pause_zero_conv_days?: number
          platform?: string
          target_roas?: number
          updated_at?: string
        }
        Relationships: []
      }
      kennel_optimizer_recommendations: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          apply_response: Json | null
          clicks: number | null
          conversions: number | null
          created_at: string
          current_value: number | null
          delta_pct: number | null
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string
          metric_window_days: number | null
          platform: string
          reasoning: string | null
          recommended_value: number | null
          revenue_cents: number | null
          roas: number | null
          rule_type: string
          spend_cents: number | null
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          apply_response?: Json | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          current_value?: number | null
          delta_pct?: number | null
          entity_id: string
          entity_type: string
          id?: string
          idempotency_key: string
          metric_window_days?: number | null
          platform: string
          reasoning?: string | null
          recommended_value?: number | null
          revenue_cents?: number | null
          roas?: number | null
          rule_type: string
          spend_cents?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          apply_response?: Json | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          current_value?: number | null
          delta_pct?: number | null
          entity_id?: string
          entity_type?: string
          id?: string
          idempotency_key?: string
          metric_window_days?: number | null
          platform?: string
          reasoning?: string | null
          recommended_value?: number | null
          revenue_cents?: number | null
          roas?: number | null
          rule_type?: string
          spend_cents?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          metadata: Json
          notes: string | null
          source: string
          status: string
          updated_at: string
          vinoshipper_created_at: string | null
          vinoshipper_customer_id: string | null
          welcome_series_started_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
          vinoshipper_created_at?: string | null
          vinoshipper_customer_id?: string | null
          welcome_series_started_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          source?: string
          status?: string
          updated_at?: string
          vinoshipper_created_at?: string | null
          vinoshipper_customer_id?: string | null
          welcome_series_started_at?: string | null
        }
        Relationships: []
      }
      local_delivery_events: {
        Row: {
          capi_status: string | null
          created_at: string
          customer_email_hash: string | null
          external_event_id: string
          id: string
          occurred_at: string
          oci_status: string | null
          platform: string
          processed_at: string | null
          qty: number | null
          raw: Json
          revenue_cents: number | null
          sku: string | null
        }
        Insert: {
          capi_status?: string | null
          created_at?: string
          customer_email_hash?: string | null
          external_event_id: string
          id?: string
          occurred_at?: string
          oci_status?: string | null
          platform: string
          processed_at?: string | null
          qty?: number | null
          raw?: Json
          revenue_cents?: number | null
          sku?: string | null
        }
        Update: {
          capi_status?: string | null
          created_at?: string
          customer_email_hash?: string | null
          external_event_id?: string
          id?: string
          occurred_at?: string
          oci_status?: string | null
          platform?: string
          processed_at?: string | null
          qty?: number | null
          raw?: Json
          revenue_cents?: number | null
          sku?: string | null
        }
        Relationships: []
      }
      locator_searches: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          premise_filter: string | null
          product_filter: string | null
          radius_miles: number | null
          referrer: string | null
          results_count: number | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          premise_filter?: string | null
          product_filter?: string | null
          radius_miles?: number | null
          referrer?: string | null
          results_count?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          premise_filter?: string | null
          product_filter?: string | null
          radius_miles?: number | null
          referrer?: string | null
          results_count?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          lifetime_points_earned: number
          points_balance: number
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lifetime_points_earned?: number
          points_balance?: number
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lifetime_points_earned?: number
          points_balance?: number
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_ledger: {
        Row: {
          created_at: string
          delta_points: number
          event_type: string
          id: string
          metadata: Json
          order_id: string | null
          reason: string
          subtotal_cents: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta_points: number
          event_type: string
          id?: string
          metadata?: Json
          order_id?: string | null
          reason: string
          subtotal_cents?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta_points?: number
          event_type?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          reason?: string
          subtotal_cents?: number | null
          user_id?: string
        }
        Relationships: []
      }
      loyalty_redemptions: {
        Row: {
          client_request_id: string | null
          created_at: string
          fulfilled_at: string | null
          fulfillment_notes: string | null
          id: string
          ledger_id: string | null
          metadata: Json
          points_cost: number
          reward_category: string
          reward_id: string
          reward_title: string
          ship_state: string | null
          simulated: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
          fulfillment_notes?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          points_cost: number
          reward_category: string
          reward_id: string
          reward_title: string
          ship_state?: string | null
          simulated?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          fulfilled_at?: string | null
          fulfillment_notes?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          points_cost?: number
          reward_category?: string
          reward_id?: string
          reward_title?: string
          ship_state?: string | null
          simulated?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_partner_applications: {
        Row: {
          admin_note: string | null
          agreed_to_terms: boolean
          approved_partner_id: string | null
          brand_story: string | null
          business_name: string
          business_type: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          ein_or_tax_id: string | null
          est_monthly_units: number | null
          fulfillment_model: string | null
          fulfills_from_us: boolean
          id: string
          ip_address: string | null
          product_categories: string[] | null
          product_description: string
          reviewed_at: string | null
          reviewed_by: string | null
          sample_product_urls: string[] | null
          shipping_regions: string[] | null
          social_links: Json | null
          status: string
          updated_at: string
          website: string | null
          why_partner: string | null
          years_in_business: number | null
        }
        Insert: {
          admin_note?: string | null
          agreed_to_terms?: boolean
          approved_partner_id?: string | null
          brand_story?: string | null
          business_name: string
          business_type?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          ein_or_tax_id?: string | null
          est_monthly_units?: number | null
          fulfillment_model?: string | null
          fulfills_from_us?: boolean
          id?: string
          ip_address?: string | null
          product_categories?: string[] | null
          product_description: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_product_urls?: string[] | null
          shipping_regions?: string[] | null
          social_links?: Json | null
          status?: string
          updated_at?: string
          website?: string | null
          why_partner?: string | null
          years_in_business?: number | null
        }
        Update: {
          admin_note?: string | null
          agreed_to_terms?: boolean
          approved_partner_id?: string | null
          brand_story?: string | null
          business_name?: string
          business_type?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          ein_or_tax_id?: string | null
          est_monthly_units?: number | null
          fulfillment_model?: string | null
          fulfills_from_us?: boolean
          id?: string
          ip_address?: string | null
          product_categories?: string[] | null
          product_description?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_product_urls?: string[] | null
          shipping_regions?: string[] | null
          social_links?: Json | null
          status?: string
          updated_at?: string
          website?: string | null
          why_partner?: string | null
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_partner_applications_approved_partner_id_fkey"
            columns: ["approved_partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_partner_products: {
        Row: {
          admin_note: string | null
          application_id: string | null
          category: string | null
          created_at: string
          fulfillment_mode: string
          gallery_urls: string[] | null
          id: string
          inventory_qty: number | null
          partner_cost_cents: number
          partner_id: string | null
          product_description: string | null
          product_image_url: string | null
          product_title: string
          promoted_sku_id: string | null
          proposed_retail_cents: number
          proposed_sku: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shipping_lead_time_days: number | null
          status: string
          submitted_by_email: string | null
          updated_at: string
          variants: Json | null
        }
        Insert: {
          admin_note?: string | null
          application_id?: string | null
          category?: string | null
          created_at?: string
          fulfillment_mode?: string
          gallery_urls?: string[] | null
          id?: string
          inventory_qty?: number | null
          partner_cost_cents?: number
          partner_id?: string | null
          product_description?: string | null
          product_image_url?: string | null
          product_title: string
          promoted_sku_id?: string | null
          proposed_retail_cents?: number
          proposed_sku?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipping_lead_time_days?: number | null
          status?: string
          submitted_by_email?: string | null
          updated_at?: string
          variants?: Json | null
        }
        Update: {
          admin_note?: string | null
          application_id?: string | null
          category?: string | null
          created_at?: string
          fulfillment_mode?: string
          gallery_urls?: string[] | null
          id?: string
          inventory_qty?: number | null
          partner_cost_cents?: number
          partner_id?: string | null
          product_description?: string | null
          product_image_url?: string | null
          product_title?: string
          promoted_sku_id?: string | null
          proposed_retail_cents?: number
          proposed_sku?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shipping_lead_time_days?: number | null
          status?: string
          submitted_by_email?: string | null
          updated_at?: string
          variants?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_partner_products_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "marketplace_partner_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_partner_products_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_partner_products_promoted_sku_id_fkey"
            columns: ["promoted_sku_id"]
            isOneToOne: false
            referencedRelation: "dropship_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_partner_products_promoted_sku_id_fkey"
            columns: ["promoted_sku_id"]
            isOneToOne: false
            referencedRelation: "merch_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          ai_score: number | null
          ai_subject: string | null
          ai_tags: string[]
          alt_text: string | null
          approved_at: string | null
          approved_by: string | null
          caption: string | null
          created_at: string
          height: number | null
          id: string
          image_url: string
          metadata: Json
          rejected_reason: string | null
          source: string
          source_post_url: string | null
          source_url: string | null
          status: string
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          ai_score?: number | null
          ai_subject?: string | null
          ai_tags?: string[]
          alt_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          image_url: string
          metadata?: Json
          rejected_reason?: string | null
          source: string
          source_post_url?: string | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          ai_score?: number | null
          ai_subject?: string | null
          ai_tags?: string[]
          alt_text?: string | null
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          image_url?: string
          metadata?: Json
          rejected_reason?: string | null
          source?: string
          source_post_url?: string | null
          source_url?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      merch_bundles: {
        Row: {
          badge_label: string | null
          bundle_price_cents: number
          compare_at_cents: number | null
          created_at: string
          description: string | null
          handle: string
          hero_image_url: string | null
          id: string
          is_active: boolean
          sku_handles: string[]
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge_label?: string | null
          bundle_price_cents?: number
          compare_at_cents?: number | null
          created_at?: string
          description?: string | null
          handle: string
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          sku_handles?: string[]
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge_label?: string | null
          bundle_price_cents?: number
          compare_at_cents?: number | null
          created_at?: string
          description?: string | null
          handle?: string
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          sku_handles?: string[]
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      merch_curation_actions: {
        Row: {
          action_type: string
          ai_confidence: number | null
          applied_at: string | null
          created_at: string
          current_snapshot: Json | null
          id: string
          proposed_change: Json | null
          proposed_replacement: Json | null
          reason: string | null
          replacement_sku_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sku_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          ai_confidence?: number | null
          applied_at?: string | null
          created_at?: string
          current_snapshot?: Json | null
          id?: string
          proposed_change?: Json | null
          proposed_replacement?: Json | null
          reason?: string | null
          replacement_sku_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sku_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          ai_confidence?: number | null
          applied_at?: string | null
          created_at?: string
          current_snapshot?: Json | null
          id?: string
          proposed_change?: Json | null
          proposed_replacement?: Json | null
          reason?: string | null
          replacement_sku_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sku_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_curation_actions_replacement_sku_id_fkey"
            columns: ["replacement_sku_id"]
            isOneToOne: false
            referencedRelation: "dropship_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_curation_actions_replacement_sku_id_fkey"
            columns: ["replacement_sku_id"]
            isOneToOne: false
            referencedRelation: "merch_storefront"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_curation_actions_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "dropship_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_curation_actions_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "merch_storefront"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_products: {
        Row: {
          category: string | null
          collection: string | null
          cost_cents: number | null
          created_at: string
          description: string | null
          description_html: string | null
          gallery_urls: string[] | null
          handle: string
          id: string
          image_url: string | null
          inventory_qty: number | null
          is_active: boolean
          is_featured: boolean
          legacy_shopify_id: string | null
          options: Json
          price_cents: number
          sort_order: number
          tags: string[] | null
          title: string
          updated_at: string
          variants: Json
        }
        Insert: {
          category?: string | null
          collection?: string | null
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          description_html?: string | null
          gallery_urls?: string[] | null
          handle: string
          id?: string
          image_url?: string | null
          inventory_qty?: number | null
          is_active?: boolean
          is_featured?: boolean
          legacy_shopify_id?: string | null
          options?: Json
          price_cents?: number
          sort_order?: number
          tags?: string[] | null
          title: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          category?: string | null
          collection?: string | null
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          description_html?: string | null
          gallery_urls?: string[] | null
          handle?: string
          id?: string
          image_url?: string | null
          inventory_qty?: number | null
          is_active?: boolean
          is_featured?: boolean
          legacy_shopify_id?: string | null
          options?: Json
          price_cents?: number
          sort_order?: number
          tags?: string[] | null
          title?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      meta_capi_events: {
        Row: {
          created_at: string
          currency: string
          email_hash: string | null
          error: string | null
          event_id: string
          event_name: string
          fbc: string | null
          fbp: string | null
          id: string
          order_id: string
          request_payload: Json | null
          response_body: Json | null
          response_status: number | null
          sent_at: string
          success: boolean
          test_event_code: string | null
          test_mode: boolean
          value_cents: number
        }
        Insert: {
          created_at?: string
          currency?: string
          email_hash?: string | null
          error?: string | null
          event_id: string
          event_name?: string
          fbc?: string | null
          fbp?: string | null
          id?: string
          order_id: string
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          sent_at?: string
          success?: boolean
          test_event_code?: string | null
          test_mode?: boolean
          value_cents: number
        }
        Update: {
          created_at?: string
          currency?: string
          email_hash?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          fbc?: string | null
          fbp?: string | null
          id?: string
          order_id?: string
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          sent_at?: string
          success?: boolean
          test_event_code?: string | null
          test_mode?: boolean
          value_cents?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cost_cents: number | null
          created_at: string
          id: string
          line_total_cents: number
          metadata: Json
          order_id: string
          partner_id: string | null
          partner_kind: string | null
          product_id: string | null
          product_kind: string
          product_name: string
          product_sku: string | null
          quantity: number
          unit_price_cents: number
          variant_name: string | null
          vinoshipper_product_id: string | null
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          line_total_cents: number
          metadata?: Json
          order_id: string
          partner_id?: string | null
          partner_kind?: string | null
          product_id?: string | null
          product_kind: string
          product_name: string
          product_sku?: string | null
          quantity: number
          unit_price_cents: number
          variant_name?: string | null
          vinoshipper_product_id?: string | null
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          line_total_cents?: number
          metadata?: Json
          order_id?: string
          partner_id?: string | null
          partner_kind?: string | null
          product_id?: string | null
          product_kind?: string
          product_name?: string
          product_sku?: string | null
          quantity?: number
          unit_price_cents?: number
          variant_name?: string | null
          vinoshipper_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_margin_v"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          age_verified: boolean
          created_at: string
          customer_email: string
          customer_first_name: string
          customer_last_name: string
          customer_phone: string | null
          date_of_birth: string | null
          id: string
          merch_fulfillment_status: string
          merch_subtotal_cents: number
          metadata: Json
          notes: string | null
          order_number: string
          payment_status: string
          processor_net_cents: number | null
          ship_address1: string
          ship_address2: string | null
          ship_city: string
          ship_country: string
          ship_state: string
          ship_zip: string
          shipping_cents: number
          stripe_charge_id: string | null
          stripe_fee_cents: number | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
          vinoshipper_error: string | null
          vinoshipper_order_id: string | null
          vinoshipper_status: string
          wine_subtotal_cents: number
        }
        Insert: {
          age_verified?: boolean
          created_at?: string
          customer_email: string
          customer_first_name: string
          customer_last_name: string
          customer_phone?: string | null
          date_of_birth?: string | null
          id?: string
          merch_fulfillment_status?: string
          merch_subtotal_cents?: number
          metadata?: Json
          notes?: string | null
          order_number: string
          payment_status?: string
          processor_net_cents?: number | null
          ship_address1: string
          ship_address2?: string | null
          ship_city: string
          ship_country?: string
          ship_state: string
          ship_zip: string
          shipping_cents?: number
          stripe_charge_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          total_cents: number
          updated_at?: string
          user_id?: string | null
          vinoshipper_error?: string | null
          vinoshipper_order_id?: string | null
          vinoshipper_status?: string
          wine_subtotal_cents?: number
        }
        Update: {
          age_verified?: boolean
          created_at?: string
          customer_email?: string
          customer_first_name?: string
          customer_last_name?: string
          customer_phone?: string | null
          date_of_birth?: string | null
          id?: string
          merch_fulfillment_status?: string
          merch_subtotal_cents?: number
          metadata?: Json
          notes?: string | null
          order_number?: string
          payment_status?: string
          processor_net_cents?: number | null
          ship_address1?: string
          ship_address2?: string | null
          ship_city?: string
          ship_country?: string
          ship_state?: string
          ship_zip?: string
          shipping_cents?: number
          stripe_charge_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
          vinoshipper_error?: string | null
          vinoshipper_order_id?: string | null
          vinoshipper_status?: string
          wine_subtotal_cents?: number
        }
        Relationships: []
      }
      pacing_forecast: {
        Row: {
          budget_cents: number
          channel: string
          computed_at: string
          id: string
          month: string
          on_pace: boolean
          projected_eom_spend_cents: number
          spend_to_date_cents: number
        }
        Insert: {
          budget_cents?: number
          channel: string
          computed_at?: string
          id?: string
          month: string
          on_pace?: boolean
          projected_eom_spend_cents?: number
          spend_to_date_cents?: number
        }
        Update: {
          budget_cents?: number
          channel?: string
          computed_at?: string
          id?: string
          month?: string
          on_pace?: boolean
          projected_eom_spend_cents?: number
          spend_to_date_cents?: number
        }
        Relationships: []
      }
      paid_link_tags: {
        Row: {
          ad_group_id: string | null
          ad_id: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          destination_url: string
          id: string
          label: string | null
          tagged_url: string
          updated_at: string
          utm_campaign: string
          utm_content: string | null
          utm_medium: string
          utm_source: string
          utm_term: string | null
        }
        Insert: {
          ad_group_id?: string | null
          ad_id?: string | null
          campaign_id?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          destination_url: string
          id?: string
          label?: string | null
          tagged_url: string
          updated_at?: string
          utm_campaign: string
          utm_content?: string | null
          utm_medium: string
          utm_source: string
          utm_term?: string | null
        }
        Update: {
          ad_group_id?: string | null
          ad_id?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          destination_url?: string
          id?: string
          label?: string | null
          tagged_url?: string
          updated_at?: string
          utm_campaign?: string
          utm_content?: string | null
          utm_medium?: string
          utm_source?: string
          utm_term?: string | null
        }
        Relationships: []
      }
      pending_merch_handoffs: {
        Row: {
          checkout_url: string
          created_at: string
          email: string
          id: string
          item_count: number
          items: Json
          reminder_sent_at: string | null
          status: string
          subtotal_cents: number
          updated_at: string
          user_id: string | null
          wine_order_id: string | null
        }
        Insert: {
          checkout_url: string
          created_at?: string
          email: string
          id?: string
          item_count?: number
          items?: Json
          reminder_sent_at?: string | null
          status?: string
          subtotal_cents?: number
          updated_at?: string
          user_id?: string | null
          wine_order_id?: string | null
        }
        Update: {
          checkout_url?: string
          created_at?: string
          email?: string
          id?: string
          item_count?: number
          items?: Json
          reminder_sent_at?: string | null
          status?: string
          subtotal_cents?: number
          updated_at?: string
          user_id?: string | null
          wine_order_id?: string | null
        }
        Relationships: []
      }
      personalization_rules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          priority: number
          segment: Json
          slot_key: string
          updated_at: string
          variant_config: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          priority?: number
          segment?: Json
          slot_key: string
          updated_at?: string
          variant_config?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          priority?: number
          segment?: Json
          slot_key?: string
          updated_at?: string
          variant_config?: Json
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          order_id: string | null
          product_handle: string
          product_kind: string
          rating: number
          reviewer_email: string | null
          reviewer_name: string
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
          verified_purchase: boolean
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_handle: string
          product_kind?: string
          rating: number
          reviewer_email?: string | null
          reviewer_name: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          verified_purchase?: boolean
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_handle?: string
          product_kind?: string
          rating?: number
          reviewer_email?: string | null
          reviewer_name?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          verified_purchase?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
          vinoshipper_customer_id: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
          vinoshipper_customer_id?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          vinoshipper_customer_id?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          body_html: string | null
          cover_image: string | null
          created_at: string
          excerpt: string | null
          id: string
          pairing_notes: string | null
          published: boolean
          recommended_product_handle: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          pairing_notes?: string | null
          published?: boolean
          recommended_product_handle?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          pairing_notes?: string | null
          published?: boolean
          recommended_product_handle?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          referred_email: string | null
          referred_id: string
          referred_name: string | null
          referred_points: number
          referrer_id: string
          referrer_points: number
          status: string
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          referred_email?: string | null
          referred_id: string
          referred_name?: string | null
          referred_points?: number
          referrer_id: string
          referrer_points?: number
          status?: string
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          referred_email?: string | null
          referred_id?: string
          referred_name?: string | null
          referred_points?: number
          referrer_id?: string
          referrer_points?: number
          status?: string
        }
        Relationships: []
      }
      rescue_partners: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          is_focus: boolean
          mission_blurb: string | null
          name: string
          photo_url: string | null
          state: string
          url: string
        }
        Insert: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_focus?: boolean
          mission_blurb?: string | null
          name: string
          photo_url?: string | null
          state?: string
          url?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_focus?: boolean
          mission_blurb?: string | null
          name?: string
          photo_url?: string | null
          state?: string
          url?: string
        }
        Relationships: []
      }
      retailer_suggestions: {
        Row: {
          city: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          notes: string | null
          phone: string | null
          premise_type: string | null
          promoted_account_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string | null
          status: string
          store_name: string
          street_address: string | null
          submitter_email: string | null
          submitter_user_id: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          premise_type?: string | null
          promoted_account_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          store_name: string
          street_address?: string | null
          submitter_email?: string | null
          submitter_user_id?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          premise_type?: string | null
          promoted_account_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          store_name?: string
          street_address?: string | null
          submitter_email?: string | null
          submitter_user_id?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      sales_accounts: {
        Row: {
          account_name: string
          buyer_name: string | null
          buyer_title: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          distributor: string | null
          distributor_rep: string | null
          distributor_rep_email: string | null
          distributor_rep_phone: string | null
          dma: string | null
          email: string | null
          id: string
          is_public: boolean
          last_order_date: string | null
          last_verified_at: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          phone: string | null
          premise_type: string | null
          priority_rank: number | null
          rep_name: string | null
          sales_order: string | null
          state: string | null
          status: string | null
          street_address: string | null
          tags: string[] | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          account_name: string
          buyer_name?: string | null
          buyer_title?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          distributor?: string | null
          distributor_rep?: string | null
          distributor_rep_email?: string | null
          distributor_rep_phone?: string | null
          dma?: string | null
          email?: string | null
          id?: string
          is_public?: boolean
          last_order_date?: string | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          premise_type?: string | null
          priority_rank?: number | null
          rep_name?: string | null
          sales_order?: string | null
          state?: string | null
          status?: string | null
          street_address?: string | null
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_name?: string
          buyer_name?: string | null
          buyer_title?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          distributor?: string | null
          distributor_rep?: string | null
          distributor_rep_email?: string | null
          distributor_rep_phone?: string | null
          dma?: string | null
          email?: string | null
          id?: string
          is_public?: boolean
          last_order_date?: string | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          premise_type?: string | null
          priority_rank?: number | null
          rep_name?: string | null
          sales_order?: string | null
          state?: string | null
          status?: string | null
          street_address?: string | null
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      sales_activities: {
        Row: {
          account_id: string
          activity_type: string | null
          created_at: string | null
          description: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          activity_type?: string | null
          created_at?: string | null
          description: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          activity_type?: string | null
          created_at?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sales_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_signups: {
        Row: {
          created_at: string
          discount_percent: number
          email: string
          first_name: string
          frequency: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          product_handle: string | null
          product_title: string | null
          status: string
          subscription_type: string
          tier: string | null
          variant_id: string | null
          wine_preferences: string[] | null
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          email: string
          first_name: string
          frequency?: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          product_handle?: string | null
          product_title?: string | null
          status?: string
          subscription_type?: string
          tier?: string | null
          variant_id?: string | null
          wine_preferences?: string[] | null
        }
        Update: {
          created_at?: string
          discount_percent?: number
          email?: string
          first_name?: string
          frequency?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          product_handle?: string | null
          product_title?: string | null
          status?: string
          subscription_type?: string
          tier?: string | null
          variant_id?: string | null
          wine_preferences?: string[] | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          invited_user_id: string | null
          recovery_link: string | null
          revoked_at: string | null
          roles: string[]
          surface: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          recovery_link?: string | null
          revoked_at?: string | null
          roles?: string[]
          surface?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          recovery_link?: string | null
          revoked_at?: string | null
          roles?: string[]
          surface?: string
          updated_at?: string
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
      vinoshipper_backfill_runs: {
        Row: {
          created_by: string | null
          cursor: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          kind: string
          started_at: string
          status: string
          total_errors: number
          total_linked: number
          total_seen: number
          total_skipped: number
        }
        Insert: {
          created_by?: string | null
          cursor?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          started_at?: string
          status?: string
          total_errors?: number
          total_linked?: number
          total_seen?: number
          total_skipped?: number
        }
        Update: {
          created_by?: string | null
          cursor?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          started_at?: string
          status?: string
          total_errors?: number
          total_linked?: number
          total_seen?: number
          total_skipped?: number
        }
        Relationships: []
      }
      vinoshipper_webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event: string
          headers: Json | null
          id: string
          identifier: string
          notes: string | null
          payload: Json
          processed: boolean
          received_at: string
          subject: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          headers?: Json | null
          id?: string
          identifier: string
          notes?: string | null
          payload: Json
          processed?: boolean
          received_at?: string
          subject: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          headers?: Json | null
          id?: string
          identifier?: string
          notes?: string | null
          payload?: Json
          processed?: boolean
          received_at?: string
          subject?: string
        }
        Relationships: []
      }
      vs_abandoned_carts: {
        Row: {
          buyer_email: string | null
          buyer_first_name: string | null
          buyer_last_name: string | null
          buyer_phone: string | null
          buyer_salutation: string | null
          cart_value: number | null
          created_at: string
          id: string
          imported_at: string
          last_seen: string | null
          problems: string | null
          sales_contents: string | null
          ship_city: string | null
          ship_first_name: string | null
          ship_last_name: string | null
          ship_state: string | null
          ship_street: string | null
          ship_zip: string | null
          skus: string[] | null
          upcs: string[] | null
        }
        Insert: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_salutation?: string | null
          cart_value?: number | null
          created_at?: string
          id?: string
          imported_at?: string
          last_seen?: string | null
          problems?: string | null
          sales_contents?: string | null
          ship_city?: string | null
          ship_first_name?: string | null
          ship_last_name?: string | null
          ship_state?: string | null
          ship_street?: string | null
          ship_zip?: string | null
          skus?: string[] | null
          upcs?: string[] | null
        }
        Update: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_salutation?: string | null
          cart_value?: number | null
          created_at?: string
          id?: string
          imported_at?: string
          last_seen?: string | null
          problems?: string | null
          sales_contents?: string | null
          ship_city?: string | null
          ship_first_name?: string | null
          ship_last_name?: string | null
          ship_state?: string | null
          ship_street?: string | null
          ship_zip?: string | null
          skus?: string[] | null
          upcs?: string[] | null
        }
        Relationships: []
      }
      vs_poll_log: {
        Row: {
          capi_purchases_sent: number
          capi_subscribes_sent: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          ltv_value_sent_cents: number
          notes: Json
          orders_new: number
          orders_seen: number
          started_at: string
        }
        Insert: {
          capi_purchases_sent?: number
          capi_subscribes_sent?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          ltv_value_sent_cents?: number
          notes?: Json
          orders_new?: number
          orders_seen?: number
          started_at?: string
        }
        Update: {
          capi_purchases_sent?: number
          capi_subscribes_sent?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          ltv_value_sent_cents?: number
          notes?: Json
          orders_new?: number
          orders_seen?: number
          started_at?: string
        }
        Relationships: []
      }
      vs_products_lifetime: {
        Row: {
          created_at: string
          discount: number | null
          discount_code: string | null
          gross_value: number | null
          id: string
          imported_at: string
          in_open_orders: number | null
          is_multipack: boolean
          name: string
          product_category: string | null
          product_id: string | null
          quantity_sold: number | null
          shipped_picked_up: number | null
          sku: string | null
          store: string | null
          upc: string | null
          value: number | null
          year: string | null
        }
        Insert: {
          created_at?: string
          discount?: number | null
          discount_code?: string | null
          gross_value?: number | null
          id?: string
          imported_at?: string
          in_open_orders?: number | null
          is_multipack?: boolean
          name: string
          product_category?: string | null
          product_id?: string | null
          quantity_sold?: number | null
          shipped_picked_up?: number | null
          sku?: string | null
          store?: string | null
          upc?: string | null
          value?: number | null
          year?: string | null
        }
        Update: {
          created_at?: string
          discount?: number | null
          discount_code?: string | null
          gross_value?: number | null
          id?: string
          imported_at?: string
          in_open_orders?: number | null
          is_multipack?: boolean
          name?: string
          product_category?: string | null
          product_id?: string | null
          quantity_sold?: number | null
          shipped_picked_up?: number | null
          sku?: string | null
          store?: string | null
          upc?: string | null
          value?: number | null
          year?: string | null
        }
        Relationships: []
      }
      vs_tracking_relay_log: {
        Row: {
          attempt_at: string
          carrier: string | null
          created_at: string
          dropship_order_id: string | null
          http_status: number | null
          id: string
          mismatch_reason: string | null
          partner_id: string | null
          relay_ok: boolean
          request_payload: Json | null
          response_payload: Json | null
          simulated: boolean
          tracking_number: string | null
          verified_at: string | null
          verified_ok: boolean | null
          vinoshipper_order_id: string | null
        }
        Insert: {
          attempt_at?: string
          carrier?: string | null
          created_at?: string
          dropship_order_id?: string | null
          http_status?: number | null
          id?: string
          mismatch_reason?: string | null
          partner_id?: string | null
          relay_ok?: boolean
          request_payload?: Json | null
          response_payload?: Json | null
          simulated?: boolean
          tracking_number?: string | null
          verified_at?: string | null
          verified_ok?: boolean | null
          vinoshipper_order_id?: string | null
        }
        Update: {
          attempt_at?: string
          carrier?: string | null
          created_at?: string
          dropship_order_id?: string | null
          http_status?: number | null
          id?: string
          mismatch_reason?: string | null
          partner_id?: string | null
          relay_ok?: boolean
          request_payload?: Json | null
          response_payload?: Json | null
          simulated?: boolean
          tracking_number?: string | null
          verified_at?: string | null
          verified_ok?: boolean | null
          vinoshipper_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vs_tracking_relay_log_dropship_order_id_fkey"
            columns: ["dropship_order_id"]
            isOneToOne: false
            referencedRelation: "dropship_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vs_tracking_relay_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "dropship_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vs_transactions: {
        Row: {
          active_club_member: boolean | null
          attribution_credit: number | null
          attribution_fees: number | null
          attribution_funds_received: number | null
          attribution_gross_product_value: number | null
          attribution_packaging: number | null
          attribution_product_discounts: number | null
          attribution_shipping: number | null
          attribution_taxes: number | null
          attribution_tip: number | null
          bottles: number | null
          business_name: string | null
          cash_external: number | null
          cc_fee: number | null
          chain_status: string | null
          club: string | null
          created_at: string
          credit_applied: number | null
          custom_state_tax: number | null
          customer_city: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_id: string | null
          customer_last_name: string | null
          customer_phone: string | null
          customer_state: string | null
          customer_street: string | null
          customer_zip: string | null
          delivery_type: string | null
          discount: number | null
          discount_code: string | null
          excise_tax: number | null
          final_order: string | null
          funds_received: number | null
          gross_value: number | null
          id: string
          imported_at: string
          inventory_location: string | null
          invoice: string
          license_type: string | null
          liters: number | null
          non_taxable_value: number | null
          order_total: number | null
          order_type: string | null
          packaging: number | null
          paid_on: string | null
          payment_type: string | null
          pick_pack_fee: number | null
          platform_total: number | null
          producer_payment: number | null
          raw: Json | null
          referrer: string | null
          release: string | null
          requested_ship_date: string | null
          sale_location: string | null
          ship_date: string | null
          ship_to_business_name: string | null
          ship_to_city: string | null
          ship_to_county: string | null
          ship_to_first_name: string | null
          ship_to_last_name: string | null
          ship_to_state: string | null
          ship_to_street: string | null
          ship_to_zip: string | null
          shipping_to_customer: number | null
          sold_by: string | null
          sold_by_team_member: string | null
          statement_num: string | null
          store: string | null
          successor_order: string | null
          taxable_value: number | null
          terms: string | null
          tip_collected: number | null
          total_sales_tax: number | null
          tracking: string | null
          transaction_date: string | null
          transaction_type: string | null
          updated_at: string
          vinoshipper_fee: number | null
          vinoshipper_funds: number | null
        }
        Insert: {
          active_club_member?: boolean | null
          attribution_credit?: number | null
          attribution_fees?: number | null
          attribution_funds_received?: number | null
          attribution_gross_product_value?: number | null
          attribution_packaging?: number | null
          attribution_product_discounts?: number | null
          attribution_shipping?: number | null
          attribution_taxes?: number | null
          attribution_tip?: number | null
          bottles?: number | null
          business_name?: string | null
          cash_external?: number | null
          cc_fee?: number | null
          chain_status?: string | null
          club?: string | null
          created_at?: string
          credit_applied?: number | null
          custom_state_tax?: number | null
          customer_city?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_id?: string | null
          customer_last_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          delivery_type?: string | null
          discount?: number | null
          discount_code?: string | null
          excise_tax?: number | null
          final_order?: string | null
          funds_received?: number | null
          gross_value?: number | null
          id?: string
          imported_at?: string
          inventory_location?: string | null
          invoice: string
          license_type?: string | null
          liters?: number | null
          non_taxable_value?: number | null
          order_total?: number | null
          order_type?: string | null
          packaging?: number | null
          paid_on?: string | null
          payment_type?: string | null
          pick_pack_fee?: number | null
          platform_total?: number | null
          producer_payment?: number | null
          raw?: Json | null
          referrer?: string | null
          release?: string | null
          requested_ship_date?: string | null
          sale_location?: string | null
          ship_date?: string | null
          ship_to_business_name?: string | null
          ship_to_city?: string | null
          ship_to_county?: string | null
          ship_to_first_name?: string | null
          ship_to_last_name?: string | null
          ship_to_state?: string | null
          ship_to_street?: string | null
          ship_to_zip?: string | null
          shipping_to_customer?: number | null
          sold_by?: string | null
          sold_by_team_member?: string | null
          statement_num?: string | null
          store?: string | null
          successor_order?: string | null
          taxable_value?: number | null
          terms?: string | null
          tip_collected?: number | null
          total_sales_tax?: number | null
          tracking?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          updated_at?: string
          vinoshipper_fee?: number | null
          vinoshipper_funds?: number | null
        }
        Update: {
          active_club_member?: boolean | null
          attribution_credit?: number | null
          attribution_fees?: number | null
          attribution_funds_received?: number | null
          attribution_gross_product_value?: number | null
          attribution_packaging?: number | null
          attribution_product_discounts?: number | null
          attribution_shipping?: number | null
          attribution_taxes?: number | null
          attribution_tip?: number | null
          bottles?: number | null
          business_name?: string | null
          cash_external?: number | null
          cc_fee?: number | null
          chain_status?: string | null
          club?: string | null
          created_at?: string
          credit_applied?: number | null
          custom_state_tax?: number | null
          customer_city?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_id?: string | null
          customer_last_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_street?: string | null
          customer_zip?: string | null
          delivery_type?: string | null
          discount?: number | null
          discount_code?: string | null
          excise_tax?: number | null
          final_order?: string | null
          funds_received?: number | null
          gross_value?: number | null
          id?: string
          imported_at?: string
          inventory_location?: string | null
          invoice?: string
          license_type?: string | null
          liters?: number | null
          non_taxable_value?: number | null
          order_total?: number | null
          order_type?: string | null
          packaging?: number | null
          paid_on?: string | null
          payment_type?: string | null
          pick_pack_fee?: number | null
          platform_total?: number | null
          producer_payment?: number | null
          raw?: Json | null
          referrer?: string | null
          release?: string | null
          requested_ship_date?: string | null
          sale_location?: string | null
          ship_date?: string | null
          ship_to_business_name?: string | null
          ship_to_city?: string | null
          ship_to_county?: string | null
          ship_to_first_name?: string | null
          ship_to_last_name?: string | null
          ship_to_state?: string | null
          ship_to_street?: string | null
          ship_to_zip?: string | null
          shipping_to_customer?: number | null
          sold_by?: string | null
          sold_by_team_member?: string | null
          statement_num?: string | null
          store?: string | null
          successor_order?: string | null
          taxable_value?: number | null
          terms?: string | null
          tip_collected?: number | null
          total_sales_tax?: number | null
          tracking?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          updated_at?: string
          vinoshipper_fee?: number | null
          vinoshipper_funds?: number | null
        }
        Relationships: []
      }
      weather_signals: {
        Row: {
          computed_at: string
          condition: string | null
          dma: string
          forecast_date: string
          id: string
          max_temp_f: number | null
          min_temp_f: number | null
          payload: Json
          region: string | null
          signal_kind: string
        }
        Insert: {
          computed_at?: string
          condition?: string | null
          dma: string
          forecast_date: string
          id?: string
          max_temp_f?: number | null
          min_temp_f?: number | null
          payload?: Json
          region?: string | null
          signal_kind: string
        }
        Update: {
          computed_at?: string
          condition?: string | null
          dma?: string
          forecast_date?: string
          id?: string
          max_temp_f?: number | null
          min_temp_f?: number | null
          payload?: Json
          region?: string | null
          signal_kind?: string
        }
        Relationships: []
      }
      welcome_email_schedule: {
        Row: {
          attempts: number
          created_at: string
          email: string
          id: string
          last_error: string | null
          send_at: string
          sent_at: string | null
          status: string
          step_index: number
          template_name: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          id?: string
          last_error?: string | null
          send_at: string
          sent_at?: string | null
          status?: string
          step_index: number
          template_name: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          id?: string
          last_error?: string | null
          send_at?: string
          sent_at?: string | null
          status?: string
          step_index?: number
          template_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      wholesale_inquiries: {
        Row: {
          business: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          region: string
        }
        Insert: {
          business: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          region: string
        }
        Update: {
          business?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          region?: string
        }
        Relationships: []
      }
      wine_club_curation_picks: {
        Row: {
          ai_rationale: string | null
          created_at: string
          id: string
          price_cents: number
          product_handle: string
          product_image_url: string | null
          product_title: string
          quantity: number
          role: string | null
          run_id: string
          sort_order: number
          tier_id: string
          wine_product_id: string | null
        }
        Insert: {
          ai_rationale?: string | null
          created_at?: string
          id?: string
          price_cents?: number
          product_handle: string
          product_image_url?: string | null
          product_title: string
          quantity?: number
          role?: string | null
          run_id: string
          sort_order?: number
          tier_id: string
          wine_product_id?: string | null
        }
        Update: {
          ai_rationale?: string | null
          created_at?: string
          id?: string
          price_cents?: number
          product_handle?: string
          product_image_url?: string | null
          product_title?: string
          quantity?: number
          role?: string | null
          run_id?: string
          sort_order?: number
          tier_id?: string
          wine_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_club_curation_picks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wine_club_curation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_club_curation_picks_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "wine_club_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_club_curation_picks_wine_product_id_fkey"
            columns: ["wine_product_id"]
            isOneToOne: false
            referencedRelation: "wine_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_club_curation_runs: {
        Row: {
          ai_model: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          season: string
          ship_window_end: string
          ship_window_start: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          season: string
          ship_window_end: string
          ship_window_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          season?: string
          ship_window_end?: string
          ship_window_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wine_club_events: {
        Row: {
          created_at: string
          event_type: string
          from_tier: string | null
          id: string
          metadata: Json | null
          to_tier: string | null
          user_id: string
          vinoshipper_membership_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          from_tier?: string | null
          id?: string
          metadata?: Json | null
          to_tier?: string | null
          user_id: string
          vinoshipper_membership_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          from_tier?: string | null
          id?: string
          metadata?: Json | null
          to_tier?: string | null
          user_id?: string
          vinoshipper_membership_id?: string | null
        }
        Relationships: []
      }
      wine_club_memberships: {
        Row: {
          app_tier_config_id: string | null
          cancelled_at: string | null
          claimed_at: string | null
          created_at: string | null
          gift_message: string | null
          grandfathered_discount_percent: number | null
          id: string
          imported_at: string | null
          is_gift: boolean | null
          is_legacy_member: boolean
          joined_at: string | null
          next_shipment_date: string | null
          origin: string
          payment_status: string
          shipping_address_line1: string | null
          shipping_address_line2: string | null
          shipping_city: string | null
          shipping_state: string | null
          shipping_zip: string | null
          status: string
          tier_id: string
          updated_at: string | null
          user_id: string
          vinoshipper_customer_id: string | null
          vinoshipper_membership_id: string | null
          wine_preferences: string[] | null
        }
        Insert: {
          app_tier_config_id?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string | null
          gift_message?: string | null
          grandfathered_discount_percent?: number | null
          id?: string
          imported_at?: string | null
          is_gift?: boolean | null
          is_legacy_member?: boolean
          joined_at?: string | null
          next_shipment_date?: string | null
          origin?: string
          payment_status?: string
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          status?: string
          tier_id: string
          updated_at?: string | null
          user_id: string
          vinoshipper_customer_id?: string | null
          vinoshipper_membership_id?: string | null
          wine_preferences?: string[] | null
        }
        Update: {
          app_tier_config_id?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string | null
          gift_message?: string | null
          grandfathered_discount_percent?: number | null
          id?: string
          imported_at?: string | null
          is_gift?: boolean | null
          is_legacy_member?: boolean
          joined_at?: string | null
          next_shipment_date?: string | null
          origin?: string
          payment_status?: string
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          status?: string
          tier_id?: string
          updated_at?: string | null
          user_id?: string
          vinoshipper_customer_id?: string | null
          vinoshipper_membership_id?: string | null
          wine_preferences?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_club_memberships_app_tier_config_id_fkey"
            columns: ["app_tier_config_id"]
            isOneToOne: false
            referencedRelation: "wine_club_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_club_memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "wine_club_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_club_settings: {
        Row: {
          cutoff_offset_days: number
          dispatch_hour_local: number
          id: number
          preview_email_offset_days: number
          ship_dow: number
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cutoff_offset_days?: number
          dispatch_hour_local?: number
          id?: number
          preview_email_offset_days?: number
          ship_dow?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cutoff_offset_days?: number
          dispatch_hour_local?: number
          id?: number
          preview_email_offset_days?: number
          ship_dow?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wine_club_shipment_items: {
        Row: {
          created_at: string | null
          id: string
          is_ai_suggested: boolean | null
          is_customer_swap: boolean | null
          price_cents: number | null
          product_handle: string
          product_image_url: string | null
          product_title: string
          quantity: number | null
          shipment_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          is_customer_swap?: boolean | null
          price_cents?: number | null
          product_handle: string
          product_image_url?: string | null
          product_title: string
          quantity?: number | null
          shipment_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          is_customer_swap?: boolean | null
          price_cents?: number | null
          product_handle?: string
          product_image_url?: string | null
          product_title?: string
          quantity?: number | null
          shipment_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_club_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "wine_club_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_club_shipments: {
        Row: {
          created_at: string | null
          curation_run_id: string | null
          customer_notified_at: string | null
          customization_deadline: string | null
          cutoff_at: string | null
          delivery_destination_type: string
          delivery_ups_access_point: Json | null
          dispatch_error: string | null
          dispatched_at: string | null
          final_reminder_sent_at: string | null
          id: string
          membership_id: string
          notes: string | null
          notification_sent_at: string | null
          shipment_date: string | null
          status: string
          total_cents: number | null
          tracking_number: string | null
          updated_at: string | null
          vinoshipper_coupon_code: string | null
          vinoshipper_order_id: string | null
          weather_hold_notified_at: string | null
          weather_hold_state: string | null
          weather_hold_until: string | null
        }
        Insert: {
          created_at?: string | null
          curation_run_id?: string | null
          customer_notified_at?: string | null
          customization_deadline?: string | null
          cutoff_at?: string | null
          delivery_destination_type?: string
          delivery_ups_access_point?: Json | null
          dispatch_error?: string | null
          dispatched_at?: string | null
          final_reminder_sent_at?: string | null
          id?: string
          membership_id: string
          notes?: string | null
          notification_sent_at?: string | null
          shipment_date?: string | null
          status?: string
          total_cents?: number | null
          tracking_number?: string | null
          updated_at?: string | null
          vinoshipper_coupon_code?: string | null
          vinoshipper_order_id?: string | null
          weather_hold_notified_at?: string | null
          weather_hold_state?: string | null
          weather_hold_until?: string | null
        }
        Update: {
          created_at?: string | null
          curation_run_id?: string | null
          customer_notified_at?: string | null
          customization_deadline?: string | null
          cutoff_at?: string | null
          delivery_destination_type?: string
          delivery_ups_access_point?: Json | null
          dispatch_error?: string | null
          dispatched_at?: string | null
          final_reminder_sent_at?: string | null
          id?: string
          membership_id?: string
          notes?: string | null
          notification_sent_at?: string | null
          shipment_date?: string | null
          status?: string
          total_cents?: number | null
          tracking_number?: string | null
          updated_at?: string | null
          vinoshipper_coupon_code?: string | null
          vinoshipper_order_id?: string | null
          weather_hold_notified_at?: string | null
          weather_hold_state?: string | null
          weather_hold_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_club_shipments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "wine_club_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_club_tiers: {
        Row: {
          bottle_count: number
          created_at: string | null
          description: string | null
          discount_percent: number
          features: string[] | null
          frequency: string
          id: string
          is_active: boolean | null
          name: string
          price_cents: number
          shipment_discount_percent: number | null
          slug: string
          sort_order: number | null
          updated_at: string | null
          vinoshipper_club_id: string | null
          wine_type: string
        }
        Insert: {
          bottle_count: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number
          features?: string[] | null
          frequency: string
          id?: string
          is_active?: boolean | null
          name: string
          price_cents: number
          shipment_discount_percent?: number | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
          vinoshipper_club_id?: string | null
          wine_type: string
        }
        Update: {
          bottle_count?: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number
          features?: string[] | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          name?: string
          price_cents?: number
          shipment_discount_percent?: number | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
          vinoshipper_club_id?: string | null
          wine_type?: string
        }
        Relationships: []
      }
      wine_club_weather_holds: {
        Row: {
          created_at: string
          created_by: string | null
          customer_notified_at: string | null
          hold_until: string
          id: string
          lifted_at: string | null
          reason: string | null
          severity: string
          state: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_notified_at?: string | null
          hold_until: string
          id?: string
          lifted_at?: string | null
          reason?: string | null
          severity?: string
          state: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_notified_at?: string | null
          hold_until?: string
          id?: string
          lifted_at?: string | null
          reason?: string | null
          severity?: string
          state?: string
        }
        Relationships: []
      }
      wine_products: {
        Row: {
          badges: string[] | null
          club_price_cents: number | null
          cost_cents: number | null
          created_at: string
          description: string | null
          gallery_urls: string[] | null
          handle: string
          id: string
          image_url: string | null
          in_stock: boolean
          is_active: boolean
          last_synced_at: string | null
          price_cents: number
          sort_order: number
          tags: string[] | null
          tasting_notes: string | null
          title: string
          updated_at: string
          varietal: string | null
          vinoshipper_cart_url: string | null
          vinoshipper_product_id: string | null
          vinoshipper_sku: string | null
          vintage: number | null
        }
        Insert: {
          badges?: string[] | null
          club_price_cents?: number | null
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          gallery_urls?: string[] | null
          handle: string
          id?: string
          image_url?: string | null
          in_stock?: boolean
          is_active?: boolean
          last_synced_at?: string | null
          price_cents?: number
          sort_order?: number
          tags?: string[] | null
          tasting_notes?: string | null
          title: string
          updated_at?: string
          varietal?: string | null
          vinoshipper_cart_url?: string | null
          vinoshipper_product_id?: string | null
          vinoshipper_sku?: string | null
          vintage?: number | null
        }
        Update: {
          badges?: string[] | null
          club_price_cents?: number | null
          cost_cents?: number | null
          created_at?: string
          description?: string | null
          gallery_urls?: string[] | null
          handle?: string
          id?: string
          image_url?: string | null
          in_stock?: boolean
          is_active?: boolean
          last_synced_at?: string | null
          price_cents?: number
          sort_order?: number
          tags?: string[] | null
          tasting_notes?: string | null
          title?: string
          updated_at?: string
          varietal?: string | null
          vinoshipper_cart_url?: string | null
          vinoshipper_product_id?: string | null
          vinoshipper_sku?: string | null
          vintage?: number | null
        }
        Relationships: []
      }
      wine_subscriptions: {
        Row: {
          cadence: string
          created_at: string
          discount_percent: number
          id: string
          next_ship_date: string | null
          product_handle: string | null
          product_image_url: string | null
          product_title: string
          quantity: number
          sku: string
          status: string
          unit_price_cents: number
          updated_at: string
          user_id: string
          vinoshipper_subscription_id: string | null
        }
        Insert: {
          cadence?: string
          created_at?: string
          discount_percent?: number
          id?: string
          next_ship_date?: string | null
          product_handle?: string | null
          product_image_url?: string | null
          product_title: string
          quantity?: number
          sku: string
          status?: string
          unit_price_cents?: number
          updated_at?: string
          user_id: string
          vinoshipper_subscription_id?: string | null
        }
        Update: {
          cadence?: string
          created_at?: string
          discount_percent?: number
          id?: string
          next_ship_date?: string | null
          product_handle?: string | null
          product_image_url?: string | null
          product_title?: string
          quantity?: number
          sku?: string
          status?: string
          unit_price_cents?: number
          updated_at?: string
          user_id?: string
          vinoshipper_subscription_id?: string | null
        }
        Relationships: []
      }
      wp_import_runs: {
        Row: {
          completed_at: string | null
          error_log: string | null
          failed_count: number
          id: string
          imported_count: number
          post_type: string
          skipped_count: number
          source_url: string
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_log?: string | null
          failed_count?: number
          id?: string
          imported_count?: number
          post_type: string
          skipped_count?: number
          source_url: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_log?: string | null
          failed_count?: number
          id?: string
          imported_count?: number
          post_type?: string
          skipped_count?: number
          source_url?: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      merch_storefront: {
        Row: {
          badges: string[] | null
          category: string | null
          collection: string | null
          fulfillment_mode: string | null
          gallery_urls: string[] | null
          id: string | null
          is_featured: boolean | null
          long_description: string | null
          mock_review_count: number | null
          mock_star_rating: number | null
          product_image_url: string | null
          product_title: string | null
          retail_cents: number | null
          short_description: string | null
          sku: string | null
          storefront_sort: number | null
          vendor_name: string | null
          vendor_type: string | null
        }
        Relationships: []
      }
      order_margin_v: {
        Row: {
          cogs_cents: number | null
          created_at: string | null
          gross_cents: number | null
          gross_margin_cents: number | null
          margin_pct: number | null
          order_id: string | null
          order_number: string | null
          payment_status: string | null
          stripe_fee_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_executive_decision: {
        Args: { _action: string; _decision_id: string }
        Returns: {
          action_kind: string
          action_payload: Json
          approved_at: string | null
          approved_by: string | null
          auto_executable: boolean
          category: string
          confidence: number | null
          created_at: string
          estimated_impact_cents: number | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          narrative: string | null
          priority: number
          recommended_action: string
          related_record_ids: string[] | null
          scope: string
          scope_id: string | null
          source_engine: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "executive_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      award_loyalty_points: {
        Args: {
          _delta_points: number
          _event_type: string
          _metadata?: Json
          _order_id?: string
          _reason: string
          _subtotal_cents?: number
          _user_id: string
        }
        Returns: string
      }
      can_view_kennel: { Args: { _user_id: string }; Returns: boolean }
      compliant_retailer_set: {
        Args: {
          _latitude: number
          _longitude: number
          _min_count?: number
          _premise_filter?: string
        }
        Returns: {
          account_name: string
          city: string
          distance_miles: number
          id: string
          latitude: number
          longitude: number
          phone: string
          premise_type: string
          state: string
          street_address: string
          website: string
          zip: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_welcome_series:
        | { Args: { _email?: string; _user_id: string }; Returns: undefined }
        | {
            Args: {
              _email: string
              _user_id: string
              _vinoshipper_created_at?: string
            }
            Returns: undefined
          }
      experiment_assign: {
        Args: {
          _experiment_key: string
          _segment?: Json
          _user_id?: string
          _visitor_id: string
        }
        Returns: {
          experiment_id: string
          variant_config: Json
          variant_id: string
          variant_key: string
        }[]
      }
      experiment_record: {
        Args: {
          _event_type: string
          _experiment_id: string
          _goal_key?: string
          _metadata?: Json
          _revenue_cents?: number
          _user_id: string
          _variant_id: string
          _visitor_id: string
        }
        Returns: undefined
      }
      get_public_impact_totals: {
        Args: never
        Returns: {
          total_bottles: number
          total_customers: number
          total_donation_cents: number
          total_rescues: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ad_ops: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      is_ambassador_manager: { Args: { _user_id: string }; Returns: boolean }
      is_brand_ambassador: { Args: { _user_id: string }; Returns: boolean }
      is_cms_editor: { Args: { _user_id: string }; Returns: boolean }
      is_dropship_manager: { Args: { _user_id: string }; Returns: boolean }
      is_executive: { Args: { _user_id: string }; Returns: boolean }
      is_sales_team: { Args: { _user_id: string }; Returns: boolean }
      is_wine_club_manager: { Args: { _user_id: string }; Returns: boolean }
      kennel_cron_status: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_run_duration_ms: number
          last_run_finished_at: string
          last_run_return_message: string
          last_run_started_at: string
          last_run_status: string
          schedule: string
        }[]
      }
      kennel_review_recommendation: {
        Args: { _action: string; _notes?: string; _rec_id: string }
        Returns: {
          channel_id: string | null
          confidence: number
          created_at: string
          executed_at: string | null
          expires_at: string | null
          id: string
          ingest_request_id: string | null
          kind: string
          payload: Json
          projected_impact_cents: number
          rationale: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rollback_state: Json | null
          source: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ad_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      redeem_loyalty_points: {
        Args: {
          _client_request_id?: string
          _metadata?: Json
          _points_cost: number
          _reward_category: string
          _reward_id: string
          _reward_title: string
          _ship_state?: string
          _simulated?: boolean
        }
        Returns: {
          ledger_id: string
          new_balance: number
          redemption_id: string
        }[]
      }
      simulate_loyalty_earn: {
        Args: { _client_request_id?: string; _subtotal_cents: number }
        Returns: {
          ledger_id: string
          new_balance: number
          points_awarded: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "sales_rep"
        | "national_manager"
        | "regional_manager"
        | "state_manager"
        | "brand_ambassador"
        | "wine_club_manager"
        | "dropship_manager"
        | "ambassador_manager"
        | "cms_editor"
        | "crm_user"
        | "ad_ops_manager"
        | "executive"
        | "kennel_viewer"
      experiment_metric:
        | "revenue_per_visitor"
        | "conversion_rate"
        | "club_signup"
        | "ambassador_apply"
        | "custom"
      experiment_status: "draft" | "running" | "paused" | "ended"
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
      app_role: [
        "owner",
        "admin",
        "sales_rep",
        "national_manager",
        "regional_manager",
        "state_manager",
        "brand_ambassador",
        "wine_club_manager",
        "dropship_manager",
        "ambassador_manager",
        "cms_editor",
        "crm_user",
        "ad_ops_manager",
        "executive",
        "kennel_viewer",
      ],
      experiment_metric: [
        "revenue_per_visitor",
        "conversion_rate",
        "club_signup",
        "ambassador_apply",
        "custom",
      ],
      experiment_status: ["draft", "running", "paused", "ended"],
    },
  },
} as const
