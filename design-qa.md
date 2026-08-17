# Design QA — Contexto da leitura

- Source visual truth path: segunda imagem de referência anexada à conversa (sem caminho local disponível)
- Implementation screenshot path: indisponível — o navegador interno não está disponível nesta sessão
- Viewport da referência: 1750 × 198 px no recorte fornecido
- Dimensões e densidade: implementação ainda sem captura normalizada no mesmo viewport
- Estado: aba RDO, ciclo atual 2026 S2
- Primary interactions tested: seleção de período coberta por testes de estado/API; interação visual no navegador pendente
- Console errors checked: bloqueado pela indisponibilidade do navegador interno

## Full-view comparison evidence

Bloqueada. A referência foi medida a partir da imagem anexada, mas a implementação ainda precisa ser capturada no mesmo viewport para comparação lado a lado.

## Focused region comparison evidence

Bloqueada pelo mesmo motivo. A região a comparar contém título, descrição, três chips, dois seletores e a borda/sombra do cartão.

## Fidelity surfaces

- Fonts and typography: Manrope preservada; título 16 px/800, descrição 15 px/500, legendas 12 px/500 e valores 15 px/500.
- Spacing and layout rhythm: cartão com 180 px, padding 22–24 px, raio 22 px, dois campos em colunas de um terço e terceiro trilho vazio como na referência.
- Colors and visual tokens: fundo `#ffffff`, título `#132d4f`, descrição `#6d7c92`, chips `#eef3fb`/`#2e5aac`, borda `#cbd2dc`.
- Image quality and asset fidelity: não há imagens ou assets rasterizados neste componente.
- Copy and content: “Contexto da leitura”, legenda integrada, “Período atual · 2026 S2” e nomes completos de cada guia.

## Findings

- [P2] Comparação visual renderizada indisponível
  - Location: `ReadingContextCard` em todas as abas publicadas.
  - Evidence: o runtime informou que nenhum navegador está disponível.
  - Impact: dimensões e cores foram medidas e codificadas, mas ainda não há prova visual lado a lado.
  - Fix: com autorização, capturar a rota RDO pelo Playwright local e executar a comparação final no mesmo viewport.

## Comparison history

- Iteração 1: apenas integrou legendas; rejeitada por baixa fidelidade.
- Iteração 2: refez estrutura, cores, altura, raio, chips, tipografia e seletor único de período; estendeu o controle para as seis abas.
- Post-fix visual evidence: pendente por indisponibilidade do navegador interno.

## Implementation checklist

- [x] Reproduzir o cartão com duas colunas e terceiro trilho vazio.
- [x] Integrar as legendas à borda.
- [x] Unificar ano e semestre em um seletor.
- [x] Exibir o contexto em Scorecard, RDO, IDP, RNC, 5S e Taxa de Acidentes.
- [x] Fazer o período consultar os dados publicados da aba ativa.
- [x] Validar lint, TypeScript, testes e build.
- [ ] Capturar e comparar a implementação renderizada com a referência.

final result: blocked
