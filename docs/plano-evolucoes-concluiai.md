# Plano de Evolução Contínua: ConcluíAI

> **Documento de Referência:** [`redesign-modal-protocolo-operacional.md`](file:///c:/Users/Marcos%20Issa/Documents/concluiai/docs/redesign-modal-protocolo-operacional.md)  
> **Última Atualização:** 21/10/2026  
> **Objetivo:** Registro contínuo de diagnósticos, correções e planos organizados nos 3 pilares estratégicos do produto.

---

## 🎯 Os 3 Pilares do Projeto

```
┌─────────────────────────────────────────────────────────────┐
│                      CONCLUÍ AI                             │
├──────────────────┬──────────────────┬───────────────────────┤
│   1. BUGS        │   2. DESIGN      │   3. ENXUGAR O APP    │
│ Correção técnica │ UI/UX moderna,   │ Eliminar código morto,│
│ e estabilidade   │ acessível, clean │ simplificar fluxos    │
│ de dados         │ e profissional   │ e ganho de velocidade │
└──────────────────┴──────────────────┴───────────────────────┘
```

---

## Pilar 1: Eliminação de Bugs & Estabilidade

### [21/10/2026] ✅ Resolvido: Persistência de Medição Quantitativa (Checklists)
- **Problema:** Ao selecionar o modo de verificação "Medição" em tarefas operacionais, o sistema não gravava a escolha e sempre revertia para "Foto Obrigatória" ao reabrir.
- **Causa Raiz:**
  1. *Backend (`routes/checklists.ts`):* A rota da API possuía lista estrita antiga que não contemplava `numeric`, forçando fallback para `check`/`photo` e reescrevendo `item_type` para `boolean`.
  2. *Frontend (`ChecklistBuilder.tsx`):* A checagem dos botões visuais no modal não era estritamente mutuamente exclusiva.
  3. *Infraestrutura (Docker/Portainer):* O container em produção estava executando a imagem em cache anterior sem as novas regras de normalização.
- **Solução Implementada:**
  - `apps/api/src/routes/checklists.ts`: Implementada normalização estrita `isNumeric = it.item_type === 'numeric' || it.execution_mode === 'numeric' || it.unit_of_measurement != null || it.min_value != null || it.max_value != null`. Gravação garantida de limites numéricos e unidade.
  - `apps/web/src/pages/admin/ChecklistBuilder.tsx`: Normalização completa no método `save()` e controle visual mutuamente exclusivo com variáveis `isNumeric`, `isPhoto` e `isCheck`.
  - Rebuild limpo da imagem (`docker build --no-cache`) e re-pull no Portainer com sucesso.

### [27/10/2026] ✅ Resolvido: Travamento na Seleção de Tipo de Verificação da Tarefa
- **Problema:** Ao tentar editar uma tarefa existente configurada como "Medição", o usuário não conseguia alternar para "Foto Obrigatória (IA)" ou "Confirmação Simples"; a seleção ficava presa.
- **Causa Raiz:**
  1. *Acúmulo de dados na memória do componente:* Quando uma tarefa foi criada com medição, continha `unit_of_measurement: '°C'`, `min_value` e `max_value`. Ao clicar em "Foto" ou "Check", esses campos numéricos residuais permaneciam no objeto.
  2. *Inferência agressiva (`isNumeric`):* A verificação considerava `it.unit_of_measurement != null` como prova definitiva de medição, ignorando a intenção explícita do clique (`execution_mode`) e forçando `isNumeric = true` a cada render.
  3. *Adivinhação indesejada no título:* Digitar palavras-chave como "freezer" sobrescrevia automaticamente a escolha do usuário.
- **Solução Implementada:**
  - `apps/web/src/pages/admin/ChecklistBuilder.tsx`:
    - Estabelecida fonte única da verdade para o modo (`numeric | photo | check`) baseada em `execution_mode`.
    - Ao selecionar Foto ou Check, o estado limpa explicitamente os resquícios numéricos (`unit_of_measurement: null, min_value: null, max_value: null`).
    - Removida a inferência mágica do campo de título (o usuário tem controle 100% previsível).
    - Normalização consistente no `save()`.
  - `apps/api/src/routes/checklists.ts`: Respeito estrito ao `execution_mode` enviado pelo frontend, persistindo nulo nos campos numéricos quando o modo for Foto ou Check.
  - Builds validados com sucesso no Web e API (`tsc && vite build`).

### [28/10/2026] ✅ Resolvido: Tarefas não apareciam na Central de Comando apesar de checklists ativos
- **Problema:** O usuário possuía 16 checklists ativos e configurados em `/admin/checklists`, porém na Central de Comando (`/admin`) a fila de tarefas aparecia zerada com a mensagem "Nenhuma rotina operacional gerada para hoje" e um botão manual "⚡ Gerar Rotinas do Dia", causando estranhamento e atrito de usabilidade.
- **Causa Raiz:**
  1. *Erro na Query SQL do Supabase:* Na rota `/api/tasks/pendings`, a consulta solicitava a relação `checklist:checklists ( id, title, shift )`. No entanto, na tabela `checklists` a coluna oficial é `name` (a coluna `title` não existe). Isso causava erro interno 500 no Supabase (`column checklists.title does not exist`).
  2. *Erro silenciado no frontend:* A chamada `/api/tasks/pendings?status=all` capturava a falha com `.catch(() => null)`, fazendo com que a lista de tarefas caísse silenciosamente em `tasks = []`.
  3. *Incompatibilidade de `company_id`:* O gerador `generateTasksForDate` aplicava um filtro estrito `company_id.eq(...)`, que descartava checklists cadastrados com `company_id: null` ou criados antes da definição do tenant.
  4. *Falta de Geração Transparente (UX Friccionada):* O usuário precisava tomar uma ação manual para fazer aparecer tarefas de checklists já ativos.
- **Solução Implementada:**
  - `apps/api/src/routes/tasks.ts`: Corrigido o relacionamento para `checklist:checklists ( id, name, shift )` e flexibilizada a busca de unidades por `company_id`.
  - `apps/api/src/services/tasks.ts`: Flexibilizado o filtro em `generateTasksForDate` para ser tolerante a `company_id` nulo ou padrão.
  - `apps/web/src/pages/admin/MultistoreDashboard.tsx`: Implementada a **geração automática e transparente no `loadData`**: se as tarefas do dia ainda não foram geradas no banco, o sistema as gera instantaneamente em background e as carrega na tela sem exigir nenhum clique do usuário.
### [28/10/2026] ✅ Resolvido: Selects nativos (Rede Consolidada / Lojas) com fundo branco e letras claras
- **Problema:** Na tela de Evolução Histórica (`/admin/evolution`) e formulários correlatos, o seletor dropdown de lojas ("Rede Consolidada (Todas)" / "Oak Sushi") renderizava com fundo branco nativo do Windows e texto claro, tornando o conteúdo quase ilegível.
- **Causa Raiz:** O elemento `<select>` nativo não possuía definição de `background-color` e `color-scheme: dark` no CSS global. Em navegadores no Windows, o sistema operacional aplicava o fundo branco padrão do SO enquanto o texto herdava a cor clara do tema escuro (`#f8fafc`).
- **Solução Implementada:**
  - `apps/web/src/styles/index.css`: Adicionada regra global para `select` e `select option` com `color-scheme: dark`, fundo escuro `#0f172a`, borda sutil e cor de texto branca `#f8fafc` com contraste WCAG 2.2 AAA.
  - Criada a classe `.evolution-unit-select` com chevron SVG vetorial estilizado, hover/focus states e altura ergonômica mínima de 34px.
  - `apps/web/src/pages/admin/EvolutionPage.tsx`: Aplicada a nova classe ao seletor de lojas.

---

## Pilar 2: Design, UI & Usabilidade

*Baseado nas diretrizes de usabilidade e prototipagem estabelecidas no [`redesign-modal-protocolo-operacional.md`](file:///c:/Users/Marcos%20Issa/Documents/concluiai/docs/redesign-modal-protocolo-operacional.md).*

### ✅ Implementado:
- **Redesign do Modal de Edição de Protocolo:**
  - Navegação em abas persistentes (*1. Parâmetros & Unidades* e *2. Roteiro & Diretrizes IA*).
  - Remoção de emojis infantis e substituição por ícones SVG padronizados em cinza/índigo neutro.
  - Revelação progressiva da caixa de limites seguros (só aparece quando "Medição" está ativo).
  - Checkboxes de risco (`is_critical`, `requires_gps`, `alert_on_non_compliant`) desmarcados por padrão para testes seguros.
- **[27/10/2026] Redesign da Central de Comando Operacional (`/admin`):**
  - Aplicação estrita da `skill-usabilidade-e-prototipagem.md`:
    - **Hierarquia e Semântica:** Adicionado `<h1>` principal ("Central de Comando Operacional") com indicador pulsante de *Live Telemetry*.
    - **Lei de Fitts:** Botões de ação táticos com altura confortável (40-42px), micro-interações de hover/active e gradientes dedicados.
    - **Lei de Miller & Chunking:** 4 KPI Cards modernizados com ícones temáticos dedicados (Índice Global, Lojas em Risco, Atrasos e Visão Computacional), com badges de conformidade dentro das diretrizes de contraste WCAG 2.2 AA.
    - **Navegação do Workspace:** Abas táticas no mesmo padrão visual premium do modal de protocolos, com ícones SVG, badges dinâmicas de contagem e busca integrada com ícone de lupa e botão de limpeza instantânea.

- **[27/10/2026] Redesign da Listagem de Protocolos & POPs (`/admin/checklists`):**
  - **Barra Superior:** `<h1>` padronizado ("Protocolos Operacionais (POPs)") com badge de contagem total e botões de ação ergonômicos (*+ Novo Procedimento* e *Gerar Tarefas do Dia*).
  - **Filtros por Turno:** Substituição das abas antigas por pills no mesmo padrão da Central de Comando (com ícones SVG para Todos, Manhã, Tarde e Noite).
  - **Barra de Busca Tática:** Input com lupa SVG integrada e botão de limpeza instantânea (`✕`).
  - **Cards de Protocolos (`.sop-card`):**
    - Badges semânticas por turno (*Manhã*: âmbar, *Tarde*: ciano, *Noite*: roxo).
    - Status ativo/pausado com indicador luminoso (*dot*).
    - Estatísticas organizadas com ícones de tarefas, críticas, fotos IA e lojas associadas.
    - Ações do rodapé padronizadas com botões táteis e ícones SVG (*Editar*, *Duplicar*, *Excluir*).

- [x] **[27/10/2026] Redesign de Gestão de Unidades & Lojas (`/admin/units`):**
  - **Barra Superior & Métricas:** `<h1>` padronizado ("Gestão de Unidades & Lojas") com badge de contagem de lojas e 4 KPI cards modernizados com caixas de ícones coloridas, glow superior e tipografia de alto contraste.
  - **Toolbar Tática:** Input de busca com lupa SVG e botão de limpeza instantânea (`✕`) integrado a abas de filtro em pills (*Todas*, *Abertas Hoje*, *Inativas*) com badges de contagem dinâmica.
  - **Cards de Unidades (`.unit-card-item`):** Status dot pulsante em tempo real para lojas com expediente no dia de hoje, visualizador compacto da escala semanal de 7 dias e botões de ação ergonômicos (34px, Lei de Fitts).
  - **Modal de Edição (`.units-modal-dialog`):** Backdrop com blur cinematográfico (12px), cabeçalho alinhado ao padrão de POPs com ícone em badge e subtítulo explicativo, seletores de escala semanal em presets e chips com feedback tátil.

- [x] **[27/10/2026] Redesign de Setores Operacionais (`/admin/sectors`):**
  - **Barra Superior & KPIs:** `<h1>` padronizado ("Mapeamento de Setores Operacionais") com badge contador e 4 KPI cards com caixas de ícones vetoriais coloridas e glow temático.
  - **Toolbar Tática:** Input de busca com lupa SVG e botão clear `✕`, associado a abas de filtro por unidade em pills com contadores dinâmicos de setores mapeados.
  - **Cartões de Setor & Ações:** Botões de ação ergonômicos (34px, Lei de Fitts), ícones temáticos de setor (cozinha, frio, estoque, salão, bar, descarte) e tag de ordem monoespacada.
  - **Modal de Edição de Setor:** Padrão visual unificado com ícone em badge translúcido, subtítulo explicativo e botão de fechar ergonômico.

- [x] **[27/10/2026] Redesign de Gestão de Estoque & Insumos (`/admin/estoque`):**
  - **Barra Superior & KPIs:** `<h1>` padronizado ("Gestão de Estoque & Insumos") com badge contador de SKUs, botão ergonômico *+ Registrar Movimentação* com ícone vetorial e 4 KPI cards interativos com glow temático (SKUs, valor patrimonial BRL, estoque baixo e zerado).
  - **Toolbar Tática & Abas:** Abas em pills com badges contadoras dinâmicas (*Posição de Estoque* e *Extrato de Movimentações*), input de busca com lupa SVG e botão de limpeza rápida (`✕`), e seletor de unidades padronizado.
  - **Modal de Movimentação Rápida:** Backdrop blur cinematográfico (12px), cabeçalho estilizado com ícone em badge translúcido, subtítulo explicativo e botão de fechar ergonômico.

- [x] **[27/10/2026] Redesign de Operadores de Campo (`/admin/operators`):**
  - **Barra Superior & KPIs:** `<h1>` padronizado ("Operadores & Gerentes de Unidade") com badge contador de colaboradores, e 4 KPI cards modernizados com glow temático e métricas de mobile vs gerentes vs WhatsApp.
  - **Toolbar Tática & Abas:** Abas em pills com contadores dinâmicos (*Todos*, *Operadores*, *Gerentes*, *Inativos*), input de busca com lupa SVG e botão de limpeza instantânea (`✕`).
  - **Modal de Edição de Colaborador:** Padrão visual unificado com backdrop blur de 12px, ícone em badge azul/ciano translúcido, subtítulo explicativo e botão de fechar ergonômico.

- [x] **[28/10/2026] Redesign de Rankings Operacionais (`/admin/rankings`):**
  - **Barra Superior & KPIs:** `<h1>` padronizado ("Rankings & Índices Operacionais") com badge contador de unidades/operadores avaliados, botão ergonômico *Atualizar Dados* com animação de spinner, e 4 KPI cards modernizados com glow temático (Líder Atual em ouro, Média da Rede P·E·Q com gauge percentual, Total de Avaliados e Taxa de Alta Conformidade).
  - **Toolbar Tática & Abas:** Switcher de escopo em pills tátil (*Unidades & Lojas* vs *Equipe & Operadores*), chips de período (*7d, 14d, 30d*) e input de busca integrado (`ops-search-wrap`) com lupa SVG e botão de limpeza instantânea (`✕`).
  - **Pódio de Destaque Sem Emojis:** Eliminação de emojis infantis (`🥇`, `🥈`, `🥉`) e substituição por insígnias SVG nobres (Troféu para 1º Ouro, Medalha de Honra para 2º Prata, Insígnia Estelar para 3º Bronze).
  - **Tabela do Leaderboard Geral:** Chips de medalha para posições de topo, barras de conformidade em gradiente com porcentagem explícita e badges de conformidade com contraste WCAG 2.2 AA.

- [x] **[30/10/2026] Redesign de Auditoria de Falhas & Incidentes (`/admin/pendings`):**
  - **Barra Superior & KPIs:** `<h1>` padronizado ("Auditoria de Falhas & Incidentes") com badge de status dinâmico (*X incidentes*), botão de ação emergencial *Cobrar Todas Críticas* com glow carmim quando houver falhas críticas e 4 KPI cards interativos com glow temático (Total Monitorado em ciano, Atrasos Operacionais em âmbar/verde, Críticas em Atraso em carmim e Reprovações Gemini IA).
  - **Toolbar Tática & Abas:** Abas em pills táteis (*Rotinas de Hoje* com contador de pendências vs *Relatório de Auditoria*), chips rápidos (*Todas, Críticas, Atrasadas, Recusadas IA*), seletores em tema escuro (`evolution-unit-select`) para datas e lojas, e campo de busca integrado com lupa SVG e botão clear (`✕`).
  - **Cards de Incidentes & Ações Rápidas:** Cards com bordas temáticas de risco, metadados em grid monoespacado, thumbnail de evidência fotográfica com modal lightbox em tela cheia e botão ergonômico de cobrança direta via WhatsApp com feedback de envio.
  - **Empty State Profissional:** Ilustração vetorial de conformidade plena quando todas as lojas e tarefas estiverem em dia.

### Próximos Passos de Design:
- [ ] Evolução Histórica & Tendências (`/admin/evolution`).
- [ ] Central de WhatsApp (`/admin/whatsapp`).
- [ ] Central de Treinamento (`/admin/training`).
- [ ] Melhorias na tela do operador para registro direto das medições sem fricção.

---

## Pilar 3: Enxugamento do App & Otimização

### Objetivos deste Pilar:
1. **Remoção de Código Morto:** Identificar componentes, rotas e scripts legados que não estão mais em uso.
2. **Desacoplamento e Performance:** Reduzir pacotes pesados desnecessários no bundle do frontend.
3. **Simplificação de Fluxos:** Reduzir o número de cliques para o operador concluir vistorias e para o gestor cadastrar processos.

### Itens Concluídos:
- [x] **[27/10/2026] Organização da Raiz:** Movido documento de escopo/benchmark órfão (`nova implementação.txt`) para a pasta de documentação estruturada ([`docs/visao-modulos-concluiai.md`](file:///c:/Users/Marcos%20Issa/Documents/concluiai/docs/visao-modulos-concluiai.md)).

### Itens Mapeados para Limpeza:
- [ ] Auditoria de chamadas duplicadas no carregamento de tarefas do dia.
- [ ] Otimização dos payloads trocados entre Frontend e API para diminuir consumo de dados móveis.

---

## 📋 Como vamos trabalhar
À medida que você for testando e encontrando pontos a melhorar:
1. Você me passa o bug, a tela ou a ideia de simplificação.
2. Eu registro aqui neste documento com diagnóstico técnico e status.
3. Implementamos a correção de forma cirúrgica e validamos juntos.
