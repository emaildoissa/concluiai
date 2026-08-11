import { getSupabaseAdmin } from '../lib/supabase.js';
import { normalizePhoneBR } from './whatsapp.js';
import { classifyMessage } from '../lib/intents.js';
import { sendButtons, sendText } from './evolution.js';
import { applyMovement, listProductsForCompany } from './estoque.js';
import { config } from '../config.js';

const DUMMY_ID = '<id>';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Sanea entidades vindas da IA: remove valores nulos/vazios e placeholders. */
function normalizeEntities(entities: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(entities || {})) {
    if (value === null || value === undefined || value === '' || value === 'null') continue;
    if (value === DUMMY_ID) continue;
    out[key] = value;
  }
  if ('quantity' in out) out.quantity = Number(out.quantity);
  if ('unitCost' in out) out.unitCost = Number(out.unitCost);
  return out;
}

/** Busca fuzzy por nome de produto (para quando a IA não devolver productId). */
async function matchProductByName(companyId: string, name: string): Promise<string | null> {
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return null;
  const products = await listProductsForCompany(companyId);
  for (const p of products || []) {
    if (String(p.name).trim().toLowerCase() === clean) return p.id;
  }
  for (const p of products || []) {
    if (String(p.name).trim().toLowerCase().includes(clean) || clean.includes(String(p.name).trim().toLowerCase())) return p.id;
  }
  return null;
}

/**
 * Resolve uma unidade válida para movimentação: aceita só UUIDs que existem
 * na tabela units da empresa (evita IDs inventados pela IA ou perfis quebrados).
 */
async function resolveValidUnit(
  sb: ReturnType<typeof getSupabaseAdmin>,
  companyId: string,
  unitId?: unknown
): Promise<string | null> {
  if (!isValidUuid(unitId)) return null;
  const { data, error } = await sb
    .from('units')
    .select('id')
    .eq('id', unitId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  return unitId;
}

interface ResolvedPhone {
  number: string;
  valid: boolean;
}

interface Operator {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  unit_id: string | null;
  role: string | null;
  company_id: string;
}

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

function normalize(value: string): ResolvedPhone {
  const r = normalizePhoneBR(value);
  return { number: r.number, valid: r.valid };
}

/** Resolve um telefone normalizado para um gestor cadastrado (admin/manager). */
async function resolveOperator(companyId: string, phone: string): Promise<Operator | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('profiles')
    .select('id, full_name, phone, unit_id, role')
    .eq('company_id', companyId)
    .neq('phone', null)
    .in('role', ['admin', 'manager']);

  for (const p of data || []) {
    if (p.phone && normalize(p.phone).number === phone) {
      return {
        id: p.id,
        profile_id: p.id,
        full_name: p.full_name,
        unit_id: p.unit_id,
        role: p.role,
        company_id: companyId,
      };
    }
  }
  return null;
}

async function findOrCreateConversation(opts: {
  companyId: string;
  instanceId: string | null;
  userPhone: string;
  operator: Operator;
}) {
  const sb = getSupabaseAdmin();
  let { data: conv } = await sb
    .from('whatsapp_conversations')
    .select('*')
    .eq('company_id', opts.companyId)
    .eq('user_phone', opts.userPhone)
    .maybeSingle();

  if (!conv) {
    const { data, error } = await sb
      .from('whatsapp_conversations')
      .insert({
        company_id: opts.companyId,
        instance_id: opts.instanceId,
        user_phone: opts.userPhone,
        user_name: opts.operator.full_name,
        profile_id: opts.operator.id,
      })
      .select()
      .single();
    if (error) throw error;
    conv = data;
  } else {
    await sb
      .from('whatsapp_conversations')
      .update({ status: 'active', last_message_at: new Date().toISOString() })
      .eq('id', conv.id);
  }
  return conv;
}

async function addMessage(opts: {
  conversationId: string;
  companyId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: string;
  intent?: string;
  entities?: Record<string, any>;
}) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('whatsapp_messages').insert({
    conversation_id: opts.conversationId,
    company_id: opts.companyId,
    role: opts.role,
    content: opts.content,
    type: opts.type ?? 'text',
    intent: opts.intent ?? null,
    entities: opts.entities ?? null,
  });
  if (error) console.error('[whatsapp-bot addMessage]', error);
}

function isGreetingOnly(msg: string): boolean {
  const clean = msg.trim().toLowerCase();
  if (!clean) return false;
  const greetings = [
    'ola', 'olá', 'oi', 'oie', 'opa', 'salve', 'fala', 'beleza', 'blz',
    'bom dia', 'boa tarde', 'boa noite', 'e aí', 'e ai', 'tudo bem', 'tudo bom',
  ];
  if (greetings.includes(clean)) return true;
  const words = clean.split(/\s+/);
  if (greetings.includes(words[0])) {
    const rest = words.slice(1).join(' ');
    if (!rest || rest.split(/\s+/).every((w) => ['assistente', 'bot', 'concluiai'].includes(w))) return true;
  }
  return false;
}

export interface ConversationInput {
  instanceId?: string | null;
  companyId: string;
  userPhone: string;
  text?: string | null;
  audioBase64?: string;
  audioMimeType?: string;
  imageBase64?: string;
  imageMimeType?: string;
  buttonId?: string | null;
}

/**
 * Processa uma mensagem do gerente pelo WhatsApp.
 * Fluxo: resolvê operador → chat? → classificar → confirmar (se mutável) → executar → logar.
 */
export async function handleConversation(input: ConversationInput): Promise<{ response?: string; ignored: boolean }> {
  const startedAt = Date.now();
  const sb = getSupabaseAdmin();
  const phone = normalize(input.userPhone);
  if (!phone.valid) return { ignored: true };

  const operator = await resolveOperator(input.companyId, phone.number);
  if (!operator) {
    console.log(`[whatsapp-bot] telefone não cadastrado como gestor: ${phone.number}`);
    return { ignored: true };
  }

  const conv = await findOrCreateConversation({
    companyId: input.companyId,
    instanceId: input.instanceId ?? null,
    userPhone: phone.number,
    operator,
  });

  const content = input.text || (input.audioBase64 ? '[áudio]' : input.imageBase64 ? '[foto]' : '');
  await addMessage({
    conversationId: conv.id,
    companyId: input.companyId,
    role: 'user',
    content,
    type: input.audioBase64 ? 'audio' : input.imageBase64 ? 'image' : 'text',
  });

  // ── Resposta a botão de confirmação pendente ─────────────────────────────
  if (input.buttonId?.startsWith('confirm_')) {
    return handleConfirmationResponse(sb, operator, conv.id, input.buttonId, input);
  }
  if (input.buttonId?.startsWith('cancel_')) {
    const pendingId = input.buttonId.slice('cancel_'.length);
    await sb
      .from('whatsapp_pending_confirmations')
      .update({ status: 'cancelled' })
      .eq('id', pendingId);
    await sendText(phone.number, '✅ Ação cancelada. Nada foi registrado.');
    return { response: 'Ação cancelada.', ignored: false };
  }

  // ── Saudação (sem IA) ────────────────────────────────────────────────────
  if (input.text && isGreetingOnly(input.text)) {
    await sendText(phone.number, 'Olá! Sou seu assistente de estoque. Pode mandar, ex.:\n"dar entrada de 10 kg de tomate a 4.50" ou "saldo do tomate".');
    return { response: 'Saudação respondida.', ignored: false };
  }

  // ── Classificação via IA ─────────────────────────────────────────────────
  let intent = 'chat';
  let entities: Record<string, any> = {};
  try {
    const result = await classifyMessage({
      companyId: input.companyId,
      text: input.text,
      audioBase64: input.audioBase64,
      audioMimeType: input.audioMimeType,
      imageBase64: input.imageBase64,
      imageMimeType: input.imageMimeType,
    });
    intent = result.intent;
    entities = normalizeEntities(result.entities || {});
  } catch (e) {
    console.error('[whatsapp-bot] classify error', e);
  }

  // ── Cartões de confirmação para ações que mudam dados ────────────────────
  if (intent === 'dar_entrada' || intent === 'dar_saida') {
    const label = intent === 'dar_entrada' ? 'Entrada' : 'Saída';
    let productId = entities.productId as string | undefined;
    const quantity = Number(entities.quantity) || 0;
    if (!productId) {
      productId = (await matchProductByName(input.companyId, entities.name as string)) || undefined;
      if (productId) entities.productId = productId;
    }
    if (!productId || quantity <= 0) {
      await sendText(phone.number, 'Não identifiquei o produto ou a quantidade. Por favor, especifique o nome e a quantidade.');
      return { response: 'Dados insuficientes.', ignored: false };
    }

    const detail = await describeProduct(sb, productId, quantity);
    const pendingUnitId =
      (await resolveValidUnit(sb, input.companyId, entities.unitId)) ??
      (await resolveValidUnit(sb, input.companyId, operator.unit_id));
    const { data: pending, error } = await sb
      .from('whatsapp_pending_confirmations')
      .insert({
        company_id: input.companyId,
        conversation_id: conv.id,
        user_phone: phone.number,
        intent,
        payload: { ...entities, unitId: pendingUnitId, createdBy: operator.id },
        expires_at: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[whatsapp-bot] pending insert', error);
      return { ignored: true };
    }

    await addMessage({
      conversationId: conv.id,
      companyId: input.companyId,
      role: 'assistant',
      content: `Confirma ${label.toLowerCase()} de ${detail}?`,
      intent,
      entities,
    });

    try {
      await sendButtons(
        phone.number,
        `*Confirma ${label.toLowerCase()} de ${detail}?*`,
        [
          { id: `confirm_${pending.id}`, text: '✅ Confirmar' },
          { id: `cancel_${pending.id}`, text: '❌ Cancelar' },
        ]
      );
    } catch (e) {
      console.error('[whatsapp-bot] sendButtons fallback', e);
      await sendText(phone.number, `Ação pendente. Responda "confirmar" ou "cancelar" para: ${label.toLowerCase()} de ${detail}.`);
    }
    return { response: 'Confirmação solicitada.', ignored: false };
  }

  // ── Execução direta (consultas / cadastro) ───────────────────────────────
  let reply: string;
  switch (intent) {
    case 'consultar_saldo': {
      reply = await answerSaldo(sb, input.companyId, entities.productId as string | undefined);
      break;
    }
    case 'cadastrar_produto': {
      const name = (entities.name as string) || '';
      if (!name) {
        reply = 'Qual produto você quer cadastrar? Me diga o nome e, se quiser, a categoria.';
      } else {
        const { data: product } = await sb
          .from('products')
          .insert({ company_id: input.companyId, name, average_cost: Number(entities.unitCost) || 0 })
          .select()
          .single();
        reply = product
          ? `✅ Produto *${product.name}* cadastrado!`
          : '❌ Não consegui cadastrar o produto.';
      }
      break;
    }
    default: {
      reply = (entities as any).reply || 'Não entendi. Ex.: "dar entrada de 10 kg de tomate", "saldo do tomate" ou "cadastrar produto óleo de soja".';
    }
  }

  await sendText(phone.number, reply);
  await addMessage({
    conversationId: conv.id,
    companyId: input.companyId,
    role: 'assistant',
    content: reply,
    intent,
    entities,
  });
  console.log(`[whatsapp-bot] respondido em ${Date.now() - startedAt}ms (intent: ${intent})`);
  return { response: reply, ignored: false };
}

/** Aplica a confirmação (botão Confirmar) e registra a movimentação. */
async function handleConfirmationResponse(
  sb: ReturnType<typeof getSupabaseAdmin>,
  operator: Operator,
  conversationId: string,
  buttonId: string,
  input: ConversationInput,
) {
  const phone = normalize(input.userPhone).number;
  const pendingId = buttonId.slice('confirm_'.length);

  const { data: pending } = await sb
    .from('whatsapp_pending_confirmations')
    .select('*')
    .eq('id', pendingId)
    .single();

  if (!pending || pending.status !== 'pending') {
    await sendText(phone, 'Essa confirmação não está mais pendente. Peça novamente.');
    return { response: 'Confirmação expirada.', ignored: false };
  }

  const payload = pending.payload || {};
  const productId = payload.productId as string;
  const quantity = Number(payload.quantity) || 0;
  console.log(`[whatsapp-bot] confirmação ${pending.id.slice(0, 8)} intent=${pending.intent} productId=${productId} qty=${quantity} unitId=${payload.unitId}`);

  try {
    if (pending.intent === 'dar_entrada' || pending.intent === 'dar_saida') {
      if (!isValidUuid(productId) || quantity <= 0) throw new Error('Produto ou quantidade inválidos');
      const unitId = await resolveValidUnit(sb, operator.company_id, payload.unitId);
      const movementId = await applyMovement({
        companyId: operator.company_id,
        unitId,
        productId,
        movementType: pending.intent === 'dar_entrada' ? 'in' : 'out',
        quantity: Math.abs(quantity),
        unitCost: pending.intent === 'dar_entrada' ? Number(payload.unitCost) || null : null,
        reason: `via WhatsApp (${pending.intent})`,
        source: 'whatsapp',
        createdBy: operator.id,
      });
      await sb.from('whatsapp_pending_confirmations').update({ status: 'confirmed' }).eq('id', pendingId);
      const label = pending.intent === 'dar_entrada' ? 'entrada' : 'saída';
      await sendText(phone, `✅ *${label.charAt(0).toUpperCase() + label.slice(1)} registrada!* (${await describeProduct(sb, productId, quantity)})`);
      await addMessage({
        conversationId,
        companyId: operator.company_id,
        role: 'system',
        content: `Movimentação registrada (id ${movementId})`,
        intent: pending.intent,
        entities: payload,
      });
      return { response: 'Movimentação registrada.', ignored: false };
    }
  } catch (e) {
    console.error('[whatsapp-bot] confirm apply error', e);
    await sendText(phone, '❌ Erro ao registrar. Tente novamente.');
    return { response: 'Erro ao registrar.', ignored: false };
  }

  await sendText(phone, 'Ação confirmada.');
  return { response: 'Confirmado.', ignored: false };
}

async function describeProduct(sb: ReturnType<typeof getSupabaseAdmin>, productId: string, quantity: number): Promise<string> {
  const { data } = await sb
    .from('products')
    .select('name, uom_id (name, abbreviation)')
    .eq('id', productId)
    .maybeSingle();
  if (!data) return `produto (${quantity})`;
  const row = data as any;
  const uom = row.uom_id?.abbreviation ?? '';
  const qty = Number(quantity).toLocaleString('pt-BR');
  return `${qty} ${uom} de ${row.name}`.trim();
}

async function answerSaldo(sb: ReturnType<typeof getSupabaseAdmin>, companyId: string, productId?: string): Promise<string> {
  if (productId) {
    const { data } = await sb
      .from('product_stock')
      .select('quantity, products:product_id (name, uom_id (abbreviation), min_stock)')
      .eq('product_id', productId)
      .maybeSingle();
    if (!data) return 'Produto não encontrado. Tente "cadastrar produto <nome>".';
    const row = data as any;
    const min = Number(row.products?.min_stock ?? 0);
    const qtyNum = Number(row.quantity);
    const qty = qtyNum.toLocaleString('pt-BR');
    const uom = row.products?.uom_id?.abbreviation ?? 'un';
    const warning = qtyNum <= min ? '\n⚠️ Abaixo do estoque mínimo!' : '';
    return `📦 *${row.products?.name}*: ${qty} ${uom}. Mínimo: ${min} ${uom}.${warning}`;
  }

  // Sem produto específico: lista produtos com saldo (top 15)
  const products = await listProductsForCompany(companyId);
  if (products.length === 0) return 'Nenhum produto cadastrado ainda.';
  const ids = products.map((p: any) => p.id);
  const { data: stock } = await sb
    .from('product_stock')
    .select('product_id, quantity')
    .in('product_id', ids);
  const map = new Map((stock || []).map((s: any) => [s.product_id, s.quantity]));
  const lines = products.slice(0, 15).map((p: any) => {
    const qty = (map.get(p.id) ?? 0).toLocaleString('pt-BR');
    return `• ${p.name}: ${qty} ${p.uom_id?.abbreviation ?? 'un'}`;
  });
  return `📦 *Saldo (atual):*\n${lines.join('\n')}`;
}

export { resolveOperator, normalize as normalizeBotPhone };