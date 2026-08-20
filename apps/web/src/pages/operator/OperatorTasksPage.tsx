import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { apiGet } from '../../lib/api';
import {
  TaskExecutionModal,
  type TaskItemData,
} from '../../components/operator/TaskExecutionModal';

interface UnitOption {
  id: string;
  name: string;
}

type FilterStatus = 'all' | 'late' | 'pending' | 'completed';

function getTodayBrazilFormatted(): { isoDate: string; displayDate: string } {
  const now = new Date();
  const isoFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const displayFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return {
    isoDate: isoFormatter.format(now),
    displayDate: displayFormatter.format(now),
  };
}

function getDeadlineInfo(dueAtIso: string, status: string): {
  label: string;
  isLate: boolean;
  isUrgent: boolean;
  timeFormatted: string;
} {
  try {
    const dueDate = new Date(dueAtIso);
    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);

    const timeFormatted = dueDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    if (status === 'completed') {
      return {
        label: `Prazo ${timeFormatted}`,
        isLate: false,
        isUrgent: false,
        timeFormatted,
      };
    }

    if (diffMin < 0) {
      const pastMin = Math.abs(diffMin);
      const pastHours = Math.floor(pastMin / 60);
      const label =
        pastHours > 0
          ? `Atrasada há ${pastHours}h ${pastMin % 60}m`
          : `Atrasada há ${pastMin}m`;
      return {
        label,
        isLate: true,
        isUrgent: true,
        timeFormatted,
      };
    }

    if (diffMin <= 30) {
      return {
        label: `Vence em ${diffMin}m (${timeFormatted})`,
        isLate: false,
        isUrgent: true,
        timeFormatted,
      };
    }

    return {
      label: `Prazo: ${timeFormatted}`,
      isLate: false,
      isUrgent: false,
      timeFormatted,
    };
  } catch {
    return {
      label: '—',
      isLate: false,
      isUrgent: false,
      timeFormatted: '—',
    };
  }
}

type TaskScopeTab = 'my_tasks' | 'my_sector' | 'all_unit';

export function OperatorTasksPage() {
  const { user, logout, demoMode, isAdmin, isManager } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [tasks, setTasks] = useState<TaskItemData[]>([]);
  const [userSectorIds, setUserSectorIds] = useState<string[]>([]);
  const [scopeTab, setScopeTab] = useState<TaskScopeTab>('my_tasks');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskItemData | null>(null);

  const { isoDate: todayIso, displayDate: todayFormatted } = useMemo(
    () => getTodayBrazilFormatted(),
    []
  );

  // Carrega lista de unidades para admin/gerente
  useEffect(() => {
    async function loadUnits() {
      if (demoMode) {
        setUnits([
          { id: '22222222-2222-2222-2222-222222222221', name: 'OAK Sushi Cavalhada' },
          { id: '22222222-2222-2222-2222-222222222222', name: 'OAK Sushi Moinhos' },
        ]);
        setSelectedUnitId(user?.unit_id || '22222222-2222-2222-2222-222222222221');
        return;
      }

      try {
        const data = await apiGet<{ units: UnitOption[] }>('/api/units');
        if (data.units && data.units.length > 0) {
          setUnits(data.units);
          const initial = user?.unit_id || data.units[0].id;
          setSelectedUnitId(initial);
        }
      } catch (e) {
        console.warn('Erro ao carregar unidades:', e);
      }
    }
    void loadUnits();
  }, [demoMode, user?.unit_id]);

  // Carrega vínculos de setor do operador logado
  useEffect(() => {
    async function loadUserSectors() {
      if (!user?.id || demoMode) return;
      try {
        const sb = getSupabase();
        if (!sb) return;
        const { data } = await sb
          .from('profiles_sectors')
          .select('sector_id')
          .eq('profile_id', user.id);
        if (data) {
          setUserSectorIds(data.map((row: any) => row.sector_id));
        }
      } catch (err) {
        console.warn('Erro ao carregar setores do operador:', err);
      }
    }
    void loadUserSectors();
  }, [user?.id, demoMode]);

  // Carrega tarefas do dia
  const loadTasks = useCallback(async (isSilent = false) => {
    const unitId = selectedUnitId || user?.unit_id;
    if (!unitId && !demoMode) {
      setTasks([]);
      setLoading(false);
      return;
    }

    if (isSilent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    if (demoMode) {
      const mockTasks: TaskItemData[] = [
        {
          id: 'demo-1',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: todayIso,
          due_at: `${todayIso}T09:00:00-03:00`,
          status: 'pending',
          checklist_name: 'Abertura de Cozinha & Preparo',
          checklist_shift: 'Manhã',
          assigned_to: user?.id,
          assigned_name: user?.full_name || 'Você',
          sector_name: 'Cozinha',
          checklist_item: {
            id: 'item-1',
            title: 'Panela de Arroz · Higienização da Cuba',
            description: 'Lavar cuba interna com esponja e detergente neutro. Secar e checar se não há crosta de arroz no fundo. A foto deve mostrar o interior limpo e brilhando.',
            is_critical: true,
            execution_mode: 'photo',
            requires_photo: true,
          },
        },
        {
          id: 'demo-2',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: todayIso,
          due_at: `${todayIso}T09:00:00-03:00`,
          status: 'pending',
          checklist_name: 'Abertura de Cozinha & Preparo',
          checklist_shift: 'Manhã',
          assigned_to: user?.id,
          assigned_name: user?.full_name || 'Você',
          sector_name: 'Cozinha',
          checklist_item: {
            id: 'item-2',
            title: 'Controle de Temperatura · Freezer 1',
            description: 'Checar display digital do freezer 1. Faixa esperada: entre -18°C e -22°C. A foto deve enquadrar claramente os números do mostrador.',
            is_critical: true,
            execution_mode: 'photo',
            requires_photo: true,
          },
        },
        {
          id: 'demo-3',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: todayIso,
          due_at: `${todayIso}T09:30:00-03:00`,
          status: 'pending',
          checklist_name: 'Abertura de Cozinha & Preparo',
          checklist_shift: 'Manhã',
          sector_name: 'Cozinha',
          checklist_item: {
            id: 'item-3',
            title: 'Higienização da Bancada de Inox',
            description: 'Passar álcool 70% em toda a extensão. A foto deve mostrar a bancada desimpedida, sem utensílios e seca.',
            is_critical: false,
            execution_mode: 'photo',
            requires_photo: true,
          },
        },
        {
          id: 'demo-4',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: todayIso,
          due_at: `${todayIso}T23:00:00-03:00`,
          status: 'pending',
          checklist_name: 'Fechamento & Limpeza Noturna',
          checklist_shift: 'Noite',
          sector_name: 'Limpeza',
          checklist_item: {
            id: 'item-4',
            title: 'Limpeza Pesada de Coifa, Fogão e Ralos',
            description: 'Remover filtros da coifa para desengordurar, limpar queimadores do fogão e despejar água quente nos ralos.',
            is_critical: true,
            execution_mode: 'both',
            requires_photo: true,
          },
        },
      ];

      setTasks(mockTasks);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase não conectado.');

      const { data, error: queryError } = await sb
        .from('task_instances')
        .select(
          `
          id, scheduled_date, due_at, status, checked, notes, completed_at, unit_id, assigned_to,
          assigned_profile:profiles!assigned_to ( id, full_name ),
          checklist_item:checklist_items (
            id, title, description, is_critical, requires_photo, requires_gps, due_time, execution_mode,
            checklist:checklists (
              id, name, shift, sector_id,
              sector:sectors ( id, name )
            )
          )
        `
        )
        .eq('unit_id', unitId)
        .eq('scheduled_date', todayIso)
        .order('due_at', { ascending: true });

      if (queryError) throw queryError;

      const mapped: TaskItemData[] = (data || []).map((row: any) => {
        const item = row.checklist_item;
        const checklist = Array.isArray(item?.checklist)
          ? item.checklist[0]
          : item?.checklist;
        const sector = Array.isArray(checklist?.sector)
          ? checklist.sector[0]
          : checklist?.sector;
        const assignedProfile = Array.isArray(row.assigned_profile)
          ? row.assigned_profile[0]
          : row.assigned_profile;

        return {
          id: row.id,
          unit_id: row.unit_id,
          scheduled_date: row.scheduled_date,
          due_at: row.due_at,
          status: row.status,
          checked: row.checked,
          notes: row.notes,
          completed_at: row.completed_at,
          assigned_to: row.assigned_to,
          assigned_name: assignedProfile?.full_name || null,
          sector_id: checklist?.sector_id || sector?.id || null,
          sector_name: sector?.name || null,
          checklist_name: checklist?.name || 'Checklist Geral',
          checklist_shift: checklist?.shift || null,
          checklist_item: {
            id: item?.id,
            title: item?.title || 'Tarefa',
            description: item?.description || null,
            is_critical: item?.is_critical || false,
            requires_photo: item?.requires_photo || false,
            requires_gps: item?.requires_gps || false,
            execution_mode:
              item?.execution_mode || (item?.requires_photo ? 'photo' : 'check'),
          },
        };
      });

      setTasks(mapped);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao carregar as tarefas do dia.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedUnitId, user?.unit_id, demoMode, todayIso]);

  useEffect(() => {
    if (selectedUnitId || demoMode) {
      void loadTasks();
    }
  }, [selectedUnitId, loadTasks, demoMode]);

  // Tarefas filtradas pelo Escopo Operacional (Minhas / Meu Setor / Toda a Loja)
  const scopedTasks = useMemo(() => {
    if (scopeTab === 'all_unit') return tasks;

    if (scopeTab === 'my_tasks') {
      return tasks.filter((t) => {
        if (t.assigned_to === user?.id) return true;
        // Se a tarefa não possui atribuição nominal e o usuário não tem setor exclusivo
        if (!t.assigned_to && userSectorIds.length === 0) return true;
        return false;
      });
    }

    if (scopeTab === 'my_sector') {
      return tasks.filter((t) => {
        if (t.assigned_to === user?.id) return true;
        if (t.sector_id && userSectorIds.includes(t.sector_id)) return true;
        if (userSectorIds.length === 0) return true;
        return false;
      });
    }

    return tasks;
  }, [tasks, scopeTab, user?.id, userSectorIds]);

  // Contagem para badges em cada aba de escopo
  const scopeCounts = useMemo(() => {
    const myTasksCount = tasks.filter(
      (t) => t.assigned_to === user?.id || (!t.assigned_to && userSectorIds.length === 0)
    ).length;
    const mySectorCount = tasks.filter(
      (t) =>
        t.assigned_to === user?.id ||
        (t.sector_id && userSectorIds.includes(t.sector_id)) ||
        userSectorIds.length === 0
    ).length;
    const allUnitCount = tasks.length;
    return { myTasks: myTasksCount, mySector: mySectorCount, allUnit: allUnitCount };
  }, [tasks, user?.id, userSectorIds]);

  // Cálculos de métricas e status derivados dentro do escopo ativo
  const stats = useMemo(() => {
    const now = Date.now();
    let late = 0;
    let pending = 0;
    let completed = 0;

    for (const t of scopedTasks) {
      if (t.status === 'completed') {
        completed += 1;
      } else {
        const dueTime = new Date(t.due_at).getTime();
        if (dueTime < now) {
          late += 1;
        } else {
          pending += 1;
        }
      }
    }

    return {
      all: scopedTasks.length,
      late,
      pending,
      completed,
    };
  }, [scopedTasks]);

  // Agrupamento por Checklist
  const groups = useMemo(() => {
    const now = Date.now();
    const map = new Map<
      string,
      {
        name: string;
        shift: string | null;
        tasks: TaskItemData[];
        total: number;
        completed: number;
        late: number;
        pending: number;
      }
    >();

    const q = searchQuery.toLowerCase().trim();

    for (const t of scopedTasks) {
      const gName = t.checklist_name || 'Checklist Geral';
      let g = map.get(gName);
      if (!g) {
        g = {
          name: gName,
          shift: t.checklist_shift || null,
          tasks: [],
          total: 0,
          completed: 0,
          late: 0,
          pending: 0,
        };
        map.set(gName, g);
      }

      g.total += 1;
      const isFinished = t.status === 'completed';
      const isLate = !isFinished && new Date(t.due_at).getTime() < now;

      if (isFinished) g.completed += 1;
      else if (isLate) g.late += 1;
      else g.pending += 1;

      // Filtragem ativa por status
      let matchesFilter = true;
      if (activeFilter === 'late') matchesFilter = isLate;
      else if (activeFilter === 'pending') matchesFilter = !isFinished && !isLate;
      else if (activeFilter === 'completed') matchesFilter = isFinished;

      // Filtragem por busca
      const matchesSearch =
        !q ||
        t.checklist_item?.title.toLowerCase().includes(q) ||
        t.checklist_name?.toLowerCase().includes(q) ||
        (t.checklist_item?.description &&
          t.checklist_item.description.toLowerCase().includes(q)) ||
        (t.sector_name && t.sector_name.toLowerCase().includes(q)) ||
        (t.assigned_name && t.assigned_name.toLowerCase().includes(q));

      if (matchesFilter && matchesSearch) {
        g.tasks.push(t);
      }
    }

    // Ordenação e cálculo de progresso
    return [...map.values()]
      .filter((g) => g.tasks.length > 0)
      .map((g) => ({
        ...g,
        progressPercent: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, activeFilter, searchQuery]);

  // Abre os grupos automaticamente na primeira carga
  useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groups.map((g) => g.name)));
    }
  }, [groups, expandedGroups.size]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const currentUnitName =
    units.find((u) => u.id === selectedUnitId)?.name || 'Sua Unidade';

  return (
    <div className="operator-shell">
      {/* Barra de Status e Cabeçalho Superior */}
      <header className="operator-topbar">
        <div className="op-brand-wrap">
          <div className="op-brand-logo" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="op-brand-info">
            <h1 className="op-brand-title">ConcluíAI</h1>
            <div className="op-unit-badge">
              <span className="op-unit-pin" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <span className="op-unit-name">{currentUnitName}</span>
            </div>
          </div>
        </div>

        <div className="op-topbar-actions">
          <button
            type="button"
            className={`op-action-btn ${refreshing ? 'is-spinning' : ''}`}
            onClick={() => void loadTasks(true)}
            aria-label="Atualizar tarefas"
            title="Atualizar tarefas"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
          <button
            type="button"
            className="op-action-btn op-logout-btn"
            onClick={() => void logout()}
            aria-label="Sair da conta"
            title="Sair"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      {/* Seletor de Unidade (para gestores e administradores) */}
      {(isAdmin || isManager) && units.length > 1 && (
        <div className="op-unit-switcher">
          <label htmlFor="unit-select">Alterar visualização de unidade:</label>
          <div className="op-select-wrap">
            <select
              id="unit-select"
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Cabeçalho de Contexto do Dia */}
      <div className="op-day-header">
        <div className="op-date-chip">{todayFormatted}</div>
        <div className="op-progress-overview">
          {stats.all === 0
            ? 'Nenhuma tarefa neste escopo'
            : stats.completed === stats.all
            ? '🎉 100% das tarefas concluídas!'
            : `${stats.completed} de ${stats.all} concluídas`}
        </div>
      </div>

      {/* Seletor de Escopo Operacional (Opção 3: Híbrido) */}
      <nav className="op-scope-strip" aria-label="Escopo das tarefas">
        <button
          type="button"
          className={`op-scope-btn ${scopeTab === 'my_tasks' ? 'is-active' : ''}`}
          onClick={() => setScopeTab('my_tasks')}
        >
          <span>🎯 Minhas Tarefas</span>
          <span className="op-scope-count">{scopeCounts.myTasks}</span>
        </button>

        <button
          type="button"
          className={`op-scope-btn ${scopeTab === 'my_sector' ? 'is-active' : ''}`}
          onClick={() => setScopeTab('my_sector')}
        >
          <span>🍳 Meu Setor</span>
          <span className="op-scope-count">{scopeCounts.mySector}</span>
        </button>

        <button
          type="button"
          className={`op-scope-btn ${scopeTab === 'all_unit' ? 'is-active' : ''}`}
          onClick={() => setScopeTab('all_unit')}
        >
          <span>🏪 Toda a Loja</span>
          <span className="op-scope-count">{scopeCounts.allUnit}</span>
        </button>
      </nav>

      {/* Filtros Rápidos Interativos (Tabs de Status) */}
      <div className="op-filter-strip" role="tablist" aria-label="Filtrar tarefas por status">
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === 'all'}
          className={`op-filter-tab ${activeFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          <span className="op-filter-num">{stats.all}</span>
          <span className="op-filter-label">Todas</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === 'late'}
          className={`op-filter-tab tab-late ${activeFilter === 'late' ? 'is-active' : ''}`}
          onClick={() => setActiveFilter('late')}
        >
          <div className="op-tab-badge-wrap">
            <span className="op-filter-num">{stats.late}</span>
            {stats.late > 0 && <span className="op-pulse-dot" />}
          </div>
          <span className="op-filter-label">Atrasadas</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === 'pending'}
          className={`op-filter-tab tab-pending ${activeFilter === 'pending' ? 'is-active' : ''}`}
          onClick={() => setActiveFilter('pending')}
        >
          <span className="op-filter-num">{stats.pending}</span>
          <span className="op-filter-label">Pendentes</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === 'completed'}
          className={`op-filter-tab tab-completed ${activeFilter === 'completed' ? 'is-active' : ''}`}
          onClick={() => setActiveFilter('completed')}
        >
          <span className="op-filter-num">{stats.completed}</span>
          <span className="op-filter-label">Concluídas</span>
        </button>
      </div>

      {/* Micro-busca Rápida */}
      <div className="op-search-bar">
        <span className="op-search-icon" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Buscar tarefa (ex: bancada, geladeira, arroz)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Buscar tarefa"
        />
        {searchQuery && (
          <button
            type="button"
            className="op-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Limpar busca"
          >
            ✕
          </button>
        )}
      </div>

      {error && <div className="notice warn" style={{ margin: '1rem 0' }}>{error}</div>}

      {/* Conteúdo Principal: Grupos e Tarefas */}
      {loading ? (
        <div className="op-loading-box">
          <div className="op-spinner-ring" />
          <p>Carregando checklist operacional...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="op-empty-state">
          <div className="op-empty-icon" aria-hidden>
            {activeFilter === 'late' ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4 12 14.01l-3-3" />
              </svg>
            ) : activeFilter === 'pending' ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ) : (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <h3 className="op-empty-title">
            {searchQuery
              ? 'Nenhuma tarefa encontrada'
              : activeFilter === 'late'
              ? 'Nenhuma tarefa atrasada!'
              : activeFilter === 'pending'
              ? 'Todas as tarefas pendentes foram realizadas!'
              : activeFilter === 'completed'
              ? 'Nenhuma tarefa concluída ainda'
              : 'Nenhuma tarefa programada para hoje'}
          </h3>
          <p className="op-empty-subtitle">
            {searchQuery
              ? 'Tente buscar com outro termo ou limpe o filtro de busca.'
              : activeFilter === 'late'
              ? 'Excelente! Todas as tarefas da unidade estão dentro do prazo.'
              : 'O painel está sincronizado em tempo real com o servidor.'}
          </p>
        </div>
      ) : (
        <div className="op-groups-list">
          {groups.map((group) => {
            const isOpen = expandedGroups.has(group.name);
            const isFullyCompleted = group.completed === group.total && group.total > 0;

            return (
              <section key={group.name} className="op-group-section">
                {/* Header do Grupo com Barra de Progresso */}
                <div
                  className="op-group-header-card"
                  onClick={() => toggleGroup(group.name)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleGroup(group.name);
                  }}
                >
                  <div className="op-group-top">
                    <div>
                      <div className="op-group-title-row">
                        <h2 className="op-group-name">{group.name}</h2>
                        {group.shift && (
                          <span className="op-shift-pill">{group.shift}</span>
                        )}
                      </div>
                      <div className="op-group-stat-text">
                        {group.completed} de {group.total} finalizadas ({group.progressPercent}%)
                      </div>
                    </div>

                    <div className="op-group-badges-row">
                      {group.late > 0 && (
                        <span className="op-mini-badge badge-late">{group.late} atrasada(s)</span>
                      )}
                      {isFullyCompleted && (
                        <span className="op-mini-badge badge-done">✓ 100%</span>
                      )}
                      <span className="op-chevron" aria-hidden>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          style={{
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso Visual */}
                  <div className="op-progress-track" aria-hidden>
                    <div
                      className={`op-progress-bar ${isFullyCompleted ? 'is-complete' : ''}`}
                      style={{ width: `${group.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Lista de Tarefas do Grupo */}
                {isOpen && (
                  <div className="op-task-list">
                    {group.tasks.map((task) => {
                      const isFinished = task.status === 'completed';
                      const isRejected = task.status === 'rejected';
                      const deadline = getDeadlineInfo(task.due_at, task.status);

                      return (
                        <article
                          key={task.id}
                          className={`op-task-card ${
                            isFinished
                              ? 'is-completed'
                              : deadline.isLate
                              ? 'is-late'
                              : isRejected
                              ? 'is-rejected'
                              : deadline.isUrgent
                              ? 'is-urgent'
                              : 'is-open'
                          }`}
                          onClick={() => setActiveTask(task)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setActiveTask(task);
                          }}
                        >
                          {/* Indicador Lateral de Status */}
                          <div className="op-task-indicator" aria-hidden />

                          <div className="op-task-body">
                            <div className="op-task-headline">
                              <h3 className="op-task-title">
                                {task.checklist_item?.title || 'Tarefa Operacional'}
                              </h3>
                            </div>

                            {task.checklist_item?.description && (
                              <div className="op-task-directive-preview">
                                <span className="op-directive-badge">Diretriz:</span>
                                <span className="op-task-snippet">
                                  {task.checklist_item.description}
                                </span>
                              </div>
                            )}

                            {/* Tags & Prazos */}
                            <div className="op-task-footer">
                              <div className="op-tags-wrap">
                                {task.sector_name && (
                                  <span className="op-tag tag-sector">
                                    📍 {task.sector_name}
                                  </span>
                                )}

                                {task.assigned_to === user?.id ? (
                                  <span className="op-tag tag-assigned-self">
                                    👤 Sua tarefa
                                  </span>
                                ) : task.assigned_name ? (
                                  <span className="op-tag tag-assigned-other">
                                    👤 {task.assigned_name}
                                  </span>
                                ) : null}

                                {task.checklist_item?.is_critical && (
                                  <span className="op-tag tag-critical">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    </svg>
                                    CRÍTICA
                                  </span>
                                )}

                                {task.checklist_item?.requires_photo ? (
                                  <span className="op-tag tag-camera">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                      <circle cx="12" cy="13" r="4" />
                                    </svg>
                                    Câmera Obrigatória
                                  </span>
                                ) : (
                                  <span className="op-tag tag-check">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    Checklist
                                  </span>
                                )}

                                {isRejected && (
                                  <span className="op-tag tag-rejected-alert">
                                    IA Recusou · Refazer Foto
                                  </span>
                                )}
                              </div>

                              {/* Prazo ou Confirmação */}
                              <div className="op-deadline-wrap">
                                {isFinished ? (
                                  <span className="op-status-finished">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    Concluída
                                  </span>
                                ) : (
                                  <span
                                    className={`op-deadline-badge ${
                                      deadline.isLate
                                        ? 'badge-late-time'
                                        : deadline.isUrgent
                                        ? 'badge-urgent-time'
                                        : 'badge-normal-time'
                                    }`}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    {deadline.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Botão de Ação Tátil à Direita */}
                          <div className="op-task-action" aria-hidden>
                            {isFinished ? (
                              <div className="op-action-circle is-done">✓</div>
                            ) : task.checklist_item?.requires_photo ? (
                              <div className="op-action-circle is-camera">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                              </div>
                            ) : (
                              <div className="op-action-circle is-pending">➔</div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Modal de Execução de Tarefa Ativa */}
      {activeTask && (
        <TaskExecutionModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onSuccess={() => {
            void loadTasks(true);
          }}
        />
      )}
    </div>
  );
}
