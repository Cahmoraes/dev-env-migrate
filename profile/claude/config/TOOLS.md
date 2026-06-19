## Ferramentas de Busca — Hierarquia de Uso

### ast-grep (`sg`) — busca estrutural em TypeScript/JavaScript

Prefira `sg` a `grep` sempre que a busca for **estrutural** (padrões de AST), não textual.

| Usar `sg` quando... | Usar `grep` quando... |
|---|---|
| Buscar decorators com/sem argumento específico | Buscar texto literal em qualquer tipo de arquivo |
| Encontrar chamadas de função com shape específico | Buscar em não-código (YAML, JSON, Markdown) |
| Localizar padrões com generics ou objetos como argumento | Regex simples sem estrutura de código |
| Análise de distribuição por módulo/bounded context | Busca rápida de string em poucos arquivos |

**Sintaxe essencial:**
```bash
# Wildcards: $VAR = nó AST único | $$$ = sequência de nós (multi-arg, multi-prop)
sg --pattern '@inject($TOKEN)' --lang ts PATH          # decorator com argumento
sg --pattern 'useQuery<$T, $E>({$$$})' --lang ts PATH  # generics + objeto
sg --pattern 'throw new $ERROR($$$)' --lang ts PATH    # qualquer throw
sg --pattern 'PATTERN' --lang ts PATH --json           # saída JSON para análise
```

**Saída `--json`:** retorna array JSON com campos `file`, `range.start.line`, `range.start.column`, `text`.  
Processe sempre via `ctx_execute` (sandbox) para não poluir o contexto com os bytes brutos.

---

### Serena MCP — navegação por símbolo

Chame `mcp__serena__initial_instructions` **antes de iniciar qualquer tarefa de código**.

Use Serena em vez de `Read` ou `grep` nas seguintes situações:

| Situação | Ferramenta Serena |
|---|---|
| "Onde está definida a classe/função X?" | `find_symbol` |
| "Quais classes implementam a interface Y?" | `find_implementations` |
| "Quem chama o método/função Z?" | `find_referencing_symbols` |
| "Quais símbolos existem neste arquivo/diretório?" | `get_symbols_overview` |
| "Onde X é declarado?" | `find_declaration` |
| "Renomear símbolo com segurança em todo o projeto" | `rename_symbol` |
| "Este símbolo pode ser removido com segurança?" | `safe_delete_symbol` |

**Não leia arquivos inteiros** para descobrir o que há neles — use `get_symbols_overview` primeiro.  
**Não faça grep de nome de classe/função** para encontrar onde está definida — use `find_symbol`.
