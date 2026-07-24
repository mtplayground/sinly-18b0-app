# sinly-18b0-app

Mobile H5 single-page frontend with a backend API service.

## Structure

- `apps/web`: Vite + React + TypeScript H5 frontend shell.
- `apps/api`: Express + TypeScript API service listening on `0.0.0.0:8080`.
- `packages/shared`: shared route metadata and API response types.

## Commands

```bash
npm install
npm run build
npm run lint
npm run format
npm run config:check
npm run db:migrate
npm run db:check
npm run dev
```

The production entrypoint is:

```bash
npm start
```

Database commands require `DATABASE_URL` to point at PostgreSQL.
Copy `.env.example` for local development values; do not commit real secrets.
