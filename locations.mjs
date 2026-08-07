/**
 * Shared job-search location presets, used by the CLI (app.js) and the job
 * alert cron (cron-job-alert.js).
 *
 * `label` is display text only. `locations` holds the strings actually sent to
 * LinkedIn — fully qualified so LinkedIn resolves them unambiguously. LinkedIn
 * accepts a single location per query, so a preset holding more than one
 * location is searched once per location and the results merged.
 */
export const LOCATION_CHOICES = [
  { label: "India", locations: ["India"] },
  {
    label: "Dubai, Abudhabi",
    locations: [
      "Dubai, United Arab Emirates",
      "Abu Dhabi, United Arab Emirates",
    ],
  },
];

/**
 * Resolve a preset from a user-typed answer.
 *
 * @param {string} answer Raw answer, e.g. "2". Empty selects the first preset.
 * @returns {{label: string, locations: string[]} | undefined} The matching
 *   preset, or undefined when the answer is not a valid option number.
 */
export function resolveLocationChoice(answer) {
  const trimmed = answer.trim();
  const index = trimmed ? parseInt(trimmed, 10) - 1 : 0;
  return LOCATION_CHOICES[index];
}
