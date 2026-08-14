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
    ? 'O usuário enviou um ÁUDIO de voz. Transcreva o que ele disse e entenda a ação.'
    : hasImage
      ? 'O usuário enviou uma FOTO (ex.: nota fiscal, etiqueta, produto). Extraia os itens e valores.'
      : 'O usuário enviou uma mensagem de texto pelo WhatsApp.';

  return [
    'Você é o assistente inteligente de estoque do ConcluíAI, um ERP gastronômico para restaurantes e franquias.',
    header,
    '',
    'Classifique a INTENÇÃO e extraia as ENTIDADES com precisão para registrar ou consultar estoque.',
    '',
    'Intenções disponíveis:',
    '- "dar_entrada": Qualquer compra, chegada de mercadoria, reposição, abastecimento ou entrada. (Ex: "comprei 20 sacos de arroz", "chegou 10 kg de tomate a 4.50", "entrou 5 caixas de óleo", "compramos 3 fardos de coca").',
    '  Entities: name (string, nome do produto), productId (string, se existir na lista abaixo), quantity (number, quantidade numérica), unitCost (number, opcional - valor unitário em R$), unitId (string, opcional), bot_reply (string).',
    '',
    '- "dar_saida": Uso, consumo, baixa, quebra, preparo ou saída de estoque. (Ex: "usei 3 kg de arroz", "gastamos 2 pacotes de massa", "saiu 5 latas de cerveja", "baixa de 1 kg de frango").',
    '  Entities: name (string, nome do produto), productId (string, se existir na lista abaixo), quantity (number), unitId (string, opcional), bot_reply (string).',
    '',
    '- "consultar_saldo": Consultas sobre quantidade disponível ou estoque de produtos. (Ex: "quanto tem de arroz?", "tem tomate?", "saldo do frango", "estoque atual").',
    '  Entities: name (string, opcional), productId (string, se existir na lista abaixo), bot_reply (string).',
    '',
    '- "cadastrar_produto": Pedido explícito para criar ou cadastrar um novo produto. (Ex: "cadastrar produto azeite de oliva", "novo produto farinha").',
    '  Entities: name (string), category (string, opcional), quantity (number, opcional), unitCost (number, opcional), unitId (string, opcional), bot_reply (string).',
    '',
    '- "cancelar": Cancelar ou desfazer a última ação. (Ex: "cancela", "desfazer", "errei o valor").',
    '  Entities: bot_reply (string).',
    '',
    '- "chat": Saudações puras ("oi", "olá", "bom dia") ou conversas não relacionadas a estoque.',
    '  Entities: reply (string).',
    '',
    'REGRAS IMPORTANTES:',
    '1. Identifique SEMPRE o "name" do produto (ex: "Arroz", "Tomate", "Óleo de soja").',
    '2. Se o produto mencionado estiver na lista "PRODUTOS DISPONÍVEIS", atribua o "productId" correspondente. Se NÃO estiver na lista, NÃO invente um UUID, apenas forneça o "name".',
    '3. "quantity" deve ser o número extraído (ex: "20 sacos de arroz" -> quantity: 20, name: "Arroz").',
    '4. "unitCost" é o valor unitário em reais se informado (ex: "a 4,50" -> unitCost: 4.5).',
    '5. Mensagens como "Comprei X produto", "Chegou X", "Entrada de X" são SEMPRE intent="dar_entrada".',
    '6. Mensagens como "Usei X", "Gastamos X", "Baixa de X" são SEMPRE intent="dar_saida".',
    '',
    productContext
      ? `PRODUTOS DISPONÍVEIS NO SISTEMA (id | nome):\n${productContext}`
      : 'Nenhum produto cadastrado no momento.',
    '',
    unitContext
      ? `UNIDADES / LOJAS DISPONÍVEIS (id | nome):\n${unitContext}`
      : '',
    '',
    'Exemplos de classificação:',
    '• "Comprei 20 sacos de arroz"',
    '  -> {"intent": "dar_entrada", "entities": {"name": "Arroz", "quantity": 20, "bot_reply": "Entrada de 20 un de Arroz."}}',
    '• "dar entrada de 10 kg de tomate a 4.50"',
    '  -> {"intent": "dar_entrada", "entities": {"name": "Tomate", "quantity": 10, "unitCost": 4.5, "bot_reply": "Entrada de 10 kg de Tomate a R$ 4,50."}}',
    '• "quanto tem de tomate?"',
    '  -> {"intent": "consultar_saldo", "entities": {"name": "Tomate"}}',
    '• "usei 2 kg de frango"',
    '  -> {"intent": "dar_saida", "entities": {"name": "Frango (peito)", "quantity": 2, "bot_reply": "Saída de 2 kg de Frango."}}',
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