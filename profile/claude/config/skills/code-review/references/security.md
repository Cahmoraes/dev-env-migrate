# Segurança — Diretrizes de Code Review

> Referência para a skill `code-review`.
> Diretrizes para identificar e corrigir problemas de segurança no código.

## Categoria

**BLOQUEANTE**

## Critérios

- Verifique se entradas do usuário estão sendo validadas adequadamente
- Certifique-se de que dados sensíveis não estão expostos (ex: senhas ou chaves de API no código)
- Garanta que exceções estão sendo tratadas corretamente, sem capturar exceções genéricas como `catch (Exception)`

## Problemas Comuns a Identificar

- Uso de dados do usuário diretamente sem validação
- Falta de tratamento de erros
- Exposição de dados sensíveis em logs ou mensagens de erro
- Chaves de API ou tokens hardcoded no código
- Uso de `eval()` ou construções inseguras
- Falta de sanitização de dados antes de renderização (XSS)
- Armazenamento de dados sensíveis em localStorage sem criptografia

## Boas Práticas

- Valide inputs com Zod ou schemas de validação antes de processar
- Use variáveis de ambiente para credenciais e chaves
- Trate erros com mensagens genéricas para o usuário e logs detalhados internos
- Sanitize dados antes de inserir no DOM
- Nunca exponha stack traces ou detalhes internos ao usuário final
