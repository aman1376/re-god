"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"

export default function HomePage() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()

  // Remove automatic redirects to prevent loops
  // Let users manually navigate or use direct URLs

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">REGod Admin</h1>
        
        <div className="space-y-4">
          {isSignedIn ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
                ) : (
                  <>
                    <button
                      onClick={() => router.push('/sign-in')}
                      className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => router.push('/auth/teacher-signup')}
                      className="w-full border border-red-800 text-red-800 hover:bg-red-50 font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      Teacher Signup
                    </button>
                  </>
                )}
        </div>
        
        <p className="mt-6 text-sm text-gray-500">
          {isSignedIn ? 'Welcome back!' : 'Please sign in to access the admin dashboard'}
        </p>
        
        {!isSignedIn && (
          <div className="mt-4 text-xs text-gray-400">
            <p>Having trouble signing in? Use the "Forgot password?" option on the sign-in page.</p>
          </div>
        )}
      </div>
    </div>
  )
}
