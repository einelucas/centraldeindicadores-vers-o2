# Perfis e permissões

- **VIEWER** — consulta e exportação dos indicadores.
- **ANALYST** — permissões do VIEWER mais execução e consulta de importações.
- **ADMIN** — permissões do ANALYST mais edição, publicação, usuários, auditoria e configurações.

| Permissão | VIEWER | ANALYST | ADMIN |
|---|:---:|:---:|:---:|
| `indicators:read` | ✓ | ✓ | ✓ |
| `indicators:export` | ✓ | ✓ | ✓ |
| `indicators:edit` |  |  | ✓ |
| `indicators:publish` |  |  | ✓ |
| `import:run` |  | ✓ | ✓ |
| `import:read` |  | ✓ | ✓ |
| `users:manage` |  |  | ✓ |
| `audit:read` |  |  | ✓ |
| `settings:manage` |  |  | ✓ |
