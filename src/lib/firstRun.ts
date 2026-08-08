/**
 * The flag that says onboarding has been seen.
 *
 * It lives in its own module so the gate can read it without importing the
 * dialog — importing the constant from the dialog would drag the whole thing
 * back into the page bundle and undo the split entirely.
 */
export const SEEN_KEY = "cosigno_intro_seen";
