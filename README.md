# ResumeFlow — AI-Powered Candidate Screening

An end-to-end SaaS ATS (Applicant Tracking System) that lets recruiters batch-upload resumes and get AI-scored, ranked candidates in minutes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TailwindCSS v4, TanStack Query, Recharts |
| Backend | Node.js + Express, BullMQ, multer |
| Database | Supabase Postgres (with RLS) |
| Storage | Supabase Storage |
| Queue | Redis + BullMQ |
| AI | OpenAI GPT-4o-mini |
| Parsing | pdf-parse, mammoth (DOCX), tesseract.js (OCR fallback) |

---

## Project Structure

```
ResumeFlowProd/
├── frontend/               # Next.js 16 App
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── login/page.tsx        # Auth (sign up / sign in)
│   │   └── dashboard/
│   │       ├── page.tsx          # Dashboard home
│   │       ├── jobs/page.tsx     # Jobs list
│   │       ├── jobs/new/         # Create job
│   │       ├── jobs/[id]/        # Job detail + upload + analytics
│   │       └── candidates/[id]/  # Candidate detail + AI scores
│   ├── lib/
│   │   ├── api.ts                # Typed API client
│   │   └── supabase/             # Browser + server clients
│   └── proxy.ts                  # Auth guard (Next.js 16 proxy)
│
├── backend/                # Express API + Workers
│   └── src/
│       ├── index.js              # App entry point
│       ├── routes/               # jobs, resumes, analytics, export
│       ├── workers/
│       │   └── resumeProcessor.js  # BullMQ worker
│       ├── queues/resumeQueue.js
│       └── services/
│           ├── openaiService.js  # GPT-4o-mini scoring
│           ├── parserService.js  # PDF/DOCX/OCR parsing
│           └── storageService.js # Supabase Storage helpers
│
├── supabase/
│   └── migrations/
│       └── 00_initial_schema.sql # Full DB schema + RLS + Storage
│
└── docker-compose.yml      # Redis + Redis Commander UI
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Docker Desktop (for Redis)
- Supabase project (free tier works)
- OpenAI API key

### 2. Database Setup

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Paste and run the contents of `supabase/migrations/00_initial_schema.sql`

### 3. Environment Variables

**Backend** — copy `backend/.env.example` to `backend/.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
FRONTEND_URL=http://localhost:3000
```

**Frontend** — copy `frontend/.env.local.example` to `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start Services

```bash
# Terminal 1 — Redis
docker-compose up -d redis

# Terminal 2 — Background Worker
cd backend && npm install && npm run worker

# Terminal 3 — Express API
cd backend && npm run start

# Terminal 4 — Next.js Frontend
cd frontend && npm run dev
```

Then open **http://localhost:3000**

---

## Features

- **Authentication** — Supabase Auth (email/password), JWT-protected API routes
- **Job Management** — Create, list, and manage job postings with required skills
- **Batch Upload** — Drag & drop up to 100 PDF/DOCX resumes per job
- **Async Processing** — BullMQ workers download, parse, and score resumes in background
- **AI Scoring** — GPT-4o-mini evaluates each resume and returns score 0–100 with full breakdown
- **Smart Shortlisting** — Automatic Pass (≥70) / Review (50–69) / Fail (<50) labels
- **OCR Fallback** — Scanned PDFs are automatically processed via Tesseract.js
- **Analytics** — Score distribution charts, top skills, missing skills across the entire candidate pool
- **CSV Export** — One-click download of all candidate data
- **Resume Download** — Signed Supabase Storage URL for each resume

---

## Score Schema

```json
{
  "score": 85,
  "status": "pass",
  "strengths": ["5+ yrs React", "TypeScript expert"],
  "weaknesses": ["No Docker experience"],
  "matched_skills": ["React", "TypeScript", "Node.js"],
  "missing_skills": ["Docker", "Kubernetes"],
  "experience_match": 90,
  "education_match": 80,
  "summary": "Strong frontend candidate with..."
}
```

---

## Redis Commander UI
After starting docker-compose, visit **http://localhost:8081** to monitor the queue.
