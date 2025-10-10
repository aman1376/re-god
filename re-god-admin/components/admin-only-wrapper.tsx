"use client"

import { useAuth } from "@/contexts/auth-context"
import { ReactNode } from "react"

interface AdminOnlyWrapperProps {
  children: ReactNode
  fallback?: ReactNode
}

export function AdminOnlyWrapper({ children, fallback = null }: AdminOnlyWrapperProps) {
  const { user, isLoading } = useAuth()

  console.log('AdminOnlyWrapper Debug:', {
    isLoading,
    hasUser: !!user,
    userRoles: user?.roles,
    userRole: user?.role,
    timestamp: new Date().toISOString()
  })

  // Don't render anything while loading
  if (isLoading) {
    console.log('AdminOnlyWrapper: Still loading, returning null')
    return null
  }

  // Don't render anything if no user
  if (!user) {
    console.log('AdminOnlyWrapper: No user, returning null')
    return null
  }

  // Check if user is admin
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'
  
  console.log('AdminOnlyWrapper Role Check:', {
    userRoles: user.roles,
    userRole: user.role,
    isAdmin,
    rolesIncludesAdmin: user.roles?.includes('admin'),
    roleEqualsAdmin: user.role === 'admin'
  })

  // Don't render admin components if user is not admin
  if (!isAdmin) {
    console.log('AdminOnlyWrapper: User is not admin, returning fallback')
    return <>{fallback}</>
  }

  console.log('AdminOnlyWrapper: User is admin, rendering admin components')
  return <>{children}</>
}
