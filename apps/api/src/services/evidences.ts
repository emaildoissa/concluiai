import { getSupabaseAdmin } from '../lib/supabase.js';

const STORAGE_BUCKET = 'evidences';

export interface PurgeResult {
  oldRows: number;
  storageFiles: number;
  deletedRows: number;
}

/**
 * Apaga evidências mais antigas que `olderThanDays` dias:
 * - Remove os arquivos do Storage (bucket `evidences`)
 * - Remove as linhas de `evidences` (métricas históricas continuam em daily_scores)
 */
export async function purgeOldEvidences(params?: {
  olderThanDays?: number;
}): Promise<PurgeResult> {
  const sb = getSupabaseAdmin();
  const olderThanDays = params?.olderThanDays ?? 30;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - olderThanDays);
  const cutoffIso = cutoff.toISOString();

  // 1. Seleciona os paths das fotos antigas (em lotes de 1000)
  const paths: string[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data: rows, error } = await sb
      .from('evidences')
      .select('id, photo_url')
      .lt('captured_at', cutoffIso)
      .order('captured_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = rows || [];
    paths.push(...batch.map((r) => r.photo_url).filter(Boolean));
    from += batch.length;
    if (batch.length < pageSize) break;
  }

  const oldRows = paths.length;

  // 2. Remove arquivos do Storage em lotes (máx. 1000 por chamada)
  let storageFiles = 0;
  for (let i = 0; i < paths.length; i += 1000) {
    const chunk = paths.slice(i, i + 1000);
    const { error: storageError } = await sb.storage.from(STORAGE_BUCKET).remove(chunk);
    if (storageError) {
      console.warn(`[purge-evidence] falha ao remover ${chunk.length} arquivos do storage`, storageError.message);
    } else {
      storageFiles += chunk.length;
    }
  }

  // 3. Remove as linhas antigas (mesmo que o storage tenha falhado, para não crescer o feed)
  const { error: deleteError } = await sb
    .from('evidences')
    .delete()
    .lt('captured_at', cutoffIso);

  if (deleteError) throw deleteError;

  return { oldRows, storageFiles, deletedRows: oldRows };
}