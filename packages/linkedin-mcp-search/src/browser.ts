/**
 * Browser module - Launches a headless Chrome for every scrape session.
 *
 * Chrome runs with the dedicated scraper profile (`~/.chrome-scraper` by
 * default) so the LinkedIn session saved there is reused without opening a
 * window. Log in once with:
 *   npm run chrome   (opens a visible Chrome on that profile — sign in, then quit it)
 *
 * Overrides (all optional):
 *   CHROME_PATH          executable to launch
 *   CHROME_USER_DATA_DIR profile directory holding the LinkedIn session
 *   CHROME_HEADLESS      set to "false" to watch the browser while debugging
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR || path.join(os.homedir(), '.chrome-scraper');
const HEADLESS = process.env.CHROME_HEADLESS !== 'false';

/** Ceiling for any single CDP call, so a wedged tab can never stall a run. */
const PROTOCOL_TIMEOUT_MS = 60000;
/** Ceiling for one in-page evaluate. */
const EVALUATE_TIMEOUT_MS = 15000;
/** Ceiling for reading posted time/applicants off one page of cards. */
const TIME_EXTRACTION_BUDGET_MS = 120000;
/** How long to let the detail panel settle after clicking a card. */
const CARD_SETTLE_MS = 1500;
/**
 * LinkedIn answers bursts of requests with HTTP 429 and a bot-challenge page
 * that parses as zero jobs. Retry a 429 this many times, waiting
 * RATE_LIMIT_BACKOFF_MS × attempt between tries, before giving up.
 */
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BACKOFF_MS = 3000;

let browser: Browser | null = null;

/**
 * Race a promise against a timeout, resolving to a fallback instead of
 * rejecting or hanging.
 *
 * Needed because a click that navigates the tab destroys the execution context
 * and the pending evaluate response is never delivered — the promise then never
 * settles on its own.
 *
 * @param promise Promise to bound.
 * @param ms Timeout in milliseconds.
 * @param fallback Value to resolve with on timeout or rejection.
 * @returns The promise's value, or the fallback.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Clear Chrome's profile lock when the Chrome that took it is no longer running.
 *
 * Chrome leaves `SingletonLock` (a symlink to `<host>-<pid>`) behind after a
 * crash or a force-quit, and then refuses to start on the profile at all. When
 * the recorded pid is dead the lock is stale and safe to remove. When it is
 * alive, another Chrome genuinely owns the profile, and that pid is returned so
 * the launch error can name it.
 *
 * @returns The pid of a live Chrome holding the profile, or undefined.
 */
function clearStaleProfileLock(): number | undefined {
  const lock = path.join(USER_DATA_DIR, 'SingletonLock');
  let target: string;
  try {
    target = fs.readlinkSync(lock);
  } catch {
    return undefined; // no lock
  }

  const pid = Number.parseInt(target.slice(target.lastIndexOf('-') + 1), 10);
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid, 0); // throws when the process does not exist
      return pid;
    } catch {
      // fall through: owner is gone
    }
  }

  console.error(`[browser] Removing stale profile lock (${target})`);
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      fs.unlinkSync(path.join(USER_DATA_DIR, name));
    } catch {}
  }
  return undefined;
}

/**
 * Launch (or reuse) the headless Chrome used for scraping.
 *
 * @returns The running browser.
 * @throws When Chrome cannot be started, e.g. the executable is missing or the
 *   profile is already open in another Chrome.
 */
async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;

  const holder = clearStaleProfileLock();
  if (holder !== undefined) {
    throw new Error(
      `Another Chrome (pid ${holder}) is already open on the profile ${USER_DATA_DIR}. ` +
      `Quit it first — Chrome refuses to start twice on the same profile. ` +
      `Set CHROME_USER_DATA_DIR to use a different profile.`
    );
  }

  try {
    console.error(
      `[browser] Launching ${HEADLESS ? 'headless ' : ''}Chrome with profile ${USER_DATA_DIR}...`,
    );
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: HEADLESS,
      userDataDir: USER_DATA_DIR,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
      defaultViewport: { width: 1280, height: 900 },
      args: ['--no-first-run', '--no-default-browser-check', '--disable-gpu'],
      // The MCP server's own SIGINT/SIGTERM handlers call closeBrowser(), which
      // shuts Chrome down cleanly. Puppeteer's default handlers would SIGKILL
      // it first and leave a stale SingletonLock in the profile.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    console.error(`[browser] Chrome started`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot launch Chrome at ${CHROME_PATH}.\n` +
      `Set CHROME_PATH or CHROME_USER_DATA_DIR to override.\n\n` +
      `Original error: ${msg}`
    );
  }

  return browser;
}

/**
 * Fetch a single page's HTML — opens a new tab, navigates, grabs HTML, closes tab.
 *
 * @param url Page to load.
 * @param options.interactive When true, wait for job cards, scroll to load more,
 *   and click each card to capture posted time / applicants. Only the
 *   authenticated results SPA needs this; server-rendered HTML (the guest search
 *   endpoint, job detail pages) is complete on arrival, so it defaults to false.
 * @returns The page HTML. With `interactive`, job cards also carry
 *   `data-posted-time` / `data-applicants` written in-page by annotateCards().
 */
export async function getPageHtml(
  url: string,
  options: { interactive?: boolean } = {},
): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    for (let attempt = 0; ; attempt++) {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      if (response?.status() !== 429) break;
      if (attempt >= RATE_LIMIT_RETRIES) {
        throw new Error(
          `LinkedIn rate limited this request (HTTP 429) ${attempt + 1} times — wait a few minutes before retrying`,
        );
      }
      const delay = RATE_LIMIT_BACKOFF_MS * (attempt + 1);
      console.error(`[browser] HTTP 429 from LinkedIn — retrying in ${delay / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!options.interactive) {
      return await withTimeout(page.content(), EVALUATE_TIMEOUT_MS, '');
    }

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
      const prevCount = await countCards(page);
      await withTimeout(
        page.evaluate(() => {
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
        }),
        EVALUATE_TIMEOUT_MS,
        undefined,
      );
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newCount = await countCards(page);
      if (newCount === prevCount) break;
    }

    // Authenticated view: click each card to read posted time / applicants from
    // the detail panel and write them onto the card itself.
    await annotateCards(page, url);

    return await withTimeout(page.content(), EVALUATE_TIMEOUT_MS, '');
  } finally {
    // Bounded so a wedged tab cannot stall cleanup and leak the tab.
    await withTimeout(page.close(), 10000, undefined);
  }
}

/**
 * Count the authenticated-view job cards currently in the DOM.
 *
 * @param page Page to inspect.
 * @returns Number of job cards, or 0 if the page could not be read.
 */
async function countCards(page: Page): Promise<number> {
  return withTimeout(
    page.evaluate(
      () => document.querySelectorAll('div.job-card-container[data-job-id]').length,
    ),
    EVALUATE_TIMEOUT_MS,
    0,
  );
}

/**
 * Give every job card a unique `data-scrape-idx` and return those indices.
 *
 * Cards cannot be addressed by `data-job-id`: LinkedIn frequently renders every
 * card except the selected one with the literal placeholder
 * `data-job-id="search"`, so the ids are neither unique nor real. Indices are
 * assigned once and left alone, so cards LinkedIn injects later just get the
 * next free index.
 *
 * @param page Page to stamp.
 * @returns The `data-scrape-idx` values in DOM order.
 */
async function stampAndListCards(page: Page): Promise<string[]> {
  return withTimeout(
    page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('div.job-card-container[data-job-id]'),
      );
      let next = 0;
      for (const stamped of Array.from(document.querySelectorAll('[data-scrape-idx]'))) {
        const value = Number.parseInt(stamped.getAttribute('data-scrape-idx') || '', 10);
        if (Number.isFinite(value) && value >= next) next = value + 1;
      }
      for (const card of cards) {
        if (!card.hasAttribute('data-scrape-idx')) {
          card.setAttribute('data-scrape-idx', String(next++));
        }
      }
      return cards
        .map(card => card.getAttribute('data-scrape-idx'))
        .filter((idx): idx is string => !!idx);
    }),
    EVALUATE_TIMEOUT_MS,
    [] as string[],
  );
}

/**
 * Click one card's title link to load it into the detail panel.
 *
 * The title link specifically — a card's first anchor can be the company logo,
 * which navigates the whole tab instead of updating the panel.
 *
 * @param page Page showing the search results.
 * @param idx The card's `data-scrape-idx`.
 * @returns True when a link was clicked.
 */
async function clickCard(page: Page, idx: string): Promise<boolean> {
  return withTimeout(
    page.evaluate((cardIdx: string) => {
      const card = document.querySelector(`div.job-card-container[data-scrape-idx="${cardIdx}"]`);
      if (!card) return false;
      const link = card.querySelector<HTMLElement>(
        '.job-card-list__title--link, .job-card-container__link, a',
      );
      if (!link) return false;
      link.click();
      return true;
    }, idx),
    EVALUATE_TIMEOUT_MS,
    false,
  );
}

/**
 * Read posted time and applicant count from the open detail panel and write
 * them onto the card as data attributes.
 *
 * Writing in-page (rather than string-patching the serialized HTML) keeps each
 * value attached to the right card even when several cards share a
 * `data-job-id`.
 *
 * @param page Page showing the search results.
 * @param idx The card's `data-scrape-idx`.
 * @returns True when the card was annotated.
 */
async function annotateCard(page: Page, idx: string): Promise<boolean> {
  return withTimeout(
    page.evaluate((cardIdx: string) => {
      const card = document.querySelector(`div.job-card-container[data-scrape-idx="${cardIdx}"]`);
      if (!card) return false;

      const topCard = document.querySelector(
        '.job-details-jobs-unified-top-card__primary-description-container',
      );
      const topText = topCard
        ? (topCard.textContent || '').replace(/\s+/g, ' ').trim()
        : '';
      const timeMatch = topText.match(
        /(\d+\s*(hours?|minutes?|seconds?|days?|weeks?|months?)\s*ago|just now|Reposted\s+\d+\s*\w+\s*ago)/i,
      );
      const applicantsMatch = topText.match(/(\d+)\s*(people clicked apply|applicants?)/i);

      card.setAttribute('data-posted-time', timeMatch ? timeMatch[0] : 'Unknown');
      // Left empty when unreadable, so it is not mistaken for zero applicants.
      card.setAttribute('data-applicants', applicantsMatch ? applicantsMatch[1] : '');
      return true;
    }, idx),
    EVALUATE_TIMEOUT_MS,
    false,
  );
}

/**
 * Walk every job card, loading each into the detail panel to capture its posted
 * time and applicant count.
 *
 * Driven one card at a time from Node rather than in a single long-lived
 * evaluate: every step is individually bounded, the card list is re-read as
 * LinkedIn lazily injects more cards, and the whole walk is capped by
 * TIME_EXTRACTION_BUDGET_MS so a slow page degrades to partial data instead of
 * stalling the run.
 *
 * @param page Page showing the search results.
 * @param searchUrl URL to return to if a click navigates away.
 * @returns Number of cards annotated.
 */
async function annotateCards(page: Page, searchUrl: string): Promise<number> {
  let indices = await stampAndListCards(page);
  if (indices.length === 0) return 0; // guest view — no cards to click

  const deadline = Date.now() + TIME_EXTRACTION_BUDGET_MS;
  let annotated = 0;
  let recovered = false;

  for (let i = 0; i < indices.length; i++) {
    if (Date.now() > deadline) {
      console.error(
        `[browser] Time budget reached — annotated ${annotated}/${indices.length} cards`,
      );
      break;
    }

    if (!(await clickCard(page, indices[i]))) continue;
    await new Promise(resolve => setTimeout(resolve, CARD_SETTLE_MS));

    // A click can still navigate away (promoted / recommended cards). Reload the
    // results once and start over; a second navigation means give up and keep
    // whatever the page already has.
    if (!page.url().includes('/jobs/search')) {
      if (recovered) {
        console.error('[browser] Navigated away again — keeping partial data');
        break;
      }
      console.error('[browser] Click navigated away — reloading results');
      recovered = true;
      await withTimeout(
        page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
        30000,
        null,
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
      indices = await stampAndListCards(page);
      annotated = 0;
      i = -1;
      continue;
    }

    if (await annotateCard(page, indices[i])) annotated++;

    // LinkedIn injects more cards as you interact with the list — pick them up.
    if (i === indices.length - 1) {
      const refreshed = await stampAndListCards(page);
      if (refreshed.length > indices.length) indices = refreshed;
    }
  }

  console.error(`[browser] Annotated ${annotated}/${indices.length} cards`);
  return annotated;
}

/**
 * Shut down the launched Chrome.
 *
 * @returns Resolves once the browser process has exited.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    const b = browser;
    browser = null;
    await withTimeout(b.close(), 10000, undefined);
  }
}
