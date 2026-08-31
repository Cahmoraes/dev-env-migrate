# Princípio 1 · Perceptível (`1.x`)

O conteúdo precisa chegar ao usuário por mais de um canal sensorial. As falhas deste
princípio têm um padrão comum: a informação existe na tela, mas não existe para quem
não a enxerga, não a ouve, ou precisa ampliá-la.

Cada seção traz a condição que caracteriza a falha, o problema tal como deve ser
relatado, o impacto, e um par ❌/✅ de código.

## Índice

- [1.1.1 Conteúdo Não Textual](#111--conteúdo-não-textual--a--base-)
- [1.2.1 Apenas Áudio / Apenas Vídeo](#121--apenas-áudio-e-apenas-vídeo-pré-gravado--a--base-)
- [1.2.2 Legendas Pré-gravadas](#122--legendas-pré-gravadas--a--base-)
- [1.2.3 Audiodescrição ou Alternativa](#123--audiodescrição-ou-alternativa-de-mídia--a--base-)
- [1.2.4 Legendas Ao Vivo](#124--legendas-ao-vivo--aa--base-)
- [1.2.5 Audiodescrição Pré-gravada](#125--audiodescrição-pré-gravada--aa--base-)
- [1.3.1 Informação e Relacionamentos](#131--informação-e-relacionamentos--a--base-)
- [1.3.2 Sequência Significativa](#132--sequência-significativa--a--base-)
- [1.3.3 Características Sensoriais](#133--características-sensoriais--a--base-)
- [1.3.4 Orientação](#134--orientação--a--base-)
- [1.3.5 Identificar Propósito de Entrada](#135--identificar-propósito-de-entrada--aa--base-)
- [1.4.1 Uso de Cor](#141--uso-de-cor--a--base-)
- [1.4.2 Controle de Áudio](#142--controle-de-áudio--a--base-)
- [1.4.3 Contraste Mínimo](#143--contraste-mínimo--aa--base-)
- [1.4.4 Redimensionar Texto](#144--redimensionar-texto--aa--base-)
- [1.4.5 Imagens de Texto](#145--imagens-de-texto--aa--base-)
- [1.4.10 Reflow](#1410--reflow--aa--base-)
- [1.4.11 Contraste Não-Textual](#1411--contraste-não-textual--aa--base-)
- [1.4.12 Espaçamento de Texto](#1412--espaçamento-de-texto--aa--base-)
- [1.4.13 Conteúdo em Hover ou Foco](#1413--conteúdo-em-hover-ou-foco--aa--base-)

---

## 1.1.1 — Conteúdo Não Textual · A · base 🔴

É o critério que mais gera achado Crítico em interfaces com ícones e gráficos.

| Condição | Problema | Impacto |
|---|---|---|
| `<img src>` não decorativa sem `alt` | `Imagem informativa sem atributo alt.` | 🔴 Crítico |
| `alt` com < 3 caracteres ou na lista genérica | `Texto alternativo genérico (alt="…").` | 🟡 Médio¹ |
| `<button>`/`<a>` sem texto contendo `<svg>`, `<i>` ou `<span>` | `Ícone funcional sem nome acessível.` | 🔴 Crítico |
| qualquer `<svg>`/`<canvas>` sem nome | `Gráfico sem nome acessível.` | 🔴 Crítico |
| qualquer `<svg>`/`<canvas>` sem descrição vinculada | `Gráfico sem descrição detalhada vinculada.` | 🔴 Crítico |
| `<button>`/`<a>` sem nome acessível algum | `Controle interativo sem nome acessível.` | 🔴 Crítico |
| nome acessível na lista de genéricos | `Nome acessível genérico ("…").` | 🟡 Médio¹ |

¹ `error`/`warn` sobre base 🔴, mas a palavra "genérico" ativa o *cap* de Médio.

**Vocabulário rejeitado como `alt`** (`GENERIC_ALT`): `imagem` `image` `img` `foto`
`picture` `icon` `ícone` `logo` `logotipo` `gráfico` `chart` `figura` `decorativo`
`banner` `placeholder`. Qualquer `alt` com menos de 3 caracteres também cai aqui.

**Nomes acessíveis rejeitados** (`GENERIC_NAMES`): `click here` `clique aqui` `here`
`more` `mais` `detalhes` `details` `link` `button`.

### O que conta como decorativo

`_is_decorative()` exige `alt=""` **e** (`role="presentation"` **ou**
`aria-hidden="true"` **ou** classe contendo `decorative`). `alt=""` sozinho não basta.

### A armadilha do `<svg>` inline

A verificação de gráficos trata **todo** `<svg>` e `<canvas>` como conteúdo complexo —
não há isenção por `aria-hidden` nem por tamanho. Por isso um ícone decorativo inline dispara **dois
Críticos**. E `_has_detailed_desc()` só aceita `aria-describedby` ou um `<figure>` pai
com `<figcaption>` preenchido: `aria-label` sozinho resolve metade do problema.

```tsx
// ❌ dois Críticos: "Gráfico sem nome acessível." + "sem descrição detalhada vinculada."
<button onClick={close}>
  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="…" /></svg>
</button>
```

```tsx
// ✅ ícone decorativo: troque o svg inline por <img> decorativa
//    (<img> só vira "gráfico" se o src sugerir chart/graph/map ou for ≥400×300)
<button onClick={close} aria-label="Fechar modal">
  <img src={closeIcon} alt="" role="presentation" aria-hidden="true" />
</button>

// ✅ svg inline informativo: nome + descrição vinculada
<figure>
  <svg role="img" aria-labelledby="chart-t" aria-describedby="chart-d" viewBox="0 0 400 300">
    <title id="chart-t">Consumo de dados por mês</title>
    <path d="…" />
  </svg>
  <figcaption id="chart-d">
    Consumo cresceu de 3,2 GB em janeiro para 8,7 GB em junho.
  </figcaption>
</figure>
```

```tsx
// ❌ alt genérico → Médio
<img src={banner} alt="banner" />
// ✅
<img src={banner} alt="Promoção Vivo Fibra: 600 mega por R$ 99,90/mês" />
```

---

## 1.2.1 — Apenas Áudio e Apenas Vídeo (Pré-gravado) · A · base 🟡

Reconhece mídia por extensão (`.mp3` `.wav` `.ogg` `.m4a` `.aac`;
`.mp4` `.webm` `.ogv` `.m4v`) e por host (`youtube` `youtu.be` `vimeo` `dailymotion`).
Procura uma alternativa textual próxima cujo texto contenha `transcri`, `descri`
ou `versão em texto`.

| Mensagem | Sev |
|---|---|
| `Áudio pré-gravado sem transcrição textual.` | 🟡 Médio |
| `Vídeo (apenas vídeo) sem descrição textual.` | 🟡 Médio |
| `Alternativa textual oculta.` | 🟡 Médio |

A última é traiçoeira: a transcrição existe mas está dentro de um acordeão fechado com
`display:none`/`hidden`. Use `<details>` — o conteúdo permanece no DOM e acessível.

```tsx
// ❌ áudio sem nenhuma alternativa textual: o conteúdo não existe para quem não ouve
<audio src={podcast} controls />

// ✅ transcrição no DOM e expansível (details mantém o conteúdo acessível quando fechado)
<audio src={podcast} controls />
<details>
  <summary>Transcrição do episódio</summary>
  <p>{transcricao}</p>
</details>
```

---

## 1.2.2 — Legendas (Pré-gravadas) · A · base 🟡

| Gatilho | Mensagem | Sev |
|---|---|---|
| `<video>` sem `<track kind="captions">` | `Vídeo sem <track> de legendas.` | 🟡 Médio |
| sem controle de legenda acessível | `Sem controle acessível para ativar/desativar legendas.` | 🟡 Médio |
| sem texto visível citando legenda | `Sem indicação visível de legendas.` | 🟢 Baixo |
| iframe YouTube sem `cc_load_policy=1` | `YouTube embed sem cc_load_policy=1. Verifique manualmente.` | 🟢 Baixo |
| host externo | `Vídeo externo – verificação de legendas manual necessária.` | 🟢 Baixo |

Termos aceitos como indicação (`CAPTION_KW`): `legenda` `legendas` `subtitulo`
`subtítulo` `caption` `captions` `cc`.

```tsx
// ❌ vídeo pré-gravado sem faixa de legendas
<video controls>
  <source src={video} type="video/mp4" />
</video>

// ✅ faixa de legendas marcada como padrão e indicação visível
<video controls>
  <source src={video} type="video/mp4" />
  <track kind="captions" src={vtt} srcLang="pt-BR" label="Português (legendas)" default />
</video>
<p>Vídeo com legendas em português.</p>

// ✅ embed
<iframe src="https://www.youtube.com/embed/ID?cc_load_policy=1" title="Como ativar o eSIM" />
```

---

## 1.2.3 — Audiodescrição ou Alternativa de Mídia · A · base 🟡

Termos aceitos: `audiodescrição` `audiodescricao` `audio description`
`descrição de áudio`; para transcrição: `transcrição` `transcript`
`descrição detalhada` `roteiro do vídeo`. Busca até 3 níveis de ancestral
(`NEARBY_DEPTH = 3`) — se a transcrição estiver longe do `<video>` no DOM, não conta.

| Mensagem | Sev |
|---|---|
| `Vídeo sem audiodescrição.` | 🟡 Médio |
| `Vídeo sem alternativa textual (transcrição).` | 🟡 Médio |
| `Sem indicação clara de audiodescrição.` | 🟢 Baixo |

```tsx
// ❌ a transcrição existe, mas longe do vídeo no DOM — não conta como alternativa vinculada
<section><video src={video} controls /></section>
<aside><h3>Transcrição</h3><p>{transcricao}</p></aside>

// ✅ audiodescrição em faixa + transcrição vinculada e próxima do vídeo
<figure>
  <video controls>
    <source src={video} type="video/mp4" />
    <track kind="descriptions" src={ad} srcLang="pt-BR" label="Audiodescrição" />
  </video>
  <figcaption>
    <details>
      <summary>Transcrição e descrição detalhada da cena</summary>
      <p>{transcricao}</p>
    </details>
  </figcaption>
</figure>
```

---

## 1.2.4 — Legendas (Ao Vivo) · AA · base 🟡

Só dispara se a página parecer conter transmissão ao vivo: `LIVE_HINTS` =
`live` `ao vivo` `ao-vivo` `stream` `broadcast` `webinar` `evento`, ou URL de
plataforma (`youtube.com/live`, `vimeo.com/event`, `twitch.tv`).

| Mensagem | Sev |
|---|---|
| `Transmissão ao vivo sem evidência de legendas.` | 🟡 Médio |
| `Sem controle acessível para legendas.` | 🟡 Médio |
| `Sem indicação de legendas disponíveis.` | 🟡 Médio |

```tsx
// ❌ transmissão ao vivo sem legenda nem indicação de que existe
<iframe src="https://www.youtube.com/embed/live_stream?channel=ID" title="Ao vivo" />

// ✅ legenda ativada por padrão, idioma definido e indicação textual
<iframe
  src="https://www.youtube.com/embed/live_stream?channel=ID&cc_load_policy=1&cc_lang_pref=pt"
  title="Ao vivo: lançamento da nova oferta de fibra"
/>
<p>
  Transmissão com legendas em tempo real. Use o botão <abbr title="Closed Caption">CC</abbr>
  do player para ativar ou desativar.
</p>
```

---

## 1.2.5 — Audiodescrição (Pré-gravada) · AA · base 🟡

Procura `<track kind="descriptions">` (`KIND_DESC`) e rótulos textuais
(`AD_LABELS`).

| Mensagem | Sev |
|---|---|
| `Vídeo sem faixa de audiodescrição.` / `Sem AD nem alternativa de mídia.` | 🟡 Médio |
| `Sem controle para ativar/desativar audiodescrição.` | 🟡 Médio |
| `Faixa AD sem srclang.` / `Faixa AD sem label.` | 🟢 Baixo |

```tsx
// ❌ faixa sem idioma nem rótulo: o player não consegue oferecê-la na interface
<track kind="descriptions" src={ad} />

// ✅ idioma e rótulo presentes, para o player expor o controle de ativação
<track kind="descriptions" src={ad} srcLang="pt-BR" label="Audiodescrição" />
```

---

## 1.3.1 — Informação e Relacionamentos · A · base 🟠

Está na família **leitor de tela**: headings, listas e tabelas são como esse usuário
explora a página, e uma estrutura errada elimina a navegação por atalho.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `role="heading"` sem `aria-level` numérico | `role=heading sem aria-level válido.` | 🟠 Alto |
| `<ul>`/`<ol>` sem `<li>` | `Lista sem itens <li>.` | 🟠 Alto |
| sequência visual de itens fora de lista | `Lista visual sem <ul>/<ol>.` | 🟠 Alto |
| `<table>` de dados sem `<th>` | `Tabela de dados sem <th>.` | 🟠 Alto |
| `<th>` sem `scope` e `<td>` sem `headers` | `Cabeçalhos não associados. Use th[scope] ou td[headers].` | 🟠 Alto |
| campo sem rótulo | `Campo sem rótulo acessível.` | 🟠 Alto |
| heading vazio | `Título sem texto.` | 🟠 Alto |
| `h2` → `h4` | `Salto de hierarquia h2→h4.` | 🟠 Alto |
| mais de um `<h1>` | `Múltiplos h1 (N).` | 🟡 Médio |
| rótulo só por `placeholder` | `Rotulado apenas por placeholder.` | 🟡 Médio |

```tsx
// ❌ salto de hierarquia + tabela sem cabeçalho semântico
<h2>Minha conta</h2>
<h4>Faturas</h4>
<table><tr><td>Mês</td><td>Valor</td></tr></table>

// ✅
<h2>Minha conta</h2>
<h3>Faturas</h3>
<table>
  <caption>Faturas dos últimos 6 meses</caption>
  <thead>
    <tr><th scope="col">Mês</th><th scope="col">Valor</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">Junho</th><td>R$ 99,90</td></tr>
  </tbody>
</table>
```

Renderização condicional é a causa mais comum de salto de heading: se um `<h3>` só
aparece quando há dados, o `<h4>` seguinte vira salto na página vazia. Calcule o nível
a partir da profundidade da seção, não do estilo visual desejado.

---

## 1.3.2 — Sequência Significativa · A · base 🟠

Compara a ordem visual (CSS) com a ordem do DOM. Todas as mensagens são `warn` → 🟡 Médio.

| Mensagem |
|---|
| `Elemento com float inline pode ter ordem visual diferente da ordem DOM.` |
| `CSS order altera sequência visual sem alterar DOM – pode confundir leitores de tela.` |
| `Elemento posicionado com tabindex negativo sem aria-flowto pode quebrar sequência de leitura.` |

`order` e `flex-direction: row-reverse` são o gatilho típico em layout responsivo.
Reordene no DOM (ou com `grid-template-areas`, que o detector não penaliza) em vez de
usar `order`.

```css
/* ❌ o total aparece primeiro na tela mas é lido por último */
.resumo { display: flex; flex-direction: column; }
.resumo__total { order: -1; }
```

```tsx
// ✅ a ordem do DOM já é a ordem visual e a de leitura
<div className="resumo">
  <p className="resumo__total">Total: R$ 249,70</p>
  <ul>{itens.map((i) => <li key={i.id}>{i.nome} — {i.valor}</li>)}</ul>
</div>
```

Quando o layout precisa mudar por breakpoint, reordene o JSX condicionalmente em vez de
usar `order`: a ordem de leitura acompanha o DOM, e só o DOM.

---

## 1.3.3 — Características Sensoriais · A · base 🟠

Analisa o **texto** de instruções procurando dependência exclusiva de cor, posição
ou forma.

| Mensagem | Sev |
|---|---|
| `Instrução depende apenas de cor: '…'` | 🟠 Alto |
| `Instrução depende apenas de posição: '…'` | 🟡 Médio |
| `Instrução depende apenas de forma/tamanho: '…'` | 🟡 Médio |

```tsx
// ❌ "Preencha os campos em vermelho" / "Clique no botão à direita"
// ✅ "Preencha os campos marcados com * (obrigatório), destacados em vermelho"
// ✅ "Clique em Continuar, no rodapé do formulário"
```

Isto vale também para chaves de tradução do i18next — o detector lê o texto renderizado,
não o código, então a falha nasce no arquivo de locale.

---

## 1.3.4 — Orientação · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Meta viewport restringe orientação.` | 🟡 Médio |
| `Conteúdo exige orientação específica: '…'` | 🟡 Médio |
| `CSS pode ocultar conteúdo dependendo da orientação.` | 🟢 Baixo |
| `CSS pode restringir uso a uma orientação.` | 🟢 Baixo |

Gatilho de CSS: `@media (orientation: portrait|landscape)` combinado com
`display:none`. Use a media query para **reorganizar** o layout, nunca para esconder
conteúdo ou pedir que o usuário gire o aparelho — quem usa suporte fixo ou cadeira de
rodas não pode girar.

```css
/* ❌ esconde a aplicação e pede para girar o aparelho */
@media (orientation: portrait) {
  .app { display: none; }
  .aviso-gire-o-celular { display: block; }
}

/* ✅ reorganiza o layout sem esconder nada */
@media (orientation: portrait)  { .painel { grid-template-columns: 1fr; } }
@media (orientation: landscape) { .painel { grid-template-columns: 1fr 1fr; } }
```

Quem usa o aparelho em suporte fixo, em cadeira de rodas ou com mobilidade reduzida não
consegue girá-lo. Travar a orientação transforma uma preferência de layout em bloqueio.

---

## 1.3.5 — Identificar Propósito de Entrada · AA · base 🟡

O propósito do campo é inferido do campo por `name`/`id`/`label` e cobra o
`autocomplete` correspondente.

**Mapa usado** (`AUTOCOMPLETE_MAP`): `name`←`name`/`nome` · `given-name`←`first`/`primeiro`
· `family-name`←`last`/`sobrenome` · `email`←`email`/`e-mail` · `tel`←`phone`/`telefone`/`celular`
· `street-address`←`address`/`endereco`/`endereço` · `postal-code`←`cep`/`zip`
· `cc-number`←`card`/`cartao` · `username` · `current-password` / `new-password`.

| Mensagem | Sev |
|---|---|
| `Campo identificado como 'email' sem autocomplete.` | 🟡 Médio |
| `Campo 'email' sem label ou aria-label.` | 🟡 Médio |
| `Valor de autocomplete inválido: '…'` | 🟡 Médio |
| `Autocomplete 'tel' não corresponde ao propósito 'email'.` | 🟢 Baixo |

```tsx
// ❌
<input name="celular" type="text" />
// ✅
<label htmlFor="celular">Celular</label>
<input id="celular" name="celular" type="tel" autoComplete="tel" inputMode="numeric" />
```

`autoComplete="off"` em campo de senha também reprova `3.3.8` — ver
`detectors-understandable.md`.

---

## 1.4.1 — Uso de Cor · A · base 🟡

Todas as mensagens são `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `Campo parece indicar obrigatoriedade apenas por cor (borda vermelha) sem required/aria-required nem marcador textual.` |
| `Link pode ser diferenciado apenas por cor (text-decoration: none sem outro indicador visual).` |
| `Gráfico pode diferenciar dados apenas por cor (sem rótulos/legenda textual detectável).` |

Gatilho de cor (`RED_HINTS`): `red` `#f00` `#ff0000` `rgb(255,0…`.

```tsx
// ❌
<input style={{ borderColor: '#ff0000' }} />
<a style={{ textDecoration: 'none' }}>Termos</a>

// ✅
<input required aria-required="true" aria-invalid={temErro} />
<a className="link--underline-on-focus">Termos <span aria-hidden="true">↗</span></a>
```

---

## 1.4.2 — Controle de Áudio · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Mídia com autoplay sem controles e sem muted – pode tocar áudio automaticamente.` | 🟡 Médio |
| `Áudio automático sem controle pode interferir com a leitura do leitor de tela.` | 🟡 Médio |
| `Iframe de mídia com autoplay sem mute: …` | 🟡 Médio |

Regra prática: `autoPlay` só com `muted` **e** `controls`. Em iframe, inclua `&mute=1`.

```tsx
// ❌ toca áudio sozinho e não oferece como parar
<video src={video} autoPlay loop />

// ✅ autoplay apenas mudo, com controles disponíveis
<video src={video} autoPlay loop muted playsInline controls />

// ✅ em embed, mute explícito na URL
<iframe src="https://www.youtube.com/embed/ID?autoplay=1&mute=1" title="Demonstração do app" />
```

Áudio inesperado se mistura à fala do leitor de tela e torna a página incompreensível
até que o usuário descubra como silenciá-la.

---

## 1.4.3 — Contraste (Mínimo) · AA · base 🟠

Duas fontes independentes: análise de CSS estático **e** medição no render real
(ver `runtime-checks.md`). O cálculo usa luminância relativa
WCAG; limiar 4.5:1, ou 3.0:1 para texto grande (`≥24px`, ou `≥18.66px` em negrito).

| Mensagem | Sev |
|---|---|
| `Contraste insuficiente: 3.12:1 (mínimo 4.5:1). Cor: … sobre …` | 🟠 Alto |
| `Cor de texto clara (…) sem fundo definido – pode ter contraste insuficiente.` | 🟡 Médio |
| `Texto sobre imagem de fundo sem text-shadow/overlay – risco de contraste insuficiente.` | 🟡 Médio |

O segundo caso é frequente com design tokens: definir `color` sem `background-color` na
mesma regra deixa o detector sem par para calcular. Declare o par junto no componente
raiz, ou garanta que o token de fundo esteja no mesmo seletor.

```css
/* ❌ cinza claro sobre branco: 2.5:1 */
.legenda { color: #9b9b9b; }

/* ✅ par cor/fundo declarado junto e acima do limiar: 7.0:1 */
.legenda { color: #595959; background-color: #ffffff; }

/* ✅ texto grande (≥ 24px, ou ≥ 18.66px em negrito) pode ficar em 3:1 — 4.5:1 aqui */
.destaque { font-size: 24px; color: #767676; background-color: #ffffff; }
```

Declarar `color` sem `background-color` no mesmo seletor deixa o par indefinido: o valor
real depende de qual container pintou o fundo, e o contraste passa a variar por contexto.
Fixe os dois juntos no componente, ou garanta que ambos venham do mesmo token.

---

## 1.4.4 — Redimensionar Texto · AA · base 🟡

| Gatilho | Mensagem | Sev |
|---|---|---|
| `user-scalable=no` ou `maximum-scale<2` | `viewport impede o zoom nativo do navegador (user-scalable=no).` | 🟡 Médio |
| `font-size: 14px` | `font-size em px fixo (14px) – considere usar rem/em para redimensionamento.` | 🟢 Baixo |
| mais de 5 ocorrências | `Mais N elementos com font-size em px fixo (total: N).` | 🟢 Baixo |
| `height` fixo + `overflow:hidden` | `Altura fixa em px com overflow:hidden pode cortar o texto quando ampliado a 200%.` | 🟢 Baixo |
| render com texto < 12px | ver `runtime-checks.md` | 🟢 Baixo |

```html
<!-- ❌ qualquer uma destas impede a ampliação de quem tem baixa visão -->
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />

<!-- ✅ única forma segura -->
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

---

## 1.4.5 — Imagens de Texto · AA · base 🟡

Gatilho por `src`/classe (`IMG_TEXT_HINTS`): `text` `texto` `heading` `titulo` `title`
`banner-text` `promo-text` `cta-text`.

| Mensagem | Sev |
|---|---|
| `Imagem de texto essencial (logo) sem alt com o texto correspondente.` | 🟡 Médio |
| `Possível imagem de texto – considere usar texto real com CSS: src='…'` | 🟢 Baixo |
| `SVG contém <text> mas não tem <title> ou aria-label para acessibilidade.` | 🟢 Baixo |

Banner promocional com texto embutido é o caso clássico: renderize o texto em HTML
sobre a imagem em vez de queimá-lo no arquivo.

```tsx
// ❌ o texto está queimado no arquivo: não amplia, não traduz, não é buscável
<img src={bannerPromo} alt="600 mega por R$ 99,90" />

// ✅ imagem só como fundo, texto em HTML
<section className="banner" style={{ backgroundImage: `url(${bannerFundo})` }}>
  <h2>600 mega por R$ 99,90/mês</h2>
  <a href="/fibra">Assinar</a>
</section>

// ✅ logotipo é a exceção prevista pelo critério — o alt reproduz o texto da marca
<img src={logo} alt="Vivo" />
```

---

## 1.4.10 — Reflow · AA · base 🟡

Avaliado em duas frentes: análise do CSS e medição do layout renderizado em
1905 / 390 / 393px, com um passe final em **320px CSS** (equivalente a zoom 400%,
o limiar oficial do WCAG).

| Mensagem | Sev |
|---|---|
| `Conteúdo gera scroll horizontal em 1905px (largura do documento: 1905px).` | 🟡 Médio |
| `Em 320px CSS (equivalente a zoom de 400%) a página gera scroll horizontal (…).` | 🟡 Médio |
| `Elemento ultrapassa a borda direita (right=452px, largura=110px) para uma viewport de 390px.` | 🟢 Baixo |
| `Em 320px este elemento ultrapassa a tela (right=342px, largura=102px).` | 🟢 Baixo |
| `Largura fixa 480px > 320px pode impedir reflow em telas estreitas.` | 🟢 Baixo |
| `white-space:nowrap em texto longo pode forçar rolagem horizontal (rolagem bidimensional).` | 🟢 Baixo |
| `Sem <meta name=viewport> – layout pode não ser responsívo.` | 🟢 Baixo |
| `overflow:hidden com altura fixa pode cortar conteúdo em zoom 400%.` | 🟢 Baixo |

```css
/* ❌ */ .card { width: 480px; white-space: nowrap; }
/* ✅ */ .card { max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; }
```

Palavras longas sem quebra (URLs, códigos de protocolo, e-mails) estouram em 320px.
`overflow-wrap: break-word` no container de texto resolve a família inteira.

---

## 1.4.11 — Contraste Não-Textual · AA · base 🟠

| Mensagem | Sev |
|---|---|
| `Ícone SVG funcional com fill='none' pode não ter contraste 3:1.` | 🟡 Médio |
| `Input sem borda visível – pode não ter contraste 3:1 contra fundo.` | 🟡 Médio |
| `outline:none sem indicador de foco alternativo – foco pode não ter contraste 3:1.` | 🟡 Médio |

`fill="none"` em `<svg>` dentro de botão é o gatilho mais comum — bibliotecas de ícone
usam `fill="none"` + `stroke="currentColor"`. O detector não avalia o `stroke`. Declare
`fill="currentColor"` quando o ícone for preenchido, ou marque-o como decorativo
(`aria-hidden`) quando o botão já tiver `aria-label`.

```css
/* ❌ borda de campo quase invisível: 1.3:1 contra o branco */
.input { border: 1px solid #e0e0e0; }

/* ✅ borda perceptível (4.5:1) e foco com contraste próprio */
.input { border: 1px solid #767676; }
.input:focus-visible { outline: 2px solid #660099; outline-offset: 2px; }
```

```tsx
// ❌ ícone sem preenchimento: a verificação não avalia o stroke
<svg fill="none" stroke="currentColor">…</svg>

// ✅ ícone informativo herda a cor do texto
<svg fill="currentColor" role="img" aria-label="Fatura vencida">…</svg>

// ✅ ícone decorativo ao lado de um rótulo já existente
<button type="button">
  <svg fill="currentColor" aria-hidden="true">…</svg> Baixar fatura
</button>
```

---

## 1.4.12 — Espaçamento de Texto · AA · base 🟡

Todas `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `line-height: 1.2 é menor que 1.5 – pode falhar 1.4.12.` |
| `letter-spacing negativo (-0.02em) pode conflitar com ajuste do usuário (mín. 0.12em).` |
| `word-spacing negativo (…) pode conflitar com ajuste do usuário (mín. 0.16em).` |
| `Altura fixa com overflow:hidden pode cortar conteúdo quando o espaçamento é aumentado.` |

`line-height: 1.5` no corpo de texto e nada de `letter-spacing` negativo em títulos
(padrão comum em design system) zera este critério.

```css
/* ❌ entrelinha apertada e caixa de altura fixa: o texto some ao aumentar o espaçamento */
.card__texto {
  line-height: 1.2;
  letter-spacing: -0.02em;
  height: 72px;
  overflow: hidden;
}

/* ✅ a caixa cresce com o conteúdo */
.card__texto {
  line-height: 1.5;
  letter-spacing: normal;
  min-height: 72px;
}
```

O critério pressupõe que o usuário possa aplicar sua própria folha de estilo com
`line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em` e espaço de `2em`
entre parágrafos. O teste é se o layout sobrevive a isso sem cortar nem sobrepor texto —
por isso altura fixa é o problema, não o valor da entrelinha em si.

---

## 1.4.13 — Conteúdo em Hover ou Foco · AA · base 🟡

Gatilhos por classe (`TOOLTIP_HINTS`): `tooltip` `popover` `dropdown` `hover-content`
`hover-menu` `submenu`. Todas `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `title='…' usado como tooltip – pode não ser acessível via teclado.` |
| `+N elementos com title sem alternativa (total: N).` |
| `Conteúdo hover/tooltip detectado – verificar se é dismissível, hoverable e persistente.` |
| `Conteúdo adicional sem gatilho focável – pode não aparecer ao foco por teclado.` |
| `Conteúdo adicional fixo com z-index pode obstruir informações da página.` |

```tsx
// ❌ title não abre por teclado nem é dismissível
<span title="Valor sem impostos">R$ 99,90</span>

// ✅ gatilho focável + fecha com Esc + permanece com o ponteiro sobre ele
<button aria-describedby="tip-preco" onKeyDown={fecharComEsc}>R$ 99,90</button>
<span role="tooltip" id="tip-preco" hidden={!aberto}>Valor sem impostos</span>
```
