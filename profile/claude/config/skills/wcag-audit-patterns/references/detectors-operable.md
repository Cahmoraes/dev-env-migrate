# Princípio 2 · Operável (`2.x`)

Todo comando precisa ser acionável sem mouse, sem visão e sem pressa. As falhas aqui
não escondem o conteúdo — elas tornam a interface impossível de conduzir.

A família **teclado** (`2.1.x`) concentra os bloqueadores absolutos: quando ela falha,
não há contorno possível, a tarefa simplesmente não se completa.

## Índice

- [2.1.1 Teclado](#211--teclado--a--base-)
- [2.1.2 Sem Armadilha de Teclado](#212--sem-armadilha-de-teclado--a--base-)
- [2.1.4 Atalhos de Caractere](#214--atalhos-de-caractere--a--base-)
- [2.2.1 Tempo Ajustável](#221--tempo-ajustável--a--base-)
- [2.2.2 Pausar, Parar, Ocultar](#222--pausar-parar-ocultar--a--base-)
- [2.3.1 Três Flashes](#231--três-flashes-ou-abaixo-do-limite--a--base-)
- [2.4.1 Pular Blocos](#241--pular-blocos--a--base-)
- [2.4.2 Página Titulada](#242--página-titulada--a--base-)
- [2.4.3 Ordem de Foco](#243--ordem-de-foco--a--base-)
- [2.4.4 Propósito do Link](#244--propósito-do-link-em-contexto--a--base-)
- [2.4.5 Múltiplas Formas](#245--múltiplas-formas--aa--base-)
- [2.4.6 Cabeçalhos e Rótulos](#246--cabeçalhos-e-rótulos--aa--base-)
- [2.4.7 Foco Visível](#247--foco-visível--aa--base-)
- [2.4.11 Foco Não Obscurecido](#2411--foco-não-obscurecido-mínimo--aa--base-)
- [2.5.1 Gestos de Ponteiro](#251--gestos-de-ponteiro--a--base-)
- [2.5.2 Cancelamento de Ponteiro](#252--cancelamento-de-ponteiro--a--base-)
- [2.5.3 Rótulo no Nome](#253--rótulo-no-nome--a--base-)
- [2.5.4 Atuação por Movimento](#254--atuação-por-movimento--a--base-)
- [2.5.7 Movimentos de Arrastar](#257--movimentos-de-arrastar--aa--base-)
- [2.5.8 Tamanho Mínimo do Alvo](#258--tamanho-mínimo-do-alvo--aa--base-)

---

## 2.1.1 — Teclado · A · base 🔴

| Condição | Problema | Impacto |
|---|---|---|
| `onclick` sem `onkeydown`/`onkeypress` e sem `tabindex` focável | `Elemento com onclick sem handler de teclado e sem tabindex focável.` | 🔴 Crítico |
| `role` de widget sem `tabindex` | `Elemento com role='button' sem tabindex – não é focável por teclado.` | 🔴 Crítico |
| `role` custom sem nome | `Controle customizado role='…' sem nome acessível.` | 🔴 Crítico |
| `<a>` sem destino real | `Link com href='#' sem funcionalidade aparente.` | 🟠 Alto |

```tsx
// ❌ três Críticos no mesmo elemento (2.1.1 + 4.1.2 + 2.4.3)
<div className="card" onClick={abrirDetalhe}>
  <span>Ver fatura</span>
</div>

// ✅ o elemento nativo entrega nome, papel, foco e teclado de graça
<button type="button" className="card" onClick={abrirDetalhe}>
  Ver fatura
</button>

// ✅ quando o nativo não serve (ex.: linha de tabela clicável)
<tr
  role="button"
  tabIndex={0}
  aria-label={`Ver fatura de ${mes}`}
  onClick={abrirDetalhe}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalhe(); }
  }}
>
```

`href="#"` também reprova. Se o elemento executa uma ação, é `<button>`; se navega,
é `<a href="/rota-real">`.

---

## 2.1.2 — Sem Armadilha de Teclado · A · base 🔴

Concentra-se em modais, menus, carrosséis, sliders e selects customizados.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `role="dialog"` sem botão de fechar | `Diálogo (role=dialog) sem botão de fechar visível – possível armadilha de teclado.` | 🔴 Crítico |
| popup sem controle focável de fechamento | `Pop-up/diálogo sem controle de fechamento focável – risco de armadilha.` | 🔴 Crítico |
| modal sem fechamento focável | `Modal sem controle de fechamento focável.` | 🔴 Crítico |
| slider custom sem `tabindex` | `Slider customizado sem tabindex – não focável.` | 🔴 Crítico |
| select custom sem `tabindex` | `Seletor customizado sem tabindex – não focável por teclado.` | 🔴 Crítico |
| modal sem `aria-modal` | `Modal sem aria-modal='true'.` | 🟠 Alto |
| `tabindex` positivo | `tabindex=3 cria ordem de tabulação customizada – risco de armadilha.` | 🟠 Alto |
| menu sem `role=menuitem` focável | `Menu sem itens com role=menuitem focáveis.` | 🟠 Alto |
| carrossel sem botões | `Carrossel sem controles (botões) acionáveis por teclado.` | 🟠 Alto |
| datepicker custom | `Datepicker customizado sem input nativo nem role – verificar suporte a teclado.` | 🟠 Alto |
| script prendendo teclas | `Script intercepta teclas e reforça foco – possível armadilha de teclado.` | 🟠 Alto |

```tsx
// ❌ sem botão de fechar focável, quem navega por teclado fica preso no diálogo
// (fechar só por Esc ou por clique no backdrop não basta)
<div role="dialog" onClick={fecharNoBackdrop}>
  <h2>Confirmar troca de plano</h2>
  {children}
</div>

// ✅ modal que satisfaz 2.1.2 + 2.4.3 de uma vez
<div role="dialog" aria-modal="true" aria-labelledby="t" onKeyDown={onEsc}>
  <h2 id="t">Confirmar troca de plano</h2>
  {children}
  <button type="button" onClick={fechar}>Cancelar</button>
</div>
```

O detector procura um **botão de fechar** dentro do diálogo. Fechar apenas por `Esc`
ou por clique no backdrop não é suficiente para passar.

---

## 2.1.4 — Atalhos de Caractere · A · base 🟠

| Mensagem | Sev |
|---|---|
| `accesskey='s' – atalho de caractere único pode conflitar com tecnologia assistiva.` | 🟡 Médio |
| `Atalhos de tecla única detectados: garantir mecanismo de desativar, remapear ou ativar apenas com foco.` | 🟡 Médio |
| `Atalhos de tecla única detectados via script – confirmar opção de desativá-los.` | 🟢 Baixo |

Se precisar de atalho, exija modificador (`Ctrl`/`Alt`) ou restrinja ao escopo focado —
um `keydown` global escutando `/` sequestra o comando de voz do usuário.

```tsx
// ❌ tecla única global sequestra ditado e comando de voz do usuário
useEffect(() => {
  const aoTeclar = (e: KeyboardEvent) => { if (e.key === '/') abrirBusca(); };
  document.addEventListener('keydown', aoTeclar);
  return () => document.removeEventListener('keydown', aoTeclar);
}, []);

// ✅ exige modificador e pode ser desligado nas preferências
useEffect(() => {
  if (!atalhosHabilitados) return;
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); abrirBusca(); }
  };
  document.addEventListener('keydown', aoTeclar);
  return () => document.removeEventListener('keydown', aoTeclar);
}, [atalhosHabilitados]);
```

A terceira alternativa aceita pelo critério é o atalho só valer enquanto o componente
está com foco — aí ele não compete com a tecnologia assistiva no resto da página.

---

## 2.2.1 — Tempo Ajustável · A · base 🟠

| Gatilho | Mensagem | Sev |
|---|---|---|
| `<meta http-equiv="refresh">` | `Meta refresh detectado: content='…' – pode redirecionar sem controle do usuário.` | 🟠 Alto |
| botão de tempo sem nome | `Botão de estender tempo sem nome acessível.` / `Botão de pausar sem nome acessível.` / `Controle de tempo sem nome acessível.` | 🟠 Alto |
| timeout sem botão de estender | `Limite de tempo detectado sem botão para estender o tempo.` | 🟡 Médio |
| contador sem região viva | `Sem região aria-live/role=status para anunciar a contagem de tempo.` | 🟡 Médio |
| mensagem de tempo sem `aria-live` | `Mensagem de tempo sem aria-live — atualização não é anunciada.` | 🟡 Médio |
| controle em elemento não semântico | `Controle de tempo em elemento não semântico (use <button>).` | 🟡 Médio |
| indício de sessão | `Indicação de timeout de sessão detectada – garantir que o usuário possa estender o tempo.` | 🟡 Médio |

```tsx
// ❌ a sessão cai sem aviso e sem como prorrogar
useEffect(() => {
  const id = setTimeout(logout, 15 * 60 * 1000);
  return () => clearTimeout(id);
}, []);

// ✅ padrão de expiração de sessão
<div role="status" aria-live="polite">
  Sua sessão expira em {minutos} minutos.
</div>
<button type="button" onClick={estender}>Continuar conectado por mais 15 minutos</button>
```

---

## 2.2.2 — Pausar, Parar, Ocultar · A · base 🟠

Gatilhos por classe/lib (`MOVING_HINTS`): `carousel` `slider` `swiper` `slick`
`splide` `glide` `marquee` `ticker` `rotator` `animate` `autoplay`.

| Mensagem | Sev |
|---|---|
| `Tag <marquee> obsoleta – conteúdo em movimento sem controle de pausa.` | 🟠 Alto |
| `Controle de movimento não focável por teclado.` | 🟠 Alto |
| `Carrossel/animação automática detectada sem botão de pausa visível.` | 🟡 Médio |
| `CSS com animação sem @media (prefers-reduced-motion) – oferecer alternativa para reduzir movimento.` | 🟡 Médio |

```css
/* ❌ animação contínua sem escape para quem tem sensibilidade a movimento */
.banner { animation: deslizar 3s linear infinite; }

/* ✅ trave o padrão no CSS global e o critério deixa de falhar na página inteira */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Um carrossel com autoplay precisa de um `<button>` de pausa **visível e focável**, não
apenas pausa no hover.

---

## 2.3.1 — Três Flashes ou Abaixo do Limite · A · base 🔴

Gatilhos: tags `<blink>`/`<marquee>` (`FLASH_TAGS`); classes `flash` `blink` `strobe`
`flicker` `animate-flash` `pulse` (`FLASH_CLASSES`); `@keyframes` alterando
`opacity`/`color`; `animation-duration` muito curto.

| Mensagem | Sev |
|---|---|
| `Elemento <blink> pode causar flashes – remover ou substituir.` | 🔴 Crítico |
| `Classe 'pulse' sugere animação de flash – verificar frequência (<3 por segundo).` | 🟠 Alto |
| `Animação CSS com @keyframes altera opacidade/cor – garantir menos de 3 flashes/s.` | 🟠 Alto |
| `Animação muito rápida (200ms) pode exceder 3 flashes/s.` | 🟠 Alto |
| `Animações CSS sem @media (prefers-reduced-motion).` | 🟠 Alto |

Atenção ao nome da classe: um skeleton loader chamado `pulse` (padrão em várias libs)
dispara este critério mesmo sendo inofensivo. Renomeie para `skeleton-shimmer` e
mantenha `animation-duration ≥ 1s`.

```css
/* ❌ nome sugere flash e a animação pisca 5x por segundo */
.pulse { animation: piscar 200ms infinite alternate; }
@keyframes piscar { from { opacity: 1; } to { opacity: 0; } }

/* ✅ skeleton lento, variação suave, e desligado sob prefers-reduced-motion */
.skeleton-shimmer { animation: shimmer 1.5s ease-in-out infinite; }
@keyframes shimmer { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer { animation: none; }
}
```

Renomear a classe importa: `pulse`, `flash`, `blink` e `strobe` são tratados como
indício de risco mesmo quando a animação é inofensiva.

---

## 2.4.1 — Pular Blocos · A · base 🟠

Família **leitor de tela** — sem mecanismo de pular blocos, cada navegação obriga a
percorrer o menu inteiro de novo.

| Gatilho | Mensagem | Sev |
|---|---|---|
| sem skip-link e sem `<nav>`/`<main>` | `Sem skip-link e sem landmarks <nav>/<main> – usuários de teclado não podem pular blocos repetidos.` | 🟠 Alto |
| sem skip-link e sem `<main>` | `Sem skip-link nem landmark <main> – não há mecanismo para pular blocos.` | 🟠 Alto |
| landmarks faltando | `Landmarks ausentes: header, main, nav.` | 🟡 Médio |
| mecanismo ausente | `Mecanismo de pular blocos ausente nesta página.` | 🟡 Médio |
| bloco repetido com movimento | `Bloco repetitivo contém carrossel/ticker em movimento.` | 🟡 Médio |

Em microfrontend este é o critério mais fácil de esquecer, porque o `<main>` costuma
viver no shell e não no MFE. Se o seu módulo é montado dentro de um container do host,
confirme que o host expõe `<main>` — senão a página inteira reprova por causa do
seu módulo.

```tsx
// ❌ sem skip-link e sem landmarks: cada rota obriga a tabular o menu inteiro de novo
<div className="header">…</div>
<div className="content">…</div>

// ✅ no topo do layout raiz
<a href="#conteudo" className="skip-link">Pular para o conteúdo principal</a>
<header>…</header>
<nav aria-label="Navegação principal">…</nav>
<main id="conteudo" tabIndex={-1}>…</main>
```

```css
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 0; top: 0; z-index: 1000; /* precisa ficar visível ao Tab */ }
```

---

## 2.4.2 — Página Titulada · A · base 🟡

Títulos rejeitados (`GENERIC_TITLES`): `untitled` `sem título` `sem titulo` `página`
`pagina` `page` `home` `index` `document` `novo documento`.

| Mensagem | Sev |
|---|---|
| `Página sem elemento <title>.` / `Elemento <title> ausente ou vazio.` | 🟡 Médio |
| `<title> vazio ou muito curto: '…'` / `Sem título descritivo.` | 🟡 Médio |
| `<title> genérico: '…' – deve descrever o propósito da página.` | 🟢 Baixo |
| `Título pouco descritivo: '…'.` / `Título não é informativo o suficiente…` | 🟢 Baixo |
| `Título ('…') diverge de og:title ('…').` | 🟢 Baixo |

Em SPA o `<title>` precisa ser atualizado a cada rota. Sem isso, o leitor de tela anuncia
sempre o título estático do `index.html` e o usuário perde a referência de onde está.

```tsx
// ❌ SPA que mantém o título do index.html em todas as rotas
// <title>Minha Vivo</title>

// ✅ título específico por rota, do mais específico para o mais geral
useEffect(() => {
  document.title = `Fatura de ${mesReferencia} — Faturas — Minha Vivo`;
}, [mesReferencia]);
```

A ordem importa: o leitor de tela anuncia o título ao trocar de página, e o usuário
precisa ouvir primeiro o que mudou. Títulos como `Home`, `Página` ou `Minha Vivo` em
todas as rotas não permitem distinguir uma aba da outra.

---

## 2.4.3 — Ordem de Foco · A · base 🟠

Focáveis considerados: `a` `button` `input` `select` `textarea` `summary`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `role` de controle sem `tabindex` | `Controle role='tab' sem tabindex – não focável.` | 🟠 Alto |
| `tabindex` customizado | `tabindex=2 – ordem de foco customizada pode confundir navegação por teclado.` | 🟠 Alto |
| `tabindex` positivo | `tabindex=2 positivo.` / `tabindex=2 altera a ordem natural.` | 🟡 Médio |
| focável oculto | `Elemento focável mas oculto pode receber foco indevidamente.` | 🟡 Médio |
| modal sem `aria-modal` | `Modal sem aria-modal='true' – foco pode escapar.` | 🟡 Médio |
| expansível sem `aria-controls` | `Controle expansível sem aria-controls – ordem de foco pode ser imprevisível.` | 🟡 Médio |

"Focável oculto" é o bug clássico de menu/drawer: os itens continuam no DOM com
`opacity: 0` ou `visibility: hidden` no pai, mas seguem tabuláveis. Use o atributo
`hidden`, `display:none`, ou `inert` no container fechado.

```tsx
// ❌ o drawer fechado continua tabulável: o foco entra num menu invisível
<nav className={aberto ? 'drawer drawer--aberto' : 'drawer'}>  {/* .drawer { opacity: 0 } */}
  <a href="/planos">Planos</a>
</nav>

// ✅ fora do DOM quando fechado
{aberto && (
  <nav className="drawer drawer--aberto" aria-label="Menu principal">
    <a href="/planos">Planos</a>
  </nav>
)}
```

Se o componente precisa permanecer montado (animação de saída, estado preservado), use
`hidden` ou o atributo `inert` no container — ambos removem os descendentes do fluxo de
foco. `opacity: 0`, `visibility: hidden` em elemento ainda focável e `height: 0` não
removem, e é aí que o foco desaparece da tela para o usuário de teclado.

---

## 2.4.4 — Propósito do Link (Em Contexto) · A · base 🟡

Categoria **leitor de tela**. Textos vagos (`VAGUE`): `aqui` `clique` `clique aqui`
`click` `click here` `here` `continuar` `continue` `detalhes` `details` `go` `ir`
`leia mais` `link` `mais` `more` `read more` `saiba mais` `see` `see more` `ver`
`ver mais`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `<a>` sem nome algum | `Link sem nome acessível (sem texto, aria-label ou aria-labelledby).` | 🟡 Médio |
| link-ícone sem nome | `Link de ícone sem nome acessível.` / `Link somente ícone sem descrição textual.` | 🟡 Médio |
| `<a><img></a>` sem `alt` | `Link de imagem sem alt/nome acessível.` | 🟡 Médio |
| texto vago sem contexto | `Link com texto vago 'saiba mais' sem contexto programático.` | 🟡 Médio |
| `aria-labelledby` órfão | `aria-labelledby referencia id inexistente.` | 🟡 Médio |
| mesmo texto, destinos diferentes | `Texto de link 'saiba mais' aponta para 3 destinos diferentes sem diferenciação.` | 🟢 Baixo |
| só `title` | `Link depende apenas de title (tooltip visual) para descrição.` | 🟢 Baixo |
| `target="_blank"` sem aviso | `Link abre nova aba sem avisar no nome acessível.` | 🟢 Baixo |

```tsx
// ❌ três "Saiba mais" na mesma página apontando para rotas diferentes
<a href="/fibra">Saiba mais</a>

// ✅ contexto programático — o texto visível segue curto
<a href="/fibra" aria-describedby="card-fibra-titulo">Saiba mais</a>

// ✅ ou nome acessível completo
<a href="/fibra" aria-label="Saiba mais sobre Vivo Fibra">Saiba mais</a>

// ✅ nova aba anunciada
<a href={pdf} target="_blank" rel="noopener noreferrer">
  Contrato em PDF <span className="sr-only">(abre em nova aba)</span>
</a>
```

---

## 2.4.5 — Múltiplas Formas · AA · base 🟡

Conta os mecanismos de navegação disponíveis: menu, busca, mapa do site, breadcrumb.

| Mensagem | Sev |
|---|---|
| `Apenas 1 forma de navegação (menu).` | 🟡 Médio |
| `Apenas 1 forma(s) de navegação detectada(s) – recomenda-se ao menos 2 (menu, busca, mapa do site).` | 🟢 Baixo |
| `Existe menu, mas não há busca nem mapa do site como alternativa.` | 🟢 Baixo |
| `Sem breadcrumb ou indicador de localização – considerar adicionar para complementar a navegação.` | 🟢 Baixo |

Adicionar um breadcrumb (`<nav aria-label="Você está aqui">`) costuma ser a correção
mais barata quando o MFE não tem busca própria.

```tsx
// ❌ o menu é a única forma de chegar ao conteúdo
<nav aria-label="Navegação principal">{itens}</nav>

// ✅ breadcrumb como segunda forma de navegação, além do menu
<nav aria-label="Você está aqui">
  <ol>
    <li><a href="/">Início</a></li>
    <li><a href="/minha-conta">Minha conta</a></li>
    <li><a href="/minha-conta/faturas" aria-current="page">Faturas</a></li>
  </ol>
</nav>

// ✅ busca como alternativa ao menu
<form role="search" action="/busca">
  <label htmlFor="q">Buscar no site</label>
  <input id="q" name="q" type="search" />
  <button type="submit">Buscar</button>
</form>
```

`aria-current="page"` marca o item atual sem depender de cor, o que também atende
`1.4.1`. Duas formas bastam: menu + busca, menu + mapa do site, ou menu + breadcrumb.

---

## 2.4.6 — Cabeçalhos e Rótulos · AA · base 🟡

Cabeçalhos rejeitados (`GENERIC_HEADINGS`): `conteudo` `conteúdo` `header` `heading`
`info` `secao` `seção` `sem título` `texto` `titulo` `título`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| heading vazio | `Cabeçalho vazio ou com texto insuficiente.` | 🟡 Médio |
| `<input>` sem `<label>` | `Input sem label associado: name='search'` | 🟡 Médio |
| campo sem rótulo programático | `Campo sem rótulo programático: name='search'.` | 🟡 Médio |
| salto de nível | `Salto de cabeçalho de h2 para h4.` | 🟢 Baixo |
| heading/rótulo genérico | `Cabeçalho genérico: '…'.` / `Rótulo genérico: '…'.` | 🟢 Baixo |

Um único `<input name="search">` sem `<label>` costuma disparar `2.4.6` **e** `3.3.2`
(Crítico) **e** `4.1.2` (Crítico) **e** `2.5.3` — quatro achados para um único
elemento. Corrigir o rótulo resolve os quatro.

```tsx
// ❌ cabeçalho e rótulo que não dizem o que introduzem
<h2>Informações</h2>
<label htmlFor="dia">Campo</label>
<input id="dia" />

// ✅ descrevem o conteúdo específico
<h2>Dados de cobrança</h2>
<label htmlFor="dia">Dia de vencimento da fatura</label>
<input id="dia" type="number" min={1} max={28} aria-describedby="dia-ajuda" />
<span id="dia-ajuda">Escolha um dia entre 1 e 28</span>
```

O teste prático: lido fora de contexto, numa lista de cabeçalhos da página, o texto
ainda diz de que trata a seção? É assim que o usuário de leitor de tela navega.

---

## 2.4.7 — Foco Visível · AA · base 🟠

Padrões procurados (`FOCUS_HIDE_PATTERNS`): `outline:none` `outline:0` `outline: none`
`outline: 0`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| regra `:focus { outline: none }` | `CSS ':focus { outline:none }' remove indicador de foco – viola 2.4.7.` | 🟠 Alto |
| `:focus` sem outline | `Regra :focus remove o outline.` | 🟠 Alto |
| `style` inline | `Estilo inline remove outline – pode afetar foco visível.` | 🟡 Médio |
| outline fino/transparente | `Indicador de foco potencialmente sutil (outline fino/transparente).` | 🟡 Médio |
| interativo com `tabindex="-1"` | `Elemento interativo <button> com tabindex=-1 – removido do fluxo de foco…` | 🟡 Médio |
| render: `-webkit-tap-highlight-color: transparent` | `Realce de toque removido (…) — pode reduzir o feedback visual ao tocar…` | 🟢 Baixo |

```css
/* ❌ o reset mais comum de design system reprova a página inteira */
*:focus { outline: none; }

/* ✅ mantém o mouse limpo e o teclado visível */
*:focus-visible {
  outline: 2px solid #660099;
  outline-offset: 2px;
  border-radius: 2px;
}
```

O detector procura a string `outline:none` no CSS. `:focus { outline: none }` seguido de
`:focus-visible { outline: … }` ainda dispara o alerta — prefira estilizar apenas
`:focus-visible` e nunca zerar `:focus`.

---

## 2.4.11 — Foco Não Obscurecido (Mínimo) · AA · base 🟡

Todas `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `Cabeçalho fixo presente sem scroll-margin/scroll-padding para evitar obscurecer o foco.` |
| `Elemento fixo com z-index alto pode ocultar totalmente o item focado.` |
| `Elemento sticky/fixed com z-index alto pode obscurecer componentes focados.` |

```css
/* ❌ o header fixo cobre o elemento que acabou de receber foco ao rolar */
.header { position: sticky; top: 0; height: 64px; z-index: 100; }

/* ✅ reserva o espaço do header ao levar o foco para a área visível */
.header { position: sticky; top: 0; height: 64px; z-index: 100; }
html { scroll-padding-top: 72px; }
```

---

## 2.5.1 — Gestos de Ponteiro · A · base 🟠

Gatilhos (`GESTURE_HINTS`): `pinch` `swipe` `drag` `rotate` `gesture` `touch-action`
`pan` `zoom-gesture` em classe, atributo ou nome de handler.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `user-scalable=no` | `viewport com user-scalable=no impede zoom sem gesto de pinça.` | 🟠 Alto |
| gesto sem alternativa | `Funcionalidade por gesto complexo sem alternativa de ponteiro único.` | 🟠 Alto |
| drag-and-drop | `Drag-and-drop sem alternativa por teclado.` | 🟠 Alto |
| gesto isolado | `Ação por gesto sem qualquer alternativa.` | 🟠 Alto |
| gesto sem teclado | `Ação por gesto sem manipulador de teclado.` | 🟡 Médio |
| heurística de path | `Possível gesto multipontos/path-based detectado – verificar alternativa single-pointer.` | 🟡 Médio |

Carrossel com swipe precisa de botões anterior/próximo reais. `touch-action` em CSS já
é suficiente para o detector suspeitar — se a classe existe por outro motivo, garanta
que a funcionalidade tenha equivalente por clique.

```tsx
// ❌ o carrossel só avança por swipe
<div onTouchStart={inicioSwipe} onTouchEnd={fimSwipe}>{slides}</div>

// ✅ o swipe continua, mas existe equivalente de ponteiro único e teclado
<div
  role="region"
  aria-roledescription="carrossel"
  aria-label="Ofertas em destaque"
  onTouchStart={inicioSwipe}
  onTouchEnd={fimSwipe}
>
  {slides}
</div>
<button type="button" onClick={anterior} aria-label="Oferta anterior">‹</button>
<button type="button" onClick={proximo} aria-label="Próxima oferta">›</button>
```

O critério não proíbe o gesto — exige que exista outro caminho. Pinça, arraste com dois
dedos, rotação e traçado precisam sempre de um botão, um campo ou um clique equivalente.

---

## 2.5.2 — Cancelamento de Ponteiro · A · base 🟡

Termos de confirmação procurados (`CONFIRM_HINTS`): `confirm` `confirmar` `tem certeza`
`deseja` `cancelar` `cancel` `desfazer` `undo`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| cancelamento em `div`/`span` | `Controle de cancelamento em <div>/<span> sem suporte a teclado.` | 🟡 Médio |
| ação destrutiva sem saída | `Ação destrutiva sem confirmação/desfazer aparente.` | 🟢 Baixo |
| `onMouseDown` sem `onMouseUp` | `Ação disparada em mousedown/touchstart sem par mouseup/onclick – dificulta cancelamento.` | 🟢 Baixo |
| modal sem cancelar | `Modal sem controle de cancelamento acessível.` | 🟢 Baixo |
| desfazer sem feedback | `Ação de desfazer sem região aria-live/status para feedback.` | 🟢 Baixo |

Regra prática: dispare em `onClick` (que equivale a `up`), nunca em `onMouseDown` /
`onTouchStart` — assim o usuário pode arrastar o dedo para fora e abortar.

```tsx
// ❌ dispara no down: o usuário não consegue arrastar o dedo para fora e desistir
<button onMouseDown={excluir}>Excluir fatura</button>

// ✅ dispara no up (onClick) e a ação é reversível com feedback anunciado
<button type="button" onClick={excluir}>Excluir fatura</button>

{removida && (
  <div role="status" aria-live="polite">
    Fatura removida.{' '}
    <button type="button" onClick={desfazer}>Desfazer</button>
  </div>
)}
```

`onClick` já corresponde ao evento de soltar, então o padrão do React atende o critério
por si. O problema aparece quando se troca para `onMouseDown`/`onTouchStart` buscando
resposta mais rápida — isso remove a única chance de abortar depois de tocar.

---

## 2.5.3 — Rótulo no Nome · A · base 🟡

Compara o texto **visível** do controle com seu nome acessível. É o critério que quebra
comando de voz ("clique em Enviar" não funciona se o `aria-label` disser outra coisa).

| Mensagem | Sev |
|---|---|
| `Texto visível 'Enviar' não está no nome acessível 'Submeter formulário'.` | 🟡 Médio |
| `Nome acessível '…' não contém '…'.` / `Texto '…' difere do nome acessível '…'.` | 🟡 Médio |
| `aria-label '…' não contém '…'.` | 🟡 Médio |
| `Campo sem label acessível.` | 🟡 Médio |
| `Uso apenas de placeholder '…' sem label.` | 🟡 Médio |
| `Elemento não possui texto visível nem nome acessível (pode estar usando CSS para exibir conteúdo).` | 🟡 Médio |
| `Toggle altera nome acessível incorretamente.` | 🟡 Médio |

```tsx
// ❌ o nome acessível substitui o texto visível
<button aria-label="Submeter formulário">Enviar</button>

// ✅ o nome acessível começa pelo texto visível e só acrescenta contexto
<button aria-label="Enviar formulário de contato">Enviar</button>

// ✅ melhor ainda: sem aria-label, o texto visível já é o nome
<button>Enviar</button>
```

Cuidado com i18next: se o texto visível vem de `t('form.submit')` e o `aria-label` de
outra chave, elas divergem na tradução e o detector acusa.

---

## 2.5.4 — Atuação por Movimento · A · base 🟡

APIs procuradas (`MOTION_APIS`): `devicemotion` `deviceorientation` `accelerometer`
`gyroscope` `shake`.

| Mensagem | Sev |
|---|---|
| `Movimento do dispositivo sem controles de UI alternativos detectados.` | 🟡 Médio |
| `Alternativa ao movimento em elemento não operável por teclado.` | 🟡 Médio |
| `API de movimento 'devicemotion' detectada – garantir alternativa de interface de usuário.` | 🟢 Baixo |
| `Controle alternativo sem nome acessível.` | 🟢 Baixo |

```tsx
// ❌ só o movimento do aparelho desfaz a ação
window.addEventListener('devicemotion', aoChacoalhar);

// ✅ controle equivalente na interface, e o sensor pode ser desligado
<button type="button" onClick={desfazer}>Desfazer último lançamento</button>

useEffect(() => {
  if (!desfazerPorMovimento) return;
  window.addEventListener('devicemotion', aoChacoalhar);
  return () => window.removeEventListener('devicemotion', aoChacoalhar);
}, [desfazerPorMovimento]);
```

Quem tem tremor involuntário aciona o gesto sem querer; quem usa o aparelho fixo em
suporte não consegue acioná-lo. Por isso o critério pede as duas coisas: alternativa na
interface **e** possibilidade de desativar o sensor.

---

## 2.5.7 — Movimentos de Arrastar · AA · base 🟢

Atributos rastreados (`DRAG_ATTRS`): `draggable` `ondrag` `ondragstart` `ondragend`
`ondrop` `ondragover` `ondragenter` `ondragleave`. Como a base já é 🟢 Baixo, todas as
mensagens saem em 🟢 — mas são muitas, e volume também derruba a nota.

| Mensagem | Sev |
|---|---|
| `Elemento arrastável sem alternativa single-pointer – fornecer ação via clique ou teclado.` | 🟢 Baixo |
| `Funcionalidade exclusiva de arrastar sem alternativa de ponteiro único.` | 🟢 Baixo |
| `Ação de arrastar sem manipulador de teclado.` | 🟢 Baixo |
| `Área de upload por arrastar sem <input type=file> alternativo.` | 🟢 Baixo |
| `Classe 'drag-handle' sugere drag & drop – verificar alternativa de ponteiro único.` | 🟢 Baixo |

```tsx
// ❌ só aceita arquivo por arraste: sem alternativa por clique ou teclado
<div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
  Arraste o arquivo aqui
</div>

// ✅ dropzone com input nativo por trás — resolve 2.5.7 e 2.5.1 juntos
<div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
  <label htmlFor="anexo">Arraste o arquivo aqui ou selecione</label>
  <input id="anexo" type="file" onChange={onSelect} />
</div>
```

---

## 2.5.8 — Tamanho Mínimo do Alvo · AA · base 🟢

Tags interativas consideradas: `a` `button` `input` `select` `summary` `textarea`.
O limiar é **24px**. A checagem mais confiável vem do render real
(`runtime-checks.md`), que mede `getBoundingClientRect()` em cada perfil de device.

| Gatilho | Mensagem | Sev |
|---|---|---|
| ícone interativo pequeno | `Ícone interativo com alvo < 24px (w=16, h=16).` | 🟢 Baixo |
| largura/altura abaixo | `Alvo interativo com largura 18px – mínimo recomendado 24px (WCAG 2.5.8).` | 🟢 Baixo |
| botão pequeno | `Botão com dimensão abaixo de 24px (w=20, h=20).` | 🟢 Baixo |
| campo baixo | `Campo com altura < 24px (h=22).` | 🟢 Baixo |
| componente custom | `Componente customizado com alvo < 24px (w=…, h=…).` | 🟢 Baixo |
| `font-size` pequeno em botão-ícone | `Botão de ícone com font-size 12px pode ter alvo < 24px.` | 🟢 Baixo |
| render: gap curto | `Dois alvos de toque com apenas 16px de espaçamento (recomendado ≥ 24px) entre '…' e '…'.` | 🟢 Baixo |
| render: sobreposição | `Dois elementos interativos se sobrepõem: '…' e '…'.` | 🟢 Baixo |

```css
/* ❌ o ícone define o alvo */
.btn-icone { width: 16px; height: 16px; }

/* ✅ o padding define o alvo; o ícone continua com 16px */
.btn-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;   /* idealmente 44px */
  min-height: 24px;
  padding: 8px;
}
.barra-acoes { display: flex; gap: 24px; }
```

Sobreposição entre alvos costuma vir de `margin` negativa ou de um pseudo-elemento
`::after` expandido para "aumentar a área de toque" — o detector mede o retângulo real
e enxerga os dois se cruzando.
