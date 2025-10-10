"use client"

import React, { useState } from "react"
import { useAuth } from "@/contexts/auth-context"

interface TeacherCodeInputProps {
  onSuccess?: () => void
}

export function TeacherCodeInput({ onSuccess }: TeacherCodeInputProps) {
  const { submitTeacherCode } = useAuth()
  const [teacherCode, setTeacherCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teacherCode.trim()) {
      setError("Please enter a teacher code")
      return
    }

    setIsSubmitting(true)
    setError("")
    setSuccess("")

    try {
      const result = await submitTeacherCode(teacherCode.trim())
      
      if (result) {
        setSuccess("Teacher code accepted! Redirecting to dashboard...")
        setTimeout(() => {
          onSuccess?.()
        }, 1500)
      } else {
        setError("Invalid teacher code. Please check and try again.")
      }
    } catch (err) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
      <div className="flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 className="text-lg font-semibold text-blue-800">Teacher Access Required</h3>
      </div>
      
      <p className="text-blue-700 text-sm mb-4 text-center">
        To access the admin portal, please enter your teacher code provided by your administrator.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="teacherCode" className="block text-sm font-medium text-blue-800 mb-2">
            Teacher Code
          </label>
          <input
            type="text"
            id="teacherCode"
            value={teacherCode}
            onChange={(e) => setTeacherCode(e.target.value.toUpperCase())}
            placeholder="Enter your teacher code"
            className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-700 text-sm">{success}</span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !teacherCode.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          {isSubmitting ? "Verifying..." : "Submit Teacher Code"}
        </button>
      </form>

      <div className="mt-4 text-center">
        <p className="text-blue-600 text-xs">
          Don't have a teacher code? Contact your administrator for access.
        </p>
      </div>
    </div>
  )
}
