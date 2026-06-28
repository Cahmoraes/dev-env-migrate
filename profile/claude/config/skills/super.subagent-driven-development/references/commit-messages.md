# Suggesting Commit Messages

After a task's code quality review is approved, provide the developer a ready-to-copy git command block with the staged files and commit message. The developer executes it — your role is an accurate, copy-paste-ready command.

**Output format** — always render a shell code block:
```sh
git add <arquivo1> <arquivo2> ...
git commit -m "tipo(escopo): descrição em português no imperativo"
```

Use the file list from the implementer's report for `git add`. List files explicitly — never `git add .` or `git add -A`.

**Commit message format:** `tipo(escopo): descrição em português no imperativo`

**Common types:**
- `feat` — nova funcionalidade
- `fix` — correção de bug
- `refactor` — refatoração sem mudança de comportamento observável
- `test` — adição ou ajuste de testes
- `docs` — atualização de documentação
- `chore` — tarefas de manutenção, build, CI

**Guidelines:**
- `scope` reflects the module, feature, or file area changed
- Subject line under 72 characters
- Imperative mood: "adicionar", "corrigir", "extrair" — not "adicionado"/"adicionando"
- If the task warrants a body (breaking change, multi-concern), add it after a blank line

**Example:**
```sh
git add src/auth/jwt.ts src/auth/jwt.test.ts
git commit -m "feat(auth): implementar autenticação com JWT"
```
