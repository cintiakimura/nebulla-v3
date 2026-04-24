import { getGithubOAuthCallbackUrl, getGoogleOAuthCallbackUrl } from "../lib/authRedirect";
import { readResponseJson } from "../lib/apiFetch";
import { useEffect, useState } from "react";

export function LoginOAuthHints() {
  const [publicSiteUrl, setPublicSiteUrl] = useState<string>("");
  const gh = getGithubOAuthCallbackUrl(publicSiteUrl);
  const ggl = getGoogleOAuthCallbackUrl(publicSiteUrl);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => readResponseJson<{ publicSiteUrl?: string }>(res))
      .then((c) => setPublicSiteUrl((c.publicSiteUrl || "").trim()))
      .catch(() => setPublicSiteUrl(""));
  }, []);

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-left space-y-3">
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-headline text-amber-100">Open to any account?</span> In Google Cloud →{' '}
        <b>OAuth consent screen</b>, set <b>User type: External</b> (not Internal). Publish the app to{' '}
        <b>In production</b> when you want any Google user to sign in without being listed as a test user. Use an
        OAuth client of type <b>Web application</b>. For GitHub, use a normal <b>OAuth App</b> under your user or org
        so any GitHub account can authorize (not an org-only SSO lockout).
      </p>
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-headline text-amber-100">Google “redirect_uri_mismatch”?</span> In{" "}
        <a
          className="text-cyan-400 hover:underline"
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer"
        >
          Google Cloud → Credentials → your OAuth client
        </a>
        , under <b>Authorized redirect URIs</b>, add <b>exactly</b> the Render callback below (same host as this app).
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Google — redirect URI</p>
        <code className="block text-[10px] text-cyan-200/90 break-all bg-black/30 p-2 rounded border border-white/10">
          {ggl}
        </code>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">GitHub — authorization callback URL</p>
        <code className="block text-[10px] text-cyan-200/90 break-all bg-black/30 p-2 rounded border border-white/10">
          {gh}
        </code>
      </div>
      <p className="text-[10px] text-slate-500">
        These paths are served by the Nebulla Web Service on Render (<code className="text-slate-400">/api/auth/*/callback</code>
        ), not a third-party auth host.
      </p>
    </div>
  );
}
