/**
 * Regras de dias de operação por unidade.
 * operation_days: INT[] em que 0=domingo ... 6=sábado.
 * NULL ou vazio => opera todos os dias.
 */
export function isOperationDay(date: string, operationDays: number[] | null | undefined): boolean {
  if (!operationDays || operationDays.length === 0) return true;
  // 2026-08-07 (YYYY-MM-DD) -> getDay() 0=dom..6=sáb
  const day = new Date(`${date}T12:00:00`).getDay();
  return operationDays.includes(day);
}

export function normalizeOperationDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = value
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length > 0 ? days : null;
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];