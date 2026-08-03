# Business keys e content hash

O comportamento incremental do sistema depende de duas chaves geradas **no
servidor** para cada registro. Elas são a base para decidir entre inserir,
ignorar ou atualizar.

## business key — identidade lógica

Responde à pergunta: _"este registro representa a mesma coisa do mundo real que
aquele que já está no banco?"_

- Composta pelos campos **estáveis** de um registro.
- Tem índice **único** no banco, garantindo integridade mesmo sob concorrência.
- Nunca muda para o mesmo registro entre importações.

## content hash — campos mutáveis

Responde à pergunta: _"algo que pode ser corrigido/atualizado mudou?"_

- Hash (SHA-256) apenas dos campos **sujeitos a alteração** (ex.: status).
- Se a business key existe e o content hash é igual → registro **idêntico** →
  ignorar. Se o hash difere → **atualizar** apenas aquele registro.

## Por que duas chaves e não uma?

Se usássemos um único hash de todos os campos, qualquer correção de status
criaria um registro "novo" e duplicaria a linha. Separar identidade (business
key) de conteúdo (content hash) permite **atualizar no lugar**, preservando o
histórico e sem apagar o mês.

## Exemplo — RDO

Do HTML original vinha um alerta importante: `relatorio_id` **sozinho não
identifica** uma linha, porque o mesmo relatório aparece várias vezes (uma por
grupo/disciplina). Por isso:

```
businessKey(RDO) = SHA-256("RDO" | relatorioId | dataISO | empresa | grupo | disciplina)
contentHash(RDO) = SHA-256({ statusDescricao, responsavel, observacao })
```

Implementação em `src/features/rdo/utils/keys.ts`; helpers genéricos em
`src/lib/hashing`.

### Efeito prático

| Situação na reimportação                        | Resultado   |
| ----------------------------------------------- | ----------- |
| Linha nova (business key inédita)               | inserido    |
| Linha idêntica (mesma bk, mesmo hash)           | ignorado    |
| Mesmo relatório, status mudou (mesma bk)        | atualizado  |
| Linha ausente na nova planilha                  | mantida     |

Este comportamento é verificado em
`tests/integration/rdo-incremental.test.ts` usando planilhas reais.

## Definindo chaves para um novo módulo

1. Liste os campos que **identificam** o registro → business key.
2. Liste os campos que **podem mudar** com o tempo → content hash.
3. Use `makeBusinessKey(prefixo, [campos])` e `makeContentHash({...})` de
   `src/lib/hashing`.
4. Adicione o índice único da business key no `schema.prisma`.
5. Escreva testes cobrindo as quatro situações da tabela acima.
