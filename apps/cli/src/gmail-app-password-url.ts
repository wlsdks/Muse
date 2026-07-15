/**
 * Split out of `setup-email.ts` so `email-auth-guidance.ts` (AC3's
 * code→localized-guidance renderer) can reuse the same account-pinned
 * URL builder without an import cycle back into the wizard module.
 */

/** `authuser=<email>` pins both pages to the account the user just typed — the single biggest App Password real-world failure is minting the password on the wrong signed-in Google account. */
export function buildGmailAppPasswordUrls(email: string): { readonly appPasswordUrl: string; readonly twoStepUrl: string } {
  const authuser = encodeURIComponent(email);
  return {
    appPasswordUrl: `https://myaccount.google.com/apppasswords?authuser=${authuser}`,
    twoStepUrl: `https://myaccount.google.com/signinoptions/two-step-verification?authuser=${authuser}`
  };
}
