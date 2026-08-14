import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getWhatsAppSettings, saveWhatsAppSettings, type WhatsAppProvider } from '../services/settings.js';
import { normalizePhoneBR, sendWhatsAppMessage } from '../services/whatsapp.js';
import { resolveEvolutionConfig } from '../services/evolution.js';

export const settingsRouter = Router();

/** GET /api/settings/whatsapp — config atual (token mascarado) */
settingsRouter.get('/whatsapp', requireAuth, async (_req, res) => {
  try {
    const s = await getWhatsAppSettings();
    return res.json({
      provider: s.provider,
      apiUrl: s.apiUrl,
      instance: s.instance,
      instanceNumber: s.instanceNumber,
      phoneNumberId: s.phoneNumberId ?? '',
      hasToken: Boolean(s.token),
      tokenHint: s.token ? `••••${s.token.slice(-4)}` : '',
    });
  } catch (err) {
    console.error('[settings/whatsapp GET]', err);
    return res.status(500).json({ error: 'Falha ao carregar configuração do WhatsApp' });
  }
});

/** GET /api/settings/whatsapp/status — verifica status da conexão */
settingsRouter.get('/whatsapp/status', requireAuth, async (_req, res) => {
  try {
    const s = await getWhatsAppSettings();
    if (s.provider === 'mock') {
      return res.json({ provider: 'mock', state: 'mock', connected: true });
    }

    if (s.provider === 'evolution') {
      const { apiUrl, apiKey, instance } = await resolveEvolutionConfig();
      if (!apiUrl || !apiKey || !instance) {
        return res.json({ provider: 'evolution', state: 'unconfigured', connected: false });
      }

      const url = `${apiUrl}/instance/connectionState/${encodeURIComponent(instance)}`;
      const response = await fetch(url, { headers: { apikey: apiKey } });
      if (response.ok) {
        const body = (await response.json()) as any;
        const state = body?.instance?.state || 'unknown';
        return res.json({
          provider: 'evolution',
          state,
          connected: state === 'open',
          details: body,
        });
      }
      return res.json({
        provider: 'evolution',
        state: 'disconnected',
        connected: false,
        httpStatus: response.status,
      });
    }

    return res.json({ provider: s.provider, state: 'ready', connected: true });
  } catch (err) {
    console.error('[settings/whatsapp/status]', err);
    return res.json({ state: 'error', connected: false, error: String(err) });
  }
});

/** POST /api/settings/whatsapp/test — envia mensagem de teste */
settingsRouter.post('/whatsapp/test', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { toPhone } = (req.body ?? {}) as { toPhone?: string };
    if (!toPhone) {
      return res.status(400).json({ error: 'Informe o telefone de destino para o teste' });
    }

    const testMessage = `🤖 ConcluíAI — Teste de integração WhatsApp realizado com sucesso em ${new Date().toLocaleString('pt-BR')}!`;
    const result = await sendWhatsAppMessage({
      toPhone,
      message: testMessage,
    });

    if (!result.ok && (result.status === 'blocked' || result.status === 'failed')) {
      return res.status(400).json({
        ok: false,
        error: result.error || 'Falha ao enviar mensagem de teste',
        details: result.providerResponse,
      });
    }

    return res.json({
      ok: true,
      status: result.status,
      toPhone,
      details: result.providerResponse,
    });
  } catch (err) {
    console.error('[settings/whatsapp/test]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Falha ao testar envio' });
  }
});

/** PUT /api/settings/whatsapp — salva overrides (admin/manager) */
settingsRouter.put('/whatsapp', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      provider?: string;
      apiUrl?: string;
      instance?: string;
      instanceNumber?: string;
      token?: string;
      phoneNumberId?: string;
    };

    if (body.instanceNumber) {
      const { valid } = normalizePhoneBR(body.instanceNumber);
      if (!valid) {
        return res.status(400).json({ error: 'Número do robô inválido (use 55 + DDD + 9 + número)' });
      }
    }

    const s = await saveWhatsAppSettings({
      provider: body.provider as WhatsAppProvider | undefined,
      apiUrl: body.apiUrl,
      instance: body.instance,
      instanceNumber: body.instanceNumber,
      token: body.token,
      phoneNumberId: body.phoneNumberId,
    });
    return res.json({
      ok: true,
      provider: s.provider,
      apiUrl: s.apiUrl,
      instance: s.instance,
      instanceNumber: s.instanceNumber,
      phoneNumberId: s.phoneNumberId ?? '',
      hasToken: Boolean(s.token),
    });
  } catch (err) {
    console.error('[settings/whatsapp PUT]', err);
    return res.status(500).json({ error: 'Falha ao salvar configuração do WhatsApp' });
  }
});