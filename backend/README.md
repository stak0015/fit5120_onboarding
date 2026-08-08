# WiseAge Mortality Insights API

## Runtime

The service uses Python 3.12, FastAPI, SQLAlchemy 2, Psycopg, Alembic, and PostgreSQL. It is stateless: profile submissions are validated and queried in memory and are not persisted.

## Environment

Copy `.env.example` to `.env` for local development. The API loads this file automatically, so the values do not need to be set in every PowerShell session. Vercel environment variables still take priority in production.

- `DATABASE_URL`: PostgreSQL connection string. Production should use the provider's pooled URL.
- `CORS_ORIGINS`: comma-separated exact web origins.
- `CORS_ORIGIN_REGEX`: optional, tightly scoped Vercel preview-domain pattern.
- `APP_ENV`: `development`, `test`, or `production`.
- `ACTION_SUGGESTIONS_ENABLED`: enables adult AI-assisted suggestions when a Groq key is configured.
- `GROQ_API_KEY`: backend-only Groq project key; never expose it through Vite variables.
- `GROQ_MODEL`: strict structured-output model, default `openai/gpt-oss-120b`.
- `GROQ_SAFETY_MODEL`: output safety-review model, default `openai/gpt-oss-safeguard-20b`.
- `GROQ_TIMEOUT_SECONDS`: provider request timeout, default `15`.

## Database setup

Run these from `backend/` after PostgreSQL is available:

```text
alembic upgrade head
python -m sihatq.importer
```

The importer validates the expected 1,935 mortality rows, dimension totals, natural-key uniqueness, numeric ranges, and the 8,190-row all-cause context source. Re-running it with unchanged files is a no-op.

## API

- `GET /health`: database-backed health check.
- `GET /api/v1/metadata`: supported profile options and dataset years.
- `POST /api/v1/insights`: state-age primary insight, comparisons, separate all-cause context, sources, limitations, and disclaimer.
- `POST /api/v1/action-suggestions`: stateless, schema-validated wellness suggestions. Profiles below age 20 and provider failures use reviewed curated suggestions without storing submitted profiles.

Interactive documentation is available at `/docs` while the API is running.

## Verification

```text
pytest
alembic check
```

For Vercel, create a project with `backend/` as its root directory. Do not bundle the source datasets and do not run migrations or imports from application startup.

Configure a Vercel Firewall rate-limit rule for `POST /api/v1/action-suggestions` before enabling Groq in production. The application does not log submitted profile bodies or store action-plan requests, prompts, suggestions, or goals in PostgreSQL.

