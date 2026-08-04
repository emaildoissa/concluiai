import { supabase } from './supabase';
import type { AnalyzeResult } from './types';

export async function analyzeEvidence(evidenceId: string): Promise<AnalyzeResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error('Defina EXPO_PUBLIC_API_URL no .env (veja .env.example).');
  }

  const res = await fetch(`${baseUrl}/api/evidence/${evidenceId}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const json = (await res.json().catch(() => ({}))) as Partial<AnalyzeResult> & { error?: string };

  if (!res.ok) {
    throw new Error(json.error ?? `Falha na análise da foto (${res.status}).`);
  }

  return json as AnalyzeResult;
}
