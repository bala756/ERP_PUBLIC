# Hostinger Deployment

This repository builds as one Node application:

- React frontend build output: `artifacts/bca-erp/dist/public`
- API server build output: `artifacts/api-server/dist`
- Production start command serves both the API and frontend.

## Hostinger Settings

Use these settings for the Hostinger Node.js application connected to GitHub.

```text
Package manager: pnpm
Node version: 20 or newer
Install command: corepack enable && pnpm install --frozen-lockfile
Build command: pnpm run build
Start command: pnpm start
Application root: repository root
```

If Hostinger does not allow `corepack` in the install command, enable pnpm in the panel or use:

```text
npm install -g pnpm && pnpm install --frozen-lockfile
```

## Required Environment Variables

```text
NODE_ENV=production
PORT=<Hostinger provided port>
DATABASE_URL=<production PostgreSQL connection string>
SESSION_SECRET=<long random secret value>
BASE_PATH=/
```

`PORT` is usually injected by Hostinger. If the panel asks for it manually, use the port shown in the Hostinger Node.js app settings.

## Database Schema

After the production PostgreSQL database is created and `DATABASE_URL` is set, push the schema once:

```bash
pnpm --filter @workspace/db push
```

The API will create the session table and numbering sequences automatically on startup.

## Local Production Check

From the repository root:

```bash
pnpm run build
NODE_ENV=production PORT=5000 DATABASE_URL=<local-db-url> SESSION_SECRET=local-test-secret pnpm start
```
