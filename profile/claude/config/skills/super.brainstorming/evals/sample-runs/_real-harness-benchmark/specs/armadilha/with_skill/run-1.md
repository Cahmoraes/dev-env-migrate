---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Exportação CSV do Relatório

## Visão Geral

Adicionar um botão "Exportar para CSV" na página de relatórios. O pedido inicial descreveu isto como "só um botão que baixa a tela como CSV", mas a entrevista revelou que a decisão dominante não é o botão — é **o que exatamente é exportado, para quem, e a que escala**. O relatório é filtrável e o resultado filtrado pode chegar a ~500 mil linhas (o usuário confirmou quando perguntei "e se o filtro estiver aberto, quantas linhas isso pode dar?"). Isso muda o design de "gerar um arquivo na hora e devolver" para "exportar o resultado filtrado completo de forma assíncrona, respeitando as mesmas permissões da tela, com encoding correto para Excel pt-BR".

O escopo do que se baixa também foi decidido: **o resultado filtrado completo, não apenas a página visível**. A primeira resposta ("só o que está na tela") caiu quando confrontada com o cenário concreto — um admin filtra 40 mil linhas, vê 50 na tela paginada, e espera o CSV com as 40 mil. Exportar só a página seria um bug silencioso.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Reliability (não estourar) | Um export de 500k linhas não pode derrubar o servidor nem dar timeout na request | Export de 500k linhas conclui sem OOM e sem exceder o timeout HTTP; pico de memória do processo < 200MB durante a geração |
| Security (isolamento de dados) | O relatório expõe dados sujeitos a permissão por linha; o export não pode vazar linhas que o usuário não vê na tela | Export retorna exatamente o mesmo conjunto de linhas que a tela retornaria para aquele usuário/filtro (teste com usuário de permissão restrita) |
| Correctness (fidelidade do arquivo) | O arquivo é aberto no Excel pt-BR; encoding/locale errado corrompe acentos e números | Arquivo abre no Excel pt-BR com acentos corretos e números na coluna numérica (separador decimal correto), sem passo manual de importação |

**Consideradas, não priorizadas:** performance de latência de UI (o export é assíncrono, então a percepção é "recebo quando fica pronto", não "instantâneo"); scalability horizontal (volume atual de exports concorrentes é baixo — um worker basta; revisitar se a fila crescer).

## Estrutura de Componentes

Componentes nomeados por responsabilidade (não "Manager"/"Service"):

- **ReportExportRequest (endpoint)** — recebe o clique no botão com o filtro atual, valida, e enfileira um job. Responde imediatamente com "export em processamento" e um id de acompanhamento. Não gera o arquivo na request.
- **PermittedRowQuery** — reconstrói a mesma query da tela (mesmos filtros + o mesmo filtro de permissão por linha aplicado à visualização), garantindo que o export não veja mais do que a tela. É a fronteira de segurança: nenhuma outra parte monta a query de export.
- **RowStreamWriter** — consome o resultado da query em cursor/stream (fetch incremental) e escreve linhas CSV para um destino (arquivo temporário / storage), sem carregar o conjunto inteiro em memória.
- **CsvLocaleEncoder** — formata cada linha: UTF-8 com BOM, separador de campo e separador decimal conforme locale pt-BR, timestamps renderizados no timezone do usuário. É onde as decisões D3 e D5 vivem, isoladas do writer.
- **ExportReadyNotifier** — quando o writer termina, disponibiliza o link de download (e/ou notifica o usuário). O download em si é uma request separada que serve o arquivo pronto.

Fluxo: clique → `ReportExportRequest` enfileira → job pega `PermittedRowQuery` → `RowStreamWriter` faz stream por `CsvLocaleEncoder` → arquivo pronto → `ExportReadyNotifier` libera link → usuário baixa.

## Decisões Arquiteturais

### D1. Geração assíncrona (job + link/notify) em vez de gerar na request

- **Contexto:** O resultado filtrado pode chegar a ~500k linhas. Gerar sincronamente na request HTTP.
- **Decisão:** Enfileirar um job; a request responde na hora com um id; o arquivo fica disponível via link quando pronto.
- **Justificativa técnica:** Um export de centenas de milhares de linhas excede o timeout HTTP típico e prende um worker web pela duração inteira. Assíncrono desacopla a duração da geração do ciclo de vida da request.
- **Justificativa de negócio:** Evita a experiência de "cliquei e travou/deu erro" no export grande — que é a operação de maior valor para o admin. Custo de implementação de um job simples é baixo frente ao retrabalho de um export que falha em produção.
- **Trade-offs aceitos:** Introduz uma fila/worker e um estado "processando" na UI (mais peças do que um download síncrono). Para exports pequenos o usuário espera o notify em vez de baixar instantaneamente — aceito porque o caminho grande é o que importa e um único caminho é mais simples de manter que dois.

### D2. Streaming por cursor em vez de bufferizar o CSV em memória

- **Contexto:** Mesmo dentro do job, montar o CSV inteiro de 500k linhas em memória antes de gravar.
- **Decisão:** Ler o resultado por cursor/stream e escrever linha a linha para o destino.
- **Justificativa técnica:** Bufferizar 500k linhas materializa o dataset inteiro na heap e causa OOM sob concorrência ou datasets no topo da faixa. Streaming mantém memória O(1) por linha.
- **Justificativa de negócio:** Protege a estabilidade do serviço inteiro — um export grande não pode derrubar features não relacionadas.
- **Trade-offs aceitos:** Exige que a fonte suporte cursor/paginação estável (sem re-ordenar entre páginas). Um pouco mais de código que um `SELECT *` em array.

### D3. UTF-8 com BOM + locale pt-BR (separador decimal e delimitador)

- **Contexto:** O arquivo é aberto no Excel pt-BR. Encoding e formatação numérica.
- **Decisão:** Escrever UTF-8 **com BOM**; formatar números com o separador decimal do locale pt-BR (vírgula) e usar o delimitador de campo compatível com esse locale; strings com aspas/escape padrão CSV.
- **Justificativa técnica:** Sem BOM, o Excel pt-BR interpreta UTF-8 como Latin-1 e quebra acentos. Com ponto decimal, o Excel pt-BR trata o número como texto ou o corrompe.
- **Justificativa de negócio:** "As pessoas abrem no Excel" é o critério de sucesso declarado pelo usuário — um arquivo que exige importação manual ou mostra números errados é uma entrega quebrada, não um detalhe.
- **Trade-offs aceitos:** O arquivo fica acoplado à convenção pt-BR/Excel; consumidores programáticos (parsers que esperam ponto decimal) precisariam de tratamento. Aceito porque o consumidor declarado é o Excel pt-BR. Revisar se surgir consumo por integração/API.

### D4. Export aplica o mesmo filtro de permissão por linha que a tela

- **Contexto:** A tela de relatórios aplica permissão por linha (o usuário vê só as linhas às quais tem acesso). Uma query de export ingênua rodaria sem esse filtro.
- **Decisão:** O export usa exatamente a mesma query permissionada da visualização (`PermittedRowQuery`); nenhuma consulta de export bypassa o filtro de permissão.
- **Justificativa técnica:** Um export que reconsulta a tabela base sem o predicado de permissão vaza linhas que o usuário não pode ver na tela — um vazamento de dados silencioso, invisível na UI.
- **Justificativa de negócio:** Vazamento de PII/linhas restritas é risco de compliance e confiança, não um bug cosmético. O export deve ser tão restrito quanto a tela, por construção.
- **Trade-offs aceitos:** Impede uma otimização de "query mais simples" no export. Aceito — a fronteira de segurança única vale mais que a micro-otimização.

### Decisões táticas

| Decisão | Justificativa |
|---|---|
| D5. Timestamps no timezone do usuário (com rótulo do tz no cabeçalho da coluna) | UTC cru confunde o leitor do relatório; renderizar no tz do usuário casa com o que ele vê na tela. Reversível — se surgir necessidade de tz fixo para auditoria, adicionar coluna UTC separada; gatilho de revisão: pedido de export para conciliação/auditoria. |
| Nome do arquivo inclui filtro/data | Facilita o usuário distinguir múltiplos exports; barato. |

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Export ignora filtro de permissão e vaza linhas restritas (D4) | 3 | 2 | 6 🔴 | Teste de aceitação com usuário de permissão restrita comparando linhas do export vs linhas da tela; `PermittedRowQuery` como única fonte da query de export |
| OOM ao bufferizar dataset grande (D2) | 3 | 2 | 6 🔴 | Streaming por cursor obrigatório; teste de carga com 500k linhas medindo pico de memória |
| Números/acentos corrompidos no Excel pt-BR (D3) | 3 | 2 | 6 🔴 | Teste que abre o arquivo gerado e valida BOM + separador decimal; fixture com acento e número decimal |
| Cursor instável re-ordena entre páginas e duplica/perde linhas | 2 | 2 | 4 🟡 | Ordenação determinística estável (chave única) na query de stream |
| Fila/worker indisponível deixa export "preso em processando" | 2 | 2 | 4 🟡 | Timeout no job + estado de falha visível na UI com opção de reenviar |

## Tratamento de Erros

- Export que falha no meio (DB cai, disco cheio) marca o job como "falhou" e o `ExportReadyNotifier` mostra estado de erro com reenvio — nunca entrega arquivo parcial como se estivesse completo.
- Filtro que resulta em zero linhas gera CSV só com cabeçalho (não é erro).
- Usuário sem permissão a nenhuma linha do filtro recebe arquivo vazio (só cabeçalho), consistente com a tela.

## Testes

- **Segurança (D4):** usuário restrito exporta e recebe exatamente as linhas que a tela mostraria — não mais.
- **Escala (D1/D2):** export de 500k linhas conclui sem OOM (pico de memória medido) e sem timeout na request (a request só enfileira).
- **Locale (D3):** arquivo abre no Excel pt-BR com acentos e separador decimal corretos; fixture cobre acento + número decimal + célula com aspas.
- **Timezone (D5):** timestamp exportado casa com o exibido na tela para o tz do usuário; cabeçalho rotula o tz.
- **Escopo (página vs filtro):** export com filtro aplicado e paginação ativa contém o resultado filtrado completo, não só a página visível.

## Notas de Escopo

Todas as decisões duras surgidas na entrevista estão resolvidas acima. Não há seção de questões em aberto: D1-D4 são estruturais e resolvidos com trade-off; D5 é leaf reversível resolvido com default seguro + gatilho de revisão. O botão em si é trivial; o design é dominado pelo backend do export.
