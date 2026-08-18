import { useEffect, useState, useMemo } from 'react';
import type { Shift } from '@concluiai/shared';
import { RECURRENCE_LABELS, SHIFT_LABELS } from '@concluiai/shared';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import {
  loadDemoChecklists,
  loadDemoUnits,
} from '../../lib/demoData';
import { useAuth } from '../../lib/auth';

type DemoChecklist = ReturnType<typeof loadDemoChecklists>[number];
type Checklist = DemoChecklist & { sector_id?: string | null };
type Item = Checklist['items'][number];
interface UnitRow { id: string; name: string; address?: string }

const emptyItem = (order = 1): Item => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  is_critical: false,
  requires_photo: true,
  requires_gps: true,
  due_time: '09:00',
  sort_order: order,
  weight: 1,
});

const PRESET_TEMPLATES = [
  {
    category: 'Controle Térmico',
    label: 'Freezer / Refrigeração',
    title: 'Controle de Temperatura do Freezer 1',
    description: 'Checar display digital do freezer. Faixa regulamentar: entre -18°C e -22°C. A foto deve enquadrar nitidamente o visor digital indicando a temperatura atual.',
    is_critical: true,
    due_time: '09:00',
    mode: 'photo',
  },
  {
    category: 'Sanitização',
    label: 'Panela de Arroz / Cuba',
    title: 'Higienização da Panela de Arroz',
    description: 'Remover cuba interna, lavar com esponja não abrasiva e detergente neutro. Secar e limpar a carcaça externa. A foto deve registrar o fundo da cuba limpo, seco e sem crosta.',
    is_critical: true,
    due_time: '10:00',
    mode: 'photo',
  },
  {
    category: 'Superfícies',
    label: 'Bancada de Inox',
    title: 'Sanitização da Bancada de Preparo',
    description: 'Aplicar álcool 70% ou solução clorada em toda a extensão da bancada de inox. A foto deve comprovar a bancada limpa, sem resíduos e desobstruída.',
    is_critical: false,
    due_time: '10:30',
    mode: 'photo',
  },
  {
    category: 'Segurança',
    label: 'Válvula de Gás',
    title: 'Checagem de Válvulas de Gás e Registros',
    description: 'Verificar alinhamento e vedação dos registros de gás da cozinha. Confirmar ausência de vazamento ou odores atípicos.',
    is_critical: true,
    due_time: '08:30',
    mode: 'both',
  },
  {
    category: 'Fechamento',
    label: 'Ralos e Lixeiras',
    title: 'Fechamento Sanitário de Ralos e Lixeiras',
    description: 'Desinfetar grelhas de ralos com cloro, recolher sacos de lixo e fechar tampas de contenção para evitar pragas.',
    is_critical: true,
    due_time: '23:00',
    mode: 'photo',
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
        setList(loadDemoChecklists());
      } else {
        setList([]);
      }
    } catch {
      if (demoMode) {
        setList(loadDemoChecklists());
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
    const normalized = {
      ...editing,
      items: editing.items
        .filter((i) => i.title.trim())
        .map((i, idx) => ({ ...i, sort_order: idx + 1 })),
    };

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
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  {list.some((c) => c.id === editing.id) ? 'Editar Protocolo Operacional' : 'Novo Protocolo Operacional'}
                </h3>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {editing.name || 'Definição de diretrizes operacionais'}
                </span>
              </div>

              <button
                type="button"
                className="btn-close-modal"
                onClick={() => { if (!saving) setOpen(false); }}
                style={{ fontSize: '1.2rem' }}
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
                1. Parâmetros & Unidades ({editing.unit_ids.length} selecionadas)
              </button>
              <button
                type="button"
                className={`sop-modal-tab-btn ${activeTab === 'items' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('items')}
              >
                2. Roteiro & Diretrizes IA ({editing.items.length} itens)
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

                  {editing.items.map((it, idx) => (
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

                        <div className="sop-preset-chips">
                          <span className="muted" style={{ fontSize: '0.72rem', marginRight: 4 }}>
                            Modelos:
                          </span>
                          {PRESET_TEMPLATES.map((tpl) => (
                            <button
                              key={tpl.label}
                              type="button"
                              className="sop-chip-btn"
                              onClick={() => applyTemplate(idx, tpl)}
                              title={tpl.description}
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Título da Tarefa */}
                      <div className="field">
                        <label style={{ fontWeight: 700 }}>Título da Tarefa</label>
                        <input
                          value={it.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                          placeholder="Ex: Higienização da Panela de Arroz ou Freezer 1"
                        />
                      </div>

                      {/* Diretriz Operacional & Critério de Validação da IA */}
                      <div className="field">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ fontWeight: 700, margin: 0 }}>
                            Diretriz Operacional & O Que Fazer
                          </label>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#818cf8' }}
                            onClick={() => autoEnrichDirective(idx)}
                          >
                            ⚡ Gerar Diretriz com IA
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

                      {/* Horário, Peso e Modo */}
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

                        <div className="field">
                          <label>Tipo de Evidência</label>
                          <select
                            value={(it as any).execution_mode ?? 'photo'}
                            onChange={(e) => {
                              const mode = e.target.value;
                              updateItem(idx, {
                                execution_mode: mode,
                                requires_photo: mode === 'photo' || mode === 'both',
                              } as any);
                            }}
                          >
                            <option value="photo">Foto Obrigatória (Auditoria IA)</option>
                            <option value="check">Confirmação Simples (Check)</option>
                            <option value="both">Check + Foto Opcional</option>
                          </select>
                        </div>
                      </div>

                      {/* Toggles Crítico / GPS / Excluir */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          <label className="checkbox" style={{ fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={it.is_critical}
                              onChange={(e) => updateItem(idx, { is_critical: e.target.checked })}
                            />
                            Tarefa Crítica (Alerta WhatsApp e maior peso)
                          </label>

                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={it.requires_gps}
                              onChange={(e) => updateItem(idx, { requires_gps: e.target.checked })}
                            />
                            Validação por GPS
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
                  ))}
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
