import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { listProductsForCompany } from '../services/estoque.js';
import { getSupabaseAdmin } from './supabase.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface IntentResult {
  intent: string;
  entities: Record<string, any>;
}

const INTENTS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['dar_entrada', 'dar_saida', 'consultar_saldo', 'cadastrar_produto', 'cancelar', 'chat'],
    },
    entities: {
      type: 'OBJECT',
      properties: {
        productId: { type: 'STRING' },
        quantity: { type: 'NUMBER' },
        unitCost: { type: 'NUMBER' },
        unitId: { type: 'STRING' },
        name: { type: 'STRING' },
        category: { type: 'STRING' },
        bot_reply: { type: 'STRING' },
        reply: { type: 'STRING' },
      },
      required: [],
    },
  },
  required: ['intent', 'entities'],
} as const;

function buildPrompt(
  productContext: string,
  unitContext: string,
  hasAudio: boolean,
  hasImage: boolean,
): string {
  const header = hasAudio
    ? 'O usuário enviou um ÁUDIO de voz. Transcreva o que ele disse.'
    : hasImage
      ? 'O usuário enviou uma FOTO (ex.: nota fiscal, etiqueta). Extraia o que for relevante.'
      : 'O usuário enviou uma mensagem de texto.';

  return [
    'Você é o assistente de estoque do ConcluíAI, um ERP gastronômico.',
    header,
    '',
    'Classifique a INTENÇÃO e extraia ENTIDADES para registrar ou consultar estoque.',
    '',
    'Intenções disponíveis:',
    '- "dar_entrada": registrar entrada de produto no estoque (compra/reposição). Entities: productId (string), quantity (number), unitCost (number, opcional), unitId (string, opcional - id da unidade/loja), bot_reply (string)',
    '- "dar_saida": registrar saída de produto (uso, baixa, fabricação). Entities: productId (string), quantity (number), unitId (string, opcional), bot_reply (string)',
    '- "consultar_saldo": perguntar o nível de estoque de um produto. Entities: productId (string), bot_reply (string)',
    '- "cadastrar_produto": criar um novo produto. Entities: name (string), category (string, opcional), quantity (number, opcional), unitId (string, opcional), bot_reply (string)',
    '- "cancelar": cancelar a última ação (ex.: desfazer entrada/saída errada). Entities: bot_reply (string)',
    '- "chat": saudação ou assunto fora das regras acima. Entities: reply (string)',
    '',
    'REGRAS IMPORTANTES:',
    '- Use SEMPRE o productId EXATO da lista de produtos disponível abaixo. Se o produto mencionado não existir, retorne intent="cadastrar_produto" com name = nome do produto. NAO invente productId.',
    '- Use SEMPRE o unitId EXATO da lista de unidades disponível abaixo. Se o usuário não indicar a unidade/loja, NAO preencha unitId (omita o campo). NUNCA invente um UUID.',
    '- quantities são números (posso ser decimal, ex.: 1.5).',
    '- unitCost (custo de compra) é um número em reais.',
    '- NÃO inclua campos com valor null ou vazio no entities (ex.: omita unitId, unitCost, name, reply quando não houver).',
    '- bot_reply: resposta curta e simpática confirmando o que foi entendido, dirigida ao gerente.',
    '',
    productContext
      ? `PRODUTOS DISPONÍVEIS (id | nome):\n${productContext}`
      : '',
    '',
    unitContext
      ? `UNIDADES DISPONÍVEIS (id | nome):\n${unitContext}`
      : '',
    '',
    'Exemplos:',
    'Mensagem: "dar entrada de 10 kg de tomate a 4.50"',
    'Resposta: {"intent": "dar_entrada", "entities": {"productId": "<id>", "quantity": 10, "unitCost": 4.5, "bot_reply": "Entrada de 10 kg de Tomate a R$ 4,50/kg. Correto?"}}',
    'Mensagem: "saldo do tomate"',
    'Resposta: {"intent": "consultar_saldo", "entities": {"productId": "<id>", "bot_reply": ""}}',
  ].filter(Boolean).join('\n');
}

/**
 * Classifica uma mensagem (texto, áudio ou foto) em intent + entities.
 */
export async function classifyMessage(params: {
  companyId: string;
  text?: string | null;
  audioBase64?: string;
  audioMimeType?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<IntentResult> {
  const { companyId, text } = params;
  const hasAudio = Boolean(params.audioBase64);
  const hasImage = Boolean(params.imageBase64);

  let products: string[] = [];
  try {
    const list = await listProductsForCompany(companyId);
    products = list.map((p: any) => `${p.id} | ${p.name} (${p.uom_id?.abbreviation ?? 'un'})`);
  } catch {
    // sem produtos cadastrados: segue sem contexto
  }

  let units: string[] = [];
  try {
    const { data } = await getSupabaseAdmin()
      .from('units')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    units = (data || []).map((u: any) => `${u.id} | ${u.name}`);
  } catch {
    // sem unidades: segue sem contexto
  }

  const prompt = buildPrompt(products.join('\n'), units.join('\n'), hasAudio, hasImage);

  const parts: any[] = [{ text: prompt }];
  if (params.audioBase64) {
    parts.push({
      inlineData: {
        mimeType: params.audioMimeType || 'audio/ogg',
        data: params.audioBase64,
      },
    });
  }
  if (params.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType || 'image/jpeg',
        data: params.imageBase64,
      },
    });
  }
  if (text) parts.push({ text: `Mensagem: ${text}` });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: INTENTS_SCHEMA,
        temperature: 0.1,
        abortSignal: controller.signal,
      },
    });
    const raw = response.text;
    if (!raw) throw new Error('IA retornou resposta vazia na classificação de intenção');

    const parsed = JSON.parse(raw) as Partial<IntentResult>;
    console.log(`[intents] classificação em ${Date.now() - startedAt}ms (intent: ${parsed.intent})`);
    return {
      intent: parsed.intent || 'chat',
      entities: parsed.entities || {},
    };
  } finally {
    clearTimeout(timeout);
  }
}