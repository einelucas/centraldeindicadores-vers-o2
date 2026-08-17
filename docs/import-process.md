# Processo de importação

## Princípios

- **Nunca apaga o mês.** A ausência de um registro numa nova planilha não remove
  o que já existe.
- **Parsing no navegador.** Arquivos são lidos no cliente; só o JSON normalizado
  vai à API. Arquivos originais não são persistidos.
- **Chaves no servidor.** business key e content hash são gerados no backend
  (fonte de verdade), mesmo que o cliente já tenha normalizado os dados.
- **Idempotência por lote.** Cada lote é identificado por
  `(importJobId, batchNumber)`; reenviar o mesmo lote não duplica efeitos.

## Fluxo passo a passo

1. **Iniciar** — `POST /api/importacoes/iniciar` cria um `ImportJob`
   (status `PENDING`) para um módulo e retorna o `importJobId`.
2. **Enviar lotes** — o cliente lê a planilha, normaliza, quebra em lotes
   (`IMPORT_BATCH_SIZE`, padrão 500) e envia cada um para
   `POST /api/importacoes/[id]/lotes` com o `batchNumber`.
3. **Processar** — para cada registro do lote, o motor incremental decide
   inserir / ignorar / atualizar (ver `business-keys.md`). Erros de linha são
   registrados em `ImportError` sem abortar o lote.
4. **Finalizar** — `POST /api/importacoes/[id]/finalizar` marca o job como
   `COMPLETED` (ou `COMPLETED_WITH_ERRORS`) e dispara o recálculo dos
   indicadores consolidados do módulo.

## Estados de um job (`ImportStatus`)

```
PENDING → PARSING → PROCESSING → COMPLETED
                               ↘ COMPLETED_WITH_ERRORS
                               ↘ FAILED
                               ↘ CANCELLED
```

## Resumo de resultado

Cada lote retorna um `UpsertOutcome`:

| Campo      | Significado                                  |
| ---------- | -------------------------------------------- |
| `inserted` | registros novos                              |
| `ignored`  | idênticos ao que já existia                  |
| `updated`  | existiam e tiveram algum campo mutável mudado|
| `rejected` | falharam na validação/persistência           |
| `errors[]` | detalhe por business key                     |

## Lotes e desempenho

- Tamanho de lote configurável por `IMPORT_BATCH_SIZE`.
- Lotes são processados em transação; a unicidade da business key no banco é a
  última linha de defesa contra concorrência.
- Reprocessar um `(importJobId, batchNumber)` já concluído é seguro
  (idempotente).

## Módulos

O roteador de lotes (`/api/importacoes/[id]/lotes`) resolve o módulo pelo
registro central `src/server/modules/registry.ts`. Hoje **RDO, IDP, RNC e 5S**
estão registrados e processam de ponta a ponta por esse fluxo. Um módulo
ausente do registro responde `501 Not Implemented` (ver `migration-map.md`).

**Taxa de Acidentes não usa esse roteador.** Ela não tem importação por
planilha — os lançamentos mensais e por unidade são cadastrados diretamente
via formulário administrativo (`POST /api/taxa-acidentes`), sem `ImportJob`
nem deduplicação por business key.
