import { hasSupabaseConfig } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { buildCriticalAlertMessage, sendWhatsAppMessage } from '../services/whatsapp.js';

/**
 * Monitora tarefas críticas vencidas e dispara WhatsApp para gerentes.
 */
export async function checkCriticalOverdueTasks(): Promise<{ alerted: number }> {
  if (!hasSupabaseConfig()) {
    return { alerted: 0 };
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
    return { alerted: 0 };
  }

  let alerted = 0;

  for (const task of tasks || []) {
    const item = Array.isArray(task.checklist_item)
      ? task.checklist_item[0]
      : task.checklist_item;
    const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;

    if (!item?.is_critical) {
      // Marca late mesmo se não crítica
      if (task.status !== 'late') {
        await sb.from('task_instances').update({ status: 'late' }).eq('id', task.id);
      }
      continue;
    }

    if (task.status !== 'late') {
      await sb.from('task_instances').update({ status: 'late' }).eq('id', task.id);
    }

    // Evita spam: se já alertou nas últimas 2h, pula
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await sb
      .from('alert_logs')
      .select('id')
      .eq('task_instance_id', task.id)
      .gte('created_at', twoHoursAgo)
      .limit(1);

    if (recent && recent.length > 0) continue;

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

    for (const mgr of managers || []) {
      if (!mgr.phone) {
        console.warn(`[alerts] gerente ${mgr.full_name} sem telefone`);
        continue;
      }
      await sendWhatsAppMessage({
        toPhone: mgr.phone,
        message,
        taskInstanceId: task.id,
        unitId: task.unit_id,
        recipientProfileId: mgr.id,
      });
      alerted += 1;
    }
  }

  return { alerted };
}
