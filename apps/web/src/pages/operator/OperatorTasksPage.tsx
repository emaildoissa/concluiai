import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { apiGet } from '../../lib/api';
import {
  TaskExecutionModal,
  type TaskItemData,
} from '../../components/operator/TaskExecutionModal';

interface ChecklistGroup {
  name: string;
  shift: string | null;
  tasks: TaskItemData[];
  late: number;
  pending: number;
  completed: number;
}

interface UnitOption {
  id: string;
  name: string;
}

function getTodayBrazil(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function formatTimePtBR(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '—';
  }
}

export function OperatorTasksPage() {
  const { user, logout, demoMode, isAdmin, isManager } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [groups, setGroups] = useState<ChecklistGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskItemData | null>(null);

  // Carrega unidades para Admin/Gerente escolherem se necessário
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

  const loadTasks = useCallback(async () => {
    const unitId = selectedUnitId || user?.unit_id;
    if (!unitId && !demoMode) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const today = getTodayBrazil();

    if (demoMode) {
      // Tarefas simuladas
      const mockTasks: TaskItemData[] = [
        {
          id: 'demo-1',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: today,
          due_at: `${today}T11:00:00-03:00`,
          status: 'pending',
          checklist_name: 'Abertura de Cozinha',
          checklist_shift: 'morning',
          checklist_item: {
            id: 'item-1',
            title: 'Higienização da Bancada de Inox',
            description: 'Passar álcool 70% em toda a superfície antes de iniciar a manipulação.',
            is_critical: true,
            execution_mode: 'photo',
            requires_photo: true,
          },
        },
        {
          id: 'demo-2',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: today,
          due_at: `${today}T11:30:00-03:00`,
          status: 'pending',
          checklist_name: 'Abertura de Cozinha',
          checklist_shift: 'morning',
          checklist_item: {
            id: 'item-2',
            title: 'Conferência de Temperatura das Geladeiras',
            description: 'Verificar se o termômetro marca entre 2°C e 6°C.',
            is_critical: false,
            execution_mode: 'check',
          },
        },
        {
          id: 'demo-3',
          unit_id: unitId || '22222222-2222-2222-2222-222222222221',
          scheduled_date: today,
          due_at: `${today}T15:00:00-03:00`,
          status: 'pending',
          checklist_name: 'Fechamento & Limpeza',
          checklist_shift: 'night',
          checklist_item: {
            id: 'item-3',
            title: 'Limpeza dos Ralos e Coifa',
            description: 'Retirar resíduos sólidos e lavar com desengordurante.',
            is_critical: true,
            execution_mode: 'both',
            requires_photo: true,
          },
        },
      ];

      buildGroupMap(mockTasks);
      setLoading(false);
      return;
    }

    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase não conectado.');

      const { data, error: queryError } = await sb
        .from('task_instances')
        .select(
          `
          id, scheduled_date, due_at, status, checked, notes, completed_at, unit_id,
          checklist_item:checklist_items (
            id, title, description, is_critical, requires_photo, requires_gps, due_time, execution_mode,
            checklist:checklists ( name, shift )
          )
        `
        )
        .eq('unit_id', unitId)
        .eq('scheduled_date', today)
        .order('due_at', { ascending: true });

      if (queryError) throw queryError;

      const mapped: TaskItemData[] = (data || []).map((row: any) => {
        const item = row.checklist_item;
        const checklist = Array.isArray(item?.checklist)
          ? item.checklist[0]
          : item?.checklist;

        return {
          id: row.id,
          unit_id: row.unit_id,
          scheduled_date: row.scheduled_date,
          due_at: row.due_at,
          status: row.status,
          checked: row.checked,
          notes: row.notes,
          completed_at: row.completed_at,
          checklist_name: checklist?.name || 'Checklist Geral',
          checklist_shift: checklist?.shift || null,
          checklist_item: {
            id: item?.id,
            title: item?.title || 'Tarefa',
            description: item?.description || null,
            is_critical: item?.is_critical || false,
            requires_photo: item?.requires_photo || false,
            requires_gps: item?.requires_gps || false,
            execution_mode: item?.execution_mode || (item?.requires_photo ? 'photo' : 'check'),
          },
        };
      });

      buildGroupMap(mapped);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao carregar as tarefas do dia.');
    } finally {
      setLoading(false);
    }
  }, [selectedUnitId, user?.unit_id, demoMode]);

  function buildGroupMap(tasks: TaskItemData[]) {
    const now = new Date().getTime();
    const map = new Map<string, ChecklistGroup>();

    for (const t of tasks) {
      const gName = t.checklist_name || 'Checklist Geral';
      let g = map.get(gName);
      if (!g) {
        g = {
          name: gName,
          shift: t.checklist_shift || null,
          tasks: [],
          late: 0,
          pending: 0,
          completed: 0,
        };
        map.set(gName, g);
      }
      g.tasks.push(t);

      if (t.status === 'completed') {
        g.completed += 1;
      } else {
        const dueTime = new Date(t.due_at).getTime();
        if (dueTime < now) {
          g.late += 1;
        } else {
          g.pending += 1;
        }
      }
    }

    const sorted = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    setGroups(sorted);

    // Abre o primeiro grupo por padrão se houver
    if (sorted.length > 0 && expanded.size === 0) {
      setExpanded(new Set([sorted[0].name]));
    }
  }

  useEffect(() => {
    if (selectedUnitId || demoMode) {
      void loadTasks();
    }
  }, [selectedUnitId, loadTasks, demoMode]);

  const toggleGroup = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalLate = groups.reduce((acc, g) => acc + g.late, 0);
  const totalPending = groups.reduce((acc, g) => acc + g.pending, 0);
  const totalCompleted = groups.reduce((acc, g) => acc + g.completed, 0);

  const currentUnitName =
    units.find((u) => u.id === selectedUnitId)?.name || 'Sua Unidade';

  return (
    <div className="operator-container">
      {/* Barra Superior Mobile-First */}
      <header className="operator-header">
        <div className="operator-brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="operator-brand-title">ConcluíAI Operador</div>
            <div className="operator-unit-label">📍 {currentUnitName}</div>
          </div>
        </div>

        <div className="operator-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadTasks()}
            title="Atualizar tarefas"
          >
            🔄
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void logout()}
            title="Sair"
          >
            🚪 Sair
          </button>
        </div>
      </header>

      {/* Seletor de Unidade (para gestores testando) */}
      {(isAdmin || isManager) && units.length > 1 && (
        <div className="operator-unit-selector">
          <label>Visualizando como unidade:</label>
          <select
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
      )}

      {/* Resumo / Métricas Rápidas */}
      <div className="operator-summary-cards">
        <div className="op-stat-card op-stat-late">
          <div className="op-stat-num">{totalLate}</div>
          <div className="op-stat-label">Atrasadas</div>
        </div>
        <div className="op-stat-card op-stat-pending">
          <div className="op-stat-num">{totalPending}</div>
          <div className="op-stat-label">Pendentes</div>
        </div>
        <div className="op-stat-card op-stat-completed">
          <div className="op-stat-num">{totalCompleted}</div>
          <div className="op-stat-label">Finalizadas</div>
        </div>
      </div>

      {error && <div className="notice warn" style={{ margin: '1rem 0' }}>{error}</div>}

      {/* Lista de Checklists */}
      {loading ? (
        <div className="operator-loading">
          <div className="spinner" />
          <p>Carregando tarefas de hoje...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="operator-empty-card">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
          <h3>Nenhuma tarefa pendente!</h3>
          <p className="muted">
            Todas as tarefas da sua unidade foram finalizadas ou não há checklists para hoje.
          </p>
        </div>
      ) : (
        <div className="operator-groups-list">
          {groups.map((group) => {
            const isOpen = expanded.has(group.name);
            return (
              <div key={group.name} className="operator-group-card">
                <div
                  className="operator-group-header"
                  onClick={() => toggleGroup(group.name)}
                >
                  <div>
                    <div className="operator-group-title">{group.name}</div>
                    <div className="operator-group-meta">
                      {group.shift ? `Turno: ${group.shift} · ` : ''}
                      {group.tasks.length} {group.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                    </div>
                  </div>

                  <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                    {group.late > 0 && (
                      <span className="badge badge-danger">{group.late} atrasada(s)</span>
                    )}
                    {group.pending > 0 && (
                      <span className="badge badge-pending">{group.pending} pendente(s)</span>
                    )}
                    {group.completed === group.tasks.length && (
                      <span className="badge badge-completed">✓ 100%</span>
                    )}
                    <span className="chevron-icon">{isOpen ? '▾' : '▸'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="operator-group-tasks">
                    {group.tasks.map((task) => {
                      const isFinished = task.status === 'completed';
                      const isRejected = task.status === 'rejected';
                      const isLate =
                        !isFinished && new Date(task.due_at).getTime() < Date.now();

                      return (
                        <div
                          key={task.id}
                          className={`operator-task-item ${
                            isFinished
                              ? 'task-done'
                              : isLate
                              ? 'task-late'
                              : isRejected
                              ? 'task-rejected'
                              : 'task-open'
                          }`}
                          onClick={() => setActiveTask(task)}
                        >
                          <div className="op-task-main">
                            <div className="op-task-title-row">
                              <span className="op-task-title">
                                {task.checklist_item?.title || 'Tarefa'}
                              </span>
                              <span className="op-task-time">
                                ⏰ {formatTimePtBR(task.due_at)}
                              </span>
                            </div>

                            <div className="op-task-meta-row">
                              {task.checklist_item?.is_critical && (
                                <span className="tag-critical">CRÍTICA</span>
                              )}
                              {task.checklist_item?.requires_photo ? (
                                <span className="tag-photo">📸 Foto</span>
                              ) : (
                                <span className="tag-check">☑️ Check</span>
                              )}
                              {isRejected && (
                                <span className="tag-rejected">IA Recusou — Refazer</span>
                              )}
                              {isFinished && (
                                <span className="tag-success">Finalizada ✓</span>
                              )}
                            </div>
                          </div>

                          <div className="op-task-action-arrow">
                            {isFinished ? '✓' : '➔'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
            void loadTasks();
          }}
        />
      )}
    </div>
  );
}
