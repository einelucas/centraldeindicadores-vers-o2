# Frontend Nuxt

Shell inicial do frontend em Nuxt 4/Vue 3. Ele consulta os endpoints de saúde e
o mapa de migração do FastAPI. Nenhum módulo de negócio foi substituído ainda.

## Executar

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

A aplicação ficará em `http://localhost:3000` e espera o backend em
`http://localhost:8000/api/v1`.
