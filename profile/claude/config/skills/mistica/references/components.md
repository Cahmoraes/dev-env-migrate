# Catálogo Completo de Componentes Mistica

> Fonte: https://github.com/Telefonica/mistica-web/blob/master/doc/components.md
> Todos os componentes são importados de `@telefonica/mistica`.

## TOC

- [Buttons](#buttons)
- [Text e Títulos](#text-e-títulos)
- [Cards](#cards)
- [Lists](#lists)
- [Navigation](#navigation)
- [Headers](#headers)
- [Feedback](#feedback)
- [Empty States](#empty-states)
- [Loading States](#loading-states)
- [Outros Componentes](#outros-componentes)
- [Icons](#icons)
- [Hooks](#hooks)

---

## Buttons

### Variantes

| Componente | Uso |
|---|---|
| `ButtonPrimary` | Ação primária |
| `ButtonSecondary` | Ação secundária |
| `ButtonDanger` | Ação destrutiva |
| `ButtonLink` | Botão estilizado como link |
| `ButtonLinkDanger` | Botão danger estilizado como link |

### Props de Interação (mutuamente exclusivas)

- `onPress={() => {}}` — click handler
- `href="https://..."` — link externo (adicione `newTab` para target blank)
- `to="/path"` — navegação client-side
- `submit` — botão de submit de formulário (use dentro de `<Form>`)

### Props Comuns

- `small` — tamanho menor
- `disabled` — estado desabilitado
- `showSpinner` / `loadingText` — estado de loading
- `StartIcon` / `EndIcon` — componentes de ícone
- `trackingEvent` — evento de analytics
- `trackEvent` — tracking automático padrão

```tsx
<ButtonPrimary onPress={() => console.log('clicado')}>Ação</ButtonPrimary>
<ButtonSecondary href="https://example.com" newTab>Abrir link</ButtonSecondary>
<ButtonPrimary submit>Enviar formulário</ButtonPrimary>
<ButtonPrimary small StartIcon={IconSearchRegular} onPress={() => {}}>Buscar</ButtonPrimary>
```

### ButtonGroup

Agrupa até 3 botões (primary + secondary + link):

```tsx
<ButtonGroup
  primaryButton={<ButtonPrimary onPress={() => {}}>Primário</ButtonPrimary>}
  secondaryButton={<ButtonSecondary onPress={() => {}}>Secundário</ButtonSecondary>}
  link={<ButtonLink onPress={() => {}}>Link</ButtonLink>}
/>
```

### IconButton / ToggleIconButton

```tsx
<IconButton
  aria-label="Buscar"
  onPress={() => {}}
  Icon={IconSearchRegular}
/>

<ToggleIconButton
  checkedProps={{Icon: IconHeartFilled, 'aria-label': 'Remover dos favoritos'}}
  uncheckedProps={{Icon: IconHeartRegular, 'aria-label': 'Adicionar aos favoritos'}}
  checked={isFavorite}
  onChange={setIsFavorite}
/>
```

### TextLink

```tsx
<TextLink href="https://example.com">Link externo</TextLink>
<TextLink to="/pagina">Link interno</TextLink>
<TextLink onPress={() => {}}>Texto clicável</TextLink>
```

---

## Text e Títulos

### Componentes de Texto

`Text1` até `Text10` renderizam texto em tamanhos progressivamente maiores. `Text1`-`Text4` aceitam prop `weight`.

Props comuns: `color`, `truncate`, `textAlign`, `as` (HTML tag), `wordBreak`, `decoration`, `transform`.

```tsx
<Text2 regular>Texto corpo regular</Text2>
<Text2 medium>Texto corpo médio</Text2>
<Text3 light color={skinVars.colors.textSecondary}>Texto sutil</Text3>
<Text5>Texto grande de display</Text5>
```

### Títulos

`Title1` até `Title4`. Aceitam `as` (nível de heading), `right` (conteúdo à direita), `id`.

```tsx
<Title1 as="h1">Título da Página</Title1>
<Title2 as="h2" right={<ButtonLink small onPress={() => {}}>Ver tudo</ButtonLink>}>Seção</Title2>
```

---

## Cards

Todos os cards suportam props touchable (`onPress`, `href`, `to`), botões (`buttonPrimary`, `buttonSecondary`, `buttonLink`) e props de conteúdo (`headline`, `pretitle`, `title`, `subtitle`, `description`, `slot`).

### DataCard

Card de uso geral para exibição de dados. Suporta `size`: `'default'`, `'snap'`, `'display'`.

```tsx
<DataCard
  asset={
    <Circle backgroundColor={skinVars.colors.brandLow} size={40}>
      <IconShopRegular color={skinVars.colors.brand} />
    </Circle>
  }
  headline={<Tag type="promo">Promo</Tag>}
  title="Título do card"
  subtitle="Subtítulo"
  description="Descrição do card"
  buttonPrimary={
    <ButtonPrimary small onPress={() => {}}>Ação</ButtonPrimary>
  }
  buttonLink={
    <ButtonLink small onPress={() => {}}>Link</ButtonLink>
  }
/>
```

### MediaCard

Card com imagem ou vídeo. Suporta `mediaPosition`: `'top'`, `'left'`, `'right'`.

```tsx
<MediaCard
  imageSrc="https://example.com/imagem.jpg"
  mediaAspectRatio="16:9"
  headline={<Tag type="active">Ativo</Tag>}
  pretitle="Pretítulo"
  title="Título do media card"
  description="Descrição"
  buttonPrimary={
    <ButtonPrimary small onPress={() => {}}>Ação</ButtonPrimary>
  }
/>
```

### CoverCard

Card com imagem/vídeo de fundo full-bleed. Suporta `size`: `'default'`, `'display'`.

```tsx
<CoverCard
  imageSrc="https://example.com/capa.jpg"
  headline={<Tag type="promo">Destaque</Tag>}
  title="Título do cover card"
  description="Descrição"
  buttonPrimary={
    <ButtonPrimary small onPress={() => {}}>Ação</ButtonPrimary>
  }
/>
```

### NakedCard

Card sem fundo de container. Suporta `size`: `'default'`, `'snap'`.

```tsx
<NakedCard
  imageSrc="https://example.com/imagem.jpg"
  mediaAspectRatio="16:9"
  title="Naked card"
  description="Descrição"
/>
```

### Cards em Carrosséis

```tsx
<Carousel
  itemsPerPage={{mobile: 1, tablet: 2, desktop: 3}}
  items={[
    <DataCard key="1" title="Card 1" description="Desc" />,
    <DataCard key="2" title="Card 2" description="Desc" />,
  ]}
/>
```

---

## Lists

### RowList / Row (sem borda)

```tsx
<RowList>
  <Row
    asset={
      <Circle backgroundColor={skinVars.colors.brandLow} size={40}>
        <IconMobileDeviceRegular color={skinVars.colors.brand} />
      </Circle>
    }
    title="Título da row"
    description="Descrição"
    onPress={() => {}}
  />
  <Row title="Row simples" href="https://example.com" />
  <Row title="Row com badge" badge={3} onPress={() => {}} />
</RowList>
```

### BoxedRowList / BoxedRow (com container)

Mesma API que RowList/Row mas renderizado dentro de container boxed.

```tsx
<BoxedRowList>
  <BoxedRow title="Row boxed" description="Em container" onPress={() => {}} />
</BoxedRowList>
```

### Variantes de Row (controles à direita)

```tsx
<Row title="Com switch" switch={{defaultValue: false, onChange: (v) => {}}} />
<Row title="Com checkbox" checkbox={{defaultValue: false, onChange: (v) => {}}} />
<Row title="Com radio" radioValue="opcao1" /> {/* Dentro de RadioGroup */}
<Row title="Com chevron" onPress={() => {}} /> {/* Chevron automático */}
<Row title="Com icon button" iconButton={{Icon: IconTrashCanRegular, onPress: () => {}, 'aria-label': 'Deletar'}} />
<Row title="Direita customizada" right={<Text2 regular color={skinVars.colors.textSecondary}>Detalhe</Text2>} />
```

### UnorderedList / OrderedList

```tsx
<UnorderedList>
  <ListItem>Primeiro item</ListItem>
  <ListItem>Segundo item</ListItem>
</UnorderedList>
```

---

## Navigation

### MainNavigationBar

Navegação completa com logo, seções, burger menu em mobile.

```tsx
<MainNavigationBar
  selectedIndex={0}
  sections={[
    {title: 'Home', onPress: () => {}},
    {title: 'Produtos', onPress: () => {}},
  ]}
  right={
    <NavigationBarActionGroup>
      <NavigationBarAction aria-label="Perfil" onPress={() => {}}>
        <Avatar size={32} initials="JD" />
      </NavigationBarAction>
    </NavigationBarActionGroup>
  }
/>
```

### NavigationBar

Barra de navegação simples com botão de voltar.

```tsx
<NavigationBar
  onBack={() => navigate(-1)}
  title="Título da Página"
  right={
    <NavigationBarActionGroup>
      <NavigationBarAction aria-label="Buscar" onPress={() => {}}>
        <IconSearchRegular color="currentColor" />
      </NavigationBarAction>
    </NavigationBarActionGroup>
  }
/>
```

### FunnelNavigationBar

Para fluxos step-by-step.

```tsx
<FunnelNavigationBar
  right={
    <NavigationBarActionGroup>
      <NavigationBarAction aria-label="Fechar" onPress={() => {}}>
        <IconCloseRegular color="currentColor" />
      </NavigationBarAction>
    </NavigationBarActionGroup>
  }
/>
```

### Tabs

```tsx
const [selectedIndex, setSelectedIndex] = React.useState(0);

<Tabs
  selectedIndex={selectedIndex}
  onChange={setSelectedIndex}
  tabs={[{text: 'Tab 1'}, {text: 'Tab 2', Icon: IconSettingsRegular}]}
/>
```

---

## Headers

```tsx
<HeaderLayout
  variant="brand"
  header={
    <Header
      headline={<Tag type="promo">Novo</Tag>}
      pretitle="Seção"
      title="Título da Página"
      description="Descrição"
    />
  }
/>

<MainSectionHeaderLayout>
  <MainSectionHeader
    title="Título da Seção"
    description="Descrição da seção"
    button={<ButtonPrimary onPress={() => {}}>Ação</ButtonPrimary>}
  />
</MainSectionHeaderLayout>
```

---

## Feedback

### FeedbackScreen

```tsx
<SuccessFeedbackScreen
  title="Pagamento concluído"
  description="Seu pagamento foi processado com sucesso"
  primaryButton={<ButtonPrimary onPress={() => {}}>Continuar</ButtonPrimary>}
/>

<ErrorFeedbackScreen
  title="Algo deu errado"
  description="Por favor, tente novamente"
  errorReference="Erro: 5001"
  primaryButton={<ButtonPrimary onPress={() => {}}>Tentar novamente</ButtonPrimary>}
/>

<InfoFeedbackScreen
  title="Informação"
  description="Mensagem informativa"
  primaryButton={<ButtonPrimary onPress={() => {}}>Entendi</ButtonPrimary>}
/>
```

### Dialogs (imperativo)

```tsx
import {alert, confirm, useDialog} from '@telefonica/mistica';

alert({title: 'Título', message: 'Mensagem', acceptText: 'OK'});
confirm({title: 'Confirmar?', message: 'Tem certeza?', acceptText: 'Sim', cancelText: 'Não'});

const {dialog} = useDialog();
dialog({title: 'Título', message: 'Mensagem', acceptText: 'Aceitar', cancelText: 'Cancelar'});
```

### Snackbar

```tsx
const {openSnackbar} = useSnackbar();

openSnackbar({
  message: 'Item salvo',
  type: 'INFORMATIVE',
  buttonText: 'Desfazer',
  withDismiss: true,
});
```

---

## Empty States

```tsx
<EmptyState
  largeImageUrl="https://example.com/empty.png"
  title="Nenhum resultado encontrado"
  description="Tente um termo diferente"
  button={<ButtonPrimary onPress={() => {}}>Buscar novamente</ButtonPrimary>}
/>

<EmptyStateCard
  asset={<IconBoxLight size="100%" color={skinVars.colors.brand} />}
  title="Seção vazia"
  description="Nada aqui ainda"
  button={<ButtonPrimary small onPress={() => {}}>Adicionar</ButtonPrimary>}
/>
```

---

## Loading States

### Skeletons

```tsx
<SkeletonLine width="60%" />          {/* Linha única */}
<SkeletonText />                       {/* Parágrafo multi-linha */}
<SkeletonCircle size={48} />           {/* Círculo (avatar) */}
<SkeletonRow />                        {/* Círculo + linha */}
<SkeletonRectangle width={200} height={150} />  {/* Retângulo */}
```

### LoadingScreen / Spinner

```tsx
<LoadingScreen />
<BrandLoadingScreen texts={['Carregando...', 'Quase lá...', 'Pronto!']} />
<Spinner size={24} />
```

---

## Outros Componentes

### Tag

```tsx
<Tag type="promo">Promo</Tag>
<Tag type="success" Icon={IconCheckRegular}>Sucesso</Tag>
<Tag type="error" small>Erro</Tag>
```

Tipos: `'promo'`, `'info'`, `'active'`, `'inactive'`, `'success'`, `'warning'`, `'error'`

### Chip

```tsx
<Chip onClose={() => {}}>Chip removível</Chip>
<Chip active>Toggle ativo</Chip>
<Chip Icon={IconFilterRegular} onPress={() => {}}>Filtro</Chip>
```

### Badge

```tsx
<Badge value={3}>
  <IconBellRegular />
</Badge>
```

### Callout

```tsx
<Callout
  title="Aviso importante"
  description="Mensagem de callout"
  asset={<IconInfoRegular color={skinVars.colors.brand} />}
  button={<ButtonPrimary small onPress={() => {}}>Ação</ButtonPrimary>}
  onClose={() => {}}
/>
```

### Hero

```tsx
<Hero
  background="brand"
  media={<Image src="https://example.com/hero.jpg" aspectRatio="16:9" />}
  headline={<Tag type="promo">Novo</Tag>}
  title="Título Hero"
  description="Descrição"
  button={<ButtonPrimary onPress={() => {}}>Começar</ButtonPrimary>}
  desktopMediaPosition="right"
/>
```

### Carousel / Slideshow

```tsx
{/* Carousel: dentro de ResponsiveLayout */}
<Carousel
  itemsPerPage={{mobile: 1, tablet: 2, desktop: 3}}
  withBullets
  items={cards.map((card, i) => <DataCard key={i} {...card} />)}
/>

{/* Slideshow: FORA de ResponsiveLayout (full-width) */}
<Slideshow
  withBullets
  autoplay={{time: 5000, loop: true}}
  items={slides}
/>
```

### Avatar / Image / Video

```tsx
<Avatar size={64} src="https://example.com/avatar.jpg" />
<Avatar size={40} initials="JD" />
<Badge value={3}><Avatar size={40} initials="ML" /></Badge>

<Image src="https://example.com/foto.jpg" aspectRatio="16:9" />
<Image src="https://example.com/avatar.jpg" circular width={100} />
<Video src="https://example.com/video.mp4" aspectRatio="16:9" />
```

### ProgressBar / Stepper

```tsx
<ProgressBar progressPercent={60} />
<ProgressBarStepped currentStep={2} steps={4} />
<Stepper currentIndex={1} steps={['Carrinho', 'Entrega', 'Pagamento', 'Pronto']} />
```

### Timeline

```tsx
<Timeline>
  <TimelineItem title="Passo 1" description="Concluído" asset="1" status="done" />
  <TimelineItem title="Passo 2" description="Em andamento" asset="2" status="active" />
  <TimelineItem title="Passo 3" description="Pendente" asset="3" status="inactive" />
</Timeline>
```

### Table

```tsx
<Table
  heading={['Nome', 'E-mail', 'Status']}
  content={[
    ['João Silva', 'joao@example.com', <Tag type="active">Ativo</Tag>],
    ['Maria Santos', 'maria@example.com', <Tag type="inactive">Inativo</Tag>],
  ]}
/>
```

### Drawer

```tsx
const [isOpen, setIsOpen] = React.useState(false);

<Drawer
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Título do drawer"
  subtitle="Subtítulo"
  button={<ButtonPrimary onPress={() => setIsOpen(false)}>Ação</ButtonPrimary>}
  secondaryButton={<ButtonSecondary onPress={() => setIsOpen(false)}>Cancelar</ButtonSecondary>}
>
  <Stack space={16}>
    <Text2 regular>Conteúdo do drawer</Text2>
  </Stack>
</Drawer>
```

### Accordion

```tsx
<Accordion>
  <AccordionItem title="Pergunta 1">Resposta 1</AccordionItem>
  <AccordionItem title="Pergunta 2">Resposta 2</AccordionItem>
</Accordion>

<BoxedAccordion>
  <BoxedAccordionItem title="Pergunta 1">Resposta 1</BoxedAccordionItem>
</BoxedAccordion>
```

### Tooltip / Popover

```tsx
<Tooltip target={<IconButton Icon={IconInfoRegular} aria-label="Info" />}>
  Conteúdo do tooltip
</Tooltip>

<Popover
  target={<IconButton Icon={IconInfoRegular} aria-label="Info" />}
  title="Título"
  description="Descrição"
/>
```

### Counter / Rating / Meter

```tsx
<Meter value={75} max={100} />
<Rating value={4} max={5} />
<InfoRating value={4.5} count={128} />
<Counter value={count} onChange={setCount} min={0} max={10} />
```

---

## Icons

Mistica possui ~2000 ícones no padrão `Icon{Nome}{Variante}`:

- Variantes: `Regular`, `Filled`, `Light`
- Props: `size` (number) e `color` (string)

```tsx
import {IconSearchRegular, IconHeartFilled, IconInfoLight} from '@telefonica/mistica';

<IconSearchRegular size={24} color={skinVars.colors.neutralHigh} />
<IconHeartFilled size={24} color={skinVars.colors.error} />
```

Use `color="currentColor"` quando o ícone deve herdar a cor do pai (dentro de botões, navegação, etc.).

---

## Hooks

| Hook | Retorna | Uso |
|---|---|---|
| `useTheme()` | Theme context + `t()` | Acessar config do tema, traduzir tokens de texto |
| `useScreenSize()` | `{isMobile, isTablet, isDesktop, isDesktopOrBigger, ...}` | Renderização responsiva |
| `useDialog()` | `{alert, confirm, dialog}` | Mostrar dialogs imperativos |
| `useSnackbar()` | `{openSnackbar}` | Mostrar notificações snackbar |
| `useForm()` | Form context | Lógica avançada de formulário |
| `useThemeVariant()` | String da variante atual | Verificar variante de contexto |
| `useIsInViewport({ref})` | boolean | Detectar se elemento está visível |
| `useElementDimensions({ref})` | `{width, height}` | Obter dimensões do elemento |
| `useWindowSize()` | `{width, height}` | Dimensões da janela |
