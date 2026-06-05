# myClawTeam Product Snapshot

myClawTeam is a self-hostable social photo app. Users sign in with Google, create profiles, upload image posts with captions, browse feeds, like and comment on posts, and follow other users.

## Current Capabilities

- Google OAuth backend flow provisions users on first login, validates required Google settings, and shows a clear configuration page when sign-in is not configured.
- JWT auth protects current-user, profile edit, post creation, like/comment, and follow routes.
- Profiles expose username, avatar URL, bio, post count, follower count, and following count.
- Profile UI supports editing profile fields and uploading an avatar.
- Post creation supports image upload to S3-compatible object storage and stores post metadata in PostgreSQL.
- Users can view global and followed feeds with cursor pagination.
- Users can view single posts, user post grids, likes, comments, followers, and following lists.
- Frontend includes auth context, sign-in flow, logged-in user display, profile pages, create-post UI, feed UI with infinite scroll, post detail UI, and like/comment/follow controls.
- E2E coverage exercises login-equivalent JWT auth, post creation/metadata, feed, like, comment, follow, validation, and centralized error responses.

## Architecture

- Monorepo with two npm workspaces:
  - `apps/api`: Express API, Prisma ORM, PostgreSQL, JWT, Google OAuth, and S3-compatible object storage helpers.
  - `apps/web`: Vite + React frontend.
- PostgreSQL is the only persistent data store. Prisma migrations define `users`, `posts`, `likes`, `comments`, and `follows`.
- Object storage is S3-compatible and all uploaded object keys are prefixed with `OBJECT_STORAGE_PREFIX`.
- API and web are deployed as separate services/origins; browser API calls use `VITE_API_BASE_URL`.
- API CORS is configured with `CORS_ORIGIN`.
- Self-hosted startup runs Prisma migrations before starting API and web services.

## Conventions

- Required runtime configuration is documented in `.env.example`.
- Google OAuth setup is documented in the self-hosted deployment README, including Google Cloud origins, redirect URI, required env vars, and verification checklist.
- API errors use a centralized `{ error: { code, message } }` response shape.
- Use `npm run build:self-hosted` for production builds.
- Use `npm run start:self-hosted` to run migrations on boot and start API plus web preview.
- Validation stack: `db:validate`, `db:generate`, `db:migrate`, `test:e2e`, `format:check`, `lint`, `typecheck`, and `build`.
