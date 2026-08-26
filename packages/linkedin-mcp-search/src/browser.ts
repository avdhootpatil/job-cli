/**
 * Browser module - Connects to an already-running Chrome with remote debugging.
 *
 * Start Chrome once with:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-scraper"
 *
 * Then the scraper connects to it and uses your existing LinkedIn session.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const DEBUGGING_PORT = process.env.CHROME_DEBUG_PORT || '9222';
const DEBUGGING_URL = `http://127.0.0.1:${DEBUGGING_PORT}`;

/** Ceiling for any single CDP call, so a wedged tab can never stall a run. */
const PROTOCOL_TIMEOUT_MS = 60000;
/** Ceiling for one in-page evaluate. */
const EVALUATE_TIMEOUT_MS = 15000;
/** Ceiling for reading posted time/applicants off one page of cards. */
const TIME_EXTRACTION_BUDGET_MS = 120000;
/** How long to let the detail panel settle after clicking a card. */
const CARD_SETTLE_MS = 1500;

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
 * Connect to (or reuse the connection to) the debugging Chrome instance.
 *
 * @returns The connected browser.
 * @throws When Chrome is not reachable on the debugging port.
 */
async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;

  try {
    console.error(`[browser] Connecting to Chrome on port ${DEBUGGING_PORT}...`);
    browser = await puppeteer.connect({
      browserURL: DEBUGGING_URL,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
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
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

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
 * Disconnect from Chrome (leaves the browser itself running).
 *
 * @returns Resolves once disconnected.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    browser.disconnect();
    browser = null;
  }
}
