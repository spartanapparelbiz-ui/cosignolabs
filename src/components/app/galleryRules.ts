/**
 * The starting points offered on the safety-rules page.
 *
 * Nobody opens a blank box and invents a good safety rule, so the page offers
 * the ones people actually want — grouped by what is being protected, not by
 * which system enforces them.
 *
 * Every sentence here is verified by tests/safety-rules-gallery.test.ts: it
 * must parse to exactly one named operation and one named scope, and across
 * every capability of every built-in connector it must fire on that operation
 * and on nothing else. A gallery is a promise that these rules are understood;
 * one ambiguous entry teaches a person that safety rules are approximate, and
 * after that they do not trust their own either.
 *
 * Lives in its own module so the page and the test read the same list — a
 * gallery the tests do not actually cover is the failure this file prevents.
 */
export interface GallerySection {
  group: string;
  rules: string[];
}

export const GALLERY: GallerySection[] = [
  {
    group: "money",
    rules: [
      "Always ask before refunding a payment",
      "Require my signature for payments over $500",
      "Require my signature before any payment",
    ],
  },
  {
    group: "things that can't be undone",
    rules: [
      "Always ask before deleting a file in Google Drive",
      "Always ask before deleting a calendar event",
      "Never delete an email",
    ],
  },
  {
    group: "anything that leaves your workspace",
    rules: [
      "Always ask before sending an email",
      "Always ask before posting in Slack",
      "Always ask before creating a page in Notion",
    ],
  },
  {
    group: "your files and records",
    rules: [
      "Always ask before updating a file in Google Drive",
      "Always ask before creating an issue in GitHub",
      "Always ask before archiving an email",
    ],
  },
];

/** Flat list, for the verification suite. */
export const GALLERY_RULES: string[] = GALLERY.flatMap((s) => s.rules);
