## Descrição

<!-- O que esta mudança faz e por quê. -->

## Tipo de mudança

- [ ] Correção de bug
- [ ] Nova funcionalidade
- [ ] Refatoração (sem mudança de comportamento)
- [ ] Documentação
- [ ] Migração de banco (Prisma)

## Módulo(s) afetado(s)

<!-- Ex.: RDO, importação incremental, autenticação, etc. -->

## Checklist

- [ ] `pnpm check` passa localmente (lint + typecheck + testes + build)
- [ ] Testes adicionados/atualizados para a mudança
- [ ] Se houve mudança de schema, a migration foi gerada (`pnpm db:migrate`)
- [ ] Regras de negócio preservadas (business key / content hash quando aplicável)
- [ ] Sem segredos, credenciais ou dados sensíveis no código/commits

## Como testar

<!-- Passos para validar manualmente. -->
