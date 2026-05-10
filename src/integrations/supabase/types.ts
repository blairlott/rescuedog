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
          display_name: string | null
          email: string | null
          favorite_rescue_id: string | null
          id: string
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          updated_at: string
          wine_preferences: string[] | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          favorite_rescue_id?: string | null
          id: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
          wine_preferences?: string[] | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          favorite_rescue_id?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
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
          id: string
          notes: string | null
          partner_id: string
          partner_order_id: string | null
          shipped_at: string | null
          shipping_address: Json | null
          status: string
          submitted_at: string | null
          subtotal_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vinoshipper_order_id: string | null
        }
        Insert: {
          carrier?: string | null
          cost_cents?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          partner_id: string
          partner_order_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vinoshipper_order_id?: string | null
        }
        Update: {
          carrier?: string | null
          cost_cents?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          partner_id?: string
          partner_order_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          submitted_at?: string | null
          subtotal_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vinoshipper_order_id?: string | null
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
          id: string
          name: string
          notes: string | null
          notify_on_new_order: boolean
          payout_terms: string | null
          slug: string
          status: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_key_secret_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          notify_on_new_order?: boolean
          payout_terms?: string | null
          slug: string
          status?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_key_secret_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          notify_on_new_order?: boolean
          payout_terms?: string | null
          slug?: string
          status?: string
          updated_at?: string
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
          cost_cents: number
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          partner_id: string
          partner_sku: string | null
          product_image_url: string | null
          product_title: string
          retail_cents: number
          sku: string
          updated_at: string
          vinoshipper_product_id: string | null
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partner_id: string
          partner_sku?: string | null
          product_image_url?: string | null
          product_title: string
          retail_cents?: number
          sku: string
          updated_at?: string
          vinoshipper_product_id?: string | null
        }
        Update: {
          cost_cents?: number
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          partner_id?: string
          partner_sku?: string | null
          product_image_url?: string | null
          product_title?: string
          retail_cents?: number
          sku?: string
          updated_at?: string
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
      profiles: {
        Row: {
          approved: boolean
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
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
          name: string
          state: string
          url: string
        }
        Insert: {
          city?: string
          created_at?: string
          id?: string
          name: string
          state?: string
          url?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
          state?: string
          url?: string
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
          email: string | null
          id: string
          last_order_date: string | null
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
          email?: string | null
          id?: string
          last_order_date?: string | null
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
          email?: string | null
          id?: string
          last_order_date?: string | null
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
      wine_club_memberships: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          gift_message: string | null
          id: string
          is_gift: boolean | null
          is_legacy_member: boolean
          joined_at: string | null
          next_shipment_date: string | null
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
          cancelled_at?: string | null
          created_at?: string | null
          gift_message?: string | null
          id?: string
          is_gift?: boolean | null
          is_legacy_member?: boolean
          joined_at?: string | null
          next_shipment_date?: string | null
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
          cancelled_at?: string | null
          created_at?: string | null
          gift_message?: string | null
          id?: string
          is_gift?: boolean | null
          is_legacy_member?: boolean
          joined_at?: string | null
          next_shipment_date?: string | null
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
            foreignKeyName: "wine_club_memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "wine_club_tiers"
            referencedColumns: ["id"]
          },
        ]
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
          customization_deadline: string | null
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
        }
        Insert: {
          created_at?: string | null
          customization_deadline?: string | null
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
        }
        Update: {
          created_at?: string | null
          customization_deadline?: string | null
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
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
          vinoshipper_club_id?: string | null
          wine_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      is_cms_editor: { Args: { _user_id: string }; Returns: boolean }
      is_dropship_manager: { Args: { _user_id: string }; Returns: boolean }
      is_wine_club_manager: { Args: { _user_id: string }; Returns: boolean }
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
      ],
    },
  },
} as const
