import { supabase } from './supabaseClient.js';

/**
 * Authentication module for Gathering Moss Financial Center.
 * Uses Supabase Auth with email/password.
 * Anonymous visitors see only the login screen.
 */

export const auth = {
  /**
   * Get the current session. Returns null if not authenticated.
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Auth session error:', error);
      return null;
    }
    return session;
  },

  /**
   * Get the current user. Returns null if not authenticated.
   */
  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
  },

  /**
   * Sign in with email and password.
   */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign out.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Listen for auth state changes.
   */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};
