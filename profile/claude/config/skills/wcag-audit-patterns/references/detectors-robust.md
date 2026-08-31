# Princípio 4 · Robusto (`4.x`)

Apenas dois critérios, e ambos tratam da mesma coisa: o que a tecnologia assistiva
recebe. Uma interface pode estar visualmente perfeita e ainda expor uma árvore de
acessibilidade vazia — é o tipo de falha que nenhuma revisão visual detecta.

`4.1.1 Parsing` foi **removido do WCAG 2.2** e não é mais avaliado; questões de `id`
duplicado aparecem hoje via ferramentas automatizadas (`duplicate-id-active`,
`duplicate-id-aria`), mapeadas em `runtime-checks.md`.

---

## 4.1.2 — Nome, Função, Valor · A · base 🔴

Roles de widget avaliados (`WIDGET_ROLES`): `alertdialog`
`application` `button` `checkbox` `combobox` `dialog` `gridcell` `link` `listbox`
`menu` `menubar` `menuitem` `menuitemcheckbox` `menuitemradio` `option` `progressbar`
`radio` `radiogroup` `scrollbar` `searchbox` `slider` `spinbutton` `switch` `tab`
`tablist` `tabpanel` `textbox` `tree` `treeitem`…

| Condição | Problema | Impacto |
|---|---|---|
| interativo sem nome | `Elemento interativo sem nome acessível.` | 🔴 Crítico |
| `<input>` sem nome | `Input type='search' sem nome acessível (label, aria-label).` | 🔴 Crítico |
| `<button>` sem nome | `Botão sem nome acessível.` | 🔴 Crítico |
| `role="button"` sem nome | `Elemento role='button' sem nome acessível.` | 🔴 Crítico |
| `<a>` sem nome | `Link sem nome acessível (texto, aria-label, ou imagem com alt).` | 🔴 Crítico |
| widget sem nome | `Widget role='combobox' sem nome acessível (aria-label, aria-labelledby ou texto).` | 🔴 Crítico |
| widget sem atributo de estado | `Widget role='combobox' sem atributo obrigatório 'aria-expanded'.` | 🔴 Crítico |
| clicável sem semântica | `Elemento clicável sem role/semântica adequada (função não exposta).` | 🔴 Crítico |

### Como o nome acessível é calculado

`accessible_name()` resolve nesta ordem e **para na primeira que retornar algo**:

1. `aria-label`
2. `aria-labelledby` → concatena o texto dos elementos referenciados
3. `alt` (apenas para `<img>`)
4. texto interno do elemento
5. `title`

Duas consequências práticas:

- **`<label for>` não entra nessa cadeia.** Um `<input>` rotulado só por `<label for>`
  não tem texto interno nem `aria-label`, então `accessible_name()` devolve vazio e o
  `4.1.2` dispara. Para zerar este critério em campos, use `aria-label` **ou**
  `aria-labelledby` apontando para o `<label>`.
- **`aria-labelledby` órfão devolve vazio.** Se o `id` referenciado não existir no DOM
  no momento da captura (render condicional, portal, MFE montado depois), o campo conta
  como sem nome.

```tsx
// ❌ Crítico: nenhum dos caminhos do accessible_name() encontra texto
<input id="search" name="search" placeholder="digite" />
<label htmlFor="search">Buscar</label>

// ✅ label visível + vínculo programático redundante que o detector enxerga
<label id="search-label" htmlFor="search">Buscar</label>
<input id="search" name="search" type="search" aria-labelledby="search-label" />

// ✅ alternativa direta
<label htmlFor="search">Buscar</label>
<input id="search" name="search" type="search" aria-label="Buscar" />
```

> `aria-label` e `<label>` visível precisam ser coerentes, senão `2.5.3` acusa
> divergência — mantenha o texto do `aria-label` começando pelo texto visível.

### Atributos obrigatórios por role

Widgets com estado precisam expor esse estado, ou o detector cobra o atributo:

```tsx
// ✅ combobox / select customizado
<div role="combobox" aria-expanded={aberto} aria-controls="lista" aria-label="Plano">

// ✅ toggle
<button aria-pressed={ativo}>Notificações</button>

// ✅ acordeão
<button aria-expanded={aberto} aria-controls="painel-1">Detalhes da fatura</button>
<div id="painel-1" hidden={!aberto}>…</div>

// ✅ aba
<div role="tab" aria-selected={ativa} aria-controls="painel" tabIndex={ativa ? 0 : -1}>

// ✅ checkbox custom
<div role="checkbox" aria-checked={marcado} tabIndex={0} onKeyDown={onSpace}>
```

`Elemento clicável sem role/semântica adequada` é a mesma raiz do `2.1.1`: um
`onClick` em `<div>`. Trocar por `<button type="button">` apaga os dois Críticos.

---

## 4.1.3 — Mensagens de Status · AA · base 🟠

Roles reconhecidos como região viva (`LIVE_ROLES`): `alert` `log` `marquee`
`progressbar` `status` `timer`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| status sem região viva | `Mensagem de status sem role/aria-live – não será anunciada.` | 🟠 Alto |
| `aria-live` inválido | `aria-live='true' é valor inválido – usar 'polite', 'assertive' ou 'off'.` | 🟠 Alto |
| spinner sem role | `Indicador de carregamento sem role='status'/aria-live.` | 🟡 Médio |
| status recebe foco | `Mensagem de status recebe foco (autofocus/tabindex) – status não deve roubar foco.` | 🟡 Médio |
| `role=alert` com `polite` | `Mensagem crítica (role='alert') com aria-live='polite' – considerar 'assertive'.` | 🟡 Médio |
| classe sugestiva sem role | `Elemento com classe 'toast-success' parece mensagem de status mas sem role/aria-live.` | 🟡 Médio |

Valores válidos de `aria-live` são exatamente `polite`, `assertive` e `off` —
`aria-live="true"` é um erro comum e reprova.

```tsx
// ❌ o usuário de leitor de tela não sabe que carregou nem que deu certo
{carregando && <Spinner />}
{sucesso && <div className="toast-success">Plano alterado</div>}

// ✅
{carregando && (
  <div role="status" aria-live="polite">
    <Spinner aria-hidden="true" /> Carregando faturas…
  </div>
)}
{sucesso && <div role="status" aria-live="polite">Plano alterado com sucesso</div>}
{erro && <div role="alert">Não foi possível alterar o plano. Tente novamente.</div>}
```

Ponto sutil e frequente com React Query: a região viva precisa **existir no DOM antes**
da mensagem chegar, senão o leitor de tela não anuncia a mudança. Renderize o container
`role="status"` sempre e alterne apenas o conteúdo:

```tsx
// ✅ container permanente, conteúdo variável
<div role="status" aria-live="polite" className="sr-only">
  {isFetching ? 'Carregando faturas' : isSuccess ? `${faturas.length} faturas carregadas` : ''}
</div>
```

Regra de escolha: `role="status"` (`polite`) para confirmação e progresso;
`role="alert"` (`assertive`) só para erro que interrompe a tarefa. Usar `assertive`
em toast de sucesso corta a leitura em curso e irrita mais do que ajuda.
