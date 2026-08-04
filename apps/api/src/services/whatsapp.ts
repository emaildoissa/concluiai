import { config } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export interface WhatsAppSendResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'mock';
  providerResponse?: unknown;
  error?: string;
}

/**
 * Envia alerta via WhatsApp.
 * Configure WHATSAPP_PROVIDER e credenciais no .env (veja .env.example).
 */
export async function sendWhatsAppMessage(params: {
  toPhone: string;
  message: string;
  taskInstanceId?: string;
  unitId?: string;
  recipientProfileId?: string;
}): Promise<WhatsAppSendResult> {
  const { provider } = config.whatsapp;
  let result: WhatsAppSendResult;

  switch (provider) {
    case 'meta':
      result = await sendViaMeta(params.toPhone, params.message);
      break;
    case 'evolution':
      result = await sendViaEvolution(params.toPhone, params.message);
      break;
    case 'twilio':
      result = await sendViaTwilio(params.toPhone, params.message);
      break;
    default:
      result = {
        ok: true,
        status: 'mock',
        providerResponse: {
          note: 'WHATSAPP_PROVIDER=mock — mensagem não enviada de verdade',
          to: params.toPhone,
          message: params.message,
        },
      };
      console.log('[whatsapp:mock]', params.toPhone, params.message.slice(0, 120));
  }

  // Auditoria
  try {
    const sb = getSupabaseAdmin();
    await sb.from('alert_logs').insert({
      task_instance_id: params.taskInstanceId ?? null,
      unit_id: params.unitId ?? null,
      recipient_phone: params.toPhone,
      recipient_profile_id: params.recipientProfileId ?? null,
      channel: 'whatsapp',
      message: params.message,
      status: result.status,
      provider_response: result.providerResponse ?? null,
    });
  } catch (err) {
    console.warn('[whatsapp] falha ao gravar alert_log (Supabase pode não estar configurado)', err);
  }

  return result;
}

async function sendViaMeta(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    return {
      ok: false,
      status: 'failed',
      error: 'Preencha WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env',
    };
  }

  const url = `${config.whatsapp.apiUrl}/${config.whatsapp.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
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

async function sendViaEvolution(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  // Evolution API v2: POST {API_URL}/message/sendText/{instance}
  // Preencha WHATSAPP_API_URL (base), WHATSAPP_TOKEN (apikey) e WHATSAPP_INSTANCE (nome da instância).
  if (!config.whatsapp.apiUrl || !config.whatsapp.token || !config.whatsapp.instance) {
    return {
      ok: false,
      status: 'failed',
      error:
        'Preencha WHATSAPP_API_URL, WHATSAPP_TOKEN (apikey) e WHATSAPP_INSTANCE para Evolution API',
    };
  }
  const base = config.whatsapp.apiUrl.replace(/\/+$/, '');
  const instance = encodeURIComponent(config.whatsapp.instance);
  const url = `${base}/message/sendText/${instance}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.whatsapp.token,
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

async function sendViaTwilio(toPhone: string, message: string): Promise<WhatsAppSendResult> {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    return {
      ok: false,
      status: 'failed',
      error:
        'Twilio: preencha WHATSAPP_TOKEN (AccountSid:AuthToken) e WHATSAPP_PHONE_NUMBER_ID (from whatsapp:+...)',
    };
  }
  const [sid, auth] = config.whatsapp.token.split(':');
  if (!sid || !auth) {
    return { ok: false, status: 'failed', error: 'WHATSAPP_TOKEN deve ser AccountSid:AuthToken' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    From: config.whatsapp.phoneNumberId,
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
