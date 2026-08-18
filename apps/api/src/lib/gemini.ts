import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface EvidenceVerdict {
  approved: boolean;
  reason: string;
  confidence: number;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    approved: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['approved', 'reason', 'confidence'],
} as const;

function buildPrompt(taskTitle: string, taskDescription: string | null): string {
  return [
    'Você é um auditor especialista em qualidade e conformidade operacional de food service e varejo.',
    'Um colaborador enviou uma fotografia em tempo real como evidência de execução da seguinte tarefa:',
    '',
    `TAREFA: ${taskTitle}`,
    taskDescription
      ? `DIRETRIZ OPERACIONAL / CRITÉRIOS DE CONFORMIDADE:\n"${taskDescription}"`
      : 'DIRETRIZ OPERACIONAL: Validar se o equipamento/área está em condições adequadas de operação, higiene e organização.',
    '',
    'DIRETRIZES DE AUDITORIA:',
    '1. AVALIAÇÃO DA DIRETRIZ: Examine atentamente a foto para constatar se ela cumpre o que foi solicitado na diretriz (ex: cuba higienizada sem resíduos, superfícies secas, objetos organizados).',
    '2. CONTROLE DE TEMPERATURA / INDICADORES: Se a diretriz especificar faixas numéricas de temperatura (ex: freezer entre -18°C e -22°C, geladeira entre 2°C e 6°C), verifique se o visor digital ou termômetro na foto mostra um valor legível e dentro da faixa aceitável.',
    '3. HIGIENE E SEGURANÇA ALIMENTAR: Se for limpeza (ex: panela, bancada, coifa, ralo, fogão), verifique se o interior/superfície está limpo, sem gordura aparente, sem restos de comida ou sujeira.',
    '4. CRITÉRIOS DE REPROVAÇÃO IMEDIATA (RECUSE caso ocorra qualquer um):',
    '   - Foto escura, borrada, tremida ou sem nitidez que impeça a leitura ou inspeção;',
    '   - Enquadramento incorreto (o objeto/equipamento/display exigido não está visível);',
    '   - Foto de tela de computador, foto de celular ou de outra fotografia (fraude);',
    '   - Foto sem relação com a tarefa solicitada;',
    '   - Não conformidade evidente com a diretriz (ex: sujeira visível quando deveria estar limpo, temperatura fora da faixa indicada).',
    '',
    'Responda ESTRITAMENTE em formato JSON com as seguintes chaves:',
    '{',
    '  "approved": boolean,',
    '  "reason": "Explicação concisa e profissional em português para o operador (ex: \'Temperatura de -19.5°C conferida no display dentro da faixa esperada\' ou \'Recusado: interior da panela ainda apresenta resíduos de alimentos\')",',
    '  "confidence": number (de 0.0 a 1.0)',
    '}',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cadeia de modelos para fallback em caso de sobrecarga temporária (503/429)
const FALLBACK_MODELS = Array.from(
  new Set([config.geminiModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'])
);

export async function analyzeEvidenceImage(params: {
  imageBase64: string;
  mimeType: string;
  taskTitle: string;
  taskDescription: string | null;
}): Promise<EvidenceVerdict> {
  const { imageBase64, mimeType, taskTitle, taskDescription } = params;
  const promptText = buildPrompt(taskTitle, taskDescription);

  let lastError: unknown = null;

  for (const modelName of FALLBACK_MODELS) {
    // Tenta até 2 vezes por modelo com pequeno backoff
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('A IA retornou uma resposta vazia.');
        }

        const parsed = JSON.parse(text) as Partial<EvidenceVerdict>;
        if (
          typeof parsed.approved !== 'boolean' ||
          typeof parsed.reason !== 'string' ||
          typeof parsed.confidence !== 'number'
        ) {
          throw new Error('A IA retornou JSON em formato inesperado.');
        }

        return {
          approved: parsed.approved,
          reason: parsed.reason,
          confidence: parsed.confidence,
        };
      } catch (err: any) {
        lastError = err;
        const errMessage = String(err?.message || err);
        const isTransient =
          errMessage.includes('503') ||
          errMessage.includes('UNAVAILABLE') ||
          errMessage.includes('429') ||
          errMessage.includes('RESOURCE_EXHAUSTED') ||
          errMessage.includes('high demand') ||
          errMessage.includes('fetch failed');

        if (isTransient && attempt === 1) {
          console.warn(`[gemini] Modelo ${modelName} temporariamente indisponível. Tentando novamente em 1s...`);
          await sleep(1000);
          continue;
        }

        console.warn(`[gemini] Falha no modelo ${modelName}:`, errMessage);
        break; // Tenta o próximo modelo do fallback
      }
    }
  }

  throw lastError || new Error('Não foi possível processar a auditoria de imagem com os modelos disponíveis.');
}
