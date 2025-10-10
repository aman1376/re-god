"use client"

import { TeacherStats } from "@/components/teacher-stats"
import { TeacherStudents } from "@/components/teacher-students"
import { QuickLinks } from "@/components/quick-links"
import { AdminProfile } from "@/components/admin-profile"

export function TeacherDashboard() {
  return (
    <>
      <AdminProfile />
      <TeacherStats />
      <QuickLinks />
    </>
  )
}

export function TeacherDashboardRight() {
  return (
    <TeacherStudents />
  )
}



