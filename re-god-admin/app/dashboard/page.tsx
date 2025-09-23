"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { AdminProfile } from "@/components/admin-profile"
import { AdminStats } from "@/components/admin-stats"
import { QuickLinks } from "@/components/quick-links"
import { AdminDirectory } from "@/components/admin-directory"
import { TeachersDirectory } from "@/components/teachers-directory"
import AdminApiService from "@/lib/api"
import { CreateCourseModal, CreateModuleModal } from "@/components/admin-create-content"

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [courses, setCourses] = useState<Array<{ id: number; title: string }>>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!AdminApiService.isAuthenticated()) {
      router.push("/login")
    } else {
      setIsAuthenticated(true)
    }
  }, [router])

  useEffect(() => {
    if (!isAuthenticated) return
    ;(async () => {
      try {
        const list = await AdminApiService.getCourses()
        setCourses(list.map((c: any) => ({ id: c.id, title: c.title })))
        if (list.length > 0) setSelectedCourseId(list[0].id)
      } catch {}
    })()
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">New Screen</h1>
            <div className="flex gap-2 items-end flex-wrap">
              <CreateCourseModal />
              <div>
                <label className="block text-sm text-gray-700 mb-1">Select Course</label>
                <select className="border rounded h-10 px-2" value={selectedCourseId ?? 0} onChange={(e) => setSelectedCourseId(Number(e.target.value))}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              {selectedCourseId && (
                <CreateModuleModal courseId={selectedCourseId} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              <AdminProfile />
              <AdminStats />
              <QuickLinks />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <AdminDirectory />
              <TeachersDirectory />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
