import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function optionalFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: optionalInt('PORT', 4000),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: optional('SUPABASE_ANON_KEY', ''),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  geminiApiKey: required('GEMINI_API_KEY'),
  geminiModel: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
  apiKey: required('API_KEY'),
  evidenceBucket: 'evidences',

  whatsapp: {
    provider: optional('WHATSAPP_PROVIDER', 'mock') as 'meta' | 'evolution' | 'twilio' | 'mock',
    apiUrl: optional('WHATSAPP_API_URL', 'https://graph.facebook.com/v19.0'),
    token: optional('WHATSAPP_TOKEN', ''),
    phoneNumberId: optional('WHATSAPP_PHONE_NUMBER_ID', ''),
    instance: optional('WHATSAPP_INSTANCE', ''),
    webhookVerifyToken: optional('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'concluiai_webhook_verify'),
  },

  score: {
    weightP: optionalFloat('SCORE_WEIGHT_P', 0.35),
    weightE: optionalFloat('SCORE_WEIGHT_E', 0.3),
    weightQ: optionalFloat('SCORE_WEIGHT_Q', 0.35),
    criticalMultiplier: optionalFloat('SCORE_CRITICAL_MULTIPLIER', 1.5),
  },

  jobs: {
    alertCheckIntervalMs: optionalInt('ALERT_CHECK_INTERVAL_MS', 60_000),
    scoreRecalcIntervalMs: optionalInt('SCORE_RECALC_INTERVAL_MS', 300_000),
    dailyGenerateEnabled: process.env.CRON_DAILY_GENERATE !== '0',
    dailyGenerateCron: optional('CRON_DAILY_GENERATE_CRON', '0 5 * * *'),
    dailyGenerateTz: optional('CRON_DAILY_GENERATE_TZ', 'America/Sao_Paulo'),
  },
} as const;

export function hasSupabaseConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}
