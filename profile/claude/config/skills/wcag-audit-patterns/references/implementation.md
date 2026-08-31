# Implementação acessível

Como construir um componente que já nasce conforme, em vez de auditá-lo depois. Este é o
caminho de quem está **escrevendo** código; para auditar o que já existe, o fluxo é o
procedimento do `SKILL.md` com a matriz de cenários.

Duas seções do `SKILL.md` valem tanto aqui quanto lá, com o sinal invertido: **Cascatas**
lista os defeitos que ferem vários critérios de uma vez — na auditoria dizem o que mais
registrar, aqui dizem o que não escrever; **Sinais estáticos de critérios de runtime**
lista o que o CSS entrega de graça (`outline:none`, largura fixa, `font-size` em px)
antes de qualquer medição no navegador.

## Ao implementar um componente novo

Construa na ordem abaixo. Cada etapa fecha uma família de critérios, e pular uma delas
obriga a reimplementá-la depois com ARIA — que é mais trabalhoso e falha mais.

1. **Escolha o elemento semântico** antes de qualquer estilo. `<button>` para ação,
   `<a href>` para navegação, `<input>` + `<label>` para entrada, `<table>` com `<th>`
   para dados tabulares, `<nav>`/`<main>` para regiões. Isso já entrega nome, função,
   foco e teclado — os quatro pontos que `4.1.2` e `2.1.1` cobram.
2. **Garanta o nome acessível.** Texto visível é o melhor nome. Quando o design não
   comporta texto, use `aria-label` que **contenha** o rótulo visual, ou `.sr-only`.
   Fecha `1.1.1`, `2.4.4`, `2.5.3`, `4.1.2`.
3. **Exponha estado e relação.** `aria-expanded`, `aria-selected`, `aria-checked`,
   `aria-current`, `aria-controls`, `aria-describedby`. Todo estado que a cor ou a
   posição comunicam visualmente precisa existir também na árvore de acessibilidade.
   Fecha `1.4.1`, `3.3.1`, `4.1.2`.
4. **Percorra o componente só com o teclado**: `Tab`, `Shift+Tab`, `Enter`, `Space`,
   `Esc` e setas. Nada pode ser inalcançável, nada pode prender o foco, e o indicador
   de foco precisa estar visível. Fecha `2.1.1`, `2.1.2`, `2.4.3`, `2.4.7`.
5. **Verifique a apresentação**: contraste, tamanho de alvo, comportamento em 320px,
   `line-height`. Fecha `1.4.3`, `1.4.10`, `1.4.12`, `2.5.8`.
6. **Anuncie o que muda sozinho.** Carregamento, sucesso e erro precisam de
   `role="status"` ou `role="alert"` já presentes no DOM antes da mensagem chegar.
   Fecha `4.1.3`.

### Critérios por tipo de componente

Use esta tabela como ponto de partida quando o componente ainda não existe — ela diz o
que consultar antes de escrever a primeira linha.

| Componente | Critérios a atender |
|---|---|
| Botão, botão-ícone | `1.1.1` `2.1.1` `2.4.7` `2.5.3` `2.5.8` `3.2.4` `4.1.2` |
| Link | `2.4.4` `2.4.7` `2.5.3` `4.1.2` |
| Campo de formulário | `1.3.5` `2.4.6` `3.2.1` `3.3.1` `3.3.2` `3.3.3` `4.1.2` |
| Formulário completo | `1.3.1` `3.2.2` `3.3.4` `3.3.7` `3.3.8` `4.1.3` |
| Modal, diálogo | `2.1.2` `2.4.3` `2.5.2` `4.1.2` |
| Menu, dropdown, combobox | `2.1.1` `2.1.2` `2.4.3` `4.1.2` |
| Acordeão, abas | `1.3.1` `2.1.1` `4.1.2` |
| Tabela de dados | `1.3.1` `1.4.10` `2.4.6` |
| Lista, card repetido | `1.3.1` `1.3.2` `2.4.4` |
| Carrossel, slider | `2.2.2` `2.3.1` `2.5.1` `2.5.7` `4.1.2` |
| Navegação, breadcrumb | `2.4.1` `2.4.3` `2.4.5` `3.2.3` |
| Tooltip, popover | `1.4.13` `2.1.1` `4.1.2` |
| Feedback assíncrono | `3.3.1` `4.1.3` |
| Upload, drag & drop | `2.1.1` `2.5.1` `2.5.7` `4.1.2` |
| Ícone, ilustração, gráfico | `1.1.1` `1.4.1` `1.4.5` `1.4.11` `3.2.4` |
| Mídia (áudio, vídeo) | `1.2.1` `1.2.2` `1.2.3` `1.2.4` `1.2.5` `1.4.2` |
| Layout, grid, tipografia | `1.3.4` `1.4.3` `1.4.4` `1.4.10` `1.4.12` `2.4.11` `2.5.8` |
| Página, rota, shell | `2.1.4` `2.4.1` `2.4.2` `3.1.1` `3.2.3` `3.2.6` |
| Texto, instrução, microcopy | `1.3.3` `1.4.1` `3.1.2` `3.3.3` |
| Sessão, contador, tempo | `2.2.1` `4.1.3` |
| Interação por gesto ou sensor | `2.5.1` `2.5.2` `2.5.4` `2.5.7` |

Cada critério listado tem a condição de falha e um par ❌/✅ na referência do seu
princípio. Consulte-os enquanto escreve, não depois.

## Auto-revisão de diff

Os padrões de código que aparecem em quase todo PR de UI estão na tabela *Cascatas* do
`SKILL.md`, com o conjunto completo de critérios que cada um viola. Ao revisar um diff,
percorra aquela tabela — ela é a mesma lista, mantida num lugar só.

## Boas práticas

### Fazer

- **Semântica antes de ARIA** — `<button>` entrega nome, papel, foco e teclado de graça;
  `<div role="button">` obriga a reimplementar os quatro e a errar em algum
- **Rótulo persistente** — `<label htmlFor>` sempre; `.sr-only` quando o design não
  comporta rótulo visível (nunca `display:none`, que remove da árvore de acessibilidade)
- **Decidir o papel de cada `<svg>`** — decorativo recebe `aria-hidden="true"`,
  informativo recebe `role="img"` + nome
- **`:focus-visible` estilizado** em vez de `:focus` zerado
- **Unidades relativas e `max-width: 100%`** — resolve reflow, zoom e espaçamento juntos
- **Área de toque por `padding`**, não pelo tamanho do ícone
- **Testar com teclado** percorrendo a tela inteira só com `Tab`, `Enter`, `Space` e `Esc`

### Evitar

- **Testar só com ferramenta automatizada** — cobre 30-50% dos problemas; o resto exige
  navegação por teclado e leitura da árvore de acessibilidade
- **Parar no primeiro achado de cada tema** — auditoria termina quando os 255 cenários
  têm veredito, não quando a lista de achados "já ficou boa"
- **Agrupar ocorrências numa linha só** — três campos sem rótulo são três problemas;
  agrupar é o que faz 45 problemas virarem 6 linhas
- **Rebaixar para "verificar no navegador"** o que já está escrito no CSS — `outline:none`
  e largura fixa são falhas confirmadas, não pendências
- **Omitir o critério que não se aplica** — `N/A` justificado é resultado; silêncio é lacuna
- **Auditar só a pasta pedida** num microfrontend — landmarks, `lang`, `<title>` e reset
  de foco vivem no shell, e a tela reprova por eles do mesmo jeito
- **ARIA como primeira solução** — ARIA mal aplicado piora o resultado em relação a
  nenhum ARIA
- **Esconder o indicador de foco** — quem navega por teclado perde a referência de onde está
- **Bloquear zoom** (`user-scalable=no`, `maximum-scale<2`)
- **Cor como único indicador** de estado, erro ou obrigatoriedade
- **`aria-live` em container criado junto com a mensagem** — a região precisa existir
  antes para que a mudança seja anunciada

