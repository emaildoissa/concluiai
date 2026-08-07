import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin, type SupabaseClient } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

export const evidencesRouter = Router();

const STORAGE_BUCKET = 'evidences';
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1h
const THUMB_WIDTH = 300;

// Cache de URLs assinadas (thread/task -> URLs) para não regenerar a cada refresh.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function startOfTodaySaoPaulo(): string {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  sp.setHours(0, 0, 0, 0);
  return sp.toISOString();
}

async function getSignedThumb(sb: SupabaseClient, path: string): Promise<string | null> {
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now) return cached.url;

  const { data: signed, error: signedError } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS, {
      transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: 'cover' },
    });

  if (signedError || !signed?.signedUrl) return null;
  signedUrlCache.set(path, {
    url: signed.signedUrl,
    expiresAt: now + SIGNED_URL_CACHE_TTL_MS,
  });
  return signed.signedUrl;
}

/**
 * GET /api/evidences
 *
 * Lista as 30 evidências mais recentes, remove duplicidades mantendo
 * apenas a mais recente por tarefa e devolve URL assinada para exibição.
 *
 * No fluxo mobile do ConcluíAI o photo_url é o path no Storage
 * (company_id/unit_id/task_id/ev-....jpg) — aqui geramos a URL assinada.
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

    const latestEvidences = (data || []).filter(
      (evidence) => {
        if (!evidence.task_instance_id) {
          return true;
        }

        if (
          seenTaskIds.has(evidence.task_instance_id)
        ) {
          return false;
        }

        seenTaskIds.add(evidence.task_instance_id);
        return true;
      },
    );

    // Assina a URL de cada foto (photo_url é o path no Storage) — thumbnail leve
    const withSignedUrls = await Promise.all(
      latestEvidences.map(async (evidence) => {
        const path = evidence.photo_url;
        if (!path) return { ...evidence, photo_url: null };
        return { ...evidence, photo_url: await getSignedThumb(sb, path) };
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
