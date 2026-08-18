import { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { loadDemoUnits } from '../../lib/demoData';
import { useAuth } from '../../lib/auth';

interface Unit {
  id: string;
  name: string;
  is_active?: boolean;
}

interface Sector {
  id: string;
  unit_id: string;
  name: string;
  sort_order: number;
}

const SECTOR_PRESETS = [
  'Cozinha Quente',
  'Câmaras & Freezers',
  'Estoque Seco',
  'Salão & Balcão',
  'Bar & Bebidas',
  'Área de Descarte',
];

const STANDARD_TOPOLOGY = [
  'Cozinha Quente',
  'Câmaras & Freezers',
  'Estoque Seco',
  'Salão & Balcão',
  'Área de Descarte',
];

function getSectorIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('cozinha') || n.includes('quente') || n.includes('preparo') || n.includes('fog')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M8.5 8.5l-2.5-2.5M15.5 8.5l2.5-2.5M6 14a6 6 0 0 0 12 0V11H6v3z" />
        <line x1="4" y1="20" x2="20" y2="20" />
      </svg>
    );
  }
  if (n.includes('câmara') || n.includes('camara') || n.includes('freezer') || n.includes('gelad') || n.includes('frio')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  if (n.includes('estoque') || n.includes('almoxarif') || n.includes('seco') || n.includes('depósito')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    );
  }
  if (n.includes('salão') || n.includes('salao') || n.includes('balcão') || n.includes('balcao') || n.includes('atendimento')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (n.includes('bar') || n.includes('bebid') || n.includes('café') || n.includes('cafe')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    );
  }
  if (n.includes('descarte') || n.includes('lixo') || n.includes('resíduo') || n.includes('higieniz')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function SectorsPage() {
  const { demoMode } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');

  // Form states (Novo setor)
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [savingNew, setSavingNew] = useState(false);

  // Edit Modal states
  const [editing, setEditing] = useState<Sector | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnitId, setEditUnitId] = useState('');
  const [editSortOrder, setEditSortOrder] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  // Template batch state
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchUnits = async () => {
    try {
      const data = await apiGet<{ units: Unit[] }>('/api/units');
      if (data.units && data.units.length > 0) {
        setUnits(data.units);
      } else if (demoMode) {
        setUnits(loadDemoUnits());
      } else {
        setUnits([]);
      }
    } catch {
      if (demoMode) setUnits(loadDemoUnits());
      else setUnits([]);
    }
  };

  const fetchSectors = async () => {
    try {
      const data = await apiGet<{ sectors: Sector[] }>('/api/sectors');
      if (data.sectors && data.sectors.length > 0) {
        setSectors(data.sectors);
      } else if (demoMode) {
        // Fallback demo sectors for units
        const demoUnits = loadDemoUnits();
        const initialSectors: Sector[] = [];
        demoUnits.forEach((u, uIdx) => {
          STANDARD_TOPOLOGY.slice(0, 4).forEach((secName, sIdx) => {
            initialSectors.push({
              id: `sec-${uIdx}-${sIdx}`,
              unit_id: u.id,
              name: secName,
              sort_order: sIdx,
            });
          });
        });
        setSectors(initialSectors);
      } else {
        setSectors([]);
      }
    } catch {
      if (demoMode) {
        const demoUnits = loadDemoUnits();
        const initialSectors: Sector[] = [];
        demoUnits.forEach((u, uIdx) => {
          STANDARD_TOPOLOGY.slice(0, 4).forEach((secName, sIdx) => {
            initialSectors.push({
              id: `sec-${uIdx}-${sIdx}`,
              unit_id: u.id,
              name: secName,
              sort_order: sIdx,
            });
          });
        });
        setSectors(initialSectors);
      } else {
        setSectors([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchUnits();
      await fetchSectors();
    })();
  }, []);

  // Pre-select first unit in creation form once units load
  useEffect(() => {
    if (units.length > 0 && !unitId) {
      setUnitId(units[0].id);
    }
  }, [units, unitId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unitId) return;
    setSavingNew(true);
    try {
      await apiPost('/api/sectors', {
        unit_id: unitId,
        name: name.trim(),
        sort_order: Number(sortOrder || 0),
      });
      setMsg({ type: 'ok', text: `Setor "${name.trim()}" cadastrado com sucesso.` });
      setName('');
      setSortOrder(0);
      await fetchSectors();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao criar setor: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingNew(false);
    }
  }

  async function applyTopologyTemplate(targetUnitId: string) {
    const targetUnit = units.find((u) => u.id === targetUnitId);
    if (!targetUnit) return;
    if (!confirm(`Aplicar os 5 setores padrão na unidade "${targetUnit.name}"?`)) return;

    setApplyingTemplate(true);
    try {
      for (let i = 0; i < STANDARD_TOPOLOGY.length; i++) {
        const secName = STANDARD_TOPOLOGY[i];
        // Only add if not already exists in that unit
        const exists = sectors.some((s) => s.unit_id === targetUnitId && s.name.toLowerCase() === secName.toLowerCase());
        if (!exists) {
          await apiPost('/api/sectors', {
            unit_id: targetUnitId,
            name: secName,
            sort_order: i,
          });
        }
      }
      setMsg({ type: 'ok', text: `Topologia padrão aplicada com sucesso na unidade "${targetUnit.name}".` });
      await fetchSectors();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao aplicar topologia: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setApplyingTemplate(false);
    }
  }

  function openEdit(s: Sector) {
    setEditing(s);
    setEditName(s.name);
    setEditUnitId(s.unit_id);
    setEditSortOrder(s.sort_order ?? 0);
  }

  function closeEdit() {
    setEditing(null);
    setSavingEdit(false);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editName.trim() || !editUnitId) return;
    setSavingEdit(true);
    try {
      await apiPost('/api/sectors', {
        id: editing.id,
        unit_id: editUnitId,
        name: editName.trim(),
        sort_order: Number(editSortOrder ?? 0),
      });
      setMsg({ type: 'ok', text: `Setor "${editName.trim()}" atualizado.` });
      closeEdit();
      await fetchSectors();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao salvar setor: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(id: string, sectorName: string) {
    if (!confirm(`Remover o setor "${sectorName}"? Operadores e checklists vinculados a este setor perderão a associação.`)) {
      return;
    }
    try {
      await apiDelete(`/api/sectors/${id}`);
      setMsg({ type: 'ok', text: `Setor "${sectorName}" removido.` });
      await fetchSectors();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao remover setor: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // KPIs
  const totalSectors = sectors.length;
  const coveredUnitsCount = useMemo(() => {
    const unitIdsWithSectors = new Set(sectors.map((s) => s.unit_id));
    return units.filter((u) => unitIdsWithSectors.has(u.id)).length;
  }, [sectors, units]);

  const coveragePercent = units.length > 0 ? Math.round((coveredUnitsCount / units.length) * 100) : 0;
  const avgSectorsPerUnit = units.length > 0 ? Math.round((totalSectors / units.length) * 10) / 10 : 0;

  // Filtered & Grouped Data
  const filteredUnits = useMemo(() => {
    if (selectedUnitFilter === 'all') return units;
    return units.filter((u) => u.id === selectedUnitFilter);
  }, [units, selectedUnitFilter]);

  return (
    <div className="sectors-page-wrap">
      {/* Header Executivo com KPIs */}
      <div className="sectors-header-bar">
        <div className="units-title-row">
          <div>
            <h2 className="units-main-title">Mapeamento de Setores Operacionais</h2>
            <p className="units-main-sub">
              Organização estrutural de áreas por unidade para roteamento inteligente de checklists e operadores.
            </p>
          </div>
        </div>

        <div className="units-kpi-grid">
          <div className="units-kpi-card">
            <div className="units-kpi-icon teal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{totalSectors}</span>
              <span className="units-kpi-label">Setores Mapeados</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01" />
                <path d="M16 6h.01" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">
                {coveredUnitsCount} / {units.length}
              </span>
              <span className="units-kpi-label">Lojas com Setores</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{coveragePercent}%</span>
              <span className="units-kpi-label">Cobertura da Rede</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon emerald">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{avgSectorsPerUnit}</span>
              <span className="units-kpi-label">Média por Unidade</span>
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className="notice"
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

      {/* Layout Principal: Formulário de Cadastro + Topologia por Loja */}
      <div className="units-main-layout">
        {/* Painel Esquerdo: Cadastro de Novo Setor */}
        <div className="units-glass-panel">
          <h3 className="units-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo Setor
          </h3>

          <form className="form-grid" onSubmit={add}>
            <div className="field">
              <label>Unidade de Destino</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Selecione a unidade</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Nome do Setor</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cozinha Quente"
                required
              />

              <div style={{ marginTop: '0.5rem' }}>
                <span className="muted" style={{ fontSize: '0.72rem', display: 'block', marginBottom: '0.35rem' }}>
                  Modelos rápidos Food Service:
                </span>
                <div className="units-presets-row">
                  {SECTOR_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`units-preset-btn ${name === preset ? 'active' : ''}`}
                      onClick={() => setName(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="field">
              <label>Ordem de Exibição</label>
              <input
                type="number"
                min="0"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                placeholder="0"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={savingNew || !name.trim() || !unitId}>
              {savingNew ? 'Cadastrando...' : 'Cadastrar Setor'}
            </button>
          </form>

          {/* Banner de Topologia Rápida */}
          {unitId && (
            <div className="sectors-template-box">
              <div className="sectors-template-text">
                <h4>Topologia Padrão (5 Setores)</h4>
                <p>Cria Cozinha, Freezers, Estoque, Salão e Descarte com 1 clique.</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ borderColor: 'rgba(20, 184, 166, 0.3)', color: '#2dd4bf' }}
                disabled={applyingTemplate}
                onClick={() => applyTopologyTemplate(unitId)}
              >
                {applyingTemplate ? 'Aplicando...' : 'Aplicar nesta Loja'}
              </button>
            </div>
          )}
        </div>

        {/* Painel Direito: Topologia de Setores Agrupada por Loja */}
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
                placeholder="Buscar setor por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="units-filter-tabs">
              <button
                type="button"
                className={`units-filter-btn ${selectedUnitFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedUnitFilter('all')}
              >
                Todas as Lojas
              </button>
              {units.map((u) => {
                const count = sectors.filter((s) => s.unit_id === u.id).length;
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`units-filter-btn ${selectedUnitFilter === u.id ? 'active' : ''}`}
                    onClick={() => setSelectedUnitFilter(u.id)}
                  >
                    {u.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="muted" style={{ padding: '2.5rem 0', textAlign: 'center' }}>
              Carregando topologia de setores...
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
              Nenhuma unidade encontrada.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {filteredUnits.map((u) => {
                const unitSectors = sectors
                  .filter((s) => s.unit_id === u.id)
                  .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                return (
                  <div key={u.id} className="sectors-unit-group">
                    <div className="sectors-unit-header">
                      <div className="sectors-unit-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                          <path d="M9 22v-4h6v4" />
                          <path d="M8 6h.01" />
                          <path d="M16 6h.01" />
                        </svg>
                        <span>{u.name}</span>
                        <span className="badge badge-info" style={{ marginLeft: '0.4rem', fontSize: '0.72rem' }}>
                          {unitSectors.length} {unitSectors.length === 1 ? 'setor' : 'setores'}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => {
                          setUnitId(u.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        + Adicionar Setor
                      </button>
                    </div>

                    {unitSectors.length === 0 ? (
                      <div
                        style={{
                          padding: '1.5rem',
                          textAlign: 'center',
                          background: 'rgba(11, 18, 32, 0.4)',
                          borderRadius: '8px',
                          border: '1px dashed rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <span className="muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.65rem' }}>
                          Nenhum setor cadastrado para esta unidade.
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={applyingTemplate}
                          onClick={() => applyTopologyTemplate(u.id)}
                        >
                          Aplicar Topologia Padrão Food Service
                        </button>
                      </div>
                    ) : (
                      <div className="sectors-cards-grid">
                        {unitSectors.map((s) => (
                          <div key={s.id} className="sector-card-item">
                            <div className="sector-card-left">
                              <div className="sector-icon-pill">{getSectorIcon(s.name)}</div>
                              <div className="sector-info">
                                <span className="sector-name" title={s.name}>
                                  {s.name}
                                </span>
                                <span className="sector-order-tag">Ordem #{s.sort_order ?? 0}</span>
                              </div>
                            </div>

                            <div className="sector-actions">
                              <button
                                type="button"
                                className="unit-action-icon-btn"
                                title="Editar setor"
                                onClick={() => openEdit(s)}
                              >
                                <svg
                                  width="12"
                                  height="12"
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
                                className="unit-action-icon-btn danger"
                                title="Remover setor"
                                onClick={() => void remove(s.id, s.name)}
                              >
                                <svg
                                  width="12"
                                  height="12"
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
                        ))}
                      </div>
                    )}
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
                Editar Setor
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
                <label>Unidade</label>
                <select value={editUnitId} onChange={(e) => setEditUnitId(e.target.value)} required>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Nome do Setor</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do setor"
                  required
                />
              </div>

              <div className="field">
                <label>Ordem de Exibição</label>
                <input
                  type="number"
                  min="0"
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(Number(e.target.value))}
                />
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