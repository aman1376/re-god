"use client"

import { useAuth } from "@/contexts/auth-context"
import { Sidebar } from "@/components/sidebar"

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  
  // Debug logging
  console.log('🏗️ AdminLayout Debug:', {
    isAuthenticated,
    isLoading,
    user: !!user,
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
  })

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">You need to be signed in to access this page.</p>
          <button
            onClick={() => window.location.href = '/sign-in'}
            className="bg-red-800 hover:bg-red-900 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    )
  }

  // If authenticated, proceed even without backend user data
  // The components can handle missing user data gracefully

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}

