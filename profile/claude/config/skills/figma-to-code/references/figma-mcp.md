# Contrato do Figma MCP

Referência da skill `figma-to-code`. Este arquivo é o contrato de uso do Figma MCP: as tools, a
prioridade dos hints, a leitura de Code Connect, os tokens, os assets e a recuperação de erro.
Leia-o antes de chamar `get_design_context`.

## Tools disponíveis

| Tool | Quando usar |
|---|---|
| `get_design_context` | **Sempre primeiro.** Uma chamada devolve código de referência + screenshot + hints do nó. |
| `get_metadata` | Só para orientar-se: listar os nós filhos de um frame grande e escolher o alvo. |
| `get_screenshot` | Só para validar ou desambiguar algo que o contexto não explicou. |
| `get_variable_defs` | Variáveis do design (cor, spacing, radius) → mapear para `skinVars`. |
| `get_code_connect_map` | Descobrir se o componente do Figma já está mapeado para um componente de código. |
| `search_design_system` | Localizar o componente da biblioteca quando o nó é uma instância desconhecida. |

`get_metadata` e `get_screenshot` **não substituem** `get_design_context`.

Não preencha o parâmetro `skillNames` de `get_design_context`: ele é telemetria de skills da própria
Figma, e nenhuma delas está no fluxo.

## Antes do primeiro `get_design_context`: o prompt de Code Connect

Se o arquivo tem componentes sem mapeamento, a primeira chamada não devolve design nenhum — devolve
um script pedindo para você perguntar ao usuário se ele quer mapear. **Repasse o script ao usuário
literalmente e obedeça à resposta.** Se ele disser não, repita a chamada com
`disableCodeConnect: false` e o design vem normalmente. Não interprete essa resposta como erro nem
tente contornar.

## Lendo `CodeConnectSnippet`

Quando o design usa a biblioteca Mistica, boa parte dos nós volta embrulhada assim:

```jsx
<CodeConnectSnippet data-node-id="10224:129502" data-snippet-language="React">
  <DataCard size="snap" title="Conferir coberturas" onPress={() => {}} footerDivider />
</CodeConnectSnippet>
```

Regras:

- **O wrapper `CodeConnectSnippet` nunca aparece no código final.** Aproveite só o filho.
- **Formato de opções** (`options={[<Button variant="primary"/>, <Button variant="secondary"/>]}`):
  escolha uma, guiado pelo screenshot e pelas `data-user-rules`.
- **`data-user-rules` é regra do autor do componente e vence sua intuição.** No design system Vivo
  elas trazem coisas como "use sempre `Row` dentro de `RowList`" e "quando o preset for `navigation`,
  passe `onPress` ou `href` no `Row` para o chevron aparecer". Aplique — mas **não copie o texto da
  regra para o código**.
- **Props de metadado do Figma não são props do Mistica.** `themeContext`, `chooseIcon`, `level`,
  `slot`, `state`, `largeIcon`, `🔄ReplaceSlot`, `centered="False"` (string, não booleano) e
  componentes como `ZoneCPresets` são artefatos do arquivo Figma. Descarte todos e reconstrua com a
  API real do componente.
- **O caminho de import do snippet pode não existir no pacote instalado.** O snippet sugere
  `import Title3 from "src/title.tsx"` ou `import {AdvancedDataCard} from "@telefonica/mistica/community"`,
  mas neste repo o acesso é sempre pelo namespace e o nome pode mudar — `AdvancedDataCard` é
  `M.CommunityAdvancedDataCard`. **Confirme todo nome vindo de Code Connect no `index.d.ts` antes de
  usar:**
  ```bash
  grep -n "AdvancedDataCard" node_modules/@telefonica/mistica/dist/index.d.ts
  ```

## Prioridade dos hints

A resposta traz hints de origens diferentes. Quando conflitarem, a fonte mais alta vence:

1. **Code Connect** — o componente de código já mapeado. Use direto.
2. **Links de documentação do componente** — siga as diretrizes de uso.
3. **Anotações do designer** — restrições e intenções escritas no arquivo.
4. **Design tokens / variáveis CSS** — mapeie para `skinVars.*`.
5. **Hex cru e posicionamento absoluto** — sinal fraco; leia o screenshot para entender a intenção
   e escolha o token Mistica mais próximo.

Regra prática: quanto mais baixo o hint, mais liberdade você tem para escolher a primitiva Mistica
idiomática em vez de reproduzir o valor literal.

## Tokens: o padrão correto

O design system Vivo no Figma é gerado a partir do mesmo contrato de skin do Mistica. **O nome da
variável do Figma É o nome do token** — não há tradução a fazer, e adivinhar por hex ou por
"parecido" é o erro clássico aqui.

### Passo 1 — leia as variáveis do nó

```
get_variable_defs(fileKey, nodeId)
```

Devolve um objeto plano, por exemplo (recorte real do Parcela Segura):

```json
{
  "textPrimary": "#000000",      "textSecondary": "#666666",
  "backgroundContainer": "#ffffff", "border": "#dddddd",
  "divider": "#dddddd",          "textLink": "#660099",
  "radii/container": "24",       "radii/button": "32",
  "Spacing/spacing-md": "24",    "Spacing/spacing-xl": "64",
  "fontSize/mobile/text3": "16", "lineHeight/mobile/text3": "24"
}
```

### Passo 2 — resolva pelo prefixo

| Forma da variável | Vira | Exemplo |
|---|---|---|
| nome simples (sem `/`) | `M.skinVars.colors.<nome>` | `textSecondary` → `M.skinVars.colors.textSecondary` |
| `radii/<nome>` | `M.skinVars.borderRadii.<nome>` | `radii/container` → `M.skinVars.borderRadii.container` |
| `Spacing/spacing-*` | valor numérico em `Stack`/`Inline`/`Box` | `Spacing/spacing-md: 24` → `space={24}` |
| `fontSize/…`, `lineHeight/…`, `fontWeight/…`, `text-preset-N` | componente `Text*`/`Title*` | `text-preset-3` → `<M.Text3 regular>` |

O nome é copiado literalmente, preservando camelCase: `backgroundContainer`, `textNavigationBarPrimary`,
`tagBackgroundActive`, `chevronIndicator`, `controlActivated`, `backgroundSkeleton`. No frame de
referência as 16 variáveis de cor bateram 1:1 com `skinVars.colors`.

### Passo 3 — confirme antes de usar

```bash
grep -c "textSecondary" node_modules/@telefonica/mistica/dist/skins/skin-contract.css.d.ts
```

Nome que não aparece no contrato **não vira token**: significa que o componente já resolve aquilo
sozinho. `radii/tag: 10` é o caso típico — não existe `borderRadii.tag`, porque `<M.Tag>` já aplica
o próprio raio. Nesses casos use o componente e não estilize nada.

### Raio: você não aplica, o componente aplica

**Nenhum componente da API pública aceita `borderRadius`.** `Box` não tem raio (só padding), `Boxed`
não tem a prop (ela existe só no `InternalBoxed`, não exportado) e `Image` expõe apenas
`noBorderRadius` e `circular` — não um valor. As props com raio vivem em tipos internos.

Consequência prática: **`radii/*` no `get_variable_defs` é confirmação, não instrução.** Ver
`radii/container: 24` significa "o design usa a superfície padrão" → escreva `<M.Boxed>` e não passe
raio nenhum:

```tsx
<M.Boxed>
  <M.Box padding={16}>…</M.Box>
</M.Boxed>
```

Se o design pede um canto que nenhum componente entrega, isso é divergência a reportar ao usuário —
não motivo para `style={{ borderRadius }}`.

### Regras

- **Nunca escolha o token pelo hex.** `textSecondary` e `chevronIndicator` são ambos `#666666` neste
  frame e são tokens diferentes; o hex muda entre skins e entre light/dark, o papel não.
- **Nunca copie o valor resolvido.** `"backgroundContainer": "#ffffff"` vira
  `M.skinVars.colors.backgroundContainer`, jamais `"#ffffff"` — senão o dark mode quebra.
- **Só existem quatro grupos em `skinVars`:** `colors`, `rawColors`, `borderRadii`, `textPresets`.
  **Não existe `skinVars.spacing` nem `skinVars.shadows`** — spacing é prop numérica de
  `Stack`/`Inline`/`Box`, e sombra vem do componente (`Boxed`, `DataCard`) ou não é implementada.
- **`rawColors` só para `applyAlpha`:** `applyAlpha(M.skinVars.rawColors.backgroundBrand, 0.8)`.
- Se o nó não devolver variável nenhuma, o design não está tokenizado: caia no screenshot e escolha
  o token pelo papel do elemento, registrando a escolha na resposta ao usuário.

## Ícones e imagens

O `get_design_context` devolve ícones e imagens como `<img src="https://.../api/mcp/asset/...">`.

- **Nunca desenhe o vetor.** Não escreva `<svg>`/`<path>` à mão nem crie um arquivo de ícone: você
  não tem os dados vetoriais reais, então qualquer coisa que você desenhar está errada.
- **Nunca omita um ícone** nem deixe placeholder.
- **Prefira o ícone Mistica** quando o glifo corresponder de fato — correspondência de nome não
  basta, confira no screenshot. O catálogo é `Icon<Nome><Regular|Light|Filled>`; confirme a
  existência antes de usar:
  ```bash
  grep -o "IconShield[A-Za-z]*" node_modules/@telefonica/mistica/dist/index.d.ts | sort -u
  ```
- **Sem equivalente Mistica**, use o asset exportado. A URL renderiza de imediato mas **expira em
  ~7 dias**: para código que vai ser commitado, baixe os bytes do asset e comite o arquivo, ou ligue
  a imagem à fonte de dados real (API/CDN/props). Nunca comite um arquivo cujo conteúdo você
  escreveu.
- **Dimensione explicitamente**: container de tamanho fixo (ícones normalmente quadrados) com largura
  **e** altura definidas, e a `<img>` folha preenchendo 100%. Nunca `auto` — a imagem estoura para o
  tamanho intrínseco.

Padrão da casa para ícone dentro de card/row:

```tsx
<M.Circle size={40} backgroundColor={M.skinVars.colors.brandLow}>
  <M.IconShieldRegular color={M.skinVars.colors.brand} />
</M.Circle>
```

## Recuperação de erro

| Situação | Ação |
|---|---|
| `get_design_context` retorna erro | **Pare e leia a mensagem** antes de tentar de novo. Não repita a mesma chamada. |
| URL sem `node-id` (link de arquivo) | Peça ao usuário o link do frame. Nunca chute o `nodeId` nem passe vazio. |
| Timeout | Use `get_metadata` para achar um nó filho menor e chame de novo nele. Componha a tela por seções. |
| Nó grande demais / resposta truncada | Divida por seção do design e implemente uma `render*()` por seção. |
| MCP indisponível | Pare e peça ao usuário para conectar o servidor Figma MCP. Não implemente a tela a partir do screenshot sozinho nem do nome do arquivo. |
