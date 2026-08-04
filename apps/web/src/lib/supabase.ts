import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { webConfig, isSupabaseConfigured } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(webConfig.supabaseUrl!, webConfig.supabaseAnonKey!);
  }
  return client;
}
