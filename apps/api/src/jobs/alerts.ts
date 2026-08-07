import { hasSupabaseConfig } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { buildCriticalAlertMessage, normalizePhoneBR, sendWhatsAppMessage } from '../services/whatsapp.js';

export interface AlertRunResult {
  alerted: number;
  skipped: number;
  invalid: number;
}

/**
 * Monitora tarefas críticas vencidas e dispara WhatsApp para gerentes.
 */
export async function checkCriticalOverdueTasks(): Promise<AlertRunResult> {
  if (!hasSupabaseConfig()) {
    return { alerted: 0, skipped: 0, invalid: 0 };
  }

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Tarefas vencidas ainda pendentes/late, com item crítico
  const { data: tasks, error } = await sb
    .from('task_instances')
    .select(
      `
      id, due_at, status, unit_id,
      unit:units ( id, name ),
      checklist_item:checklist_items ( id, title, is_critical )
    `
    )
    .in('status', ['pending', 'in_progress', 'late'])
    .lt('due_at', now)
    .limit(50);

  if (error) {
    console.error('[alerts] query error', error);
    return { alerted: 0, skipped: 0, invalid: 0 };
  }

  let alerted = 0;
  let skipped = 0;
  let invalid = 0;

  for (const task of tasks || []) {
    const item = Array.isArray(task.checklist_item)
      ? task.checklist_item[0]
      : task.checklist_item;
    const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;

    // Marca late mesmo se não crítica
    if (task.status !== 'late') {
      await sb.from('task_instances').update({ status: 'late' }).eq('id', task.id);
    }

    if (!item?.is_critical) continue;

    // Evita spam: se já alertou nas últimas 2h, pula
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await sb
      .from('alert_logs')
      .select('id')
      .eq('task_instance_id', task.id)
      .gte('created_at', twoHoursAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      skipped += 1;
      continue;
    }

    // Gerentes da unidade + admins da company
    const { data: managers } = await sb
      .from('profiles')
      .select('id, phone, full_name, role')
      .eq('unit_id', task.unit_id)
      .in('role', ['manager', 'admin'])
      .eq('is_active', true);

    const message = buildCriticalAlertMessage({
      unitName: unit?.name || 'Unidade',
      taskTitle: item.title,
      dueAt: new Date(task.due_at).toLocaleString('pt-BR'),
      isCritical: true,
    });

    let taskSent = 0;
    for (const mgr of managers || []) {
      if (!mgr.phone) {
        console.warn(`[alerts] gerente ${mgr.full_name} sem telefone`);
        continue;
      }
      const { valid } = normalizePhoneBR(mgr.phone);
      if (!valid) {
        console.warn(`[alerts] gerente ${mgr.full_name} com telefone inválido para WhatsApp: ${mgr.phone}`);
        invalid += 1;
        continue;
      }
      const result = await sendWhatsAppMessage({
        toPhone: mgr.phone,
        message,
        taskInstanceId: task.id,
        unitId: task.unit_id,
        recipientProfileId: mgr.id,
      });
      if (result.status === 'sent' || result.status === 'mock') {
        taskSent += 1;
      } else if (result.status === 'blocked') {
        invalid += 1;
      }
    }
    if (taskSent > 0) alerted += 1;
  }

  return { alerted, skipped, invalid };
}