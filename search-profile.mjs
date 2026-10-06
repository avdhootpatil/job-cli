/**
 * Job-search profile used by the job alert cron (cron-job-alert.js).
 *
 * Tuned for an Engineering Manager / mobile leadership profile: 10+ years of
 * engineering, 6+ years of React Native, 4+ years leading web and mobile teams.
 * Edit this file to change which roles the cron looks for — the cron itself
 * does not need to change.
 */

/**
 * Keyword searches run every cycle, once per location. LinkedIn takes a single
 * keyword string per query, so each target role family is its own search and
 * the results are merged, de-duped by job id.
 *
 * `limit` caps results per search (LinkedIn serves 10 per page, so a limit of
 * 50 is at most 5 page loads). Every extra query adds scraping time to each
 * cycle, so prefer a few broad role families over many near-duplicates.
 *
 * @type {Array<{keywords: string, limit: number}>}
 */
export const SEARCH_QUERIES = [
  // Management
  { keywords: "Engineering Manager", limit: 100 },
  { keywords: "Software Development Manager", limit: 50 },
  { keywords: "Head of Mobile", limit: 30 },
  // Team lead — LinkedIn matches loosely, so these also surface "Team Lead",
  // "Tech Lead" and "Lead ... Engineer" titles
  { keywords: "React Native Lead", limit: 50 },
  { keywords: "Frontend Lead", limit: 50 },
  // Senior individual contributor
  { keywords: "Senior React Native Developer", limit: 50 },
  { keywords: "Senior Frontend Developer", limit: 50 },
  { keywords: "Mobile Architect", limit: 30 },
  { keywords: "Staff Mobile Engineer", limit: 30 },
];

/**
 * LinkedIn experience levels to include. Director is added because "Head of"
 * and senior manager roles are often tagged at that level.
 *
 * @type {Array<"mid-senior" | "director">}
 */
export const EXPERIENCE_LEVELS = ["mid-senior", "director"];

// Management titles qualify whatever the stack — an Engineering Manager role
// is a fit even when the team is not web or mobile — but the title has to say
// it is a software / tech team, or "Design Manager" and "Head of Acquisition"
// get through.
const MANAGEMENT_TITLE = /\b(manager|management|head|director|vp)\b/i;
const ENGINEERING_TITLE =
  /\b(engineering|software|development|technology|tech|technical|mobile|web|front[- ]?end|ios|android|react|digital|apps?|platform)\b/i;

// Lead and senior IC titles qualify only on a web or mobile stack, otherwise
// "Lead Data Engineer" or "Senior Java Developer" would alert too.
const SENIOR_TITLE = /\b(lead|architect|principal|staff|senior|sr)\b/i;
const WEB_MOBILE_TITLE =
  /\b(react|react native|front[- ]?end|mobile|ios|android|web|ui|javascript|typescript)\b/i;

// "Engineering Manager" searches pull in plenty of non-software roles; drop the
// common ones. Matched as whole words, so e.g. "HR" does not hit "Chrome".
const EXCLUDED_TITLE = new RegExp(
  "\\b(" +
    [
      // Other engineering disciplines
      "mechanical", "civil", "electrical", "structural", "chemical",
      "manufacturing", "production", "plant", "construction", "maintenance",
      "facility", "facilities", "hvac", "mep", "piping", "automotive",
      "aerospace", "hardware", "firmware", "embedded", "rf",
      "power", "solar", "silicon", "rtl", "commissioning", "network",
      // Facilities / energy roles, common under "Engineering Manager" in the Gulf
      "oil", "gas", "landscape", "hvdc", "tender\\w*", "fm", "field",
      "digital twin",
      // Non-engineering management
      "sales", "pre-?sales", "marketing", "account", "recruitment",
      "recruiting", "talent", "hr", "human resources", "finance",
      "accounting", "customer success", "support", "business development",
      "product manager", "product management", "project manager",
      "program", "programme", "design manager", "quality", "test", "qa",
      "data scien\\w*", "intern",
      // Junior grades in Indian / Singapore banking titles
      "assistant manager", "deputy manager",
    ].join("|") +
    ")\\b",
  "i",
);

/**
 * Decide whether a job title fits the target profile: an engineering
 * management role, or a lead / senior role on a web or mobile stack, and not
 * one from an unrelated discipline.
 *
 * @param {string} title Job title as shown on LinkedIn.
 * @returns {boolean} True when the job should be considered for an alert.
 */
export function isRelevantTitle(title) {
  if (!title || EXCLUDED_TITLE.test(title)) return false;
  if (MANAGEMENT_TITLE.test(title)) return ENGINEERING_TITLE.test(title);
  return SENIOR_TITLE.test(title) && WEB_MOBILE_TITLE.test(title);
}
