---
name: wcag-audit-patterns
description: >
  Acessibilidade WCAG 2.2 em interfaces web, em dois modos: implementar (aplicar boas práticas ao escrever ou alterar um componente) e revisar (auditar o que já existe). Use ao criar, montar ou alterar qualquer componente de interface — formulário, campo de busca, botão, botão-ícone, modal, dropdown, abas, tabela, lista, card, carrossel, tooltip, navegação, upload, spinner, toast — mesmo quando o pedido não menciona acessibilidade: elemento semântico, nome acessível, estado ARIA e ordem de foco são decisões de quem escreve o componente, não uma correção posterior. Use também para auditar página, módulo ou componente, contar ou corrigir violações WCAG, revisar diff de UI antes do PR ou atender conformidade AA (LBI/eMAG).
argument-hint: "[opcional: --mode review (audita o que já existe) | --mode implement (aplica WCAG ao componente sendo escrito) — o componente ou caminho alvo]"
---

# WCAG Audit Patterns

Os 55 critérios de sucesso WCAG 2.2 aplicáveis a interfaces web, dos dois lados: como
percorrer todos eles numa auditoria e como atendê-los enquanto o componente é escrito.

## Dois modos, dois caminhos

Se a invocação vier com `--mode review` ou `--mode implement`, o argumento decide o
caminho direto, sem inferir pela situação:

- **`--mode review`** — só leitura. Segue o **Procedimento de auditoria** abaixo e emite
  o relatório; não edita nenhum arquivo, mesmo que a correção pareça trivial de aplicar
  junto.
- **`--mode implement`** — vai direto para `references/implementation.md`, mesmo que o
  componente já exista.

Sem `--mode`, infira pela situação:

| Situação | Por onde começar |
|---|---|
| escrever ou alterar um componente | **`references/implementation.md`** — a ordem de construção e os critérios por tipo de componente |
| auditar o que já existe, contar violações, revisar diff, investigar relatório | **Procedimento de auditoria** abaixo, com `references/scenario-matrix.md` |

Implementar custa menos que auditar, e é por isso que os dois caminhos são diferentes.
Ao escrever, as decisões aparecem numa ordem natural — primeiro o elemento, depois o
nome, depois o estado — e seguir essa ordem fecha famílias inteiras de critérios de
graça: escolher `<button>` em vez de `<div onClick>` já entrega nome, papel, foco e
teclado, os quatro pontos que `4.1.2` e `2.1.1` cobram. Reconstruir isso depois com ARIA
é mais trabalhoso e falha mais.

Quando o componente já existe, a ordem se inverte: não há decisão a tomar, há veredito a
emitir, e aí vale a matriz de cenários.

As seções **Cascatas** e **Sinais estáticos de critérios de runtime** deste arquivo
servem aos dois modos — na auditoria dizem o que mais registrar, na implementação dizem
o que não escrever.

## Procedimento de auditoria

Auditar é **percorrer uma lista fechada**, não procurar problemas até achar alguns. Sem
esse percurso o resultado é sempre o mesmo: cinco ou seis achados óbvios e silêncio sobre
os outros quarenta critérios — silêncio que o leitor do relatório lê como aprovação.

### 1. Fixe o escopo real

O escopo nunca é só a pasta pedida. Um módulo de microfrontend não contém `<html>`,
`<main>`, `<title>` nem o CSS global — e é exatamente aí que moram `2.4.1`, `2.4.2`,
`2.4.7`, `3.1.1` e `1.4.4`. Antes de auditar, localize e inclua:

| Camada | Onde procurar | Critérios que só aparecem aqui |
|---|---|---|
| módulo pedido | pasta alvo | maioria de `1.1.x` `1.3.x` `3.3.x` `4.1.x` |
| shell / layout raiz | `App.tsx`, `layout/`, `routes/`, `main.tsx` | `2.4.1` `2.4.2` `2.4.3` `3.2.3` `3.2.6` |
| documento | `index.html`, `<meta name="viewport">` | `3.1.1` `1.4.4` `2.4.2` |
| CSS global e tokens | `*.css`, tema, reset do design system | `2.4.7` `1.4.3` `1.4.4` `1.4.10` `1.4.11` `1.3.2` |
| design system | componentes de terceiros usados (Mistica, MUI…) | `2.1.1` `2.4.3` `2.4.7` `4.1.2` |

Camada fora de alcance vira **falha condicional** com o que falta verificar. Fora de
alcance não é aprovação.

### 2. Faça o inventário antes de julgar

Conte o que existe no escopo: elementos interativos, campos de formulário, imagens e
`<svg>`, headings, landmarks, regiões de status, e as regras de CSS que tocam foco,
largura, tipografia e espaçamento. É o inventário que transforma *"o formulário tem
problema de rótulo"* em *"três campos sem rótulo, um achado por campo"*.

### 3. Percorra a matriz de cenários

Abra `references/scenario-matrix.md` e emita veredito para **todos** os 255 cenários dos
55 critérios: `PASSOU`, `FALHOU`, `N/A` ou `RUNTIME`. Nenhuma linha fica em branco.

Para cada `FALHOU`, pegue o **gatilho e a mensagem exata** na tabela do critério, na
referência do seu princípio. As tabelas `Gatilho | Mensagem | Sev` dessas referências são
o catálogo de detecção — não são ilustração. Redação própria no lugar da mensagem
catalogada quebra a comparabilidade entre auditorias da mesma tela.

### 4. Uma ocorrência por elemento, não uma linha por tema

Três campos sem rótulo são três ocorrências. O mesmo alvo de toque medido em três
viewports são três ocorrências. Agrupar por tema é o que faz um relatório de 45 problemas
encolher para 6 linhas e parecer uma tela quase conforme.

O relatório conta duas grandezas diferentes, e as duas importam:
**itens** (critérios distintos que falharam) e **problemas** (ocorrências somadas).

Toda ocorrência recebe uma **origem**, porque origem define quem corrige — nunca se a
falha entra ou não no relatório:

| Origem | Exemplo | Encaminhamento |
|---|---|---|
| módulo | campo sem rótulo no componente auditado | corrigir no PR |
| shell | ausência de `<main>` e de `<h1>` | abrir no time dono do shell |
| design system | `outline:none` no CSS do Mistica | reportar upstream + override local |
| ferramenta de dev | botão do React Query Devtools sobrepondo alvo | confirmar que não vai para produção |

Sem essa coluna, metade dos achados de uma auditoria em microfrontend parece bug do
módulo e alguém tenta corrigir CSS de terceiro.

### 5. Aplique as cascatas

Um defeito raramente fere um critério só. Depois de registrar um achado, verifique os
critérios que caem junto com ele — a seção *Cascatas* abaixo tem os conjuntos completos.

### 6. Classifique e emita

Severidade pela tabela de impacto, e relatório no formato da seção *Formato do relatório*.

## Cascatas: um defeito, vários critérios

O erro mais comum de subcontagem é registrar o critério mais óbvio e parar. Cada linha
abaixo é um único defeito no código que precisa aparecer sob **todos** os critérios da
coluna da direita:

| Defeito | Critérios que falham juntos |
|---|---|
| campo com `placeholder` e sem rótulo persistente | `3.3.2` `2.4.6` `2.5.3` `4.1.2` |
| `<div onClick>` sem semântica | `2.1.1` `2.4.3` `4.1.2` |
| página sem `<main>` e sem skip-link | `2.4.1` + axe `landmark-one-main` + axe `region` |
| página sem `<h1>` | `1.3.1` `2.4.6` + axe `page-has-heading-one` |
| `outline: none` no reset global | `2.4.7` `1.4.11` |
| botão-ícone sem nome acessível | `1.1.1` `4.1.2` (+ `2.4.4` se for link) |
| largura fixa acima de 320px | `1.4.10` `1.4.4` |
| dois alvos próximos e sobrepostos | `2.5.8` × 2 (espaçamento e sobreposição são achados distintos) |
| erro de carregamento sem mensagem na tela | `3.3.1` `4.1.3` |
| gesto sem alternativa de ponteiro único nem de teclado | `2.5.1` × 2 (sem teclado e sem ponteiro único) |
| `<svg>` sem `<title>` nem `aria-hidden` | `1.1.1` `4.1.2` |
| `aria-label` divergente do texto visível | `2.5.3` `3.2.4` |
| `aria-describedby` apontando para `id` condicional | `3.3.1` `2.4.4` |
| link genérico (`Saiba mais`) sem contexto programático | `2.4.4` `2.4.6` |

Exemplo trabalhado — `<SearchField name="search" label="" placeholder="digite sua busca" />`
rende **quatro critérios e seis ocorrências**, não uma linha:

| Critério | Ocorrência |
|---|---|
| `3.3.2` | `Campo usa apenas placeholder como rótulo – preferir <label> persistente.` |
| `3.3.2` | `Campo sem nome acessível programático.` |
| `2.4.6` | `Campo sem rótulo programático: name='search'.` |
| `2.5.3` | `Uso apenas de placeholder 'digite sua busca' sem label.` |
| `4.1.2` | `Input type='search' sem nome acessível (label, aria-label).` |
| `4.1.2` | `Elemento interativo sem nome acessível.` |

## Sinais estáticos de critérios de runtime

Sete critérios só se confirmam no layout computado, mas quase todos deixam **rastro no
código-fonte**. Rebaixar todos eles para "verificar no navegador" é a segunda maior fonte
de subcontagem: a falha existe, está escrita no CSS, e some do relatório.

| Sinal no código | Critério | Mensagem catalogada |
|---|---|---|
| `width`/`min-width` fixo > 320px | `1.4.10` | `Largura fixa 500px > 320px pode impedir reflow em telas estreitas.` |
| `font-size` em `px` fixo | `1.4.4` | `font-size em px fixo (16px) – considere usar rem/em para redimensionamento.` |
| `:focus { outline: none }` | `2.4.7` | `CSS ':focus { outline:none }' remove indicador de foco – viola 2.4.7.` |
| `-webkit-tap-highlight-color: transparent` | `2.4.7` | `Realce de toque removido (…) — pode reduzir o feedback visual ao tocar…` |
| `tabindex="-1"` em elemento interativo | `2.4.7` `2.4.3` | `Elemento interativo <button> com tabindex=-1 – removido do fluxo de foco…` |
| `<svg fill="none">` funcional | `1.4.11` | `Ícone SVG funcional com fill='none' pode não ter contraste 3:1.` |
| `order:` ou `flex-direction: *-reverse` | `1.3.2` | `CSS order altera sequência visual sem alterar DOM – pode confundir leitores de tela.` |
| ícone de 16–20px como área clicável | `2.5.8` | alvo abaixo de 24×24px |
| `onTouchMove`/`onWheel`/gesto sem handler de teclado | `2.5.1` | `Ação por gesto sem manipulador de teclado.` |
| `user-scalable=no` ou `maximum-scale<2` | `1.4.4` | zoom bloqueado na meta viewport |

Marque `RUNTIME` apenas o que **sobra** depois de esgotar esses sinais — a medição de
contraste real, o reflow efetivo em 320px e o tamanho renderizado do alvo.

## Formato do relatório

Abra com a contagem nas duas grandezas, depois agrupe por critério:

```md
## Falhas encontradas (11 itens, 42 problemas)

### 3.3.2 — Rótulos ou Instruções · A · 🔴 Crítico · 2 problemas

| Ocorrência | Local | Correção |
|---|---|---|
| Campo usa apenas placeholder como rótulo – preferir <label> persistente. | `components/search-section.tsx:22` | `label="Buscar serviços digitais"` |
| Campo sem nome acessível programático. | `components/search-section.tsx:22` | idem |
```

Feche com duas seções que costumam ser esquecidas e mudam a leitura do resultado:

- **`N/A` justificados** — quais critérios não se aplicam e por quê (sem mídia, sem
  formulário de fluxo legal, sem sessão temporizada). Um `N/A` sem justificativa é
  indistinguível de um critério não auditado.
- **Pendente de runtime** — o que sobrou de fato para o navegador, com o valor a medir e
  o limiar esperado.

## Prioridade por impacto

Nem toda violação pesa igual — classifique pelo que ela impede, não pela quantidade. O
impacto de cada critério está na coluna `Imp` da matriz de cenários:

| Impacto | Critério de classificação |
|---|---|
| 🔴 **Crítico** | impede completamente o uso da funcionalidade |
| 🟠 **Alto** | grande dificuldade, mas existe algum contorno |
| 🟡 **Médio** | reduz a experiência sem impedir o uso |
| 🟢 **Baixo** | refinamento e consistência |

Três famílias concentram os bloqueadores reais e merecem atenção antes das demais:
**teclado** (`2.1.x`), **leitor de tela** (`1.1.1` `1.3.1` `2.4.x` `4.1.2`) e
**formulário** (`3.3.x`). Uma falha crítica em qualquer uma delas torna a tarefa
impossível para um grupo inteiro de usuários — dez problemas de nível Baixo não somam o
mesmo prejuízo.

Dentro de um mesmo critério o impacto varia com a gravidade do achado: um campo **sem
rótulo algum** é crítico, enquanto um campo com rótulo presente porém pouco descritivo é
um refinamento.

## Onde encontrar cada critério

Os quatro princípios não são taxonomia decorativa: cada um falha por um motivo diferente,
e o motivo orienta o tipo de correção.

| Princípio | Falha típica | SC | Referência |
|---|---|---|---|
| **Perceptível** | o conteúdo existe mas não chega ao usuário | `1.x` (20) | `detectors-perceivable.md` |
| **Operável** | chega ao usuário mas não é acionável | `2.x` (20) | `detectors-operable.md` |
| **Compreensível** | funciona mas confunde | `3.x` (13) | `detectors-understandable.md` |
| **Robusto** | parece certo mas a árvore de acessibilidade está vazia | `4.x` (2) | `detectors-robust.md` |

Um mesmo defeito costuma cruzar princípios: um `<div onClick>` sem semântica falha em
Operável (não recebe foco) **e** em Robusto (não expõe papel). Corrigir na raiz — trocar
por `<button>` — resolve os dois.

Sete critérios (`1.3.4` `1.3.5` `1.4.3` `1.4.4` `1.4.10` `2.4.7` `2.5.8`) se confirmam no
layout computado: um `max-width` correto ainda estoura por um token de espaçamento ou por
um container externo. Os limiares estão em `runtime-checks.md`.

> `4.1.1 Parsing` foi removido do WCAG 2.2 e não consta na cobertura.

## Referências

| Arquivo | Quando abrir |
|---|---|
| `references/scenario-matrix.md` | **toda auditoria** — os 255 cenários que exigem veredito, com nível e impacto |
| `references/detectors-perceivable.md` | imagens, mídia, estrutura, cor, contraste, reflow, tipografia (`1.x`) |
| `references/detectors-operable.md` | teclado, foco, tempo, movimento, navegação, gestos, alvo (`2.x`) |
| `references/detectors-understandable.md` | idioma, previsibilidade, formulários e erros (`3.x`) |
| `references/detectors-robust.md` | nome, função, valor e mensagens de status (`4.x`) |
| `references/runtime-checks.md` | limiares de layout renderizado, axe-core, Lighthouse, CLI |
| `references/implementation.md` | construir componente novo ou revisar diff de UI |
