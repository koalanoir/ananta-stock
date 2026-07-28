export type AdminDatabase = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          subscription_status: "trial" | "active" | "past_due" | "cancelled";
          trial_ends_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          subscription_status?: "trial" | "active" | "past_due" | "cancelled";
          trial_ends_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      stores: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          login_code: string | null;
          currency: string;
          timezone: string;
          active: boolean;
          created_at: string;
          updated_at: string;
          business_type: "retail" | "restaurant";
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          login_code?: string | null;
          currency?: string;
          timezone?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          business_type?: "retail" | "restaurant";
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["stores"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          organization_id: string;
          user_id: string;
          store_id: string | null;
          role: "owner" | "manager" | "seller";
          username: string | null;
          login_enabled: boolean;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          store_id?: string | null;
          role: "owner" | "manager" | "seller";
          username?: string | null;
          login_enabled?: boolean;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [];
      };
      account_settings: {
        Row: {
          organization_id: string;
          max_sellers: number;
          retain_customer_orders: boolean;
          retain_invoices: boolean;
          feature_flags: Record<string, boolean>;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          max_sellers?: number;
          retain_customer_orders?: boolean;
          retain_invoices?: boolean;
          feature_flags?: Record<string, boolean>;
          updated_at?: string;
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["account_settings"]["Insert"]>;
        Relationships: [];
      };
      customer_orders: {
        Row: {
          id: string;
          organization_id: string;
          store_id: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_id: string;
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["customer_orders"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          store_id: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_id: string;
        };
        Update: Partial<AdminDatabase["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      membership_role: "owner" | "manager" | "seller";
    };
    CompositeTypes: Record<string, never>;
  };
};
