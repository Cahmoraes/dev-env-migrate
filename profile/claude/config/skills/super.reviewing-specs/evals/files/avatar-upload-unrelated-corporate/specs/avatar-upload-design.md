---
feature: avatar-upload
created_at: 2026-05-02T10:00:00-03:00
updated_at: 2026-05-02T10:00:00-03:00
---

# Design — Upload de avatar do usuário

## 1. Escopo

Permitir que o usuário autenticado envie, troque e remova sua foto de perfil (avatar).
Feature de perfil pessoal do próprio usuário — **não** toca papéis, permissões ou
qualquer superfície administrativa.

## 2. Componentes

| Componente | Papel | Mudança |
|---|---|---|
| `AvatarUploadField` (React + Mistica) | seleção + preview do arquivo no perfil | novo |
| `useAvatarUpload` (hook) | orquestra upload, progresso, erro | novo |
| `AvatarController.upload()` (NestJS) | recebe o arquivo, valida, delega ao storage | novo |
| `AvatarStorageService.put()` / `.delete()` | grava/remove no bucket de objetos | novo |

## 3. Decisões arquiteturais

- **D1 — Validação no servidor é a fonte de verdade.** O cliente pré-valida
  (tipo/ tamanho) para UX, mas `AvatarController.upload()` **revalida**: apenas
  `image/png` e `image/jpeg`, máximo 2 MB. Alternativa rejeitada: confiar na validação
  do cliente (trivialmente burlável). Trade-off: dupla validação, custo desprezível.
- **D2 — Substituição idempotente por `userId`.** O avatar é gravado numa chave
  determinística (`avatars/{userId}`), então reenviar substitui sem acumular lixo.
  Duplicatas de upload são **toleradas** — a última escrita vence; não há necessidade
  de dedupe store nem versionamento (YAGNI para uma foto de perfil).
- **D3 — Remoção é reversível pela re-upload, não por soft-delete.** Remover o avatar
  apaga o objeto e limpa o campo `avatarUrl` do usuário. Descartado soft-delete/lixeira:
  o usuário pode simplesmente reenviar; reter binários removidos violaria minimização.

## 4. Contratos de dados

- Requisição: `multipart/form-data` com campo `file`.
- Resposta de sucesso: `{ avatarUrl: string }` (URL pública do objeto).
- Erros: `400` (tipo/tamanho inválido, com código `INVALID_AVATAR`), `401` (não autenticado).

## 5. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Upload de arquivo malicioso disfarçado de imagem | Revalidação de `content-type` **e** sniffing de magic bytes no servidor antes de gravar (D1). |
| Objeto órfão no bucket após falha parcial | Escrita idempotente por `userId` (D2): uma re-tentativa sobrescreve; nenhuma chave nova é criada. |

## 6. Tabela de testes

| Teste | Cobre |
|---|---|
| `AvatarController` rejeita `image/gif` com `400 INVALID_AVATAR` | D1 |
| `AvatarController` rejeita arquivo > 2 MB | D1 |
| Re-upload sobrescreve `avatars/{userId}` sem criar chave nova | D2 |
| Remoção limpa `avatarUrl` e apaga o objeto | D3 |

## 7. Operabilidade

- Sem novos recursos de longa vida (sem conexão persistente, sem listener a limpar).
- Observabilidade: log estruturado em falha de storage (`avatar.upload.failed` com `userId`).
- Estados de UI: `AvatarUploadField` cobre `idle` / `uploading` (com progresso) / `error`
  (mensagem i18n `profile.avatar.error`) / `success`.
