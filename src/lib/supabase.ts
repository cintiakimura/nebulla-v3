import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn('Supabase configuration missing. Check environment variables.');
      return null;
    }

    supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    return null;
  }
}
