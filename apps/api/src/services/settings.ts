import { getSupabaseAdmin } from '../lib/supabase.js';
import { config } from '../config.js';

export type WhatsAppProvider = 'meta' | 'evolution' | 'twilio' | 'mock';

export interface WhatsAppSettings {
  provider: WhatsAppProvider;
  apiUrl: string;
  token: string;
  instance: string;
  instanceNumber: string;
  phoneNumberId?: string;
}

const SETTINGS_KEY = 'whatsapp';

const EMAIL_PROVIDERS = new Set(['meta', 'evolution', 'twilio', 'mock']);

export function sanitize(value: WhatsAppSettings): WhatsAppSettings {
  return {
    provider: EMAIL_PROVIDERS.has(value.provider) ? value.provider : 'mock',
    apiUrl: value.apiUrl?.trim() ?? '',
    token: value.token?.trim() ?? '',
    instance: value.instance?.trim() ?? '',
    instanceNumber: value.instanceNumber?.trim() ?? '',
    phoneNumberId: value.phoneNumberId?.trim() ?? '',
  };
}

/**
 * Config atual do WhatsApp = overrides salvos no banco ?? .env.
 */
export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
  const env: WhatsAppSettings = {
    provider: config.whatsapp.provider,
    apiUrl: config.whatsapp.apiUrl,
    token: config.whatsapp.token,
    instance: config.whatsapp.instance,
    instanceNumber: config.whatsapp.instanceNumber,
    phoneNumberId: config.whatsapp.phoneNumberId,
  };

  const sb = getSupabaseAdmin();
  const { data } = await sb.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();

  if (data?.value && typeof data.value === 'object') {
    const stored = data.value as Partial<WhatsAppSettings>;
    return sanitize({ ...env, ...stored });
  }
  return sanitize(env);
}

/**
 * Persiste overrides. Campos vazios removem o override e voltam ao .env.
 */
export async function saveWhatsAppSettings(
  input: Partial<Omit<WhatsAppSettings, 'token'> & { token?: string }>
): Promise<WhatsAppSettings> {
  const sb = getSupabaseAdmin();
  const current = await getWhatsAppSettings();

  const next: WhatsAppSettings = {
    provider: input.provider ?? current.provider,
    apiUrl: input.apiUrl ?? current.apiUrl,
    instance: input.instance ?? current.instance,
    instanceNumber: input.instanceNumber ?? current.instanceNumber,
    phoneNumberId: input.phoneNumberId ?? current.phoneNumberId,
    token: current.token,
  };

  // Se enviar token, substitui; senão mantém o atual.
  if (input.token) next.token = input.token.trim();

  const stored: WhatsAppSettings = {
    provider: input.provider ?? current.provider,
    apiUrl: input.apiUrl ?? current.apiUrl,
    instance: input.instance ?? current.instance,
    instanceNumber: input.instanceNumber ?? current.instanceNumber,
    phoneNumberId: input.phoneNumberId ?? current.phoneNumberId,
    token: input.token ? input.token.trim() : current.token,
  };

  const { error } = await sb
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: storedToValue(current, stored) }, { onConflict: 'key' });

  if (error) throw error;
  return next;
}

function storedToValue(current: WhatsAppSettings, patch: WhatsAppSettings): WhatsAppSettings {
  return {
    provider: patch.provider ?? current.provider,
    apiUrl: patch.apiUrl ?? current.apiUrl,
    token: patch.token ?? current.token,
    instance: patch.instance ?? current.instance,
    instanceNumber: patch.instanceNumber ?? current.instanceNumber,
    phoneNumberId: patch.phoneNumberId ?? current.phoneNumberId,
  };
}