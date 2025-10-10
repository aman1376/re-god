"use client"

import React from "react"
import { SignIn } from "@clerk/nextjs"

export default function TestForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Forgot Password</h1>
          <p className="text-gray-600">This page tests if forgot password functionality is working</p>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2">Expected Behavior:</h3>
          <ul className="text-yellow-700 text-sm space-y-1">
            <li>• You should see email and password fields</li>
            <li>• Below the password field, there should be a "Forgot password?" link</li>
            <li>• Clicking it should take you to a password reset form</li>
          </ul>
        </div>
        
        <SignIn 
          redirectUrl="/dashboard"
          signUpUrl="/auth/teacher-signup"
        />
        
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            <a href="/sign-in" className="text-red-800 hover:underline">
              ← Back to main sign-in page
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}



