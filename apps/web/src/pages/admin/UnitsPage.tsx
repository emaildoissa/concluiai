import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { loadDemoUnits, DEMO_UNITS } from '../../lib/demoData';

type Unit = (typeof DEMO_UNITS)[number] & { operation_days?: number[] | null; closed_today?: boolean };

const DAYS = [
  { v: 0, label: 'Dom' },
  { v: 1, label: 'Seg' },
  { v: 2, label: 'Ter' },
  { v: 3, label: 'Qua' },
  { v: 4, label: 'Qui' },
  { v: 5, label: 'Sex' },
  { v: 6, label: 'Sáb' },
];

function allDays(): number[] {
  return DAYS.map((d) => d.v);
}

function isTodayClosed(u: Unit): boolean {
  if (!u.operation_days || u.operation_days.length === 0) return false;
  const today = new Date().getDay();
  return !u.operation_days.includes(today);
}

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [operationDays, setOperationDays] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editOperationDays, setEditOperationDays] = useState<number[] | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchUnits = async () => {
    try {
      const data = await apiGet<{ units: Unit[] }>('/api/units');
      if (data.units && data.units.length > 0) {
        setUnits(data.units);
      } else {
        setUnits(loadDemoUnits());
      }
    } catch {
      setUnits(loadDemoUnits());
    }
  };

  useEffect(() => {
    void fetchUnits();
  }, []);

  function toggleDay(v: number) {
    setOperationDays((prev) => {
      const base = prev == null ? allDays() : prev;
      const has = base.includes(v);
      const next = has ? base.filter((d) => d !== v) : [...base, v].sort((a, b) => a - b);
      return next.length === 7 ? null : next;
    });
  }

  function toggleEditDay(v: number) {
    setEditOperationDays((prev) => {
      const base = prev == null ? allDays() : prev;
      const has = base.includes(v);
      const next = has ? base.filter((d) => d !== v) : [...base, v].sort((a, b) => a - b);
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
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload = {
      id: editing.id,
      name: editName.trim(),
      address: editAddress.trim() || '—',
      operation_days: editOperationDays,
      is_active: editing.is_active,
    };
    try {
      await apiPost('/api/units', payload);
      setMsg({ type: 'ok', text: 'Unidade atualizada.' });
      closeEdit();
      await fetchUnits();
    } catch (err) {
      setMsg({ type: 'err', text: `Falha ao salvar: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      address: address.trim() || '—',
      operation_days: operationDays,
      is_active: true,
    };
    try {
      await apiPost('/api/units', payload);
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao adicionar unidade', err);
      alert(`Falha ao adicionar unidade: ${err instanceof Error ? err.message : String(err)}`);
    }
    setName('');
    setAddress('');
    setOperationDays(null);
  }

  async function toggle(u: Unit) {
    try {
      await apiPost('/api/units', { ...u, is_active: !u.is_active });
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao alterar status da unidade', err);
      alert(`Falha ao alterar unidade: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover unidade?')) return;
    try {
      await apiDelete(`/api/units/${id}`);
      await fetchUnits();
    } catch (err) {
      console.error('Erro ao remover unidade', err);
      alert(`Falha ao remover unidade: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Gestão Multiloja</h2>
          <p>Cadastre e acompanhe de 2 a dezenas de unidades.</p>
        </div>
      </div>

      {msg && (
        <div className={`notice ${msg.type === 'ok' ? '' : ''}`} style={msg.type === 'ok' ? { color: '#86efac' } : undefined}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Nova unidade</h3>
          <form className="form-grid" onSubmit={addUnit}>
            <div className="field">
              <label>Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Unidade Norte" />
            </div>
            <div className="field">
              <label>Endereço</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua..." />
            </div>
            <div className="field">
              <label>Dias de operação</label>
              <div className="chip-select">
                {DAYS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={`chip ${operationDays != null && operationDays.includes(d.v) ? 'chip-on' : ''}`}
                    onClick={() => toggleDay(d.v)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                {operationDays == null
                  ? 'Todos os dias (default).'
                  : `Fechado em: ${DAYS.filter((d) => !operationDays.includes(d.v)).map((d) => d.label).join(', ')}`}
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Cadastrar
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Unidades ({units.length})</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {u.address}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-completed' : 'badge-pending'}`}>
                        {u.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>{isTodayClosed(u) ? '—' : (u.score_total ?? '—')}</td>
                    <td>
                      {isTodayClosed(u) && (
                        <span className="badge badge-pending" style={{ marginBottom: 4, display: 'inline-block' }}>
                          Fechada hoje
                        </span>
                      )}
                      <div className="row">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(u)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void toggle(u)}>
                          {u.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(u.id)}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={closeEdit}
        >
          <div
            className="card"
            style={{ width: 'min(480px, 92vw)', padding: '1.25rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Editar unidade</h3>
            <form className="form-grid" onSubmit={saveEdit}>
              <div className="field">
                <label>Nome</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="field">
                <label>Endereço</label>
                <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
              <div className="field">
                <label>Dias de operação</label>
                <div className="chip-select">
                  {DAYS.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      className={`chip ${editOperationDays != null && editOperationDays.includes(d.v) ? 'chip-on' : ''}`}
                      onClick={() => toggleEditDay(d.v)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {editOperationDays == null
                    ? 'Todos os dias (default).'
                    : `Fechado em: ${DAYS.filter((d) => !editOperationDays.includes(d.v)).map((d) => d.label).join(', ')}`}
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
