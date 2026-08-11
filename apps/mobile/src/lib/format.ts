const WEEKDAYS_SHORT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcParts(iso: string): Date {
  return new Date(iso);
}

/** Dia da semana + data curta em pt-BR, sem depender do Intl do aparelho.
 * Ex.: "qui., 11/08" */
export function formatDayPtBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return `${WEEKDAYS_SHORT[date.getUTCDay()]}, ${pad(d)}/${pad(m)}`;
}

/** Data e hora em pt-BR, interpretando o ISO como UTC (como as instâncias são gravadas).
 * Ex.: "11/08, 14:30" */
export function formatDuePtBR(iso: string): string {
  const d = toUtcParts(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
