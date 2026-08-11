# Fix de código — Sidebar + Bugs 1 e 2

Status: aguardando aplicação (permissões de edição negadas no ambiente; só permitido gravar planos).
Alvo: corrigir sidebar do admin, pendências com `rejected` e auto-envio WhatsApp para o número do robô.

---

## 1. Sidebar em 3 seções — `apps/web/src/layouts/AdminLayout.tsx`

Substituir o array `links` por `sections` e renderizar com cabeçalho de grupo:

```tsx
const sections = [
  {
    title: 'Operação',
    links: [
      { to: '/admin', end: true, label: 'Multiloja', icon: 'grid' },
      { to: '/admin/checklists', label: 'Checklists', icon: 'checklist' },
      { to: '/admin/units', label: 'Unidades', icon: 'building' },
      { to: '/admin/sectors', label: 'Setores', icon: 'layers' },
      { to: '/admin/estoque', label: 'Estoque', icon: 'box' },
    ],
  },
  {
    title: 'Acompanhamento',
    links: [
      { to: '/admin/pendings', label: 'Pendências', icon: 'bell' },
      { to: '/admin/rankings', label: 'Rankings', icon: 'ranking' },
      { to: '/admin/evolution', label: 'Evolução', icon: 'trend' },
    ],
  },
  {
    title: 'Admin',
    links: [
      { to: '/admin/operators', label: 'Operadores', icon: 'users' },
      { to: '/admin/whatsapp', label: 'WhatsApp', icon: 'chat' },
      { to: '/admin/training', label: 'Treinamento', icon: 'book' },
      { to: '/admin/credentials', label: 'Credenciais', icon: 'gear' },
    ],
  },
];
```

No JSX do `nav` (linha ~67), trocar o `.map` atual por:

```tsx
<nav className="nav">
  {sections.map((section) => (
    <div key={section.title} className="nav-section">
      <div className="nav-section-title">{section.title}</div>
      {section.links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <SideIcon name={l.icon} />
          {l.label}
        </NavLink>
      ))}
    </div>
  ))}
</nav>
```

### CSS — `apps/web/src/styles/index.css` (após o bloco `.nav a.active` ~linha 145)

```css
.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.nav-section + .nav-section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.nav-section-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: 0 0.85rem;
  margin-bottom: 0.25rem;
  opacity: 0.8;
}
```

---

## 2. Bug 1 — recusadas voltam ao painel Pendências

### `apps/api/src/routes/tasks.ts` (linha 47)

```ts
const NOT_DONE_STATUSES = ['pending', 'in_progress', 'late', 'rejected'];
```

### `apps/web/src/pages/admin/PendingTasks.tsx` (STATUS_LABEL/STATUS_CLASS, linhas 14-24)

```ts
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  late: 'Atrasada',
  rejected: 'Recusada pela IA',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  in_progress: 'badge-info',
  late: 'badge-late',
  rejected: 'badge-rejected',
};
```

> `.badge-rejected` já existe em `index.css` (linha 324).

---

## 3. Bug 2 — bloqueio de auto-envio p/ o número do robô

### `apps/api/src/services/whatsapp.ts` (linhas 65-80)

Problema atual: o bloqueio compara o `instanceNumber` cru (12 dígitos, ex. `555135083008`) com o destinatário normalizado (13 dígitos, ex. `5551935083008`) — nunca casa. Trocar a comparação para normalizar ambos:

```ts
  const { number: toPhone, valid } = normalizePhoneBR(params.toPhone);
  const { number: normInstance } = normalizePhoneBR(instanceNumber || '');
  const rawInstance = (instanceNumber || '').replace(/\D/g, '');

  if (!valid) {
    result = {
      ok: false,
      status: 'blocked',
      error: `Telefone inválido para WhatsApp: ${params.toPhone} (use 55 + DDD + 9 + número)`,
    };
  } else if (normInstance && (toPhone === normInstance || toPhone === rawInstance)) {
    result = {
      ok: false,
      status: 'blocked',
      error: `Alerta não enviado: o destinatário é o mesmo número do robô (${toPhone}). Cadastre o celular real do gerente/operador.`,
    };
  } else {
```

> Isso faz o botão "Notificar" de Pendências (via `tasks/:id/notify`) retornar 400 com essa mensagem quando o perfil do operador tiver o número do robô cadastrado — em vez de enviar a mensagem para o WhatsApp do próprio robô.

---

## 4. Verificação pós-aplicação

```powershell
cd apps\web; npm run typecheck; npm run build
```

---

## Nota sobre Bug 2 (dados)

O código envia sempre para `profiles.phone` do destinatário (lembrete: `tasks.ts:168`). Para o lembrete ter ido para 555135083008, o perfil atribuído à tarefa está com esse número cadastrado (ou o operador certo está `Inativo`). Após aplicar o fix acima, o botão mostrará o erro claro; a correção de dados (celular real de Marcos Issa = +5551993257923 + ativar) fica por conta do painel Operadores.
