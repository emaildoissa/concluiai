import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DEMO_MOVEMENTS, DEMO_STOCK, DEMO_UNITS } from '../../lib/demoData';

interface StockRow {
  product_id: string;
  unit_id: string;
  quantity: number;
  updated_at?: string;
  products: {
    id: string;
    name: string;
    sku?: string | null;
    average_cost?: number | null;
    min_stock?: number | null;
    category_id?: { name: string } | null;
    uom_id?: { name?: string; abbreviation?: string } | null;
  } | null;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  unit_cost?: number | null;
  reason?: string | null;
  source?: string | null;
  created_at?: string;
  unit_id?: { id?: string; name: string } | null;
  products?: { id: string; name: string; uom_id?: { name?: string; abbreviation?: string } | null } | null;
  created_by?: { id?: string; full_name: string } | null;
}

interface ProductOption {
  id: string;
  name: string;
  uom_id?: { id?: string; name?: string; abbreviation?: string } | null;
}

interface UnitOption {
  id: string;
  name: string;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const MOVEMENT_LABEL: Record<string, string> = {
  in: 'Entrada',
  out: 'Saída',
  adjust: 'Ajuste',
  count: 'Contagem',
  loss: 'Perda',
};

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function EstoquePage() {
  const { demoMode } = useAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitFilter, setUnitFilter] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [formType, setFormType] = useState<'in' | 'out'>('in');
  const [formProduct, setFormProduct] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formReason, setFormReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    try {
      const [stockRes, movRes, prodRes, unitRes] = await Promise.all([
        apiGet<{ stock: StockRow[] }>(`/api/estoque/stock${unitFilter ? `?unit_id=${unitFilter}` : ''}`),
        apiGet<{ movements: Movement[] }>(
          `/api/estoque/movements?limit=50${unitFilter ? `&unit_id=${unitFilter}` : ''}`
        ),
        apiGet<{ products: ProductOption[] }>('/api/estoque/products'),
        apiGet<{ units: UnitOption[] }>('/api/units'),
      ]);
      setStock(stockRes.stock || []);
      setMovements(movRes.movements || []);
      setProducts(prodRes.products || []);
      setUnits(unitRes.units || []);
    } catch {
      setStock(structuredClone(DEMO_STOCK));
      setMovements(structuredClone(DEMO_MOVEMENTS));
      const demoProducts = DEMO_STOCK.map((s) => ({
        id: s.products.id,
        name: s.products.name,
        uom_id: s.products.uom_id,
      }));
      setProducts(demoProducts);
      setUnits(
        DEMO_UNITS.map((u) => ({
          id: u.id,
          name: u.name,
        }))
      );
    }
  }

  useEffect(() => {
    void fetchAll();
  }, [unitFilter]);

  const kpis = useMemo(() => {
    const totalQty = stock.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
    const totalValue = stock.reduce((acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.products?.average_cost) || 0), 0);
    const low = stock.filter((r) => (Number(r.quantity) || 0) > 0 && (Number(r.quantity) || 0) < (Number(r.products?.min_stock) || 0)).length;
    const zero = stock.filter((r) => (Number(r.quantity) || 0) <= 0).length;
    return {
      products: stock.length,
      totalQty,
      totalValue,
      low,
      zero,
    };
  }, [stock]);

  function stockBadge(r: StockRow) {
    const qty = Number(r.quantity) || 0;
    const min = Number(r.products?.min_stock) || 0;
    if (qty <= 0) return { cls: 'badge-critical', label: 'Zerado' };
    if (qty < min) return { cls: 'badge-pending', label: 'Baixo' };
    return { cls: 'badge-completed', label: 'OK' };
  }

  function movementBadge(m: Movement) {
    switch (m.movement_type) {
      case 'in':
        return { cls: 'badge-completed', label: 'Entrada' };
      case 'out':
        return { cls: 'badge-late', label: 'Saída' };
      case 'loss':
        return { cls: 'badge-rejected', label: 'Perda' };
      default:
        return { cls: 'badge-info', label: MOVEMENT_LABEL[m.movement_type] || m.movement_type };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!formProduct) {
      setMsg({ type: 'err', text: 'Selecione um produto.' });
      return;
    }
    const quantity = Number(formQty);
    if (!quantity || quantity <= 0) {
      setMsg({ type: 'err', text: 'Quantidade deve ser maior que zero.' });
      return;
    }
    const unitCost = formType === 'in' && formCost ? Number(formCost) : null;
    if (formType === 'in' && formCost && (!unitCost || unitCost < 0)) {
      setMsg({ type: 'err', text: 'Custo unitário inválido.' });
      return;
    }

    setSaving(true);
    try {
      await apiPost<{ ok: boolean }>('/api/estoque/movements', {
        productId: formProduct,
        movementType: formType,
        quantity,
        unitCost,
        unitId: formUnit || null,
        reason: formReason.trim() || null,
      });
      setMsg({ type: 'ok', text: 'Movimentação registrada.' });
      setFormProduct('');
      setFormQty('');
      setFormCost('');
      setFormReason('');
      await fetchAll();
    } catch (err) {
      if (demoMode) {
        setMsg({
          type: 'ok',
          text: 'Modo demo: movimentação registrada localmente (sem banco de dados).',
        });
        const demoMove: Movement = {
          id: `mv-demo-${Date.now()}`,
          movement_type: formType,
          quantity,
          unit_cost: unitCost,
          reason: formReason.trim() || null,
          source: 'dashboard',
          created_at: new Date().toISOString(),
          unit_id: formUnit ? units.find((u) => u.id === formUnit) ?? null : null,
          products: products.find((p) => p.id === formProduct) ?? null,
          created_by: { id: '00000000-0000-0000-0000-000000000001', full_name: 'Modo demo' },
        };
        setMovements((prev) => [demoMove, ...prev]);
        setStock((prev) => {
          const delta = formType === 'in' ? quantity : -quantity;
          const found = prev.find((r) => r.product_id === formProduct);
          if (found) {
            return prev.map((r) =>
              r.product_id === formProduct ? { ...r, quantity: Math.max(0, (Number(r.quantity) || 0) + delta) } : r
            );
          }
          return [
            ...prev,
            {
              product_id: formProduct,
              unit_id: formUnit || 'u-demo',
              quantity: Math.max(0, delta),
              products: products.find((p) => p.id === formProduct) ?? null,
            },
          ];
        });
        setFormProduct('');
        setFormQty('');
        setFormCost('');
        setFormReason('');
      } else {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Falha ao registrar movimentação.' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Estoque</h2>
          <p>Saldo por produto, movimentações (web e WhatsApp) e registro de entrada/saída.</p>
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Unidade</label>
          <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">Todas as unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg && (
        <div className={`notice ${msg.type === 'err' ? 'warn' : ''}`} style={msg.type === 'ok' ? { color: '#86efac' } : undefined}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <h3>Produtos</h3>
          <div className="stat-value">{kpis.products}</div>
          <div className="stat-sub">itens em estoque</div>
        </div>
        <div className="card">
          <h3>Saldo total</h3>
          <div className="stat-value">{kpis.totalQty}</div>
          <div className="stat-sub">unidades somadas</div>
        </div>
        <div className="card">
          <h3>Valor em estoque</h3>
          <div className="stat-value">{brl.format(kpis.totalValue)}</div>
          <div className="stat-sub">quantidade × custo médio</div>
        </div>
        <div className="card">
          <h3>Abaixo do mínimo</h3>
          <div className="stat-value">{kpis.low}</div>
          <div className="stat-sub">{kpis.zero} zerados</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Saldo atual ({stock.length})</h3>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cat.</th>
                  <th>Saldo</th>
                  <th>Mín.</th>
                  <th>Status</th>
                  <th>Custo médio</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => {
                  const badge = stockBadge(r);
                  return (
                    <tr key={`${r.product_id}-${r.unit_id}`}>
                      <td>
                        <strong>{r.products?.name || 'Produto'}</strong>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {r.products?.uom_id?.abbreviation || r.products?.uom_id?.name || 'un'}
                        </div>
                      </td>
                      <td className="muted">{r.products?.category_id?.name || '—'}</td>
                      <td>{Number(r.quantity) || 0}</td>
                      <td className="muted">{Number(r.products?.min_stock) || 0}</td>
                      <td>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td>{r.products?.average_cost ? brl.format(Number(r.products.average_cost)) : '—'}</td>
                    </tr>
                  );
                })}
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                      Nenhum produto com saldo registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>Movimentações recentes</h3>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Origem</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const badge = movementBadge(m);
                  return (
                    <tr key={m.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(m.created_at)}
                      </td>
                      <td>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td>
                        <strong>{m.products?.name || 'Produto'}</strong>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {m.unit_id?.name || '—'}
                          {m.products?.uom_id?.abbreviation ? ` · ${m.products.uom_id.abbreviation}` : ''}
                        </div>
                      </td>
                      <td>{Number(m.quantity) || 0}</td>
                      <td>
                        {m.source === 'whatsapp' ? (
                          <span className="badge badge-info">WhatsApp</span>
                        ) : (
                          <span className="badge badge-completed">Web</span>
                        )}
                      </td>
                      <td className="muted" style={{ maxWidth: 180 }}>
                        {m.reason || '—'}
                        {m.created_by?.full_name ? (
                          <div style={{ fontSize: '0.8rem' }}>{m.created_by.full_name}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Registrar movimentação</h3>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>Tipo</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as 'in' | 'out')}>
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
              </select>
            </div>
            <div className="field">
              <label>Produto</label>
              <select value={formProduct} onChange={(e) => setFormProduct(e.target.value)}>
                <option value="">Selecione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                step="any"
                value={formQty}
                onChange={(e) => setFormQty(e.target.value)}
                placeholder="Ex.: 10"
              />
            </div>
            <div className="field">
              <label>Custo unitário (entrada)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                placeholder={formType === 'in' ? 'Ex.: 4.50' : 'apenas entrada'}
                disabled={formType !== 'in'}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Unidade</label>
              <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)}>
                <option value="">Central</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Motivo / observação</label>
              <input
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Ex.: reposição do fornecedor"
              />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar movimentação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
