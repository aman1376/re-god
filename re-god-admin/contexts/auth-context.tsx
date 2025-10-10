"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useUser, useAuth as useClerkAuth } from "@clerk/nextjs"
import AdminApiService from "@/lib/api"
import { setAuthContext } from "@/lib/auth-utils"

interface User {
  id: string
  email: string
  name: string
  role: string
  verified: boolean
  clerk_user_id: string
  avatar_url?: string
  roles: string[]
  permissions: string[]
  requiresTeacherCode?: boolean
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (token: string) => void
  logout: () => void
  forceLogout: () => void
  validateClerkSession: () => Promise<boolean>
  getAuthToken: () => Promise<string | null>
  ensureFreshToken: () => Promise<string | null>
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
  submitTeacherCode: (teacherCode: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  
  // Clerk hooks
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser()
  const { signOut, getToken } = useClerkAuth()

  // Check if current path is a public route (doesn't require authentication)
  const isPublicRoute = pathname === '/sign-in' || pathname === '/sign-up' || pathname.startsWith('/auth/')

  const checkAuth = useCallback(async () => {
    // Prevent multiple simultaneous auth checks
    if (authChecked) {
      console.log('Auth already checked, skipping...')
      return
    }
    
    try {
      console.log('Starting auth check...')
      setAuthChecked(true)
      
      if (isSignedIn && clerkUser) {
        // Get Clerk token and sync with backend
        const token = await getToken()
        if (token) {
          // Store token for API calls (only on client side)
          if (typeof window !== 'undefined') {
            localStorage.setItem('clerk_session_token', token)
            localStorage.setItem('clerk_token_timestamp', Date.now().toString())
          }
          
          // Exchange Clerk token for backend JWT token
          try {
            console.log('🔍 Exchanging Clerk token for backend JWT...')
            const exchangeResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api'}/auth/clerk-exchange`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'cloudflare-skip-browser-warning': 'true',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                identifier: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress
              })
            })
            
            if (exchangeResponse.ok) {
              const exchangeData = await exchangeResponse.json()
              console.log('✅ Successfully exchanged Clerk token for backend JWT')
              
              // Check if user needs a teacher code
              if (exchangeData.requires_teacher_code) {
                console.log('📝 User needs teacher code:', exchangeData.message)
                
                // Set user data but mark as needing teacher code
                const pendingUser: User = {
                  id: exchangeData.user_id,
                  email: exchangeData.user_data.email,
                  name: exchangeData.user_data.name,
                  role: 'student',
                  verified: exchangeData.user_data.is_verified,
                  clerk_user_id: clerkUser.id,
                  avatar_url: clerkUser.imageUrl,
                  roles: exchangeData.user_data.roles || ['student'],
                  permissions: [],
                  requiresTeacherCode: true // Add this flag
                }
                console.log('📝 Setting pending user (needs teacher code):', pendingUser)
                setUser(pendingUser)
                return
              }
              
              // Store backend JWT tokens
              if (typeof window !== 'undefined') {
                localStorage.setItem('admin_access_token', exchangeData.auth_token)
                localStorage.setItem('admin_refresh_token', exchangeData.refresh_token)
                localStorage.setItem('admin_user_id', exchangeData.user_id)
                localStorage.setItem('admin_user_email', exchangeData.user_data.email)
                localStorage.setItem('admin_user_name', exchangeData.user_data.name)
                localStorage.setItem('isAuthenticated', 'true')
              }
              
              // Set user data from backend
              const backendUser: User = {
                id: exchangeData.user_id,
                email: exchangeData.user_data.email,
                name: exchangeData.user_data.name,
                role: exchangeData.user_data.roles[0] || 'student',
                verified: exchangeData.user_data.is_verified,
                clerk_user_id: clerkUser.id,
                avatar_url: clerkUser.imageUrl,
                roles: exchangeData.user_data.roles || ['student'],
                permissions: exchangeData.user_data.permissions || [] // Use actual permissions from backend
              }
              console.log('✅ Setting backend user data:', backendUser)
              setUser(backendUser)
            } else if (exchangeResponse.status === 403) {
              // User is not authorized (not a teacher/admin)
              console.log('❌ Access denied - user does not have required permissions')
              const errorData = await exchangeResponse.json()
              console.log('Access denied details:', errorData.detail)
              
              // Sign out the user from Clerk
              await signOut()
              
              // Clear any stored tokens
              if (typeof window !== 'undefined') {
                localStorage.removeItem('admin_access_token')
                localStorage.removeItem('admin_refresh_token')
                localStorage.removeItem('admin_user_id')
                localStorage.removeItem('admin_user_email')
                localStorage.removeItem('admin_user_name')
                localStorage.removeItem('isAuthenticated')
                localStorage.removeItem('clerk_session_token')
                localStorage.removeItem('clerk_token_timestamp')
              }
              
              // Store error in localStorage as fallback
              if (typeof window !== 'undefined') {
                localStorage.setItem('signin_error', 'access_denied')
              }
              
              // Redirect to sign-in with error message
              router.push('/sign-in?error=access_denied')
              setUser(null)
              return
            } else {
              console.log('❌ Failed to exchange Clerk token:', exchangeResponse.status)
              // Don't throw error, just handle it gracefully
              await signOut()
              if (typeof window !== 'undefined') {
                localStorage.removeItem('admin_access_token')
                localStorage.removeItem('admin_refresh_token')
                localStorage.removeItem('admin_user_id')
                localStorage.removeItem('admin_user_email')
                localStorage.removeItem('admin_user_name')
                localStorage.removeItem('isAuthenticated')
                localStorage.removeItem('clerk_session_token')
                localStorage.removeItem('clerk_token_timestamp')
                localStorage.setItem('signin_error', 'authentication_failed')
              }
              router.push('/sign-in?error=authentication_failed')
              setUser(null)
              return
            }
          } catch (error) {
            console.log('❌ Failed to exchange Clerk token:', error)
            console.log('🚫 No fallback user creation - authentication failed')
            
            try {
              // Sign out the user from Clerk
              await signOut()
            } catch (signOutError) {
              console.log('Failed to sign out:', signOutError)
            }
            
            // Clear any stored tokens
            if (typeof window !== 'undefined') {
              localStorage.removeItem('admin_access_token')
              localStorage.removeItem('admin_refresh_token')
              localStorage.removeItem('admin_user_id')
              localStorage.removeItem('admin_user_email')
              localStorage.removeItem('admin_user_name')
              localStorage.removeItem('isAuthenticated')
              localStorage.removeItem('clerk_session_token')
              localStorage.removeItem('clerk_token_timestamp')
              localStorage.setItem('signin_error', 'authentication_failed')
            }
            
            // Redirect to sign-in with error message
            try {
              router.push('/sign-in?error=authentication_failed')
            } catch (routerError) {
              console.log('Failed to redirect:', routerError)
            }
            setUser(null)
          }
        }
      } else {
        setUser(null)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('clerk_session_token')
          localStorage.removeItem('clerk_token_timestamp')
          localStorage.removeItem('admin_access_token')
          localStorage.removeItem('admin_refresh_token')
          localStorage.removeItem('admin_user_id')
          localStorage.removeItem('admin_user_email')
          localStorage.removeItem('admin_user_name')
          localStorage.removeItem('isAuthenticated')
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clerk_session_token')
      }
    } finally {
      setIsLoading(false)
    }
  }, [clerkUser, isSignedIn, router, authChecked])

  useEffect(() => {
    console.log('🔄 Clerk state changed:', { 
      clerkLoaded, 
      isSignedIn, 
      clerkUser: !!clerkUser,
      clerkUserEmail: clerkUser?.primaryEmailAddress?.emailAddress,
      clerkUserId: clerkUser?.id
    })
    
    if (clerkLoaded) {
      console.log('✅ Clerk loaded, checking auth...')
      checkAuth()
    } else {
      console.log('⏳ Clerk still loading...')
    }
  }, [clerkLoaded, isSignedIn, checkAuth])

  // Provide a fallback user object when Clerk user is available and signed in but backend data isn't loaded
  const effectiveUser = user || (clerkLoaded && isSignedIn && clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || '',
    name: clerkUser.fullName || '',
    role: 'student', // Default to student role until backend data is loaded
    verified: true,
    clerk_user_id: clerkUser.id,
    avatar_url: clerkUser.imageUrl,
    roles: ['student'], // Default to student role
    permissions: [] // No permissions until backend data is loaded
  } : null)

  // Consider user authenticated if they're signed in with Clerk OR have backend user data
  const isAuthenticated = !!user || (clerkLoaded && isSignedIn)
  
  // Debug logging (only when Clerk is loaded)
  if (clerkLoaded) {
    console.log('🔍 Auth Context Debug:', {
      user: !!user,
      clerkLoaded,
      isSignedIn,
      clerkUser: !!clerkUser,
      isAuthenticated,
      effectiveUser: !!effectiveUser,
      clerkUserEmail: clerkUser?.primaryEmailAddress?.emailAddress,
      clerkUserId: clerkUser?.id
    })
  }

  // Remove all automatic redirects - let individual pages handle navigation
  // This prevents redirect loops and gives more control to each page

  const login = (token: string) => {
    // This method is kept for compatibility but not used with Clerk
    console.log('Login method called with token:', token)
  }

  const logout = async () => {
    try {
      await signOut()
      setUser(null)
      setAuthChecked(false) // Reset auth check flag
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clerk_session_token')
      }
      router.push('/sign-in')
    } catch (error) {
      console.error('Logout failed:', error)
      // Force logout even if Clerk signOut fails
      setUser(null)
      setAuthChecked(false) // Reset auth check flag
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clerk_session_token')
      }
      router.push('/sign-in')
    }
  }

  // Function to validate Clerk session by trying to get a token
  const validateClerkSession = async () => {
    try {
      if (!clerkUser || !isSignedIn) {
        console.log('🔍 No Clerk user or not signed in')
        return false
      }
      
      console.log('🔍 Validating Clerk session...')
      const token = await getToken()
      console.log('🔍 Clerk token:', token ? 'Present' : 'Missing')
      
      if (!token) {
        console.log('❌ Clerk session is invalid - no token available')
        return false
      }
      
      console.log('✅ Clerk session is valid')
      return true
    } catch (error) {
      console.log('❌ Clerk session validation failed:', error)
      return false
    }
  }

  // Function to get a fresh auth token from Clerk
  const getAuthToken = async (): Promise<string | null> => {
    try {
      if (!clerkUser || !isSignedIn) {
        console.log('🔍 No Clerk user or not signed in for token request')
        return null
      }
      
      console.log('🔍 Getting fresh token from Clerk...')
      const token = await getToken()
      
      if (token) {
        // Store the fresh token in localStorage for API calls
        if (typeof window !== 'undefined') {
          localStorage.setItem('clerk_session_token', token)
        }
        console.log('✅ Fresh Clerk token obtained and stored')
        return token
      } else {
        console.log('❌ Failed to get fresh Clerk token')
        return null
      }
    } catch (error) {
      console.log('❌ Error getting fresh Clerk token:', error)
      return null
    }
  }

  // Function to automatically refresh token if needed
  const ensureFreshToken = async (): Promise<string | null> => {
    try {
      if (!clerkUser || !isSignedIn) {
        console.log('❌ No Clerk user or not signed in')
        return null
      }
      
      console.log('🔄 Getting fresh token from Clerk...')
      // Always get a fresh token from Clerk
      const token = await getToken()
      
      if (token) {
        console.log('✅ Fresh token obtained, storing...')
        // Store the fresh token
        if (typeof window !== 'undefined') {
          localStorage.setItem('clerk_session_token', token)
          localStorage.setItem('clerk_token_timestamp', Date.now().toString())
        }
        return token
      }
      
      console.log('❌ No token received from Clerk')
      return null
    } catch (error) {
      console.log('❌ Error ensuring fresh token:', error)
      return null
    }
  }

  // Force logout function to clear stale authentication state
  const forceLogout = async () => {
    try {
      console.log('Force logout initiated - clearing all authentication state')
      setIsLoading(true)
      
      // Clear all Clerk sessions
      if (typeof window !== 'undefined') {
        // Clear all Clerk-related localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.includes('clerk') || key.includes('auth')) {
            localStorage.removeItem(key)
          }
        })
      }
      
      // Sign out from Clerk if possible
      try {
        await signOut()
      } catch (e) {
        console.log('Clerk signOut failed, but continuing with force logout')
      }
      
      // Clear local state
      setUser(null)
      setAuthChecked(false)
      
      // Force page reload to clear all state
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in'
      }
      
      console.log('Force logout completed')
    } catch (error) {
      console.error('Force logout error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const hasPermission = (permission: string): boolean => {
    if (!effectiveUser) return false
    return effectiveUser.permissions.includes(permission) || effectiveUser.permissions.includes('admin:all')
  }

  const hasRole = (role: string): boolean => {
    if (!effectiveUser) return false
    return effectiveUser.roles.includes(role)
  }

  const submitTeacherCode = async (teacherCode: string): Promise<boolean> => {
    if (!effectiveUser || !effectiveUser.requiresTeacherCode) {
      console.log('❌ No user or user does not require teacher code')
      return false
    }

    try {
      console.log('📝 Submitting teacher code:', teacherCode)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api'}/admin/teachers/assign-teacher-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cloudflare-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          teacher_code: teacherCode,
          user_id: effectiveUser.id
        })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Teacher code accepted:', data.message)
        
        // Update user data with new roles
        const updatedUser: User = {
          ...effectiveUser,
          role: 'teacher',
          roles: data.user_data.roles,
          requiresTeacherCode: false
        }
        setUser(updatedUser)
        
        // Re-run auth check to get JWT tokens
        await checkAuth()
        
        return true
      } else {
        const errorData = await response.json()
        console.log('❌ Teacher code rejected:', errorData.detail)
        return false
      }
    } catch (error) {
      console.log('❌ Error submitting teacher code:', error)
      return false
    }
  }

  // Register auth context with utils for API service access
  useEffect(() => {
    setAuthContext({
      ensureFreshToken,
      getAuthToken,
      validateClerkSession
    });
  }, [ensureFreshToken, getAuthToken, validateClerkSession]);

  const value: AuthContextType = {
    user: effectiveUser,
    isLoading,
    isAuthenticated,
    login,
    logout,
    forceLogout,
    validateClerkSession,
    getAuthToken,
    ensureFreshToken,
    hasPermission,
    hasRole,
    submitTeacherCode
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Higher-order component for protecting routes
export function withAuth<T extends object>(Component: React.ComponentType<T>) {
  return function ProtectedComponent(props: T) {
    const { isAuthenticated, isLoading } = useAuth()

    // Only show loading state, let Clerk middleware handle redirects
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      )
    }

    // Clerk middleware will handle redirects, so just render the component
    return <Component {...props} />
  }
}
