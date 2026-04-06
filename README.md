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

The cron searches for jobs every 5 minutes, notifies you of new jobs posted within 5 hours, and tracks seen jobs to avoid duplicates.

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
└── .seen-jobs.json                 # Tracked jobs (auto-generated)
```
