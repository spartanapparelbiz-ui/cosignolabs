/**
 * The examples offered on the Preview page.
 *
 * Nobody opens a blank box and invents a good rule, so the page offers a few
 * that people actually want. They are examples, not templates: six short
 * sentences someone can try in one click, then edit into their own words.
 *
 * Every sentence here is verified by tests/preview-examples.test.ts — it must
 * name exactly one action and one place, it must fire on that action and on
 * nothing else, and it must change something cosigno can really do. An example
 * that quietly does nothing teaches a person that rules are approximate, and
 * after that they don't trust their own either.
 *
 * Lives in its own module so the page and the tests read the same list — a set
 * of examples the tests do not actually cover is the failure this file exists
 * to prevent.
 */
export const PREVIEW_EXAMPLES: string[] = [
  "Always ask before sending emails",
  "Never delete files",
  "Require approval before refunds",
  "Never post to Slack without asking",
  "Require approval before creating a Notion page",
  "Always ask before adding a calendar event",
];
