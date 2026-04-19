/**
 * OAuth redirect target after Supabase finishes the provider flow.
 * Must match an entry in Supabase Dashboard → Auth → URL Configuration → Redirect URLs.
 *
 * Set VITE_PUBLIC_SITE_URL on Vercel to your stable production URL if preview URLs differ.
 */
export function getAppOAuthCallbackUrl(): string {
  const explicit = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  const origin =
    explicit ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "";
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback`;
}
