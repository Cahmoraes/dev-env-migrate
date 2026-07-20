# Design: Session idle-timeout 15 → 30 min

## Visão Geral

Aumentar o idle-timeout de sessão de usuário de 15 para 30 minutos. É uma
mudança de valor em nível de configuração, single-source e reversível (basta
reverter o valor).

## Características Arquiteturais

**Priorizada (1):** Security — o idle-timeout é um controle de segurança; o novo
valor (30 min) fica dentro da política aceita e não exige revalidação de auth.
Critério mensurável: sessão expira após 30 min de inatividade; não há caminho que
mantenha a sessão viva além disso.

## Decisões Arquiteturais

### D1. Valor do idle-timeout = 30 min, alterado no único ponto de configuração

- **Contexto:** timeout hoje é 15 min, definido num único valor de config.
- **Decisão:** alterar esse valor para 30 min (reversível: reverter o valor).
- **Justificativa de negócio:** menos re-logins por inatividade; sem custo de
  implementação além da troca do valor.
- **Trade-offs aceitos:** janela de exposição de sessão ociosa dobra (aceito —
  confirmado dentro da política de segurança). Não se introduz sliding vs.
  absolute timeout, per-role timeout, nem aviso pré-logout — fora de escopo.

### D2. Nenhum outro consumidor acopla ao literal 15 min (ponta fechada)

- **Contexto:** um único valor de timeout poderia estar duplicado/lido em outro
  lugar (TTL de refresh token, config de load balancer, testes com 15 hardcoded).
- **Decisão:** a task de implementação faz um grep pelo valor/símbolo antes de
  editar; se houver leitor acoplado, alinhá-lo (ou confirmar independência).
- **Trade-offs aceitos:** custo de uma busca; garante que a troca não deixe um
  consumidor com o valor antigo.
