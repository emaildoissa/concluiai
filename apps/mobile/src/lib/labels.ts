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
      return '#16a34a';
    case 'late':
    case 'rejected':
      return '#dc2626';
    case 'pending':
      return '#d97706';
    default:
      return '#475569';
  }
}
