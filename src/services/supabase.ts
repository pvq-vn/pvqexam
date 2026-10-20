import { createClient, SupabaseClient } from '@supabase/supabase-js';

const globalProcess =
  typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;

const env =
  typeof import.meta !== 'undefined' && import.meta?.env
    ? import.meta.env
    : globalProcess?.env || {};

const supabaseUrl = env?.VITE_SUPABASE_URL;
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  String(supabaseUrl).trim() !== '' && 
  String(supabaseAnonKey).trim() !== ''
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

/**
 * Returns list of admin email addresses configured in env.
 */
export function getAdminEmails(): string[] {
  const adminEnv = String(env?.VITE_ADMIN_EMAILS || '');
  return adminEnv
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks if a given email belongs to the admin list.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  return admins.includes(email.trim().toLowerCase());
}
