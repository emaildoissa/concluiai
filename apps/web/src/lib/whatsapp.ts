/**
 * Utilitário para geração de links diretos do WhatsApp (wa.me)
 * Permite cobrança manual de operadores mesmo sem robô/Evolution conectado.
 */

export function normalizePhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppReminderMessage(params: {
  unitName?: string;
  taskTitle?: string;
  dueAt?: string;
  operatorName?: string;
}): string {
  const opGreeting = params.operatorName ? `Olá, ${params.operatorName}!\n\n` : '';
  const dueFormatted = params.dueAt
    ? new Date(params.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : 'no horário previsto';

  return (
    `${opGreeting}*ConcluíAI — Lembrete de Tarefa*\n\n` +
    `*Unidade:* ${params.unitName || 'Loja'}\n` +
    `*Tarefa:* ${params.taskTitle || 'Tarefa Operacional'}\n` +
    `*Horário Limite:* ${dueFormatted} (Em atraso)\n\n` +
    `*Por favor, realize a tarefa e envie a foto no app ConcluíAI assim que possível!*`
  );
}

export function getDirectWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = normalizePhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function openDirectWhatsApp(phone: string, message: string): boolean {
  if (!phone) return false;
  const url = getDirectWhatsAppUrl(phone, message);
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
