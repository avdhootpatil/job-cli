# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

LinkedIn job search app built on Model Context Protocol (MCP). Four surfaces: interactive CLI, NestJS REST API, React web UI, and a cron-based job alert notifier. All surfaces are MCP clients that talk to a shared MCP server (`packages/linkedin-mcp-search`) which scrapes LinkedIn using Puppeteer + Cheerio.

## Commands

```bash
# Install everything (npm workspaces)
npm install

# Build MCP server (required before anything works)
cd packages/linkedin-mcp-search && npm run build

# Run interactive CLI
node app.js

# Run API (port 3001) + Web UI (port 5173) together
npm run dev

# Run cron job alerter (requires Chrome with LinkedIn session)
npm run chrome   # start Chrome with remote debugging
npm run cron     # start cron in separate terminal

# Build all packages
npm run build
```

## Architecture

**Monorepo** using npm workspaces + Turborepo.

```
Root
├── packages/linkedin-mcp-search/  ← MCP server (TypeScript, Puppeteer, Cheerio)
│   ├── src/index.ts               ← Server entry, tool dispatch (switch/case)
│   ├── src/linkedin.ts            ← Scraping logic (searchJobs, getJobDetails, etc.)
│   ├── src/browser.ts             ← Puppeteer browser management
│   ├── src/tools.ts               ← MCP tool definitions/schemas
│   └── src/types.ts               ← TypeScript types
├── apps/api/                      ← NestJS REST API (TypeScript)
│   └── src/mcp-client.ts          ← Singleton MCP client, used by services
├── apps/web/                      ← React + Vite frontend (JSX)
├── app.js                         ← Interactive CLI (ESM, connects to MCP via stdio)
└── cron-job-alert.js              ← Background alerter (ESM, node-notifier)
```

**Data flow**: Every surface spawns the MCP server as a child process over stdio. The MCP server launches Puppeteer (connecting to Chrome on port 9222) and scrapes LinkedIn HTML with Cheerio.

**Key pattern**: MCP tools return JSON strings. All clients parse them with `JSON.parse(res.content[0].text)`.

## Important Details

- MCP server must be built (`tsc`) before use — CLI, API, and cron all reference `dist/index.js`
- Chrome with remote debugging on port 9222 is required for scraping (uses `~/.chrome-scraper` profile with saved LinkedIn session cookies)
- `.seen-jobs.json` tracks notified jobs to avoid duplicates (gitignored, auto-generated)
- Cron defaults: searches "Front end developer" in India, past 24h, mid-senior, runs every 10 minutes
- Root `package.json` has ESM dependencies (chalk, ora) — root-level scripts are ESM (`"type": "module"` not set, uses `.js` with `import` syntax)
- API uses NestJS with `ts-node-dev` for dev mode
- Web app is plain React (no state library, no router)
