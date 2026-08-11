import { colors } from './theme';

export const SHIFT_LABEL: Record<string, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  night: 'Noite',
  all_day: 'Dia inteiro',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Finalizada',
  late: 'Atrasada',
  rejected: 'Recusada pela IA',
  skipped: 'Pulada',
};

export function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'late':
    case 'rejected':
      return colors.danger;
    case 'pending':
      return colors.warning;
    default:
      return colors.info;
  }
}
