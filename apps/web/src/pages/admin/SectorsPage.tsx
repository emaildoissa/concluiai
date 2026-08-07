import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';

interface Unit {
  id: string;
  name: string;
}

interface Sector {
  id: string;
  unit_id: string;
  name: string;
  sort_order: number;
}

export function SectorsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const fetchUnits = async () => {
    try {
      const data = await apiGet<{ units: Unit[] }>('/api/units');
      setUnits(data.units || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao listar unidades');
    }
  };

  const fetchSectors = async () => {
    try {
      const data = await apiGet<{ sectors: Sector[] }>('/api/sectors');
      setSectors(data.sectors || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao listar setores');
    }
  };

  useEffect(() => {
    void fetchUnits();
    void fetchSectors();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!name.trim() || !unitId) return;
    try {
      await apiPost('/api/sectors', { unit_id: unitId, name: name.trim() });
      setMsg('Setor criado.');
      setName('');
      await fetchSectors();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao criar setor');
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover setor? Os operadores deixam de ser vinculados a ele.')) return;
    try {
      await apiDelete(`/api/sectors/${id}`);
      await fetchSectors();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao remover setor');
    }
  }

  const unitName = (id: string) => units.find((u) => u.id === id)?.name || '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Setores</h2>
          <p>Ex.: Cozinha, Freezers, Estoque. Vinculados a operadores e a checklists para a tarefa certa ir a quem é de direito.</p>
        </div>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Novo setor</h3>
          <form className="form-grid" onSubmit={add}>
            <div className="field">
              <label>Unidade</label>
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
              <label>Nome do setor</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cozinha" />
            </div>
            <button className="btn btn-primary" type="submit">
              Cadastrar
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Setores ({sectors.length})</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{unitName(s.unit_id)}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}