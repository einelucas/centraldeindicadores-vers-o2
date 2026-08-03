# Mapa de migração

A arquitetura ativa segue o padrão modular por recurso.

| Módulo | Cálculo | Importação/Persistência | Publicação | Scorecard |
|---|:---:|:---:|:---:|:---:|
| RDO | ✓ | ✓ | ✓ | ✓ |
| IDP | ✓ | ✓ | ✓ | ✓ |
| RNC | ✓ | ✓ | ✓ | ✓ |
| 5S | ✓ | ✓ | ✓ | ✓ |
| Taxa de Acidentes | ✓ | entrada administrativa | ✓ | ✓ |

O Scorecard permanece em `src/features/scorecard` e utiliza somente snapshots publicados. O roteador incremental registra RDO, IDP, RNC e 5S.
