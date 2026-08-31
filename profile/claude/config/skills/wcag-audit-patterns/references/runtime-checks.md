# Verificações de layout renderizado e testes automatizados

Sete critérios não podem ser avaliados lendo HTML e CSS: `1.3.4` `1.3.5` `1.4.3`
`1.4.4` `1.4.10` `2.4.7` `2.5.8` dependem do **layout computado**. Um `max-width`
correto na folha de estilo ainda pode estourar por causa de um token de espaçamento,
de uma fonte mais larga que a prevista, ou de um container externo ao componente.

- [Medição no layout computado](#medição-no-layout-computado) — limiares e como reproduzi-los
- [axe-core](#axe-core) — cobertura automatizada e mapeamento de impacto
- [Lighthouse](#lighthouse) — mapa de auditoria para critério WCAG

---

## Medição no layout computado

Meça a página em três larguras de referência e depois num quarto passe com a viewport
em **320px CSS** — o limiar oficial do WCAG 1.4.10, equivalente a zoom de 400% numa
tela de 1280px.

| Perfil | Largura de referência | Como registrar |
|---|---|---|
| Web | 1905px | `Render de web` |
| iOS | 390px | `Render de ios` |
| Android | 393px | `Render de android` |
| Reflow oficial | 320px | `Em 320px CSS (equivalente a zoom de 400%)…` |

Cada perfil avalia os mesmos critérios de forma independente. Um mesmo elemento largo
demais falha em **todos** os perfis estreitos, então um único `width: 480px` esquecido
vira vários achados — corrigi-lo resolve todos de uma vez.

### Limiares embutidos

| Checagem | Limiar | Critério |
|---|---|---|
| Tamanho do alvo | `< 24px` em largura ou altura | `2.5.8` |
| Espaçamento entre alvos | `gap < 24px` entre vizinhos | `2.5.8` |
| Sobreposição de alvos | retângulos se cruzam | `2.5.8` |
| Texto minúsculo | `font-size < 12px` renderizado | `1.4.4` |
| Contraste medido | `< 4.5:1`, ou `< 3.0:1` se texto grande¹ | `1.4.3` |
| Scroll horizontal | `scrollWidth > viewport` | `1.4.10` |
| Corte por overflow | `scrollWidth > clientWidth` na caixa | `1.4.10` / `1.4.12` |
| Zoom bloqueado | `user-scalable=no` / `maximum-scale<2` | `1.4.4` |
| Orientação travada | CSS forçando uma orientação | `1.3.4` |
| Foco/toque | `outline:none`, `-webkit-tap-highlight-color:transparent` | `2.4.7` |
| Teclado móvel | `type`/`inputMode`/`autocomplete` ausentes | `1.3.5` |

¹ "texto grande" = `font-size ≥ 24px`, ou `≥ 18.66px` em negrito. O cálculo usa
luminância relativa WCAG (`0.2126R + 0.7152G + 0.0722B` com correção gama).

Só elementos **visíveis** contam: descarte `visibility:hidden`, `display:none`,
`opacity:0` e retângulos de área zero — eles não são percebidos nem operados por
ninguém e geram ruído na auditoria.

### Checklist por perfil

Percorra estes onze pontos em cada largura de referência:

- [ ] sem scroll horizontal
- [ ] sem scroll horizontal também a 320px (zoom 400%)
- [ ] todo alvo interativo com ao menos 24×24px
- [ ] espaçamento ≥ 24px entre alvos vizinhos
- [ ] nenhum par de alvos sobreposto
- [ ] nenhum texto renderizado abaixo de 12px
- [ ] contraste medido ≥ 4.5:1 (≥ 3:1 para texto grande)
- [ ] nenhum conteúdo cortado por `overflow`/`ellipsis`
- [ ] funciona em retrato e paisagem, sem conteúdo oculto por orientação
- [ ] foco visível e feedback de toque preservados
- [ ] campos abrem o teclado móvel correto (`type`, `inputMode`, `autocomplete`)

### Mensagens mais frequentes e a correção

| Problema medido | Correção |
|---|---|
| `Conteúdo gera scroll horizontal em 393px (largura do documento: 393px).` | `max-width:100%` + `box-sizing:border-box` no container; remover largura fixa |
| `Em 320px este elemento ultrapassa a tela (right=342px, largura=102px).` | largura relativa ou `flex-wrap`; evitar `min-width` maior que 320px |
| `Palavras longas sem quebra causam scroll horizontal em telas estreitas.` | `overflow-wrap: break-word` no bloco de texto |
| `Conteúdo cortado por overflow/ellipsis (conteúdo 240px em caixa de 180px).` | remover altura/largura fixa + `overflow:hidden`, ou expor o texto completo |
| `Alvo de toque com 16×16px (mínimo recomendado 24×24px) no render de ios.` | `min-width/min-height: 24px` + `padding`, não `width` do ícone |
| `Dois alvos de toque com apenas 16px de espaçamento (recomendado ≥ 24px)…` | `gap: 24px` no container de ações |
| `Contraste de 3.1:1 (mínimo 4.5:1) no texto de 14px. Render de web.` | ajustar o par cor/fundo; cinza claro sobre branco é o caso típico |
| `Texto renderizado com 11px (abaixo de 12px) no render de android.` | mínimo 12px, ideal 16px no corpo |
| `O zoom da página está desabilitado na meta viewport (content="…").` | `content="width=device-width, initial-scale=1"` e nada mais |
| `Indicador de foco removido (outline:none sem alternativa visível)…` | estilizar `:focus-visible` em vez de zerar `:focus` |
| `Realce de toque removido (-webkit-tap-highlight-color: transparent)…` | manter algum estado `:active` visível |
| `O teclado móvel exibido não é o ideal…` | `type="email"`/`type="tel"` + `inputMode` + `autoComplete` |

### Por que estas falhas escapam da revisão de código

A medição olha o retângulo final, então a causa pode estar em qualquer camada: um token
de espaçamento, uma classe utilitária do design system, uma fonte que renderiza mais
larga que o previsto, ou um container externo ao componente.

A forma prática de antecipar é reproduzir o passe manualmente — DevTools em 320px de
largura procurando barra de rolagem horizontal, e o inspetor conferindo se os botões de
ação têm ao menos 24×24px de caixa.

---

## axe-core

Cobertura automatizada de referência. Cada violação traz um `impact` que se traduz
direto em prioridade de correção:

| `impact` do axe | Prioridade |
|---|---|
| `critical` | 🔴 Crítico |
| `serious` | 🔴 Crítico |
| `moderate` | 🟡 Médio |
| `minor` | 🟢 Baixo |

As tags de cada regra identificam o critério: `wcag143` → `1.4.3`, `wcag2411` →
`2.4.11`, `wcag111` → `1.1.1`. Regras sem tag `wcagNNN` são *best-practice* do próprio
axe e não correspondem a um critério de sucesso — trate-as como recomendação, não como
não conformidade.

Ferramenta que não executou é **ausência de dado**, nunca aprovação: um resultado vazio
por falha de execução não diz nada sobre a acessibilidade da página.

---

## Lighthouse

O Lighthouse reporta auditorias por identificador, não por critério WCAG. Use a tabela
abaixo para traduzir uma auditoria reprovada no critério correspondente — e daí para o
padrão de código que a causou, nas referências de princípio.

### Auditoria → critério

| Critério | Auditorias Lighthouse |
|---|---|
| `1.1.1` | `image-alt` `input-image-alt` `object-alt` `role-img-alt` |
| `1.2.2` | `video-caption` |
| `1.3.1` | `aria-required-children` `aria-required-parent` `definition-list` `dlitem` `form-field-multiple-labels` `heading-order` `label` `list` `listitem` `table-duplicate-name` `table-fake-caption` `td-headers-attr` `th-has-data-cells` |
| `1.4.3` | `color-contrast` |
| `1.4.4` | `meta-viewport` |
| `2.1.1` | `accesskeys` `scrollable-region-focusable` |
| `2.2.1` | `meta-refresh` |
| `2.4.1` | `bypass` `landmark-one-main` `skip-link` |
| `2.4.2` | `document-title` `frame-title` |
| `2.4.3` | `tabindex` |
| `2.4.4` | `link-name` |
| `2.5.8` | `target-size` |
| `3.1.1` | `html-has-lang` `html-lang-valid` `html-xml-lang-mismatch` |
| `3.1.2` | `valid-lang` |
| `4.1.1` | `duplicate-id-active` `duplicate-id-aria` |
| `4.1.2` | `aria-allowed-attr` `aria-command-name` `aria-hidden-body` `aria-hidden-focus` `aria-input-field-name` `aria-meter-name` `aria-progressbar-name` `aria-required-attr` `aria-roles` `aria-toggle-field-name` `aria-tooltip-name` `aria-treeitem-name` `aria-valid-attr` `aria-valid-attr-value` `button-name` `input-button-name` `select-name` |

### Auditorias que merecem atenção especial

- **`scrollable-region-focusable` (`2.1.1`)** — um container com `overflow:auto` que
  rola mas não é focável. Adicione `tabIndex={0}` e `role="region"` + `aria-label`.
- **`aria-hidden-focus` (`4.1.2`)** — elemento com `aria-hidden="true"` contendo algo
  focável. Ocorre em drawer/menu fechado que continua tabulável. Use `inert` ou `hidden`.
- **`form-field-multiple-labels` (`1.3.1`)** — dois `<label>` para o mesmo campo,
  comum quando se adiciona um label de erro sem trocar o `htmlFor`.
- **`duplicate-id-aria` (`4.1.1`)** — `id` repetido acontece quando o mesmo componente
  é montado mais de uma vez na página; gere ids com `useId()` do React.
- **`heading-order` (`1.3.1`)** — o mesmo salto de heading já detectado por `1.3.1` e
  `2.4.6`; corrigir uma vez resolve os três.

## Execução por linha de comando

```bash
npx @axe-core/cli <url>
npx pa11y <url>
lighthouse <url> --only-categories=accessibility
```
