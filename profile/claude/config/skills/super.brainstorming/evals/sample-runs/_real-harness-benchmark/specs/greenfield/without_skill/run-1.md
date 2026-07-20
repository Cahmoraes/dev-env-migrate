---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — URL Shortener

## Visão Geral

Produto novo (greenfield): um encurtador de links. O usuário cola uma URL longa,
recebe um link curto, e quando alguém clica no link curto é redirecionado para a
URL original. O fundador espera que possa crescer bastante ("milhões de links").

## Características Arquiteturais (prioridades)

1. **Escalabilidade** — o fundador espera milhões de links; o sistema deve
   comportar crescimento no volume de links armazenados.
2. **Performance** — o redirecionamento deve ser rápido ("it should be fast").
3. **Simplicidade de operação** — produto de fundador solo, deve ser simples de
   manter.

## Funcionalidades

- Encurtar uma URL longa em um código curto.
- Links customizados (aliases escolhidos pelo usuário).
- Estatísticas de cliques por link.

## Componentes

- **Gerador de Código Curto** — produz o código curto a partir de um contador
  incremental codificado em base62. Escolhido por gerar códigos curtos e sem
  colisões, em vez de aleatório (que exigiria verificação de unicidade). Random
  só seria necessário se a imprevisibilidade do código importasse — não é o caso.
- **Resolvedor de Redirecionamento** — recebe o código curto, busca a URL
  original e emite o redirect HTTP.
- **Registro de Aliases Customizados** — aliases customizados compartilham o
  mesmo keyspace dos códigos gerados, com verificação de palavra reservada /
  colisão no momento da criação do alias.
- **Contador de Cliques** — registra os cliques de cada link para as estatísticas.

## Fluxo de Dados

1. Criação: URL longa entra → Gerador de Código Curto gera o código (ou o usuário
   fornece um alias customizado, validado contra o keyspace) → par (código, URL)
   é persistido.
2. Redirecionamento: código curto entra → Resolvedor busca a URL → registra o
   clique → redireciona.

## Decisões Arquiteturais

- **Geração de código: contador → base62.** Códigos curtos e livres de colisão
  por construção. Trade-off: previsibilidade/enumerabilidade dos códigos (aceita
  porque unguessability não é requisito declarado).
- **Aliases customizados no mesmo keyspace dos gerados**, com checagem de
  reservado/colisão na criação. Trade-off: precisa validar cada alias, mas evita
  manter dois espaços de nomes separados.

## Riscos

- 🟡 Crescimento para "milhões de links" exigirá atenção ao armazenamento e ao
  índice de busca por código; dimensionar quando o volume se aproximar.

## Testes

- Geração de código produz códigos únicos e curtos.
- Redirecionamento resolve o código correto e retorna o redirect.
- Alias customizado é rejeitado quando colide com código existente ou palavra
  reservada.
- Contagem de cliques incrementa por acesso.
