# Política Corporativa de Gestão de Papéis Administrativos — Segurança da Informação

> Documento normativo do time de Segurança (fonte-de-verdade corporativa).
> Formato interno de Segurança; NÃO segue o template de spec/PRD do produto.
> Aplica-se a qualquer sistema que conceda ou revogue privilégios administrativos.

## ADM-1 — Princípio do menor privilégio

Todo papel administrativo DEVE conceder apenas as permissões estritamente necessárias
à função. Papéis genéricos "superadmin" são proibidos fora de contas de emergência
quebra-vidro (break-glass), que exigem aprovação dupla e expiram em 4 horas.

## ADM-2 — Segregação de funções (SoD)

Quem concede um papel administrativo NÃO pode ser a mesma pessoa que o utiliza.
A concessão e o uso de privilégios elevados DEVEM ser feitos por identidades distintas,
com trilha de auditoria imutável para cada concessão, revogação e uso.

## ADM-3 — Revisão periódica de acessos

Todos os papéis administrativos concedidos DEVEM ser revisados a cada 90 dias.
Acessos sem uso comprovado nos últimos 30 dias DEVEM ser revogados automaticamente.

## ADM-4 — MFA obrigatório

Toda operação administrativa (concessão, revogação, alteração de política) DEVE exigir
re-autenticação com segundo fator no momento da ação, independentemente da sessão ativa.
