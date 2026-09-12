import type { SupabaseClient } from '@supabase/supabase-js';

export interface Database {
  public: {
    Tables: {
      audits: {
        Row: {
          id: string;
          source_url: string;
          provider: string;
          status: string;
          title: string | null;
          message: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audits']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audits']['Row']>;
      };
      jobs: {
        Row: {
          id: string;
          audit_id: string | null;
          status: 'pending' | 'running' | 'completed' | 'failed';
          progress: number;
          result: Record<string, unknown> | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['jobs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Row']>;
      };
    };
  };
}

export type Supabase = SupabaseClient<Database>;