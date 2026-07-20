# Design Spec — Migração React legado (class + Redux + bundle único) → hooks + Module Federation

## Visão Geral

App React 16 de 5 anos, revenue-critical, não pode congelar entregas. Objetivo: modernizar para function components + hooks e dividir via Module Federation para squads deployarem de forma independente. A migração é incremental (strangler-fig): shell hospeda o app antigo e vai absorvendo rotas para ilhas novas, sem janela de freeze. Old e new coexistem por uma janela indeterminada; o design fecha como essa coexistência sobrevive (roteamento, estado compartilhado, build).

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Continuous deployability | App é revenue-critical; "não podemos parar de entregar" é a restrição-raiz que elimina big-bang | Nenhuma etapa da migração exige freeze; cada rota migra e faz deploy isoladamente sem tocar o restante |
| Independent deployability | Squads deployam sem coordenar; é o requisito que justifica Module Federation | Remote de uma squad publica sem rebuild do host nem dos outros remotes |
| Reliability na fronteira de coexistência | Old↔new dividem estado e URL durante a janela; é onde a migração realmente quebra | Estado do Redux legado permanece fonte única de verdade; navegação old↔new não perde nem duplica history |

**Consideradas, não priorizadas:** performance de bundle inicial (MF adiciona overhead de runtime aceitável frente ao ganho de deploy), i18n (fora do escopo desta migração).

## Decisões Arquiteturais

### D1. Estratégia de migração: strangler-fig (não big-bang)

- **Contexto:** App de 5 anos, revenue-critical. Alternativas: strangler-fig (incremental, rota a rota) vs big-bang (reescrita + cutover com janela de freeze).
- **Decisão:** Strangler-fig. O shell embrulha o app antigo e estrangula rotas para ilhas novas, uma de cada vez.
- **Justificativa técnica:** Permite migrar em incrementos verificáveis, cada um deployável sozinho; nunca há um estado "meio-migrado, indeployável".
- **Justificativa de negócio:** A restrição "não podemos parar de entregar features" torna qualquer janela de freeze inviável — big-bang está eliminado por essa restrição, não por preferência.
- **Trade-offs aceitos:** Uma janela de coexistência old↔new de duração indeterminada, com o custo de manter duas convenções (routing, estado) em paralelo enquanto durar. Sem subárvore de big-bang (nenhuma pergunta de tamanho de freeze-window é relevante).

### D2. Fronteira de compatibilidade: route-level (não component-level)

- **Contexto:** Filho de D1. Onde old e new coexistem: uma rota inteira é de um lado, ou pode-se misturar old/new no meio de uma árvore de componentes?
- **Decisão:** Route-level. Cada rota é **ou** old **ou** new, nunca misturada no meio da árvore. A unidade de migração é a rota.
- **Justificativa técnica:** Fronteira nítida elimina a classe de bugs de árvores híbridas (contexts atravessando o limite old/new, ciclos de vida class/hooks entrelaçados). Um limite por rota é auditável e testável.
- **Justificativa de negócio:** Migração previsível — a squad dona de uma rota a migra inteira e sabe exatamente o blast radius (uma rota), não um fragmento acoplado.
- **Trade-offs aceitos:** Não dá para migrar "meia rota" para ganho rápido; a granularidade mínima é a rota inteira. Aceito em troca da fronteira limpa.

### D3. Estado compartilhado na fronteira: bridge do Redux legado (não duplicar)

- **Contexto:** Filho de D2. As ilhas novas precisam do estado que hoje vive no Redux legado. Alternativas: duplicar o Redux nas ilhas vs fazer bridge do store existente via adapter fino.
- **Decisão:** Bridge. As ilhas novas leem o Redux legado através de um adapter fino (hooks `useLegacyState`/dispatch); o store legado permanece a fonte única de verdade.
- **Justificativa técnica:** Uma única fonte de verdade elimina divergência de estado old↔new — a classe de bug mais cara de uma coexistência longa. O adapter é o único ponto de acoplamento e é descartável quando a rota old some.
- **Justificativa de negócio:** Sem reconciliação de dois stores, sem bugs de "a tela nova mostra saldo diferente da antiga"; menor superfície de suporte durante a janela.
- **Trade-offs aceitos:** As ilhas ficam acopladas ao shape do Redux legado enquanto ele existir; esse acoplamento é intencional e localizado no adapter, removido junto com a última rota old.

### D4. Ownership de roteamento na coexistência: shell delega (não dois routers)

- **Contexto:** Filho de D1. Enquanto old e new coexistem, quem é dono da URL/history? Router antigo, router novo, ou um shell que delega?
- **Decisão:** O shell é dono do roteamento top-level e **delega** para o app old ou para a ilha new conforme a rota. Nem o router legado nem o router novo disputam o history.
- **Justificativa técnica:** Um único dono do history evita a briga clássica de dois routers (pushes duplicados, back-button quebrado). Old e new recebem sub-árvores de rota, não o controle do history global.
- **Justificativa de negócio:** Navegação confiável durante toda a janela — sem regressões de URL que afetam usuários pagantes.
- **Trade-offs aceitos:** O router legado precisa ser rebaixado a sub-router montado pelo shell (uma adaptação no app antigo). Aceito: é o preço de um history coerente.

### D5. Integração de build: Module Federation desde o início (não bundle único de transição)

- **Contexto:** Filho de D1. Como o split é construído/deployado durante a transição: MF host/remotes desde já, ou bundle único até o fim?
- **Decisão:** Module Federation desde o início — o shell é o host, as squads publicam remotes. Não há fase intermediária de bundle único.
- **Justificativa técnica:** MF é a própria mecânica do deploy independente; adotá-lo desde o primeiro incremento evita uma re-arquitetura de build no meio do caminho.
- **Justificativa de negócio:** O deploy independente por squad — o objetivo declarado — só existe com MF; adiá-lo adiaria o benefício central da migração.
- **Trade-offs aceitos:** Overhead de runtime do MF (shared deps, versionamento de módulos remotos) desde o dia 1, mesmo com um único remote. Aceito frente ao ganho de deploy independente.

### D6. Biblioteca de estado no lado novo: Context agora (leaf reversível) — revisar para Zustand se surgir estado cross-tree

- **Contexto:** Filho de D3. Dentro de uma ilha nova, o estado **local da ilha** (não o legado, que vem por bridge) precisa de um mecanismo. Alternativas: React Context, Zustand, ou manter Redux.
- **Decisão:** **Context agora.** Cada ilha usa React Context para seu estado local. Este é o default seguro e reversível, adotado deliberadamente — não um item deixado em aberto.
- **Justificativa técnica:** Nas ilhas atuais o estado é local à árvore da rota (fronteira route-level de D2), exatamente o caso que Context resolve sem dependência extra. Zustand só se paga quando há estado compartilhado *cross-tree* entre ilhas irmãs, que a arquitetura route-level ainda não produz.
- **Justificativa de negócio:** Zero dependência nova e zero migração de estado agora; a escolha é reversível a baixo custo — trocar Context por Zustand numa ilha é local a essa ilha.
- **Trade-offs aceitos / gatilho de revisão:** Context re-renderiza a subárvore inteira em cada update — aceitável no volume atual de estado por ilha. **Gatilho de revisão:** adotar Zustand assim que aparecer estado compartilhado *cross-tree* entre ilhas (ex.: D3 forçar estado novo que duas ilhas irmãs leem), ou quando o custo de re-render de Context virar gargalo medido. Um commit prematuro a uma migração Zustand agora seria over-build (leaf-first) e está explicitamente descartado.

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Time não domina Module Federation (shared deps, versionamento de remotes) | 3 | 3 | 9 🔴 | Spike de 1 dia na task-01 (host+1 remote mínimo) antes de decompor o resto; par com dev que já usou MF |
| Router legado resiste a virar sub-router montado pelo shell (acoplamento ao history global) | 3 | 2 | 6 🔴 | Prova de conceito de delegação na task-02 antes de migrar qualquer rota real; scenario test de back/forward old↔new |
| Adapter de bridge vaza shape do Redux e acopla ilhas além do previsto | 2 | 2 | 4 🟡 | Adapter com interface mínima e testada; revisão de cada novo campo exposto |
| Context re-render vira gargalo antes do gatilho de revisão ser percebido | 2 | 1 | 2 🟢 | Gatilho de D6 documentado; medir re-render na task-04; trocar por Zustand é local à ilha |

## Testes

- Cada incremento (rota migrada) é deployável e verificável isoladamente — critério de continuous deployability.
- Scenario test da fronteira de coexistência: navegar old→new→old preservando history (D4), ilha lendo estado legado via bridge sem divergência (D3).
- Teste de deploy independente: publicar um remote sem rebuild do host (D5).
- Teste de estado local de ilha via Context, com asserção de que nenhuma dependência de estado global nova foi introduzida (D6).
