# LinkedIn Job CLI

A LinkedIn job search application built around the Model Context Protocol (MCP). Supports CLI, REST API, web UI, and automated job alerts with notifications.

## Setup

```bash
npm install
cd packages/linkedin-mcp-search && npm run build
```

## Chrome Setup (Required for Job Alerts)

The cron job scraper uses Puppeteer to connect to a Chrome instance with your LinkedIn session.

### First-time setup

1. Launch Chrome with a separate scraper profile:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-scraper"
```

2. Log into LinkedIn in that Chrome window.
3. You can now close it. Your session cookies are saved in `~/.chrome-scraper`.

### Running the job alert cron

1. Start the scraper Chrome (runs alongside your normal Chrome):

```bash
npm run chrome
```

2. In a separate terminal, start the cron:

```bash
npm run cron
```

3. Pick where to search when prompted:

```
  1  India
  2  Dubai, Abudhabi
  3  Singapore
  4  All — India, Singapore, Dubai, Abudhabi
```

The cron then searches every 10 minutes, notifies you of new jobs posted within 5 hours (or with fewer than 50 applicants), and tracks seen jobs to avoid duplicates. When no terminal is attached (e.g. launched from a real crontab), it skips the prompt and uses option 1.

Options 2 and 4 cover several locations — LinkedIn accepts one location per query, so each cycle searches them in turn and merges the results. A cycle takes roughly as many times longer as there are locations; option 4 can outlast the 10-minute interval, in which case the next cycle is skipped.

### What the cron searches for

The search profile lives in `search-profile.mjs` — edit it to change target roles without touching the cron:

- **`SEARCH_QUERIES`** — one LinkedIn keyword search per role family: management (Engineering Manager, Software Development Manager, Head of Mobile), team lead (React Native Lead, Frontend Lead) and senior IC (Senior React Native Developer, Senior Frontend Developer, Mobile Architect, Staff Mobile Engineer). Each runs in every selected location, and results are merged and de-duped.
- **`EXPERIENCE_LEVELS`** — Mid-Senior and Director.
- **`isRelevantTitle`** — management titles (manager, head, director, VP) are alerted on whatever the stack; lead and senior titles (lead, architect, principal, staff, senior) only when the title names a web or mobile stack (React, frontend, mobile, iOS, Android, …). Non-software ones (mechanical, civil, sales, product manager, …) are dropped.

Each query adds scraping time, so a cycle runs one search per query per location with a short pause between them. If a cycle outlasts the 10-minute interval, the next one is skipped rather than overlapping.

## Other Commands

```bash
# Interactive CLI
node app.js

# REST API + Web UI (API on :3001, Web on :5173)
npm run dev

# Build all packages
npm run build
```

## Project Structure

```
linkedin-job-cli/
├── packages/linkedin-mcp-search/   # Core MCP server (Puppeteer + Cheerio)
├── apps/api/                       # NestJS REST API
├── apps/web/                       # React + Vite frontend
├── app.js                          # Interactive CLI
├── cron-job-alert.js               # Background job monitor
├── locations.mjs                   # Shared search location presets
├── search-profile.mjs              # Target roles, levels, title filter for the cron
└── .seen-jobs.json                 # Tracked jobs (auto-generated)
```
