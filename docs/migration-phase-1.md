# Migração — Etapa 1: base visual, autenticação e Neon

## Objetivo

Preservar a infraestrutura do projeto Next.js antecessor e substituir o shell visual pelo layout do HTML atual, sem migrar ainda as regras de publicação dos indicadores.

## Fonte de verdade

- `reference/index.html`: estrutura e hierarquia visual atuais.
- `reference/styles.css`: design obrigatório.
- `reference/script.js`: regras atuais que serão comparadas módulo a módulo.
- `prisma/schema.prisma`: banco de dados reaproveitado do antecessor.
- `src/server/auth`: autenticação Better Auth reaproveitada.

## Concluído nesta etapa

- Sidebar antiga removida do fluxo e do código.
- Barra principal limitada às seis abas atualmente ativas.
- Cabeçalho adaptado para usuário autenticado, perfil, administração e logout.
- Login preservando Better Auth, com visual alinhado ao painel.
- Subabas `Painel` e `Administração` criadas em todas as frentes.
- Usuários `VIEWER` visualizam somente o painel.
- Usuários `ANALYST` e `ADMIN` acessam a Administração dos indicadores.
- Recursos técnicos movidos para `/dashboard/administracao`.
- `.env` removido do pacote.
- `.env.example` sanitizado.
- CSS de referência incorporado ao `globals.css`, com apenas adaptações técnicas para links do Next.js e controles autenticados.

## Deliberadamente não implementado ainda

- Publicação versionada no painel.
- Tabela `IndicatorPublication`.
- Botão `Publicar no Painel` conectado ao Neon.
- Leitura dos snapshots publicados.
- Comparação integral das regras do RDO entre o antecessor e `reference/script.js`.
- Refatoração visual interna dos importadores antigos.

Enquanto a publicação não for implementada, os painéis exibem o estado vazio da referência. Os importadores e consultas existentes ficam na subaba Administração.

## Próxima etapa

Migrar o RDO de ponta a ponta:

1. comparar parser e cálculos com `reference/script.js`;
2. adequar a interface administrativa ao HTML atual;
3. criar persistência de publicações;
4. implementar o botão de publicação;
5. renderizar o snapshot no Painel;
6. manter histórico e auditoria;
7. validar importação incremental e deduplicação.
