# Patch cumulativo — IDP por RSO, consulta histórica e gráfico mensal

Este ZIP substitui o patch anterior do IDP e pode ser extraído diretamente na raiz do projeto Next.js. Ele mantém a lógica da aplicação atual — autenticação, importações em lote, auditoria, banco, publicação e Scorecard — e troca a fonte do IDP pelos PDFs RSO.

## O que foi acrescentado nesta versão

- cada RSO possui uma **competência** (`referenceDate`);
- a competência é procurada na primeira página do PDF e fica **editável antes da importação**;
- o painel administrativo possui filtros de **ano**, **mês inicial** e **mês final**;
- as tabelas exibem a posição acumulada até o mês final escolhido;
- a série histórica é calculada mês a mês, usando o RSO vigente de cada unidade no fechamento de cada mês;
- a competência aparece na lista de documentos e na tabela de execução por unidade;
- a publicação salva o período consultado e a série mensal completa;
- o antigo gráfico **Aderência mensal (%)** foi restaurado abaixo dos dois cards do painel publicado;
- snapshots antigos continuam compatíveis.

## Regra de consulta histórica

Para cada mês, o sistema considera somente RSOs com competência até o último dia daquele mês. Em seguida, escolhe o maior número de RSO disponível para cada unidade. Dessa forma, o gráfico representa a evolução acumulada do avanço físico.

## Banco de dados

A tabela `IdpRsoRecord` agora possui a coluna:

```text
referenceDate DateTime
```

O upgrade é idempotente. Caso a primeira versão do patch já tenha sido instalada, executar novamente o mesmo comando adicionará a coluna e preencherá registros antigos com a data da última atualização.

Depois de extrair o ZIP, execute:

```bash
pnpm db:generate
pnpm db:upgrade:idp-rso
pnpm typecheck
pnpm test
pnpm build
```

> Registros importados antes desta alteração recebem inicialmente a data de atualização como competência. Para reconstruir corretamente meses antigos, reimporte os RSOs ajustando a competência antes de confirmar a importação.

## Observação sobre a leitura do PDF

O parser tenta reconhecer rótulos como `Data de Referência`, `Competência`, `Data Base`, `Data de Emissão` e `Data de Medição`. Quando não encontra uma data segura, utiliza a data atual e permite correção manual antes da importação.

O PDF precisa possuir texto selecionável e manter estrutura próxima ao modelo RSO esperado. PDFs escaneados como imagem podem exigir OCR ou adaptação futura do parser.

## Validações executadas

- transpilação de 17 arquivos TypeScript/TSX sem erro de sintaxe;
- seleção histórica do RSO vigente por unidade;
- evolução mensal acumulada;
- publicação do período e da série mensal;
- reconhecimento de datas completas e competências mês/ano;
- hash incremental sensível à alteração da competência;
- inserção, reimportação idêntica e atualização incremental.

O build completo não pôde ser executado neste ambiente porque as dependências não estavam instaladas e o registro npm estava inacessível. Os comandos acima são a validação final no ambiente do projeto.
