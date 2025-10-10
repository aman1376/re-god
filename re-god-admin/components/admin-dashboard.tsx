"use client"

import { lazy, Suspense } from "react"
import { QuickLinks } from "@/components/quick-links"
import { AdminProfile } from "@/components/admin-profile"

// Lazy load admin components
const AdminStats = lazy(() => import("@/components/admin-stats").then(m => ({ default: m.AdminStats })))
const AdminDirectory = lazy(() => import("@/components/admin-directory").then(m => ({ default: m.AdminDirectory })))
const TeachersDirectory = lazy(() => import("@/components/teachers-directory").then(m => ({ default: m.TeachersDirectory })))
const StudentsDirectory = lazy(() => import("@/components/teacher-students").then(m => ({ default: m.TeacherStudents })))

export function AdminDashboard() {
  return (
    <>
      <AdminProfile />
      <Suspense fallback={<div className="animate-pulse bg-gray-200 h-32 rounded"></div>}>
        <AdminStats />
      </Suspense>
      <QuickLinks />
    </>
  )
}

export function AdminDashboardRight() {
  return (
    <Suspense fallback={<div className="animate-pulse bg-gray-200 h-32 rounded"></div>}>
      <StudentsDirectory />
      <TeachersDirectory />
    </Suspense>
  )
}



