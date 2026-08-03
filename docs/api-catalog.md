# Catálogo de APIs

## Painel e Scorecard

- `GET /api/dashboard` — monta o Painel Geral a partir das publicações ativas.
- `GET /api/scorecard?year=YYYY&month=M` — consolida um período.
- `POST /api/scorecard` — salva um snapshot mensal com ajustes autorizados.
- `GET /api/scorecard/history?year=YYYY` — lista os snapshots do ciclo.

## Módulos ativos

```text
/api/rdo
/api/idp
/api/rnc
/api/cinco-s
/api/taxa-acidentes
```

## Publicações

```text
/api/publicacoes/rdo
/api/publicacoes/idp
/api/publicacoes/rnc
/api/publicacoes/cinco-s
/api/publicacoes/taxa-acidentes
```

## Administração

```text
/api/importacoes
/api/indicadores
/api/configuracoes
/api/usuarios
/api/auditoria
```

Todas as rotas aplicam autenticação e permissão no servidor.
