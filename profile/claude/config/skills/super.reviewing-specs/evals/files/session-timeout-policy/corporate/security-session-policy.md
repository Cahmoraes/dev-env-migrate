# Política Corporativa de Sessão e Autenticação — Segurança da Informação

> Documento normativo do time de Segurança (fonte-de-verdade corporativa).
> Formato interno de Segurança; NÃO segue o template de spec/PRD do produto.
> Qualquer produto que gerencie sessões de usuário DEVE aderir a esta política.

## SEC-1 — Expiração por inatividade (idle timeout)

Toda sessão autenticada DEVE expirar após **15 minutos** de inatividade do usuário.
Este teto é mandatório para sistemas que tocam dados de cliente. Produtos podem usar
um valor MENOR, nunca maior.

## SEC-2 — Tempo de vida absoluto da sessão

Independentemente de atividade, toda sessão DEVE ser encerrada após **8 horas** desde
o login, forçando reautenticação. Sem exceção para "lembrar-me".

## SEC-3 — Re-desafio de MFA em elevação de privilégio

Quando um usuário executa uma ação privilegiada (mudança de papel, acesso a dados de
PII em massa, alteração de configuração de segurança), a sessão DEVE exigir um novo
desafio de MFA, mesmo que a sessão ainda esteja válida pelos critérios SEC-1/SEC-2.

## SEC-4 — Registro de auditoria

Início, expiração e encerramento forçado de sessão DEVEM gerar evento de auditoria
imutável, retido por no mínimo 1 ano.
