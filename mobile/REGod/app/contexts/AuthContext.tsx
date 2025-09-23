import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import ApiService, { type User } from '../services/api';

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

interface AuthResponse {
  user_id: string;
  auth_token: string;
  refresh_token: string;
  user_data?: any;
  requires_verification?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, teacherCode?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  socialLogin: (provider: 'google' | 'apple' | 'facebook') => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Clerk hooks
  const { signOut } = useClerkAuth();
  const { user: clerkUser, isSignedIn } = useUser();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Sync with Clerk user state
  useEffect(() => {
    const syncClerkUser = async () => {
      if (isSignedIn && clerkUser) {
        setLoading(true);
        try {
          await syncUserWithClerk();
        } finally {
          setLoading(false);
        }
      } else if (!isSignedIn) {
        setUser(null);
        ApiService.clearTokens();
        setLoading(false);
      }
    };
    
    syncClerkUser();
  }, [isSignedIn, clerkUser]);

  // Check for stored tokens when component mounts or when Clerk state changes
  useEffect(() => {
    if (isSignedIn && clerkUser && !user) {
      checkAuthStatus();
    }
  }, [isSignedIn, clerkUser, user]);

  const checkAuthStatus = async () => {
    if (loading) return; // Prevent multiple simultaneous calls
    
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('regod_access_token');
      if (token) {
        // Try to get user profile to verify token is valid
        const profile = await ApiService.getProfile();
        setUser(profile);
      } else if (isSignedIn && clerkUser) {
        // If no token but signed in with Clerk, sync user data
        await syncUserWithClerk();
      }
    } catch (error) {
      // Token invalid or expired
      await ApiService.clearTokens();
      if (!isSignedIn) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const syncUserWithClerk = async () => {
    try {
      if (!clerkUser) return;

      const email = clerkUser.primaryEmailAddress?.emailAddress || '';
      if (!email) {
        console.warn('No email found for Clerk user');
        return;
      }

      // We'll use the backend JWT from clerk exchange
      console.log('Using backend JWT token for authentication');

      // Exchange Clerk identity for backend JWT (for backward compatibility)
      try {
        await ApiService.clerkExchange(email);
        console.log('Clerk exchange successful');
      } catch (exchangeError) {
        console.error('Clerk exchange failed:', exchangeError);
        // Don't return here, try to get user profile anyway
      }

      // Try to get user profile from backend using Clerk JWT
      try {
        const profile = await ApiService.getProfile();
        setUser(profile);
        console.log('User profile synced:', profile);
      } catch (profileError) {
        console.error('Failed to get user profile:', profileError);
        
        // Fallback to basic Clerk user data
        const clerkUserData = {
          id: clerkUser.id,
          email: email,
          name: clerkUser.fullName || clerkUser.firstName || '',
          role: 'student', // Default role, could be determined by other factors
          verified: clerkUser.emailAddresses.some(email => email.verification?.status === 'verified'),
        };

        setUser(clerkUserData);
        console.log('Using fallback Clerk user data:', clerkUserData);
      }
      
      // Store user data in AsyncStorage for offline access
      const userData = user || {
        id: clerkUser.id,
        email: email,
        name: clerkUser.fullName || clerkUser.firstName || '',
        role: 'student',
        verified: clerkUser.emailAddresses.some(email => email.verification?.status === 'verified'),
      };
      await AsyncStorage.setItem('regod_user_data', JSON.stringify(userData));
    } catch (error) {
      console.error('Error syncing user with Clerk:', error);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      // For now, use the existing API login until Clerk is fully configured
      const response = await ApiService.login({
        identifier: email,
        password,
      });
      
      if (response.user_data) {
        setUser(response.user_data);
      } else {
        // Get profile if user_data not included
        const profile = await ApiService.getProfile();
        setUser(profile);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string, teacherCode?: string): Promise<AuthResponse> => {
    try {
      setError(null);
      setLoading(true);
      
      // Use existing API registration
      const registerData = {
        email,
        password,
        name,
        ...(teacherCode && { teacher_code: teacherCode }),
      };
      
      const response = await ApiService.register(registerData);
      
      // Get profile after registration
      try {
        const profile = await ApiService.getProfile();
        setUser(profile);
        
        // If teacher code was provided, use it after successful registration
        if (teacherCode) {
          try {
            await ApiService.useTeacherCode(teacherCode);
            // Refresh profile to get updated access
            const updatedProfile = await ApiService.getProfile();
            setUser(updatedProfile);
          } catch (teacherCodeError) {
            console.warn('Teacher code could not be applied:', teacherCodeError);
            // Don't fail registration if teacher code is invalid
          }
        }
      } catch (profileError) {
        // If profile fetch fails, set basic user info from response
        setUser({
          id: response.user_id,
          email,
          name,
          role: 'student',
          verified: !response.requires_verification,
        });
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await ApiService.logout();
      setUser(null);
      await ApiService.clearTokens();
      await AsyncStorage.removeItem('regod_user_data');
    } finally {
      setLoading(false);
    }
  };

  const socialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    try {
      setError(null);
      setLoading(true);

      // For now, show a placeholder message until social login is fully implemented
      throw new Error(`${provider} login is not yet implemented. Please use email/password authentication.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `${provider} login failed`;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUserData = async () => {
    try {
      await syncUserWithClerk();
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user || !!isSignedIn,
    loading,
    login,
    register,
    logout,
    error,
    clearError,
    socialLogin,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
