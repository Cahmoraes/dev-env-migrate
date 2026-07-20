---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Botão de Exportação CSV na Página de Relatórios

## Visão Geral

Exportar o relatório atual como CSV a partir de um botão na página. O pedido veio como "só um botão, baixa a tela em CSV, gente abre no Excel". A entrevista, conduzida como especialista no domínio de exportação de dados, mostrou que três suposições embutidas no pedido escondiam decisões duras: (1) "abre no Excel" não é grátis — encoding e locale pt-BR precisam ser decididos; (2) "a tela" é ambíguo entre página visível e resultado filtrado, e o filtrado pode ser grande; (3) o relatório tem controle de acesso por linha que um export ingênuo ignora.

Ordem em que as decisões foram fechadas na entrevista: comecei pela compatibilidade com Excel (o único sucesso explícito que o usuário nomeou), o que expôs encoding/locale; ao perguntar "e quando o filtro traz muitos registros, é a página ou tudo?" o usuário confirmou "tudo o que o filtro traz" e que isso "às vezes é gigante" — o que tornou o tamanho do dataset o nó raiz e forçou geração assíncrona + streaming. Por fim, ao perguntar "o export enxerga as mesmas linhas que a pessoa vê na tela, ou a tabela toda?", ficou claro que precisa respeitar a permissão por linha.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Correctness (arquivo utilizável no Excel pt-BR) | Sucesso declarado pelo usuário é "abrir no Excel"; foi o primeiro critério nomeado | Arquivo abre no Excel pt-BR sem wizard de importação; acentos íntegros e números reconhecidos como número na coluna |
| Security (respeitar permissão por linha) | O relatório restringe linhas por usuário; export não pode ampliar o acesso | Para um usuário restrito, o conjunto de linhas do export == conjunto da tela; nenhuma linha extra |
| Availability (export grande não derruba o serviço) | Export de dataset grande roda no mesmo backend das outras features | Export no topo da faixa (~500k linhas) não causa OOM nem timeout; memória do gerador permanece limitada |

**Consideradas, não priorizadas:** i18n além de pt-BR (sem outros locales previstos hoje — gatilho: novo mercado); tempo de resposta sub-segundo (irrelevante num fluxo assíncrono).

## Estrutura de Componentes

- **ExportTrigger (endpoint)** — recebe o filtro corrente + contexto do usuário, decide o caminho (ver D1: limiar), e ou serve inline (datasets pequenos) ou enfileira um job (grandes). Retorna download direto ou id de acompanhamento.
- **ScopedResultReader** — executa a consulta do relatório com o mesmo predicado de permissão da visualização, exposto como um stream/cursor. Único ponto que constrói a consulta do export; encapsula a garantia de escopo.
- **StreamingCsvSerializer** — transforma o stream de linhas em bytes CSV incrementais; nunca materializa o conjunto completo. Delega formatação de célula ao encoder de locale.
- **LocaleAwareCellFormatter** — aplica BOM UTF-8 no início, separador decimal e delimitador pt-BR, e converte timestamps para o timezone do usuário. Concentra D3 e D5.
- **DeliveryChannel** — para o caminho síncrono, faz o streaming direto na resposta; para o assíncrono, persiste o arquivo e expõe um link de download quando pronto, sinalizando conclusão ao usuário.

## Decisões Arquiteturais

### D1. Limiar: síncrono para datasets pequenos, assíncrono (job + link) para grandes

- **Contexto:** O resultado filtrado varia de dezenas a ~500k linhas. Um único caminho síncrono trava nos grandes; um único assíncrono penaliza os pequenos com espera desnecessária.
- **Decisão:** Definir um limiar de linhas (estimado por `COUNT`/estimativa antes de gerar). Abaixo dele, stream direto na resposta HTTP. Acima, enfileirar job e entregar via link.
- **Justificativa técnica:** Uma request síncrona de 500k linhas estoura o timeout e prende um worker; um job para 30 linhas é overhead inútil. O limiar coloca cada tamanho no caminho certo.
- **Justificativa de negócio:** Mantém a experiência "clicou, baixou" para o caso comum pequeno, sem sacrificar robustez no caso grande — o export grande é justamente o do admin de poder.
- **Trade-offs aceitos:** Dois caminhos de entrega para manter e testar, e um limiar a calibrar. Aceito porque cada caminho isolado é simples e a UX do caso comum melhora. Alternativa "sempre assíncrono" fica registrada como fallback se o limiar provar difícil de calibrar (gatilho de revisão).

### D2. Serialização em streaming, nunca bufferizada

- **Contexto:** Gerar o CSV completo em memória antes de enviar/gravar.
- **Decisão:** `StreamingCsvSerializer` escreve linha a linha a partir do cursor de `ScopedResultReader`, tanto no caminho síncrono quanto no assíncrono.
- **Justificativa técnica:** Bufferizar 500k linhas causa OOM; streaming mantém uso de memória constante independentemente do tamanho.
- **Justificativa de negócio:** Um export não pode ser capaz de derrubar o backend inteiro — availability é top-3.
- **Trade-offs aceitos:** A consulta precisa de ordenação estável para paginação por cursor consistente. Custo mínimo frente ao risco de OOM.

### D3. UTF-8 com BOM + formatação numérica/decimal pt-BR

- **Contexto:** Consumo declarado é Excel pt-BR.
- **Decisão:** Emitir BOM UTF-8; separador decimal vírgula e delimitador de campo compatível com pt-BR; escaping CSV padrão para aspas/quebras.
- **Justificativa técnica:** Excel pt-BR sem BOM lê UTF-8 como Latin-1 (acentos quebrados); com ponto decimal trata número como texto.
- **Justificativa de negócio:** É o critério de sucesso explícito — um CSV que precisa de importação manual falha o objetivo do usuário.
- **Trade-offs aceitos:** Arquivo otimizado para Excel pt-BR, não para parsers genéricos (que esperam ponto/UTF-8 sem BOM). Revisar se surgir consumo por integração automatizada.

### D4. Escopo de permissão idêntico ao da visualização

- **Contexto:** A tela filtra linhas por permissão do usuário; o export deve fazer o mesmo.
- **Decisão:** `ScopedResultReader` aplica o mesmo predicado de permissão da tela; o export nunca consulta a fonte sem esse filtro.
- **Justificativa técnica:** Sem o predicado, o export retorna linhas fora do escopo do usuário — vazamento invisível na UI.
- **Justificativa de negócio:** Exposição de dados restritos é risco de compliance; o export tem de ser tão restrito quanto a tela, garantido por construção, não por convenção.
- **Trade-offs aceitos:** Nenhuma consulta "simplificada" alternativa para o export. Aceito.

### Decisões táticas

| Decisão | Justificativa |
|---|---|
| D5. Timestamps no timezone do usuário, com o tz indicado no cabeçalho | Consistência com o que a tela mostra; UTC cru confunde o leitor. Reversível — coluna UTC adicional se surgir uso de auditoria; gatilho: requisito de conciliação. |
| Limiar inicial configurável (não hardcoded) | Permite calibrar sem redeploy conforme o perfil real de tamanhos. |

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Export vaza linhas fora da permissão do usuário (D4) | 3 | 2 | 6 🔴 | Teste com usuário restrito: linhas do export == linhas da tela; `ScopedResultReader` como única query |
| OOM em export grande por buffering (D2) | 3 | 2 | 6 🔴 | Streaming obrigatório nos dois caminhos; teste de carga a 500k medindo memória |
| Arquivo ilegível/corrompido no Excel pt-BR (D3) | 3 | 2 | 6 🔴 | Teste que valida BOM e separador decimal abrindo o arquivo gerado |
| Limiar mal calibrado (síncrono recebe dataset grande) | 2 | 2 | 4 🟡 | Estimativa de contagem antes de escolher caminho; limiar conservador e configurável |
| Cursor sem ordenação estável perde/duplica linhas | 2 | 2 | 4 🟡 | Ordenar por chave única determinística no reader |

## Tratamento de Erros

- Caminho assíncrono que falha marca o job como "falhou" e sinaliza reenvio; nunca serve arquivo parcial.
- Caminho síncrono que ultrapassa o limiar durante a geração (estimativa errada) aborta e converte em job assíncrono, informando o usuário.
- Resultado vazio → CSV só com cabeçalho.

## Testes

- **Locale (D3):** abre no Excel pt-BR, acentos e decimais corretos; fixture com acento, decimal e aspas.
- **Segurança (D4):** usuário restrito não obtém linhas extras.
- **Escala (D1/D2):** 500k linhas via caminho assíncrono sem OOM; caminho síncrono respeita o limiar.
- **Timezone (D5):** timestamp do arquivo == timestamp da tela para o tz do usuário.
- **Escopo:** com filtro + paginação, o arquivo traz o resultado filtrado completo.

## Notas de Escopo

Todas as decisões duras da entrevista estão fechadas: D1-D4 estruturais com trade-off registrado; D5 leaf reversível com default + gatilho. Sem seção de questões em aberto — cada ponta tem destino.
