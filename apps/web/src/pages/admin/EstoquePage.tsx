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
  
  // Filtros & Abas
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
  const [unitFilter, setUnitFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'zero'>('all');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal de Movimentação Rápida
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formType, setFormType] = useState<'in' | 'out' | 'loss'>('in');
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
      if (stockRes.stock && stockRes.stock.length > 0) {
        setStock(stockRes.stock);
      } else if (demoMode) {
        setStock(structuredClone(DEMO_STOCK));
      } else {
        setStock([]);
      }

      if (movRes.movements && movRes.movements.length > 0) {
        setMovements(movRes.movements);
      } else if (demoMode) {
        setMovements(structuredClone(DEMO_MOVEMENTS));
      } else {
        setMovements([]);
      }

      if (prodRes.products && prodRes.products.length > 0) {
        setProducts(prodRes.products);
      } else if (demoMode) {
        const demoProducts = DEMO_STOCK.map((s) => ({
          id: s.products.id,
          name: s.products.name,
          uom_id: s.products.uom_id,
        }));
        setProducts(demoProducts);
      } else {
        setProducts([]);
      }

      if (unitRes.units && unitRes.units.length > 0) {
        setUnits(unitRes.units);
      } else if (demoMode) {
        setUnits(
          DEMO_UNITS.map((u) => ({
            id: u.id,
            name: u.name,
          }))
        );
      } else {
        setUnits([]);
      }
    } catch {
      if (demoMode) {
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
      } else {
        setStock([]);
        setMovements([]);
        setProducts([]);
        setUnits([]);
      }
    }
  }

  useEffect(() => {
    void fetchAll();
  }, [unitFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const totalQty = stock.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
    const totalValue = stock.reduce(
      (acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.products?.average_cost) || 0),
      0
    );
    const low = stock.filter((r) => {
      const q = Number(r.quantity) || 0;
      const min = Number(r.products?.min_stock) || 0;
      return q > 0 && q < min;
    }).length;
    const zero = stock.filter((r) => (Number(r.quantity) || 0) <= 0).length;

    return {
      products: stock.length,
      totalQty,
      totalValue,
      low,
      zero,
    };
  }, [stock]);

  // Filtragem de Saldos
  const filteredStock = useMemo(() => {
    return stock.filter((r) => {
      const nameMatch = (r.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const catMatch = (r.products?.category_id?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSearch = nameMatch || catMatch;

      if (!matchesSearch) return false;

      const qty = Number(r.quantity) || 0;
      const min = Number(r.products?.min_stock) || 0;

      if (statusFilter === 'low') return qty > 0 && qty < min;
      if (statusFilter === 'zero') return qty <= 0;
      return true;
    });
  }, [stock, searchQuery, statusFilter]);

  // Filtragem de Movimentações
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const nameMatch = (m.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const reasonMatch = (m.reason || '').toLowerCase().includes(searchQuery.toLowerCase());
      const userMatch = (m.created_by?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return nameMatch || reasonMatch || userMatch;
    });
  }, [movements, searchQuery]);

  // Item selecionado no formulário para projeção
  const selectedProductStock = useMemo(() => {
    if (!formProduct) return null;
    return stock.find((s) => s.product_id === formProduct);
  }, [formProduct, stock]);

  const projectedQuantity = useMemo(() => {
    if (!selectedProductStock) return null;
    const current = Number(selectedProductStock.quantity) || 0;
    const delta = Number(formQty) || 0;
    if (formType === 'in') return current + delta;
    return Math.max(0, current - delta);
  }, [selectedProductStock, formQty, formType]);

  const openMovementForProduct = (productId: string, defaultType: 'in' | 'out' = 'in') => {
    setFormProduct(productId);
    setFormType(defaultType);
    setFormQty('');
    setFormCost('');
    setFormReason('');
    setIsModalOpen(true);
  };

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
      setMsg({ type: 'ok', text: 'Movimentação registrada com sucesso.' });
      setIsModalOpen(false);
      setFormProduct('');
      setFormQty('');
      setFormCost('');
      setFormReason('');
      await fetchAll();
    } catch (err) {
      if (demoMode) {
        setMsg({
          type: 'ok',
          text: 'Modo demo: movimentação registrada na memória local.',
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
          created_by: { id: '00000000-0000-0000-0000-000000000001', full_name: 'Gestor Demo' },
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
        setIsModalOpen(false);
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
    <div className="stock-page-wrap">
      {/* Header da Página */}
      <div className="page-header">
        <div>
          <h2>Gestão de Estoque & Insumos</h2>
          <p>
            Monitoramento de saldos por unidade, controle de perdas e extrato de auditoria (Web & WhatsApp).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormProduct('');
              setFormQty('');
              setFormCost('');
              setFormReason('');
              setIsModalOpen(true);
            }}
          >
            + Registrar Movimentação
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`notice ${msg.type === 'err' ? 'warn' : ''}`}
          style={msg.type === 'ok' ? { color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' } : undefined}
        >
          {msg.text}
        </div>
      )}

      {/* Grid de KPIs Interativos */}
      <div className="stock-kpi-grid">
        <div
          className={`stock-kpi-card ${statusFilter === 'all' && activeTab === 'stock' ? 'is-active-filter' : ''}`}
          onClick={() => {
            setActiveTab('stock');
            setStatusFilter('all');
          }}
        >
          <div className="stock-kpi-header">
            <span>Total de Itens</span>
            <span className="badge badge-info">{kpis.products} SKUs</span>
          </div>
          <div className="stock-kpi-val">{kpis.totalQty}</div>
          <div className="stock-kpi-sub">unidades físicas em estoque</div>
        </div>

        <div className="stock-kpi-card" onClick={() => setActiveTab('stock')}>
          <div className="stock-kpi-header">
            <span>Valor Patrimonial</span>
            <span className="badge badge-completed">Ativo</span>
          </div>
          <div className="stock-kpi-val" style={{ color: '#38bdf8' }}>
            {brl.format(kpis.totalValue)}
          </div>
          <div className="stock-kpi-sub">quantidade × custo médio</div>
        </div>

        <div
          className={`stock-kpi-card ${statusFilter === 'low' ? 'is-active-filter' : ''}`}
          onClick={() => {
            setActiveTab('stock');
            setStatusFilter((prev) => (prev === 'low' ? 'all' : 'low'));
          }}
        >
          <div className="stock-kpi-header">
            <span>Estoque Baixo</span>
            <span className="badge badge-pending">Repor</span>
          </div>
          <div className="stock-kpi-val" style={{ color: '#fbbf24' }}>
            {kpis.low}
          </div>
          <div className="stock-kpi-sub">itens abaixo do estoque mínimo</div>
        </div>

        <div
          className={`stock-kpi-card ${statusFilter === 'zero' ? 'is-active-filter' : ''}`}
          onClick={() => {
            setActiveTab('stock');
            setStatusFilter((prev) => (prev === 'zero' ? 'all' : 'zero'));
          }}
        >
          <div className="stock-kpi-header">
            <span>Itens Zerados</span>
            <span className="badge badge-critical">Crítico</span>
          </div>
          <div className="stock-kpi-val" style={{ color: '#f43f5e' }}>
            {kpis.zero}
          </div>
          <div className="stock-kpi-sub">necessitam compra emergencial</div>
        </div>
      </div>

      {/* Barra de Controle de Visualização (Abas + Busca + Unidade) */}
      <div className="stock-view-bar">
        <div className="stock-tabs-group">
          <button
            type="button"
            className={`stock-tab-btn ${activeTab === 'stock' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('stock')}
          >
            Posição de Estoque ({filteredStock.length})
          </button>
          <button
            type="button"
            className={`stock-tab-btn ${activeTab === 'movements' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('movements')}
          >
            Extrato de Movimentações ({filteredMovements.length})
          </button>
        </div>

        <div className="stock-controls-group">
          <input
            type="text"
            className="stock-search-input"
            placeholder="Buscar por produto, categoria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{ fontSize: '0.82rem', padding: '6px 10px', borderRadius: 8 }}
          >
            <option value="">Todas as Unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Saldos (Aba 1) */}
      {activeTab === 'stock' && (
        <div className="card" style={{ padding: '0.75rem 1rem' }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Produto & SKU</th>
                  <th>Categoria</th>
                  <th>Nível & Saldo Atual</th>
                  <th>Estoque Mínimo</th>
                  <th>Custo Médio</th>
                  <th>Valor Total</th>
                  <th style={{ textAlign: 'right' }}>Ações Rápidas</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((r) => {
                  const qty = Number(r.quantity) || 0;
                  const min = Number(r.products?.min_stock) || 0;
                  const cost = Number(r.products?.average_cost) || 0;
                  const total = qty * cost;

                  let statusCls = 'is-ok';
                  let statusLabel = 'OK';
                  let statusBadge = 'badge-completed';

                  if (qty <= 0) {
                    statusCls = 'is-critical';
                    statusLabel = 'Zerado';
                    statusBadge = 'badge-critical';
                  } else if (qty < min) {
                    statusCls = 'is-low';
                    statusLabel = 'Baixo';
                    statusBadge = 'badge-pending';
                  }

                  const percentOfMin = min > 0 ? Math.min(100, Math.round((qty / (min * 1.5)) * 100)) : 100;

                  return (
                    <tr key={`${r.product_id}-${r.unit_id}`}>
                      <td>
                        <strong style={{ color: '#ffffff' }}>{r.products?.name || 'Insumo'}</strong>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {r.products?.sku ? `SKU: ${r.products.sku} · ` : ''}
                          {r.products?.uom_id?.abbreviation || r.products?.uom_id?.name || 'unidade'}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">{r.products?.category_id?.name || 'Geral'}</span>
                      </td>
                      <td>
                        <div className="stock-level-wrap">
                          <div className="stock-level-text">
                            <span style={{ color: '#fff', fontSize: '0.9rem' }}>{qty}</span>
                            <span className={`badge ${statusBadge}`} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="stock-level-bar-track">
                            <div className={`stock-level-bar-fill ${statusCls}`} style={{ width: `${percentOfMin}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="muted">{min}</td>
                      <td>{cost > 0 ? brl.format(cost) : '—'}</td>
                      <td style={{ fontWeight: 700, color: '#f1f5f9' }}>{brl.format(total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#34d399' }}
                            title="Entrada rápida"
                            onClick={() => openMovementForProduct(r.product_id, 'in')}
                          >
                            + Entrada
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#fda4af' }}
                            title="Saída / Baixa rápida"
                            onClick={() => openMovementForProduct(r.product_id, 'out')}
                          >
                            - Baixa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredStock.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '2.5rem' }}>
                      Nenhum produto corresponde aos critérios de pesquisa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela de Movimentações (Aba 2) */}
      {activeTab === 'movements' && (
        <div className="card" style={{ padding: '0.75rem 1rem' }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data & Hora</th>
                  <th>Operação</th>
                  <th>Insumo</th>
                  <th>Quantidade</th>
                  <th>Origem / Canal</th>
                  <th>Unidade & Responsável</th>
                  <th>Motivo / Observação</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => {
                  let movBadge = 'badge-completed';
                  if (m.movement_type === 'out') movBadge = 'badge-late';
                  if (m.movement_type === 'loss') movBadge = 'badge-rejected';

                  return (
                    <tr key={m.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {fmtDate(m.created_at)}
                      </td>
                      <td>
                        <span className={`badge ${movBadge}`}>
                          {MOVEMENT_LABEL[m.movement_type] || m.movement_type}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: '#fff' }}>{m.products?.name || 'Insumo'}</strong>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {m.products?.uom_id?.abbreviation ? `Unidade: ${m.products.uom_id.abbreviation}` : ''}
                        </div>
                      </td>
                      <td style={{ fontWeight: 800, color: m.movement_type === 'in' ? '#34d399' : '#fda4af' }}>
                        {m.movement_type === 'in' ? `+${m.quantity}` : `-${m.quantity}`}
                      </td>
                      <td>
                        {m.source === 'whatsapp' ? (
                          <span className="badge badge-info">WhatsApp Bot</span>
                        ) : (
                          <span className="badge badge-ghost">Painel Web</span>
                        )}
                      </td>
                      <td>
                        <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>
                          {m.unit_id?.name || 'Central'}
                        </div>
                        <div className="muted" style={{ fontSize: '0.72rem' }}>
                          {m.created_by?.full_name || 'Sistema'}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: '0.8rem' }}>
                        {m.reason || '—'}
                      </td>
                    </tr>
                  );
                })}

                {filteredMovements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '2.5rem' }}>
                      Nenhuma movimentação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Movimentação Rápida */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                Registrar Movimentação de Estoque
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Seletor Segmentado de Tipo */}
              <div className="stock-type-segmented">
                <button
                  type="button"
                  className={`stock-type-btn ${formType === 'in' ? 'is-active-in' : ''}`}
                  onClick={() => setFormType('in')}
                >
                  + Entrada (Compra)
                </button>
                <button
                  type="button"
                  className={`stock-type-btn ${formType === 'out' ? 'is-active-out' : ''}`}
                  onClick={() => setFormType('out')}
                >
                  - Saída (Consumo)
                </button>
                <button
                  type="button"
                  className={`stock-type-btn ${formType === 'loss' ? 'is-active-loss' : ''}`}
                  onClick={() => setFormType('loss')}
                >
                  ! Perda / Avaria
                </button>
              </div>

              {/* Seleção do Produto */}
              <div className="field">
                <label>Insumo / Produto</label>
                <select
                  value={formProduct}
                  onChange={(e) => setFormProduct(e.target.value)}
                  required
                >
                  <option value="">Selecione o insumo...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Projeção de Saldo em Tempo Real */}
              {selectedProductStock && (
                <div className="stock-proj-card">
                  <div className="stock-proj-item">
                    <span className="stock-proj-label">Saldo Atual</span>
                    <span className="stock-proj-val">{Number(selectedProductStock.quantity) || 0}</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '1.2rem', fontWeight: 800 }}>→</div>
                  <div className="stock-proj-item">
                    <span className="stock-proj-label">Saldo Projetado</span>
                    <span
                      className="stock-proj-val"
                      style={{ color: formType === 'in' ? '#34d399' : '#fda4af' }}
                    >
                      {projectedQuantity !== null ? projectedQuantity : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Campos de Quantidade e Custo */}
              <div className="field-row">
                <div className="field">
                  <label>Quantidade</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    placeholder="Ex.: 15"
                    required
                  />
                </div>

                <div className="field">
                  <label>Custo Unitário (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    placeholder={formType === 'in' ? 'Ex.: 12.50' : 'Apenas entrada'}
                    disabled={formType !== 'in'}
                  />
                </div>
              </div>

              {/* Unidade e Motivo */}
              <div className="field-row">
                <div className="field">
                  <label>Unidade Operacional</label>
                  <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)}>
                    <option value="">Loja Central</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Motivo / Observação</label>
                  <input
                    type="text"
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Ex.: Reposição fornecedor / Quebra"
                  />
                </div>
              </div>

              {/* Ações do Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Registrando...' : 'Confirmar Movimentação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
