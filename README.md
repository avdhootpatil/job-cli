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
```

The cron then searches every 10 minutes, notifies you of new jobs posted within 5 hours, and tracks seen jobs to avoid duplicates. When no terminal is attached (e.g. launched from a real crontab), it skips the prompt and uses option 1.

Option 2 covers two cities — LinkedIn accepts one location per query, so each cycle searches Dubai and Abu Dhabi in turn and merges the results, which makes a cycle take roughly twice as long.

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
└── .seen-jobs.json                 # Tracked jobs (auto-generated)
```
