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
    `🏷️ NOME DA TAREFA: ${taskTitle}`,
    taskDescription
      ? `📋 DIRETRIZ OPERACIONAL / CRITÉRIOS DE CONFORMIDADE:\n"${taskDescription}"`
      : '📋 DIRETRIZ OPERACIONAL: Validar se o equipamento/área está em condições adequadas de operação, higiene e organização.',
    '',
    'DIRETRIZES PARA AUDITORIA DA IA:',
    '1. AVALIAÇÃO DA DIRETRIZ: Examine atentamente a foto para constatar se ela cumpre o que foi solicitado na DIRETRIZ OPERACIONAL (ex: cuba higienizada sem resíduos, superfícies secas, objetos organizados).',
    '2. CONTROLE DE TEMPERATURA / INDICADORES: Se a diretriz especificar faixas numéricas de temperatura (ex: freezer entre -18°C e -22°C, geladeira entre 2°C e 6°C), verifique se o termômetro ou visor digital na foto mostra um valor aceitável e legível.',
    '3. HIGIENE E SEGURANÇA ALIMENTAR: Se for limpeza (ex: panela de arroz, bancada, coifa, ralo, fogão), verifique se o interior/superfície está limpo, sem gordura aparente, sem restos de comida ou sujeira.',
    '4. CRITÉRIOS DE REPROVAÇÃO IMEDIATA (RECUSE caso ocorra qualquer um):',
    '   - Foto escura, borrada, tremida ou sem nitidez que impeça a leitura ou inspeção;',
    '   - Enquadramento errado (o objeto/equipamento/display exigido não está visível);',
    '   - Foto de tela de computador, print de celular ou de outra foto (fraude);',
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
