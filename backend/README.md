# WiseAge Mortality Insights API

## Runtime

The service uses Python 3.12, FastAPI, SQLAlchemy 2, Psycopg, Alembic, and PostgreSQL. It is stateless: profile submissions are validated and queried in memory and are not persisted.

## Environment

Copy `.env.example` values into your shell or deployment environment:

- `DATABASE_URL`: PostgreSQL connection string. Production should use the provider's pooled URL.
- `CORS_ORIGINS`: comma-separated exact web origins.
- `CORS_ORIGIN_REGEX`: optional, tightly scoped Vercel preview-domain pattern.
- `APP_ENV`: `development`, `test`, or `production`.

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

Interactive documentation is available at `/docs` while the API is running.

## Verification

```text
pytest
alembic check
```

For Vercel, create a project with `backend/` as its root directory. Do not bundle the source datasets and do not run migrations or imports from application startup.

