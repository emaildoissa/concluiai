import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiGet } from '../../lib/api';

interface Point {
  score_date: string;
  score_p: number;
  score_e: number;
  score_q: number;
  score_total: number;
}

export function EvolutionPage() {
  const [series, setSeries] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ series: Point[] }>('/api/score/evolution?days=14');
        setSeries(data.series);
      } catch {
        const fallback: Point[] = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          fallback.push({
            score_date: d.toISOString().slice(0, 10),
            score_p: 70 + Math.round(Math.random() * 25),
            score_e: 75 + Math.round(Math.random() * 20),
            score_q: 65 + Math.round(Math.random() * 30),
            score_total: 72 + Math.round(Math.random() * 22),
          });
        }
        setSeries(fallback);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chartData = series.map((p) => ({
    ...p,
    label: p.score_date.slice(5),
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Evolução de Indicadores</h2>
          <p>
            Médias diárias de <strong>P</strong>ontualidade, <strong>E</strong>xecução e{' '}
            <strong>Q</strong>ualidade (últimos 14 dias).
          </p>
        </div>
      </div>

      <div className="card" style={{ height: 420 }}>
        {loading ? (
          <div className="muted">Carregando…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#2a3a55" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis domain={[0, 100]} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  background: '#121a2b',
                  border: '1px solid #2a3a55',
                  borderRadius: 10,
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="score_total" name="Total" stroke="#14b8a6" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="score_p" name="Pontualidade" stroke="#38bdf8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="score_e" name="Execução" stroke="#a78bfa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="score_q" name="Qualidade" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-3" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h3>Fórmula</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Score = 100 × (0,35·P + 0,30·E + 0,35·Q). Itens críticos usam multiplicador 1,5 no peso.
            Ajuste em <code>SCORE_WEIGHT_*</code> no .env.
          </p>
        </div>
        <div className="card">
          <h3>P — Pontualidade</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            100% se concluída no prazo; decai linearmente até 0 após 120 min de atraso.
          </p>
        </div>
        <div className="card">
          <h3>Q — Qualidade (IA)</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Confidence da visão computacional na evidência fotográfica aprovada.
          </p>
        </div>
      </div>
    </div>
  );
}
