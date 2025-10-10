"use client"

import { AdminLayout } from "@/components/admin-layout"
import { StudentsDirectory } from "@/components/students-directory"
import { TeacherStudents } from "@/components/teacher-students"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function StudentsPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  // Check if user is admin or teacher
  const isAdmin = user?.roles?.includes('admin') && user?.role === 'admin'
  const isTeacher = user?.roles?.includes('teacher') || user?.role === 'teacher'

  useEffect(() => {
    // Redirect users who don't have admin or teacher roles
    if (!isLoading && (!user || (!isAdmin && !isTeacher))) {
      router.push('/dashboard')
    }
  }, [user, isAdmin, isTeacher, isLoading, router])

  // Show loading state while checking auth
  if (isLoading || !user || (!isAdmin && !isTeacher)) {
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
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800" style={{ color: '#8B0000' }}>
            {isAdmin ? "Admin Directory" : "My Students"}
          </h1>
        </div>
        <StudentsDirectory /> 
      </div>
    </AdminLayout>
  )
}

