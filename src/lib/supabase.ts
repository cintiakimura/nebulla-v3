import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || '';

const configured = Boolean(supabaseUrl && supabaseAnonKey);

if (import.meta.env.DEV && !configured) {
  console.warn(
    'Supabase: optional. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env (see .env.example), then restart the dev server. OAuth/auth stays off until set.'
  );
}

export const supabase = createClient(
  configured ? supabaseUrl : 'https://placeholder.supabase.co',
  configured ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
);

export const isSupabaseConfigured = configured;
