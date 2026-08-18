import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch, apiPost, apiDelete } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { loadDemoUnits } from '../../lib/demoData';

interface Operator {
  id: string;
  company_id?: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: 'operator' | 'manager';
  unit_id?: string | null;
  is_active: boolean;
  created_at?: string;
  unit?: { id: string; name: string } | null;
  sector_ids?: string[];
}

interface Unit {
  id: string;
  name: string;
}

interface Sector {
  id: string;
  unit_id?: string;
  name: string;
}

const DEMO_OPERATORS: Operator[] = [
  {
    id: 'op-1',
    full_name: 'Carlos Oliveira',
    email: 'carlos.oliveira@concluiai.com',
    phone: '+5511987654321',
    role: 'manager',
    unit_id: '22222222-2222-2222-2222-222222222221',
    is_active: true,
    sector_ids: [],
    unit: { id: '22222222-2222-2222-2222-222222222221', name: 'Unidade Centro' },
  },
  {
    id: 'op-2',
    full_name: 'Mariana Santos',
    email: 'mariana.santos@concluiai.com',
    phone: '+5511976543210',
    role: 'operator',
    unit_id: '22222222-2222-2222-2222-222222222221',
    is_active: true,
    sector_ids: ['sec-0-0', 'sec-0-1'],
    unit: { id: '22222222-2222-2222-2222-222222222221', name: 'Unidade Centro' },
  },
  {
    id: 'op-3',
    full_name: 'Rafael Mendes',
    email: 'rafael.mendes@concluiai.com',
    phone: '+5511965432109',
    role: 'operator',
    unit_id: '22222222-2222-2222-2222-222222222222',
    is_active: true,
    sector_ids: ['sec-1-0'],
    unit: { id: '22222222-2222-2222-2222-222222222222', name: 'Unidade Shopping' },
  },
  {
    id: 'op-4',
    full_name: 'Fernanda Lima',
    email: 'fernanda.lima@concluiai.com',
    phone: '+5511954321098',
    role: 'operator',
    unit_id: 'u3',
    is_active: false,
    sector_ids: [],
    unit: { id: 'u3', name: 'Unidade Aeroporto' },
  },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
}

export function OperatorsPage() {
  const { isAdmin, demoMode } = useAuth();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'operator' | 'manager' | 'inactive'>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');

  // Form states (Novo operador)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'operator' | 'manager'>('operator');
  const [unitId, setUnitId] = useState('');
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [savingNew, setSavingNew] = useState(false);

  // Edit Modal states
  const [editing, setEditing] = useState<Operator | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'operator' | 'manager'>('operator');
  const [editUnitId, setEditUnitId] = useState('');
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchSectors = async () => {
    try {
      const data = await apiGet<{ sectors: Sector[] }>('/api/sectors');
      setSectors(data.sectors || []);
    } catch {
      setSectors([]);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const opData = await apiGet<{ operators: Operator[] }>('/api/operators');
      if (opData.operators && opData.operators.length > 0) {
        setOperators(opData.operators);
      } else if (demoMode) {
        setOperators(DEMO_OPERATORS);
      } else {
        setOperators([]);
      }
    } catch {
      if (demoMode) {
        setOperators(DEMO_OPERATORS);
      } else {
        setOperators([]);
      }
    }

    try {
      const unitData = await apiGet<{ units: Unit[] }>('/api/units');
      if (unitData.units && unitData.units.length > 0) {
        setUnits(unitData.units);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
    void fetchSectors();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setMsg({ type: 'err', text: 'Preencha o nome completo e e-mail corporativo.' });
      return;
    }
    setSavingNew(true);
    try {
      await apiPost('/api/operators', {
        full_name: fullName.trim(),
        email: email.trim(),
        password: password || undefined,
        phone: phone.trim() || null,
        role,
        unit_id: unitId || null,
        sector_ids: sectorIds,
        is_active: true,
      });
      setMsg({ type: 'ok', text: `Colaborador "${fullName.trim()}" cadastrado com sucesso.` });
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setUnitId('');
      setSectorIds([]);
      await fetchAll();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao criar: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingNew(false);
    }
  }

  async function toggleActive(op: Operator) {
    try {
      await apiPatch(`/api/operators/${op.id}`, { is_active: !op.is_active });
      setMsg({
        type: 'ok',
        text: `Colaborador "${op.full_name}" ${!op.is_active ? 'ativado' : 'desativado'}.`,
      });
      await fetchAll();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao alterar status: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async function removeOperator(op: Operator) {
    if (
      !window.confirm(
        `Excluir o colaborador "${op.full_name}"? Esta ação removerá os vínculos e histórico de autenticação.`
      )
    ) {
      return;
    }
    try {
      await apiDelete(`/api/operators/${op.id}`);
      setMsg({ type: 'ok', text: `Colaborador "${op.full_name}" excluído com sucesso.` });
      await fetchAll();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao excluir: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  function openEdit(op: Operator) {
    setEditing(op);
    setEditName(op.full_name);
    setEditPhone(op.phone || '');
    setEditRole(op.role);
    setEditUnitId(op.unit_id || '');
    setEditSectorIds(op.sector_ids || []);
    setEditActive(op.is_active);
  }

  function closeEdit() {
    setEditing(null);
    setSavingEdit(false);
  }

  function toggleSector(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await apiPatch(`/api/operators/${editing.id}`, {
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
        role: editRole,
        unit_id: editUnitId || null,
        sector_ids: editSectorIds,
        is_active: editActive,
      });
      setMsg({ type: 'ok', text: `Colaborador "${editName.trim()}" atualizado.` });
      closeEdit();
      await fetchAll();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao atualizar: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingEdit(false);
    }
  }

  const sectorNames = (ids?: string[]) =>
    (ids || []).map((id) => sectors.find((s) => s.id === id)?.name).filter(Boolean);

  // Available sectors filtered for active form target unit
  const availableSectors = useMemo(() => {
    if (!unitId) return sectors;
    return sectors.filter((s) => !s.unit_id || s.unit_id === unitId);
  }, [sectors, unitId]);

  const availableEditSectors = useMemo(() => {
    if (!editUnitId) return sectors;
    return sectors.filter((s) => !s.unit_id || s.unit_id === editUnitId);
  }, [sectors, editUnitId]);

  // KPIs
  const totalCount = operators.length;
  const operatorsCount = operators.filter((o) => o.role === 'operator' && o.is_active).length;
  const managersCount = operators.filter((o) => o.role === 'manager' && o.is_active).length;
  const withPhoneCount = operators.filter((o) => o.is_active && !!o.phone).length;

  // Filtered List
  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      const matchSearch =
        op.full_name.toLowerCase().includes(search.toLowerCase()) ||
        op.email.toLowerCase().includes(search.toLowerCase()) ||
        (op.phone && op.phone.includes(search));
      if (!matchSearch) return false;

      if (roleFilter === 'operator') return op.role === 'operator' && op.is_active;
      if (roleFilter === 'manager') return op.role === 'manager' && op.is_active;
      if (roleFilter === 'inactive') return !op.is_active;

      if (selectedUnitFilter !== 'all') {
        if (op.unit_id !== selectedUnitFilter) return false;
      }

      return true;
    });
  }, [operators, search, roleFilter, selectedUnitFilter]);

  return (
    <div className="operators-page-wrap">
      {/* Header Executivo com KPIs */}
      <div className="sectors-header-bar">
        <div className="units-title-row">
          <div>
            <h2 className="units-main-title">Operadores & Gerentes de Unidade</h2>
            <p className="units-main-sub">
              Gestão de credenciais, vínculos por filial, roteamento de alertas WhatsApp e permissões operacionais.
            </p>
          </div>
        </div>

        <div className="units-kpi-grid">
          <div className="units-kpi-card">
            <div className="units-kpi-icon teal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{totalCount}</span>
              <span className="units-kpi-label">Total Cadastrado</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon emerald">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{operatorsCount}</span>
              <span className="units-kpi-label">Operadores Mobile</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{managersCount}</span>
              <span className="units-kpi-label">Gerentes de Filial</span>
            </div>
          </div>

          <div className="units-kpi-card">
            <div className="units-kpi-icon amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="units-kpi-content">
              <span className="units-kpi-val">{withPhoneCount}</span>
              <span className="units-kpi-label">WhatsApp Habilitado</span>
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

      {/* Layout Principal: Formulário de Cadastro + Roster de Colaboradores */}
      <div className="units-main-layout">
        {/* Painel Esquerdo: Cadastro de Novo Colaborador */}
        <div className="units-glass-panel">
          <h3 className="units-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Novo Colaborador
          </h3>

          <form className="form-grid" onSubmit={create}>
            <div className="field">
              <label>Nome Completo</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                required
              />
            </div>

            <div className="field">
              <label>E-mail Corporativo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="carlos@concluiai.com"
                required
              />
            </div>

            <div className="field">
              <label>WhatsApp (com DDI e DDD)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+5511999998888"
              />
            </div>

            <div className="field">
              <label>Papel na Operação</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'operator' | 'manager')}>
                <option value="operator">Operador Mobile (Execução de Checklists)</option>
                <option value="manager">Gerente de Unidade (Auditoria & Turno)</option>
              </select>
            </div>

            <div className="field">
              <label>Unidade de Lotação</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Todas / Sem unidade fixa</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Setores sob Responsabilidade</label>
              <div className="chip-select">
                {availableSectors.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`chip ${sectorIds.includes(s.id) ? 'chip-on' : ''}`}
                    onClick={() => toggleSector(s.id, sectorIds, setSectorIds)}
                  >
                    {s.name}
                  </button>
                ))}
                {availableSectors.length === 0 && (
                  <div className="muted" style={{ fontSize: '0.78rem' }}>
                    Nenhum setor cadastrado. Configure setores na aba anterior.
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label>Senha Inicial (Opcional)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe vazio para envio de link mágico"
              />
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={savingNew || !fullName.trim() || !email.trim()}
            >
              {savingNew ? 'Cadastrando...' : 'Cadastrar Colaborador'}
            </button>
          </form>
        </div>

        {/* Painel Direito: Roster Tático de Colaboradores */}
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
                placeholder="Buscar por nome, e-mail ou WhatsApp..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="units-filter-tabs">
              <button
                type="button"
                className={`units-filter-btn ${roleFilter === 'all' ? 'active' : ''}`}
                onClick={() => setRoleFilter('all')}
              >
                Todos ({operators.length})
              </button>
              <button
                type="button"
                className={`units-filter-btn ${roleFilter === 'operator' ? 'active' : ''}`}
                onClick={() => setRoleFilter('operator')}
              >
                Operadores ({operatorsCount})
              </button>
              <button
                type="button"
                className={`units-filter-btn ${roleFilter === 'manager' ? 'active' : ''}`}
                onClick={() => setRoleFilter('manager')}
              >
                Gerentes ({managersCount})
              </button>
              <button
                type="button"
                className={`units-filter-btn ${roleFilter === 'inactive' ? 'active' : ''}`}
                onClick={() => setRoleFilter('inactive')}
              >
                Inativos ({totalCount - (operatorsCount + managersCount)})
              </button>
            </div>
          </div>

          {/* Filtro por Filial se houver mais de uma */}
          {units.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '0.74rem' }}>Filtrar filial:</span>
              <div className="units-presets-row" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`units-preset-btn ${selectedUnitFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedUnitFilter('all')}
                >
                  Todas as Lojas
                </button>
                {units.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`units-preset-btn ${selectedUnitFilter === u.id ? 'active' : ''}`}
                    onClick={() => setSelectedUnitFilter(u.id)}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="muted" style={{ padding: '2.5rem 0', textAlign: 'center' }}>
              Carregando colaboradores...
            </div>
          ) : filteredOperators.length === 0 ? (
            <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
              Nenhum colaborador encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Unidade & Setores</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperators.map((op) => {
                    const assignedSectors = sectorNames(op.sector_ids);
                    const cleanPhone = op.phone?.replace(/\D/g, '') || '';

                    return (
                      <tr key={op.id} style={{ opacity: op.is_active ? 1 : 0.6 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div className={`operator-avatar ${op.role === 'manager' ? 'manager' : ''}`}>
                              {getInitials(op.full_name)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{op.full_name}</strong>
                              <span className="muted" style={{ fontSize: '0.75rem' }}>
                                {op.email}
                              </span>
                              {op.phone && (
                                <a
                                  href={`https://wa.me/${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="operator-wa-link"
                                  title="Iniciar conversa no WhatsApp"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                  >
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                  </svg>
                                  {formatPhoneDisplay(op.phone)}
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.82rem' }}>
                              {op.unit?.name || units.find((u) => u.id === op.unit_id)?.name || 'Rede Global'}
                            </span>
                            {assignedSectors.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {assignedSectors.map((sName) => (
                                  <span key={sName} className="operator-sector-tag">
                                    {sName}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="muted" style={{ fontSize: '0.72rem' }}>
                                Todos os setores
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <span className={`operator-role-badge ${op.role === 'manager' ? 'manager' : 'operator'}`}>
                            {op.role === 'manager' ? 'Gerente' : 'Operador'}
                          </span>
                        </td>

                        <td>
                          <span className={`badge ${op.is_active ? 'badge-completed' : 'badge-pending'}`}>
                            {op.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>

                        <td>
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => openEdit(op)}
                              title="Editar colaborador"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => void toggleActive(op)}
                              title={op.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                            >
                              {op.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => void removeOperator(op)}
                                title="Excluir cadastro"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                Editar Colaborador
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
                <label>Nome Completo</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do colaborador"
                  required
                />
              </div>

              <div className="field">
                <label>WhatsApp (com DDI e DDD)</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+5511999998888"
                />
              </div>

              <div className="field">
                <label>Papel</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'operator' | 'manager')}>
                  <option value="operator">Operador Mobile</option>
                  <option value="manager">Gerente de Unidade</option>
                </select>
              </div>

              <div className="field">
                <label>Unidade de Lotação</label>
                <select value={editUnitId} onChange={(e) => setEditUnitId(e.target.value)}>
                  <option value="">Todas / Sem unidade fixa</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Setores sob Responsabilidade</label>
                <div className="chip-select">
                  {availableEditSectors.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip ${editSectorIds.includes(s.id) ? 'chip-on' : ''}`}
                      onClick={() => toggleSector(s.id, editSectorIds, setEditSectorIds)}
                    >
                      {s.name}
                    </button>
                  ))}
                  {availableEditSectors.length === 0 && (
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      Nenhum setor disponível para esta unidade.
                    </div>
                  )}
                </div>
              </div>

              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  id="edit-active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="edit-active" style={{ margin: 0, cursor: 'pointer' }}>
                  Colaborador Ativo na Operação
                </label>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit || !editName.trim()}
                >
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
