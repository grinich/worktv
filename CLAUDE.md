# WorkOS TV

Private video library for Zoom meeting recordings with AI-powered transcript summaries.

## Tech Stack

- Next.js 16 with App Router
- React 19
- Tailwind CSS 4
- SQLite via better-sqlite3
- Anthropic Claude API for AI summaries

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   └── recordings/
│   │       └── [id]/
│   │           └── summary/  # AI summary generation endpoint
│   └── recordings/
│       └── [id]/          # Recording detail page
├── components/
│   ├── summary/           # AI summary panel component
│   └── video/             # Video player components
├── lib/
│   ├── ai/
│   │   └── summarize.ts   # Claude API integration for summaries
│   ├── db/
│   │   ├── index.ts       # Database operations
│   │   └── schema.sql     # SQLite schema
│   └── zoom/
│       └── auth.ts        # Zoom OAuth token management
├── hooks/                 # React hooks
└── types/                 # TypeScript types
scripts/
└── sync-zoom.ts           # Zoom recording sync script
data/
└── workos-tv.db           # SQLite database
```

## Database Schema

Key tables:
- `recordings` - Meeting metadata (title, date, duration, etc.)
- `transcript_segments` - Transcript with timestamps and speakers
- `speakers` - Speaker information with colors
- `summaries` - Cached AI-generated summaries
- `video_files` - Multiple video views per recording

## AI Summaries

Summaries are generated on-demand using Claude Haiku 4.5 when viewing a recording. The summary format (Gong-style):
- **Brief**: 1-2 sentence meeting overview
- **Key Points**: Up to 10 bullet points of key discussion items
- **Next Steps**: Action items with owners

Summaries are cached in the database after generation. Users can regenerate via the UI.

Key file: `src/lib/ai/summarize.ts`
- Model: `claude-haiku-4-5-20251001`
- Max tokens: 8192 (to prevent truncation)

## Environment Variables

Required in `.env.local`:
```
# Zoom Server-to-Server OAuth (for syncing recordings)
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Anthropic API (for AI summaries)
ANTHROPIC_API_KEY=
```

## Commands

```bash
npm run dev      # Start development server
npm run sync     # Sync recordings from Zoom and generate preview GIFs
npm run build    # Production build
npm run lint     # Run ESLint
```

### Sync Command Options

The `npm run sync` command now automatically generates preview GIFs after syncing:

```bash
npm run sync                    # Full sync + preview generation
npm run sync -- --no-previews   # Sync only, skip preview generation
npm run sync -- --force         # Force re-sync all recordings + previews

# Advanced options
npm run sync -- --years=5                   # Sync last 5 years
npm run sync -- --parallel=10               # Process 10 recordings in parallel
npm run sync -- --parallel-windows=12       # Fetch 12 date ranges in parallel
```

Preview generation options (when running separately):
```bash
npx tsx scripts/generate-previews.ts                 # Generate missing previews
npx tsx scripts/generate-previews.ts --force         # Regenerate all previews
npx tsx scripts/generate-previews.ts --parallel=5    # Process 5 recordings in parallel
npx tsx scripts/generate-previews.ts --parallel-gifs=4  # Extract 4 GIF candidates in parallel
```

## API Endpoints

- `GET /api/recordings` - List recordings with search/filter
- `GET /api/recordings/[id]` - Get recording details
- `GET /api/recordings/[id]/summary` - Get cached summary
- `POST /api/recordings/[id]/summary` - Generate/regenerate summary
- `GET /api/speakers` - List all speakers
