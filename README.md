# Hirie.io — AI-Powered ATS & Recruitment Platform

An end-to-end SaaS Applicant Tracking System (ATS) built for recruitment teams. Recruiters batch-upload resumes, Mistral AI parses and scores each one in the background, and managers track pipeline health through role-specific dashboards, analytics, and real-time notifications.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), TypeScript, TanStack Query v5, Recharts, Sonner (toasts) |
| **Styling** | Vanilla CSS with CSS custom properties (dark/light theme) |
| **Backend** | Node.js 18+, Express 4, BullMQ 5, Multer |
| **Database** | Supabase Postgres (Row Level Security) |
| **Auth** | Supabase Auth (email/password) — JWT passed to Express middleware |
| **Storage** | Supabase Storage (`resumes` bucket, signed URLs) |
| **Queue** | Redis 7 + BullMQ (background resume processing) |
| **AI / LLM** | Mistral AI (`mistral-small-latest` for parse+score, `pixtral-12b` for Vision OCR) |
| **Parsing** | `pdf-parse`, `mammoth` (DOCX), `pdf2pic` + Mistral Vision (scanned PDF fallback) |
| **Security** | `helmet`, `express-rate-limit` (200 req/15 min), CORS, role-based middleware |

---

## Project Structure

```
Hirie.io/
├── frontend/                        # Next.js 16 App (TypeScript)
│   ├── app/
│   │   ├── page.tsx                 # Public landing page
│   │   ├── login/page.tsx           # Sign-in / sign-up
│   │   └── dashboard/
│   │       ├── layout.tsx           # Sidebar nav (role-aware), NotificationBell
│   │       ├── page.tsx             # Dashboard home (role-specific KPIs)
│   │       ├── users/               # Admin: user management (CRUD + password reset)
│   │       ├── teams/               # Admin/Manager: team management
│   │       ├── my-teams/            # TL: manage own team members & job assignments
│   │       ├── jobs/
│   │       │   ├── page.tsx         # Job list (role-filtered)
│   │       │   ├── [id]/page.tsx    # Job detail, resume upload, candidate table
│   │       │   └── [id]/analytics/  # Per-job score analytics
│   │       ├── candidates/
│   │       │   ├── page.tsx         # "My Candidates" — personal upload history
│   │       │   └── [id]/page.tsx    # Candidate detail + AI score breakdown
│   │       ├── talent-pool/
│   │       │   ├── page.tsx         # Cross-job searchable talent pool
│   │       │   └── [id]/page.tsx    # Talent pool candidate profile
│   │       ├── track-submissions/
│   │       │   ├── page.tsx         # Submission leaderboard (by recruiter/team/job)
│   │       │   ├── recruiter/[id]/  # Recruiter drill-down with timeline chart
│   │       │   └── team/[id]/       # Team drill-down with member breakdown
│   │       ├── analytics/page.tsx   # Cross-job analytics dashboard
│   │       └── settings/page.tsx    # User profile & scoring threshold config
│   ├── components/
│   │   ├── NotificationBell.tsx     # Real-time notification bell (polling)
│   │   └── ThemeToggle.tsx          # Dark/light mode toggle
│   └── lib/
│       ├── api.ts                   # Typed API client (all endpoints + TypeScript types)
│       ├── context/UserContext.tsx  # Auth context (React Query, retry logic)
│       ├── supabase/                # Browser + server Supabase clients
│       └── theme.tsx                # CSS-variable theme provider
│
├── backend/                         # Express API + BullMQ Worker
│   └── src/
│       ├── index.js                 # App entry (Express, CORS, rate-limit, routes)
│       ├── routes/
│       │   ├── resumes.js           # Upload, candidate CRUD, status/hiring updates, delete
│       │   ├── jobs.js              # Job CRUD, team assignment, JD analytics
│       │   ├── users.js             # User CRUD, password reset (admin only)
│       │   ├── teams.js             # Team CRUD, member management, job assignment
│       │   ├── jobAssignments.js    # TL assigns specific jobs to recruiters
│       │   ├── notifications.js     # Notification list, mark-read, mark-all-read
│       │   ├── talentPool.js        # Cross-job candidate search pool
│       │   ├── submissions.js       # Track Submissions — KPIs by recruiter/team/job
│       │   ├── analytics.js         # Per-job + cross-job analytics
│       │   ├── export.js            # CSV export of candidate data
│       │   └── parseJd.js           # AI-assisted JD file parsing (PDF/DOCX → structured JSON)
│       ├── services/
│       │   ├── openaiService.js     # Mistral AI: single-call parse + ATS score
│       │   ├── parserService.js     # PDF/DOCX text extraction + Vision OCR fallback
│       │   ├── resumeValidator.js   # Heuristic + AI resume authenticity check
│       │   ├── activityLogger.js    # Notification fan-out helper
│       │   └── storageService.js    # Supabase Storage download helper
│       ├── workers/
│       │   └── resumeProcessor.js  # BullMQ worker (concurrency=5, graceful shutdown)
│       ├── queues/resumeQueue.js    # BullMQ queue definition
│       ├── middleware/
│       │   ├── auth.js              # JWT verification via Supabase
│       │   └── requireRole.js       # Role-based access guard
│       └── config/
│           ├── supabase.js          # Supabase service-role client
│           ├── redis.js             # IORedis connection
│           ├── openai.js            # Mistral client
│           └── logger.js            # Winston logger
│
├── supabase/
│   └── migrations/
│       ├── 00_initial_schema.sql    # Base tables: jobs, candidates, resume_scores
│       └── 01_rbac_schema.sql       # RBAC tables: users, teams, team_members,
│                                    #   notifications, talent_pool, job_recruiter_assignments
│
└── docker-compose.yml               # Redis 7 + Redis Commander UI (port 8081)
```

---

## Roles & Access Control

| Role | Access |
|------|--------|
| **Admin** | Full access: users, all teams, all jobs, all candidates, all analytics |
| **Manager** | Manages own teams & assigned jobs; sees all candidates under managed teams |
| **Team Leader (TL)** | Manages own team members; assigns jobs to recruiters; uploads resumes |
| **Recruiter** | Uploads resumes to explicitly assigned jobs; views/updates own candidates |

Role-based navigation and API-level enforcement ensure every user sees only what they're permitted to.

---

## Features

### 🔐 Authentication & Security
- Supabase Auth (email/password) with JWT-protected API routes
- Resilient auth client: distinguishes network errors from true session expiry — never logs you out on a connectivity blip
- Rate limiting: 200 requests per 15 minutes per IP
- Helmet security headers, CORS restricted to frontend origin

### 👤 User & Team Management
- Admin CRUD for users with role assignment and password reset
- Team creation with Manager and TL designation
- TLs can add/remove their own team members
- Jobs can be assigned to multiple teams via `job_teams`
- TLs explicitly assign specific jobs to individual recruiters via `job_recruiter_assignments`

### 💼 Job Management
- Full CRUD for job postings (title, company, JD, required skills, status: active/closed/draft)
- AI-powered JD parser — upload a PDF/DOCX and get structured JSON (title, company, description, skills) automatically
- Custom scoring criteria per job (pass/review thresholds + dimension weights)
- Job status guard: recruiters and TLs cannot upload to closed/draft jobs

### 📤 Resume Upload & Processing Pipeline
1. **Upload** — Drag & drop up to 100 PDF/DOCX resumes (max 20 MB each); SHA-256 duplicate detection within job
2. **Storage** — Uploaded to Supabase Storage at `resumes/{job_id}/{candidate_id}.ext`
3. **Queue** — BullMQ job enqueued with 3-attempt exponential backoff (5 s base)
4. **Talent Pool** — Candidate immediately added to cross-job talent pool (deduplicated by `resume_hash`)
5. **Worker** picks up job:
   - Extracts text via `pdf-parse` / `mammoth`
   - Falls back to **Mistral Vision OCR** (`pixtral-12b-2409`) for scanned PDFs with < 30 words
   - Heuristic resume validation (score 0–100); borderline files sent to AI classifier
   - Single Mistral API call: **parses name/email/phone/skills/titles/experience/location AND scores** the resume simultaneously
   - Saves score to `resume_scores`; syncs enriched profile to `talent_pool`
6. **Notifications** — TL, team manager, and all admins notified on upload, status changes, and hiring updates

### 🤖 AI Scoring
Uses **Mistral AI** (`mistral-small-latest`) in a single JSON-mode API call per resume:

```json
{
  "score": 82.5,
  "status": "pass",
  "dimension_scores": {
    "technical_skills": 88,
    "experience": 80,
    "education": 75,
    "soft_skills": 70
  },
  "strengths": ["5+ yrs React", "TypeScript expert", "Microservices experience"],
  "weaknesses": ["No Docker/Kubernetes", "Limited cloud exposure"],
  "matched_skills": ["React", "TypeScript", "Node.js", "REST APIs"],
  "missing_skills": ["Docker", "Kubernetes", "AWS"],
  "experience_match": 80,
  "education_match": 75,
  "summary": "Rahul is a strong frontend engineer with 5 years of React/TypeScript..."
}
```

**Default scoring weights**: Technical Skills 35% · Experience 30% · Education 20% · Soft Skills 15%  
**Default thresholds**: Pass ≥ 70 · Review ≥ 50 · Fail < 50 (all configurable per job)

Score status can also be **manually overridden** to `pass` with a mandatory reason (audit trail preserved).

### 📋 Candidate Management
- Candidate table per job with score badges, status filters, and recruiter attribution
- Detail view: full AI analysis, skill badges, strengths/weaknesses, resume download (1-hour signed URL)
- Pipeline status: `uploaded → scored → shortlisted → interview → rejected`
- Hiring status tracking: `client_screening → interview_l1/l2/l3 → job_offered → joined / rejected / backout / duplicate`
- Secure delete: removes storage file, talent pool entry, and candidate row (cascades scores)

### 🔍 Talent Pool
- Unified, searchable pool of all candidates across all jobs
- Deduplication by SHA-256 resume hash — same CV uploaded for multiple jobs appears once
- Filter by: keyword (name/skills/titles), location, uploader, experience range, date range
- Paginated with 24 results per page

### 📬 Track Submissions
- **Summary KPIs**: total pass submissions, jobs handled, active recruiters, avg score, top recruiter
- **By Recruiter**: leaderboard with submission count, job count, avg score; drill-down to per-recruiter timeline + candidate list
- **By Team**: team leaderboard; drill-down shows member breakdown, charts, jobs handled, passed candidates
- **By Job**: job leaderboard; drill-down shows recruiter breakdown and submission timeline
- All views support **date-range filtering** (`date_from`, `date_to`)

### 📊 Analytics
- Per-job analytics: score distribution histogram, top matched/missing skills, hiring status breakdown
- Cross-job dashboard: global KPIs, score trends, top performers (role-scoped for TL/Manager/Recruiter)

### 🔔 Notifications
- Real-time notification bell (polling, unread badge count)
- Events: resume uploaded, candidate status changed, hiring status updated, score overridden
- Mark individual or all notifications as read

### ⚙️ Settings
- Profile update (display name)
- Per-job scoring criteria editor (thresholds + dimension weights with live preview)

### 📁 CSV Export
- One-click CSV export of all candidates for a job (name, email, phone, score, status, skills, summary)

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `users` | Platform users with roles (admin/manager/tl/recruiter) |
| `teams` | Teams with manager_id and tl_id |
| `team_members` | Many-to-many: users ↔ teams |
| `jobs` | Job postings with scoring_criteria JSONB |
| `job_teams` | Many-to-many: jobs ↔ teams |
| `job_recruiter_assignments` | Explicit recruiter → job assignment by TL |
| `candidates` | Uploaded resumes + extracted contact info + hiring state |
| `resume_scores` | AI score, dimension scores, skills matched/missing, summary |
| `talent_pool` | Cross-job deduplicated candidate pool (keyed by resume_hash) |
| `notifications` | Activity feed per user |

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Docker Desktop (for Redis)
- Supabase project (free tier works)
- Mistral AI API key — get one at [console.mistral.ai](https://console.mistral.ai/api-keys)

### 2. Database Setup

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Run `supabase/migrations/00_initial_schema.sql` (base tables)
3. Run `supabase/migrations/01_rbac_schema.sql` (RBAC, talent pool, notifications)

### 3. Environment Variables

**Backend** — copy `backend/.env.example` → `backend/.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

MISTRAL_API_KEY=your-mistral-api-key
MISTRAL_MODEL=mistral-small-latest

REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

**Frontend** — copy `frontend/.env.local.example` → `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start Services

```bash
# Terminal 1 — Redis (via Docker)
docker-compose up -d redis

# Terminal 2 — Express API (includes embedded worker)
cd backend && npm install && npm run start

# Terminal 3 — Next.js Frontend
cd frontend && npm install && npm run dev
```

> **Note**: `npm run start` starts the API **and** embeds the BullMQ worker in the same process. For production or higher throughput, run the worker separately:
> ```bash
> # Separate worker process (optional, recommended for production)
> cd backend && npm run worker
> ```

Open **http://localhost:3000**  
Redis Commander (queue monitor): **http://localhost:8081**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET/POST` | `/api/users` | List users / create user (admin) |
| `GET/PATCH/DELETE` | `/api/users/:id` | Get / update / delete user |
| `POST` | `/api/users/:id/reset-password` | Reset user password (admin) |
| `GET/POST` | `/api/teams` | List / create teams |
| `GET/PATCH/DELETE` | `/api/teams/:id` | Team detail / update / delete |
| `POST/DELETE` | `/api/teams/:id/members/:userId` | Add / remove team member |
| `POST/DELETE` | `/api/teams/:id/assign-jobs` | Assign / remove jobs from team |
| `GET/POST` | `/api/jobs` | List / create jobs |
| `GET/PATCH/DELETE` | `/api/jobs/:id` | Job detail / update / delete |
| `POST` | `/api/jobs/:id/upload` | Batch upload resumes (multipart) |
| `GET` | `/api/jobs/:id/candidates` | List candidates for a job |
| `GET` | `/api/jobs/:id/analytics` | Per-job analytics |
| `GET` | `/api/jobs/:id/export` | CSV export |
| `GET` | `/api/candidates/:id` | Candidate detail + AI scores |
| `PATCH` | `/api/candidates/:id/status` | Update pipeline status |
| `PATCH` | `/api/candidates/:id/hiring-status` | Update hiring status |
| `PATCH` | `/api/candidates/:id/score-override` | Force-pass a candidate |
| `POST` | `/api/candidates/:id/reprocess` | Re-queue for AI scoring |
| `DELETE` | `/api/candidates/:id` | Delete candidate + storage + pool |
| `GET` | `/api/candidates/search` | Keyword/filter candidate search |
| `GET` | `/api/candidates/my-count` | Count of current user's uploads |
| `GET/POST/DELETE` | `/api/job-assignments` | Recruiter ↔ job assignment |
| `GET` | `/api/talent-pool` | Paginated talent pool search |
| `GET` | `/api/talent-pool/:id` | Talent pool candidate detail |
| `GET` | `/api/notifications` | List notifications + unread count |
| `PATCH` | `/api/notifications/:id/read` | Mark notification read |
| `POST` | `/api/notifications/read-all` | Mark all notifications read |
| `GET` | `/api/submissions/summary` | Global KPI summary |
| `GET` | `/api/submissions/by-recruiter` | Recruiter leaderboard |
| `GET` | `/api/submissions/by-recruiter/:id` | Recruiter drill-down |
| `GET` | `/api/submissions/by-team` | Team leaderboard |
| `GET` | `/api/submissions/by-team/:id` | Team drill-down |
| `GET` | `/api/submissions/by-job` | Job leaderboard |
| `GET` | `/api/submissions/by-job/:id` | Job drill-down |
| `POST` | `/api/parse-jd` | AI-parse a JD file → structured JSON |
| `GET` | `/api/analytics/dashboard` | Cross-job analytics dashboard |

---

## Redis Commander UI
After starting docker-compose, visit **http://localhost:8081** to monitor the BullMQ queue in real time.

---

## Development Scripts

```bash
# Backend
npm run start       # Production (API + embedded worker)
npm run dev         # Development with nodemon
npm run worker      # Standalone BullMQ worker
npm run worker:dev  # Worker with nodemon

# Frontend
npm run dev         # Next.js dev server (http://localhost:3000)
npm run build       # Production build
npm run lint        # ESLint
```
