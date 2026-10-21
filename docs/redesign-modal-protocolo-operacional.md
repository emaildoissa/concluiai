# Redesign de Usabilidade: Modal "Editar Protocolo Operacional"

> **Base normativa:** [`skill-usabilidade-e-prototipagem.md`](file:///c:/Users/Marcos%20Issa/Documents/concluiai/skill-usabilidade-e-prototipagem.md)  
> **Componente Alvo:** `ChecklistBuilder.tsx` (`.sop-modal-shell`, `.sop-modal-header`, `.sop-modal-nav-tabs`, `.sop-item-card`)  
> **Objetivo:** Transformar a interface de edição de protocolos operacionais em uma experiência fluida, sem poluição visual, ergonômica e 100% acessível (WCAG 2.2 AA).

---

## 1. Diagnóstico dos Problemas Identificados

| Ponto de Dor | Causa Raiz Técnica / UX | Impacto no Usuário |
| :--- | :--- | :--- |
| **Abas espremidas / cortadas** | Falta de `flex-shrink: 0` nas abas dentro de flex container com `overflow-y: auto`. | O usuário não consegue ler as abas `⚙️ 1. Parâmetros` e `📝 2. Roteiro`, gerando sensação de tela quebrada. |
| **Sobrecarga de opções (Hick)** | Exibição de até 10 chips de modelos soltos em 3 linhas desordenadas por item. | Paralisia de decisão, confusão visual e perda do foco no preenchimento do checklist. |
| **Campos quantitativos ocultos** | O tipo de auditoria ficava escondido em um `<select>` no rodapé do item, abaixo de hora e peso. | O usuário cadastra uma geladeira e não vê onde colocar os limites de temperatura (°C ou pH). |
| **Falta de agrupamento (Miller)** | Cada item possuía cerca de 15 inputs e botões sem separação clara por blocos lógicos. | Cansaço cognitivo ao rolar uma lista com múltiplos itens extensos. |
| **Alvos de toque pequenos (Fitts)** | Botões de ordenação (▲/▼) e exclusão com área de clique reduzida e baixo contraste. | Dificuldade de clique e cliques acidentais. |

---

## 2. Aplicação das Leis de UX e Psicologia Comportamental

### 2.1 Lei de Hick (Tomada de Decisão Simples)
- **Antes:** 10 botões de templates competindo por atenção dentro de cada passo do formulário.
- **Agora:** Um seletor limpo e elegante `⚡ Carregar Modelo Sugerido...`, com categorias bem demarcadas (Controle Térmico, Sushi Bar, Segurança Alimentar, Sanitização).
- **Tipos de Verificação Claros:** Redução da escolha do tipo de tarefa a 3 botões em destaque visual imediato:
  1. `📏 Medição (Temperatura, pH, Óleo)`
  2. `📸 Foto Obrigatória (Auditoria IA)`
  3. `✓ Confirmação Simples (Check)`

### 2.2 Lei de Miller (Chunking / Blocos Lógicos)
Cada passo do protocolo foi estruturado em **3 zonas visuais distintas**:
1. **Zona 1 - Identificação & Tipo:** Número da etapa, Título da tarefa e Seletor Segmentado de Verificação.
2. **Zona 2 - Regra de Negócio Específica:**
   - Se for *Medição*: Painel de Food Safety com atalhos de unidade (`°C`, `pH`, `%`) e limites *Mínimo* e *Máximo*.
   - Se for *Foto IA*: Diretriz operacional descritiva com botão assistivo `⚡ Gerar com IA`.
3. **Zona 3 - Parâmetros Operacionais & Ações:** Horário limite, Criticidade (Alerta WhatsApp), ordenação e remoção em rodapé discreto e organizado.

### 2.3 Lei de Fitts (Ergonomia e Alvos de Clique)
- Botões de seleção e abas com altura mínima de **42px a 46px**, permitindo toque confortável em mouse e telas sensíveis ao toque.
- Ações destrutivas (Remover tarefa) posicionadas de forma segura e com confirmação visual, evitando acionamentos acidentais.

### 2.4 Lei de Postel / Princípio da Robustez
- **Detecção Inteligente:** Se o usuário digitar "Geladeira", "Freezer", "pH", "Óleo" ou "Temperatura" no título, o sistema detecta automaticamente a intenção, seleciona o modo *Medição* e preenche os limites recomendados (ex: 1°C a 4.5°C para refrigeradores e -22°C a -18°C para freezers).
- Aceita decimais com vírgula (`4,2`) ou ponto (`4.2`).

---

## 3. Conformidade com Acessibilidade (WCAG 2.2 Nível AA)

- **Contraste de Cores:** Todos os textos possuem relação de contraste superior a **4.5:1** contra o fundo escuro (`#0f172a` e `#1e293b`).
- **Não dependência de cor:** Ícones universais acompanham todos os estados (ex: 📏 Medição, 🚨 Tarefa Crítica, ⚡ IA).
- **Rótulos explícitos:** Todo `<input>` possui seu respectivo `<label>` legível acima do campo.
- **Foco visível:** Estados `:focus-visible` com anel de foco azul/índigo nítido para navegação 100% via teclado (`Tab`).

---

## 4. Estrutura dos Componentes e Design Tokens

```
sop-modal-shell (920px max, border-radius 20px, box-shadow elevado)
 ├── sop-modal-header (flex-shrink: 0, título h3 com tracking fechado, subtítulo e fechar)
 ├── sop-modal-nav-tabs (flex-shrink: 0, altura 54px garantida, pills com badges)
 │    ├── [ SVG 1. Parâmetros & Unidades (X un.) ]
 │    └── [ SVG 2. Roteiro & Diretrizes IA (Y itens) ]
 ├── sop-modal-body (scroll vertical fluido, gap 1.25rem)
 │    └── sop-item-card (card modular com 3 blocos hierárquicos)
 └── sop-modal-footer (flex-shrink: 0, cancelar à esquerda, salvar destacado à direita)
```

---

## 5. Regras de Negócio e Refinamentos Solicitados

### 5.1 Como o sistema sabe que o valor está fora da faixa?
Ao cadastrar ou carregar uma tarefa do tipo **Medição Numérica**, o gestor define os parâmetros de tolerância:
- **Limite Mínimo Aceitável (`min_value`)**: Exemplo `80°C` (temperatura de segurança do buffet ou fritadeira).
- **Limite Máximo Aceitável (`max_value`)**: Exemplo `100°C`.

Durante a execução da rotina pelo operador no aplicativo:
1. **Validação Matemática Instantânea:**
   $$\text{Não Conforme} \iff (\text{valor} < \text{min\_value}) \lor (\text{valor} > \text{max\_value})$$
   - Se o operador aferir `78°C` (menor que o mínimo de 80): **Fora da faixa (Inconforme)**.
   - Se aferir `105°C` (maior que o máximo de 100): **Fora da faixa (Inconforme)**.
   - Se aferir `85°C` (entre 80 e 100): **Dentro da faixa (Conforme)**.
2. **Resposta Visual em Tempo Real:** A interface do operador acende um badge em vermelho pulsante alertando que a temperatura ou pH está fora do padrão exigido pela Vigilância Sanitária e bloqueia o envio sem o preenchimento de um plano de ação corretiva imediato (ex: "Ajustado termostato para nível 4").
3. **Gatilho de Disparo:** Se e somente se a opção **"Disparar alerta imediato no WhatsApp..."** estiver marcada (ou a tarefa for crítica), a API despacha a mensagem de não-conformidade diretamente para a fila de WhatsApp dos supervisores.

### 5.2 Caixas Desmarcadas por Padrão (Ambiente Seguro de Testes)
Para evitar envios de notificações falsas ou exigências indesejadas durante a fase de testes e homologação:
- `alert_on_non_compliant`: **Desmarcado por padrão (`false`)**;
- `is_critical` (Tarefa Crítica): **Desmarcado por padrão (`false`)**;
- `requires_gps` (Validação por GPS): **Desmarcado por padrão (`false`)**.

### 5.3 Substituição de Emojis por Ícones SVG Vetoriais
Removidos todos os emojis informais (🚨, ⚡, 📏, 📸, ✓, ⚙️, 📝) em favor de ícones SVG com design system padronizado (traço fino `strokeWidth: 2`, paleta neutra e semântica com destaque suave):
- **Abas:** Ícones vetoriais de engrenagem (`settings`) e prancheta (`clipboard`);
- **Seletores de Tipo:** Termômetro com graduação (`thermometer`), câmera fotográfica (`camera`) e caixa de checagem (`check-square`);
- **Ações:** Sineta de notificação semântica em amarelo âmbar e triângulo de advertência em rosa/vermelho corporativo.
