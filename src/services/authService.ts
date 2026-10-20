import { supabase, isSupabaseConfigured, isAdminEmail } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  isAdmin: boolean;
  isApproved?: boolean;
  role?: 'admin' | 'user';
  allowedExamSources?: string[];
}

const LOCAL_USER_KEY = 'hust_quiz_local_user';

export const authService = {
  /**
   * Retrieves the current user profile (from Supabase or local mock session).
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
          const isAdmin = isAdminEmail(user.email);

          // Fetch user profile from user_profiles table
          let isApproved = isAdmin;
          let role: 'admin' | 'user' = isAdmin ? 'admin' : 'user';
          let allowedExamSources: string[] = [];

          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .maybeSingle();

            if (profile) {
              if (profile.role === 'admin') {
                role = 'admin';
                isApproved = true;
              } else {
                isApproved = Boolean(profile.is_approved);
                role = 'user';
                allowedExamSources = Array.isArray(profile.allowed_exam_sources)
                  ? profile.allowed_exam_sources
                  : [];
              }
            }
          } catch (profileErr) {
            console.warn('Could not query user_profiles table:', profileErr);
          }

          return {
            id: user.id,
            email: user.email,
            fullName: user.user_metadata?.full_name || user.email.split('@')[0],
            isAdmin: isAdmin || role === 'admin',
            isApproved: isAdmin || role === 'admin' ? true : isApproved,
            role: isAdmin || role === 'admin' ? 'admin' : 'user',
            allowedExamSources,
          };
        }
      } catch (err) {
        console.warn('Supabase auth check failed:', err);
      }
    }

    // Local profile fallback
    const local = localStorage.getItem(LOCAL_USER_KEY);
    if (local) {
      try {
        const user = JSON.parse(local);
        const isAdmin = isAdminEmail(user.email);
        return {
          ...user,
          isAdmin,
          isApproved: isAdmin ? true : Boolean(user.isApproved),
          role: isAdmin ? 'admin' : (user.role || 'user'),
          allowedExamSources: user.allowedExamSources || [],
        };
      } catch {
        localStorage.removeItem(LOCAL_USER_KEY);
      }
    }

    return null;
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

      return {
        id: data.user.id,
        email: data.user.email || email,
        fullName: fullName || email.split('@')[0],
        isAdmin: isAdminEmail(email),
      };
    }

    // Local registration fallback
    const localUser: UserProfile = {
      id: `local-user-${Date.now()}`,
      email,
      fullName: fullName || email.split('@')[0],
      isAdmin: isAdminEmail(email),
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
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

      return {
        id: data.user.id,
        email: data.user.email || email,
        fullName: data.user.user_metadata?.full_name || email.split('@')[0],
        isAdmin: isAdminEmail(email),
      };
    }

    // Local login fallback
    const localUser: UserProfile = {
      id: `local-user-${Date.now()}`,
      email,
      fullName: email.split('@')[0],
      isAdmin: isAdminEmail(email),
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
    return localUser;
  },

  /**
   * Logout current session.
   */
  async logout(): Promise<void> {
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
   * Listen for authentication state changes.
   */
  onAuthStateChange(callback: (user: UserProfile | null) => void) {
    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (session?.user?.email) {
            callback({
              id: session.user.id,
              email: session.user.email,
              fullName: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              isAdmin: isAdminEmail(session.user.email),
            });
          } else {
            callback(null);
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
          callback({ ...user, isAdmin: isAdminEmail(user.email) });
        } catch {
          callback(null);
        }
      } else {
        callback(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  },
};
