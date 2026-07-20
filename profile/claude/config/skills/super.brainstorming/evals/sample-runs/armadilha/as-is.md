# Design Spec — Export to CSV button (Reports page)

_Arm A — as-is interviewer (generic decision-tree, no specialist posture)._

## Contexto

PM pediu: "adicionar um botão 'Export to CSV' na página de relatórios; baixa o
relatório como CSV. Deve ser rápido." Tratado como mudança pequena de UI.

## Características

- Botão "Export to CSV" no cabeçalho da página de relatórios.
- Ao clicar, baixa um arquivo `.csv` com os dados exibidos na tela.
- Formato CSV padrão, abrível no Excel.

## Decisões Arquiteturais

- **Escopo do dado (D1, parcial):** exporta "os dados que estão na tela".
  Resolvido no valor de superfície — a página visível. (Sem análise de dataset
  grande / sync-vs-async.)
- **Formato:** CSV "normal", separado por vírgula, para abrir no Excel.
- **Formatação de data/hora (D5):** timestamps renderizados no fuso do usuário
  (ou rotulados), para não confundir quem lê o relatório. _Resolvido._

## Fluxo

1. Usuário clica no botão.
2. Front-end serializa as linhas já carregadas na grade em CSV.
3. Browser dispara o download síncrono.

## Riscos

- (nenhum levantado na entrevista)

## Notas

Entrevista aceitou "só o que está na tela / CSV normal pro Excel" ao pé da letra.
Não foram investigados: tamanho real do resultado filtrado, carga de memória do
servidor, encoding/locale pt-BR, nem se o export respeita as permissões de linha
da view.
