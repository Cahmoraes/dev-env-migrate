---
name: generate-release-tables
description: >
  Gera tabelas de release para relatórios de changelog, consultando arquivos changelog.json e CHANGELOG.md.
  Use quando o usuário pedir tabela de release, relatório de versões, release notes para stakeholders,
  resumo de sprint, histórico de entregas, ou frases como "gerar tabela de changelog",
  "o que saiu nessa versão", "quais features foram liberadas", "tabela para o cliente",
  "relatório de lançamento", "resumo das releases". Suporta dois modelos de saída:
  Técnico (para desenvolvedores) e de Negócio (para analistas de negócio).
  NÃO use para criar ou editar commits, alterar changelog, gerar documentação de código ou fazer code review.
---

## Pré-condições

Verifique se `changelog.json` e/ou `CHANGELOG.md` existem no repositório antes de qualquer ação.

- Se **nenhum** dos dois existir, informe ao usuário e encerre — não é possível continuar.
- Se **apenas um** existir, continue usando-o como única fonte.
- Se **ambos** existirem, aplique a **Resolução de Fontes** abaixo.

## Resolução de Fontes

Quando ambos os arquivos existirem, use a seguinte estratégia para evitar duplicidade e inconsistências:

1. Trate `changelog.json` como **fonte primária** (estrutura mais confiável).
2. Use `CHANGELOG.md` para complementar campos ausentes no JSON (ex: descrições narrativas).
3. Deduplicar entradas usando `versão + hash do commit` como chave única.
4. Se houver conflito de dados (ex: datas diferentes para o mesmo commit), priorize `changelog.json` e informe ao usuário sobre a discrepância.

## Workflow

Execute os passos em ordem, aguardando cada resposta do usuário antes de avançar.

**Passo 1 — Determinar o período disponível**
Leia os arquivos identificados e determine a data mais antiga e a mais recente nos registros.
Informe esse intervalo ao usuário para orientar a escolha do período do relatório.
Faça essa leitura diretamente do conteúdo dos arquivos — sem executar comandos auxiliares para inferir datas.

**Passo 2 — Entrevistar o usuário (sequencial)**
Faça as duas perguntas abaixo uma de cada vez, aguardando a resposta antes de prosseguir:
1. Qual o período desejado para o relatório? (data de início e data de fim)
2. O relatório é para **Stakeholders Técnicos** ou de **Negócio**?

**Passo 3 — Validar dados no período**
Antes de gerar a tabela, valide:
- O formato das datas é válido.
- A data de início não é posterior à data de fim.
- As datas estão dentro do intervalo disponível nos arquivos.
- Existem entradas nos arquivos de changelog para o período informado.

Se a validação falhar, explique o motivo e peça que o usuário informe um novo período.

**Passo 4 — Gerar o relatório**
Com base na escolha do tipo de tabela, gere o relatório no formato correspondente.
Filtre apenas os commits dentro do período solicitado e aplique a **Classificação de Commits**.

**Passo 5 — Exportar CSV**
Ao final, gere o conteúdo do CSV diretamente na resposta, com os mesmos dados da tabela gerada,
no seguinte formato de arquivo: `release-report-INICIO_FIM.csv` (ex: `release-report-2025-01-01_2025-03-31.csv`).

## Tabela Técnica (Desenvolvedores)

Use quando o usuário escolher "Técnico":

| **Versão** | **Feature/Alteração** | **Descrição Técnica** | **ID do Commit** | **Título Original** |
|------------|------------------------|------------------------|------------------|----------------------|

## Tabela de Negócio (Analistas)

Use quando o usuário escolher "Negócio":

| **Versão** | **Novidade** | **Descrição de Impacto no Negócio** | **ID do Commit** | **Título Original** |
|------------|--------------|-------------------------------------|------------------|----------------------|

## Classificação de Commits

Aplique esta classificação ao preencher ambas as tabelas.
Use apenas os prefixos **realmente encontrados** nas entradas do changelog — não invente mapeamentos ausentes.

| **Prefixo** | **Classificação Técnica** | **Classificação de Negócio** |
|-------------|---------------------------|-------------------------------|
| `feat`      | Nova funcionalidade        | Nova funcionalidade disponível |
| `fix`       | Correção de bug            | Correção de problema           |
| `perf`      | Melhoria de performance    | Melhoria de desempenho         |
| `refactor`  | Refatoração interna        | Sem impacto para o negócio     |
| `docs`      | Documentação               | Sem impacto para o negócio     |
| `test`      | Testes automatizados       | Sem impacto para o negócio     |
| `chore`     | Tarefas de manutenção      | Sem impacto para o negócio     |
| `style`     | Ajuste visual/estético     | Ajuste de interface            |
| `ci`        | Integração contínua        | Sem impacto para o negócio     |
| `build`     | Configuração de build      | Sem impacto para o negócio     |
| `revert`    | Reversão de mudança        | Reversão de funcionalidade     |

Se um commit não tiver prefixo reconhecível, classifique como **Sem classificação** e preserve o título original.

## Regras de Integridade

- Use apenas dados presentes nos arquivos — nunca invente versões, commits ou datas.
- Preserve o hash original de cada commit.
- Organize da versão mais recente para a mais antiga.
- Se a versão for `null`, classifique como **Unreleased** e posicione no topo da tabela.
- Agrupe múltiplas alterações da mesma versão sem alterar a ordem interna dos commits.
- Não adicione emojis nas respostas.
