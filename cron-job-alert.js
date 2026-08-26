#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import notifier from 'node-notifier';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { LOCATION_CHOICES, resolveLocationChoice } from './locations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = path.join(
  __dirname,
  'packages/linkedin-mcp-search/dist/index.js',
);
const SEEN_JOBS_FILE = path.join(__dirname, '.seen-jobs.json');

const SEARCH_KEYWORDS = 'Front end developer';
const SEARCH_DATE_POSTED = 'past-24-hours';
const SEARCH_EXPERIENCE = ['mid-senior'];
const SEARCH_LIMIT = 125;
const SEARCH_TIMEOUT_MS = 300000;
const INTERVAL_MS = 10 * 60 * 1000;

// A job is worth notifying about if it was posted this recently, or still has
// fewer than this many applicants. Same thresholds for every location.
const FRESH_WITHIN_HOURS = 5;
const MAX_APPLICANTS = 50;
// Search results carry no applicant count, so it costs one extra request per
// job to check. Only jobs that failed the time test are looked up, newest
// first, and at most this many per cycle.
const APPLICANT_LOOKUPS_PER_RUN = 20;

// Guards against a new run starting while the previous one is still scraping —
// a multi-location run can take longer than INTERVAL_MS.
let running = false;

/**
 * Load previously seen job IDs to avoid notifying about the same job twice.
 *
 * @returns {Record<string, {title: string, url: string, notifiedAt: string}>} Seen jobs by id.
 */
function loadSeenJobs() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_JOBS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Persist the seen-job map to disk.
 *
 * @param {Record<string, object>} seen Seen jobs by id.
 * @returns {void}
 */
function saveSeenJobs(seen) {
  fs.writeFileSync(SEEN_JOBS_FILE, JSON.stringify(seen, null, 2));
}

/**
 * Build the LinkedIn search URL matching the cron's filters, for logging.
 *
 * @param {string} location Location to search in.
 * @returns {string} The equivalent LinkedIn jobs search URL.
 */
function searchUrl(location) {
  const sp = new URLSearchParams({
    keywords: SEARCH_KEYWORDS,
    location,
    f_TPR: 'r86400',
    f_E: '4',
  });
  return `https://www.linkedin.com/jobs/search?${sp.toString()}`;
}

/**
 * Check whether a "posted x ago" string falls within the given number of hours.
 *
 * @param {string} postedTimeAgo Relative time text, e.g. "3 hours ago".
 * @param {number} [maxHours=10] Upper bound in hours.
 * @returns {boolean} True when the job was posted within maxHours.
 */
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

/**
 * Fire a desktop notification listing the fresh jobs.
 *
 * @param {Array<{title: string, company: string, postedTimeAgo: string}>} jobs Jobs to announce.
 * @returns {void}
 */
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

/**
 * Ask which location preset to monitor, re-asking until the answer is valid.
 *
 * @returns {Promise<{label: string, locations: string[]}>} The chosen preset.
 */
function chooseLocation() {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nWhere do you want to search for jobs?\n');
    LOCATION_CHOICES.forEach((choice, i) =>
      console.log(`  ${i + 1}  ${choice.label}`),
    );
    console.log('-'.repeat(50));

    const prompt = () => {
      rl.question('\nEnter choice [Enter=1]: ', answer => {
        const choice = resolveLocationChoice(answer);
        if (!choice) {
          console.log(`Invalid choice. Pick 1-${LOCATION_CHOICES.length}.`);
          prompt();
          return;
        }
        rl.close();
        resolve(choice);
      });
    };

    prompt();
  });
}

/**
 * Look up how many people have applied to one job.
 *
 * Search results do not include this, so it takes a job-details request. The
 * count reads like "Over 200 applicants" or "27 applicants"; the leading number
 * is used, so "Over 200" is treated as 200.
 *
 * @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client Connected MCP client.
 * @param {string} jobId LinkedIn job id.
 * @returns {Promise<number | undefined>} Applicant count, or undefined when unavailable.
 */
async function fetchApplicantCount(client, jobId) {
  try {
    const res = await client.callTool(
      { name: 'get_job_details', arguments: { jobId } },
      undefined,
      { timeout: 60000 },
    );
    const text = res.content?.[0]?.text;
    if (!text) return undefined;

    const data = JSON.parse(text);
    const match = data.job?.applicants?.match(/(\d[\d,]*)/);
    if (!match) return undefined;
    const count = Number.parseInt(match[1].replace(/,/g, ''), 10);
    return Number.isFinite(count) ? count : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run one search cycle: scrape each location in the preset, notify about fresh
 * jobs, and update the seen-job cache.
 *
 * @param {{label: string, locations: string[]}} locationChoice Location preset to search.
 * @returns {Promise<void>} Resolves when the cycle finishes.
 */
async function run(locationChoice) {
  if (running) {
    console.log('\n[SKIP] Previous run still in progress');
    return;
  }
  running = true;

  const now = new Date().toLocaleString();
  console.log(`\n[${now}] Running job search — ${locationChoice.label}`);
  for (const location of locationChoice.locations) {
    console.log(`[URL] ${searchUrl(location)}`);
  }

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

    // LinkedIn takes one location per query, so search each in turn and merge
    // the results, de-duped by job id.
    const jobs = [];
    const jobIds = new Set();

    for (const location of locationChoice.locations) {
      if (locationChoice.locations.length > 1) {
        console.log(`[SEARCH] ${location}...`);
      }

      const res = await client.callTool({
        name: 'search_jobs',
        arguments: {
          keywords: SEARCH_KEYWORDS,
          location,
          datePosted: SEARCH_DATE_POSTED,
          experienceLevel: SEARCH_EXPERIENCE,
          limit: SEARCH_LIMIT,
        },
      }, undefined, { timeout: SEARCH_TIMEOUT_MS });

      const text = res.content?.[0]?.text;
      if (!text) {
        console.log(`[NO RESPONSE] ${location}`);
        continue;
      }

      const data = JSON.parse(text);
      if (!data.success || !data.jobs?.length) {
        console.log(`[NO JOBS FOUND] ${location}`);
        continue;
      }

      for (const job of data.jobs) {
        if (!jobIds.has(job.id)) {
          jobIds.add(job.id);
          jobs.push(job);
        }
      }
    }

    if (!jobs.length) {
      await client.close();
      return;
    }

    console.log(`\n[FOUND] ${jobs.length} total jobs`);

    const seen = loadSeenJobs();
    const unseen = jobs.filter(job => !seen[job.id]);

    // Anything posted within the window is fresh outright; the rest have to earn
    // it on applicant count, which needs a per-job lookup.
    const freshJobs = [];
    const needsLookup = [];
    for (const job of unseen) {
      if (isPostedWithinHours(job.postedTimeAgo, FRESH_WITHIN_HOURS)) freshJobs.push(job);
      else needsLookup.push(job);
    }

    const lookups = Math.min(needsLookup.length, APPLICANT_LOOKUPS_PER_RUN);
    if (lookups > 0) {
      console.log(`[APPLICANTS] Checking ${lookups} of ${needsLookup.length} older jobs`);
    }
    for (let i = 0; i < lookups; i++) {
      const job = needsLookup[i];
      const applicants = await fetchApplicantCount(client, job.id);
      if (applicants !== undefined) job.applicants = String(applicants);
      if (applicants !== undefined && applicants < MAX_APPLICANTS) freshJobs.push(job);
    }
    if (needsLookup.length > lookups) {
      console.log(
        `[APPLICANTS] Skipped ${needsLookup.length - lookups} jobs (lookup cap) — they stay unnotified this cycle`,
      );
    }

    console.log(
      `[FRESH] ${freshJobs.length} jobs (within ${FRESH_WITHIN_HOURS} hours or < ${MAX_APPLICANTS} applicants, not yet notified)`,
    );

    for (const job of freshJobs) {
      console.log(
        `  -> ${job.title} | ${job.company} | ${job.location} | ${job.postedTimeAgo} | ${job.url}`,
      );
    }

    // Track all fetched jobs as seen to avoid future duplicates
    for (const job of jobs) {
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
  } finally {
    running = false;
  }
}

/**
 * Pick a location, then run immediately and every INTERVAL_MS after that.
 *
 * @returns {Promise<void>} Resolves once the schedule is armed.
 */
async function main() {
  // Only prompt when attached to a terminal — under a real cron/launchd there
  // is nobody to answer, so fall back to the first preset.
  let locationChoice = LOCATION_CHOICES[0];
  if (process.stdin.isTTY) {
    locationChoice = await chooseLocation();
  } else {
    console.log(`No terminal attached — defaulting to ${locationChoice.label}`);
  }

  console.log('\nLinkedIn Job Alert Cron started — running every 10 minutes');
  console.log(
    `Searching: "${SEARCH_KEYWORDS}" in ${locationChoice.label}, past 24 hours`,
  );
  console.log(
    `Alerting on jobs posted ≤ ${FRESH_WITHIN_HOURS} hours ago or with < ${MAX_APPLICANTS} applicants`,
  );

  run(locationChoice);
  setInterval(() => run(locationChoice), INTERVAL_MS);
}

main();
