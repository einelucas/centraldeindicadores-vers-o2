# Operação e implantação

## Instalação local

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

## Banco Neon

Utilize a URL com pooler em `DATABASE_URL` e a conexão direta em `DIRECT_URL`.

```env
DATABASE_URL="postgresql://...pooler...?sslmode=require"
DIRECT_URL="postgresql://...direct...?sslmode=require"
```

### Cuidados

- não execute `db:push` no banco principal sem revisar o schema;
- não use `db:pull` e confirme o diff sem leitura;
- faça backup antes de scripts manuais;
- execute upgrades de banco uma única vez por ambiente;
- não misture migrations locais não aplicadas com scripts manuais sem registrar a decisão.

## Scripts de banco

```bash
pnpm db:generate
pnpm db:pull
pnpm db:push
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
pnpm db:studio
```

O projeto também possui comandos de upgrade manual para estruturas específicas. Verifique a pasta `prisma/manual` antes da execução.

## Importações

O tamanho do lote pode ser configurado por:

```env
IMPORT_BATCH_SIZE="500"
```

Ao ocorrer timeout:

1. confirme a disponibilidade do banco;
2. verifique se há outra importação concorrente;
3. reduza o tamanho do lote de forma controlada;
4. confira os logs do lote e a quantidade já persistida;
5. não reinicie a importação sem validar a deduplicação.

## Publicação

Antes de publicar um indicador:

1. confirme o período;
2. confira a meta e a unidade de medida;
3. valide totais e detalhamentos;
4. resolva vínculos pendentes;
5. registre justificativas de exclusões ou ajustes;
6. publique somente após a conferência.

Uma publicação nova substitui o snapshot ativo no painel, mas mantém o histórico de versões.

## Vercel

Configure na Vercel:

- `DATABASE_URL`;
- `DIRECT_URL`;
- `BETTER_AUTH_SECRET`;
- `BETTER_AUTH_URL` com a URL pública;
- `NEXT_PUBLIC_APP_URL` com a URL pública;
- variáveis de seed apenas quando forem realmente utilizadas.

Build:

```bash
pnpm build
```

O deploy conectado ao GitHub ocorre após o push para a branch configurada no projeto da Vercel.

## Verificação após deploy

- login;
- carregamento do painel geral;
- consulta de pelo menos um indicador publicado;
- acesso à Administração com perfil autorizado;
- consulta do histórico do Scorecard;
- leitura e escrita no banco;
- download de uma exportação;
- ausência de erros no log da função.

## Recuperação de falhas

### Banco indisponível ou timeout

- confirme o status da Neon;
- valide `DATABASE_URL` e `DIRECT_URL`;
- teste a conexão direta;
- verifique conexões simultâneas;
- aguarde a retomada de um banco suspenso antes de reexecutar operações pesadas.

### Prisma P1002

Indica que o servidor foi alcançado, mas a operação excedeu o tempo limite. Em deploys, pode ocorrer por concorrência de migrations ou advisory locks. Evite rodar migrations concorrentes em múltiplas instâncias.

### Painel sem dados

- confirme que existe publicação ativa;
- verifique o período publicado;
- confira a permissão `indicators:read`;
- valide se a tabela de publicações foi criada no ambiente;
- consulte a API do módulo e `/api/dashboard`.

### Histórico do Scorecard com valor inesperado

O painel de Administração do Scorecard não permite mais edição manual —
nenhum campo de "Indicadores do mês" e nenhum clique em célula do "Histórico
do ciclo" altera valores. Todo valor exibido vem do módulo de origem (ao
vivo) ou do último snapshot salvo via "Salvar snapshot" (que persiste os
valores ao vivo do momento, nunca um ajuste digitado).

- confirme o mês/indicador e o período selecionado (Ano + Semestre, travado
  como nos demais painéis administrativos — não há mais filtro livre de
  "De/Até" no Scorecard);
- confira se o módulo de origem (RDO/IDP/RNC/5S/Taxa de Acidentes) já
  publicou aquele mês; sem publicação, o valor fica "Sem dados";
- um valor "congelado" e desatualizado geralmente indica um snapshot salvo
  antigo sem republicação recente do módulo de origem — use "Recalcular" para
  puxar os valores ao vivo novamente.

### Limpar registros administrativos (RDO/IDP/RNC/5S/Taxa de Acidentes)

O botão "Limpar tudo" é padronizado em todos os painéis de Administração:
abre um diálogo (`ClearRecordsDialog`) que exige escolher um período (ou
deixar "Tudo"), mostra a contagem real de registros afetados buscada no
servidor e só libera a exclusão depois de digitar a frase de confirmação.
Nenhum módulo usa mais `window.confirm` para essa ação. A publicação vigente
nunca é apagada por esse botão — ela é um snapshot histórico imutável.
