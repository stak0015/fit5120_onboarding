
# WiseAge Health MVP

WiseAge Health is a Vite/React application backed by a stateless FastAPI service and PostgreSQL. It presents population-level Malaysian mortality context; it does not calculate personal risk or provide a diagnosis.

The profile and optional action-plan feature keep their device-local data in browser storage. FastAPI may request schema-constrained suggestions from Groq for adult profiles when configured, but submitted profiles and action plans are not persisted by the backend or PostgreSQL. Profiles below age 20 always receive reviewed curated suggestions without an external AI request.

## Run locally

1. Copy `.env.example` to `.env`, and copy `backend/.env.example` to `backend/.env`. Add the backend-only Groq key to `backend/.env` if AI-assisted suggestions are needed.
2. Start PostgreSQL with `docker compose up -d db`.
3. In `backend/`, install the API with `python -m pip install -e ".[dev]"`.
4. In `backend/`, run `alembic upgrade head` and `python -m sihatq.importer`.
5. Start the API with `uvicorn sihatq.main:app --reload --port 8000`. The API loads `backend/.env` automatically.
6. From this directory, run `npm install` and `npm run dev`.

If port 5432 is already occupied, set `POSTGRES_PORT=5433` before starting Docker and set `DATABASE_URL=postgresql+psycopg://wiseage:wiseage@localhost:5433/wiseage` before running Alembic, the importer, or Uvicorn.

The source CSV files are stored one directory above this Git repository. The importer accepts `--mortality-csv` and `--all-cause-csv` when they are stored elsewhere.

## Deploy to Vercel

Create two Vercel projects from this repository:

- Web project: repository root, Vite build, `VITE_API_BASE_URL` set to the API production URL.
- API project: root directory `backend`, FastAPI framework, with `DATABASE_URL`, `CORS_ORIGINS`, and `APP_ENV=production`.

Use a pooled managed PostgreSQL URL. Run `alembic upgrade head` and `python -m sihatq.importer` from a controlled machine before deploying the API; migrations and imports intentionally do not run during function startup.

See [backend/README.md](backend/README.md) for the API contract, data rules, and verification commands.
