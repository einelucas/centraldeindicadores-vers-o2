# Design QA — cabeçalho dos módulos

- Source visual truth path: imagem de referência anexada à conversa (sem caminho local disponível)
- Implementation screenshot path: indisponível — nenhum navegador está conectado à sessão
- Viewport da referência: aproximadamente 1890 × 535 px no recorte fornecido
- Dimensões e densidade: a referência foi exibida na conversa; não foi possível normalizar a densidade sem uma captura local da implementação
- Estado: Painel Geral, cabeçalho do módulo visível
- Primary interactions tested: não aplicável ao ajuste tipográfico
- Console errors checked: bloqueado pela indisponibilidade do navegador

## Full-view comparison evidence

Bloqueada. A referência visual está disponível na conversa, mas não foi possível capturar a implementação renderizada no mesmo viewport.

## Focused region comparison evidence

Bloqueada pelo mesmo motivo. A região relevante é o cabeçalho com legenda, título e descrição, alinhado ao eixo esquerdo dos cards.

## Fidelity surfaces

- Fonts and typography: código ajustado para legenda de 11 px, título responsivo de 28–32 px e descrição de 14–16 px; validação renderizada pendente.
- Spacing and layout rhythm: largura máxima de 1180 px e centralização preservadas; comparação visual pendente.
- Colors and visual tokens: cores previamente ajustadas foram preservadas.
- Image quality and asset fidelity: não há imagens ou novos assets nesta alteração.
- Copy and content: conteúdo existente preservado.

## Findings

- [P2] Comparação visual indisponível
  - Location: cabeçalho compartilhado em `ModuleWorkspace`.
  - Evidence: não há navegador conectado para capturar a implementação após a redução.
  - Impact: não é possível confirmar fidelidade pixel a pixel nesta sessão.
  - Fix: abrir a rota no navegador e comparar o cabeçalho renderizado com a referência no mesmo viewport.

## Comparison history

- Iteração atual: reduziu legenda de 12 px para 11 px, título máximo de 36 px para 32 px e descrição máxima de 18 px para 16 px.
- Post-fix visual evidence: indisponível.

## Implementation checklist

- [x] Reduzir a escala tipográfica.
- [x] Preservar o alinhamento de 1180 px com os cards.
- [x] Validar TypeScript, ESLint, Prettier e `git diff --check`.
- [ ] Capturar e comparar a implementação renderizada.

final result: blocked
