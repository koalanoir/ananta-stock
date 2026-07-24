export type AdminDatabase = {
  public: {
    Tables: {
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      membership_role: "owner" | "manager" | "seller";
    };
    CompositeTypes: Record<string, never>;
  };
};
