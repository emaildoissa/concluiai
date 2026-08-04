import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';
import { analyzeEvidenceImage } from '../lib/gemini.js';
import { scoreTaskOnComplete } from '../services/score.js';

export const evidenceRouter = Router();

async function authenticate(req: Request, res: Response, next: () => void) {
  // Fallback de desenvolvimento/scripts: X-Api-Key compartilhada.
  if (config.apiKey && req.header('x-api-key') === config.apiKey) {
    next();
    return;
  }

  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

evidenceRouter.use(authenticate);

evidenceRouter.post('/:id/analyze', async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: evidence, error: evidenceError } = await supabase
    .from('evidences')
    .select('id, photo_url, task_instance_id, review_status')
    .eq('id', id)
    .single();

  if (evidenceError || !evidence) {
    res.status(404).json({ error: 'Evidência não encontrada.' });
    return;
  }

  const { data: task, error: taskError } = await supabase
    .from('task_instances')
    .select('id, checklist_item_id, status, due_at, completed_at')
    .eq('id', evidence.task_instance_id)
    .single();

  if (taskError || !task) {
    res.status(404).json({ error: 'Tarefa vinculada não encontrada.' });
    return;
  }

  const { data: item, error: itemError } = await supabase
    .from('checklist_items')
    .select('title, description, is_critical, requires_photo, weight')
    .eq('id', task.checklist_item_id)
    .single();

  if (itemError || !item) {
    res.status(404).json({ error: 'Item do checklist não encontrado.' });
    return;
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from(config.evidenceBucket)
    .createSignedUrl(evidence.photo_url, 120);

  if (urlError || !urlData?.signedUrl) {
    res.status(500).json({ error: `Falha ao gerar URL assinada: ${urlError?.message}` });
    return;
  }

  const imageResponse = await fetch(urlData.signedUrl);
  if (!imageResponse.ok) {
    res.status(502).json({ error: `Falha ao baixar a imagem do Storage (${imageResponse.status}).` });
    return;
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  if (imageBuffer.byteLength > 10 * 1024 * 1024) {
    res.status(413).json({ error: 'Imagem excede o limite de 10 MB.' });
    return;
  }

  const mimeType = imageResponse.headers.get('content-type') ?? 'image/jpeg';

  const verdict = await analyzeEvidenceImage({
    imageBase64: imageBuffer.toString('base64'),
    mimeType,
    taskTitle: item.title,
    taskDescription: item.description,
  });

  await supabase
    .from('evidences')
    .update({
      review_status: verdict.approved ? 'approved' : 'rejected',
      ai_reason: verdict.reason,
      ai_confidence: verdict.confidence,
    })
    .eq('id', id);

  if (!verdict.approved) {
    await supabase
      .from('task_instances')
      .update({ status: 'rejected' })
      .eq('id', task.id);
  }

  // Grava o score P/E/Q da tarefa para alimentar o dashboard
  const completedAt = task.completed_at || new Date().toISOString();
  const scores = scoreTaskOnComplete({
    dueAt: task.due_at || '',
    completedAt,
    aiApproved: verdict.approved,
    aiConfidence: verdict.confidence,
    isCritical: item.is_critical,
    requiresPhoto: item.requires_photo,
    weight: item.weight,
  });

  await supabase
    .from('task_instances')
    .update({
      score_p: scores.score_p,
      score_e: scores.score_e,
      score_q: scores.score_q,
    })
    .eq('id', task.id);

  res.json({
    evidence_id: id,
    approved: verdict.approved,
    reason: verdict.reason,
    confidence: verdict.confidence,
  });
});
