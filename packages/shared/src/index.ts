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

export interface Checklist {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  sector_id?: string | null;
  shift: Shift;
  recurrence: 'daily' | 'weekly' | 'once';
  is_active: boolean;
  created_at: string;
  // joins
  items?: ChecklistItem[];
  unit_ids?: string[];
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description?: string | null;
  is_critical: boolean;
  requires_photo: boolean;
  requires_gps: boolean;
  due_time?: string | null; // HH:MM
  sort_order: number;
  weight: number;
}

export interface TaskInstance {
  id: string;
  checklist_item_id: string;
  unit_id: string;
  assigned_to?: string | null;
  scheduled_date: string;
  due_at: string;
  status: TaskStatus;
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
