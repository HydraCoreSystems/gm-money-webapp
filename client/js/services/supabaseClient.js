import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export {
  safeFloat,
  toCents,
  fromCents,
  extractAmount,
  parseCSV,
  detectCSVProfile,
  normalizeDate,
  normalizeDescription,
  determineType,
  formatPayee
} from './utils.js';

export const SUPABASE_URL = 'https://zaqzlzofgmgvepbcjrut.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpsem9mZ21ndmVwYmNqcnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NjM0NzIsImV4cCI6MjEwMDMzOTQ3Mn0.MCdzf4RDAK_y7HdcCy9SrKp6vQ4dKwvyZu7o5DHfCK0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
