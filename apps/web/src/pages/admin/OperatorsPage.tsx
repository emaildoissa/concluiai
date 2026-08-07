import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

interface Operator {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: 'operator' | 'manager';
  unit_id?: string | null;
  is_active: boolean;
  created_at: string;
  unit?: { id: string; name: string } | null;
  sector_ids?: string[];
}

interface Unit {
  id: string;
  name: string;
}

interface Sector {
  id: string;
  name: string;
}

export function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'operator' | 'manager'>('operator');
  const [unitId, setUnitId] = useState('');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Operator | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'operator' | 'manager'>('operator');
  const [editUnitId, setEditUnitId] = useState('');
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

  const fetchSectors = async () => {
    try {
      const data = await apiGet<{ sectors: Sector[] }>('/api/sectors');
      setSectors(data.sectors || []);
    } catch {
      setSectors([]);
    }
  };

  const fetchAll = async () => {
    try {
      const data = await apiGet<{ operators: Operator[] }>('/api/operators');
      setOperators(data.operators || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao listar operadores');
    }
    try {
      const data = await apiGet<{ units: Unit[] }>('/api/units');
      setUnits(data.units || []);
    } catch {
      /* units opcional na página */
    }
  };

  useEffect(() => {
    void fetchAll();
    void fetchSectors();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!fullName.trim() || !email.trim()) {
      setMsg('Preencha nome e e-mail.');
      return;
    }
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
      setMsg('Operador criado.');
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setUnitId('');
      setSectorIds([]);
      await fetchAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao criar operador');
    }
  }

  async function toggleActive(op: Operator) {
    setMsg('');
    try {
      await apiPatch(`/api/operators/${op.id}`, { is_active: !op.is_active });
      await fetchAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao atualizar operador');
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
  }

  function toggleSector(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    try {
      await apiPatch(`/api/operators/${editing.id}`, {
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
        role: editRole,
        unit_id: editUnitId || null,
        sector_ids: editSectorIds,
        is_active: editActive,
      });
      setMsg('Operador atualizado.');
      closeEdit();
      await fetchAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao atualizar operador');
    }
  }

  const unitName = (id: string) => units.find((u) => u.id === id)?.name || '—';

  const sectorNames = (ids?: string[]) =>
    (ids || []).map((id) => sectors.find((s) => s.id === id)?.name).filter(Boolean).join(', ');

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Operadores</h2>
          <p>Cadastre e gerencie quem executa as tarefas em cada unidade.</p>
        </div>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Novo operador</h3>
          <form className="form-grid" onSubmit={create}>
            <div className="field">
              <label>Nome completo</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João da Silva" />
            </div>
            <div className="field">
              <label>E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@exemplo.com" />
            </div>
            <div className="field">
              <label>Senha inicial</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="deixe vazio p/ senha automática" />
            </div>
            <div className="field">
              <label>WhatsApp (com DDI e DDD)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999990000" />
            </div>
            <div className="field">
              <label>Papel</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'operator' | 'manager')}>
                <option value="operator">Operador</option>
                <option value="manager">Gerente de unidade</option>
              </select>
            </div>
            <div className="field">
              <label>Unidade</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Sem unidade</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Setores (responsável por)</label>
              <div className="chip-select">
                {sectors.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={sectorIds.includes(s.id) ? 'chip chip-on' : 'chip'}
                    onClick={() => toggleSector(s.id, sectorIds, setSectorIds)}
                  >
                    {s.name}
                  </button>
                ))}
                {sectors.length === 0 && <div className="muted" style={{ fontSize: '0.8rem' }}>Crie setores primeiro.</div>}
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Cadastrar
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Lista ({operators.length})</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <strong>{op.full_name}</strong>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {op.email} {op.phone ? `· ${op.phone}` : ''}
                      </div>
                    </td>
                    <td>
                      {op.unit?.name || (units.find((u) => u.id === op.unit_id)?.name) || '—'}
                      {op.sector_ids?.length ? (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {sectorNames(op.sector_ids)}
                        </div>
                      ) : null}
                    </td>
                    <td>{op.role === 'manager' ? 'Gerente' : 'Operador'}</td>
                    <td>
                      <span className={`badge ${op.is_active ? 'badge-completed' : 'badge-pending'}`}>
                        {op.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(op)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void toggleActive(op)}>
                          {op.is_active ? 'Desativar' : 'Ativar'}
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
            <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Editar operador</h3>
            <form className="form-grid" onSubmit={saveEdit}>
              <div className="field">
                <label>Nome completo</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="field">
                <label>WhatsApp (com DDI e DDD)</label>
                <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+555135083008" />
              </div>
              <div className="field">
                <label>Papel</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'operator' | 'manager')}>
                  <option value="operator">Operador</option>
                  <option value="manager">Gerente de unidade</option>
                </select>
              </div>
              <div className="field">
                <label>Unidade</label>
                <select value={editUnitId} onChange={(e) => setEditUnitId(e.target.value)}>
                  <option value="">Sem unidade</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Setores (responsável por)</label>
                <div className="chip-select">
                  {sectors.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={editSectorIds.includes(s.id) ? 'chip chip-on' : 'chip'}
                      onClick={() => toggleSector(s.id, editSectorIds, setEditSectorIds)}
                    >
                      {s.name}
                    </button>
                  ))}
                  {sectors.length === 0 && <div className="muted" style={{ fontSize: '0.8rem' }}>Crie setores primeiro.</div>}
                </div>
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="edit-active"
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="edit-active" style={{ margin: 0 }}>
                  Ativo
                </label>
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
