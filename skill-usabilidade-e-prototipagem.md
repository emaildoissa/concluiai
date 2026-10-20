# SKILL: Usabilidade, Prototipagem e Arquitetura Frontend em Sistemas Web e Mobile

> **Finalidade:** Guia executável e estruturado para orientar equipes de UX/UI Design, Product Managers e Desenvolvedores Frontend na criação, prototipagem e implementação de aplicações digitais escaláveis, acessíveis, performáticas e orientadas à usabilidade.

---

## 1. Princípios Fundamentais & Visão Holística
Para garantir o sucesso de uma aplicação digital, a experiência do usuário (UX) deve ser tratada como a jornada emocional e cognitiva completa, enquanto a interface (UI) representa a camada visual e interativa [100]. A excelência técnica de código é indissociável da experiência do usuário: um sistema lento ou travado destrói um design bem trabalhado [98, 107].

### Diretrizes Centrais:
1. **Foco no Usuário e Personas:** Mapeie comportamentos, necessidades e restrições dos usuários antes de projetar [71].
2. **Integração Efetiva UX/UI + Frontend:** Trate o designer como o "arquiteto" e o desenvolvedor frontend como o "construtor", promovendo alinhamento técnico e funcional desde o discovery [58, 60].
3. **Foco no ROI de UX:** Cada $1 investido em UX pode retornar até $100 (9.900% de ROI), multiplicando a taxa de conversão em até 400% [102, 112]. O tempo de carregamento deve respeitar a regra dos 3 segundos para evitar o abandono [102, 141, 142].

---

## 2. Psicologia Comportamental e Leis de UX
Aplique os princípios psicológicos essenciais para estruturar fluxos simples e reduzir o esforço cognitivo [41, 90, 106].

### 2.1 Lei de Fitts (Alvos e Zonas de Alcance)
* **Princípio:** O tempo para alcançar um alvo é função da distância e do tamanho do alvo [42].
* **Aplicação:**
  * Aumente o tamanho de botões e áreas clicáveis primárias [42, 43].
  * Na interface mobile, posicione ações críticas (ex: botão de compra/avançar) na zona do polegar (*thumb zone*), utilizando componentes flutuantes inferiores e evitando os cantos superiores de difícil acesso [43, 121, 122].

### 2.2 Lei de Hick (Tomada de Decisão)
* **Princípio:** O tempo para tomar uma decisão aumenta com o número e a complexidade das opções [44].
* **Aplicação:**
  * Reduza e simplifique as opções apresentadas [46, 106].
  * Destaque recomendações (ex: "3 opções recomendadas do chefe" em vez de um menu exaustivo), permitindo que o usuário decida mais rápido [46].
  * Limite as opções em telas de preços/planos a no máximo 2 ou 3 [46].

### 2.3 Lei de Miller (Carga de Memória de Trabalho)
* **Princípio:** O ser humano mantém em média apenas $7 \pm 2$ itens na memória de trabalho [47].
* **Aplicação:**
  * Agrupe dados extensos em blocos lógicos (*chunking*) [47, 48].
  * Divida formulários longos em etapas sequenciais com barra de progresso (ex: etapas de 4 campos) [48, 106].

### 2.4 Limiar de Doherty (Velocidade Percebida)
* **Princípio:** A produtividade e o engajamento aumentam quando a resposta do sistema ocorre em menos de 400 ms [49].
* **Aplicação:**
  * Utilize atualizações otimistas na UI (*optimistic UI updates*): reflita o sucesso da ação na interface imediatamente no frontend enquanto a requisição assíncrona é processada no banco de dados [50].
  * Exiba estados de carregamento (*skeleton screens* ou spinners) quando operações demorarem mais que o limite perceptível [50, 106].

### 2.5 Lei de Postel / Princípio da Robustez
* **Princípio:** Seja liberal no que aceita e conservador/rigoroso no que envia [51].
* **Aplicação:**
  * Permita entradas flexíveis de dados pelo usuário (ex: formatação automática de CPF, telefone, datas e valores monetários sem exigir digitação manual de símbolos ou pontuação) [52, 53].
  * Sanitize e normalize os dados no frontend antes do envio para o banco de dados [53].

---

## 3. Design System e Engenharia de UI
Construa interfaces consistentes, escaláveis e de fácil manutenção através de uma biblioteca de componentes reutilizáveis [5, 8].

### 3.1 Arquitetura de Componentes e Design Tokens
1. **Design Atômico:** Construa primeiro os elementos atômicos menores (botões, inputs, tipografia, cores), combinando-os posteriormente em moléculas, organismos e páginas [14].
2. **Design Tokens:** Centralize valores visuais em tokens nomeados estruturados em camadas:
   * **Camada Primitiva:** Valores brutos (ex: `blue-500`, `spacing-16`) [16].
   * **Camada Semântica:** Significados funcionais (ex: `color-action-primary`, `spacing-card-padding`) [16].
3. **Categorias de Bibliotecas:** Avalie o modelo adequado ao contexto da equipe (Open-source como Material/Shadcn, Propriética In-house ou Headless/Unstyled para controle visual total com acessibilidade nativa) [11, 29].

### 3.2 Governança e Boas Práticas de UI
* **Nomenclatura Padronizada:** Alinhe os nomes de componentes no Figma estritamente aos nomes das propriedades em código (ex: `Button/Primary/Default`) [19, 20].
* **Estados e Variantes:** Mapeie sistematicamente todos os estados interativos (`default`, `hover`, `focus`, `active`, `disabled`) e suportes a temas (Light/Dark mode) usando propriedades de componentes em vez de componentes soltos [23, 210, 211].
* **Versionamento Semântico:** Utilize controle de versão `MAJOR.MINOR.PATCH` para atualizações de biblioteca, fornecendo *release notes* claros e guias de migração em breaking changes [24, 25].
* **Testes em Camadas:** Combine testes unitários (comportamento), testes de regressão visual e testes de acessibilidade no pipeline de CI/CD [25, 26].

---

## 4. Checklist Prático de Acessibilidade Web (WCAG 2.2 - Nível AA)
A acessibilidade deve ser projetada desde o primeiro dia no Figma e mantida no código [21, 196]. Siga os 4 princípios **POUR** (Percebível, Operável, Compreensível e Robusto) [198-200].

### Checklist de Execução:
- [ ] **Contraste de Cores:**
  * Garanta proporção de contraste mínima de **4.5:1** para texto normal e **3:1** para texto grande (18pt+ ou 14pt em negrito) e componentes de interface [203].
  * **Nunca use apenas a cor** para transmitir informação; combine com texto explicativo, ícones (✔ ✖) ou alterações de borda/forma [204].
- [ ] **Tipografia e Espaçamento:**
  * Utilize tamanho de fonte base mínimo de **16px** para texto de corpo [205].
  * Mantenha espaçamento de linha (*line-height*) generoso e parágrafos curtos [205].
  * Garanta legibilidade quando o usuário aplicar zoom de até 200% no navegador [195, 205].
- [ ] **Estrutura e Hierarquia Semântica:**
  * Defina **apenas um elemento `<h1>`** principal por tela/página [206].
  * Mantenha a hierarquia lógica de títulos (`<h2>`, `<h3>`, etc.) sem saltos de nível [206].
- [ ] **Navegação por Teclado e Foco Visível:**
  * Garanta que todos os elementos interativos sejam alcançáveis via tecla `Tab` na ordem natural de leitura [207].
  * Mantenha um **indicador de foco visual bem visível e claro** em todos os botões, links e campos ativados via teclado [207, 208].
- [ ] **Formulários Acessíveis:**
  * Insira **rótulos visíveis (`<label>`)** associados a cada campo (não substitua o rótulo pelo `placeholder`) [208].
  * Exiba mensagens de erro claras, descritivas e vinculadas ao campo específico informando como corrigir o erro [208, 209].
  * Indique campos obrigatórios de forma clara e não apenas por cores [208].
- [ ] **Mídia e Microcopy:**
  * Forneça textos alternativos (`alt text`) informativos para imagens com conteúdo e marque imagens meramente decorativas como nulas [210, 211].
  * Utilize textos de link descritivos (ex: "Ver detalhes do pedido" em vez de "Clique aqui") [209].

---

## 5. Arquitetura Frontend e Performance de Aplicação
A velocidade técnica é um pilar direto de UX [107, 141].

### 5.1 Padrões Arquiteturais
* **Baseada em Componentes:** Padrão padrão para SPAs modernas (React, Vue, Svelte), com componentes isolados e modulares [126, 127].
* **JAMstack / SSR / SSG:** Uso de frameworks como Next.js/Nuxt para pré-renderização no servidor, melhorando métricas essenciais como *First Contentful Paint* (FCP) e *Largest Contentful Paint* (LCP) [126, 129, 154].
* **Micro Frontends:** Para aplicações corporativas de grande escala com equipes independentes usando Webpack Module Federation ou Single-SPA [126, 127].

### 5.2 Otimizações Frontend
1. **Code Splitting e Lazy Loading:** Divida o bundle JavaScript e adie o carregamento de rotas e componentes não críticos. Isso pode reduzir o tempo de carregamento inicial em até **40%** [147-150].
2. **Otimização de Imagens:** Utilize formatos modernos (WebP, AVIF), compressão adequada e carregamento preguiçoso (`loading="lazy"`) para elementos abaixo da dobra [150-152].
3. **Minimização de Recursos Bloqueantes:** Inline CSS crítico e adie scripts secundários (atributos `async`/`defer`) [151, 156].

### 5.3 Otimizações Backend e Infraestrutura
1. **Estratégia de Cache Multi-nível:** Implemente cache em memória (Redis/Memcached) para consultas pesadas de banco de dados e cabeçalhos HTTP/browser cache para ativos estáticos [160, 161].
2. **Content Delivery Networks (CDNs) & Edge Computing:** Sirva estáticos e execute lógicas de borda (Cloudflare Workers, Lambda@Edge) próximas ao usuário (<50 milhas) para reduzir a latência de rede e acelerar conexões TLS em até **3x** [162, 163, 172, 173].
3. **Indexação de Banco de Dados:** Crie índices adequados em campos frequentemente consultados para reduzir o tempo de resposta de milissegundos elevados para valores residuais [165-167].
4. **Design de APIs Eficiente:** Utilize GraphQL para agrupar requisições complexas em uma única ida e volta (*round-trip*), eliminando problemas de *over-fetching* e *under-fetching* [169, 170].

---

## 6. Processo de Colaboração UX/UI x Frontend (Handoff & Qualidade)

### 6.1 Matriz de Resolução de Desafios Comuns:
| Desafio Identificado | Causa Raiz | Solução Prática Integrada |
| :--- | :--- | :--- |
| **Divergência de Visão** | Protótipos inviáveis ou com alto custo técnico [64]. | Participação do Frontend nas reuniões de Discovery e Prototipagem [64]. |
| **Gargalos de Performance** | Animações pesadas ou elementos visuais complexos [64]. | Testes contínuos de desempenho com Lighthouse e validação de métricas Core Web Vitals [64, 157]. |
| **Inconsistência Visual** | Interpretações distintas do design no código [64]. | Adoção de um Design System único documentado com biblioteca sincronizada [64]. |
| **Retrabalho / Falta de Feedback** | Validação feita apenas na entrega final [64]. | Sessões periódicas de review e uso de ferramentas colaborativas (Figma/Zeplin) [62, 64]. |

### 6.2 Métricas de Acompanhamento do Sucesso da Skill:
* **Taxa de Cobertura de Componentes:** Percentual da aplicação construído via Design System em relação a código customizado [32].
* **Métricas Core Web Vitals:** LCP < 2.5s, FID/INP < 200ms, CLS < 0.1 [154, 157].
* **Taxas de Detach e Override:** Monitoramento do descolamento de componentes no Figma e alterações de código que sinalizam rigidez na biblioteca [28, 32].
* **Nível de Acessibilidade:** Conformidade em auditorias automatizadas e manuais WCAG 2.2 AA [22, 201].

---
*Skill elaborada a partir das diretrizes de Usabilidade, Prototipagem, Acessibilidade e Arquitetura Frontend dos materiais do repositório.*
