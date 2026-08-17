# Catálogo de APIs

## Painel e Scorecard

- `GET /api/dashboard` — monta o Painel Geral a partir das publicações ativas.
- `GET /api/scorecard?year=YYYY&month=M` — consolida um mês (valor ao vivo, mesclado com snapshot salvo como respaldo).
- `POST /api/scorecard` — salva um snapshot com os valores ao vivo do mês informado (não é edição manual — ver `scorecard-2026.md`).
- `GET /api/scorecard/history?periodStartYear=&periodStartMonth=&periodEndYear=&periodEndMonth=` — lista os snapshots do ciclo (sem parâmetros, usa o ciclo semestral vigente).
- `DELETE /api/scorecard/history?periodStartYear=&...` — apaga os snapshots salvos do período informado (ADMIN; período obrigatório, não aceita "Tudo").
- `GET /api/scorecard/panel-period` — lê o período de controle salvo (Administração + Painel Geral).
- `PATCH /api/scorecard/panel-period` — salva o período escolhido na Administração do Scorecard.

## Módulos ativos (leitura, escrita administrativa e exclusão)

```text
/api/rdo               GET | PATCH (edição manual de status)
/api/rdo/registros      GET (contagem para exclusão) | DELETE (ids | período | tudo)
/api/idp                GET | (importação via /api/importacoes)
/api/idp/registros       GET (contagem para exclusão) | DELETE (período | tudo)
/api/rnc                GET | PATCH (status/tempo de tratativa)
/api/rnc/registros       GET (contagem para exclusão) | DELETE (ids | período | tudo)
/api/cinco-s             GET | PATCH (meta/unidades ignoradas)
/api/cinco-s/registros   GET (contagem para exclusão) | DELETE (período | tudo)
/api/taxa-acidentes             GET | POST (lançamento mensal/unidade/meta) | DELETE (?kind=month|unit, um lançamento)
/api/taxa-acidentes/registros   GET (contagem para exclusão) | DELETE (período | tudo, mensal + por unidade)
```

O DELETE de `.../registros` é sempre a base para o diálogo padrão de exclusão
(`ClearRecordsDialog`, ver `development-guide.md`): primeiro um `GET` busca a
contagem afetada para o período escolhido, depois o `DELETE` de fato exclui.
Nenhum desses endpoints apaga a publicação vigente.

## Publicações

```text
/api/publicacoes/rdo
/api/publicacoes/idp
/api/publicacoes/rnc
/api/publicacoes/cinco-s
/api/publicacoes/taxa-acidentes
```

## Importação incremental

```text
POST /api/importacoes/iniciar             cria um ImportJob e retorna importJobId
POST /api/importacoes/[id]/lotes          processa um lote (registrado em src/server/modules/registry.ts: rdo, idp, rnc, cinco-s)
POST /api/importacoes/[id]/finalizar      marca o job como concluído e recalcula o módulo
GET  /api/importacoes/[id]                status/detalhe de um job
GET  /api/importacoes/[id]/erros          erros de linha do job
GET  /api/importacoes                     lista jobs
```

Taxa de Acidentes não usa esse roteador — os lançamentos são feitos direto
por `POST /api/taxa-acidentes` (sem upload de planilha). Ver `import-process.md`.

## Administração geral

```text
/api/indicadores          leitura consolidada para telas administrativas gerais
/api/configuracoes        metas/listas de exclusão (AppSetting)
/api/usuarios             GET/POST usuários (ADMIN)
/api/usuarios/[id]        PATCH nome/perfil/status (ADMIN)
/api/auditoria            GET trilha de auditoria (ADMIN)
/api/justificativas       justificativas de exclusões/ajustes por indicador
/api/justificativas/sugestao  sugestão de texto de justificativa
```

## Autenticação

```text
/api/auth/[...all]        handlers do Better Auth (login, sessão, logout)
```

Não portar essa rota na migração para FastAPI — ver
`migration-authentication-keycloak.md`.

Todas as rotas de negócio aplicam autenticação e permissão no servidor
(`requirePermission`), independente do que a interface mostra ou esconde.
