# Design Spec — Export to CSV button (Reports page)

_Arm B — +persona interviewer (research-grounded specialist; refuses the
"should be quick" framing, mines for hidden forks, enforces close-out)._

## Contexto

PM pediu "só um botão Export to CSV, deve ser rápido". A entrevista recusou o
enquadramento trivial e reframou "rápido" em consequências concretas: quão
grande, de quem são as linhas, qual encoding.

## Características

- Botão "Export to CSV" na página de relatórios.
- Exporta **o resultado filtrado completo**, não apenas a página visível.
- Arquivo compatível com Excel pt-BR e com as mesmas regras de acesso da tela.

## Decisões Arquiteturais

- **D1 — Tamanho do dataset / sync vs async (RESOLVIDO, trade-off):** o
  resultado filtrado pode chegar a ~500k linhas. Um download síncrono estoura o
  timeout da requisição. Decisão: quando o resultado excede um limite, gerar o
  CSV de forma **assíncrona** e notificar o usuário com um link de download; sob o
  limite, servir síncrono. Trade-off: mais infra (job + storage do arquivo) em
  troca de não derrubar exports grandes.
- **D2 — Streaming vs buffering (RESOLVIDO, trade-off):** montar 500k linhas em
  memória faz o servidor dar OOM. Decisão: **streamar** as linhas para o arquivo
  em vez de bufferizar tudo. Trade-off: código de geração incremental vs pico de
  memória controlado.
- **D3 — Encoding & locale pt-BR (RESOLVIDO, trade-off):** CSV **UTF-8 com BOM**
  para o Excel reconhecer acentuação; separador decimal e de campo alinhados ao
  locale pt-BR (vírgula decimal → delimitador `;`) para os números não
  corromperem no Excel brasileiro. Trade-off: arquivo menos "canônico" (`;` em vez
  de `,`) em troca de abrir corretamente no público-alvo real.
- **D4 — PII / escopo de permissão (RESOLVIDO, trade-off):** o export **deve
  aplicar o mesmo filtro de permissão de linha** que a view aplica; uma query
  ingênua vazaria linhas que o usuário não pode ver na tela. Decisão: reusar a
  camada de autorização da listagem na geração do export. Trade-off: não dá para
  usar um dump direto/otimizado da tabela; passa pelo mesmo pipeline autorizado.
- **D5 — Timezone nos timestamps (RESOLVIDO, trade-off):** datas renderizadas no
  fuso do usuário (ou explicitamente rotuladas), não UTC cru, para não confundir o
  leitor do relatório.

## Fluxo

1. Usuário clica em Export.
2. Servidor conta/estima o tamanho do resultado filtrado (com o filtro de
   permissão aplicado).
3. Pequeno → gera síncrono e baixa. Grande → enfileira job, streama as linhas para
   um arquivo UTF-8+BOM com locale pt-BR, notifica com link.

## Riscos

- Limite sync/async mal calibrado degrada UX (espera longa ou timeout na fronteira).
- Custo/expiração do storage dos arquivos assíncronos.
- Regressão de permissão se o pipeline de export divergir do da view no futuro.

## Notas de fechamento

Todas as decisões duras surgidas (D1–D5) foram resolvidas com trade-off
registrado; nenhuma decisão dura ficou em aberto (## Questões em Aberto vazia,
portanto omitida).
