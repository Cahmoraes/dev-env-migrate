---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Exportação CSV de Relatório (download server-side)

## Visão Geral

Um botão "Exportar para CSV" na página de relatórios. Superficialmente uma mudança de uma linha; a entrevista tratou "should be quick" como o sinal de alerta que é e reenquadrou o pedido em três perguntas de especialista: **quão grande, de quem são as linhas, e em qual encoding**. Cada uma revelou uma decisão dura que o pedido assumia resolvida.

Neste ciclo, a entrevista abriu pela dimensão de dados sensíveis (a página de relatórios já era descrita como tendo controle de acesso). Ao perguntar "o CSV deve conter só as linhas que este usuário vê na tela, ou o relatório inteiro?", o usuário confirmou que precisa espelhar a tela — o que fixou o export ao mesmo escopo de permissão. Em seguida, "e o filtro pode trazer quantas linhas no pior caso?" revelou o volume grande (centenas de milhares), fixando a geração assíncrona com streaming. Por fim, "quando abrem no Excel, é Excel em português?" fechou encoding/locale. A oferta de companion visual foi feita e o usuário dispensou ("é só um botão"); o design é backend-dominante, então segue text-only.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Security / Confidentiality | O relatório tem controle de acesso por linha; um export que vaze linhas restritas é incidente de dados | Teste com usuário restrito: nenhuma linha fora do escopo dele aparece no arquivo |
| Reliability sob carga | O export grande roda no backend compartilhado e não pode causar falha em cascata | Export de ~500k linhas conclui sem OOM; memória do gerador limitada e constante |
| Correctness de formato (Excel pt-BR) | O arquivo é aberto no Excel pt-BR; encoding/locale errado o inutiliza | Abre sem wizard de importação; acentos e números íntegros |

**Consideradas, não priorizadas:** performance de latência (fluxo assíncrono absorve a duração); portabilidade multi-locale (só pt-BR hoje).

## Estrutura de Componentes

- **ExportEnqueuer (endpoint)** — recebe o filtro atual e o contexto de autorização do usuário, valida, e enfileira um job de export; devolve um id de acompanhamento imediatamente.
- **AuthorizedReportQuery** — a fronteira de confidencialidade: monta a consulta do relatório com exatamente o mesmo filtro de permissão por linha que a tela aplica, exposta como cursor. É o único componente autorizado a produzir linhas para o export.
- **IncrementalCsvWriter** — consome o cursor e escreve o CSV progressivamente para storage; memória constante, sem materializar o conjunto.
- **PtBrExcelFormatter** — garante BOM UTF-8, separador decimal e delimitador pt-BR, e timestamps no timezone do usuário. Isola D3 e D5.
- **ExportDeliveryLink** — ao concluir, publica o link de download e sinaliza o usuário; o download é servido como recurso pronto, separado da geração.

## Decisões Arquiteturais

### D1. Geração assíncrona sempre (job + link de download)

- **Contexto:** O resultado filtrado pode chegar a centenas de milhares de linhas. Gerar na request.
- **Decisão:** Todo export vira um job; a request só enfileira e responde com id; o arquivo fica disponível por link ao terminar.
- **Justificativa técnica:** O caminho grande estoura timeout HTTP e prende worker; padronizar em assíncrono elimina o modo de falha e evita manter dois caminhos. Para exports pequenos a latência extra é aceitável e uniforme.
- **Justificativa de negócio:** O admin que gera o export grande é o usuário crítico; um caminho único e robusto reduz custo de manutenção e superfície de bug.
- **Trade-offs aceitos:** Exports pequenos também esperam o "pronto" em vez de baixar instantâneo — trocado deliberadamente por simplicidade e robustez de um caminho só. Se a espera nos pequenos incomodar, introduzir um atalho síncrono abaixo de um limiar (gatilho de revisão).

### D2. Escrita em streaming a partir de cursor

- **Contexto:** Montar o CSV inteiro em memória no worker.
- **Decisão:** `IncrementalCsvWriter` escreve linha a linha a partir do cursor de `AuthorizedReportQuery`.
- **Justificativa técnica:** Buffering de 500k linhas causa OOM; streaming mantém memória O(1).
- **Justificativa de negócio:** Reliability sob carga é top-3; o export não pode derrubar o serviço.
- **Trade-offs aceitos:** Requer ordenação estável na consulta para o cursor. Custo baixo.

### D3. UTF-8 com BOM + locale pt-BR

- **Contexto:** Aberto no Excel pt-BR.
- **Decisão:** BOM UTF-8; separador decimal vírgula, delimitador compatível pt-BR, escaping CSV padrão.
- **Justificativa técnica:** Sem BOM o Excel pt-BR quebra acentos; com ponto decimal corrompe números.
- **Justificativa de negócio:** "Abrir no Excel" é o sucesso declarado; formato errado invalida a entrega.
- **Trade-offs aceitos:** Acoplado à convenção Excel pt-BR; parsers genéricos exigiriam ajuste. Revisar se surgir consumo por integração.

### D4. Export herda o filtro de permissão por linha da visualização

- **Contexto:** A página aplica controle de acesso por linha. Um export ingênuo consultaria a fonte sem esse filtro.
- **Decisão:** `AuthorizedReportQuery` aplica o mesmo predicado de permissão da tela; é o único caminho para produzir linhas do export.
- **Justificativa técnica:** Sem o predicado, o arquivo contém linhas que o usuário não pode ver — vazamento silencioso, invisível na UI.
- **Justificativa de negócio:** Confidencialidade é a característica #1; um export que amplia acesso é incidente de dados, não detalhe técnico.
- **Trade-offs aceitos:** Sem query alternativa "mais leve" para o export. Aceito por ser a fronteira de segurança.

### Decisões táticas

| Decisão | Justificativa |
|---|---|
| D5. Timestamps no timezone do usuário, com o tz rotulado na coluna | Casa com o que a tela exibe; UTC cru confunde. Reversível — adicionar coluna UTC se surgir uso de auditoria; gatilho: requisito de conciliação/compliance. |
| Retenção temporária do arquivo gerado com expiração | Evita acúmulo de arquivos e reduz janela de exposição do link; barato. |

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Vazamento de linhas restritas no export (D4) | 3 | 3 | 9 🔴 | `AuthorizedReportQuery` como única fonte; teste de aceitação com usuário restrito comparando export vs tela; revisão de segurança da consulta |
| OOM por buffering em export grande (D2) | 3 | 2 | 6 🔴 | Streaming obrigatório; teste de carga a 500k medindo memória |
| Arquivo corrompido no Excel pt-BR (D3) | 3 | 2 | 6 🔴 | Teste validando BOM + separador decimal no arquivo gerado |
| Link de download exposto além do necessário | 2 | 2 | 4 🟡 | Link autorizado ao próprio usuário + expiração do arquivo |
| Cursor sem ordem estável perde/duplica linhas | 2 | 2 | 4 🟡 | Ordenação determinística por chave única |

O risco D4 recebe probabilidade 3 (alta) porque um export escrito sem consciência do filtro de permissão é o caminho de implementação "natural" — a mitigação de fronteira única é o que o rebaixa na prática.

## Tratamento de Erros

- Job que falha marca estado "falhou" com reenvio; nunca serve arquivo parcial.
- Resultado vazio (ou usuário sem acesso a nenhuma linha do filtro) → CSV só com cabeçalho.
- Link expirado → mensagem clara para re-gerar, não erro genérico.

## Testes

- **Segurança (D4):** usuário restrito → zero linhas fora de escopo; export == tela.
- **Escala (D1/D2):** 500k linhas assíncrono sem OOM; request só enfileira.
- **Locale (D3):** abre no Excel pt-BR com acentos e decimais corretos.
- **Timezone (D5):** timestamp do arquivo == tela para o tz do usuário.
- **Escopo:** com filtro aplicado, o arquivo traz o resultado filtrado completo, não a página visível.

## Notas de Escopo

Todas as decisões duras surgidas na entrevista estão fechadas — D1-D4 estruturais com trade-off, D5 leaf reversível com default + gatilho de revisão. Não há seção de questões em aberto: cada ponta tem destino no spec.
