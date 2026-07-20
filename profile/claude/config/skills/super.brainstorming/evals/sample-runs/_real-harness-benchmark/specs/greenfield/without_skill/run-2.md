---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Encurtador de Links

## Visão Geral

Greenfield. Serviço que transforma URLs longas em links curtos e redireciona os
cliques para o destino original. Expectativa do fundador de chegar a milhões de
links.

## Características Arquiteturais (prioridades)

1. **Escalabilidade** — precisa suportar um volume grande de links conforme o
   produto cresce.
2. **Performance** — redirecionamentos devem ser rápidos.
3. **Baixo custo de manutenção** — fundador solo.

## Funcionalidades

- Encurtamento de URL.
- Links customizados definidos pelo usuário.
- Estatísticas de cliques.

## Componentes

- **Gerador de Código** — usa um contador incremental convertido para base62.
  Escolhido em vez de aleatório porque produz códigos curtos e sem colisão por
  construção; a alternativa aleatória exigiria checagem de unicidade a cada
  escrita e traria códigos mais longos.
- **Serviço de Redirecionamento** — mapeia o código curto de volta para a URL
  original e responde com o redirect.
- **Repositório de Links** — persiste o par código ↔ URL.
- **Registro de Estatísticas** — guarda os cliques de cada link para exibir
  contagens ao dono.

## Fluxo de Dados

1. `POST` com a URL longa → Gerador de Código produz o código → grava no
   Repositório → devolve o link curto.
2. `GET /{código}` → Serviço de Redirecionamento resolve a URL → registra o
   clique → redireciona.

## Decisões Arquiteturais

- **Código curto via contador → base62.** Motivo: códigos curtos, sequenciais e
  sem colisão. Trade-off aceito: os códigos são enumeráveis/previsíveis (não há
  requisito de imprevisibilidade).

## Riscos

- 🟡 O volume-alvo ("milhões de links") pressiona o armazenamento e o índice por
  código; revisitar a estratégia de storage/índice conforme o tráfego cresce.

## Testes

- Gerador produz códigos únicos e curtos em sequência.
- Redirecionamento resolve para a URL correta.
- Links customizados são aceitos e resolvem corretamente.
- Estatísticas de clique incrementam a cada acesso.
