import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, hasSupabaseConfig } from '../config.js';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

let adminClient: SupabaseClient | null = null;

/**
 * Cliente Supabase com service role (backend only).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!hasSupabaseConfig()) {
    throw new Error(
      'Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (veja .env.example).'
    );
  }
  if (!adminClient) {
    adminClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey || config.supabaseAnonKey,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
  }
  return adminClient;
}

/** Cliente com JWT do usuário (respeita RLS) */
export function getSupabaseAsUser(accessToken: string): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
  }
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
