/** A browser-local guide preference, deliberately separate from account/likes data. */
export const ONBOARDING_KEY = "genre-atlas:welcome:v1";

export function shouldShowOnboarding(url: URL, dismissed: boolean): boolean {
  // Never interrupt a shared recording, album return, OAuth return or saved-list link.
  return !dismissed && url.pathname === "/" && !url.hash && !url.search;
}
