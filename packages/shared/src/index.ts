export type UserRole = 'admin' | 'manager' | 'operator';

export type EvidenceReviewStatus = 'pending' | 'approved' | 'rejected';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'late'
  | 'rejected'
  | 'skipped';

export type Shift = 'morning' | 'afternoon' | 'night' | 'all_day';

export interface EvidenceRow {
  id: string;
  task_instance_id: string;
  operator_id: string;
  photo_url: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  captured_at: string;
  review_status: EvidenceReviewStatus;
  ai_reason: string | null;
  ai_confidence: number | null;
}

export interface AnalyzeEvidenceResponse {
  evidence_id: string;
  approved: boolean;
  reason: string;
  confidence: number;
}

export interface AnalyzeEvidenceError {
  error: string;
}

export interface TaskInstanceRow {
  id: string;
  checklist_item_id: string;
  unit_id: string;
  assigned_to: string | null;
  scheduled_date: string;
  due_at: string;
  status: TaskStatus;
  completed_at: string | null;
  checklist_item: {
    title: string;
    description: string | null;
    is_critical: boolean;
    requires_photo: boolean;
    requires_gps: boolean;
    due_time: string | null;
  };
}

export type TodayGroup = 'late' | 'pending' | 'completed';

export interface TodayTask {
  instance_id: string;
  item_id: string;
  title: string;
  description: string | null;
  is_critical: boolean;
  due_at: string;
  status: TaskStatus;
  group: TodayGroup;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  created_at: string;
}

export interface Unit {
  id: string;
  company_id: string;
  name: string;
  address?: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
}

export interface Sector {
  id: string;
  unit_id: string;
  name: string;
  sort_order: number;
}

export interface Profile {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  unit_id?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  // joins
  sector_ids?: string[];
}

export type ChecklistRecurrence = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'once';

export interface Checklist {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  sector_id?: string | null;
  shift: Shift;
  recurrence: ChecklistRecurrence;
  recurrence_anchor_date?: string | null;
  is_active: boolean;
  created_at: string;
  // joins
  items?: ChecklistItem[];
  unit_ids?: string[];
}

export type ChecklistExecutionMode = 'photo' | 'check' | 'both' | 'numeric';
export type ChecklistItemType = 'boolean' | 'numeric' | 'options';

export interface ChecklistItem {
  id: string;
  checklist_id?: string;
  title: string;
  description?: string | null;
  is_critical: boolean;
  requires_photo: boolean;
  requires_gps: boolean;
  due_time?: string | null; // HH:MM
  sort_order: number;
  weight: number;
  execution_mode?: ChecklistExecutionMode;
  item_type?: ChecklistItemType;
  unit_of_measurement?: string | null; // ex: '°C', 'pH', '%', 'bar', 'kg'
  min_value?: number | null;
  max_value?: number | null;
  alert_on_non_compliant?: boolean;
}

export interface TaskInstance {
  id: string;
  checklist_item_id: string;
  unit_id: string;
  assigned_to?: string | null;
  scheduled_date: string;
  due_at: string;
  status: TaskStatus;
  checked?: boolean;
  notes?: string | null;
  recorded_value?: number | null;
  is_compliant?: boolean | null;
  non_compliance_action?: string | null;
  completed_at?: string | null;
  score_p?: number | null;
  score_e?: number | null;
  score_q?: number | null;
  created_at: string;
  // joins
  checklist_item?: ChecklistItem;
  unit?: Unit;
  assignee?: Profile;
}

export interface Evidence {
  id: string;
  task_instance_id: string;
  operator_id: string;
  photo_url: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  captured_at: string;
  review_status: EvidenceReviewStatus;
  ai_reason?: string | null;
  ai_confidence?: number | null;
  created_at: string;
}

export interface DailyScore {
  id: string;
  unit_id: string;
  user_id?: string | null;
  score_date: string;
  score_p: number;
  score_e: number;
  score_q: number;
  score_total: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_late: number;
  critical_missed: number;
}

export interface TrainingMaterial {
  id: string;
  company_id: string;
  title: string;
  description?: string | null;
  content_url?: string | null;
  content_type: 'guide' | 'video' | 'course';
  sector_id?: string | null;
  is_published: boolean;
  created_at: string;
}

export interface AiVisionResult {
  approved: boolean;
  reason: string;
  confidence: number;
  checks: {
    brightness_ok: boolean;
    blur_ok: boolean;
    subject_ok: boolean;
  };
}

export interface UnitDashboardRow {
  unit_id: string;
  unit_name: string;
  score_total: number;
  tasks_pending: number;
  tasks_late: number;
  tasks_completed: number;
  critical_open: number;
}

/** Fórmula score 0–100: S = 100 * (wP*P + wE*E + wQ*Q) com ajuste de críticos */
export const DEFAULT_SCORE_WEIGHTS = {
  p: 0.35,
  e: 0.3,
  q: 0.35,
  criticalMultiplier: 1.5,
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente de Unidade',
  operator: 'Operador',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Finalizado',
  late: 'Atrasado',
  rejected: 'Recusado',
  skipped: 'Ignorado',
};

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
  all_day: 'Dia inteiro',
};

export const RECURRENCE_LABELS: Record<ChecklistRecurrence, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal (15 dias)',
  monthly: 'Mensal',
  once: 'Única',
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmdUtc(ymd: string): { y: number; m: number; d: number; utcMs: number } | null {
  const match = YMD_RE.exec(String(ymd || '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const utcMs = Date.UTC(y, m - 1, d);
  return { y, m, d, utcMs };
}

function formatUtcYmd(utcMs: number): string {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Verifica se um checklist com determinada recorrência deve gerar tarefas na data informada (YYYY-MM-DD).
 * - daily: todos os dias (sujeito a operation_days da unidade)
 * - weekly: a cada 7 dias a partir da data âncora
 * - biweekly: a cada 15 dias a partir da data âncora
 * - monthly: todo mês no mesmo dia da data âncora (ajustado ao último dia do mês quando necessário, ex: 31 -> 28/02)
 * - once: apenas na data âncora
 */
export function shouldChecklistRunOnDate(params: {
  recurrence?: string | null;
  anchorDate?: string | null;
  targetDate: string;
}): boolean {
  const rec = (params.recurrence || 'daily') as ChecklistRecurrence;
  if (rec === 'daily') return true;

  const target = parseYmdUtc(params.targetDate);
  if (!target) return true;

  const anchor = parseYmdUtc(params.anchorDate || params.targetDate);
  if (!anchor) return true;

  const diffDays = Math.round((target.utcMs - anchor.utcMs) / 86_400_000);
  if (diffDays < 0) return false;

  if (rec === 'once') return diffDays === 0;
  if (rec === 'weekly') return diffDays % 7 === 0;
  if (rec === 'biweekly') return diffDays % 15 === 0;
  if (rec === 'monthly') {
    const lastDayOfTargetMonth = new Date(Date.UTC(target.y, target.m, 0)).getUTCDate();
    const expectedDay = Math.min(anchor.d, lastDayOfTargetMonth);
    return target.d === expectedDay;
  }

  return true;
}

/**
 * Calcula as próximas datas (YYYY-MM-DD) de execução de um checklist a partir da data âncora.
 */
export function getNextRecurrenceDates(
  recurrence: ChecklistRecurrence,
  anchorDate: string,
  count = 3
): string[] {
  if (recurrence === 'daily') return [];
  const anchor = parseYmdUtc(anchorDate);
  if (!anchor) return [];
  if (recurrence === 'once') return [anchorDate];

  const results: string[] = [];
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const step = recurrence === 'weekly' ? 7 : 15;
    for (let i = 0; i < count; i++) {
      results.push(formatUtcYmd(anchor.utcMs + i * step * 86_400_000));
    }
    return results;
  }

  if (recurrence === 'monthly') {
    for (let i = 0; i < count; i++) {
      const totalMonths = anchor.y * 12 + (anchor.m - 1) + i;
      const y = Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d = Math.min(anchor.d, lastDay);
      results.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return results;
  }

  return results;
}

/**
 * Retorna a data atual no fuso horário do Brasil (America/Sao_Paulo) no formato YYYY-MM-DD.
 * Evita o bug de fuso horário UTC em que a partir das 21:00 BRT (00:00 UTC) a data vira o dia seguinte.
 */
export function getTodayBR(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Retorna a data de N dias atrás no fuso horário do Brasil (America/Sao_Paulo) no formato YYYY-MM-DD.
 */
export function getDaysAgoBR(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getTodayBR(d);
}
