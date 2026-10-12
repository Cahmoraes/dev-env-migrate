---
created_at: "2026-09-08T10:00:00-03:00"
updated_at: "2026-09-08T10:00:00-03:00"
---

# PRD: Sufixo opcional na saudação

## Visão Geral

`greet(name)` hoje devolve `Olá, <name>`. Esta feature adiciona um segundo parâmetro
opcional, `suffix`, anexado ao final da saudação sem espaço, para que chamadores possam
personalizar a mensagem sem duplicar a lógica de formatação. Sem `suffix`, o comportamento
atual precisa ser preservado byte a byte — é uma mudança aditiva sobre uma função já usada
por outros módulos.

## Objetivos

- Permitir anexar um sufixo textual à saudação sem introduzir espaço extra.
- Preservar 100% do comportamento existente de `greet(name)` quando `suffix` é omitido.
- Rejeitar `suffix` não-string com o mesmo padrão de validação já aplicado a `name`.

## Histórias de Usuário

- **US-01** — Como consumidor do módulo de saudação, eu quero anexar um sufixo à mensagem
  de `greet` para que eu possa personalizar saudações automatizadas (ex.: pontuação,
  emoji, marcador de canal) sem reimplementar a formatação · **UI:** não
- **US-02** — Como consumidor do módulo de saudação, eu quero que `greet(name)` sem
  `suffix` continue devolvendo exatamente a saudação padrão para que as integrações que já
  chamam a função hoje não quebrem com a mudança · **UI:** não

## Funcionalidades Principais

### Sufixo opcional anexado sem espaço

`greet(name, suffix)` aceita um segundo parâmetro posicional opcional. Quando informado
como string, é concatenado ao final da saudação sem espaço entre o nome e o sufixo. Quando
informado com um tipo diferente de string, a função lança `TypeError`, no mesmo padrão já
usado pela validação de `name`.

- **FR-001** (US-01) — O sistema deve anexar `suffix` ao final da saudação sem espaço
  quando informado como string (`greet('Ana', '!')` → `Olá, Ana!`), e lançar `TypeError`
  quando `suffix` não for string.

### Preservação do comportamento padrão

Quando `suffix` é omitido, `greet(name)` deve continuar devolvendo `Olá, <name>` sem
nenhuma alteração perceptível — nem espaço extra, nem sufixo vazio visível.

- **FR-002** (US-02) — O sistema deve preservar o comportamento de `greet(name)` quando
  `suffix` é omitido, devolvendo `Olá, <name>` sem alteração em relação ao comportamento
  anterior à feature.

## Experiência do Usuário

Não há interface de usuário: `greet` é uma função de biblioteca consumida
programaticamente por outros módulos Node. A "experiência" relevante é a de quem integra —
a assinatura permanece compatível com chamadas existentes (`greet(name)`), e o novo
parâmetro é estritamente aditivo.

## Restrições Técnicas de Alto Nível

- Nenhuma nova dependência: a mudança é local a `src/greeting.js`.
- Compatibilidade retroativa obrigatória — nenhum chamador existente que passa só `name`
  pode observar mudança de comportamento.
- Validação de tipo de `suffix` segue o mesmo padrão (`TypeError`) já usado para `name`.

## Fora de Escopo

- Internacionalização da saudação (`Olá,` fixo).
- Múltiplos sufixos ou composição de sufixos.
- Qualquer interface de usuário, CLI ou endpoint HTTP em torno de `greet` — a feature é
  puramente a função de biblioteca.
