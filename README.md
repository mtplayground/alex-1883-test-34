# myClawTeam

myClawTeam is a two-workspace Node.js application:

- `apps/api`: Express API, Prisma ORM, PostgreSQL, Google OAuth, JWT auth, and S3-compatible object storage.
- `apps/web`: Vite/React browser app.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- S3-compatible object storage
- Google OAuth client credentials

## Environment

Copy `.env.example` to `.env.production` for production or `.env.local` for local development, then fill in real values.

Important deployment values:

- `DATABASE_URL`: PostgreSQL connection string. Persistent state must use PostgreSQL.
- `JWT_SECRET`: long random signing secret.
- `OBJECT_STORAGE_*`: S3-compatible bucket credentials and public URL.
- `OBJECT_STORAGE_PREFIX`: required object-key prefix for uploads.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 client credentials.
- `GOOGLE_CALLBACK_URL`: API callback URL, for example `https://api.example.com/api/auth/google/callback`.
- `GOOGLE_BASE_URL`: optional API origin used to derive `/api/auth/google/callback` when `GOOGLE_CALLBACK_URL` is not set.
- `VITE_API_BASE_URL`: public API origin used by the browser app at build time.
- `CORS_ORIGIN`: comma-separated browser origins allowed to call the API.
- `PORT`: API port. Defaults to `8080`.
- `WEB_PORT`: web preview port for `npm run start:self-hosted`. Defaults to `8081`.

The API and web app are run as separate services for self-hosting. This keeps browser routes such as `/users/:username` available to the frontend while API routes remain on the API origin.

## Build

```bash
npm ci
export NODE_ENV=production
export VITE_API_BASE_URL=https://api.example.com
npm run build:self-hosted
```

`build:self-hosted` validates the Prisma schema, generates Prisma Client, and builds both workspaces.

## Run Self-Hosted

```bash
export NODE_ENV=production
npm run start:self-hosted
```

`start:self-hosted` runs `prisma migrate deploy` before booting services, then starts:

- API: `HOST` / `PORT`
- Web: `WEB_HOST` / `WEB_PORT`

For production, put a reverse proxy or process manager in front of these services. Configure the public web origin in `CORS_ORIGIN` and build the frontend with the public API origin in `VITE_API_BASE_URL`.

## Separate Process Mode

If your host runs separate services, use:

```bash
npm run db:migrate
npm run start:api
npm run start:web
```

Run `npm run db:migrate` on every API boot or release before accepting traffic.

## Validation

```bash
npm run db:validate
npm run db:generate
npm run db:migrate
npm run test:e2e
npm run format:check
npm run lint
npm run typecheck
npm run build
```
