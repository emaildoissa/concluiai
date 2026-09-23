import { hasSupabaseConfig } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { buildCriticalAlertMessage, normalizePhoneBR, sendWhatsAppMessage } from '../services/whatsapp.js';
import { getWhatsAppSettings } from '../services/settings.js';

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

  // 1. Atualiza status para 'late' para qualquer tarefa pendente que já venceu (independente de ser crítica)
  try {
    await sb
      .from('task_instances')
      .update({ status: 'late' })
      .in('status', ['pending', 'in_progress'])
      .lt('due_at', now);
  } catch (err) {
    console.error('[alerts] erro ao atualizar status late:', err);
  }

  // 2. Consulta configurações do WhatsApp (se alertas estão habilitados)
  const settings = await getWhatsAppSettings();
  if (settings.alertsEnabled === false) {
    // Alertas via WhatsApp desativados pelo usuário (modo somente painel)
    return { alerted: 0, skipped: 0, invalid: 0 };
  }

  // 3. Busca IDs das tarefas que já possuem alerta enviado/mockado (anti-spam no banco de dados)
  const { data: recentAlerts, error: alertLogsErr } = await sb
    .from('alert_logs')
    .select('task_instance_id')
    .in('status', ['sent', 'mock'])
    .not('task_instance_id', 'is', null);

  if (alertLogsErr) {
    console.error('[alerts] erro ao consultar alert_logs:', alertLogsErr);
  }

  const alertedTaskIds = Array.from(
    new Set((recentAlerts || []).map((a) => a.task_instance_id).filter((id): id is string => Boolean(id)))
  );

  // 4. Consulta tarefas vencidas que sejam CRÍTICAS e AINDA NÃO ALERTADAS
  let query = sb
    .from('task_instances')
    .select(
      `
      id, due_at, status, unit_id,
      unit:units ( id, name, company_id ),
      checklist_item:checklist_items!inner ( id, title, is_critical )
    `
    )
    .in('status', ['pending', 'in_progress', 'late'])
    .lt('due_at', now)
    .eq('checklist_item.is_critical', true)
    .order('due_at', { ascending: false })
    .limit(100);

  if (alertedTaskIds.length > 0) {
    query = query.not('id', 'in', `(${alertedTaskIds.join(',')})`);
  }

  const { data: tasks, error } = await query;

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

    if (!item?.is_critical) continue;

    // Gerentes da unidade + admins ativos da empresa (independente de unit_id)
    const companyId = (unit as { company_id?: string } | null)?.company_id;
    let recipientQuery = sb
      .from('profiles')
      .select('id, phone, full_name, role, unit_id')
      .eq('is_active', true)
      .in('role', ['manager', 'admin']);

    if (companyId) {
      recipientQuery = recipientQuery
        .eq('company_id', companyId)
        .or(`unit_id.eq.${task.unit_id},role.eq.admin`);
    } else {
      recipientQuery = recipientQuery.eq('unit_id', task.unit_id);
    }

    const { data: managers } = await recipientQuery;

    if (!managers || managers.length === 0) {
      console.warn(
        `[alerts] ⚠️ Nenhum gerente/admin encontrado para a unidade ${unit?.name || task.unit_id} (tarefa: '${item.title}')`
      );
      invalid += 1;
      continue;
    }

    const message = buildCriticalAlertMessage(
      {
        unitName: unit?.name || 'Unidade',
        taskTitle: item.title,
        dueAt: new Date(task.due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        isCritical: true,
      },
      settings.alertTemplate
    );

    let taskSent = 0;
    for (const mgr of managers || []) {
      if (!mgr.phone) {
        console.warn(`[alerts] gerente ${mgr.full_name} sem telefone`);
        continue;
      }
      const { valid } = normalizePhoneBR(mgr.phone);
      if (!valid) {
        console.warn(
          `[alerts] gerente ${mgr.full_name} com telefone inválido para WhatsApp: ${mgr.phone}`
        );
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

  if (alerted > 0 || invalid > 0) {
    console.log(
      `[alerts] Processadas ${tasks?.length || 0} tarefas pendentes de alerta: ${alerted} disparadas com sucesso, ${invalid} com falha/sem destinatário`
    );
  }

  return { alerted, skipped, invalid };
}