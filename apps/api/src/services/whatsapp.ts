import { getSupabaseAdmin } from '../lib/supabase.js';
import { getWhatsAppSettings, type WhatsAppSettings } from './settings.js';

interface ResolvedWhatsApp extends WhatsAppSettings {
  phoneNumberId: string;
}

async function resolveWhatsAppSettings(): Promise<ResolvedWhatsApp> {
  const s = await getWhatsAppSettings();
  return {
    provider: s.provider,
    apiUrl: s.apiUrl,
    token: s.token,
    instance: s.instance,
    instanceNumber: s.instanceNumber,
    phoneNumberId: s.phoneNumberId ?? '',
  };
}

export interface WhatsAppSendResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'mock' | 'blocked';
  providerResponse?: unknown;
  error?: string;
}

/**
 * Normaliza um telefone brasileiro para E.164 (55 + DDD + 9 + número).
 * Aceita entradas com 9 e sem/´+55, com/sem 9 (fixo→celular) e retorna { number, valid }.
 */
export function normalizePhoneBR(raw: string): { number: string; valid: boolean } {
  const d = (raw || '').replace(/\D/g, '');
  let n = d;

  if (/^55\d{2}\d{8}$/.test(n) && n.length === 12) {
    // 55 + DDD + 8 dígitos (ex.: 555135083008) → insere o 9 de celular após o DDD
    n = n.slice(0, 4) + '9' + n.slice(4);
  } else if (!/^55/.test(n) && n.length === 11) {
    // sem 55, já com o 9 (ex.: 51993257923) → prefixa 55
    n = '55' + n;
  } else if (!/^55/.test(n) && n.length === 10) {
    // sem 55 e sem o 9 (fixo) → prefixa 55 e insere o 9
    n = '55' + n.slice(0, 2) + '9' + n.slice(2);
  }

  const valid = /^55\d{2}9\d{8}$/.test(n);
  return { number: n, valid };
}

/**
 * Envia alerta via WhatsApp.
 * Configure WHATSAPP_PROVIDER e credenciais via painel (ou .env).
 */
export async function sendWhatsAppMessage(params: {
  toPhone: string;
  message: string;
  taskInstanceId?: string;
  unitId?: string;
  recipientProfileId?: string;
}): Promise<WhatsAppSendResult> {
  const settings = await resolveWhatsAppSettings();
  const { provider, token, apiUrl, phoneNumberId, instance, instanceNumber } = settings;
  let result: WhatsAppSendResult;

  // Normaliza o telefone BR (E.164) e valida antes de qualquer envio.
  const { number: toPhone, valid } = normalizePhoneBR(params.toPhone);
  const { number: normInstance } = normalizePhoneBR(instanceNumber || '');
  const rawInstance = (instanceNumber || '').replace(/\D/g, '');

  if (!valid) {
    result = {
      ok: false,
      status: 'blocked',
      error: `Telefone inválido para WhatsApp: ${params.toPhone} (use 55 + DDD + 9 + número)`,
    };
  } else if (normInstance && (toPhone === normInstance || toPhone === rawInstance)) {
    result = {
      ok: false,
      status: 'blocked',
      error: `Alerta não enviado: o destinatário é o mesmo número do robô (${toPhone}). Cadastre o celular real do gerente/operador.`,
    };
  } else {
    switch (provider) {
      case 'meta':
        result = await sendViaMeta(toPhone, params.message, token, apiUrl, phoneNumberId);
        break;
      case 'evolution':
        result = await sendViaEvolution(toPhone, params.message, apiUrl, token, instance);
        break;
      case 'twilio':
        result = await sendViaTwilio(toPhone, params.message, token, phoneNumberId);
        break;
      default:
        result = {
          ok: true,
          status: 'mock',
          providerResponse: {
            note: 'WHATSAPP_PROVIDER=mock — mensagem não enviada de verdade',
            to: toPhone,
            message: params.message,
          },
        };
        console.log('[whatsapp:mock]', toPhone, params.message.slice(0, 120));
    }
  }

  // Auditoria
  try {
    const sb = getSupabaseAdmin();
    await sb.from('alert_logs').insert({
      task_instance_id: params.taskInstanceId ?? null,
      unit_id: params.unitId ?? null,
      recipient_phone: toPhone,
      recipient_profile_id: params.recipientProfileId ?? null,
      channel: 'whatsapp',
      message: params.message,
      status: result.status,
      provider_response: result.providerResponse ?? (result.error ? { error: result.error } : null),
    });
  } catch (err) {
    console.warn('[whatsapp] falha ao gravar alert_log (Supabase pode não estar configurado)', err);
  }

  return result;
}

async function sendViaMeta(
  toPhone: string,
  message: string,
  token: string,
  apiUrl: string,
  phoneNumberId: string
): Promise<WhatsAppSendResult> {
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      status: 'failed',
      error: 'Preencha o token e o Phone Number ID do Meta no painel config',
    };
  }

  const url = `${apiUrl}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone.replace(/\D/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, status: 'failed', providerResponse: body, error: 'Meta API error' };
    }
    return { ok: true, status: 'sent', providerResponse: body };
  } catch (err) {
    return { ok: false, status: 'failed', error: String(err) };
  }
}

async function sendViaEvolution(
  toPhone: string,
  message: string,
  apiUrl: string,
  token: string,
  instance: string
): Promise<WhatsAppSendResult> {
  // Evolution API v2: POST {API_URL}/message/sendText/{instance}
  if (!apiUrl || !token || !instance) {
    return {
      ok: false,
      status: 'failed',
      error: 'Preencha API URL, Token (apikey) e Instância no painel config',
    };
  }
  const base = apiUrl.replace(/\/+$/, '');
  const instanceEnc = encodeURIComponent(instance);
  const url = `${base}/message/sendText/${instanceEnc}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: toPhone.replace(/\D/g, ''),
        text: message,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || res.status >= 400) {
      return { ok: false, status: 'failed', providerResponse: body, error: `Evolution API error ${res.status}` };
    }
    return {
      ok: true,
      status: 'sent',
      providerResponse: body,
    };
  } catch (err) {
    return { ok: false, status: 'failed', error: String(err) };
  }
}

async function sendViaTwilio(
  toPhone: string,
  message: string,
  token: string,
  phoneNumberId: string
): Promise<WhatsAppSendResult> {
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      status: 'failed',
      error: 'Twilio: preencha o Token (AccountSid:AuthToken) e o From (whatsapp:+...) no painel config',
    };
  }
  const [sid, auth] = token.split(':');
  if (!sid || !auth) {
    return { ok: false, status: 'failed', error: 'Token Twilio deve ser AccountSid:AuthToken' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    From: phoneNumberId,
    To: `whatsapp:${toPhone.startsWith('+') ? toPhone : `+${toPhone}`}`,
    Body: message,
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json();
    return {
      ok: res.ok,
      status: res.ok ? 'sent' : 'failed',
      providerResponse: data,
    };
  } catch (err) {
    return { ok: false, status: 'failed', error: String(err) };
  }
}

/** Mensagem padrão de tarefa crítica vencida */
export function buildCriticalAlertMessage(params: {
  unitName: string;
  taskTitle: string;
  dueAt: string;
  isCritical: boolean;
}): string {
  const flag = params.isCritical ? '🚨 CRÍTICA' : '⚠️';
  return (
    `${flag} ConcluíAI\n` +
    `Unidade: ${params.unitName}\n` +
    `Tarefa: ${params.taskTitle}\n` +
    `Prazo: ${params.dueAt}\n` +
    `Status: não executada no prazo.\n` +
    `Acesse o painel para acompanhar.`
  );
}
