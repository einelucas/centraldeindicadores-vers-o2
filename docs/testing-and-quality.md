# Testes e qualidade

## Comandos

```bash
pnpm security:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Execução completa:

```bash
pnpm check
```

Testes de interface:

```bash
pnpm test:e2e
```

## Tipos de teste

### Testes unitários

Validam funções isoladas, incluindo:

- normalização;
- datas;
- moedas;
- chaves e hashing;
- cálculos dos indicadores;
- regras de pontuação;
- construção de publicações.

### Testes de integração

Validam o fluxo entre importadores, deduplicação e cálculos. Uma reimportação idêntica deve ser ignorada ou reconhecida sem duplicar registros.

### Testes de interface

Validam login, navegação e fluxos críticos em um navegador real.

## Critérios mínimos antes do merge

- TypeScript sem erros;
- lint sem erros;
- testes relacionados à alteração aprovados;
- build de produção aprovado;
- nenhuma credencial detectada;
- importações existentes continuam compatíveis;
- pontuação e publicações mantêm precisão;
- alterações de banco possuem procedimento de aplicação e reversão.

## Atualização de testes

Um teste deve ser atualizado quando a regra de negócio oficial mudou. Não altere uma expectativa apenas para ocultar uma falha.

Ao modificar uma regra:

1. registre a regra na documentação;
2. atualize o cálculo;
3. atualize ou crie testes unitários;
4. valide publicações e painel geral;
5. execute a suíte completa.

## Falhas conhecidas versus regressões

Ao encontrar uma falha anterior ao trabalho atual, registre:

- arquivo e teste;
- resultado esperado e recebido;
- impacto funcional;
- decisão de corrigir código ou expectativa;
- responsável e versão prevista.

Isso evita misturar regressões novas com divergências antigas.
