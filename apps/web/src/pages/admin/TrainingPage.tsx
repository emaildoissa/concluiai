import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';

interface Material {
  id: string;
  title: string;
  description?: string | null;
  content_url?: string | null;
  content_type: 'guide' | 'video' | 'course';
  is_published: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  guide: 'Guia',
  video: 'Vídeo',
  course: 'Curso',
};

export function TrainingPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [contentType, setContentType] = useState<'guide' | 'video' | 'course'>('guide');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const data = await apiGet<{ materials: Material[] }>('/api/training');
      setMaterials(data.materials || []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao carregar materiais');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!title.trim()) {
      setMsg('Informe o título do material.');
      return;
    }
    try {
      await apiPost('/api/training', {
        title: title.trim(),
        description: description.trim() || null,
        content_url: contentUrl.trim() || null,
        content_type: contentType,
        is_published: true,
      });
      setMsg('Material publicado.');
      setTitle('');
      setDescription('');
      setContentUrl('');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao criar material');
    }
  }

  async function togglePublish(m: Material) {
    setMsg('');
    try {
      await apiPatch(`/api/training/${m.id}`, { is_published: !m.is_published });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao atualizar material');
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Remover o material "${m.title}"?`)) return;
    setMsg('');
    try {
      await apiDelete(`/api/training/${m.id}`);
      setMsg('Material removido.');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falha ao remover material');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Módulo de Treinamento</h2>
          <p>Guias e cursos rápidos para manter o padrão operacional da equipe.</p>
        </div>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ color: 'var(--text)' }}>Novo material</h3>
          <form className="form-grid" onSubmit={add} style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label>Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Padrão de evidência fotográfica" />
            </div>
            <div className="field">
              <label>Descrição</label>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label>URL do conteúdo</label>
              <input
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                placeholder="https://… (vídeo, PDF, drive)"
              />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as typeof contentType)}
              >
                <option value="guide">Guia</option>
                <option value="video">Vídeo</option>
                <option value="course">Curso</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Publicar
            </button>
          </form>
        </div>

        <div className="stack">
          {materials.length === 0 ? (
            <div className="muted">Nenhum material cadastrado.</div>
          ) : (
            materials.map((m) => (
              <div className="card" key={m.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{m.title}</strong>
                  <div className="row">
                    <span className={`badge ${m.is_published ? 'badge-completed' : 'badge-pending'}`}>
                      {TYPE_LABELS[m.content_type] ?? m.content_type} · {m.is_published ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>
                </div>
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                  {m.description}
                </p>
                {m.content_url ? (
                  <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                    🔗 {m.content_url}
                  </p>
                ) : null}
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void togglePublish(m)}>
                    {m.is_published ? 'Despublicar' : 'Publicar'}
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(m)}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
