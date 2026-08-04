import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { loadDemoUnits, DEMO_UNITS } from '../../lib/demoData';

type Unit = (typeof DEMO_UNITS)[number];

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

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

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      address: address.trim() || '—',
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
                    <td>{u.score_total ?? '—'}</td>
                    <td>
                      <div className="row">
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
    </div>
  );
}
