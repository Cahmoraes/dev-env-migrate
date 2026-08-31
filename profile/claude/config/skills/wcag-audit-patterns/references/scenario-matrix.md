# Matriz de cenários

Lista **fechada** das 255 verificações que compõem uma auditoria completa: 55 critérios,
cada um decomposto nos cenários que precisam de veredito individual.

Auditar não é procurar problemas até achar alguns — é **percorrer esta matriz inteira e
emitir um veredito por cenário**. É a diferença entre um relatório com 6 achados e um
relatório com 45 problemas sobre a mesma tela.

## Como usar

1. Percorra a tabela de cima para baixo, critério por critério, sem pular linha.
2. Para cada cenário, dê um dos quatro vereditos:

| Veredito | Quando usar |
|---|---|
| `PASSOU` | o cenário se aplica ao escopo e o código atende |
| `FALHOU` | o cenário se aplica e o código não atende — **gera uma ocorrência por elemento afetado** |
| `N/A` | o escopo não tem o elemento avaliado (sem vídeo → `1.2.x` é `N/A`) |
| `RUNTIME` | só o layout computado decide; registre o sinal estático encontrado e o que falta medir |

3. O gatilho e a mensagem exata de cada `FALHOU` estão na referência do princípio
   (`detectors-perceivable.md`, `-operable.md`, `-understandable.md`, `-robust.md`).
   Use a mensagem catalogada, não uma redação própria — é o que mantém os relatórios
   comparáveis entre auditorias.

`N/A` é veredito legítimo e frequente: numa tela sem mídia, ~35% dos cenários são `N/A`.
O que **não** é legítimo é omitir a linha. Critério sem veredito é critério não auditado,
e um relatório que cala sobre 40 critérios não afirma nada sobre a conformidade da tela.

## Os 55 critérios e seus cenários

| SC | Nv | Imp | Critério | Cenários |
|---|---|---|---|---|
| `1.1.1` | A | 🔴 | Conteúdo Não Textual | Imagem informativa com alt adequado · Ícone funcional com descrição acessível · Gráfico/diagrama complexo com descrição alternativa · Validação proxy com leitor de tela |
| `1.2.1` | A | 🟡 | Apenas Áudio e Apenas Vídeo (Pré-gravado) | Áudio pré-gravado com transcrição · Vídeo pré-gravado com descrição textual · Alternativa textual visível e identificável |
| `1.2.2` | A | 🟡 | Legendas (Pré-gravadas) | Legendas sincronizadas para vídeo pré-gravado · Controle acessível para legendas · Indicação de legendas disponíveis |
| `1.2.3` | A | 🟡 | Audiodescrição ou Alternativa de Mídia (Pré-gravado) | Audiodescrição sincronizada · Alternativa textual completa · Indicação de AD disponível |
| `1.2.4` | AA | 🟡 | Legendas (Ao Vivo) | Legendas em vídeo ao vivo · Controle acessível para legendas ao vivo · Indicação de legendas ao vivo |
| `1.2.5` | AA | 🟡 | Audiodescrição (Pré-gravada) | Audiodescrição em vídeo pré-gravado · Controle de audiodescrição acessível · Sinalização de audiodescrição · Cobertura e sincronização da AD · Alternativa de mídia equivalente |
| `1.3.1` | A | 🟠 | Informação e Relacionamentos | Títulos e hierarquia semântica · Listas semânticas · Tabelas com cabeçalhos · Rótulos de formulário |
| `1.3.2` | A | 🟠 | Sequência Significativa | Ordem DOM reflete sequência visual · Elementos flutuantes consistentes com DOM · Sem reordenação CSS que quebre leitura |
| `1.3.3` | A | 🟠 | Características Sensoriais | Sem dependência exclusiva de cor · Sem dependência exclusiva de posição · Sem dependência exclusiva de forma/tamanho |
| `1.3.4` | A | 🟡 | Orientação | Conteúdo permanece acessível em diferentes orientações · Sem bloqueio de orientação · Dependência de orientação justificada |
| `1.3.5` | AA | 🟡 | Identificação do propósito de entrada | Campos com propósito possuem autocomplete · Autocomplete correto conforme o propósito · Campos possuem rótulo acessível |
| `1.4.1` | A | 🟡 | Uso de Cor | Indicação de campos obrigatórios · Botão destacado por cor · Gráfico com cores diferentes |
| `1.4.2` | A | 🟡 | Controle de Áudio | Autoplay com controles ou mudo · Iframes de mídia sem autoplay audível · Áudio não interfere com tecnologia assistiva |
| `1.4.3` | AA | 🟠 | Contraste (Mínimo) | Contraste de texto com cores inline · Sem textos claros sem fundo definido · Texto sobre imagem com contraste adequado |
| `1.4.4` | AA | 🟡 | Redimensionar Texto | Viewport permite zoom até 200% · Tamanhos de fonte flexíveis · Componentes interativos utilizáveis com texto ampliado · Uso de recursos nativos do navegador · Texto legível (≥ 12px) no render real |
| `1.4.5` | AA | 🟡 | Imagens de Texto | Sem imagens de texto detectadas · SVGs com texto possuem alternativa · Imagem de texto personalizável |
| `1.4.10` | AA | 🟡 | Reflow | Sem larguras fixas que impeçam reflow · Sem overflow hidden com altura fixa · Componentes responsivos · Conteúdos que requerem rolagem bidimensional · Reflow — sem scroll horizontal no render real · Reflow a 320px (zoom 400%) — render real |
| `1.4.11` | AA | 🟠 | Contraste Não-Textual | Inputs com indicador visual adequado · Ícones funcionais com contraste adequado · Indicador de foco com contraste adequado |
| `1.4.12` | AA | 🟡 | Espaçamento de Texto | Espaçamento de texto não será cortado · line-height adequado (≥1.5) · Espaçamento entre letras ajustável · Espaçamento entre palavras ajustável · Interação com espaçamento de texto ajustado |
| `1.4.13` | AA | 🟡 | Conteúdo em Hover ou Foco | Conteúdo hover/tooltip acessível · Sem tooltips inacessíveis via title · Conteúdo exibido ao foco · Conteúdo adicional sem obstrução de informações |
| `2.1.1` | A | 🔴 | Teclado | Elementos clicáveis acessíveis via teclado · Roles interativos são focáveis · Links têm destino ou funcionalidade adequada · Verificar semântica e acessibilidade no código |
| `2.1.2` | A | 🔴 | Sem Armadilha de Teclado | Diálogos possuem mecanismo de fechar · Sem tabindex positivo alterando ordem · Fechar pop-up usando teclado · Navegar em menu suspenso usando teclado · Ajustar slider e sair usando teclado · Navegar no carrossel usando teclado · Navegar em campo de data usando teclado · Navegar em seletor personalizado usando teclado · Verificar ausência de scripts que prendem o foco · Verificar configuração correta de tabindex · Verificar atributos ARIA e fechamento de modais |
| `2.1.4` | A | 🟠 | Atalhos de Caractere | Usuário desativa todos os atalhos de tecla única · Teclas únicas ativas globalmente sem desativar/remapear/foco |
| `2.2.1` | A | 🟠 | Tempo Ajustável | Sem meta refresh temporizado · Sem timeout de sessão detectado · Exibir botão para estender tempo · Verificar botão "Estender tempo" · Verificar botão "Pausar" · Controles implementados com elementos semânticos · Mensagens de tempo usam aria-live para atualização dinâmica · Atributos de acessibilidade e nomes acessíveis corretos · Não conformidade — semântica incorreta ou ausência de aria-live |
| `2.2.2` | A | 🟠 | Pausar, Parar, Ocultar | Animações automáticas com controle de pausa · Animações respeitam prefers-reduced-motion · Navegar e acionar controles com teclado |
| `2.3.1` | A | 🔴 | Três Flashes ou Abaixo do Limite | Sem conteúdo que cause flashes · CSS sem animações de flash perigosas · Respeitar a preferência de redução de movimento do sistema · Inspecionar código para evitar animações rápidas e efeitos perigosos |
| `2.4.1` | A | 🟠 | Pular Blocos | Skip-link ou landmarks presentes · Landmarks semânticos presentes · Indicar não conformidade quando não existe mecanismo para pular blocos · Validar landmarks semânticos para pular blocos · Garantir mecanismo de pular blocos em todas as páginas do site · Identificar e evitar exposição desnecessária a conteúdos com movimento ou flashes nos blocos repetitivos |
| `2.4.2` | A | 🟡 | Página Titulada | Página possui título descritivo · Exibir título descritivo e informativo por página · Detectar título genérico ou pouco descritivo · Falhar quando não há título ou ele está vazio · Detectar inconsistência entre título da aba e título no HTML · Garantir que o título seja útil para tecnologias assistivas |
| `2.4.3` | A | 🟠 | Ordem de Foco | Ordem de foco segue DOM natural · Exibir foco na ordem lógica conforme o layout visual OU conforme a ordem natural do DOM · Evitar foco em elementos invisíveis · Modal gerencia o foco corretamente · Menu expansível mantém ordem de foco previsível · Verificar uso correto do atributo tabindex · Controles customizados têm foco e semântica corretos |
| `2.4.4` | A | 🟡 | Propósito do Link (Em Contexto) | Links têm propósito claro · Todos os links possuem nome acessível · Link genérico com contexto programático · Link de ícone com descrição acessível · Link de imagem com texto alternativo · Falha - link apenas com ícone e sem descrição · Falha - link 'Clique aqui' sem contexto · Diferenciar múltiplos links com mesmo texto e destinos distintos · Link herda contexto via aria-labelledby · Falha - tooltip apenas visual sem nome acessível · Indicar comportamento adicional do link (nova aba) |
| `2.4.5` | AA | 🟡 | Múltiplas Formas | Múltiplas formas de navegação · Indicador de localização presente · Falha - apenas navegação sequencial · Falha - menu sem busca ou mapa do site |
| `2.4.6` | AA | 🟡 | Cabeçalhos e Rótulos | Cabeçalhos são descritivos · Inputs possuem labels descritivos · Falha - campo sem rótulo · Falha - cabeçalhos fora de ordem · Cabeçalhos genéricos · Rótulos claros para múltiplos campos |
| `2.4.7` | AA | 🟠 | Foco Visível | Indicador de foco visível preservado · Elementos interativos acessíveis via Tab · Falha - foco removido via CSS · Falha - indicador de foco muito sutil · Foco e feedback de toque visíveis |
| `2.4.11` | AA | 🟡 | Foco Não Obscurecido (Mínimo) | Elementos fixos não obscurecem foco · Falha - elemento focado totalmente oculto · Uso de scroll-margin para compensar cabeçalho fixo |
| `2.5.1` | A | 🟠 | Gestos de Ponteiro | Sem gestos multipontos sem alternativa · Alternativa ao gesto de pinça para zoom · Suporte a teclado para todas as ações baseadas em gesto · Falha - funcionalidade apenas por gesto complexo · Drag-and-drop com acessibilidade por teclado · Falha - ações críticas sem alternativa |
| `2.5.2` | A | 🟡 | Cancelamento de Ponteiro | Ações não são disparadas no down-event sem cancelamento · Falha - ação irreversível sem confirmação · Controles acessíveis de cancelamento em modais · Falha - controles de cancelamento não operáveis por teclado · Feedback claro após desfazer |
| `2.5.3` | A | 🟡 | Rótulo no Nome | Rótulo igual ao nome · Link com nome estendido · Input com label · Placeholder sem label · aria-label divergente · aria-labelledby composto · Link divergente · Toggle · Texto visível não exposto ao Accessibility Tree |
| `2.5.4` | A | 🟡 | Atuação por Movimento | Sem dependência exclusiva de movimento do dispositivo · Falha - ação essencial depende exclusivamente de movimento · Controles com nome acessível coerente · Falha - alternativa presente porém inacessível |
| `2.5.7` | AA | 🟢 | Movimentos de Arrastar | Sem funcionalidades drag-only · Upload com alternativa ao drag-and-drop · Falha - funcionalidade depende exclusivamente de arrastar · Controle por teclado para ações de arrastar · Falha - alternativa presente mas inacessível |
| `2.5.8` | AA | 🟢 | Tamanho Mínimo do Alvo | Alvos interativos com tamanho adequado · Botão com alvo >= 24px · Ícone interativo com alvo insuficiente (falha) · Campos de formulário com área de toque ampliada · Lista de links muito próximos (falha) · Componente customizado com alvo adequado e foco visível · Tamanho do alvo ≥ 24px no render real · Espaçamento entre alvos de toque ≥ 24px · Alvos de toque sem sobreposição |
| `3.1.1` | A | 🟡 | Idioma da Página | Elemento <html> com atributo lang · Idioma definido em páginas renderizadas dinamicamente |
| `3.1.2` | AA | 🟡 | Idioma das Partes | Atributos lang válidos nas partes · Conteúdo em outro idioma com lang |
| `3.2.1` | A | 🟡 | Em Foco | Foco não causa mudança de contexto · Foco não abre modais automaticamente · Foco sem abertura de novo conteúdo · Ativação somente por ação explícita |
| `3.2.2` | A | 🟡 | Em Entrada | Entrada não causa mudança de contexto · Inputs file sem submissão automática · Seleção sem mudança automática de contexto · Ação explícita para mudança de contexto |
| `3.2.3` | AA | 🟡 | Navegação Consistente | Navegação com estrutura consistente · Navegação em posição consistente · Ordem lógica no código |
| `3.2.4` | AA | 🟡 | Identificação Consistente | Componentes de busca com identificação consistente · Botões de ação com identificação consistente · Correspondência entre rótulo visual e nome acessível · Uso consistente de ícones funcionais |
| `3.2.6` | A | 🟡 | Ajuda Consistente | Mecanismo de ajuda presente · Consistência de identificação acessível (teclado e tecnologias assistivas) |
| `3.3.1` | A | 🟠 | Identificação de Erro | Erros identificados com texto descritivo · Erros anunciados com aria-live/role=alert · Identificação de erro por valor fora do intervalo permitido · Associação clara entre mensagem de erro e campo inválido · Identificação de erros não depende apenas de cor · Identificação de múltiplos erros simultaneamente |
| `3.3.2` | A | 🔴 | Rótulos ou Instruções | Campos com rótulos ou instruções · Campos obrigatórios devidamente sinalizados · Instruções fornecidas quando o preenchimento exige formato específico · Placeholder não é utilizado como único rótulo · Identificação clara de campos obrigatórios · Rótulos adequados para diferentes tipos de campos · Rótulos e instruções acessíveis a leitores de tela · Instruções disponíveis antes da ocorrência de erros |
| `3.3.3` | AA | 🟠 | Sugestão de Erro | Mensagens de erro com sugestões · Campos com pattern oferecem instrução · Sugestão de correção para valor fora do intervalo permitido · Sugestão de correção fornecida com exemplo · Associação clara da sugestão de correção com o campo em erro |
| `3.3.4` | AA | 🟡 | Prevenção de Erro (Legal, Financeiro, Dados) | Formulários sensíveis com prevenção de erro · Formulários legais com opção de reversão · Confirmação explícita antes da execução de ação crítica |
| `3.3.7` | A | 🟡 | Entrada Redundante | Sem entradas redundantes desnecessárias · Campos idênticos não devem ser reapresentados para digitação · Repetição indevida de dados já inseridos |
| `3.3.8` | AA | 🟡 | Autenticação Acessível (Mínimo) | Sem CAPTCHAs cognitivos bloqueantes · Campos de autenticação permitem autopreenchimento · Desafio cognitivo não é obrigatório para autenticar · Autenticação depende exclusivamente de teste cognitivo · Autocompletar bloqueado |
| `4.1.2` | A | 🔴 | Nome, Função, Valor | Widgets com nome acessível · Elementos nativos com nome acessível · Estados ARIA obrigatórios presentes · Botão sem nome acessível · Função incorreta no componente · Todos elementos interativos com nome, função e valor |
| `4.1.3` | AA | 🟠 | Mensagens de Status | Mensagens de status com live region · Valores aria-live corretos · Mensagem de carregamento é anunciada · Mensagem não é anunciada pelo leitor de tela · Foco é movido indevidamente para a mensagem · Mensagem crítica usa aria-live adequado · Aria-live e roles corretos para mensagens |

## Regras de best-practice do axe-core

Não correspondem a um critério de sucesso, mas reprovam a página em auditoria
automatizada e aparecem como itens próprios no relatório. Verifique as três sempre:

| Regra | Verificação | Mensagem | Critério vizinho |
|---|---|---|---|
| `landmark-one-main` | o documento tem exatamente um `<main>` | `Document does not have a main landmark` | `2.4.1` |
| `page-has-heading-one` | a página tem um `<h1>` | `Page must have a level-one heading` | `1.3.1` `2.4.6` |
| `region` | todo conteúdo está dentro de um landmark | `Some page content is not contained by landmarks` | `2.4.1` `1.3.1` |

Em microfrontend as três costumam depender do shell, não do módulo. Isso muda a
responsabilidade pela correção — **não** dispensa o registro da falha.
