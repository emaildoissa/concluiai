/**
 * Regras de dias de operação por unidade.
 * operation_days: INT[] em que 0=domingo ... 6=sábado.
 * NULL ou undefined => opera todos os dias (default).
 * [] (array vazio) => unidade sem expediente / fechada em todos os dias.
 */
export function isOperationDay(date: string, operationDays: number[] | null | undefined): boolean {
  if (operationDays === null || operationDays === undefined) return true;
  if (Array.isArray(operationDays) && operationDays.length === 0) return false;
  // 2026-08-16 (YYYY-MM-DD) -> getDay() 0=dom..6=sáb no fuso de Brasília
  const day = new Date(`${date}T12:00:00-03:00`).getDay();
  return operationDays.includes(day);
}

export function normalizeOperationDays(value: unknown): number[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const days = value
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days;
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