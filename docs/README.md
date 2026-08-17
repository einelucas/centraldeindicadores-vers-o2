# Documentação técnica

Este diretório concentra a documentação de arquitetura, operação, regras de negócio e migração da Central de Indicadores.

## Visão geral e arquitetura

| Documento | Conteúdo |
|---|---|
| [`system-overview.md`](system-overview.md) | Arquitetura, camadas e fluxo de dados |
| [`architecture.md`](architecture.md) | Camadas, organização por feature e decisões de versão |
| [`module-catalog.md`](module-catalog.md) | Objetivo e comportamento de cada módulo |

## Regras de negócio

| Documento | Conteúdo |
|---|---|
| [`scorecard-2026.md`](scorecard-2026.md) | Regras do ciclo, pesos, pontuação e origem dos valores |
| [`scorecard-2026-calculo.md`](scorecard-2026-calculo.md) | Distribuição mensal de pontos por indicador |
| [`business-keys.md`](business-keys.md) | Business key e content hash — como a importação incremental decide inserir/ignorar/atualizar |
| [`roles-permissions.md`](roles-permissions.md) | Matriz de permissões por perfil (VIEWER/ANALYST/ADMIN) |

## Autenticação

| Documento | Conteúdo |
|---|---|
| [`authentication.md`](authentication.md) | Provedor atual (Better Auth): configuração, sessão, primeiro acesso |
| [`corporate-integration.md`](corporate-integration.md) | Ponto de extensão genérico para um provedor corporativo futuro |
| [`migration-authentication-keycloak.md`](migration-authentication-keycloak.md) | Plano detalhado de migração para Keycloak + Microsoft Entra ID |

## API e dados

| Documento | Conteúdo |
|---|---|
| [`api-catalog.md`](api-catalog.md) | Organização das rotas de API |
| [`database.md`](database.md) | Modelos Prisma e configurações persistidas |
| [`import-process.md`](import-process.md) | Fluxo de importação incremental, lotes e estados do job |

## Operação

| Documento | Conteúdo |
|---|---|
| [`operations.md`](operations.md) | Instalação, banco, deploy e rotinas operacionais |
| [`neon.md`](neon.md) | Configuração do PostgreSQL na Neon (pooled + direct) |
| [`deployment-vercel.md`](deployment-vercel.md) | Passo a passo de deploy na Vercel |

## Qualidade e desenvolvimento

| Documento | Conteúdo |
|---|---|
| [`testing-and-quality.md`](testing-and-quality.md) | Testes, validações e critérios de entrega |
| [`development-guide.md`](development-guide.md) | Convenções para manutenção e novos módulos |

## Migração para Nuxt/Vue + FastAPI

| Documento | Conteúdo |
|---|---|
| [`migration-fastapi-nuxt.md`](migration-fastapi-nuxt.md) | Plano geral: diagnóstico do projeto atual, arquitetura-alvo e ordem de migração por fase |
| [`migration-authentication-keycloak.md`](migration-authentication-keycloak.md) | Plano detalhado só de autenticação (Keycloak + Entra ID) |
| [`migration-map.md`](migration-map.md) | Estado atual por módulo: cálculo, importação, publicação e integração ao Scorecard |

## Histórico

| Documento | Conteúdo |
|---|---|
| [`migration-phase-1.md`](migration-phase-1.md) | Registro da etapa inicial de migração do shell visual (concluída) |

Para o estado atual do sistema, prefira sempre os documentos das seções
acima aos registros de `Histórico`, que descrevem decisões de um momento
específico e podem não refletir o comportamento atual.
