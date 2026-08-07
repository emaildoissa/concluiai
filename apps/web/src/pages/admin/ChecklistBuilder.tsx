import { useEffect, useState } from 'react';
import type { Shift } from '@concluiai/shared';
import { SHIFT_LABELS } from '@concluiai/shared';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import {
  loadDemoChecklists,
  loadDemoUnits,
} from '../../lib/demoData';

type DemoChecklist = ReturnType<typeof loadDemoChecklists>[number];
type Checklist = DemoChecklist & { sector_id?: string | null };
type Item = Checklist['items'][number];
interface UnitRow { id: string; name: string; address?: string }

const emptyItem = (): Item => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  is_critical: false,
  requires_photo: true,
  requires_gps: true,
  due_time: '09:00',
  sort_order: 0,
  weight: 1,
});

export function ChecklistBuilder() {
  const [list, setList] = useState<Checklist[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [sectors, setSectors] = useState<UnitRow[]>([]);
  const [editing, setEditing] = useState<Checklist | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchChecklists = async () => {
    try {
      const data = await apiGet<{ checklists: Checklist[] }>('/api/checklists');
      if (data.checklists && data.checklists.length > 0) {
        setList(data.checklists);
      } else {
        setList(loadDemoChecklists());
      }
    } catch {
      setList(loadDemoChecklists());
    }
  };

  const fetchUnits = async () => {
    try {
      const data = await apiGet<{ units: UnitRow[] }>('/api/units');
      if (data.units && data.units.length > 0) {
        setUnits(data.units);
      } else {
        setUnits(loadDemoUnits());
      }
    } catch {
      setUnits(loadDemoUnits());
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
      items: [emptyItem()],
      unit_ids: units[0] ? [units[0].id] : [],
    });
    setOpen(true);
  }

  function startEdit(cl: Checklist) {
    setEditing(structuredClone(cl));
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
    if (!confirm('Remover este checklist?')) return;
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Builder de Checklist</h2>
          <p>Defina tarefas, turnos, recorrência e itens críticos (alerta + peso no score).</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={startNew}>
          + Novo checklist
        </button>
      </div>

      <div className="grid grid-2">
        {list.map((cl) => (
          <div className="card" key={cl.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{cl.name}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {SHIFT_LABELS[cl.shift as Shift]} · {cl.recurrence} · {cl.items.length} itens
                </div>
              </div>
              <span className={`badge ${cl.is_active ? 'badge-completed' : 'badge-pending'}`}>
                {cl.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <ul style={{ margin: '0.75rem 0', paddingLeft: '1.1rem', color: 'var(--text-muted)' }}>
              {cl.items.map((it) => (
                <li key={it.id}>
                  {it.title}{' '}
                  {it.is_critical && <span className="badge badge-critical">crítico</span>}
                  {it.due_time && (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      {' '}
                      · {it.due_time}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => startEdit(cl)}>
                Editar
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(cl.id)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && editing && (
        <div className="modal-backdrop" onClick={() => { if (!saving) setOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{list.some((c) => c.id === editing.id) ? 'Editar' : 'Novo'} checklist</h3>
            <div className="form-grid">
              <div className="field">
                <label>Nome</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Abertura de Cozinha"
                />
              </div>
              <div className="field">
                <label>Descrição</label>
                <textarea
                  rows={2}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Turno</label>
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
                  <label>Recorrência</label>
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
                    <option value="once">Única</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Setor responsável (opcional)</label>
                <select
                  value={editing.sector_id || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, sector_id: e.target.value || null })
                  }
                >
                  <option value="">— Rotativo da unidade —</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  Ao definir um setor, as tarefas são atribuídas só a operadores desse setor, dentro das unidades vinculadas.
                </div>
              </div>

              <div className="field">
                <label>Unidades vinculadas</label>
                <div className="stack">
                  {units.map((u) => (
                    <label key={u.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={editing.unit_ids.includes(u.id)}
                        onChange={(e) => {
                          const unit_ids = e.target.checked
                            ? [...editing.unit_ids, u.id]
                            : editing.unit_ids.filter((id) => id !== u.id);
                          setEditing({ ...editing, unit_ids });
                        }}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Itens / Tarefas</strong>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setEditing({ ...editing, items: [...editing.items, emptyItem()] })
                    }
                  >
                    + Item
                  </button>
                </div>
                {editing.items.map((it, idx) => (
                  <div className="item-editor" key={it.id}>
                    <div className="field">
                      <label>Título</label>
                      <input
                        value={it.title}
                        onChange={(e) => updateItem(idx, { title: e.target.value })}
                        placeholder="Ex: Conferência de gás"
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Horário limite</label>
                        <input
                          type="time"
                          value={it.due_time || ''}
                          onChange={(e) => updateItem(idx, { due_time: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Peso no score</label>
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={it.weight}
                          onChange={(e) => updateItem(idx, { weight: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="row">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={it.is_critical}
                          onChange={(e) => updateItem(idx, { is_critical: e.target.checked })}
                        />
                        Item crítico (alerta WhatsApp + peso extra)
                      </label>
                      <div className="field">
                        <label>Prova</label>
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
                          <option value="photo">Foto obrigatória</option>
                          <option value="check">Confirmação (✓)</option>
                          <option value="both">✓ + foto opcional</option>
                        </select>
                      </div>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={it.requires_gps}
                          onChange={(e) => updateItem(idx, { requires_gps: e.target.checked })}
                        />
                        GPS obrigatório
                      </label>
                    </div>
                    {editing.items.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        style={{ marginTop: 8 }}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            items: editing.items.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        Remover item
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => { if (!saving) setOpen(false); }} disabled={saving}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar checklist'}
                </button>
              </div>
              {saving && <div className="muted" style={{ textAlign: 'right', marginTop: 8 }}>Salvando e gerando tarefas… aguarde.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
