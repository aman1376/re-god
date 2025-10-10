"use client"

import React from "react"
import { SignIn } from "@clerk/nextjs"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useAuth as useAuthContext } from "@/contexts/auth-context"
import { TeacherCodeInput } from "@/components/teacher-code-input"

// Component to handle search params (needs to be in Suspense)
function SignInWithParams() {
  try {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')
    return <SignInContent error={error} />
  } catch (error) {
    // Fallback if useSearchParams fails
    console.warn('Failed to get search params:', error)
    return <SignInContent error={null} />
  }
}

// Main content component
function SignInContent({ error }: { error: string | null }) {
  const { isSignedIn, isLoaded } = useAuth()
  const { forceLogout, validateClerkSession, getAuthToken, user } = useAuthContext()
  const router = useRouter()
  
  // Check for error in localStorage as fallback
  const [localStorageError, setLocalStorageError] = React.useState<string | null>(null)
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedError = localStorage.getItem('signin_error')
      if (storedError) {
        setLocalStorageError(storedError)
        // Clear the error after reading it
        localStorage.removeItem('signin_error')
      }
    }
  }, [])
  
  // Use either URL param error or localStorage error
  const displayError = error || localStorageError

  // Remove custom redirect logic - let auth context handle it

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-800 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show teacher code input if user needs it
  if (isSignedIn && user && user.requiresTeacherCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome!</h1>
            <p className="text-gray-600">You're signed in as {user.email}</p>
          </div>
          <TeacherCodeInput 
            onSuccess={() => {
              // Redirect to dashboard after successful teacher code submission
              router.push('/dashboard')
            }}
          />
        </div>
      </div>
    )
  }

  // Show success state if user is signed in with manual navigation
  if (isLoaded && isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Sign in successful!</h2>
            <p className="text-gray-600 mb-6">You are now signed in to your account.</p>
          </div>
          <button
            onClick={() => {
              console.log('🚀 Navigating to dashboard...')
              // Force a page refresh to ensure auth context picks up the changes
              window.location.href = '/dashboard'
            }}
            className="bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">REGod Admin</h1>
          <p className="text-gray-600">Sign in to access the admin dashboard</p>
          
          {(displayError === 'access_denied' || displayError === 'authentication_failed') && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <strong className="text-red-800">
                  {displayError === 'access_denied' ? 'Access Denied' : 'Authentication Failed'}
                </strong>
              </div>
              <p className="text-red-700 text-sm">
                {displayError === 'access_denied' 
                  ? 'Your account does not have the required permissions to access the admin portal. Please contact your administrator for access.'
                  : 'There was an issue with your authentication. Please try signing in again or contact your administrator.'
                }
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center w-full">
        <SignIn 
          redirectUrl="/dashboard"
          signUpUrl="/auth/teacher-signup"
          forceRedirectUrl="/dashboard"
          routing="path"
          path="/sign-in"
          appearance={{
            elements: {
              formButtonPrimary: "bg-red-800 hover:bg-red-900 text-white",
              card: "shadow-lg",
              headerTitle: "text-gray-900",
              headerSubtitle: "text-gray-600",
              socialButtonsBlockButton: "border-gray-300 hover:bg-gray-50",
              formFieldInput: "border-gray-300 focus:border-red-500 focus:ring-red-500",
              footerActionLink: "text-red-800 hover:text-red-900",
              identityPreviewText: "text-gray-600",
              formFieldLabel: "text-gray-700",
              dividerLine: "bg-gray-300",
              dividerText: "text-gray-500",
              formFieldSuccessText: "text-green-600",
              formFieldErrorText: "text-red-600",
              formFieldWarningText: "text-amber-600",
              formFieldInputShowPasswordButton: "text-gray-500 hover:text-gray-700",
              formFieldInputShowPasswordIcon: "text-gray-500",
              formResendCodeLink: "text-red-800 hover:text-red-900",
              footerActionText: "text-gray-600",
              identityPreviewEditButton: "text-red-800 hover:text-red-900",
              formFieldAction: "text-red-800 hover:text-red-900",
              formFieldActionLink: "text-red-800 hover:text-red-900",
              alternativeMethodsBlockButton: "border-gray-300 hover:bg-gray-50",
              alternativeMethodsBlockButtonText: "text-gray-700"
            }
          }}
        />
        </div>
        <div className="mt-6 text-center text-sm text-gray-600 space-y-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <strong className="text-blue-800">Existing Accounts Only</strong>
            </div>
            <p className="text-blue-700 text-sm">
              This login is restricted to existing teacher and admin accounts. 
              New registrations are not allowed through this page.
            </p>
            <p className="text-blue-600 text-xs mt-2">
              Need access? Contact your administrator for account setup.
            </p>
          </div>
        </div>
        {/* <div className="mt-6 text-center text-sm text-gray-600 space-y-2">
          <p>
            Are you a teacher? Contact your administrator for access.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-blue-800 text-sm">
              <strong>Forgot Password?</strong> The "Forgot password?" link should appear below the password field in the sign-in form above. 
              If you don't see it, try refreshing the page or contact your administrator.
            </p>
          </div>
        </div>
        <div className="mt-4 text-center">
          <button
            onClick={forceLogout}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Clear Authentication State
          </button>
        </div> */}
      </div>
    </div>
  )
}

// Main export with Suspense boundary
export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-800 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SignInWithParams />
    </Suspense>
  )
}
