import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Material {
  id: string;
  title: string;
  description?: string | null;
  content_url?: string | null;
  content_type: 'guide' | 'video' | 'course';
  is_published: boolean;
  created_at: string;
}

const DEMO_MATERIALS: Material[] = [
  {
    id: 'mat-1',
    title: 'POP 01 — Higienização & Sanitização de Superfícies de Cocção',
    description: 'Protocolo padrão de desinfecção diária das chapas, bancadas de inox e coifas com registro de temperatura e insumos recomendados.',
    content_url: 'https://exemplo.com/pops/pop-01-higienizacao.pdf',
    content_type: 'guide',
    is_published: true,
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
  },
  {
    id: 'mat-2',
    title: 'Vídeo Treinamento — Calibração & Checagem de Fritadeiras',
    description: 'Instrução audiovisual sobre descarte seguro de óleo, temperatura ideal de operação e preenchimento da telemetria de segurança.',
    content_url: 'https://youtube.com/watch?v=demo-pop-cozinha',
    content_type: 'video',
    is_published: true,
    created_at: new Date(Date.now() - 3600000 * 24 * 12).toISOString(),
  },
  {
    id: 'mat-3',
    title: 'Curso Rápido — Boas Práticas Anvisa & Controle de Validade',
    description: 'Módulo de onboarding para novos operadores sobre rotulagem de PVPS (Primeiro que Vence, Primeiro que Sai) e etiquetagem.',
    content_url: 'https://exemplo.com/cursos/boas-praticas-anvisa',
    content_type: 'course',
    is_published: true,
    created_at: new Date(Date.now() - 3600000 * 24 * 20).toISOString(),
  },
  {
    id: 'mat-4',
    title: 'POP 07 — Abertura e Fechamento de Caixa Blindado',
    description: 'Conferência de fundo de troco, sangria programada e conciliação com o sistema financeiro central.',
    content_url: 'https://exemplo.com/pops/pop-07-caixa.pdf',
    content_type: 'guide',
    is_published: false,
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
];

export function TrainingPage() {
  const { demoMode } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'guide' | 'video' | 'course'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Formulário Modal
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [contentType, setContentType] = useState<'guide' | 'video' | 'course'>('guide');
  const [isPublished, setIsPublished] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ materials: Material[] }>('/api/training');
      if (data.materials && data.materials.length > 0) {
        setMaterials(data.materials);
      } else if (demoMode) {
        setMaterials(DEMO_MATERIALS);
      } else {
        setMaterials([]);
      }
    } catch {
      if (demoMode) {
        setMaterials(DEMO_MATERIALS);
      } else {
        setMaterials([]);
      }
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesTab = activeTab === 'all' || m.content_type === activeTab;
      const matchesSearch =
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [materials, activeTab, searchQuery]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!title.trim()) {
      setMsg({ type: 'err', text: 'Informe o título do material.' });
      return;
    }

    setSaving(true);
    try {
      await apiPost<{ material: Material }>('/api/training', {
        title: title.trim(),
        description: description.trim() || null,
        content_url: contentUrl.trim() || null,
        content_type: contentType,
        is_published: isPublished,
      });

      setMsg({ type: 'ok', text: 'Material cadastrado com sucesso.' });
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setContentUrl('');
      setContentType('guide');
      setIsPublished(true);
      await load();
    } catch (err) {
      if (demoMode) {
        const newDemo: Material = {
          id: `mat-demo-${Date.now()}`,
          title: title.trim(),
          description: description.trim() || null,
          content_url: contentUrl.trim() || null,
          content_type: contentType,
          is_published: isPublished,
          created_at: new Date().toISOString(),
        };
        setMaterials((prev) => [newDemo, ...prev]);
        setMsg({ type: 'ok', text: 'Modo demonstração: material registrado localmente.' });
        setIsModalOpen(false);
        setTitle('');
        setDescription('');
        setContentUrl('');
      } else {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Falha ao salvar material.' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(m: Material) {
    setMsg(null);
    try {
      await apiPatch(`/api/training/${m.id}`, { is_published: !m.is_published });
      setMaterials((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, is_published: !m.is_published } : item))
      );
      setMsg({
        type: 'ok',
        text: `Material "${m.title}" ${!m.is_published ? 'publicado' : 'movido para rascunho'}.`,
      });
    } catch (err) {
      if (demoMode) {
        setMaterials((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, is_published: !m.is_published } : item))
        );
      } else {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Falha ao atualizar status.' });
      }
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Deseja realmente remover o material "${m.title}"?`)) return;
    setMsg(null);
    try {
      await apiDelete(`/api/training/${m.id}`);
      setMaterials((prev) => prev.filter((item) => item.id !== m.id));
      setMsg({ type: 'ok', text: 'Material removido.' });
    } catch (err) {
      if (demoMode) {
        setMaterials((prev) => prev.filter((item) => item.id !== m.id));
        setMsg({ type: 'ok', text: 'Removido no modo demonstração.' });
      } else {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Falha ao remover material.' });
      }
    }
  }

  return (
    <div className="training-page-wrap">
      {/* Header Executivo */}
      <div className="page-header">
        <div>
          <h2>Academia Operacional & Padrões POP</h2>
          <p>Repositório de Procedimentos Operacionais Padrão, vídeos instrutivos e guias de rotina.</p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setTitle('');
            setDescription('');
            setContentUrl('');
            setContentType('guide');
            setIsPublished(true);
            setIsModalOpen(true);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          + Publicar Material
        </button>
      </div>

      {msg && (
        <div
          className={`notice ${msg.type === 'err' ? 'warn' : ''}`}
          style={
            msg.type === 'ok'
              ? {
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }
              : undefined
          }
        >
          {msg.text}
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="training-toolbar">
        <div className="training-tabs">
          <button
            type="button"
            className={`training-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Todos ({materials.length})
          </button>
          <button
            type="button"
            className={`training-tab-btn ${activeTab === 'guide' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            Guias & POPs ({materials.filter((m) => m.content_type === 'guide').length})
          </button>
          <button
            type="button"
            className={`training-tab-btn ${activeTab === 'video' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('video')}
          >
            Vídeos ({materials.filter((m) => m.content_type === 'video').length})
          </button>
          <button
            type="button"
            className={`training-tab-btn ${activeTab === 'course' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('course')}
          >
            Cursos ({materials.filter((m) => m.content_type === 'course').length})
          </button>
        </div>

        <div style={{ minWidth: 260 }}>
          <input
            type="text"
            placeholder="Pesquisar por título ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.85rem',
              fontSize: '0.85rem',
              background: 'var(--bg-soft)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              color: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* Grid de Materiais */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Carregando materiais de treinamento…
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ margin: '0 auto 0.75rem', opacity: 0.5 }}
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p style={{ margin: 0, fontWeight: 700, color: '#ffffff', fontSize: '1rem' }}>
            Nenhum material encontrado.
          </p>
          <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.82rem' }}>
            Clique no botão acima para cadastrar POPs, guias ou vídeos instrutivos para a equipe.
          </p>
        </div>
      ) : (
        <div className="training-grid">
          {filteredMaterials.map((m) => {
            const isVideo = m.content_type === 'video';
            const isGuide = m.content_type === 'guide';

            return (
              <div key={m.id} className="training-card">
                <div>
                  <div className="training-card-header">
                    <span
                      className={`training-type-badge ${
                        isVideo ? 'video' : isGuide ? 'guide' : 'course'
                      }`}
                    >
                      {isVideo ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      ) : isGuide ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                          <path d="M6 12v5c3 3 9 3 12 0v-5" />
                        </svg>
                      )}
                      {m.content_type === 'guide' ? 'Guia POP' : m.content_type === 'video' ? 'Vídeo' : 'Curso'}
                    </span>

                    <span
                      className={`badge ${m.is_published ? 'badge-completed' : 'badge-pending'}`}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {m.is_published ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>

                  <h3 className="training-card-title">{m.title}</h3>

                  {m.description && <p className="training-card-desc">{m.description}</p>}
                </div>

                <div>
                  {m.content_url && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <a
                        href={m.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="training-link-box"
                        style={{ textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Acessar Link do Treinamento
                        </span>
                      </a>
                    </div>
                  )}

                  <div className="training-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => void togglePublish(m)}
                    >
                      {m.is_published ? 'Despublicar' : 'Publicar'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.6rem', color: '#f43f5e' }}
                      onClick={() => void remove(m)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Moderno de Cadastro de Treinamento */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 999,
            padding: '1rem',
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '1.75rem',
              background: 'var(--bg-card)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                Novo Material de Treinamento
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '0.2rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                  Título do Material *
                </label>
                <input
                  type="text"
                  placeholder="Ex: POP 02 — Esterilização de Utensílios"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                    Tipo de Conteúdo
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-soft)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="guide">Guia Operacional / POP</option>
                    <option value="video">Vídeo Instrutivo</option>
                    <option value="course">Curso de Capacitação</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                    Visibilidade Inicial
                  </label>
                  <select
                    value={isPublished ? 'true' : 'false'}
                    onChange={(e) => setIsPublished(e.target.value === 'true')}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-soft)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="true">Publicado Imediatamente</option>
                    <option value="false">Rascunho (Privado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                  URL do Material / Vídeo / Documento
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/pop-arquivo.pdf ou link do vídeo"
                  value={contentUrl}
                  onChange={(e) => setContentUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                  Descrição / Instruções aos Operadores
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva o objetivo deste procedimento, pontos de atenção e frequência recomendada..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Publicando…' : 'Publicar Treinamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
