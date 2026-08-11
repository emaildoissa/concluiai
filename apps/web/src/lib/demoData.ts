/** Dados locais para modo demo (sem Supabase) */

export const DEMO_UNITS = [
  {
    id: '22222222-2222-2222-2222-222222222221',
    name: 'Unidade Centro',
    address: 'Rua Principal, 100',
    is_active: true,
    score_total: 91.2,
    tasks_pending: 3,
    tasks_late: 1,
    tasks_completed: 12,
    critical_missed: 0,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Unidade Shopping',
    address: 'Av. Mall, 500',
    is_active: true,
    score_total: 76.5,
    tasks_pending: 5,
    tasks_late: 2,
    tasks_completed: 8,
    critical_missed: 1,
  },
  {
    id: 'u3',
    name: 'Unidade Aeroporto',
    address: 'Terminal 2',
    is_active: true,
    score_total: 88.0,
    tasks_pending: 2,
    tasks_late: 0,
    tasks_completed: 15,
    critical_missed: 0,
  },
];

export const DEMO_CHECKLISTS = [
  {
    id: '44444444-4444-4444-4444-444444444441',
    name: 'Abertura de Cozinha',
    description: 'Checklist diário de abertura',
    shift: 'morning' as const,
    recurrence: 'daily' as const,
    is_active: true,
    items: [
      {
        id: 'i1',
        title: 'Conferência de gás',
        description: 'Verificar válvulas e vazamentos',
        is_critical: true,
        requires_photo: true,
        requires_gps: true,
        due_time: '08:00',
        sort_order: 1,
        weight: 2,
      },
      {
        id: 'i2',
        title: 'Temperatura das câmaras',
        description: 'Registrar temperatura frigorífica',
        is_critical: true,
        requires_photo: true,
        requires_gps: true,
        due_time: '08:15',
        sort_order: 2,
        weight: 2,
      },
      {
        id: 'i3',
        title: 'Limpeza de bancadas',
        description: 'Bancadas higienizadas e secas',
        is_critical: false,
        requires_photo: true,
        requires_gps: true,
        due_time: '08:30',
        sort_order: 3,
        weight: 1,
      },
      {
        id: 'i4',
        title: 'Organização de estoque seco',
        description: 'FIFO e etiquetas ok',
        is_critical: false,
        requires_photo: true,
        requires_gps: true,
        due_time: '09:00',
        sort_order: 4,
        weight: 1,
      },
    ],
    unit_ids: [
      '22222222-2222-2222-2222-222222222221',
      '22222222-2222-2222-2222-222222222222',
    ],
  },
  {
    id: 'cl2',
    name: 'Fechamento do Salão',
    description: 'Rotina de encerramento',
    shift: 'night' as const,
    recurrence: 'daily' as const,
    is_active: true,
    items: [
      {
        id: 'i5',
        title: 'Limpeza de mesas',
        is_critical: false,
        requires_photo: true,
        requires_gps: true,
        due_time: '22:00',
        sort_order: 1,
        weight: 1,
        description: '',
      },
      {
        id: 'i6',
        title: 'Fechamento de caixa',
        is_critical: true,
        requires_photo: true,
        requires_gps: true,
        due_time: '22:30',
        sort_order: 2,
        weight: 2,
        description: '',
      },
    ],
    unit_ids: ['22222222-2222-2222-2222-222222222221'],
  },
];

export const DEMO_TRAINING = [
  {
    id: 'tr1',
    title: 'Padrão de evidência fotográfica',
    description:
      'Como tirar fotos aceitas pela IA: boa iluminação, enquadramento do objeto, sem blur.',
    content_type: 'guide' as const,
    is_published: true,
  },
  {
    id: 'tr2',
    title: 'Checklist de segurança de gás',
    description: 'Passo a passo da conferência crítica de gás.',
    content_type: 'guide' as const,
    is_published: true,
  },
  {
    id: 'tr3',
    title: 'Temperatura e segurança alimentar',
    description: 'Faixas aceitáveis e registro correto das câmaras frias.',
    content_type: 'course' as const,
    is_published: true,
  },
];

export const DEMO_STOCK = [
  {
    product_id: '99999999-9999-9999-9999-999999999901',
    unit_id: '22222222-2222-2222-2222-222222222221',
    quantity: 10,
    products: {
      id: '99999999-9999-9999-9999-999999999901',
      name: 'Tomate',
      sku: 'TOM',
      average_cost: 4.5,
      min_stock: 5,
      category_id: { name: 'Hortifruti' },
      uom_id: { name: 'Quilograma', abbreviation: 'kg' },
    },
  },
  {
    product_id: '99999999-9999-9999-9999-999999999902',
    unit_id: '22222222-2222-2222-2222-222222222221',
    quantity: 8,
    products: {
      id: '99999999-9999-9999-9999-999999999902',
      name: 'Frango (peito)',
      sku: 'FRP',
      average_cost: 18,
      min_stock: 10,
      category_id: { name: 'Proteínas' },
      uom_id: { name: 'Quilograma', abbreviation: 'kg' },
    },
  },
  {
    product_id: '99999999-9999-9999-9999-999999999903',
    unit_id: '22222222-2222-2222-2222-222222222221',
    quantity: 2,
    products: {
      id: '99999999-9999-9999-9999-999999999903',
      name: 'Óleo de soja',
      sku: 'OLE',
      average_cost: 7,
      min_stock: 4,
      category_id: { name: 'Mercearia' },
      uom_id: { name: 'Unidade', abbreviation: 'un' },
    },
  },
];

export const DEMO_MOVEMENTS = [
  {
    id: 'mv1',
    movement_type: 'in',
    quantity: 10,
    unit_cost: 4.5,
    reason: 'via WhatsApp (dar_entrada)',
    source: 'whatsapp',
    created_at: new Date().toISOString(),
    unit_id: { name: 'Unidade Centro' },
    products: { id: '99999999-9999-9999-9999-999999999901', name: 'Tomate', uom_id: { abbreviation: 'kg' } },
    created_by: { full_name: 'Marcos Issa' },
  },
  {
    id: 'mv2',
    movement_type: 'out',
    quantity: 2,
    unit_cost: null,
    reason: 'Uso na cozinha',
    source: 'dashboard',
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    unit_id: { name: 'Unidade Centro' },
    products: { id: '99999999-9999-9999-9999-999999999901', name: 'Tomate', uom_id: { abbreviation: 'kg' } },
    created_by: { full_name: 'João Silva' },
  },
];

export const DEMO_CATEGORIES = [
  { id: '66666666-6666-6666-6666-666666666601', company_id: '11111111-1111-1111-1111-111111111111', name: 'Hortifruti', sort_order: 1 },
  { id: '66666666-6666-6666-6666-666666666602', company_id: '11111111-1111-1111-1111-111111111111', name: 'Proteínas', sort_order: 2 },
  { id: '66666666-6666-6666-6666-666666666603', company_id: '11111111-1111-1111-1111-111111111111', name: 'Mercearia', sort_order: 3 },
];

export const DEMO_UOM = [
  { id: '77777777-7777-7777-7777-777777777701', company_id: '11111111-1111-1111-1111-111111111111', name: 'Quilograma', abbreviation: 'kg', kind: 'weight', grams_factor: 1000 },
  { id: '77777777-7777-7777-7777-777777777702', company_id: '11111111-1111-1111-1111-111111111111', name: 'Grama', abbreviation: 'g', kind: 'weight', grams_factor: 1 },
  { id: '77777777-7777-7777-7777-777777777703', company_id: '11111111-1111-1111-1111-111111111111', name: 'Unidade', abbreviation: 'un', kind: 'unit', grams_factor: null },
  { id: '77777777-7777-7777-7777-777777777704', company_id: '11111111-1111-1111-1111-111111111111', name: 'Caixa', abbreviation: 'cx', kind: 'unit', grams_factor: null },
  { id: '77777777-7777-7777-7777-777777777705', company_id: '11111111-1111-1111-1111-111111111111', name: 'Litro', abbreviation: 'L', kind: 'volume', grams_factor: null },
];

const CHECKLISTS_KEY = 'concluiai_demo_checklists';
const UNITS_KEY = 'concluiai_demo_units';

export function loadDemoChecklists() {
  try {
    const raw = localStorage.getItem(CHECKLISTS_KEY);
    if (raw) return JSON.parse(raw) as typeof DEMO_CHECKLISTS;
  } catch {
    /* */
  }
  return structuredClone(DEMO_CHECKLISTS);
}

export function saveDemoChecklists(data: typeof DEMO_CHECKLISTS) {
  localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(data));
}

export function loadDemoUnits() {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    if (raw) return JSON.parse(raw) as typeof DEMO_UNITS;
  } catch {
    /* */
  }
  return structuredClone(DEMO_UNITS);
}

export function saveDemoUnits(data: typeof DEMO_UNITS) {
  localStorage.setItem(UNITS_KEY, JSON.stringify(data));
}
