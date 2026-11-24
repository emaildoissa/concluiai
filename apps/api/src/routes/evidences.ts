import { Router } from 'express';
import { getTodayBR, getDaysAgoBR } from '@concluiai/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSignedEvidenceUrl, STORAGE_BUCKET } from '../services/evidences.js';

export const evidencesRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfBrazilDayIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

function endOfBrazilDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999-03:00`).toISOString();
}

/**
 * GET /api/evidences?days=&from=&to=&unitId=&limit=
 *
 * Lista evidências recentes (padrão: hoje em America/Sao_Paulo),
 * remove duplicidades mantendo apenas a mais recente por tarefa
 * e devolve URL assinada para exibição.
 */
evidencesRouter.get('/', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { days, from, to, unitId, limit } = req.query as {
      days?: string;
      from?: string;
      to?: string;
      unitId?: string;
      limit?: string;
    };

    const parsedLimit = Math.min(100, Math.max(1, parseInt(String(limit || '30'), 10) || 30));

    let fromDate = getTodayBR();
    if (from && DATE_RE.test(from)) {
      fromDate = from;
    } else if (days) {
      const n = Math.min(90, Math.max(1, parseInt(String(days), 10) || 1));
      fromDate = n <= 1 ? getTodayBR() : getDaysAgoBR(n - 1);
    }

    const fromIso = startOfBrazilDayIso(fromDate);
    const toIso = to && DATE_RE.test(to) ? endOfBrazilDayIso(to) : null;

    let query = sb
      .from('evidences')
      .select(
        `
          *,
          task_instance:task_instances (
            id,
            unit_id,
            scheduled_date,
            due_at,
            status,
            score_p,
            score_e,
            score_q,
            unit:units (
              id,
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
      .gte('captured_at', fromIso);

    if (toIso) {
      query = query.lte('captured_at', toIso);
    }

    // Se filtrar por unidade, busca mais registros antes de filtrar pelo join
    const fetchLimit = unitId ? Math.min(300, parsedLimit * 4) : parsedLimit;
    const { data, error } = await query.limit(fetchLimit);

    if (error) {
      throw error;
    }

    const seenTaskIds = new Set<string>();

    const latestEvidences = (data || [])
      .filter((evidence) => {
        if (unitId) {
          const ti = Array.isArray(evidence.task_instance)
            ? evidence.task_instance[0]
            : evidence.task_instance;
          if (ti?.unit_id !== unitId) return false;
        }
        if (!evidence.task_instance_id) {
          return true;
        }
        if (seenTaskIds.has(evidence.task_instance_id)) {
          return false;
        }
        seenTaskIds.add(evidence.task_instance_id);
        return true;
      })
      .slice(0, parsedLimit);

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

      // Reabre a task para pending, limpa executor para o pool do setor e zera pontuações
      await sb
        .from('task_instances')
        .update({
          status: 'pending',
          assigned_to: null,
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

      // Notifica quem enviou a foto reprovada (fallback para assigned_to se legado)
      let notified: string | null = null;
      const recipientId = evidence.operator_id || task?.assigned_to;
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
