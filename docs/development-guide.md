# Guia de desenvolvimento

## Princípios

- mantenha regras de negócio fora dos componentes visuais;
- valide entradas na borda da aplicação;
- não acesse Prisma diretamente em componentes;
- use tipos explícitos para payloads e resultados;
- preserve precisão numérica durante cálculos;
- mantenha importação, cálculo e publicação como etapas separadas;
- registre operações administrativas relevantes em auditoria.

## Novo módulo de indicador

Estrutura recomendada:

```text
src/features/<modulo>/
├── calculations/index.ts
├── components/<Modulo>View.tsx
├── importers/index.ts
├── publications/index.ts
├── services/index.ts
└── types/index.ts
```

Rotas recomendadas:

```text
src/app/api/<modulo>/route.ts
src/app/api/publicacoes/<modulo>/route.ts
```

Testes recomendados:

```text
tests/unit/<modulo>-calculations.test.ts
tests/unit/<modulo>-publication.test.ts
tests/integration/<modulo>-incremental.test.ts
```

## Checklist de implementação

1. definir fonte e colunas aceitas;
2. definir normalização;
3. definir chave de negócio;
4. definir deduplicação e atualização;
5. implementar cálculo puro;
6. implementar persistência;
7. criar interface administrativa;
8. criar publicação versionada;
9. criar painel de leitura;
10. integrar ao Scorecard quando aplicável;
11. documentar regras e limitações;
12. criar testes.

## Importadores

Importadores devem retornar dados normalizados e erros compreensíveis. Evite misturar leitura do arquivo com escrita no banco na mesma função quando isso dificultar testes.

Recomendações:

- normalize cabeçalhos;
- trate números em formatos brasileiro e internacional;
- trate datas do Excel sem depender do fuso local;
- valide campos obrigatórios;
- informe linhas descartadas;
- processe em lotes;
- preserve a origem do registro para auditoria.

## Cálculos

Funções de cálculo devem receber objetos já normalizados e retornar resultados determinísticos. Elas não devem depender diretamente de `window`, componentes React ou Prisma.

## Publicações

O payload publicado deve conter apenas o necessário para reconstruir o painel. Evite armazenar arquivos completos ou dados brutos desnecessários no snapshot.

## Interface

- mantenha a subaba Painel somente para leitura;
- mantenha importações e ajustes na Administração;
- preserve o estado do usuário durante carregamentos;
- não associe dados antigos a um novo período durante troca de seleção;
- desabilite ações enquanto uma operação incompatível estiver em andamento;
- apresente mensagens de erro com contexto suficiente para correção;
- agrupe os gráficos e a leitura por unidade de um mesmo indicador em um único `indicator-card` com `indicator-subcard`s internos (padrão usado em todos os painéis publicados atuais);
- exponha o botão "Exportar PDF" de cada painel publicado via `ToolbarSlotContent` (`src/components/layout/ToolbarSlot.tsx`) usando `usePanelPdfExport` (`src/lib/exports/panel-screenshot-pdf.ts`), em vez de recriar a lógica de captura por módulo.

## Commits

Utilize mensagens objetivas, por exemplo:

```text
Corrige edição individual do histórico do Scorecard
Adiciona publicação versionada de indicador
Ajusta deduplicação da importação de RDO
Documenta implantação na Vercel
```
