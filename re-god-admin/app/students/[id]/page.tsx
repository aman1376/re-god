"use client"

import { AdminLayout } from "@/components/admin-layout"
import { StudentAnalytics } from "@/components/student-analytics"
import { useAuth } from "@/contexts/auth-context"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import AdminApiService from "@/lib/api"

export default function StudentAnalyticsPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const studentId = params?.id as string
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  // Check if user is admin or teacher
  const isAdmin = user?.roles?.includes('admin') && user?.role === 'admin'
  const isTeacher = user?.roles?.includes('teacher') || user?.role === 'teacher'

  useEffect(() => {
    // Redirect users who don't have admin or teacher roles
    if (!isLoading && (!user || (!isAdmin && !isTeacher))) {
      router.push('/dashboard')
    }
  }, [user, isAdmin, isTeacher, isLoading, router])

  // Set access to true - backend will handle permission checking
  useEffect(() => {
    if (user && studentId) {
      setHasAccess(true)
    }
  }, [user, studentId])

  // Show loading state while checking auth or access
  if (isLoading || !user || (!isAdmin && !isTeacher) || hasAccess === null) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }


  return (
    <AdminLayout>
      <div className="p-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/students')}
          className="mb-4 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Students
        </Button>
        <StudentAnalytics studentId={studentId} />
      </div>
    </AdminLayout>
  )
}

