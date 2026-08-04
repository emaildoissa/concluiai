export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'late' | 'rejected' | 'skipped';

export type EvidenceReviewStatus = 'pending' | 'approved' | 'rejected';

export type TodayGroup = 'late' | 'pending' | 'completed';

export interface Profile {
  id: string;
  company_id: string;
  unit_id: string | null;
  full_name: string;
  email: string;
  role: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  is_critical: boolean;
  requires_photo: boolean;
  requires_gps: boolean;
  due_time: string | null;
}

export interface TaskInstanceRow {
  id: string;
  scheduled_date: string;
  due_at: string;
  status: TaskStatus;
  completed_at: string | null;
  checklist_items: TaskItem;
}

export interface TodayTask {
  instance_id: string;
  title: string;
  description: string | null;
  is_critical: boolean;
  due_at: string;
  status: TaskStatus;
  group: TodayGroup;
}

export interface AnalyzeResult {
  evidence_id: string;
  approved: boolean;
  reason: string;
  confidence: number;
}

export interface EvidenceRow {
  id: string;
  task_instance_id: string;
  photo_url: string;
  review_status: EvidenceReviewStatus;
  ai_reason: string | null;
  ai_confidence: number | null;
  captured_at: string;
}
