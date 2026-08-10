# Patch IDP - RSO semanal, competencia e rastreabilidade

Este patch muda o IDP para usar os PDFs RSO como fonte do indicador.

## Comportamento

- `RSO Nº` identifica a versao semanal do documento da unidade.
- Cada RSO fica armazenado no historico; uma versao mais nova nao apaga a anterior.
- A identidade do registro e `unidade + RSO Nº`.
- A competencia vem somente do campo explicito `Mes ref.` do PDF.
- Periodo, emissao e data de importacao sao armazenados separadamente e nunca substituem a competencia.
- Se `Mes ref.` nao for reconhecido, a importacao fica bloqueada ate definicao manual.
- Ajustes manuais de unidade, RSO ou competencia preservam os valores originalmente detectados.
- A tela mostra primeira importacao, ultima atualizacao e usuario responsavel pelo respectivo job de importacao.
- Para uma competencia, somente o maior numero de RSO de cada unidade entra no calculo.
- Um RSO de junho nao e reutilizado em julho.
- A publicacao salva um snapshot com os RSOs exatos utilizados.
- Na primeira abertura, o painel seleciona a competencia mais recente realmente armazenada, em vez do mes atual do computador.

## Validacao com os 3 PDFs fornecidos

- Nova Mutum: RSO 34, ref. 06/2026, periodo 24/06/2026 -> 01/07/2026, emissao 06/07/2026, Execucao Fase 3: 53,08% previsto / 54,79% realizado.
- Rio Verde: RSO 38, ref. 06/2026, periodo 25/06/2026 -> 01/07/2026, Fase 1: 51,23% / 49,50%; Fase 2: 25,55% / 26,93%.
- Rondonopolis: RSO 20, ref. 06/2026, periodo 24/06/2026 -> 01/07/2026, Fase 1: 17,81% / 17,37%; Fase 2: 7,07% / 9,55%.

## Banco de dados

Ha alteracao de schema. Depois de substituir os arquivos do patch, execute:

`pnpm db:upgrade:idp-rso`

O patch cria a tabela `IdpRsoRecord`; a tabela antiga `IdpRecord` foi preservada para nao fazer remocao destrutiva.

## Verificacao realizada

- Regexes de cabecalho e Execucao conferidas diretamente contra os tres PDFs enviados.
- Os arquivos TypeScript/TSX alterados passaram por verificacao de sintaxe via compilador TypeScript.
- O build completo nao foi executado neste ambiente porque as dependencias nao estavam instaladas e o acesso ao registry estava indisponivel.
