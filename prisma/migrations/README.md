# Histórico de migrations

O projeto utiliza uma baseline única em `0_baseline` para representar o schema
vigente da Central de Indicadores.

## Banco já existente

Execute uma única vez o script da raiz:

```powershell
powershell -ExecutionPolicy Bypass -File .\APLICAR_CORRECAO_BANCO.ps1
```

O script aplica a atualização idempotente, registra `0_baseline` como já
aplicada e preserva os dados dos módulos que continuam ativos.

## Banco novo e vazio

Execute normalmente:

```bash
pnpm db:deploy
```

A baseline criará todas as tabelas atuais. Não edite uma migration já aplicada;
novas alterações devem ser adicionadas em novas pastas de migration.
