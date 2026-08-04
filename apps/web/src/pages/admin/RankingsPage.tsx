import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

interface RankRow {
  id: string;
  name: string;
  score: number;
}

export function RankingsPage() {
  const [scope, setScope] = useState<'units' | 'users'>('units');
  const [rankings, setRankings] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ rankings: RankRow[] }>(`/api/score/rankings?scope=${scope}`);
        setRankings(data.rankings);
      } catch {
        setRankings(
          scope === 'units'
            ? [
                { id: '1', name: 'Unidade Centro', score: 92.5 },
                { id: '2', name: 'Unidade Aeroporto', score: 88.0 },
                { id: '3', name: 'Unidade Shopping', score: 76.5 },
              ]
            : [
                { id: 'a', name: 'Pedro Operador', score: 94.2 },
                { id: 'b', name: 'Julia Cozinha', score: 89.1 },
                { id: 'c', name: 'Rafael Salão', score: 81.0 },
              ]
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [scope]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Rankings em Tempo Real</h2>
          <p>Performance comparativa entre unidades e operadores (média do período).</p>
        </div>
        <div className="row">
          <button
            type="button"
            className={`btn btn-sm ${scope === 'units' ? 'btn-primary' : ''}`}
            onClick={() => setScope('units')}
          >
            Unidades
          </button>
          <button
            type="button"
            className={`btn btn-sm ${scope === 'users' ? 'btn-primary' : ''}`}
            onClick={() => setScope('users')}
          >
            Operadores
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="muted">Carregando…</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{scope === 'units' ? 'Unidade' : 'Operador'}</th>
                  <th>Score médio</th>
                  <th>Barra</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{i + 1}</strong>
                    </td>
                    <td>{r.name}</td>
                    <td>
                      <strong>{r.score.toFixed(1)}</strong>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 99,
                          background: 'var(--bg-soft)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, r.score)}%`,
                            height: '100%',
                            background:
                              r.score >= 85
                                ? 'var(--success)'
                                : r.score >= 70
                                  ? 'var(--warning)'
                                  : 'var(--danger)',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
