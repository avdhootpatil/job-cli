/**
 * Browser module - Connects to an already-running Chrome with remote debugging.
 *
 * Start Chrome once with:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-scraper"
 *
 * Then the scraper connects to it and uses your existing LinkedIn session.
 */

import puppeteer, { type Browser } from 'puppeteer-core';

const DEBUGGING_PORT = process.env.CHROME_DEBUG_PORT || '9222';
const DEBUGGING_URL = `http://127.0.0.1:${DEBUGGING_PORT}`;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;

  try {
    console.error(`[browser] Connecting to Chrome on port ${DEBUGGING_PORT}...`);
    browser = await puppeteer.connect({
      browserURL: DEBUGGING_URL,
    });
    console.error(`[browser] Connected to Chrome`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot connect to Chrome. Make sure Chrome is running with remote debugging:\n` +
      `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-scraper"\n\n` +
      `Original error: ${msg}`
    );
  }

  return browser;
}

/**
 * Fetch a single page's HTML — opens a new tab, navigates, grabs HTML, closes tab.
 */
export async function getPageHtml(url: string): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for job cards to render
    try {
      await page.waitForSelector(
        'div.job-card-container[data-job-id], div.base-card',
        { timeout: 10000 }
      );
    } catch {
      // No cards found, continue with whatever HTML we have
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scroll the job list panel to load more cards (LinkedIn only shows ~7 initially)
    for (let i = 0; i < 5; i++) {
      const prevCount = await page.evaluate(() =>
        document.querySelectorAll('div.job-card-container[data-job-id]').length
      );
      await page.evaluate(() => {
        const card = document.querySelector('div.job-card-container[data-job-id]');
        if (!card) return;
        let el = card.parentElement;
        while (el) {
          if (el.scrollHeight > el.clientHeight + 10) {
            el.scrollTop = el.scrollHeight;
            break;
          }
          el = el.parentElement;
        }
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newCount = await page.evaluate(() =>
        document.querySelectorAll('div.job-card-container[data-job-id]').length
      );
      if (newCount === prevCount) break;
    }

    // For authenticated view, click each card to get posted time from detail panel
    const jobTimes = await extractJobTimes(page);
    let html = await page.content();

    // Inject the times into the HTML as data attributes so the parser can read them
    if (Object.keys(jobTimes).length > 0) {
      for (const [jobId, value] of Object.entries(jobTimes)) {
        const [time, applicants] = value.split('||');
        html = html.replace(
          `data-job-id="${jobId}"`,
          `data-job-id="${jobId}" data-posted-time="${time}" data-applicants="${applicants}"`
        );
      }
    }

    return html;
  } finally {
    await page.close();
  }
}

/**
 * Click each job card and extract posted time from the detail panel.
 * Returns a map of jobId -> postedTimeAgo.
 */
async function extractJobTimes(page: import('puppeteer-core').Page): Promise<Record<string, string>> {
  const isAuthenticated = await page.evaluate(() => {
    return document.querySelectorAll('div.job-card-container[data-job-id]').length > 0;
  });

  if (!isAuthenticated) return {};

  const jobTimes: Record<string, string> = await page.evaluate(async () => {
    const cards = document.querySelectorAll('div.job-card-container[data-job-id]');
    const results: Record<string, string> = {};

    for (const card of cards) {
      const jobId = card.getAttribute('data-job-id');
      if (!jobId) continue;

      const link = card.querySelector('a');
      if (link) link.click();

      await new Promise(r => setTimeout(r, 1500));

      const topCard = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container');
      const topText = topCard ? topCard.textContent.replace(/\s+/g, ' ').trim() : '';
      const timeMatch = topText.match(/(\d+\s*(hours?|minutes?|seconds?|days?|weeks?|months?)\s*ago|just now|Reposted\s+\d+\s*\w+\s*ago)/i);
      const applicantsMatch = topText.match(/(\d+)\s*(people clicked apply|applicants?)/i);

      results[jobId] = (timeMatch ? timeMatch[0] : 'Unknown') + '||' + (applicantsMatch ? applicantsMatch[1] : '0');
    }

    return results;
  });

  return jobTimes;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    browser.disconnect();
    browser = null;
  }
}
