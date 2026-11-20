# LinkedIn Job CLI

A LinkedIn job search application built around the Model Context Protocol (MCP). Supports CLI, REST API, web UI, and automated job alerts with notifications.

## Setup

```bash
npm install
cd packages/linkedin-mcp-search && npm run build
```

## Chrome Setup (Required for Job Alerts)

The scraper launches its own **headless** Chrome on every run, using a dedicated
profile (`~/.chrome-scraper`) that holds your LinkedIn session. You never see a
browser window — results just print in the terminal and arrive as desktop
notifications.

### First-time login (once)

1. Open a visible Chrome on the scraper profile:

```bash
npm run chrome
```

2. Log into LinkedIn in that window.
3. **Quit that Chrome** (Cmd+Q). Chrome will not start headless while another
   Chrome has the same profile open. Your session cookies stay saved in
   `~/.chrome-scraper`.

### Running the job alert cron

```bash
npm run cron
```

Pick where to search when prompted:

```
  1  India
  2  Dubai, Abudhabi
```

The cron then searches every 10 minutes, notifies you of new jobs posted within 5 hours, and tracks seen jobs to avoid duplicates. When no terminal is attached (e.g. launched from a real crontab), it skips the prompt and uses option 1.

Option 2 covers two cities — LinkedIn accepts one location per query, so each cycle searches Dubai and Abu Dhabi in turn and merges the results, which makes a cycle take roughly twice as long.

### Optional overrides

| Variable | Default | Purpose |
|---|---|---|
| `CHROME_PATH` | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | Chrome executable to launch |
| `CHROME_USER_DATA_DIR` | `~/.chrome-scraper` | Profile holding the LinkedIn session |
| `CHROME_HEADLESS` | `true` | Set to `false` to watch the browser while debugging |

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
