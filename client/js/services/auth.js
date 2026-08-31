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
   * Update password for the currently signed-in user.
   */
  async updatePassword(newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return data;
  },

  /**
   * Update user metadata (such as display name).
   */
  async updateProfile(metadata) {
    const { data, error } = await supabase.auth.updateUser({
      data: metadata
    });
    if (error) throw error;
    return data;
  },

  /**
   * Send a password reset email.
   */
  async resetPasswordForEmail(email) {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    return data;
  },

  /**
   * Fetch enrolled members from fc_members.
   */
  async getMembers() {
    const { data, error } = await supabase.from('fc_members').select('*');
    if (error) return [];
    return data || [];
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
