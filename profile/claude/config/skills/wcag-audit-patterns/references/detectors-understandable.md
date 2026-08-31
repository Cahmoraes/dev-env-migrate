# Princípio 3 · Compreensível (`3.x`)

A interface pode ser perceptível e operável e ainda assim ser inutilizável por não
explicar o que espera do usuário. É o princípio que mais afeta pessoas com deficiência
cognitiva, e o único cujas falhas costumam passar despercebidas em revisão visual.

A família **formulário** (`3.3.x`) é a mais crítica: um campo que o usuário não
consegue preencher corretamente bloqueia a tarefa por inteiro.

## Índice

- [3.1.1 Idioma da Página](#311--idioma-da-página--a--base-)
- [3.1.2 Idioma das Partes](#312--idioma-das-partes--aa--base-)
- [3.2.1 Em Foco](#321--em-foco--a--base-)
- [3.2.2 Em Entrada](#322--em-entrada--a--base-)
- [3.2.3 Navegação Consistente](#323--navegação-consistente--aa--base-)
- [3.2.4 Identificação Consistente](#324--identificação-consistente--aa--base-)
- [3.2.6 Ajuda Consistente](#326--ajuda-consistente--a--base-)
- [3.3.1 Identificação de Erro](#331--identificação-de-erro--a--base-)
- [3.3.2 Rótulos ou Instruções](#332--rótulos-ou-instruções--a--base-)
- [3.3.3 Sugestão de Erro](#333--sugestão-de-erro--aa--base-)
- [3.3.4 Prevenção de Erro](#334--prevenção-de-erro-legal-financeiro-dados--aa--base-)
- [3.3.7 Entrada Redundante](#337--entrada-redundante--a--base-)
- [3.3.8 Autenticação Acessível](#338--autenticação-acessível-mínimo--aa--base-)

---

## 3.1.1 — Idioma da Página · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Atributo 'lang' ausente no <html> – idioma da página não identificado.` | 🟡 Médio |
| `Sem atributo lang – páginas dinâmicas também devem defini-lo.` | 🟡 Médio |
| `Valor do atributo lang='pt_BR' é inválido (formato BCP 47 esperado).` | 🟡 Médio |
| `Elemento <html> não encontrado.` | 🟡 Médio |
| `Confirmar que o atributo lang permanece definido após renderização dinâmica (SPA).` | 🟢 Baixo |

Formato correto é BCP 47 com hífen: `pt-BR`, não `pt_BR`. Com i18next, sincronize
`document.documentElement.lang` na troca de idioma — o valor precisa estar correto no
DOM já renderizado, não só na configuração inicial.

```tsx
// ❌ formato inválido (BCP 47 usa hífen) e valor fixo que não acompanha a troca de idioma
<html lang="pt_BR">

// ✅ valor válido e sincronizado com o idioma ativo
<html lang="pt-BR">
```

```tsx
// ✅ em SPA, o atributo precisa acompanhar a troca de idioma em tempo de execução
useEffect(() => {
  document.documentElement.lang = i18n.language; // "pt-BR"
}, [i18n.language]);
```

Sem `lang` correto, o leitor de tela aplica a pronúncia do idioma padrão do sistema —
um texto em português lido com fonética inglesa fica ininteligível.

---

## 3.1.2 — Idioma das Partes · AA · base 🟡

Indícios de idioma estrangeiro (`FOREIGN_HINTS`): `english` `español` `français`
`deutsch` `italiano` `中文` `日本語` `한국어`.

| Mensagem | Sev |
|---|---|
| `Atributo lang='en_US' inválido – usar formato BCP 47 (ex: 'en', 'pt-BR').` | 🟡 Médio |
| `Possível conteúdo em idioma diferente sem atributo lang.` | 🟢 Baixo |

```tsx
<p>Conheça o nosso <span lang="en">streaming</span> ilimitado.</p>
```

Termos técnicos já incorporados ao português (`site`, `e-mail`, `download`) não
precisam de `lang` — o critério vale para trechos realmente em outro idioma.

```tsx
// ❌ trecho estrangeiro sem marcação: lido com a fonética do português
<p>Assista no nosso <span>streaming</span> com o plano Total Play.</p>

// ✅ o trecho declara seu idioma
<p>Assista no nosso <span lang="en">streaming</span> com o plano Total Play.</p>
```

Termos já incorporados ao português — `site`, `e-mail`, `download`, `mouse` — não
precisam de `lang`. A marcação é para trechos que devem soar como outro idioma.

---

## 3.2.1 — Em Foco · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Evento onfocus/onfocusin altera contexto (navegação/submit) – viola 3.2.1.` | 🟡 Médio |
| `Evento de foco abre modal/popup automaticamente – violar 3.2.1.` | 🟡 Médio |
| `Elemento com autofocus dispara mudança de contexto.` | 🟡 Médio |
| `Evento de foco insere/exibe novo conteúdo automaticamente.` | 🟢 Baixo |

```tsx
// ❌ receber foco não pode navegar nem submeter
<select onFocus={() => navigate('/planos')} />

// ✅ a mudança acontece por ação explícita
<select onChange={setPlano} />
<button type="button" onClick={() => navigate(`/planos/${plano}`)}>Ver plano</button>
```

---

## 3.2.2 — Em Entrada · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Evento onchange causa mudança de contexto – use botão de confirmação.` | 🟡 Médio |
| `Select submete formulário ao mudar – prover botão explícito.` | 🟡 Médio |
| `Seleção de opção altera o contexto automaticamente.` | 🟡 Médio |
| `Input file com onchange=submit – submissão automática ao selecionar arquivo.` | 🟡 Médio |
| `Formulário sem botão explícito de envio – mudança de contexto pode ocorrer sem ação do usuário.` | 🟢 Baixo |

Filtros que recarregam a lista ao mudar o `<select>` são o caso mais comum. Se a
atualização for no mesmo lugar da página e anunciada por `aria-live`, isso não é
"mudança de contexto" — mas o detector é textual, então prefira um botão "Aplicar
filtros" ou aceite o Médio conscientemente.

```tsx
// ❌ mudar o campo navega sozinho: quem usa teclado passa pelas opções e é levado embora
<select onChange={(e) => navigate(e.target.value)}>
  <option value="/faturas">Faturas</option>
  <option value="/consumo">Consumo</option>
</select>

// ✅ escolher e confirmar são ações separadas
<label htmlFor="periodo">Período</label>
<select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
  <option value="30">Últimos 30 dias</option>
  <option value="90">Últimos 90 dias</option>
</select>
<button type="button" onClick={aplicar}>Aplicar filtro</button>

// ✅ se o resultado atualizar no mesmo lugar, anuncie em vez de mudar de contexto
<div role="status" aria-live="polite">{`${faturas.length} faturas no período`}</div>
```

Atualizar uma lista na mesma página não é mudança de contexto — trocar de rota, submeter
ou abrir uma janela é. A segunda forma exige ação explícita do usuário.

---

## 3.2.3 — Navegação Consistente · AA · base 🟡

Todas `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `Nenhum elemento <nav> ou role='navigation' – mecanismo de navegação não identificado.` |
| `Múltiplos <nav> com mesmo aria-label: '…' – diferenciar labels.` |
| `Navegação aparece após o conteúdo principal no código – verificar ordem lógica.` |

```tsx
<nav aria-label="Navegação principal">…</nav>
<nav aria-label="Navegação do rodapé">…</nav>
<nav aria-label="Você está aqui">…</nav>  {/* breadcrumb: também ajuda 2.4.5 */}
```

```tsx
// ❌ a navegação principal muda de posição e de ordem entre as rotas
// (menu no topo em /faturas, na lateral em /consumo)

// ✅ a navegação vive no layout compartilhado, não em cada página
export function Layout({ children }) {
  return (
    <>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo principal</a>
      <header><nav aria-label="Navegação principal">{itensFixos}</nav></header>
      <main id="conteudo">{children}</main>
      <footer><nav aria-label="Navegação do rodapé">{itensRodape}</nav></footer>
    </>
  );
}
```

Consistência é o que permite decorar o caminho. Quem navega por teclado conta os `Tab`
até o item desejado; mudar a ordem entre páginas anula esse aprendizado.

---

## 3.2.4 — Identificação Consistente · AA · base 🟡

Compara nomes acessíveis de elementos de mesma função ao longo da página. Todas
contêm `consistência de`/`inconsistente` → 🟢 Baixo.

| Mensagem |
|---|
| `Ícone 'close' usado com nomes acessíveis diferentes: ['Fechar', 'Sair', 'X'].` |
| `Botões de fechar com rótulos inconsistentes: […] – padronizar.` |
| `Campos de busca com rótulos diferentes: […] – manter identificação consistente.` |
| `Rótulo visual 'Buscar' não está contido no nome acessível 'Pesquisar no site'.` |

A correção estrutural é um componente único (`<IconButton>`) com o rótulo vindo de uma
única chave i18next, em vez de `aria-label` escrito à mão em cada uso.

```tsx
// ❌ o mesmo ícone com nomes diferentes em telas diferentes
<button aria-label="Sair"><IconClose /></button>
<button aria-label="X"><IconClose /></button>
<button aria-label="Fechar janela"><IconClose /></button>

// ✅ um componente, um rótulo, uma chave de tradução
export function BotaoFechar({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} aria-label={t('acoes.fechar')}>
      <IconClose aria-hidden="true" />
    </button>
  );
}
```

A correção estrutural é centralizar: enquanto o `aria-label` for escrito à mão em cada
uso, a divergência volta no próximo componente.

---

## 3.2.6 — Ajuda Consistente · A · base 🟡

| Mensagem | Sev |
|---|---|
| `Nenhum mecanismo de ajuda detectado (link de help, FAQ, chat) – recomenda-se disponibilizar.` | 🟢 Baixo |
| `Mecanismo de ajuda pode não ser operável por teclado/AT.` | 🟢 Baixo |

Um link "Central de Ajuda" no rodapé, presente na mesma posição em todas as rotas,
satisfaz o critério. Widget de chat que só abre por clique em `<div>` cai na segunda
mensagem.

```tsx
// ❌ ajuda só existe em algumas telas e o gatilho não é um controle real
<div className="chat-bubble" onClick={abrirChat} />

// ✅ mecanismo de ajuda no layout, presente e na mesma posição em todas as rotas
<footer>
  <a href="/ajuda">Central de Ajuda</a>
  <button type="button" onClick={abrirChat}>Falar com o atendimento</button>
</footer>
```

O critério não exige oferecer ajuda — exige que, se ela existir, esteja sempre no mesmo
lugar e na mesma ordem relativa. Colocá-la no layout compartilhado resolve os dois
pontos de uma vez, junto com `3.2.3`.

---

## 3.3.1 — Identificação de Erro · A · base 🟠

| Condição | Problema | Impacto |
|---|---|---|
| `aria-invalid="true"` sem descrição | `Campo marcado aria-invalid='true' sem aria-describedby/aria-errormessage – descrever o erro.` | 🟠 Alto |
| `aria-describedby` órfão | `aria-describedby='erro-email' aponta para elemento inexistente.` | 🟠 Alto |
| erros sem região viva | `Formulário com campos inválidos sem role='alert' ou aria-live – erros podem não ser anunciados por leitores de tela.` | 🟡 Médio |
| vários inválidos | `3 campos inválidos sem sumário/aria-live para anunciar todos os erros.` | 🟡 Médio |
| erro só por cor | `Indicação de erro aparentemente só por cor/classe, sem texto ou ícone.` | 🟡 Médio |
| `required` sem texto | `Campo obrigatório sem indicação textual de obrigatoriedade no label.` | 🟡 Médio |
| `min`/`max` sem descrição | `Campo com limites (min/max) sem descrição programática de erro de intervalo.` | 🟡 Médio |

O `aria-describedby` órfão é o erro mais fácil de introduzir em React: o `id` da
mensagem só existe quando há erro, mas o `aria-describedby` é renderizado sempre.

```tsx
// ❌ aponta para um id que não existe enquanto não há erro
<input aria-invalid={!!erro} aria-describedby="erro-email" />
{erro && <span id="erro-email">{erro}</span>}

// ✅ o atributo só existe quando o alvo existe
<input
  id="email"
  aria-invalid={!!erro}
  aria-describedby={erro ? 'erro-email' : undefined}
/>
{erro && <span id="erro-email" role="alert">{erro}</span>}
```

Com Zod + react-hook-form, gere o `id` da mensagem a partir do nome do campo e
condicione o atributo ao mesmo booleano que renderiza a mensagem.

---

## 3.3.2 — Rótulos ou Instruções · A · base 🔴

O critério de formulário com maior impacto: sem rótulo programático o usuário de
leitor de tela não sabe o que preencher, e o campo fica inutilizável.

| Gatilho | Mensagem | Sev |
|---|---|---|
| campo só com `placeholder` | `Campo usa apenas placeholder como rótulo.` | 🔴 Crítico |
| campo sem rótulo | `Campo type='email' sem rótulo associado.` | 🔴 Crítico |
| sem nada | `Campo <input type='text'> sem label, aria-label ou placeholder.` | 🔴 Crítico |
| variante de aviso | `Campo usa apenas placeholder como rótulo – preferir <label> persistente.` | 🟠 Alto |
| sem nome programático | `Campo sem nome acessível programático.` | 🟠 Alto |
| formato sem instrução | `Campo com formato específico sem instrução (title/aria-describedby).` | 🟠 Alto |
| requisito sem instrução | `Campo com requisito sem instrução prévia (title/aria-describedby/placeholder).` | 🟠 Alto |
| `required` sem texto | `Campo obrigatório sem indicação textual de obrigatoriedade.` | 🟠 Alto |
| `required` vs `aria-required` | `Campo required com aria-required='false' inconsistente.` | 🟠 Alto |
| só `aria-required` | `Campo com aria-required='true' sem atributo HTML 'required'.` | 🟡 Médio |

O mesmo `<input>` costuma disparar **duas** mensagens (a `error` e a `warn`), que
têm impactos diferentes: a ausência total de rótulo é Crítica, e o uso de
`placeholder` no lugar de um `<label>` persistente é Alta.

```tsx
// ❌ um input, quatro critérios reprovados (3.3.2 · 4.1.2 · 2.4.6 · 2.5.3)
<input name="search" placeholder="digite sua busca" />

// ✅
<label htmlFor="search">Buscar</label>
<input
  id="search"
  name="search"
  type="search"
  autoComplete="off"
  aria-describedby="search-dica"
/>
<span id="search-dica">Digite o nome do produto ou o número do protocolo</span>

// ✅ quando o design não comporta label visível — nunca use placeholder no lugar
<label htmlFor="search" className="sr-only">Buscar</label>
<input id="search" name="search" type="search" placeholder="O que você procura?" />
```

`.sr-only` (clip de 1px, não `display:none`) mantém o rótulo para o leitor de tela sem
ocupar espaço. `display:none` remove o `<label>` da árvore de acessibilidade e o
detector volta a acusar.

---

## 3.3.3 — Sugestão de Erro · AA · base 🟠

| Gatilho | Mensagem | Sev |
|---|---|---|
| `aria-errormessage` órfão | `aria-errormessage='erro-cpf' aponta para elemento inexistente.` | 🟠 Alto |
| `pattern` sem explicação | `Input com pattern='…' sem title ou aria-describedby – sugestão de formato esperado ausente.` | 🟡 Médio |
| `min`/`max` sem sugestão | `Campo com intervalo (min/max) sem sugestão de valor válido (title/aria-describedby).` | 🟡 Médio |
| formato sem exemplo | `Campo com formato específico sem exemplo (placeholder/title).` | 🟡 Médio |
| alerta genérico | `Mensagem de alerta detectada: '…' – verificar se oferece sugestão de correção.` | 🟡 Médio |

```tsx
// ❌ "CPF inválido" não diz como corrigir
// ✅ mensagem acionável + formato antecipado
<label htmlFor="cpf">CPF</label>
<input
  id="cpf" pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
  title="Formato: 000.000.000-00"
  aria-describedby="cpf-formato"
/>
<span id="cpf-formato">Digite os 11 dígitos, no formato 000.000.000-00</span>
```

---

## 3.3.4 — Prevenção de Erro (Legal, Financeiro, Dados) · AA · base 🟡

Dispara em fluxos sensíveis. Tipos (`SENSITIVE_TYPES`): `password` `email` `tel`
`number` `card` `credit`. Nomes (`SENSITIVE_NAMES`): `password` `senha` `cartao` `card`
`cpf` `cnpj` `payment` `pagamento` `conta` `account`. Ações perigosas (`DANGER_HINTS`):
`excluir` `delete` `remover` `apagar` `cancelar assinatura` `transferir` `pagar`
`comprar` `confirmar pedido`. Todas `warn` → 🟢 Baixo.

| Mensagem |
|---|
| `Ação crítica sem diálogo de confirmação aparente.` |
| `Formulário com dados sensíveis (senha/pagamento) sem etapa de confirmação/revisão.` |
| `Formulário legal/financeiro sem opção clara de cancelar/voltar.` |

Toda tela de pagamento/contratação precisa de uma etapa de revisão e de um botão
"Voltar" ou "Cancelar" visível no mesmo passo.

```tsx
// ❌ o pagamento acontece no clique, sem revisão e sem volta
<button onClick={pagar}>Pagar R$ 249,70</button>

// ✅ etapa de revisão, confirmação explícita e caminho de saída
<h2>Revise o pagamento</h2>
<dl>
  <dt>Valor</dt><dd>R$ 249,70</dd>
  <dt>Vencimento</dt><dd>10/07/2026</dd>
  <dt>Cartão</dt><dd>Final 4321</dd>
</dl>
<button type="button" onClick={confirmar}>Confirmar pagamento de R$ 249,70</button>
<button type="button" onClick={voltar}>Voltar e editar</button>
```

O rótulo do botão de confirmação repetir o valor não é redundância: é a última chance de
o usuário perceber um erro antes de uma ação irreversível.

---

## 3.3.7 — Entrada Redundante · A · base 🟡

| Gatilho | Mensagem | Sev |
|---|---|---|
| dado já fornecido na etapa | `Re-entrada de dado não essencial já fornecido na mesma etapa.` | 🟡 Médio |
| campo "confirmar" | `Campo de confirmação exige redigitação da mesma informação.` | 🟢 Baixo |
| sugestão | `Campo de confirmação detectado – considerar autopreenchimento em vez de repetição.` | 🟢 Baixo |
| `name`/`autocomplete` repetido | `Campo com nome/autocomplete 'email' aparece mais de uma vez – verificar se a entrada é redundante (WCAG 3.3.7).` | 🟢 Baixo |

"Confirmar e-mail" é o padrão que mais dispara. A alternativa aceita pelo WCAG 2.2 é
mostrar o valor digitado para revisão em vez de exigir a redigitação. Endereço de
cobrança igual ao de entrega deve vir de um checkbox que copia os dados, não de um
segundo conjunto de campos com os mesmos `autocomplete`.

```tsx
// ❌ exige redigitar a mesma informação
<label htmlFor="email">E-mail</label>
<input id="email" type="email" autoComplete="email" />
<label htmlFor="email2">Confirme seu e-mail</label>
<input id="email2" type="email" autoComplete="email" />

// ✅ mostra o valor para conferência em vez de exigir repetição
<label htmlFor="email">E-mail</label>
<input id="email" type="email" autoComplete="email" value={email} onChange={aoDigitar} />
<p>
  Enviaremos a confirmação para <strong>{email}</strong>.{' '}
  <button type="button" onClick={editarEmail}>Corrigir e-mail</button>
</p>

// ✅ dado já fornecido vem de um checkbox, não de novos campos
<input type="checkbox" id="mesmo" checked={mesmoEndereco} onChange={aoMarcar} />
<label htmlFor="mesmo">Usar o mesmo endereço da entrega para cobrança</label>
```

Redigitar penaliza quem tem dificuldade motora, dislexia ou memória de curto prazo
reduzida — justamente quem mais erra na segunda digitação.

---

## 3.3.8 — Autenticação Acessível (Mínimo) · AA · base 🟡

CAPTCHA detectado por (`CAPTCHA_HINTS`): `captcha` `recaptcha` `hcaptcha`
`g-recaptcha` `cf-turnstile` `challenge`.

| Gatilho | Mensagem | Sev |
|---|---|---|
| `type="password" autocomplete="off"` | `Campo de senha com autocomplete='off' – impede gerenciadores de senhas (viola 3.3.8).` | 🟡 Médio |
| campo de auth com `off` | `Campo de autenticação type='email' com autocomplete='off' bloqueia gerenciadores.` | 🟡 Médio |
| CAPTCHA sem saída | `Autenticação aparenta depender apenas de teste cognitivo (CAPTCHA) sem alternativa.` | 🟡 Médio |
| CAPTCHA presente | `CAPTCHA detectado – garantir alternativa que não exija teste cognitivo (ex: autenticação por e-mail/SMS, WebAuthn, passkey).` | 🟢 Baixo |
| senha sem autocomplete | `Campo de senha sem autocomplete – adicionar 'current-password' ou 'new-password'.` | 🟢 Baixo |

```tsx
// ❌ "por segurança" é justamente o que quebra o gerenciador de senhas
<input type="password" autoComplete="off" />

// ✅ login
<input type="password" autoComplete="current-password" />
// ✅ cadastro / troca de senha
<input type="password" autoComplete="new-password" />
```
