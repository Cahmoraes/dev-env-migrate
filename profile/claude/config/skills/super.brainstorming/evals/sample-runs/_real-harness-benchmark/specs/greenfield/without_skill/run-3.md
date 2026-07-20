---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Serviço de Encurtamento de URL

## Visão Geral

Produto greenfield de um fundador solo. Recebe uma URL longa, devolve um link
curto e redireciona quem clica para o destino original. Ambição de escala:
milhões de links.

## Características Arquiteturais (prioridades)

1. **Performance** — o redirecionamento precisa ser rápido, inclusive sob carga.
2. **Escalabilidade** — suportar o crescimento até milhões de links.
3. **Manutenibilidade** — simples o bastante para um fundador solo operar.

## Funcionalidades

- Encurtar URLs.
- Aliases customizados escolhidos pelo usuário.
- Estatísticas de cliques por link.

## Componentes

- **Gerador de Código Curto** — contador incremental codificado em base62.
  Escolhido em vez de aleatório: gera códigos curtos e sem colisão por
  construção. (Aleatório só se a imprevisibilidade do código fosse requisito.)
- **Resolvedor de Redirecionamento** — dado o código curto, recupera a URL
  original e emite o redirect.
- **Gerência de Aliases Customizados** — aliases customizados vivem no mesmo
  keyspace dos códigos gerados; na criação, o alias é validado contra palavras
  reservadas e contra colisão com códigos existentes.
- **Coletor de Estatísticas** — contabiliza os cliques de cada link.

## Fluxo de Dados

1. Criação: URL longa → código gerado (ou alias validado no keyspace) → par
   persistido → link curto retornado.
2. Redirecionamento: código curto → Resolvedor recupera a URL → clique
   contabilizado → redirect emitido.

## Decisões Arquiteturais

- **Geração via contador → base62.** Códigos curtos e sem colisão por construção.
  Trade-off: enumerabilidade dos códigos (aceita — sem requisito de
  imprevisibilidade).
- **Keyspace compartilhado para aliases customizados e gerados**, com checagem de
  reservado/colisão na criação. Trade-off: validação por alias em troca de um
  único namespace.

## Riscos

- 🟡 Manter o redirecionamento rápido sob carga provavelmente exigirá cache dos
  códigos mais acessados; avaliar uma camada de cache conforme o tráfego crescer.
- 🟡 O volume-alvo pressiona armazenamento e índice por código; dimensionar
  quando o volume se aproximar.

## Testes

- Geração de código produz códigos únicos e curtos.
- Redirecionamento resolve o código para a URL correta.
- Alias customizado colidente ou reservado é rejeitado.
- Contagem de cliques incrementa a cada acesso.
