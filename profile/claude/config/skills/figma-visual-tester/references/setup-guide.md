# Setup Guide — Rotas Temporárias por Framework

Este guia descreve como detectar o framework do projeto e criar uma rota temporária para renderizar uma view isolada, acessível pelo Playwright.

---

## Detecção do Framework

Leia o `package.json` na raiz do projeto:

```bash
# Sinais de Next.js
- Arquivo next.config.js / next.config.ts presente
- "next" nas dependências

# Sinais de Vite + React
- Arquivo vite.config.ts / vite.config.js presente
- "vite" nas devDependencies

# Sinais de CRA (Create React App)
- "react-scripts" nas dependências
- Sem next.config ou vite.config
```

---

## Next.js (App Router)

### Verificar se servidor já está rodando

```bash
curl -s http://localhost:3000 > /dev/null && echo "running" || echo "stopped"
```

### Criar rota temporária

Crie o arquivo `app/_visual-test/page.tsx`:

```tsx
// app/_visual-test/page.tsx
// ROTA TEMPORÁRIA — pode ser removida após validação
import { NomeDoComponenteView } from "@/path/to/component.view"

export default function VisualTestPage() {
  return <NomeDoComponenteView />
}
```

URL de acesso: `http://localhost:3000/_visual-test`

### Subir servidor (se necessário)

```bash
npm run dev &
sleep 5  # aguarda inicialização
```

---

## Next.js (Pages Router)

### Criar rota temporária

Crie o arquivo `pages/_visual-test.tsx`:

```tsx
// pages/_visual-test.tsx
// ROTA TEMPORÁRIA — pode ser removida após validação
import { NomeDoComponenteView } from "@/path/to/component.view"

export default function VisualTestPage() {
  return <NomeDoComponenteView />
}
```

URL de acesso: `http://localhost:3000/_visual-test`

---

## Vite + React

### Verificar se servidor já está rodando

```bash
curl -s http://localhost:5173 > /dev/null && echo "running" || echo "stopped"
```

### Criar rota temporária

Se o projeto usa React Router, adicione temporariamente uma rota no arquivo de rotas principal, ou crie um arquivo de entry point separado:

```tsx
// src/visual-test-entry.tsx
// ROTA TEMPORÁRIA — pode ser removida após validação
import React from "react"
import ReactDOM from "react-dom/client"
import { NomeDoComponenteView } from "./path/to/component.view"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <NomeDoComponenteView />
)
```

Alternativamente, se o projeto tiver React Router DOM, adicione:

```tsx
// Em App.tsx ou router config — TEMPORÁRIO
<Route path="/_visual-test" element={<NomeDoComponenteView />} />
```

URL de acesso: `http://localhost:5173/_visual-test` ou `http://localhost:5173`

### Subir servidor (se necessário)

```bash
npm run dev &
sleep 5  # aguarda inicialização
```

---

## Framework Brasil / Estrutura Customizada

Se o projeto usa uma estrutura própria com um runner customizado:

1. Verifique os scripts disponíveis: `cat package.json | grep -A 20 '"scripts"'`
2. Procure por scripts como `dev`, `start`, `serve`, `storybook`
3. Se houver Storybook, prefira usar uma story existente da view como URL
4. Caso contrário, use o script `dev` padrão e crie uma rota conforme o framework base (Next.js ou Vite)

---

## Portas Padrão

| Framework | Porta padrão |
|-----------|--------------|
| Next.js   | 3000         |
| Vite      | 5173         |
| CRA       | 3000         |
| Storybook | 6006         |

Se a porta padrão estiver ocupada, tente a próxima sequencial (+1).

---

## Limpeza Pós-Validação

Informe sempre ao usuário quais arquivos temporários foram criados:

- `app/_visual-test/page.tsx`
- `pages/_visual-test.tsx`
- Qualquer rota adicionada em arquivos de configuração de rotas

Pergunte se deseja remover os arquivos temporários ao finalizar.
