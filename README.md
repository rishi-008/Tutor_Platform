# Tutor Platform (Tutor Connect)

Full‑stack tutoring marketplace that connects students with qualified tutors, manages the end‑to‑end session lifecycle, and supports real-time-ish session collaboration (chat + resources). The app was built to run on a DigitalOcean droplet and uses Postgres as the source of truth.

> **Note:** This was a demo deployment that has since been taken down for budget reasons, so there is no live site to link to. The sections below document the architecture and features as built; you can run it locally by following [Local Development / Running](#local-development--running).

## Demo login (one-click)

The app supports a one-click demo login (no setup required) at the `/demo/student` and `/demo/tutor` routes.

Demo credentials (manual login):

- Student: `student1@example.com` / `password123`
- Tutor: `tutor1@example.com` / `password123`

Note: For public demo safety, each session is limited to 6 chat messages (additional messages are rejected).

For your own deployment, the demo endpoints will default to the emails above as long as those users exist in your database. You can also override which accounts are used via env vars:

- `DEMO_STUDENT_ID` (a valid `users.id` where `user_type = 'student'`) **or** `DEMO_STUDENT_EMAIL`
- Optional: `DEMO_TUTOR_ID` (a valid `users.id` where `user_type = 'tutor'`) **or** `DEMO_TUTOR_EMAIL`

## Highlights

- **Role-based accounts**: Students and tutors share a `users` table with `user_type`, with profile data stored in `students` / `tutors`.
- **Session lifecycle**: Create session requests (pending), approve into active sessions, and end/cancel sessions.
- **In-session collaboration**: Chat messages persist to the DB (`sessions.chat_messages`) and resources are attached to sessions.
- **Profile media uploads**: Optional profile picture upload for students/tutors with CDN-friendly URLs.
- **Tutor verification**: Tutors upload proof-of-qualification documents.
- **AI “Session Pack”**: Generates a structured summary (summary + action items + misconceptions + quiz) using OpenAI when configured, with a deterministic **per-active-session cap of 5** generations to control API usage.

## Tech Stack

- **Frontend**: React 18 (CRA), `react-router-dom`
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (`pg`)
- **Object storage**: DigitalOcean Spaces (S3-compatible) via AWS SDK v3 (`@aws-sdk/client-s3`)
- **AI**: OpenAI Node SDK (`openai`) for `/api/ai/session-pack`

## Repo Structure

- `frontend/`: React application
- `express/`: Express API server (also serves the built React app)
- `express/schema.sql`: Postgres schema
- `deploy.sh` / `deploy.ps1`: build + run helpers

## Architecture (high level)

1. React UI calls JSON APIs under `/api/*`.
2. Express serves:
	 - REST endpoints (`/api/...`)
	 - the production React build (`frontend/build`) as static content
3. Postgres stores users, tutors/students, sessions, chat messages, and generated session artifacts.
4. Uploaded assets (profile pics / proof docs) are stored in **DigitalOcean Spaces** when configured; otherwise the server falls back to local disk under `express/uploads/`.

## Local Development / Running

### Prerequisites

- Node.js (18+ recommended)
- PostgreSQL

### 1) Create the database schema

Run the schema in `express/schema.sql`:

```bash
psql "$DATABASE_URL" -f express/schema.sql
```

### 2) Set environment variables

The backend reads configuration from environment variables (commonly injected via systemd in production).

Required:

- `DATABASE_URL` (example: `postgres://user:pass@host:5432/dbname`)

Optional (AI Session Pack):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

Optional (DigitalOcean Spaces uploads):

- `DO_SPACES_ACCESS_KEY`
- `DO_SPACES_SECRET_KEY`
- `DO_SPACES_REGION` (default: `tor1`)
- `DO_PROFILE_PICS_BUCKET` (default: `tutor-platform-profile-pics`)
- `DO_PROFILE_PICS_PUBLIC_BASE_URL` (public base URL for objects)
- `DO_SPACES_ENDPOINT` (defaults to `https://<region>.digitaloceanspaces.com`)

Optional (demo links):

- `DEMO_STUDENT_ID`
- `DEMO_STUDENT_EMAIL`
- `DEMO_TUTOR_ID`
- `DEMO_TUTOR_EMAIL`

### 3) Build the frontend

```bash
cd frontend
npm install
npm run build
```

### 4) Start the API server

```bash
cd ../express
npm install
node index.js
```

By default the server listens on `PORT=3000`.

## AI Session Pack usage cap

To prevent excessive API usage, AI session-pack generation is limited per active session:

- The backend tracks the counter in `sessions.ai_session_pack_count`.
- When `sessions.status` is `active`, the endpoint allows **max 5** generations.
- After the cap, the API returns HTTP `429` with `{ "message": "summary limit reached" }`.

If OpenAI is not configured (`OPENAI_API_KEY` missing), the endpoint returns a mock session pack.

## Deployment notes

- `deploy.sh` builds the frontend and then runs the Express server.
- If you run behind a reverse proxy, large uploads may fail with `413 Request Entity Too Large`.
	- Profile pics are limited to **2MB** by the backend.
	- Proof docs are limited to **8MB** by the backend.
	- Ensure the proxy limit (e.g., Nginx `client_max_body_size`) is set accordingly.

## Next improvements

- Add automated tests for key API flows and session lifecycle.
- Add CI pipeline for build + lint.