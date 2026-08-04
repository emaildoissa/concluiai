/**
 * Configuração do frontend.
 * Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env da raiz
 * (veja .env.example).
 *
 * API no celular (LAN):
 * - NÃO use VITE_API_URL=http://localhost:4000 no mobile — o celular
 *   interpreta "localhost" como ele mesmo e dá Failed to fetch.
 * - Deixe VITE_API_URL vazio (recomendado). As chamadas vão para a mesma
 *   origem do Vite (:5173) e o proxy encaminha para a API no notebook.
 * - Se precisar de URL absoluta, use o IP da máquina: http://192.168.x.x:4000
 */

function resolveApiUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '';

  // Sem config → relative URL (mesma origem + proxy do Vite). Ideal p/ notebook e celular.
  if (!configured) return '';

  // Em runtime no browser: se a página não está em localhost mas a API aponta
  // para localhost, ignore e use relative — corrige o Failed to fetch no celular.
  if (typeof window !== 'undefined') {
    const pageHost = window.location.hostname;
    const pageIsLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
    const apiIsLocal =
      configured.includes('localhost') || configured.includes('127.0.0.1');

    if (!pageIsLocal && apiIsLocal) {
      console.warn(
        '[concluiai] VITE_API_URL aponta para localhost, mas a página está em',
        pageHost,
        '— usando proxy relativo (/api) para funcionar no celular.'
      );
      return '';
    }
  }

  // Remove barra final para concatenar paths com segurança
  return configured.replace(/\/$/, '');
}

export const webConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  /** Base da API. String vazia = mesma origem (Vite proxy em dev). */
  get apiUrl() {
    return resolveApiUrl();
  },
  demoMode: !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(webConfig.supabaseUrl && webConfig.supabaseAnonKey);
}

/** Página aberta via IP da LAN (teste no celular)? */
export function isLanAccess(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h !== 'localhost' && h !== '127.0.0.1';
}

/** Contexto seguro (HTTPS ou localhost) — câmera getUserMedia costuma exigir isso. */
export function isSecureMediaContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}
