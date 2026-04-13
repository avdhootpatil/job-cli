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

// Exclude jobs whose title contains any of these (case-insensitive)
const EXCLUDE_TITLE_KEYWORDS = [
  '.net', 'dotnet', 'c#',
  'java', 'spring boot', 'j2ee',
  'python', 'django', 'flask',
  'angular', 'vue',
  'ruby', 'rails',
  'php', 'laravel',
  'golang', 'rust',
  'ios', 'swift', 'kotlin', 'android',
  'salesforce', 'sap', 'mainframe', 'cobol',
  'devops', 'sre', 'platform engineer',
  'qa', 'sdet', 'test engineer', 'quality',
  'data engineer', 'data scientist', 'ml engineer', 'machine learning',
  'blockchain', 'web3', 'solidity',
];

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
  console.log(`[URL] https://www.linkedin.com/jobs/search?keywords=Front%20end%20developer&location=India&f_TPR=r86400&f_E=4`);

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
        keywords: 'Front end developer, React Developer, Senior Frontend Developer',
        location: 'India',
        datePosted: 'past-24-hours',
        experienceLevel: ['mid-senior'],
        workplaceType: ['remote'],
        easyApply: true,
        limit: 50,
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
      job => !seen[job.id] && (isPostedWithinHours(job.postedTimeAgo, 5) || parseInt(job.applicants || '0') < 30),
    );

    const relevantJobs = freshJobs.filter(job => {
      const title = job.title.toLowerCase();
      return !EXCLUDE_TITLE_KEYWORDS.some(kw => title.includes(kw.toLowerCase()));
    });
    const excluded = freshJobs.length - relevantJobs.length;

    console.log(
      `[FRESH] ${freshJobs.length} jobs (within 5 hours or < 30 applicants, not yet notified)`,
    );
    if (excluded > 0) console.log(`[FILTERED] ${excluded} jobs excluded by title keywords`);
    console.log();

    if (relevantJobs.length > 0) {
      // Calculate column widths
      const cols = {
        num: String(relevantJobs.length).length + 1,
        title: Math.min(50, Math.max(5, ...relevantJobs.map(j => j.title.length))),
        company: Math.min(30, Math.max(7, ...relevantJobs.map(j => j.company.length))),
        location: Math.min(40, Math.max(8, ...relevantJobs.map(j => j.location.length))),
        posted: Math.min(20, Math.max(6, ...relevantJobs.map(j => j.postedTimeAgo.length))),
      };

      const pad = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
      const header = `${'#'.padStart(cols.num)}  ${pad('Title', cols.title)}  ${pad('Company', cols.company)}  ${pad('Location', cols.location)}  ${pad('Posted', cols.posted)}  URL`;
      console.log(header);
      console.log('-'.repeat(header.length));

      relevantJobs.forEach((job, i) => {
        console.log(
          `${String(i + 1).padStart(cols.num)}  ${pad(job.title, cols.title)}  ${pad(job.company, cols.company)}  ${pad(job.location, cols.location)}  ${pad(job.postedTimeAgo, cols.posted)}  ${job.url}`,
        );
      });
    }

    // Track all fetched jobs as seen to avoid future duplicates
    for (const job of data.jobs) {
      if (!seen[job.id]) {
        seen[job.id] = { title: job.title, url: job.url, notifiedAt: new Date().toISOString() };
      }
    }

    if (relevantJobs.length > 0) {
      notify(relevantJobs);
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

// Run immediately, then every 10 minutes
run();
setInterval(run, 10 * 60 * 1000);

console.log('LinkedIn Job Alert Cron started — running every 10 minutes');
console.log(`Searching: "Front end developer" in India, past 24 hours, remote, easy apply`);
console.log(`Logging jobs posted ≤ 5 hours ago`);
