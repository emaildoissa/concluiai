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
    'Você é um auditor de qualidade do setor de food service. Um colaborador enviou',
    'uma foto como prova de execução de uma tarefa operacional. Analise a imagem e',
    'decida se ela é uma evidência VÁLIDA da tarefa descrita.',
    '',
    `TAREFA: ${taskTitle}`,
    taskDescription ? `DESCRIÇÃO: ${taskDescription}` : '',
    '',
    'Critérios de reprovação (RECUSE se QUALQUER um ocorrer):',
    '- Foto escura, desfocada ou com movimento excessivo (sem nitidez);',
    '- Enquadramento errado (objeto/área da tarefa não visível);',
    '- Foto de tela de celular, print ou de outro aparelho;',
    '- Foto sem relação com a tarefa (banheiro, chão, rostos, etc.);',
    '- Foto com flash estourado que oculte o objeto.',
    '',
    'Responda SOMENTE com JSON: { "approved": boolean, "reason": string (curto, em português), "confidence": number (0 a 1) }.',
  ].filter(Boolean).join('\n');
}

export async function analyzeEvidenceImage(params: {
  imageBase64: string;
  mimeType: string;
  taskTitle: string;
  taskDescription: string | null;
}): Promise<EvidenceVerdict> {
  const { imageBase64, mimeType, taskTitle, taskDescription } = params;

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildPrompt(taskTitle, taskDescription) },
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
}
