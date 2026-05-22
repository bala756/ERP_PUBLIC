# Local Setup

This repo is a pnpm monorepo with:

- API server: `artifacts/api-server`
- Frontend: `artifacts/bca-erp`
- Database schema: `lib/db/src/schema`

## Prerequisites

Install these locally:

- Node.js 24 or newer with npm/Corepack
- pnpm
- PostgreSQL 16, or Docker Desktop if you want to use the included `docker-compose.yml`

## 1. Install dependencies

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

If `corepack` is unavailable, install pnpm through npm after installing Node:

```powershell
npm install -g pnpm
pnpm install
```

## 2. Start PostgreSQL

With Docker Desktop:

```powershell
docker compose up -d postgres
```

Without Docker, create a PostgreSQL database named `bca_erp` and use this connection string:

```text
postgres://bca_erp:bca_erp_dev@localhost:5432/bca_erp
```

## 3. Create SQL tables

Drizzle reads `DATABASE_URL` and creates/updates the tables from `lib/db/src/schema`.

```powershell
$env:DATABASE_URL="postgres://bca_erp:bca_erp_dev@localhost:5432/bca_erp"
pnpm --filter @workspace/db run push
```

Seed initial departments and users:

```powershell
$env:DATABASE_URL="postgres://bca_erp:bca_erp_dev@localhost:5432/bca_erp"
$env:PORT="5000"
pnpm --filter @workspace/api-server run seed
```

Default login:

```text
admin@bcaentertainment.com
bca@2024
```

## 4. Run the API

Open a new PowerShell terminal:

```powershell
$env:DATABASE_URL="postgres://bca_erp:bca_erp_dev@localhost:5432/bca_erp"
$env:PORT="5000"
$env:SESSION_SECRET="local-dev-secret"
pnpm --filter @workspace/api-server run dev
```

API health check:

```text
http://localhost:5000/api/healthz
```

## 5. Run the frontend

Open another PowerShell terminal:

```powershell
$env:PORT="5173"
$env:BASE_PATH="/"
$env:API_PROXY_TARGET="http://localhost:5000"
pnpm --filter @workspace/bca-erp run dev
```

Open:

```text
http://localhost:5173
```

## Deployment Notes

For your own domain, deploy PostgreSQL first, run the same Drizzle `push` against the production `DATABASE_URL`, set a strong `SESSION_SECRET`, build the API and frontend, and configure your host/reverse proxy so:

- `https://your-domain.com/api/*` routes to the API server
- `https://your-domain.com/*` serves the frontend build

Do not use the local database password or local session secret in production.
