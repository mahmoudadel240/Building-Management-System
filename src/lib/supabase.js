import { createClient } from '@supabase/supabase-js';

// Works with our own VITE_* variables, or with the ones the Vercel ⇄ Supabase
// integration adds automatically (NEXT_PUBLIC_*).
const env = import.meta.env;
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudReady = Boolean(url && key);
export const supabase = cloudReady ? createClient(url, key) : null;
