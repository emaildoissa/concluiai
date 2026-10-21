import { useEffect, useState, useMemo } from 'react';
import type { ChecklistItem, Shift } from '@concluiai/shared';
import { RECURRENCE_LABELS, SHIFT_LABELS } from '@concluiai/shared';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import {
  loadDemoChecklists,
  loadDemoUnits,
  saveDemoChecklists,
} from '../../lib/demoData';
import { useAuth } from '../../lib/auth';

type Item = ChecklistItem;
type DemoChecklist = Omit<ReturnType<typeof loadDemoChecklists>[number], 'items'> & { items: Item[] };
type Checklist = DemoChecklist & { sector_id?: string | null };
interface UnitRow { id: string; name: string; address?: string }

const emptyItem = (order = 1): Item => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  is_critical: false,
  requires_photo: false,
  requires_gps: false,
  due_time: '09:00',
  sort_order: order,
  weight: 1,
  execution_mode: 'check',
  item_type: 'boolean',
  unit_of_measurement: null,
  min_value: null,
  max_value: null,
  alert_on_non_compliant: false,
});

const PRESET_TEMPLATES = [
  {
    category: 'Controle Térmico',
    label: 'Freezer (-18°C a -22°C)',
    title: 'Controle de Temperatura · Freezer 1',
    description: 'Checar visor digital do freezer de peixes/carnes. Registrar a temperatura observada no termômetro.',
    is_critical: false,
    due_time: '09:00',
    mode: 'numeric',
    item_type: 'numeric',
    unit_of_measurement: '°C',
    min_value: -22,
    max_value: -18,
  },
  {
    category: 'Controle Térmico',
    label: 'Geladeira (1°C a 4.5°C)',
    title: 'Controle de Temperatura · Geladeira Principal',
    description: 'Verificar termômetro interno do refrigerador de insumos e laticínios. Registrar valor aferido.',
    is_critical: false,
    due_time: '09:00',
    mode: 'numeric',
    item_type: 'numeric',
    unit_of_measurement: '°C',
    min_value: 1.0,
    max_value: 4.5,
  },
  {
    category: 'Qualidade / Sushi',
    label: 'pH do Arroz (4.1 a 4.5)',
    title: 'Aferição de pH do Arroz Temperado (Shari)',
    description: 'Inserir medidor de pH calibrado ou fita no centro da bacia de arroz de sushi. Registrar o índice de acidez.',
    is_critical: false,
    due_time: '11:00',
    mode: 'numeric',
    item_type: 'numeric',
    unit_of_measurement: 'pH',
    min_value: 4.1,
    max_value: 4.5,
  },
  {
    category: 'Segurança Alimentar',
    label: 'Óleo de Fritadeira (0% a 25%)',
    title: 'Saturação de Compostos Polares do Óleo',
    description: 'Medir porcentagem de degradação do óleo com fita ou medidor eletrônico. Se passar de 25%, descartar imediatamente.',
    is_critical: false,
    due_time: '16:00',
    mode: 'numeric',
    item_type: 'numeric',
    unit_of_measurement: '%',
    min_value: 0,
    max_value: 25,
  },
  {
    category: 'Distribuição Térmica',
    label: 'Buffet Quente (60°C a 90°C)',
    title: 'Temperatura da Pista Quente / Banho-Maria',
    description: 'Aferir temperatura dos alimentos servidos no buffet quente com termômetro espeto limpo.',
    is_critical: false,
    due_time: '12:00',
    mode: 'numeric',
    item_type: 'numeric',
    unit_of_measurement: '°C',
    min_value: 60,
    max_value: 90,
  },
  {
    category: 'Sanitização',
    label: 'Panela de Arroz / Cuba',
    title: 'Higienização da Panela de Arroz',
    description: 'Remover cuba interna, lavar com esponja não abrasiva e detergente neutro. Secar e limpar a carcaça externa. A foto deve registrar o fundo da cuba limpo, seco e sem crosta.',
    is_critical: false,
    due_time: '10:00',
    mode: 'photo',
    item_type: 'boolean',
    unit_of_measurement: null,
    min_value: null,
    max_value: null,
  },
  {
    category: 'Superfícies',
    label: 'Bancada de Inox',
    title: 'Sanitização da Bancada de Preparo',
    description: 'Aplicar álcool 70% ou solução clorada em toda a extensão da bancada de inox. A foto deve comprovar a bancada limpa, sem resíduos e desobstruída.',
    is_critical: false,
    due_time: '10:30',
    mode: 'photo',
    item_type: 'boolean',
    unit_of_measurement: null,
    min_value: null,
    max_value: null,
  },
  {
    category: 'Segurança',
    label: 'Válvula de Gás',
    title: 'Checagem de Válvulas de Gás e Registros',
    description: 'Verificar alinhamento e vedação dos registros de gás da cozinha. Confirmar ausência de vazamento ou odores atípicos.',
    is_critical: false,
    due_time: '08:30',
    mode: 'both',
    item_type: 'boolean',
    unit_of_measurement: null,
    min_value: null,
    max_value: null,
  },
  {
    category: 'Fechamento',
    label: 'Ralos e Lixeiras',
    title: 'Fechamento Sanitário de Ralos e Lixeiras',
    description: 'Desinfetar grelhas de ralos com cloro, recolher sacos de lixo e fechar tampas de contenção para evitar pragas.',
    is_critical: false,
    due_time: '23:00',
    mode: 'photo',
    item_type: 'boolean',
    unit_of_measurement: null,
    min_value: null,
    max_value: null,
  },
];

export function ChecklistBuilder() {
  const { demoMode } = useAuth();
  const [list, setList] = useState<Checklist[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [sectors, setSectors] = useState<UnitRow[]>([]);
  const [editing, setEditing] = useState<Checklist | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'items'>('items');
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filtros
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchChecklists = async () => {
    try {
      const data = await apiGet<{ checklists: Checklist[] }>('/api/checklists');
      if (data.checklists && data.checklists.length > 0) {
        setList(data.checklists);
      } else if (demoMode) {
        setList(loadDemoChecklists() as Checklist[]);
      } else {
        setList([]);
      }
    } catch {
      if (demoMode) {
        setList(loadDemoChecklists() as Checklist[]);
      } else {
        setList([]);
      }
    }
  };

  const fetchUnits = async () => {
    try {
      const data = await apiGet<{ units: UnitRow[] }>('/api/units');
      if (data.units && data.units.length > 0) {
        setUnits(data.units);
      } else if (demoMode) {
        setUnits(loadDemoUnits());
      } else {
        setUnits([]);
      }
    } catch {
      if (demoMode) {
        setUnits(loadDemoUnits());
      } else {
        setUnits([]);
      }
    }
  };

  const fetchSectors = async () => {
    try {
      const data = await apiGet<{ sectors: UnitRow[] }>('/api/sectors');
      setSectors(data.sectors || []);
    } catch {
      setSectors([]);
    }
  };

  const handleGenerateToday = async () => {
    setGenerating(true);
    setActionMsg(null);
    try {
      const res = await apiPost<{ count: number; date: string }>('/api/tasks/generate-today', {});
      setActionMsg({
        type: 'success',
        text: `Tarefas do dia geradas com sucesso para a data ${res.date} (${res.count} instâncias geradas/verificadas).`,
      });
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: `Erro ao gerar tarefas: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    void fetchChecklists();
    void fetchUnits();
    void fetchSectors();
  }, []);

  function startNew() {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      shift: 'morning',
      recurrence: 'daily',
      is_active: true,
      items: [emptyItem(1)],
      unit_ids: units.map((u) => u.id),
    });
    setActiveTab('info');
    setOpen(true);
  }

  function startEdit(cl: Checklist) {
    setEditing(structuredClone(cl));
    setActiveTab('items');
    setOpen(true);
  }

  function duplicateChecklist(cl: Checklist) {
    const clone = structuredClone(cl);
    clone.id = crypto.randomUUID();
    clone.name = `${cl.name} (Cópia)`;
    clone.items = clone.items.map((it) => ({ ...it, id: crypto.randomUUID() }));
    setEditing(clone);
    setActiveTab('info');
    setOpen(true);
  }

  async function save() {
    if (!editing?.name.trim() || saving) return;
    setSaving(true);
    const normalized: Checklist = {
      ...editing,
      items: editing.items
        .filter((i) => i.title.trim())
        .map((i, idx) => {
          const isNumeric =
            (i as any).item_type === 'numeric' ||
            (i as any).execution_mode === 'numeric' ||
            (i as any).unit_of_measurement != null ||
            (i as any).min_value != null ||
            (i as any).max_value != null;
          return {
            ...i,
            sort_order: idx + 1,
            execution_mode: isNumeric ? 'numeric' : (i.execution_mode || 'photo'),
            item_type: isNumeric ? 'numeric' : (i.item_type || 'boolean'),
            requires_photo: isNumeric ? false : Boolean(i.requires_photo),
            unit_of_measurement: isNumeric ? ((i as any).unit_of_measurement || '°C') : null,
            min_value: isNumeric && (i as any).min_value !== undefined && (i as any).min_value !== null && (i as any).min_value !== '' ? Number((i as any).min_value) : null,
            max_value: isNumeric && (i as any).max_value !== undefined && (i as any).max_value !== null && (i as any).max_value !== '' ? Number((i as any).max_value) : null,
            alert_on_non_compliant: isNumeric ? Boolean((i as any).alert_on_non_compliant) : false,
          };
        }),
    };

    if (demoMode) {
      const current = loadDemoChecklists();
      const existingIdx = current.findIndex((c) => c.id === normalized.id);
      let updated: Checklist[];
      if (existingIdx >= 0) {
        updated = current.map((c, i) => (i === existingIdx ? normalized : (c as Checklist)));
      } else {
        updated = [normalized, ...(current as Checklist[])];
      }
      saveDemoChecklists(updated as any);
      setList(updated);
      setOpen(false);
      setEditing(null);
      setSaving(false);
      return;
    }

    try {
      await apiPost('/api/checklists', normalized);
      await apiPost('/api/tasks/generate-today', {});
      await fetchChecklists();
      setOpen(false);
      setEditing(null);
    } catch (err) {
      console.error('Erro ao salvar no Supabase', err);
      alert(`Falha ao salvar checklist: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover este checklist operacional?')) return;
    if (demoMode) {
      const current = loadDemoChecklists();
      const updated = current.filter((c) => c.id !== id);
      saveDemoChecklists(updated as any);
      setList(updated as Checklist[]);
      return;
    }
    try {
      await apiDelete(`/api/checklists/${id}`);
      await fetchChecklists();
    } catch (err) {
      console.error('Erro ao remover checklist', err);
      alert(`Falha ao remover checklist: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function updateItem(idx: number, patch: Partial<Item>) {
    if (!editing) return;
    const items = editing.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setEditing({ ...editing, items });
  }

  function moveItem(idx: number, direction: 'up' | 'down') {
    if (!editing) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= editing.items.length) return;

    const newItems = [...editing.items];
    const [moved] = newItems.splice(idx, 1);
    newItems.splice(targetIdx, 0, moved);
    setEditing({ ...editing, items: newItems });
  }

  function applyTemplate(idx: number, t: (typeof PRESET_TEMPLATES)[number]) {
    updateItem(idx, {
      title: t.title,
      description: t.description,
      is_critical: t.is_critical,
      due_time: t.due_time,
      execution_mode: t.mode,
      requires_photo: t.mode === 'photo' || t.mode === 'both',
      item_type: (t as any).item_type || (t.mode === 'numeric' ? 'numeric' : 'boolean'),
      unit_of_measurement: (t as any).unit_of_measurement ?? null,
      min_value: (t as any).min_value ?? null,
      max_value: (t as any).max_value ?? null,
      alert_on_non_compliant: false,
    } as any);
  }

  function autoEnrichDirective(idx: number) {
    if (!editing) return;
    const item = editing.items[idx];
    if (!item?.title) return;

    const titleLower = item.title.toLowerCase();
    let enriched = '';

    if (titleLower.includes('temperatura') || titleLower.includes('freezer') || titleLower.includes('geladeira')) {
      enriched = 'Verificar display digital do equipamento. Faixa obrigatória de operação. A foto deve enquadrar nitidamente o visor com os números de temperatura legíveis.';
    } else if (titleLower.includes('arroz') || titleLower.includes('panela')) {
      enriched = 'Higienizar cuba interna com esponja e detergente neutro. Secar e limpar a parte externa. A foto deve registrar o fundo da cuba limpo, seco e sem resíduos.';
    } else if (titleLower.includes('coifa') || titleLower.includes('fogão') || titleLower.includes('queimador')) {
      enriched = 'Remover filtros, desengordurar com desincrustante e limpar os queimadores do fogão. A foto deve enquadrar a estrutura de inox limpa e sem acúmulo de gordura.';
    } else if (titleLower.includes('bancada') || titleLower.includes('mesa') || titleLower.includes('inox')) {
      enriched = 'Higienizar superfícies de contato com sanitizante regulamentar. A foto deve comprovar a bancada limpa, desobstruída de utensílios e pronta para operação.';
    } else {
      enriched = `Executar procedimento operacional padrão de "${item.title}". A foto comprobatória deve registrar o resultado final com boa iluminação e nitidez.`;
    }

    updateItem(idx, { description: enriched });
  }

  // Filtragem de Checklists
  const filteredList = useMemo(() => {
    return list.filter((cl) => {
      if (shiftFilter !== 'all' && cl.shift !== shiftFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = cl.name.toLowerCase().includes(q);
        const matchItem = cl.items.some((it) => it.title.toLowerCase().includes(q));
        if (!matchName && !matchItem) return false;
      }
      return true;
    });
  }, [list, shiftFilter, searchQuery]);

  return (
    <div className="sop-builder-wrap">
      {/* Barra de Título & Ações Principais */}
      <div className="sop-top-bar">
        <div className="sop-title-block">
          <h2>Protocolos Operacionais & Checklists (SOP)</h2>
          <p>Configure rotinas de abertura, produção e fechamento com critérios de validação por IA para a rede.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleGenerateToday}
            disabled={generating}
            title="Gerar as instâncias de tarefas para o dia atual baseado nos checklists ativos"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '0.4rem', verticalAlign: 'middle' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {generating ? 'Gerando...' : 'Gerar Tarefas do Dia'}
          </button>

          <button type="button" className="btn btn-primary" onClick={startNew}>
            + Novo Procedimento
          </button>
        </div>
      </div>

      {/* Notificação de Feedback */}
      {actionMsg && (
        <div className={`notice ${actionMsg.type === 'error' ? 'warn' : 'success'}`} style={{ marginBottom: '1rem' }}>
          {actionMsg.text}
        </div>
      )}

      {/* Linha de Filtros por Turno & Busca */}
      <div className="sop-controls-row">
        <div className="sop-shift-tabs">
          <button
            type="button"
            className={`sop-tab-btn ${shiftFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setShiftFilter('all')}
          >
            Todos ({list.length})
          </button>
          <button
            type="button"
            className={`sop-tab-btn ${shiftFilter === 'morning' ? 'is-active' : ''}`}
            onClick={() => setShiftFilter('morning')}
          >
            Abertura / Manhã
          </button>
          <button
            type="button"
            className={`sop-tab-btn ${shiftFilter === 'afternoon' ? 'is-active' : ''}`}
            onClick={() => setShiftFilter('afternoon')}
          >
            Turno / Tarde
          </button>
          <button
            type="button"
            className={`sop-tab-btn ${shiftFilter === 'night' ? 'is-active' : ''}`}
            onClick={() => setShiftFilter('night')}
          >
            Fechamento / Noite
          </button>
        </div>

        <input
          type="text"
          className="sop-search-box"
          placeholder="Buscar protocolo ou tarefa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Grid de Checklists Operacionais */}
      {filteredList.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div className="muted">Nenhum protocolo operacional encontrado para os filtros selecionados.</div>
        </div>
      ) : (
        <div className="sop-grid">
          {filteredList.map((cl) => {
            const criticalCount = cl.items.filter((i) => i.is_critical).length;
            const photoCount = cl.items.filter((i) => i.requires_photo).length;
            const unitCount = cl.unit_ids ? cl.unit_ids.length : units.length;

            return (
              <div className="sop-card" key={cl.id}>
                <div>
                  <div className="sop-card-header">
                    <div className="sop-card-meta-row">
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="sop-pill-shift">
                          {SHIFT_LABELS[cl.shift as Shift] || cl.shift}
                        </span>
                        <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          · {RECURRENCE_LABELS[cl.recurrence] || cl.recurrence}
                        </span>
                      </div>
                      <span className={`badge ${cl.is_active ? 'badge-completed' : 'badge-pending'}`}>
                        {cl.is_active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>

                    <h3 className="sop-card-title">{cl.name}</h3>
                    {cl.description && <p className="sop-card-desc">{cl.description}</p>}
                  </div>

                  {/* Resumo Estatístico do Card */}
                  <div className="sop-card-stats">
                    <span className="sop-stat-badge">
                      <strong>{cl.items.length}</strong> {cl.items.length === 1 ? 'tarefa' : 'tarefas'}
                    </span>
                    <span>·</span>
                    <span className="sop-stat-badge" style={{ color: criticalCount > 0 ? '#f43f5e' : '#94a3b8' }}>
                      <strong>{criticalCount}</strong> críticas
                    </span>
                    <span>·</span>
                    <span className="sop-stat-badge">
                      <strong>{photoCount}</strong> fotos IA
                    </span>
                    <span>·</span>
                    <span className="sop-stat-badge">
                      <strong>{unitCount}</strong> {unitCount === 1 ? 'loja' : 'lojas'}
                    </span>
                  </div>

                  {/* Lista de Prévia das Tarefas */}
                  <div className="sop-items-preview">
                    {cl.items.map((it, idx) => (
                      <div className="sop-preview-item" key={it.id || idx}>
                        <div className="sop-preview-left">
                          <span className="sop-preview-name">
                            {it.title}
                            {it.is_critical && (
                              <span style={{ color: '#f43f5e', marginLeft: 4, fontWeight: 700, fontSize: '0.72rem' }}>
                                (Crítica)
                              </span>
                            )}
                          </span>
                          {it.description && (
                            <span className="sop-preview-directive" title={it.description}>
                              {it.description}
                            </span>
                          )}
                        </div>
                        {it.due_time && <span className="sop-preview-time">{it.due_time}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="sop-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => duplicateChecklist(cl)}
                    title="Criar cópia deste protocolo"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => startEdit(cl)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => remove(cl.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Construção do Checklist (Dual-Tab SOP Engine) */}
      {open && editing && (
        <div className="modal-backdrop" onClick={() => { if (!saving) setOpen(false); }}>
          <div className="sop-modal-shell" onClick={(e) => e.stopPropagation()}>
            <div className="sop-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div className="sop-modal-header-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="m9 14 2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                    {list.some((c) => c.id === editing.id) ? 'Editar Protocolo Operacional' : 'Novo Protocolo Operacional'}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                    {editing.name || 'Definição de diretrizes e processos operacionais'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn-close-modal"
                onClick={() => { if (!saving) setOpen(false); }}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  width: '32px',
                  height: '32px',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.15s ease'
                }}
              >
                ✕
              </button>
            </div>

            {/* Abas do Editor */}
            <div className="sop-modal-nav-tabs">
              <button
                type="button"
                className={`sop-modal-tab-btn ${activeTab === 'info' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('info')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>1. Parâmetros & Unidades</span>
                <span className="sop-tab-badge">{editing.unit_ids.length} un.</span>
              </button>
              <button
                type="button"
                className={`sop-modal-tab-btn ${activeTab === 'items' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('items')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  <line x1="9" y1="12" x2="15" y2="12"></line>
                  <line x1="9" y1="16" x2="13" y2="16"></line>
                </svg>
                <span>2. Roteiro & Diretrizes IA</span>
                <span className="sop-tab-badge">{editing.items.length} itens</span>
              </button>
            </div>

            <div className="sop-modal-body">
              {activeTab === 'info' ? (
                /* Aba 1: Dados Gerais & Seleção de Unidades */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                  <div className="field">
                    <label style={{ fontWeight: 700 }}>Nome do Protocolo / Checklist</label>
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Ex: Abertura de Cozinha & Controle Térmico"
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 700 }}>Descrição Geral do Turno</label>
                    <textarea
                      rows={2}
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      placeholder="Orientações e responsabilidades gerais da equipe..."
                    />
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label style={{ fontWeight: 700 }}>Turno Operacional</label>
                      <select
                        value={editing.shift}
                        onChange={(e) =>
                          setEditing({ ...editing, shift: e.target.value as Checklist['shift'] })
                        }
                      >
                        {Object.entries(SHIFT_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label style={{ fontWeight: 700 }}>Recorrência</label>
                      <select
                        value={editing.recurrence}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            recurrence: e.target.value as Checklist['recurrence'],
                          })
                        }
                      >
                        <option value="daily">Diária</option>
                        <option value="weekly">Semanal</option>
                        <option value="once">Única / Específica</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 700 }}>Setor Responsável (Opcional)</label>
                    <select
                      value={editing.sector_id || ''}
                      onChange={(e) =>
                        setEditing({ ...editing, sector_id: e.target.value || null })
                      }
                    >
                      <option value="">— Rotativo Geral da Loja —</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontWeight: 700 }}>Unidades Vinculadas</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                          onClick={() => setEditing({ ...editing, unit_ids: units.map((u) => u.id) })}
                        >
                          Selecionar Todas
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                          onClick={() => setEditing({ ...editing, unit_ids: [] })}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    <div className="sop-units-selection-grid">
                      {units.map((u) => {
                        const isSelected = editing.unit_ids.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`sop-unit-check-card ${isSelected ? 'is-selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const unit_ids = e.target.checked
                                  ? [...editing.unit_ids, u.id]
                                  : editing.unit_ids.filter((id) => id !== u.id);
                                setEditing({ ...editing, unit_ids });
                              }}
                            />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
                              {u.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Aba 2: Itens e Diretrizes Operacionais (SOP) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      Defina os passos operacionais em ordem cronológica de execução.
                    </span>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          items: [...editing.items, emptyItem(editing.items.length + 1)],
                        })
                      }
                    >
                      + Adicionar Tarefa
                    </button>
                  </div>

                  {editing.items.map((it, idx) => {
                    const isNumeric =
                      (it as any).item_type === 'numeric' ||
                      (it as any).execution_mode === 'numeric' ||
                      (it as any).unit_of_measurement != null ||
                      (it as any).min_value != null ||
                      (it as any).max_value != null;
                    const isPhoto = !isNumeric && ((it as any).execution_mode === 'photo' || (it as any).execution_mode === 'both' || (it as any).requires_photo === true);
                    const isCheck = !isNumeric && !isPhoto;

                    return (
                      <div
                        className={`sop-item-card ${it.is_critical ? 'is-critical-item' : ''}`}
                        key={it.id || idx}
                      >
                      {/* Faixa Superior do Item */}
                      <div className="sop-item-header-strip">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="sop-item-idx-badge">Passo #{idx + 1}</span>
                          <div className="sop-item-order-btns">
                            <button
                              type="button"
                              className="sop-btn-order"
                              onClick={() => moveItem(idx, 'up')}
                              disabled={idx === 0}
                              title="Mover para cima"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="sop-btn-order"
                              onClick={() => moveItem(idx, 'down')}
                              disabled={idx === editing.items.length - 1}
                              title="Mover para baixo"
                            >
                              ▼
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            style={{
                              fontSize: '0.78rem',
                              padding: '4px 10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.14)',
                              borderRadius: '8px',
                              color: '#cbd5e1',
                              cursor: 'pointer',
                            }}
                            defaultValue=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              const tpl = PRESET_TEMPLATES.find((p) => p.label === val);
                              if (tpl) applyTemplate(idx, tpl);
                              e.target.value = '';
                            }}
                          >
                            <option value="" disabled>Carregar Modelo Pré-definido...</option>
                            {PRESET_TEMPLATES.map((tpl) => (
                              <option key={tpl.label} value={tpl.label}>
                                {tpl.label} ({tpl.category})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Título da Tarefa */}
                      <div className="field">
                        <label style={{ fontWeight: 700 }}>Título da Tarefa</label>
                        <input
                          value={it.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            const lower = val.toLowerCase();
                            const isThermal =
                              lower.includes('refrigerador') ||
                              lower.includes('geladeira') ||
                              lower.includes('freezer') ||
                              lower.includes('temperatura');
                            const isSushi = lower.includes('ph') || lower.includes('arroz') || lower.includes('shari');
                            const isOil = lower.includes('óleo') || lower.includes('oleo') || lower.includes('fritadeira');

                            const updates: any = { title: val };
                            if ((it as any).item_type !== 'numeric' && (isThermal || isSushi || isOil)) {
                              updates.item_type = 'numeric';
                              updates.execution_mode = 'numeric';
                              updates.requires_photo = false;
                              if (isThermal) {
                                updates.unit_of_measurement = '°C';
                                updates.min_value = lower.includes('freezer') ? -22 : 1.0;
                                updates.max_value = lower.includes('freezer') ? -18 : 4.5;
                              } else if (isSushi) {
                                updates.unit_of_measurement = 'pH';
                                updates.min_value = 4.1;
                                updates.max_value = 4.5;
                              } else if (isOil) {
                                updates.unit_of_measurement = '%';
                                updates.min_value = 0;
                                updates.max_value = 25;
                              }
                            }
                            updateItem(idx, updates);
                          }}
                          placeholder="Ex: Higienização da Panela de Arroz ou Temperatura do Refrigerador"
                        />
                      </div>

                      {/* Seletor Visual de Tipo de Verificação */}
                      <div>
                        <label style={{ fontWeight: 700, fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                          Tipo de Verificação da Tarefa:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${isNumeric ? 'btn-primary' : 'btn-ghost'}`}
                            style={{
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              padding: '8px 12px',
                              gap: '6px',
                              border: isNumeric ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                            }}
                            onClick={() => {
                              updateItem(idx, {
                                execution_mode: 'numeric',
                                item_type: 'numeric',
                                requires_photo: false,
                                unit_of_measurement: (it as any).unit_of_measurement || '°C',
                              } as any);
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                            </svg>
                            <span>Medição (Temperatura, pH, etc)</span>
                          </button>

                          <button
                            type="button"
                            className={`btn btn-sm ${isPhoto ? 'btn-primary' : 'btn-ghost'}`}
                            style={{
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                              padding: '8px 12px',
                              gap: '6px',
                              border: isPhoto ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                            }}
                            onClick={() => {
                              updateItem(idx, {
                                execution_mode: 'photo',
                                item_type: 'boolean',
                                requires_photo: true,
                              } as any);
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                              <circle cx="12" cy="13" r="4"/>
                            </svg>
                            <span>Foto Obrigatória (IA)</span>
                          </button>

                          <button
                            type="button"
                            className={`btn btn-sm ${isCheck ? 'btn-primary' : 'btn-ghost'}`}
                            style={{
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                              padding: '8px 12px',
                              gap: '6px',
                              border: isCheck ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                            }}
                            onClick={() => {
                              updateItem(idx, {
                                execution_mode: 'check',
                                item_type: 'boolean',
                                requires_photo: false,
                              } as any);
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 11 12 14 22 4"/>
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                            </svg>
                            <span>Confirmação Simples</span>
                          </button>
                        </div>
                      </div>

                      {/* Configuração Específica de Medição Quantitativa (Revelação Progressiva) */}
                      {isNumeric && (
                        <div
                          style={{
                            background: 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid rgba(129, 140, 248, 0.25)',
                            borderRadius: 10,
                            padding: '12px 14px',
                            marginBottom: 4,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              Parâmetros de Validação Numérica em Tempo Real
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {['°C', 'pH', '%', 'bar'].map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => updateItem(idx, { unit_of_measurement: u } as any)}
                                  className="sop-chip-btn"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 8px',
                                    background: (it as any).unit_of_measurement === u ? '#6366f1' : 'rgba(255,255,255,0.06)',
                                    color: (it as any).unit_of_measurement === u ? '#fff' : '#cbd5e1',
                                  }}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="field-row" style={{ marginBottom: 8 }}>
                            <div className="field">
                              <label style={{ fontSize: '0.78rem' }}>Unidade de Medida</label>
                              <input
                                placeholder="ex: °C, pH, %, bar, kg"
                                value={(it as any).unit_of_measurement || ''}
                                onChange={(e) => updateItem(idx, { unit_of_measurement: e.target.value } as any)}
                                style={{ fontSize: '0.82rem' }}
                              />
                            </div>
                            <div className="field">
                              <label style={{ fontSize: '0.78rem' }}>Limite Mínimo Aceitável</label>
                              <input
                                type="number"
                                step="any"
                                placeholder="ex: 1.0 (ou vazio)"
                                value={(it as any).min_value ?? ''}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    min_value: e.target.value === '' ? null : Number(e.target.value),
                                  } as any)
                                }
                                style={{ fontSize: '0.82rem' }}
                              />
                            </div>
                            <div className="field">
                              <label style={{ fontSize: '0.78rem' }}>Limite Máximo Aceitável</label>
                              <input
                                type="number"
                                step="any"
                                placeholder="ex: 4.5 (ou vazio)"
                                value={(it as any).max_value ?? ''}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    max_value: e.target.value === '' ? null : Number(e.target.value),
                                  } as any)
                                }
                                style={{ fontSize: '0.82rem' }}
                              />
                            </div>
                          </div>

                          <label className="checkbox" style={{ fontSize: '0.82rem', color: '#e2e8f0', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={(it as any).alert_on_non_compliant ?? false}
                              onChange={(e) => updateItem(idx, { alert_on_non_compliant: e.target.checked } as any)}
                            />
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                            <span>Disparar alerta imediato no WhatsApp dos gerentes se o valor aferido estiver fora da faixa</span>
                          </label>
                        </div>
                      )}

                      {/* Diretriz Operacional & Critério de Validação da IA */}
                      <div className="field">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ fontWeight: 700, margin: 0 }}>
                            Diretriz Operacional & O Que Fazer
                          </label>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '4px 10px',
                              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                              border: '1px solid rgba(129, 140, 248, 0.35)',
                              borderRadius: '8px',
                              color: '#c7d2fe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={() => autoEnrichDirective(idx)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            <span>Gerar Diretriz com IA</span>
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={it.description || ''}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Instruções claras para o funcionário na cozinha e critérios de auditoria para a IA..."
                          style={{ fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* Horário e Peso */}
                      <div className="field-row">
                        <div className="field">
                          <label>Horário Limite (Prazo)</label>
                          <input
                            type="time"
                            value={it.due_time || ''}
                            onChange={(e) => updateItem(idx, { due_time: e.target.value })}
                          />
                        </div>

                        <div className="field">
                          <label>Peso no Score (1-5)</label>
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={it.weight}
                            onChange={(e) => updateItem(idx, { weight: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      {/* Toggles Crítico / GPS / Excluir */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                          <label className="checkbox" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(it.is_critical)}
                              onChange={(e) => updateItem(idx, { is_critical: e.target.checked })}
                            />
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                              <line x1="12" y1="9" x2="12" y2="13"/>
                              <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <span>Tarefa Crítica (Alerta WhatsApp e maior peso)</span>
                          </label>

                          <label className="checkbox" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(it.requires_gps)}
                              onChange={(e) => updateItem(idx, { requires_gps: e.target.checked })}
                            />
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10"/>
                              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
                            </svg>
                            <span>Validação por GPS</span>
                          </label>
                        </div>

                        {editing.items.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: '#f43f5e', fontSize: '0.78rem' }}
                            onClick={() =>
                              setEditing({
                                ...editing,
                                items: editing.items.filter((_, i) => i !== idx),
                              })
                            }
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="sop-modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { if (!saving) setOpen(false); }}
                disabled={saving}
              >
                Cancelar
              </button>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {activeTab === 'info' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveTab('items')}
                  >
                    Avançar para Itens →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveTab('info')}
                  >
                    ← Parâmetros
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Protocolo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
