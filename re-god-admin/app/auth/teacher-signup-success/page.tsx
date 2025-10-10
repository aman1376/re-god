"use client"

import React, { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import AdminApiService from "@/lib/api"

export default function TeacherSignupSuccessPage() {
  const { isSignedIn, isLoaded, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const processTeacherSignup = async () => {
      if (!isLoaded || !isSignedIn || !user) return

      try {
        // Get teacher code from URL parameters
        const teacherCode = searchParams.get('teacher_code')
        
        if (!teacherCode) {
          setError("Teacher code is required. Please contact your administrator.")
          setIsProcessing(false)
          return
        }

        console.log('Processing teacher signup with code:', teacherCode)

        // Validate teacher code and assign role
        await AdminApiService.validateTeacherCode(teacherCode, user.id)
        
        // Success - redirect to dashboard
        setTimeout(() => {
          setIsProcessing(false)
          window.location.href = '/dashboard'
        }, 1500)

      } catch (error) {
        console.error('Error processing teacher signup:', error)
        setError(error instanceof Error ? error.message : 'Failed to validate teacher code')
        setIsProcessing(false)
      }
    }

    processTeacherSignup()
  }, [isLoaded, isSignedIn, user, searchParams])

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to REGod!</h1>
          
          {isProcessing ? (
            <div className="space-y-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
              </div>
              <p className="text-gray-600">Validating teacher code and setting up your account...</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2">Validation Failed</h3>
                <p className="text-red-700">{error}</p>
              </div>
              <button
                onClick={() => window.location.href = '/auth/teacher-signup'}
                className="bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 text-lg">
                Your teacher account has been created successfully!
              </p>
              <p className="text-gray-500">
                You now have access to the teacher dashboard where you can manage courses and students.
              </p>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 text-sm text-gray-500">
          <p>Need help? Contact your administrator for support.</p>
        </div>
      </div>
    </div>
  )
}
