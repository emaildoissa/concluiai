import { Router } from 'express';
import { config } from '../config.js';

export const whatsappWebhookRouter = Router();

/**
 * Webhook Meta WhatsApp Cloud API
 * GET — verificação (hub.challenge)
 * POST — eventos de mensagem (futuro: comandos do gestor)
 *
 * Preencha WHATSAPP_WEBHOOK_VERIFY_TOKEN no .env
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

whatsappWebhookRouter.post('/', (req, res) => {
  // Acknowledge imediato — processe assíncrono se necessário
  console.log('[whatsapp webhook]', JSON.stringify(req.body)?.slice(0, 500));
  res.sendStatus(200);
});
