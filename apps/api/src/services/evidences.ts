import { getSupabaseAdmin, type SupabaseClient } from '../lib/supabase.js';

export const STORAGE_BUCKET = 'evidences';
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hora de validade
const SIGNED_URL_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache em memória

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Retorna a URL assinada ou pública de uma foto de evidência no Supabase Storage.
 * Trata paths relativos, URLs já formatadas e faz fallback gracioso caso transform não esteja habilitado.
 */
export async function getSignedEvidenceUrl(
  sb: SupabaseClient,
  path: string | null | undefined,
  options?: { thumb?: boolean }
): Promise<string | null> {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  // Se já for URL completa externa ou data URL
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const now = Date.now();
  const cacheKey = options?.thumb ? `thumb:${trimmed}` : trimmed;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  // 1. Tenta gerar com transform (se thumbnail solicitado)
  if (options?.thumb) {
    try {
      const { data: signed, error: signedError } = await sb.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(trimmed, SIGNED_URL_EXPIRES_IN_SECONDS, {
          transform: { width: 300, height: 300, resize: 'cover' },
        });

      if (!signedError && signed?.signedUrl) {
        signedUrlCache.set(cacheKey, {
          url: signed.signedUrl,
          expiresAt: now + SIGNED_URL_CACHE_TTL_MS,
        });
        return signed.signedUrl;
      }
    } catch {
      // Falha no transform (ex: tier Free sem transform) -> fallback para URL assinada padrão
    }
  }

  // 2. Tenta gerar URL assinada padrão sem transform
  try {
    const { data: signed, error: signedError } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(trimmed, SIGNED_URL_EXPIRES_IN_SECONDS);

    if (!signedError && signed?.signedUrl) {
      signedUrlCache.set(cacheKey, {
        url: signed.signedUrl,
        expiresAt: now + SIGNED_URL_CACHE_TTL_MS,
      });
      return signed.signedUrl;
    }
    if (signedError) {
      console.warn(`[getSignedEvidenceUrl] aviso ao gerar URL assinada para '${trimmed}':`, signedError.message);
    }
  } catch (err) {
    console.warn(`[getSignedEvidenceUrl] erro inesperado ao assinar '${trimmed}':`, err);
  }

  // 3. Fallback: URL pública
  try {
    const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(trimmed);
    if (pub?.publicUrl) return pub.publicUrl;
  } catch {
    // ignore
  }

  return trimmed;
}

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