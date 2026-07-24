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
npm test
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

## Self-hosted Deployment

The API service serves the built H5 frontend and runs database migrations before listening on
`0.0.0.0:8080`.

Required runtime environment:

- `DATABASE_URL`: PostgreSQL connection string.
- `MCTAI_AUTH_URL`, `MCTAI_AUTH_APP_TOKEN`, `MCTAI_AUTH_JWKS_URL`: platform auth service.
- `API_KEY_ENCRYPTION_SECRET`, `API_KEY_ENCRYPTION_SALT`: encrypt saved map provider Keys.
- `SELF_URL`: public site URL used for login return URLs and payment callbacks.
- Optional payment variables: `PAYMENT_PROVIDER`, `PAYMENT_APP_ID`, `PAYMENT_MERCHANT_ID`,
  `PAYMENT_GATEWAY_URL`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_RETURN_URL`, `PAYMENT_NOTIFY_URL`,
  `MEMBERSHIP_ANNUAL_PRICE_CENTS`, `PAYMENT_CURRENCY`.

Container build:

```bash
docker build -t sinly-18b0-app .
docker run --env-file .env.production -p 8080:8080 sinly-18b0-app
```

For non-container hosting, run `npm ci && npm run build` during release and `npm start` at runtime.
Set `HOST=0.0.0.0` and `PORT=8080` unless your platform injects different values.
