import { getWhatsAppSettings } from './settings.js';
import { config } from '../config.js';

export interface EvolutionButton {
  id: string;
  text: string;
}

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

export async function resolveEvolutionConfig(): Promise<EvolutionConfig> {
  const s = await getWhatsAppSettings();
  return {
    apiUrl: (s.apiUrl || config.whatsapp.apiUrl).replace(/\/+$/, ''),
    apiKey: s.token || config.whatsapp.token,
    instance: s.instance || config.whatsapp.instance,
  };
}

function headers(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', apikey: apiKey };
}

function instanceOf(instance: string): string {
  return encodeURIComponent(instance);
}

// Cache de contatos da instância para resolução rápida de LID / JID
let contactsCache: {
  instance: string;
  contacts: Array<{ remoteJid?: string; id?: string; pushName?: string }>;
  expiresAt: number;
} | null = null;

/**
 * Resolve o destinatário para a Evolution API.
 * Prioriza LID se o contato já interagiu, evitando bugs de normalização de DDDs brasileiros.
 */
export async function resolveEvolutionRecipient(
  rawPhone: string,
  apiUrl: string,
  apiKey: string,
  instance: string
): Promise<string> {
  const clean = String(rawPhone || '').trim();
  if (clean.includes('@lid')) {
    return clean;
  }

  const digits = clean.replace(/\D/g, '');
  if (!digits) return clean;

  try {
    const now = Date.now();
    let contacts =
      contactsCache &&
      contactsCache.instance === instance &&
      contactsCache.expiresAt > now
        ? contactsCache.contacts
        : null;

    if (!contacts) {
      const url = `${apiUrl}/chat/findContacts/${instanceOf(instance)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: headers(apiKey),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        contacts = ((await res.json()) as any[]) || [];
        contactsCache = { instance, contacts, expiresAt: now + 5 * 60 * 1000 };
      }
    }

    if (contacts && contacts.length > 0) {
      const last8 = digits.slice(-8);
      // Busca contato que termine com os mesmos 8 dígitos (LID ou remoteJid)
      const matching = contacts.filter(
        (c) =>
          c.remoteJid &&
          (c.remoteJid.includes(last8) || (c.id && String(c.id).includes(last8)))
      );

      // Prioriza LID se disponível (garante entrega direta no aparelho sem reprocessamento de DDD)
      const lidContact = matching.find((c) => c.remoteJid?.endsWith('@lid'));
      if (lidContact?.remoteJid) {
        return lidContact.remoteJid;
      }

      const directContact = matching.find((c) => c.remoteJid?.endsWith('@s.whatsapp.net'));
      if (directContact?.remoteJid) {
        return directContact.remoteJid;
      }
    }
  } catch (err) {
    console.warn('[evolution resolveRecipient] falha ao consultar contatos', err);
  }

  return digits;
}

/** Envia mensagem de texto (Evolution API v2) */
export async function sendText(number: string, text: string): Promise<any> {
  const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Evolution não configurada (API URL, apikey e instância obrigatórias)');
  }

  const destination = await resolveEvolutionRecipient(number, apiUrl, apiKey, instance);

  const res = await fetch(`${apiUrl}/message/sendText/${instanceOf(instance)}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      number: destination,
      text,
      delay: 700,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errText = typeof body === 'object' ? JSON.stringify(body) : String(body);
    console.error(`[evolution sendText] ${res.status}: ${errText.slice(0, 300)}`);
    throw new Error(`Evolution sendText error: ${res.status} - ${errText.slice(0, 150)}`);
  }

  return body;
}

/** Envia mensagem com botões (confirmação Sim/Não) com fallback para texto */
export async function sendButtons(number: string, text: string, buttons: EvolutionButton[]): Promise<any> {
  const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Evolution não configurada (API URL, apikey e instância obrigatórias)');
  }

  const destination = await resolveEvolutionRecipient(number, apiUrl, apiKey, instance);

  try {
    const res = await fetch(`${apiUrl}/message/sendButtons/${instanceOf(instance)}`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        number: destination,
        title: 'ConcluíAI 🤖',
        description: text,
        text,
        footer: 'Confirmação ConcluíAI',
        buttons: buttons.map((b) => ({ type: 'reply', displayText: b.text, id: b.id })),
        delay: 700,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return body;
    }
    console.warn(`[evolution sendButtons] falhou com status ${res.status}, usando fallback texto...`);
  } catch (e) {
    console.warn('[evolution sendButtons] exceção ao enviar botões, usando fallback texto...', e);
  }

  // Fallback: mensagem de texto clara com opções Sim/Não
  const optionsText = buttons.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  const fallbackMsg = `${text}\n\n*Responda com:*\n${optionsText}\n_(ou digite "sim" / "não")_`;
  return sendText(destination, fallbackMsg);
}

/** Descriptografa mídia (áudio/foto) a partir da mensagem recebida no webhook */
export async function getBase64FromMediaMessage(message: any): Promise<string> {
  const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Evolution não configurada');
  }
  const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instanceOf(instance)}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[evolution getBase64] ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Evolution getBase64 error: ${res.status}`);
  }
  const data = await res.json();
  return data.base64 ?? '';
}

/** Baixa a mídia de uma URL fornecida pela Evolution */
export async function downloadMedia(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const { apiUrl, apiKey } = await resolveEvolutionConfig();
  const fullUrl = url.startsWith('http') ? url : `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  const res = await fetch(fullUrl, { headers: { apikey: apiKey } });
  if (!res.ok) throw new Error(`Media download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer, mimeType };
}