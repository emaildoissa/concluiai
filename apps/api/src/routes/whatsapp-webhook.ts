import { Router } from 'express';
import { config } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { normalizePhoneBR } from '../services/whatsapp.js';
import { getBase64FromMediaMessage } from '../services/evolution.js';
import { handleConversation } from '../services/whatsapp-bot.js';

export const whatsappWebhookRouter = Router();

const BOT_PREFIXES = ['✅', '📦', '❓', '🤖', 'Ação confirmada', 'Confirma', 'Não entendi'];

/**
 * GET /webhooks/whatsapp — verificação do Meta WhatsApp Cloud API (hub.challenge).
 */
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * POST /webhooks/whatsapp — mensagens de entrada.
 * Suporta 2 formatos:
 *  - Evolution API: { instance, instanceName, data: { key: { remoteJid }, pushName, message: { ... } } }
 *  - Meta Cloud API: { entry: [...] } (verificação futura)
 */
whatsappWebhookRouter.post('/', async (req, res) => {
  const body = req.body || {};

  // ── Meta Cloud API ──────────────────────────────────────────────────────────
  if (body.entry) {
    console.log('[whatsapp webhook][meta] recebido (processamento em breve)');
    return res.sendStatus(200);
  }

  // ── Evolution API ───────────────────────────────────────────────────────────
  // Responde 200 imediatamente (ack) e processa em background para não
  // segurar a conexão e evitar retries da Evolution durante o processamento.
  void handleEvolutionPayload(body).catch((e) => {
    console.error('[whatsapp webhook] erro ao processar payload', e);
  });
  return res.sendStatus(200);
});

interface EvolutionMessage {
  key?: { remoteJid?: string };
  remoteJid?: string;
  pushName?: string;
  message?: Record<string, any>;
  messageType?: string;
  body?: string;
  base64?: string;
}

async function handleEvolutionPayload(data: any) {
  const msgData: EvolutionMessage = data?.data || data;
  const remoteJid = msgData?.key?.remoteJid || msgData?.remoteJid || '';
  const userPhoneRaw = (remoteJid.split('@')[0] || '').replace(/\D/g, '');
  const instanceName = data?.instance || data?.instanceName || '';

  if (!userPhoneRaw) {
    console.log('[whatsapp-evolution] sem remoteJid, ignorado');
    return;
  }

  const sb = getSupabaseAdmin();

  // Resolve a instância → empresa
  const { data: instance } = await sb
    .from('whatsapp_instances')
    .select('id, company_id')
    .eq('instance_name', instanceName)
    .eq('is_active', true)
    .maybeSingle();

  if (!instance) {
    console.warn(`[whatsapp-evolution] instância "${instanceName}" não cadastrada`);
    return;
  }

  const normalized = normalizePhoneBR(userPhoneRaw);
  const userNumber = normalized.valid ? normalized.number : userPhoneRaw;

  // ── Botões (respostas a confirmação) ───────────────────────────────────────
  const buttonId = extractButtonId(msgData.message || {});
  if (buttonId) {
    await handleConversation({
      instanceId: instance.id,
      companyId: instance.company_id,
      userPhone: userNumber,
      buttonId,
    });
    return;
  }

  // ── Extrai conteúdo da mensagem ─────────────────────────────────────────────
  const parsed = extractContent(msgData);

  // Anti-loop: ignora mensagens geradas pelo bot
  const textForLoop = parsed.text || '';
  if (textForLoop && BOT_PREFIXES.some((p) => textForLoop.startsWith(p))) {
    return;
  }

  // Mídia: se não veio base64, pede descriptografia à Evolution
  let audioBase64: string | undefined;
  let audioMimeType: string | undefined;
  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;

  if (parsed.audioUrl || parsed.imageUrl) {
    try {
      const b64 = msgData.base64 || (await getBase64FromMediaMessage(msgData));
      if (parsed.audioUrl) {
        audioBase64 = b64;
        audioMimeType = parsed.audioMimeType || 'audio/ogg';
      } else {
        imageBase64 = b64;
        imageMimeType = parsed.imageMimeType || 'image/jpeg';
      }
    } catch (e) {
      console.error('[whatsapp-evolution] falha ao descriptografar mídia', e);
    }
  }

  if (!parsed.text && !audioBase64 && !imageBase64) {
    console.log('[whatsapp-evolution] mensagem sem conteúdo útil, ignorada');
    return;
  }

  await handleConversation({
    instanceId: instance.id,
    companyId: instance.company_id,
    userPhone: userNumber,
    text: parsed.text,
    audioBase64,
    audioMimeType,
    imageBase64,
    imageMimeType,
  });
}

function extractContent(m: EvolutionMessage): {
  text?: string;
  audioUrl?: string;
  audioMimeType?: string;
  imageUrl?: string;
  imageMimeType?: string;
} {
  if (m.body) return { text: m.body };

  const message = m.message || {};
  const messageType = m.messageType || 'conversation';

  if (messageType === 'conversation' && message.conversation) {
    return { text: message.conversation };
  }
  if (messageType === 'extendedTextMessage' && message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text };
  }
  if ((messageType === 'audioMessage' || messageType === 'ptvMessage') &&
    (message.audioMessage?.url || message.ptvMessage?.url)) {
    const media = message.audioMessage || message.ptvMessage;
    return {
      audioUrl: media.url,
      audioMimeType: media.mimetype || 'audio/ogg',
    };
  }
  if (messageType === 'imageMessage' && message.imageMessage?.url) {
    return {
      text: message.imageMessage.caption || undefined,
      imageUrl: message.imageMessage.url,
      imageMimeType: message.imageMessage.mimetype || 'image/jpeg',
    };
  }

  // formato "simplificado" (message.conversation direto)
  if (message.conversation) return { text: message.conversation };
  return {};
}

function extractButtonId(message: Record<string, any>): string | undefined {
  if (message?.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId;
  }
  if (message?.templateButtonReplyMessage?.selectedId) {
    return message.templateButtonReplyMessage.selectedId;
  }
  if (message?.interactiveResponseMessage?.nativeFlowResponseMessage?.id) {
    const id = message.interactiveResponseMessage.nativeFlowResponseMessage.id;
    try {
      const parsed = JSON.parse(id as string);
      if (parsed.id) return parsed.id;
    } catch {
      /* retorna id literal */
    }
    return id;
  }
  if (message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }
  return undefined;
}