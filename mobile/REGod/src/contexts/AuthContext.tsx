import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import ApiService, { type User, type AuthResponse } from '../services/api';
import { NotificationService } from '../services/notificationService';
import TimeTrackingService from '../services/timeTrackingService';

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();


interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, teacherCode?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  socialLogin: (provider: 'google' | 'apple' | 'facebook', teacherCode?: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
  debugJWT: () => Promise<any>;
  migrateFromClerk: () => Promise<boolean>;
  checkTeacherAssignment: () => Promise<boolean>;
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

// Helper function to normalize user data (handles both 'role' and 'roles' formats)
const normalizeUserData = (userData: any): User | null => {
  if (!userData) return null;
  
  // Extract role from either 'role' field or 'roles' array
  let role = userData.role;
  if (!role && userData.roles && Array.isArray(userData.roles) && userData.roles.length > 0) {
    role = userData.roles[0];
  }
  if (!role) {
    role = 'student'; // default role
  }
  
  return {
    id: String(userData.id),
    email: userData.email || '',
    name: userData.name || 'User',
    role,
    verified: userData.is_verified || userData.verified || false,
    phone: userData.phone,
    avatar_url: userData.avatar_url
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authenticationInProgress = useRef(false);
  
  // Clerk hooks
  const { signOut, getToken } = useClerkAuth();
  const { user: clerkUser, isSignedIn } = useUser();

  // Helper function to register push token
  const registerPushToken = async () => {
    try {
      const expoPushToken = NotificationService.getExpoPushToken();
      if (expoPushToken) {
        await ApiService.registerPushToken(expoPushToken);
        console.log('Push token registered successfully');
      } else {
        console.log('No push token available to register (normal in development)');
      }
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  };

  useEffect(() => {
    // Initialize notifications and time tracking
    const initializeServices = async () => {
      try {
        // Initialize notifications
        await NotificationService.initialize();
        console.log('Notifications initialized successfully');
        
        // Initialize time tracking service
        await TimeTrackingService.initialize();
        console.log('Time tracking initialized successfully');
      } catch (error) {
        console.error('Failed to initialize services:', error);
      }
    };

    initializeServices();

    // Set up periodic token refresh check (every 5 minutes)
    const tokenRefreshInterval = setInterval(async () => {
      const token = await AsyncStorage.getItem('regod_access_token');
      if (token && ApiService.isTokenExpiringSoon(token, 10)) { // Refresh if expiring within 10 minutes
        console.log('Token expiring soon, refreshing proactively...');
        try {
          const newToken = await ApiService.refreshTokenIfNeeded();
          if (newToken) {
            console.log('Token refreshed successfully in background');
            // Re-validate user profile with new token
            const profile = await ApiService.getProfile();
            setUser(profile);
          }
        } catch (error) {
          console.error('Background token refresh failed:', error);
        }
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(tokenRefreshInterval);
  }, []);

  // Single unified authentication flow
  useEffect(() => {
    // Only log when there's a meaningful state change
    if (isSignedIn !== undefined) {
      console.log('🔄 Auth state change - isSignedIn:', isSignedIn, 'clerkUser:', !!clerkUser, 'user:', !!user, 'loading:', loading);
    }
    
    const handleAuthStateChange = async () => {
      if (isSignedIn && clerkUser) {
        // Only authenticate if we don't already have a user and we're not already authenticating
        if (!user && !authenticationInProgress.current) {
          console.log('🚀 Starting authentication flow...');
          authenticationInProgress.current = true;
          setLoading(true);
          try {
            // Try to get stored user data first (fast path)
            const storedUserData = await AsyncStorage.getItem('regod_user_data');
            const storedTokens = await AsyncStorage.getItem('regod_access_token');
            
            if (storedUserData && storedTokens) {
              try {
                const parsedUser = JSON.parse(storedUserData);
                const normalized = normalizeUserData(parsedUser);
                setUser(normalized);
                console.log('Using stored user data:', normalized);
                // Register push token for notifications
                await registerPushToken();
                setLoading(false);
                authenticationInProgress.current = false;
                return; // Skip authentication if we have valid stored data
              } catch (e) {
                console.log('Invalid stored user data, proceeding with authentication');
              }
            }
            
            // No valid stored data, proceed with Clerk authentication
            console.log('No stored data found, proceeding with authentication...');
            
            // Do the authentication logic directly here instead of calling syncUserWithClerk
            const email = clerkUser.primaryEmailAddress?.emailAddress || '';
            
            // Prefer Clerk JWT (template) for backend API calls; fallback to session token
            let sessionToken: string | null = null;
            try {
              sessionToken = (await getToken({ template: 'regod-backend' } as any)) || null;
            } catch (e) {
              // Template token might not be available; fallback to session token
              sessionToken = (await getToken()) || null;
            }

            if (sessionToken) {
              await ApiService.setClerkToken(sessionToken);
              console.log('Clerk token obtained and stored');
            } else {
              console.warn('No Clerk token available from getToken');
            }

            // Check if we already have valid JWT tokens
            const existingAccessToken = await AsyncStorage.getItem('regod_access_token');
            const existingRefreshToken = await AsyncStorage.getItem('regod_refresh_token');
            
            console.log('AuthContext: Checking existing tokens:', {
              hasAccessToken: !!existingAccessToken,
              hasRefreshToken: !!existingRefreshToken,
              accessTokenLength: existingAccessToken?.length || 0
            });
            
            if (existingAccessToken && existingRefreshToken) {
              console.log('User already has JWT tokens, skipping Clerk exchange');
              // Just set the user data from stored info
              const storedUserData = await AsyncStorage.getItem('regod_user_data');
              if (storedUserData) {
                const parsedUser = JSON.parse(storedUserData);
                const normalized = normalizeUserData(parsedUser);
                setUser(normalized);
                console.log('Using existing JWT tokens and stored user data:', normalized);
                // Register push token for notifications
                await registerPushToken();
                setLoading(false);
                authenticationInProgress.current = false;
                return;
              } else {
                console.log('No stored user data found, will proceed with Clerk exchange');
              }
            } else {
              console.log('No valid JWT tokens found, will proceed with Clerk exchange');
            }
            
            // Try Clerk exchange first to get JWT tokens
            try {
              console.log('Attempting Clerk exchange to get JWT tokens...');
              const exchangeResponse = await ApiService.clerkExchange(email);
              
              // Check if user needs a teacher code
              if (exchangeResponse.requires_teacher_code) {
                console.log('User needs teacher code:', exchangeResponse.message);
                // Store user data and set user state but don't set as authenticated yet
                if (exchangeResponse.user_data) {
                  const normalized = normalizeUserData(exchangeResponse.user_data);
                  if (normalized) {
                    normalized.requiresTeacherCode = true;
                    setUser(normalized); // Set user state so it's available
                    await AsyncStorage.setItem('regod_user_data', JSON.stringify(normalized));
                    console.log('User data stored and set, teacher code required:', normalized);
                  }
                }
                return; // Don't proceed with authentication
              }
              
              // Store the JWT tokens from exchange (only if they exist)
              if (exchangeResponse.auth_token) {
                await AsyncStorage.setItem('regod_access_token', exchangeResponse.auth_token);
              }
              if (exchangeResponse.refresh_token) {
                await AsyncStorage.setItem('regod_refresh_token', exchangeResponse.refresh_token);
              }
              
              // Use the user data from exchange or fetch profile
              if (exchangeResponse.user_data) {
                const normalized = normalizeUserData(exchangeResponse.user_data);
                setUser(normalized);
                await AsyncStorage.setItem('regod_user_data', JSON.stringify(normalized));
                console.log('User migrated to JWT tokens via Clerk exchange:', normalized);
                // Register push token for notifications
                await registerPushToken();
              } else {
                // Fetch profile with new JWT token
                const profile = await ApiService.getProfile();
                const normalized = normalizeUserData(profile);
                setUser(normalized);
                await AsyncStorage.setItem('regod_user_data', JSON.stringify(normalized));
                console.log('User profile fetched after Clerk exchange:', normalized);
                // Register push token for notifications
                await registerPushToken();
              }
              
              console.log('Authentication complete, user should be navigated to main app');
              
              // Force a state update to trigger re-renders
              setLoading(false);
              
              // Direct navigation as fallback
              try {
                console.log('Attempting direct navigation to main app...');
                router.replace('/(tabs)/course');
                console.log('Direct navigation initiated');
              } catch (navError) {
                console.error('Direct navigation failed:', navError);
              }
              
              // Clear Clerk token since we now have JWT tokens
              await AsyncStorage.removeItem('clerk_session_token');
              
            } catch (exchangeError) {
              console.error('Clerk exchange failed:', exchangeError);
              
              // Try direct profile fetch with Clerk token
              try {
                const profile = await ApiService.getProfile();
                setUser(profile);
                await AsyncStorage.setItem('regod_user_data', JSON.stringify(profile));
                console.log('User profile synced with Clerk token:', profile);
              } catch (profileError) {
                console.error('Profile fetch also failed:', profileError);

                // Final fallback to basic Clerk user data
                const clerkUserData = {
                  id: clerkUser.id,
                  email: email,
                  name: clerkUser.fullName || 
                        (clerkUser.firstName && clerkUser.lastName ? `${clerkUser.firstName} ${clerkUser.lastName}` : '') ||
                        clerkUser.firstName || 
                        email.split('@')[0] || 
                        'User',
                  role: 'student',
                  verified: clerkUser.emailAddresses.some(e => e.verification?.status === 'verified'),
                };

                setUser(clerkUserData);
                await AsyncStorage.setItem('regod_user_data', JSON.stringify(clerkUserData));
                console.log('Using fallback Clerk user data:', clerkUserData);
              }
            }
          } finally {
            setLoading(false);
            authenticationInProgress.current = false;
          }
        }
      } else if (!isSignedIn) {
        setUser(null);
        ApiService.clearTokens();
        setLoading(false);
        authenticationInProgress.current = false;
      }
    };
    
    handleAuthStateChange();
  }, [isSignedIn, clerkUser, user]); // Include user to prevent unnecessary re-authentication


  const syncUserWithClerk = async () => {
    console.log('🚫 syncUserWithClerk is disabled - authentication handled in useEffect');
    return; // Function disabled - authentication is now handled directly in useEffect
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      // Use the backend JWT authentication
      const response = await ApiService.login({
        identifier: email,
        password,
      });
      
      // Store tokens in AsyncStorage (only if they exist)
      if (response.auth_token) {
        await AsyncStorage.setItem('regod_access_token', response.auth_token);
      }
      if (response.refresh_token) {
        await AsyncStorage.setItem('regod_refresh_token', response.refresh_token);
      }
      
      if (response.user_data) {
        setUser(response.user_data);
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(response.user_data));
      } else {
        // Get profile if user_data not included
        const profile = await ApiService.getProfile();
        setUser(profile);
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(profile));
      }
      
      console.log('Login successful with JWT tokens');
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
      
      // Use backend JWT registration
      const registerData = {
        email,
        password,
        name,
        ...(teacherCode && { teacher_code: teacherCode }),
      };
      
      const response = await ApiService.register(registerData);
      
      // Store tokens in AsyncStorage (only if they exist)
      if (response.auth_token) {
        await AsyncStorage.setItem('regod_access_token', response.auth_token);
      }
      if (response.refresh_token) {
        await AsyncStorage.setItem('regod_refresh_token', response.refresh_token);
      }
      
      // Get profile after registration
      try {
        const profile = await ApiService.getProfile();
        setUser(profile);
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(profile));
        
        // If teacher code was provided, use it after successful registration
        if (teacherCode) {
          try {
            await ApiService.applyTeacherCode(teacherCode);
            // Refresh profile to get updated access
            const updatedProfile = await ApiService.getProfile();
            setUser(updatedProfile);
            await AsyncStorage.setItem('regod_user_data', JSON.stringify(updatedProfile));
          } catch (teacherCodeError) {
            console.warn('Teacher code could not be applied:', teacherCodeError);
            // Don't fail registration if teacher code is invalid
          }
        }
      } catch (profileError) {
        // If profile fetch fails, set basic user info from response
        const basicUser = {
          id: response.user_id,
          email,
          name,
          role: 'student',
          verified: !response.requires_verification,
        };
        setUser(basicUser);
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(basicUser));
      }
      
      console.log('Registration successful with JWT tokens');
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
    console.log('Logout initiated, setting loading to true');
    setLoading(true);
    try {
      // Sign out from Clerk if signed in
      if (isSignedIn) {
        console.log('Signing out from Clerk...');
        await signOut();
      }
      
      // Clear all tokens and user data on explicit logout
      console.log('Clearing tokens and user data...');
      await ApiService.clearTokensOnLogout();
      setUser(null);
      
      console.log('Logout successful, user set to null');
      
      // Direct navigation to auth screen after logout
      try {
        console.log('Attempting direct navigation to auth screen after logout...');
        router.replace('/auth');
        console.log('Direct navigation to auth screen initiated');
      } catch (navError) {
        console.error('Direct navigation to auth screen failed:', navError);
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      setUser(null);
      await ApiService.clearTokensOnLogout();
      
      // Direct navigation to auth screen even on error
      try {
        console.log('Attempting direct navigation to auth screen after logout error...');
        router.replace('/auth');
        console.log('Direct navigation to auth screen initiated (error case)');
      } catch (navError) {
        console.error('Direct navigation to auth screen failed (error case):', navError);
      }
    } finally {
      console.log('Logout complete, setting loading to false');
      setLoading(false);
    }
  };

  const socialLogin = async (provider: 'google' | 'apple' | 'facebook', teacherCode?: string) => {
    try {
      setError(null);
      setLoading(true);

      console.log(`Starting ${provider} login...`);
      
      // Note: Social login implementation requires proper OAuth configuration
      // For now, we'll provide a helpful message
      throw new Error(
        `Social login with ${provider} requires OAuth configuration. ` +
        `Please configure ${provider} OAuth credentials in Clerk Dashboard first, ` +
        `then use the warmUpOAuth() hook in the auth screen component.`
      );
      
    } catch (err) {
      console.error(`${provider} login error:`, err);
      const errorMessage = err instanceof Error ? err.message : `${provider} login failed`;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const checkTeacherAssignment = async (): Promise<boolean> => {
    try {
      const assignment = await ApiService.checkTeacherAssignment();
      return assignment.has_teacher;
    } catch (error) {
      console.error('Error checking teacher assignment:', error);
      return false;
    }
  };

  const refreshUserData = async () => {
    try {
      if (!clerkUser || !isSignedIn) {
        console.log('No Clerk user or not signed in, cannot refresh');
        return;
      }

      // Clear existing data and re-authenticate
      await ApiService.clearTokens();
      await AsyncStorage.removeItem('regod_user_data');
      
      // Re-run authentication flow
      const email = clerkUser.primaryEmailAddress?.emailAddress || '';
      
      // Get Clerk token
      let sessionToken: string | null = null;
      try {
        sessionToken = (await getToken({ template: 'regod-backend' } as any)) || null;
      } catch (e) {
        sessionToken = (await getToken()) || null;
      }

      if (sessionToken) {
        await ApiService.setClerkToken(sessionToken);
        console.log('Clerk token refreshed and stored');
        
        // Try Clerk exchange
        try {
          const exchangeResponse = await ApiService.clerkExchange(email);
          
          // Store tokens only if they exist
          if (exchangeResponse.auth_token) {
            await AsyncStorage.setItem('regod_access_token', exchangeResponse.auth_token);
          }
          if (exchangeResponse.refresh_token) {
            await AsyncStorage.setItem('regod_refresh_token', exchangeResponse.refresh_token);
          }
          
          if (exchangeResponse.user_data) {
            setUser(exchangeResponse.user_data);
            await AsyncStorage.setItem('regod_user_data', JSON.stringify(exchangeResponse.user_data));
            console.log('User data refreshed via Clerk exchange');
          }
          
          await AsyncStorage.removeItem('clerk_session_token');
        } catch (exchangeError) {
          console.error('Clerk exchange failed during refresh:', exchangeError);
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  const debugJWT = async () => {
    try {
      // Try different tokens for debugging
      const tokens = {
        access_token: await AsyncStorage.getItem('regod_access_token'),
        refresh_token: await AsyncStorage.getItem('regod_refresh_token'),
        clerk_session_token: await AsyncStorage.getItem('clerk_session_token'),
      };
      
      console.log('Available tokens:', Object.keys(tokens).filter(key => tokens[key as keyof typeof tokens]));
      
      // Debug the first available token
      for (const [tokenType, token] of Object.entries(tokens)) {
        if (token) {
          console.log(`Debugging ${tokenType}...`);
          const result = await ApiService.debugJWTToken(token);
          console.log(`${tokenType} debug result:`, result);
          return { ...result, tokenType };
        }
      }
      
      console.log('No tokens found for debugging');
      return { error: 'No tokens found', success: false };
    } catch (error) {
      console.error('Debug JWT failed:', error);
      return { error: 'Debug failed', success: false };
    }
  };

  // Migration utility to help users move from Clerk to JWT
  const migrateFromClerk = async () => {
    try {
      console.log('Starting migration from Clerk to JWT...');
      
      if (!isSignedIn || !clerkUser) {
        console.log('No Clerk user to migrate');
        return false;
      }
      
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        console.log('No email found for Clerk user');
        return false;
      }
      
      // Try Clerk exchange
      const exchangeResponse = await ApiService.clerkExchange(email);
      
      // Store JWT tokens (only if they exist)
      if (exchangeResponse.auth_token) {
        await AsyncStorage.setItem('regod_access_token', exchangeResponse.auth_token);
      }
      if (exchangeResponse.refresh_token) {
        await AsyncStorage.setItem('regod_refresh_token', exchangeResponse.refresh_token);
      }
      
      // Update user data
      if (exchangeResponse.user_data) {
        setUser(exchangeResponse.user_data);
        await AsyncStorage.setItem('regod_user_data', JSON.stringify(exchangeResponse.user_data));
      }
      
      // Clear Clerk token
      await AsyncStorage.removeItem('clerk_session_token');
      
      console.log('Migration from Clerk to JWT completed successfully');
      return true;
      
    } catch (error) {
      console.error('Migration from Clerk failed:', error);
      return false;
    }
  };

  const clearError = () => {
    setError(null);
  };

  const isAuthenticated = !!user;
  
  // Debug logging for authentication state
  useEffect(() => {
    console.log('AuthContext state change - user:', !!user, 'isAuthenticated:', isAuthenticated, 'loading:', loading);
  }, [user, isAuthenticated, loading]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    error,
    clearError,
    socialLogin,
    refreshUserData,
    debugJWT,
    migrateFromClerk,
    checkTeacherAssignment,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
