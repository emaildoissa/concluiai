import { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { loadDemoUnits, DEMO_UNITS } from '../../lib/demoData';

type Unit = (typeof DEMO_UNITS)[number] & { operation_days?: number[] | null; closed_today?: boolean };

const DAYS = [
  { v: 0, label: 'Dom', short: 'D' },
  { v: 1, label: 'Seg', short: 'S' },
  { v: 2, label: 'Ter', short: 'T' },
  { v: 3, label: 'Qua', short: 'Q' },
  { v: 4, label: 'Qui', short: 'Q' },
  { v: 5, label: 'Sex', short: 'S' },
  { v: 6, label: 'Sáb', short: 'S' },
];

function allDays(): number[] {
  return DAYS.map((d) => d.v);
}

function getActiveDays(days: number[] | null | undefined): number[] {
  if (days === null || days === undefined) return allDays();
  return days;
}

function isTodayClosed(u: Unit): boolean {
  if (u.operation_days === undefined || u.operation_days === null) return false;
  if (Array.isArray(u.operation_days) && u.operation_days.length === 0) return true;
  const today = new Date().getDay();
  return !u.operation_days.includes(today);
}

function getScheduleSummary(days: number[] | null | undefined): string {
  const active = getActiveDays(days);
  if (active.length === 7) return 'Operação todos os dias (7/7)';
  if (active.length === 0) return 'Unidade sem expediente configurado';
  if (active.length === 5 && active.every((d) => [1, 2, 3, 4, 5].includes(d))) return 'Segunda a Sexta (5/7)';
  if (active.length === 2 && active.every((d) => [0, 6].includes(d))) return 'Finais de semana (Sáb e Dom)';
  const names = DAYS.filter((d) => active.includes(d.v)).map((d) => d.label);
  return `Dias ativos: ${names.join(', ')}`;
}

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'open_today' | 'inactive'>('all');

  // Form states (Nova unidade)
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [operationDays, setOperationDays] = useState<number[] | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  // Edit Modal states
  const [editing, setEditing] = useState<Unit | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editOperationDays, setEditOperationDays] = useState<number[] | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchUnits = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ units: Unit[] }>('/api/units');
      if (data.units && data.units.length > 0) {
        setUnits(data.units);
      } else {
        setUnits(loadDemoUnits());
      }
    } catch {
      setUnits(loadDemoUnits());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUnits();
  }, []);

  // Preset helpers
  const applyPreset = (type: 'all' | 'weekdays' | 'weekend') => {
    if (type === 'all') setOperationDays(null);
    else if (type === 'weekdays') setOperationDays([1, 2, 3, 4, 5]);
    else if (type === 'weekend') setOperationDays([0, 6]);
  };

  const applyEditPreset = (type: 'all' | 'weekdays' | 'weekend') => {
    if (type === 'all') setEditOperationDays(null);
    else if (type === 'weekdays') setEditOperationDays([1, 2, 3, 4, 5]);
    else if (type === 'weekend') setEditOperationDays([0, 6]);
  };

  function toggleDay(v: number) {
    setOperationDays((prev) => {
      const current = getActiveDays(prev);
      const has = current.includes(v);
      const next = has ? current.filter((d) => d !== v) : [...current, v].sort((a, b) => a - b);
      return next.length === 7 ? null : next;
    });
  }

  function toggleEditDay(v: number) {
    setEditOperationDays((prev) => {
      const current = getActiveDays(prev);
      const has = current.includes(v);
      const next = has ? current.filter((d) => d !== v) : [...current, v].sort((a, b) => a - b);
      return next.length === 7 ? null : next;
    });
  }

  function openEdit(u: Unit) {
    setEditing(u);
    setEditName(u.name);
    setEditAddress(u.address || '');
    setEditOperationDays(u.operation_days ?? null);
  }

  function closeEdit() {
    setEditing(null);
    setSavingEdit(false);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    setSavingEdit(true);
    const payload = {
      id: editing.id,
      name: editName.trim(),
      address: editAddress.trim() || '—',
      operation_days: editOperationDays,
      is_active: editing.is_active,
    };
    try {
      await apiPost('/api/units', payload);
      setMsg({ type: 'ok', text: `Unidade "${editName.trim()}" atualizada com sucesso.` });
      closeEdit();
      await fetchUnits();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao salvar: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingEdit(false);
    }
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingNew(true);
    const payload = {
      name: name.trim(),
      address: address.trim() || '—',
      operation_days: operationDays,
      is_active: true,
    };
    try {
      await apiPost('/api/units', payload);
      setMsg({ type: 'ok', text: `Unidade "${name.trim()}" cadastrada com sucesso.` });
      setName('');
      setAddress('');
      setOperationDays(null);
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao adicionar unidade', err);
      setMsg({ type: 'err', text: `Falha ao cadastrar: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingNew(false);
    }
  }

  async function toggle(u: Unit) {
    try {
      await apiPost('/api/units', { ...u, is_active: !u.is_active });
      setMsg({
        type: 'ok',
        text: `Unidade "${u.name}" ${!u.is_active ? 'ativada' : 'desativada'} com sucesso.`,
      });
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao alterar status da unidade', err);
      setMsg({ type: 'err', text: `Falha ao alterar unidade: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async function remove(id: string, unitName: string) {
    if (!confirm(`Remover a unidade "${unitName}" permanentemente da rede?`)) return;
    try {
      await apiDelete(`/api/units/${id}`);
      setMsg({ type: 'ok', text: `Unidade "${unitName}" removida da rede.` });
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao remover unidade', err);
      setMsg({ type: 'err', text: `Falha ao remover unidade: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // KPIs
  const totalCount = units.length;
  const activeCount = units.filter((u) => u.is_active).length;
  const openTodayCount = units.filter((u) => u.is_active && !isTodayClosed(u)).length;
  const avgScore = useMemo(() => {
    const scored = units.filter((u) => u.is_active && u.score_total != null);
    if (scored.length === 0) return null;
    const sum = scored.reduce((acc, u) => acc + (u.score_total ?? 0), 0);
    return Math.round((sum / scored.length) * 10) / 10;
  }, [units]);

  // Filtered List
  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.address && u.address.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;

      if (filter === 'active') return u.is_active;
      if (filter === 'inactive') return !u.is_active;
      if (filter === 'open_today') return u.is_active && !isTodayClosed(u);
      return true;
    });
  }, [units, search, filter]);

  return (
    <div className="units-page-wrap">
      {/* Header com Visão Executiva e Métricas */}
      <div className="units-header-bar">
        <div className="units-title-row">
          <div>
            <h2 className="units-main-title">Gestão Multiloja</h2>
            <p className="units-main-sub">
              Cadastro, escala de funcionamento semanal e auditoria de unidades da rede.
            </p>
          </div>
        </div>

        <div className="units-kpi-grid">
          <div className="units-kpi-card">
            <div className="units-kpi-icon teal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01" />
                <path d="M16 6h.01" />
                <path d="M8 10h.01" />
                <path d="M16 10h.01" />
                <path d="M8 14h.01" />
                <path d="M16 14h.01" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{totalCount}</span>
              <span className="units-kpi-label">Unidades na Rede</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{activeCount}</span>
              <span className="units-kpi-label">Unidades Ativas</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{openTodayCount}</span>
              <span className="units-kpi-label">Em Operação Hoje</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon emerald">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{avgScore !== null ? `${avgScore}%` : '—'}</span>
              <span className="units-kpi-label">Média P·E·Q da Rede</span>
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`notice ${msg.type === 'ok' ? '' : ''}`}
          style={{
            borderColor: msg.type === 'ok' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(244, 63, 94, 0.3)',
            background: msg.type === 'ok' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
            color: msg.type === 'ok' ? '#86efac' : '#fda4af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{msg.text}</span>
          <button
            type="button"
            onClick={() => setMsg(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Layout Principal: Formulário de Cadastro + Listagem Tática */}
      <div className="units-main-layout">
        {/* Painel Esquerdo: Cadastro de Nova Unidade */}
        <div className="units-glass-panel">
          <h3 className="units-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nova Unidade
          </h3>

          <form className="form-grid" onSubmit={addUnit}>
            <div className="field">
              <label>Nome da Unidade</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Loja 01 — Jardins"
                required
              />
            </div>

            <div className="field">
              <label>Endereço / Localização</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Av. Paulista, 1000"
              />
            </div>

            <div className="field">
              <label>Escala de Funcionamento</label>
              <div className="units-presets-row">
                <button
                  type="button"
                  className={`units-preset-btn ${operationDays === null ? 'active' : ''}`}
                  onClick={() => applyPreset('all')}
                >
                  Todos os Dias
                </button>
                <button
                  type="button"
                  className={`units-preset-btn ${
                    Array.isArray(operationDays) &&
                    operationDays.length === 5 &&
                    operationDays.every((d) => [1, 2, 3, 4, 5].includes(d))
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => applyPreset('weekdays')}
                >
                  Seg a Sex
                </button>
                <button
                  type="button"
                  className={`units-preset-btn ${
                    Array.isArray(operationDays) &&
                    operationDays.length === 2 &&
                    operationDays.every((d) => [0, 6].includes(d))
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => applyPreset('weekend')}
                >
                  Fim de Semana
                </button>
              </div>

              <div className="chip-select">
                {DAYS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={`chip ${getActiveDays(operationDays).includes(d.v) ? 'chip-on' : ''}`}
                    onClick={() => toggleDay(d.v)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="units-schedule-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>{getScheduleSummary(operationDays)}</span>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={savingNew || !name.trim()}>
              {savingNew ? 'Cadastrando...' : 'Cadastrar Unidade'}
            </button>
          </form>
        </div>

        {/* Painel Direito: Listagem das Unidades */}
        <div className="units-glass-panel">
          <div className="units-toolbar">
            <div className="units-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="units-search-input"
                placeholder="Buscar por nome ou endereço..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="units-filter-tabs">
              <button
                type="button"
                className={`units-filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                Todas ({units.length})
              </button>
              <button
                type="button"
                className={`units-filter-btn ${filter === 'open_today' ? 'active' : ''}`}
                onClick={() => setFilter('open_today')}
              >
                Abertas Hoje ({openTodayCount})
              </button>
              <button
                type="button"
                className={`units-filter-btn ${filter === 'inactive' ? 'active' : ''}`}
                onClick={() => setFilter('inactive')}
              >
                Inativas ({totalCount - activeCount})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="muted" style={{ padding: '2rem 0', textAlign: 'center' }}>
              Carregando unidades...
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
              Nenhuma unidade encontrada para os critérios selecionados.
            </div>
          ) : (
            <div className="units-cards-grid">
              {filteredUnits.map((u) => {
                const closedToday = isTodayClosed(u);
                const activeDays = getActiveDays(u.operation_days);
                const score = u.score_total;

                return (
                  <div key={u.id} className={`unit-card-item ${!u.is_active ? 'is-inactive' : ''}`}>
                    <div className="unit-card-top">
                      <div>
                        <h4 className="unit-card-title">{u.name}</h4>
                        <div className="unit-card-address">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>{u.address || 'Sem endereço'}</span>
                        </div>
                      </div>

                      <span className={`badge ${u.is_active ? 'badge-completed' : 'badge-pending'}`}>
                        {u.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>

                    <div className="unit-schedule-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: !u.is_active ? '#94a3b8' : closedToday ? '#f59e0b' : '#22c55e',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ color: closedToday ? '#fbbf24' : '#cbd5e1', fontWeight: 600 }}>
                          {closedToday ? 'Fechada hoje' : 'Aberta hoje'}
                        </span>
                      </div>

                      <div className="unit-days-dots" title="Dias com expediente configurado">
                        {DAYS.map((d) => (
                          <div
                            key={d.v}
                            className={`unit-day-dot ${activeDays.includes(d.v) ? 'active' : ''}`}
                            title={`${d.label}: ${activeDays.includes(d.v) ? 'Ativo' : 'Fechado'}`}
                          >
                            {d.short}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="unit-card-footer">
                      <div>
                        {score != null ? (
                          <span
                            className={`unit-score-badge ${
                              score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'
                            }`}
                            title="Índice P·E·Q Consolidado"
                          >
                            {score}% Score
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>
                            Sem histórico
                          </span>
                        )}
                      </div>

                      <div className="unit-card-actions">
                        <button
                          type="button"
                          className="unit-action-icon-btn"
                          title="Editar dados da unidade"
                          onClick={() => openEdit(u)}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="unit-action-icon-btn"
                          title={u.is_active ? 'Desativar temporariamente' : 'Ativar unidade'}
                          onClick={() => void toggle(u)}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="unit-action-icon-btn danger"
                          title="Remover unidade"
                          onClick={() => void remove(u.id, u.name)}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição */}
      {editing && (
        <div className="units-modal-backdrop" onClick={closeEdit}>
          <div className="units-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '0.85rem',
              }}
            >
              <h3 className="units-panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editar Unidade
              </h3>
              <button
                type="button"
                className="unit-action-icon-btn"
                onClick={closeEdit}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <form className="form-grid" onSubmit={saveEdit}>
              <div className="field">
                <label>Nome da Unidade</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome da unidade"
                  required
                />
              </div>

              <div className="field">
                <label>Endereço / Localização</label>
                <input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Endereço"
                />
              </div>

              <div className="field">
                <label>Escala de Funcionamento</label>
                <div className="units-presets-row">
                  <button
                    type="button"
                    className={`units-preset-btn ${editOperationDays === null ? 'active' : ''}`}
                    onClick={() => applyEditPreset('all')}
                  >
                    Todos os Dias
                  </button>
                  <button
                    type="button"
                    className={`units-preset-btn ${
                      Array.isArray(editOperationDays) &&
                      editOperationDays.length === 5 &&
                      editOperationDays.every((d) => [1, 2, 3, 4, 5].includes(d))
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => applyEditPreset('weekdays')}
                  >
                    Seg a Sex
                  </button>
                  <button
                    type="button"
                    className={`units-preset-btn ${
                      Array.isArray(editOperationDays) &&
                      editOperationDays.length === 2 &&
                      editOperationDays.every((d) => [0, 6].includes(d))
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => applyEditPreset('weekend')}
                  >
                    Fim de Semana
                  </button>
                </div>

                <div className="chip-select">
                  {DAYS.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      className={`chip ${getActiveDays(editOperationDays).includes(d.v) ? 'chip-on' : ''}`}
                      onClick={() => toggleEditDay(d.v)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                <div className="units-schedule-info">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>{getScheduleSummary(editOperationDays)}</span>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit || !editName.trim()}>
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
