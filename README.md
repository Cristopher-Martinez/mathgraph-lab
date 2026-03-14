# MathGraph Lab

AI-powered mathematics learning platform with adaptive curriculum, interactive geometry, and intelligent tutoring. Focused on inequalities, analytic geometry, line equations, and exam preparation.

![Node.js](https://img.shields.io/badge/Node.js-22-green)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Prisma](https://img.shields.io/badge/Prisma-6-purple)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Student progress overview with topic cards and learning metrics |
| **Topic Explorer** | Browse math topics with formulas, exercises, and prerequisites |
| **DAG Map** | Interactive dependency graph showing the learning path between topics |
| **Practice** | Solve exercises with instant feedback and interval visualization |
| **Geometry Lab** | Interactive canvas for points, distances, slopes, midpoints, and line equations |
| **AI Tutor** | Socratic-method tutoring with step-by-step explanations (Gemini API) |
| **Training Mode** | Guided practice, timed drills, and full exam simulator |
| **Class Log** | Record class sessions with transcript analysis and image processing |
| **RAG Chat** | Ask questions about class content with context-aware AI responses |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite, KaTeX, React Konva, React Flow |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | Prisma ORM + SQLite |
| **AI** | Google Gemini API (2.5-flash / 2.5-pro), Tesseract.js (OCR) |
| **Infra** | Docker, Docker Compose, Nginx, GitHub Actions CI/CD |

## Quick Start

### Prerequisites

- Node.js 22+
- npm 9+

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Cristopher-Martinez/mathgraph-lab.git
cd mathgraph-lab

# 2. Install dependencies
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# 4. Initialize database
npx prisma migrate dev
npx prisma generate

# 5. Seed database
cd backend && npx ts-node src/seed.ts && cd ..

# 6. Start backend (terminal 1)
npm run server

# 7. Start frontend (terminal 2)
npm run dev
```

Frontend: `http://localhost:5173` — Backend: `http://localhost:3001`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | No | Google Gemini API key for AI features. App works offline without it. |
| `AUTH_USERS` | Yes | Login credentials in format `user1:pass1,user2:pass2` |
| `DATABASE_URL` | Yes | Prisma database URL (default: `file:../prisma/dev.db`) |

## Math Solver Engine

Deterministic algebraic solver with no AI dependency:

- **Geometry**: distance, midpoint, slope, line equations (point-slope, two-point), parallel/perpendicular detection, point-to-line distance
- **Inequalities**: linear, absolute value, and quadratic inequalities with sign chart analysis
- **Validation**: type-specific solution checking with detailed feedback

## Project Structure

```
├── frontend/          # React SPA
│   └── src/
│       ├── pages/     # Route pages (Dashboard, Practice, DAG, etc.)
│       ├── components/# Reusable UI components
│       ├── context/   # React context providers
│       └── services/  # API client functions
├── backend/           # Express API server
│   └── src/
│       ├── routes/    # REST API endpoints
│       ├── services/  # AI, RAG, analysis services
│       └── solver/    # Deterministic math engine
├── prisma/            # Database schema and migrations
├── tests/             # Integration tests
├── Dockerfile         # Multi-stage production build
└── docker-compose.yml # Container orchestration
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run server` | Start backend (auto-migrate + seed) |
| `npm test` | Run test suite |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Seed database with exercises |

## Docker Deployment

```bash
# Build and run locally
docker compose up --build

# Production (uses GHCR image)
docker compose up -d
```

The CI/CD pipeline automatically builds, pushes to GitHub Container Registry, and deploys on push to `master`.

## License

MIT
