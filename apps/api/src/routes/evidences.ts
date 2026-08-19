import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSignedEvidenceUrl, STORAGE_BUCKET } from '../services/evidences.js';

export const evidencesRouter = Router();

function startOfTodaySaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  sp.setHours(0, 0, 0, 0);
  return sp.toISOString();
}

/**
 * GET /api/evidences
 *
 * Lista as 30 evidências mais recentes, remove duplicidades mantendo
 * apenas a mais recente por tarefa e devolve URL assinada para exibição.
 */
evidencesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('evidences')
      .select(
        `
          *,
          task_instance:task_instances (
            id,
            scheduled_date,
            due_at,
            status,
            score_p,
            score_e,
            score_q,
            unit:units (
              name
            ),
            checklist_item:checklist_items (
              title,
              is_critical
            )
          )
        `,
      )
      .order('captured_at', { ascending: false })
      .gte('captured_at', startOfTodaySaoPaulo())
      .limit(30);

    if (error) {
      throw error;
    }

    const seenTaskIds = new Set<string>();

    const latestEvidences = (data || []).filter((evidence) => {
      if (!evidence.task_instance_id) {
        return true;
      }

      if (seenTaskIds.has(evidence.task_instance_id)) {
        return false;
      }

      seenTaskIds.add(evidence.task_instance_id);
      return true;
    });

    // Assina a URL de cada foto (photo_url é o path no Storage)
    const withSignedUrls = await Promise.all(
      latestEvidences.map(async (evidence) => {
        const path = evidence.photo_url;
        if (!path) return { ...evidence, photo_url: null };
        const signed = await getSignedEvidenceUrl(sb, path, { thumb: true });
        return { ...evidence, photo_url: signed };
      }),
    );

    return res.json({ evidences: withSignedUrls });
  } catch (error) {
    console.error('[evidences list]', error);

    return res.status(500).json({
      error: 'Falha ao buscar feed de evidências.',
    });
  }
});

/**
 * GET /api/evidences/view/:id
 * Endpoint de proxy/stream da imagem direto do Supabase Storage
 */
evidencesRouter.get('/view/:id', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;

    const { data: evidence, error } = await sb
      .from('evidences')
      .select('id, photo_url')
      .eq('id', id)
      .maybeSingle();

    if (error || !evidence?.photo_url) {
      return res.status(404).send('Evidência não encontrada.');
    }

    const path = evidence.photo_url.trim();
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return res.redirect(path);
    }

    const { data: fileData, error: downloadError } = await sb.storage
      .from(STORAGE_BUCKET)
      .download(path);

    if (downloadError || !fileData) {
      // Fallback: redireciona para url assinada
      const signed = await getSignedEvidenceUrl(sb, path);
      if (signed && (signed.startsWith('http://') || signed.startsWith('https://'))) {
        return res.redirect(signed);
      }
      return res.status(404).send('Arquivo de foto não encontrado no Storage.');
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    res.setHeader('Content-Type', fileData.type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('[evidence view proxy]', err);
    return res.status(500).send('Erro ao buscar foto.');
  }
});

/**
 * POST /api/evidences/:id/request-adjustment
 *
 * Admin reabre a tarefa para nova execução quando a evidência não passou
 * na auditoria. Reseta status/scores da task e notifica o operador
 * responsável via WhatsApp.
 */
evidencesRouter.post(
  '/:id/request-adjustment',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const sb = getSupabaseAdmin();
      const { id } = req.params;

      const { data: evidence, error: evErr } = await sb
        .from('evidences')
        .select(
          `
          id, task_instance_id, operator_id, review_status,
          task_instance:task_instances (
            id, unit_id, assigned_to,
            checklist_item:checklist_items ( title )
          )
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (evErr) throw evErr;
      if (!evidence) {
        return res.status(404).json({ error: 'Evidência não encontrada' });
      }
      if (!evidence.task_instance_id) {
        return res.status(400).json({ error: 'Evidência sem tarefa vinculada' });
      }

      const task = Array.isArray(evidence.task_instance)
        ? evidence.task_instance[0]
        : evidence.task_instance;
      const item = Array.isArray(task?.checklist_item)
        ? task.checklist_item[0]
        : task?.checklist_item;
      const taskTitle = item?.title || 'tarefa';

      // Reabre a task para pending e zera pontuações de conclusão
      await sb
        .from('task_instances')
        .update({
          status: 'pending',
          completed_at: null,
          score_p: null,
          score_e: null,
          score_q: null,
        })
        .eq('id', evidence.task_instance_id);

      // Marca a evidência reprovada (se ainda pendente)
      if (evidence.review_status === 'pending') {
        await sb
          .from('evidences')
          .update({ review_status: 'rejected' })
          .eq('id', id);
      }

      // Notifica o operador responsável
      let notified: string | null = null;
      const recipientId = task?.assigned_to || evidence.operator_id;
      if (recipientId) {
        const { data: op } = await sb
          .from('profiles')
          .select('id, full_name, phone, unit_id')
          .eq('id', recipientId)
          .maybeSingle();
        if (op) {
          const message =
            `⚠️ ConcluíAI — Ajuste solicitado\n` +
            `Tarefa: ${taskTitle}\n` +
            `A evidência enviada não foi aprovada e a tarefa foi reaberta.\n` +
            `Por favor, refaça a execução e envie uma nova foto.`;

          if (op.phone) {
            const result = await sendWhatsAppMessage({
              toPhone: op.phone,
              message,
              taskInstanceId: evidence.task_instance_id,
              unitId: task?.unit_id || null,
              recipientProfileId: op.id,
            });
            notified = result.status;
          } else {
            console.warn(`[request-adjustment] operador ${op.full_name} sem telefone`);
          }
        }
      }

      return res.json({
        ok: true,
        task_instance_id: evidence.task_instance_id,
        status: 'pending',
        notified,
      });
    } catch (error) {
      console.error('[request-adjustment]', error);
      return res.status(500).json({
        error: 'Falha ao solicitar ajuste da evidência.',
      });
    }
  }
);
