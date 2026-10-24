import { SubjectPermissionTier } from '../types/quiz';
import { supabase, isSupabaseConfigured, isAdminEmail } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  isAdmin: boolean;
  isApproved?: boolean;
  role?: 'admin' | 'user';
  allowedExamSources?: string[];
  subjectPermissions?: Record<string, SubjectPermissionTier>;
  updatedAt?: string;
}

const LOCAL_USER_KEY = 'hust_quiz_local_user';

let cachedUser: UserProfile | null = null;
let isAuthRestoring = false;
let isAuthInitializedFlag = false;
let authPromise: Promise<UserProfile | null> | null = null;

async function resolveUserProfile(user: any): Promise<UserProfile> {
  const email = user.email || '';
  const isAdmin = isAdminEmail(email);

  let isApproved = isAdmin;
  let role: 'admin' | 'user' = isAdmin ? 'admin' : 'user';
  let allowedExamSources: string[] = [];
  let subjectPermissions: Record<string, SubjectPermissionTier> = {};
  let updatedAt: string | undefined = undefined;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && profile) {
        if (profile.role === 'admin' || isAdmin) {
          role = 'admin';
          isApproved = true;
        } else {
          isApproved = Boolean(profile.is_approved);
          role = 'user';
        }
        allowedExamSources = Array.isArray(profile.allowed_exam_sources)
          ? profile.allowed_exam_sources
          : [];
        subjectPermissions =
          typeof profile.subject_permissions === 'object' && profile.subject_permissions !== null
            ? profile.subject_permissions
            : {};
        updatedAt = profile.updated_at;
      }
    } catch (profileErr) {
      console.warn('Could not query user_profiles table:', profileErr);
    }
  }

  const resolved: UserProfile = {
    id: user.id,
    email,
    fullName: user.user_metadata?.full_name || email.split('@')[0],
    isAdmin: isAdmin || role === 'admin',
    isApproved: isAdmin || role === 'admin' ? true : isApproved,
    role: isAdmin || role === 'admin' ? 'admin' : 'user',
    allowedExamSources,
    subjectPermissions,
    updatedAt,
  };

  return resolved;
}

export const authService = {
  isInitialized(): boolean {
    return isAuthInitializedFlag;
  },

  isRestoring(): boolean {
    return isAuthRestoring;
  },

  /**
   * Retrieves the current user profile (from Supabase or local mock session).
   * Thread-safe / singleton promise prevents race conditions on rapid tab switching.
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    if (authPromise) {
      return authPromise;
    }

    isAuthRestoring = true;
    authPromise = (async () => {
      try {
        if (isSupabaseConfigured && supabase) {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (user && user.email) {
              const fullProfile = await resolveUserProfile(user);
              cachedUser = fullProfile;
              isAuthInitializedFlag = true;
              return fullProfile;
            }
          } catch (err) {
            console.warn('Supabase getUser check error:', err);
          }
        }

        // Local profile fallback
        const local = localStorage.getItem(LOCAL_USER_KEY);
        if (local) {
          try {
            const user = JSON.parse(local);
            const isAdmin = isAdminEmail(user.email);
            const resolved: UserProfile = {
              ...user,
              isAdmin: isAdmin || user.role === 'admin',
              isApproved: isAdmin || user.role === 'admin' ? true : Boolean(user.isApproved),
              role: isAdmin || user.role === 'admin' ? 'admin' : (user.role || 'user'),
              allowedExamSources: user.allowedExamSources || [],
              subjectPermissions: user.subjectPermissions || {},
            };
            cachedUser = resolved;
            isAuthInitializedFlag = true;
            return resolved;
          } catch {
            localStorage.removeItem(LOCAL_USER_KEY);
          }
        }

        cachedUser = null;
        isAuthInitializedFlag = true;
        return null;
      } finally {
        isAuthRestoring = false;
        authPromise = null;
      }
    })();

    return authPromise;
  },

  /**
   * Register with email and password.
   */
  async register(email: string, password: string, fullName?: string): Promise<UserProfile> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || email.split('@')[0] },
        },
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Không thể tạo tài khoản');

      const profile = await resolveUserProfile(data.user);
      cachedUser = profile;
      return profile;
    }

    // Local registration fallback
    const localUser: UserProfile = {
      id: `local-user-${Date.now()}`,
      email,
      fullName: fullName || email.split('@')[0],
      isAdmin: isAdminEmail(email),
      isApproved: true,
      role: isAdminEmail(email) ? 'admin' : 'user',
      allowedExamSources: [],
      subjectPermissions: {},
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
    cachedUser = localUser;
    return localUser;
  },

  /**
   * Login with email and password.
   */
  async login(email: string, password: string): Promise<UserProfile> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Đăng nhập thất bại');

      const profile = await resolveUserProfile(data.user);
      cachedUser = profile;
      return profile;
    }

    // Local login fallback
    const localUser: UserProfile = {
      id: `local-user-${Date.now()}`,
      email,
      fullName: email.split('@')[0],
      isAdmin: isAdminEmail(email),
      isApproved: true,
      role: isAdminEmail(email) ? 'admin' : 'user',
      allowedExamSources: [],
      subjectPermissions: {},
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
    cachedUser = localUser;
    return localUser;
  },

  /**
   * Logout current session.
   */
  async logout(): Promise<void> {
    cachedUser = null;
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Supabase signout warning:', err);
      }
    }
    localStorage.removeItem(LOCAL_USER_KEY);
  },

  /**
   * Listen for authentication state changes safely without race conditions.
   * Tab switching/focus events won't downgrade or nullify a valid admin user.
   */
  onAuthStateChange(callback: (user: UserProfile | null) => void) {
    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_OUT') {
            cachedUser = null;
            callback(null);
            return;
          }

          if (session?.user) {
            // Tab blur / focus triggers TOKEN_REFRESHED or SIGNED_IN.
            // If already resolved and user ID matches, keep existing admin status while refreshing
            if (cachedUser && cachedUser.id === session.user.id) {
              callback(cachedUser);
            }

            try {
              const fullProfile = await resolveUserProfile(session.user);
              cachedUser = fullProfile;
              isAuthInitializedFlag = true;
              callback(fullProfile);
            } catch (err) {
              console.warn('Error refreshing profile in onAuthStateChange:', err);
              if (cachedUser) {
                callback(cachedUser);
              }
            }
          } else if (event === 'INITIAL_SESSION' && !session) {
            // Initial check found no session
            if (!cachedUser) {
              callback(null);
            }
          }
        }
      );
      return () => subscription.unsubscribe();
    }

    // Local mode listener
    const handleStorage = () => {
      const local = localStorage.getItem(LOCAL_USER_KEY);
      if (local) {
        try {
          const user = JSON.parse(local);
          const isAdmin = isAdminEmail(user.email);
          const resolved: UserProfile = {
            ...user,
            isAdmin: isAdmin || user.role === 'admin',
            isApproved: isAdmin || user.role === 'admin' ? true : Boolean(user.isApproved),
            role: isAdmin || user.role === 'admin' ? 'admin' : (user.role || 'user'),
            allowedExamSources: user.allowedExamSources || [],
            subjectPermissions: user.subjectPermissions || {},
          };
          cachedUser = resolved;
          callback(resolved);
        } catch {
          callback(null);
        }
      } else {
        cachedUser = null;
        callback(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },
};
