import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getWhatsAppSettings, saveWhatsAppSettings, type WhatsAppProvider } from '../services/settings.js';
import { normalizePhoneBR } from '../services/whatsapp.js';

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