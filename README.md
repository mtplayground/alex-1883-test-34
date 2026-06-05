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

## Google OAuth Setup

Google sign-in requires a real OAuth 2.0 Client ID from Google Cloud. Do not use placeholder values in production; if these variables are absent, the API shows a "Google sign-in is not configured" page and logs the missing setting names at startup.

1. In Google Cloud Console, create or select a project.
2. Open **APIs & Services** > **OAuth consent screen** and configure the app name, support email, audience, and required profile/email scopes.
3. Open **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID**.
4. Select **Web application**.
5. Add the deployed browser origin under **Authorized JavaScript origins**.
   - Example: `https://app.example.com`
   - For a single-origin deployment, use that public origin.
   - For separate API and web origins, use the public web origin.
6. Add the API callback URL under **Authorized redirect URIs**.
   - The callback path must be `/api/auth/google/callback`.
   - Example single-origin callback: `https://app.example.com/api/auth/google/callback`
   - Example separate API callback: `https://api.example.com/api/auth/google/callback`
7. Copy the generated Client ID and Client Secret into the runtime environment.

Required Google OAuth environment:

```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Use one of these:
GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/google/callback
GOOGLE_BASE_URL=https://api.example.com
```

Use `GOOGLE_CALLBACK_URL` when you want to set the full redirect URI explicitly. Use `GOOGLE_BASE_URL` when the API origin is known and the app should derive `/api/auth/google/callback`.

For separate API and web origins:

```bash
VITE_API_BASE_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com
GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/google/callback
```

For a single public origin:

```bash
VITE_API_BASE_URL=
CORS_ORIGIN=https://app.example.com
GOOGLE_CALLBACK_URL=https://app.example.com/api/auth/google/callback
```

Verification checklist:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set to the real Google values.
- `GOOGLE_CALLBACK_URL` or `GOOGLE_BASE_URL` is set, and the final callback path is `/api/auth/google/callback`.
- Google Cloud **Authorized JavaScript origins** includes the deployed browser origin.
- Google Cloud **Authorized redirect URIs** includes the exact callback URL.
- The frontend was rebuilt after setting `VITE_API_BASE_URL`.
- `CORS_ORIGIN` includes the deployed browser origin when API and web are separate origins.
- `GET /api/auth/google` redirects to `accounts.google.com` when configured.
- If Google settings are missing, `GET /api/auth/google` returns the "Google sign-in is not configured" page naming the missing setting.

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
