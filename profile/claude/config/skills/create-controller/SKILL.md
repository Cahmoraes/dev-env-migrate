---
name: create-controller
description: Este skill fornece diretrizes explícitas para agentes de IA projetarem Controllers com base na arquitetura estrutural do Framework Brasil. Utilize sempre que for necessários criar um bounded context, estrutura inicial de controller, view e rota.
argument-hint: "[module-name]"
---

# Argumentos
Se não for fornecido o nome do módulo em $module-name, solicite ao usuário que forneça.

## Filosofia Central

Os controllers, `ex.: subscription-details.controller.tsx` fazem parte da camada de aplicação `(Service/Application Layer)`. Seu propósito central é aplicar regras de negócio, gerenciar estado, realizar redirecionamento e tagueamento e por fim renderizar os componentes de View `ex.: subscription-details.view.tsx` com suas respectivas propriedades de entrada.

Exemplo de uma estrutura básica composta pelo Bounded Context `subscription-details`, contendo um controller (`subscription-details.controller.tsx`), uma view (`subscription-details.view.tsx`) e um entry-point que delega o fluxo de execução para o Controller: (`index.page.tsx`):

```markdown
📂 pages
└── 📂 subscription-details
├── 📂 controller
│ └── subscription-details.controller.tsx
├── 📂 view
│ └── subscription-details.view.tsx
└── index.page.tsx
```

### Estrutura do entrypoint `index.page.tsx`:

```tsx
export { SubscriptionDetailsController } from './controller/subscription-details.controller';
```

### Estrutura do Controller:

Exemplo da estrutura básica de um Controller:

```tsx
import { VivoSpaRouterProviderProps } from '@src/routes';
import { SubscriptionDetailsView } from '../../view/subscription-details.view.tsx';

export function SubscriptionDetailsController({ state }: VivoSpaRouterProviderProps) {
  return <SubscriptionDetailsView {...props}>
}
```

### Estrutura da View:

Exemplo da estrutura básica de uma View:

```tsx
import { Box, Text } from '@telefonica/mistica'; // -> system nossa biblioteca de componentes '@telefonica/mistica'
export interface SubscriptionDetailsViewProps {
  // propriedades públicas da interface
}

export function SubscriptionDetailsView({ props }: SubscriptionDetailsViewProps) {
  return <Box><Text regular>SubscriptionDetailsView</Text><Box>
}
```

### Rotas disponíveis na aplicação:

Todas as rotas devem ser definidas no arquivo `/src/utils/enums/routes-url.ts`
Ele contém um objeto com todas as rotas registradas:

```ts
export const RoutesUrls = {
  BASE_URL: '/',
  ERROR_AREA: '/error-area',
  // -> System: Exemplo da rota registrada para SUBSCRIPTION_DETAILS
  SUBSCRIPTION_DETAILS: '/subscription-details',
  // -> Outras rotas omitidas
} as const;
```

### Roteamento dos controllers da aplicação:

Todas os controller devem ser importados no arquivo `/src/routes.tsx`
Este arquivo é responsável por mapear todas as rotas do arquivo `routes-url.ts` para seus respectivos controller que permitirão o sistema de roteamento do `react-router-dom` fazer seu trabalho.

```tsx
import { SubscriptionDetailsController } from './pages/subscription-details/index.page';
import { RoutesUrls } from './utils/enums/routes-url';

export function RouterProvider(props: VivoSpaRouterProviderProps) {
  const routes = [
    {
      path: RoutesUrls.BASE_URL,
      element: <SubscriptionDetailsController {...props} />,
    },
  ];
  // Restante da implementação omitida.
}
```

## Workflow

1 - Use o raciocínio no estilo ReAct: alterne entre “Pensamento:” (seu raciocínio) e “Ação:” (uma etapa ou verificação concreta que você realizaria). Após cada ação, escreva “Observação:” para registrar o que você encontrou. No final, conclua com “Resposta Final:” como a sua correção recomendada.
2 - Para criar um controller é necessário verificar se existe a estrutura de pastas do domínio que está sendo criado: `pages/subscription-details`. Caso já exista, crie apenas o controller `pages/subscription-details/controller/subscription-details.controller.tsx` com sua estrutura básica, e o arquivo de entrypoint `pages/subscription-details/index.page.tsx` apontando para o novo controller criado.
3 - Registrar a rota do controller no arquivo `routes-enum.ts`. Caso ela não esteja registrada, apenas adicione uma nova entrada no objeto `RoutesUrls`.
4 - Importar o novo controller dentro do sistema de roteamento no arquivo: `/src/routes.tsx` para que ele esteja disponível para ser acessado no browser.

## Condições negativas

1 - NÃO crie testes
2 - NÃO modifique outros controllers e views
3 - NÃO crie arquivos temporários
4 - NÃO crie storybook
5 - NÃO consulte outros controllers e views criados para não se basear neles
6 - NÃO modifique variáveis de ambiente
7 - NÃO busque controllers de exemplo
