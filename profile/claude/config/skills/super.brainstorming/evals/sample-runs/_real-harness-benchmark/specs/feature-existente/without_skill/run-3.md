---
created_at: 2026-07-07
updated_at: 2026-07-07
---

# Design Spec — Adicionar Rate Limiting

## Problema

Os endpoints `/auth/login` e `/reports` da API NestJS em produção estão sendo
martelados por clientes. Precisamos limitar a taxa de requisições por cliente com
a menor mudança possível.

## Decisões resolvidas

### Identidade do cliente (D1)
- `/reports` e demais rotas autenticadas: **por usuário autenticado**.
- `/auth/login`: como é pré-autenticação, **por IP**.

Recomendação seguida: chave por usuário onde existe sessão, IP como fallback no
login.

### Algoritmo e limites (D4)
**Sliding window**. Limites **diferentes por rota** — `/auth/login` mais estrito
que `/reports`.

Recomendação seguida: sliding window pela suavidade na fronteira da janela.

### Comportamento no bloqueio (D3)
Responder **429 Too Many Requests** com **`Retry-After`**. Rejeição pura, sem
enfileiramento.

## Abordagem

Adotar **`@nestjs/throttler`**: guard aplicado às rotas alvo, com `@Throttle`
configurando limite/janela por endpoint, e um resolvedor de chave que usa o
usuário autenticado quando disponível e o IP caso contrário. Contadores mantidos
no storage padrão em memória da lib.

Alternativa considerada: implementação manual com contadores próprios — mais
esforço para replicar o que a lib entrega, descartada.

## Componentes

- **Throttler guard** — aplica o limite nas rotas alvo.
- **Resolvedor de chave** — usuário autenticado ou IP.

## Fluxo

Request → resolver chave → checar/incrementar contador da janela → 429 +
`Retry-After` se acima, senão segue.

## Testes

- Resolução de chave por rota.
- 429 + `Retry-After` ao exceder o limite.
- Limites distintos entre `/auth/login` e `/reports`.

## Pontos a definir

- Os números exatos de limite e tamanho de janela por rota serão calibrados com o
  time a partir da observação do tráfego (ex.: `/auth/login` ~5/min, `/reports`
  ~60/min como ponto de partida).

## Riscos

- Limites mal calibrados podem afetar usuários legítimos; ajustar após medir o
  tráfego real.
