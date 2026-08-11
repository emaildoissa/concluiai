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

async function resolveEvolutionConfig(): Promise<EvolutionConfig> {
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

/** Envia mensagem de texto (Evolution API v2) */
export async function sendText(number: string, text: string): Promise<void> {
  const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Evolution não configurada (API URL, apikey e instância obrigatórias)');
  }
  const res = await fetch(`${apiUrl}/message/sendText/${instanceOf(instance)}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      number: number.replace(/\D/g, ''),
      text,
      delay: 700,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[evolution sendText] ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Evolution sendText error: ${res.status}`);
  }
}

/** Envia mensagem com botões (confirmação Sim/Não) */
export async function sendButtons(number: string, text: string, buttons: EvolutionButton[]): Promise<void> {
  const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
  if (!apiUrl || !apiKey || !instance) {
    throw new Error('Evolution não configurada (API URL, apikey e instância obrigatórias)');
  }
  const res = await fetch(`${apiUrl}/message/sendButtons/${instanceOf(instance)}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      number: number.replace(/\D/g, ''),
      title: 'ConcluíAI 🤖',
      description: text,
      text,
      footer: 'Confirmação ConcluíAI',
      buttons: buttons.map((b) => ({ type: 'reply', displayText: b.text, id: b.id })),
      delay: 700,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[evolution sendButtons] ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Evolution sendButtons error: ${res.status}`);
  }
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