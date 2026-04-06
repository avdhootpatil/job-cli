#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import notifier from 'node-notifier';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = path.join(
  __dirname,
  'packages/linkedin-mcp-search/dist/index.js',
);
const SEEN_JOBS_FILE = path.join(__dirname, '.seen-jobs.json');

// Load previously seen job IDs to avoid duplicate SMS
function loadSeenJobs() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_JOBS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSeenJobs(seen) {
  fs.writeFileSync(SEEN_JOBS_FILE, JSON.stringify(seen, null, 2));
}

function isPostedWithinHours(postedTimeAgo, maxHours = 10) {
  if (!postedTimeAgo) return false;
  const text = postedTimeAgo.toLowerCase();
  if (text.includes('just now')) return true;
  if (text.includes('second')) return true;
  if (text.includes('minute')) return true;
  if (text.includes('hour')) {
    const match = text.match(/(\d+)\s*hour/);
    if (match && parseInt(match[1]) <= maxHours) return true;
  }
  return false;
}

function notify(jobs) {
  const list = jobs
    .map((j, i) => `${i + 1}. ${j.title} - ${j.company} (${j.postedTimeAgo})`)
    .join('\n');
  notifier.notify({
    title: `${jobs.length} New Job${jobs.length > 1 ? 's' : ''} Found!`,
    message: list,
    sound: true,
    wait: true,
  });
}

async function run() {
  const now = new Date().toLocaleString();
  console.log(`\n[${now}] Running job search...`);
  console.log(`[URL] https://www.linkedin.com/jobs/search?keywords=Frontend%20Developer%2C%20ReactJS%20Developer&location=India&f_TPR=r86400&f_E=4`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
  });
  const client = new Client(
    { name: 'linkedin-job-cron', version: '1.0.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const res = await client.callTool({
      name: 'search_jobs',
      arguments: {
        keywords: 'Frontend Developer, ReactJS Developer',
        location: 'India',
        datePosted: 'past-24-hours',
        experienceLevel: ['mid-senior'],
        limit: 125,
      },
    }, undefined, { timeout: 300000 });

    const text = res.content?.[0]?.text;
    if (!text) {
      console.log('[NO RESPONSE]');
      await client.close();
      return;
    }

    const data = JSON.parse(text);
    if (!data.success || !data.jobs?.length) {
      console.log(`[NO JOBS FOUND]`);
      await client.close();
      return;
    }

    console.log(`\n[FOUND] ${data.jobs.length} total jobs`);

    const seen = loadSeenJobs();
    const freshJobs = data.jobs.filter(
      job => isPostedWithinHours(job.postedTimeAgo, 5) && !seen[job.id],
    );

    console.log(
      `[FRESH] ${freshJobs.length} jobs posted within 5 hours (not yet notified)`,
    );

    for (const job of freshJobs) {
      console.log(
        `  -> ${job.title} | ${job.company} | ${job.location} | ${job.postedTimeAgo} | ${job.url}`,
      );
    }

    // Track all fetched jobs as seen to avoid future duplicates
    for (const job of data.jobs) {
      if (!seen[job.id]) {
        seen[job.id] = { title: job.title, url: job.url, notifiedAt: new Date().toISOString() };
      }
    }

    if (freshJobs.length > 0) {
      notify(freshJobs);
    }

    // Clean up seen jobs older than 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const id of Object.keys(seen)) {
      if (new Date(seen[id].notifiedAt).getTime() < oneDayAgo) {
        delete seen[id];
      }
    }
    saveSeenJobs(seen);

    await client.close();
  } catch (err) {
    console.error(`[ERROR]`, err.message);
    try {
      await client.close();
    } catch {}
  }
}

// Run immediately, then every 5 minutes
run();
setInterval(run, 5 * 60 * 1000);

console.log('LinkedIn Job Alert Cron started — running every 5 minutes');
console.log(`Searching: "React Developer" in India, past 24 hours`);
console.log(`Logging jobs posted ≤ 5 hours ago`);
