"use client"

import { useEffect, useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { AdminProfile } from "@/components/admin-profile"
import { TeacherDashboard, TeacherDashboardRight } from "@/components/teacher-dashboard"
import { AdminDashboard, AdminDashboardRight } from "@/components/admin-dashboard"
import AdminApiService from "@/lib/api"
import { ContentManagerModal } from "@/components/admin-create-content"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"

export default function DashboardPage() {
  const { user, isLoading } = useAuth()
  const [courses, setCourses] = useState<Array<{ id: number; title: string }>>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  
  // Check if user is admin or teacher
  // IMPORTANT: Admin components should ONLY render if user has "admin" role in the roles array
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'
  const isTeacher = user?.roles?.includes('teacher') || user?.role === 'teacher'
  
  // Additional safety: If user doesn't have explicit admin role, force teacher mode
  const safeIsAdmin = isAdmin
  const safeIsTeacher = isTeacher && !isAdmin // Only show teacher dashboard if NOT admin
  
  // Debug logging
  console.log('🔍 Dashboard Debug:', {
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
    roles: user?.roles,
    role: user?.role,
    isAdmin,
    isTeacher,
    safeIsAdmin,
    safeIsTeacher
  })
  
  // Redirect unauthorized users or users needing teacher code
  if (!isLoading && user) {
    if (user.requiresTeacherCode) {
      // User needs to enter teacher code - redirect to sign-in
      window.location.href = '/sign-in'
      return null
    } else if (!isAdmin && !isTeacher) {
      // User doesn't have admin or teacher role - redirect to sign-in
      window.location.href = '/sign-in?error=access_denied'
      return null
    }
  }

  const fetchCourses = async () => {
    // Don't fetch courses until user is loaded
    if (!user) {
      console.log('Dashboard: Skipping course fetch - user not loaded')
      return
    }
    
    try {
      const list = await AdminApiService.getCourses()
      setCourses(list.map((c: any) => ({ id: c.id, title: c.title })))
      if (list.length > 0 && !selectedCourseId) {
        setSelectedCourseId(list[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch courses", error)
    }
  }

  useEffect(() => {
    // Only fetch courses when user is loaded
    if (user) {
      console.log('Dashboard: User loaded, fetching courses')
      fetchCourses()
    }
  }, [user])
  
  // Show loading state while user data is being fetched
  if (isLoading || !user) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">
              {safeIsAdmin ? "Admin Dashboard" : safeIsTeacher ? "Teacher Dashboard" : "Dashboard"}
            </h1>
            <div className="flex gap-2 items-end flex-wrap">
              <ContentManagerModal
                mode="create"
                contentType="course"
                onSuccess={fetchCourses}
                triggerButton={<Button className="bg-red-800 hover:bg-red-900">New Course</Button>}
              />
              {selectedCourseId && (
                <ContentManagerModal
                  mode="create"
                  contentType="module"
                  courseId={selectedCourseId}
                  onSuccess={() => console.log("Module created!")}
                  triggerButton={<Button className="bg-red-600 hover:bg-red-700">New Lesson</Button>}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {safeIsAdmin ? (
                <AdminDashboard />
              ) : safeIsTeacher ? (
                <TeacherDashboard />
              ) : (
                <AdminProfile />
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {safeIsAdmin ? (
                <AdminDashboardRight />
              ) : safeIsTeacher ? (
                <TeacherDashboardRight />
              ) : null}
            </div>
          </div>
      </div>
    </AdminLayout>
  )
}
