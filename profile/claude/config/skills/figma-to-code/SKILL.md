---
name: figma-to-code
description: "Implementa telas React com Mistica Design System a partir de um design do Figma, via Figma MCP. Use quando o usuário: (1) fornecer link/print/mockup do Figma e pedir implementação; (2) disser 'implementa esse design', 'converte esse Figma em código', 'cria a view dessa tela', 'transforma esse mockup em React', 'design to code'; (3) pedir uma View (`*-view.tsx`) ou Section fiel a um frame do Figma. NÃO use sem design artifact — para construir só com Mistica use a skill `mistica`; para validar visualmente o que já foi implementado use `figma-visual-tester`."
---

# Figma → Código (Mistica)

Traduz um frame do Figma em uma **View** do Framework Brasil escrita com Mistica Web.

Esta skill é dona do **workflow de tradução design → código**. Ela não redefine o Mistica nem o
estilo do projeto — delega:

| Assunto | Fonte de verdade |
|---|---|
| Mecânica do Figma MCP (tools, hints, assets, erros) | [`references/figma-mcp.md`](references/figma-mcp.md) |
| API, tokens e composição do Mistica | skill `mistica` |
| Forma do artefato, nomenclatura, React, testes | skill `code-style` |
| Validação visual final | skill `figma-visual-tester` |
| Mapeamento Figma → Mistica e checklist de fidelidade | [`references/mapping.md`](references/mapping.md) |

## Pré-requisitos

O servidor Figma MCP precisa estar conectado. Se as tools `get_design_context` / `get_metadata` /
`get_screenshot` não estiverem disponíveis, **pare** e peça ao usuário para conectá-lo. Não tente
implementar a tela a partir do link, do nome do arquivo ou de suposições — sem o design real o
resultado é ficção.

## Workflow

### 1. Extraia o contexto do design

Leia [`references/figma-mcp.md`](references/figma-mcp.md) — é o contrato de uso do Figma MCP — e
chame `get_design_context` no nó alvo. Uma única chamada devolve código de referência, screenshot e
hints.

- O `nodeId` vem do parâmetro `node-id` da URL. URL sem `node-id`: peça um link do frame específico.
- A primeira chamada pode voltar um script pedindo para o usuário mapear Code Connect. Repasse o
  script literalmente e obedeça à resposta — não é erro.
- Chame também `get_variable_defs` no mesmo nó **sempre que a tela tiver cor, raio ou espaçamento a
  decidir** — ou seja, quase sempre. É a fonte dos tokens; sem ela você estará adivinhando.

O código devolvido é **React + Tailwind de referência**, nunca entregável. Ele descreve intenção
visual; o entregável é Mistica.

Se o design usa a biblioteca Mistica, os nós voltam embrulhados em `CodeConnectSnippet` — esse é o
sinal mais forte que você tem, e ler errado é a maior fonte de retrabalho. As regras de leitura
(descartar o wrapper, obedecer `data-user-rules`, descartar props de metadado do Figma, conferir todo
nome no `index.d.ts`) estão em [`references/figma-mcp.md`](references/figma-mcp.md) — **leia antes de
escrever o JSX.**

### 2. Ancore no código que já existe

Antes de escrever qualquer JSX, leia **pelo menos uma View já implementada no módulo alvo** e
reaproveite o que ela usa. Padrão da casa vence padrão genérico. Reaproveite, nessa ordem:

1. Sections e componentes já existentes no módulo.
2. Componentes Mistica compostos (`Boxed`, `BoxedRow`, `DataCard`, `RowList`, `Tag`, `Circle`) —
   preferíveis a remontar o mesmo visual com `Box` + `Stack` na mão.
3. Primitivas (`Box`, `Stack`, `Inline`, `ResponsiveLayout`).

### 3. Mapeie e implemente

Traduza cada nó do Figma para o componente Mistica correspondente usando
[`references/mapping.md`](references/mapping.md). Ao encontrar um componente cuja API você não tem
certeza, consulte a skill `mistica` ou o arquivo de tipos antes de usar:

```bash
grep -n "ComponentName" node_modules/@telefonica/mistica/dist/index.d.ts
```

Implemente a View inteira de uma vez; divida o JSX em funções `render*()` internas, uma por bloco
visual do design.

### 4. Valide

Rode a checklist de [`references/mapping.md`](references/mapping.md), depois a skill
`figma-visual-tester` para o diff visual contra o frame original.

## Escopo do entregável

Implemente **apenas o conteúdo da tela**. Ignore no design:

- Status bar do sistema, Tab Bar, Nav Bar e headers nativos de navegação (o app hospedeiro os provê).
- Molduras de device, anotações de designer, réguas e specs de medida.

Entregue **um** arquivo `<nome>-view.tsx` em `presentation/view/` (Sections em
`presentation/view/components/`). Não crie controller, use case, teste, arquivo de estilo, hook,
`types.ts` ou `constants.ts` — a menos que o usuário peça.

A View é pura: tudo entra por props, zero `useState`/`useEffect`, zero gateway, zero regra de
negócio. Handlers chegam prontos por props; se o design mostra uma ação sem callback definido,
declare a prop (`onPress: () => void`) em vez de inventar a lógica.

## Restrições

1. **Sem valor literal de estilo.** Cor é `M.skinVars.colors.*`, raio é `M.skinVars.borderRadii.*`,
   spacing é a escala do Mistica (`0 2 4 8 12 16 24 32 40 48 56 64 72 80`) em `Stack`/`Inline`/`Box`,
   tipografia é `Text1`–`Text10` / `Title1`–`Title4`. Nunca `#hex`, `rgb()`, `fontSize`, `margin`,
   `padding` em px cru. O nome da variável do Figma é o nome do token — o procedimento está em
   [`references/figma-mcp.md`](references/figma-mcp.md).
2. **Sem prop inventada.** Não achou no `index.d.ts`, não usa.
3. **Sem dependência nova.** Só `@telefonica/mistica` e React.
4. **Sem HTML cru para layout.** Use as primitivas Mistica; `as="p"` / `as="h1"` em `Text*`/`Title*`
   resolve a semântica.
5. **Ícone/imagem nunca é inventado.** Nunca escreva `<svg>`/`<path>` à mão. Use o ícone Mistica cujo
   glifo corresponde de fato, ou o asset exportado pelo Figma — ver [`references/figma-mcp.md`](references/figma-mcp.md).

## Fidelidade: o que priorizar quando não bate

Quando o design não tem equivalente exato no Mistica, **não force pixel com CSS cru**. Ordem de
prioridade:

1. Hierarquia e ordem dos elementos.
2. Componente Mistica semanticamente equivalente, mesmo com pequena diferença visual.
3. Token mais próximo na escala (spacing 14px do Figma → `12` ou `16`, nunca `14`).
4. Só então, uma nota ao usuário explicando a divergência.

Divergência assumida e explicada é resultado correto. Pixel exato obtido com `style={{}}` é
resultado errado.

## Formato de entrega

```tsx
// presentation/view/parcela-segura-view.tsx
import * as M from "@telefonica/mistica"
import type { ParcelaSegura } from "@/parcela-segura/domain/parcela-segura"

export interface ParcelaSeguraViewProps {
  readonly data: ParcelaSegura
  readonly onTriggerInsurance: () => void
}

ParcelaSeguraView.testId = "parcela-segura-view"
export function ParcelaSeguraView({ data, onTriggerInsurance }: ParcelaSeguraViewProps) {
  function renderProtectionCard() {
    return (
      <M.Boxed>
        <M.Box padding={16}>
          <M.Stack space={16}>
            <M.Tag type="active">{data.status}</M.Tag>
            <M.Title3>{data.protectionTitle}</M.Title3>
            <M.Text2 regular color={M.skinVars.colors.textSecondary}>
              {data.insuredServiceLabel}
            </M.Text2>
            <M.ButtonPrimary onPress={onTriggerInsurance}>
              {data.insuranceTriggerLabel}
            </M.ButtonPrimary>
          </M.Stack>
        </M.Box>
      </M.Boxed>
    )
  }

  return (
    <M.ResponsiveLayout dataAttributes={{ testid: ParcelaSeguraView.testId }}>
      <M.Box paddingY={24} paddingX={16}>
        <M.Stack space={24}>
          <M.Title2>{data.title}</M.Title2>
          {renderProtectionCard()}
        </M.Stack>
      </M.Box>
    </M.ResponsiveLayout>
  )
}
```

Pontos obrigatórios do formato: namespace `import * as M`, `export function` (nunca arrow), `testId`
estático na linha anterior ao export, `dataAttributes={{ testid: X.testId }}` no nó raiz, props com
sufixo `ViewProps` e campos `readonly`, blocos em `render*()`.
