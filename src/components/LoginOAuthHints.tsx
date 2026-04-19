import { useEffect, useState } from "react";
import { readResponseJson } from "../lib/apiFetch";
import { getAppOAuthCallbackUrl } from "../lib/authRedirect";

type Config = {
  supabaseOAuthCallbackUrl?: string;
};

export function LoginOAuthHints() {
  const [supabaseCallback, setSupabaseCallback] = useState<string | null>(null);
  const appCallback = getAppOAuthCallbackUrl();

  useEffect(() => {
    fetch("/api/config")
      .then(async (res) => readResponseJson<Config>(res))
      .then((c) => setSupabaseCallback(c.supabaseOAuthCallbackUrl ?? null))
      .catch(() => setSupabaseCallback(null));
  }, []);

  if (!supabaseCallback) return null;

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-left space-y-3">
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
        , under <b>Authorized redirect URIs</b>, add <b>exactly</b> the Supabase URL below (not your Vercel
        domain). The sign-in window may briefly show <code className="text-slate-300">supabase.co</code> before
        Google — that is normal.
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Google &amp; GitHub — redirect / callback URL
        </p>
        <code className="block text-[10px] text-cyan-200/90 break-all bg-black/30 p-2 rounded border border-white/10">
          {supabaseCallback}
        </code>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Supabase Dashboard — Additional Redirect URLs
        </p>
        <code className="block text-[10px] text-cyan-200/90 break-all bg-black/30 p-2 rounded border border-white/10">
          {appCallback}
        </code>
      </div>
      <p className="text-[10px] text-slate-500">
        Supabase:{" "}
        <a
          className="text-cyan-400 hover:underline"
          href="https://supabase.com/dashboard/project/_/auth/url-configuration"
          target="_blank"
          rel="noreferrer"
        >
          Auth → URL Configuration
        </a>{" "}
        — set Site URL to this deployment and whitelist the URL above.
      </p>
    </div>
  );
}
