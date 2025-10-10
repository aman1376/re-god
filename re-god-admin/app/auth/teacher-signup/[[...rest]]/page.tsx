"use client"

import React, { useEffect, useState } from "react"
import { SignUp } from "@clerk/nextjs"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import AdminApiService from "@/lib/api"

export default function TeacherSignupPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isValidatingCode, setIsValidatingCode] = useState(true)
  const [codeValid, setCodeValid] = useState(false)
  const [validationError, setValidationError] = useState("")
  const [validatedTeacherCode, setValidatedTeacherCode] = useState("")

  // Handle successful signup - validate teacher code and redirect
  const handleSignupSuccess = async () => {
    if (!validatedTeacherCode || !user?.id) {
      console.error('Missing teacher code or user ID for validation')
      return
    }

    try {
      console.log('Signup successful, validating teacher code:', validatedTeacherCode)
      await AdminApiService.validateTeacherCode(validatedTeacherCode, user.id)
      console.log('Teacher code validated successfully, redirecting to dashboard')
      
      // Clean up localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('teacher_signup_code')
      }
      
      // Redirect to dashboard
      window.location.href = '/dashboard'
    } catch (error) {
      console.error('Failed to validate teacher code after signup:', error)
      // Still redirect to dashboard - they can try again later
      window.location.href = '/dashboard'
    }
  }

  useEffect(() => {
    const validateTeacherCode = async () => {
      // Try to get teacher code from query params first
      let teacherCode = searchParams.get('teacher_code')
      
      // If not found in query params, try to extract from hash fragment
      if (!teacherCode && typeof window !== 'undefined') {
        const hash = window.location.hash
        const hashParams = new URLSearchParams(hash.replace('#', ''))
        teacherCode = hashParams.get('teacher_code')
      }
      
      // If still not found, try to extract from the full URL hash
      if (!teacherCode && typeof window !== 'undefined') {
        const hash = window.location.hash
        const match = hash.match(/teacher_code=([^&]+)/)
        if (match) {
          teacherCode = match[1]
        }
      }
      
      console.log('Extracted teacher code:', teacherCode)
      console.log('Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A')
      console.log('Hash:', typeof window !== 'undefined' ? window.location.hash : 'N/A')
      
      if (!teacherCode) {
        setValidationError("Teacher code is required to access this page.")
        setIsValidatingCode(false)
        return
      }

      try {
        // Validate teacher code exists and is active (without requiring authentication)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || ''}/admin/teachers/validate-code-exists`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cloudflare-skip-browser-warning': 'true',
          },
          body: JSON.stringify({
            teacher_code: teacherCode
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Invalid teacher code')
        }

        setCodeValid(true)
        setValidatedTeacherCode(teacherCode)
        
        // Store teacher code in localStorage for the success page
        if (typeof window !== 'undefined') {
          localStorage.setItem('teacher_signup_code', teacherCode)
        }
      } catch (error) {
        console.error('Teacher code validation failed:', error)
        setValidationError(error instanceof Error ? error.message : 'Invalid teacher code')
      } finally {
        setIsValidatingCode(false)
      }
    }

    validateTeacherCode()
  }, [searchParams])

  // Watch for signup completion and handle teacher code validation
  useEffect(() => {
    if (isSignedIn && user && validatedTeacherCode && codeValid) {
      console.log('User signed in with valid teacher code, processing...')
      handleSignupSuccess()
    }
  }, [isSignedIn, user, validatedTeacherCode, codeValid])

  // Show loading state while validating teacher code
  if (isValidatingCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
          <p className="mt-4 text-gray-600">Validating teacher code...</p>
        </div>
      </div>
    )
  }

  // Show error if teacher code is invalid
  if (!codeValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 font-medium mb-2">Invalid Teacher Code</p>
              <p className="text-red-700 text-sm">{validationError}</p>
            </div>
            <p className="text-gray-600 mb-6">
              Teacher signup is restricted to invitation-only access. You need a valid teacher code from an administrator.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/sign-in'}
              className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Sign In Instead
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while Clerk is loading
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

  // If already signed in, show processing message
  if (isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Processing...</h2>
            <p className="text-gray-600 mb-6">Validating teacher code and setting up your account...</p>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-800 mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Information Card */}
        <div className="border border-green-200 bg-green-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
            <span className="text-lg">✅</span>
            Valid Teacher Code
          </div>
          <p className="text-green-700 text-sm mb-3">
            Your teacher code has been validated successfully
          </p>
          <div className="bg-green-100 p-3 rounded border border-green-200">
            <p className="text-sm text-green-800 mb-2">
              <strong>Teacher Code:</strong> <code className="bg-green-200 px-2 py-1 rounded">{validatedTeacherCode}</code>
            </p>
            <p className="text-sm text-green-800">
              You can now complete your teacher account signup below.
            </p>
          </div>
        </div>

        {/* Clerk SignUp Component */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">REGod Teacher Portal</h1>
          <p className="text-gray-600 mb-6">Create your teacher account</p>
          
          <SignUp 
            signInUrl="/sign-in"
            afterSignUpUrl="/dashboard"
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
                dividerText: "text-gray-500"
              }
            }}
          />
        </div>

        <div className="text-center text-sm text-gray-600">
          <p>
            Already have an account?{" "}
            <a href="/sign-in" className="text-red-800 hover:underline font-medium">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
