# Backend FastAPI

Base inicial do novo backend da Central de Indicadores. Nesta fase, ele roda em
paralelo ao Next.js e apenas valida configuração, conectividade com o PostgreSQL
e o mapa de migração.

## Executar

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
Copy-Item .env.example .env
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Linux/macOS:

```bash
source .venv/bin/activate
cp .env.example .env
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Documentação interativa: `http://localhost:8000/docs`.

## Testes

```bash
pytest
ruff check .
mypy app
```

## Banco

A `DATABASE_URL` pode apontar para o mesmo PostgreSQL/Neon do projeto atual.
Nenhuma migration é executada nesta fase. O mapeamento SQLAlchemy e o baseline
do Alembic só devem ser adicionados depois da introspecção e comparação do
schema real com o `prisma/schema.prisma`.
