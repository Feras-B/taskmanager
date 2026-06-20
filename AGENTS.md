# AI Task Manager - Agent Guide

## Project Overview

**AI Task Manager** is a fullstack React application that uses Google Gemini AI to parse natural language task descriptions and help users organize their day. The app features an Arabic-language chat interface, real-time task parsing, and intelligent task categorization.

**Deployment Context**: Built for Google AI Studio (https://ai.studio)

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19.0.1 |
| **UI Framework** | Vite | 6.2.3 |
| **Styling** | Tailwind CSS | 4.1.14 |
| **Backend** | Express | 4.21.2 |
| **AI Integration** | @google/genai (Gemini) | 1.29.0 |
| **Language** | TypeScript | 5.8.2 |
| **Animations** | Motion | 12.23.24 |
| **Icons** | Lucide React | 0.546.0 |

## Directory Structure

```
taskmanager/
├── src/                    # React frontend source code
│   ├── App.tsx            # Main React component (task UI + chat interface)
│   ├── types.ts           # TypeScript type definitions (Task, ChatMessage)
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles
├── server.ts              # Express backend server (Gemini AI integration)
├── vite.config.ts         # Vite configuration with React & Tailwind plugins
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies and scripts
├── index.html             # HTML entry point
├── metadata.json          # AI Studio metadata
└── .env                   # Environment variables (GEMINI_API_KEY)
```

## Key Features & Architecture

### Frontend (React)
- **App.tsx**: Monolithic component managing:
  - Task list display (pending/completed)
  - AI chat interface for task input
  - Real-time task categorization and approval workflow
  - localStorage persistence for tasks and chat history
- **Types**: `Task` (id, title, category, priority, time, completed) and `ChatMessage` (role, content, tasks)

### Backend (Express Server)
- **Server.ts**: 
  - `/api/parse-tasks` POST endpoint processes user input via Gemini API
  - System instruction in Arabic instructs AI to categorize tasks and return JSON
  - Extracts JSON from AI response and returns structured task data
  - HMR disabled in AI Studio environment (`DISABLE_HMR` env var)

### AI Integration
- **Model**: `gemini-3-flash-preview`
- **System Instruction**: Arabic prompt that:
  - Analyzes tasks and categorizes them (work, personal, health, social, other)
  - Suggests priority levels and suggested times
  - Maintains conversational, encouraging tone
  - Returns response with embedded JSON block for machine parsing

## Development Workflow

### Setup
```bash
npm install                          # Install dependencies
# Set GEMINI_API_KEY in .env.local  # Required for local development
npm run dev                          # Start development server (localhost:3000)
```

### Build & Deploy
```bash
npm run build    # Build frontend + bundle server for production
npm start        # Run production build
npm run clean    # Remove dist/ and server.cjs
npm run lint     # TypeScript type checking (no code generation)
```

### Development Server
- Vite dev server with HMR enabled (disabled in AI Studio via `DISABLE_HMR`)
- tsx runs server.ts directly for fast iteration
- Changes to React components hot-reload; server changes require restart

## Important Implementation Details

### Task Lifecycle
1. User sends message via chat → `/api/parse-tasks` called
2. Gemini AI parses tasks from text, returns JSON response
3. Frontend receives AI reply + parsed tasks → shows in "pending tasks" view
4. User approves/ignores → tasks added to main list or discarded
5. Tasks persisted to localStorage and displayed in task list

### Type Safety
- All major data structures use TypeScript interfaces (`Task`, `ChatMessage`)
- No runtime type validation; ensure API responses match interface definitions
- `tsconfig.json` uses ES2022 target with strict path resolution

### State Management
- Simple React hooks + localStorage (no Redux/Context)
- `App.tsx` is the single source of truth
- `useEffect` hooks sync state to localStorage on every change
- Chat history loaded from localStorage on initial render

### Styling
- Tailwind CSS 4.1.14 with vite plugin
- Custom scrollbar styles in index.css (`.custom-scrollbar`)
- No CSS modules; all utility classes
- Arabic RTL support via HTML lang attributes (left/right properties)

### Environment Variables
- `GEMINI_API_KEY`: Required for Gemini API calls (set in `.env.local` for dev, production env)
- `DISABLE_HMR`: When "true", disables Vite HMR and file watching (set by AI Studio)
- `NODE_ENV`: Switches between dev (Vite middleware) and production (static file serving)

## Common Development Tasks

### Adding a New Task Category
1. Update `category` type in [src/types.ts](src/types.ts)
2. Update system instruction in [server.ts](server.ts) to recognize new category
3. Add icon mapping in `getCategoryIcon()` in [src/App.tsx](src/App.tsx)

### Modifying AI Response Format
- Edit `SYSTEM_INSTRUCTION` in [server.ts](server.ts) (Arabic text)
- Update JSON parsing logic if changing response structure
- Remember Gemini returns text; JSON must be extracted via regex

### Styling Changes
- Modify Tailwind classes in [src/App.tsx](src/App.tsx) or [src/index.css](src/index.css)
- Tailwind config is implicit (Vite plugin uses defaults)
- Watch for Arabic text rendering (ensure `direction: rtl` where needed)

### Adding Server Routes
- Add new `app.post()` or `app.get()` in [server.ts](server.ts)
- Keep exports internal; Express listens on `127.0.0.1:3000`
- Return JSON responses; frontend expects `{ reply, tasks }` structure

## Potential Pitfalls

- **Missing GEMINI_API_KEY**: App will fail silently when calling AI; always check `.env.local` setup
- **HMR in AI Studio**: File watching is intentionally disabled to prevent flickering during agent edits
- **localStorage Limits**: Task list can grow large; consider pagination for production
- **AI JSON Parsing**: If Gemini response format changes, regex extraction may fail silently
- **Timezone Handling**: Task `time` field is text-only; no timezone conversion logic
- **RTL Text**: Arabic text assumes `dir="rtl"` is set; check HTML direction for consistency

## Related Documentation

- [README.md](README.md) - User-facing setup instructions
- [package.json](package.json) - Dependency list and build scripts
- [.env](.env) - Environment configuration

---

**Last Updated**: May 22, 2026  
**Status**: Production-ready for AI Studio deployment
