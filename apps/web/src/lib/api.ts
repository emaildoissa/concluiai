import { webConfig, isLanAccess } from './config';
import { getSupabase } from './supabase';

type ApiErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
};

type RequestOptions = {
  method?: string;
  body?: BodyInit;
  headers?: HeadersInit;
};

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.warn('[api] falha ao obter sessão:', error.message);
    return null;
  }

  return data.session?.access_token || null;
}

async function authHeaders(): Promise<Headers> {
  const headers = new Headers();

  headers.set('Accept', 'application/json');

  const accessToken = await getAccessToken();

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

async function jsonHeaders(): Promise<Headers> {
  const headers = await authHeaders();

  headers.set('Content-Type', 'application/json');

  return headers;
}

function apiBase(): string {
  return String(webConfig.apiUrl || '').trim();
}

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const base = apiBase();

  if (!base) {
    return normalizedPath;
  }

  return `${base.replace(/\/+$/, '')}${normalizedPath}`;
}

function networkErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error);

  const normalized = raw.toLowerCase();

  const isNetworkFailure =
    raw === 'Failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('network request failed');

  if (!isNetworkFailure) {
    return raw;
  }

  if (isLanAccess()) {
    return (
      'Falha de rede no celular. Confirme que: ' +
      '(1) notebook e celular estão no mesmo Wi-Fi; ' +
      '(2) o aplicativo foi aberto pela URL do Vite, ' +
      'por exemplo, http://IP:5173; ' +
      '(3) a API está em execução no notebook. ' +
      'Se estiver usando o proxy do Vite, deixe VITE_API_URL vazio no .env.'
    );
  }

  return (
    'Falha ao conectar com a API. ' +
    'Verifique se o servidor está em execução e se a URL da API está correta.'
  );
}

async function readResponseBody(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  return response.text().catch(() => '');
}

function getResponseErrorMessage(
  response: Response,
  body: unknown,
): string {
  if (response.status === 413) {
    return (
      'A imagem excede o tamanho máximo permitido pelo servidor.'
    );
  }

  if (response.status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }

  if (response.status === 403) {
    return 'Você não tem permissão para realizar esta operação.';
  }

  if (response.status === 404) {
    return 'Recurso não encontrado.';
  }

  if (typeof body === 'object' && body !== null) {
    const errorBody = body as ApiErrorBody;

    if (errorBody.error) {
      return errorBody.error;
    }

    if (errorBody.message) {
      return errorBody.message;
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  return `Erro HTTP ${response.status}`;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    });
  } catch (error) {
    throw new Error(networkErrorMessage(error));
  }

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      getResponseErrorMessage(response, responseBody),
    );
  }

  return responseBody as T;
}

export async function apiGet<T>(
  path: string,
): Promise<T> {
  const headers = await authHeaders();

  return request<T>(path, {
    method: 'GET',
    headers,
  });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = await jsonHeaders();

  return request<T>(path, {
    method: 'POST',
    headers,
    body:
      body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = await jsonHeaders();

  return request<T>(path, {
    method: 'PATCH',
    headers,
    body:
      body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = await jsonHeaders();

  return request<T>(path, {
    method: 'PUT',
    headers,
    body:
      body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });
}

/**
 * Envia arquivos usando multipart/form-data.
 *
 * Importante:
 * Não defina Content-Type manualmente nesta função.
 * O navegador precisa criar automaticamente o boundary:
 *
 * multipart/form-data; boundary=...
 */
export async function apiPostFormData<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const headers = await authHeaders();

  /*
   * Não adicionar:
   *
   * headers.set('Content-Type', 'multipart/form-data');
   *
   * O navegador faz isso automaticamente quando o body é FormData.
   */
  return request<T>(path, {
    method: 'POST',
    headers,
    body: formData,
  });
}

export async function apiDelete<T>(
  path: string,
): Promise<T> {
  const headers = await authHeaders();

  return request<T>(path, {
    method: 'DELETE',
    headers,
  });
}