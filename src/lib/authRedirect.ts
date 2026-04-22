/**
 * Public site base for OAuth client registration (Render Web Service URL or custom domain).
 * Set VITE_PUBLIC_SITE_URL if it must differ from `window.location.origin` (e.g. tunneling).
 */
export function getPublicSiteBase(): string {
  const explicit = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  const origin =
    explicit ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "";
  return origin.replace(/\/$/, "");
}

/** Must match GitHub OAuth App → Authorization callback URL. */
export function getGithubOAuthCallbackUrl(): string {
  return `${getPublicSiteBase()}/api/auth/github/callback`;
}

/** Must match Google Cloud OAuth client → Authorized redirect URIs. */
export function getGoogleOAuthCallbackUrl(): string {
  return `${getPublicSiteBase()}/api/auth/google/callback`;
}
