"use client"

import { useEffect, useState } from "react"
import { Users, Mail, Calendar } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import AdminApiService, { type Student } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

interface MyStudent {
  id: string
  name: string
  email: string
  assigned_at: string
}

export function TeacherStudents() {
  const router = useRouter()
  const [students, setStudents] = useState<MyStudent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const itemsPerPage = 10
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'

  const fetchStudents = async (pageNum: number = 1) => {
    try {
      setIsLoading(true)
      const data = isAdmin ? await AdminApiService.getStudentsDirectory(pageNum, itemsPerPage) : await AdminApiService.getMyStudents()
      console.log('My students:', data)
      
      if (data && typeof data === 'object' && 'items' in data) {
        // Paginated response - convert Student[] to MyStudent[]
        const myStudents: MyStudent[] = data.items.map((student: any) => ({
          id: student.id,
          name: student.name,
          email: student.email,
          assigned_at: student.assigned_at || student.created_at || 'Not assigned'
        }))
        setStudents(myStudents)
        setPage(data.page)
        setTotalPages(data.total_pages)
        setTotal(data.total)
      } else {
        // Non-paginated response (fallback)
        const myStudents = Array.isArray(data) ? data as MyStudent[] : []
        setStudents(myStudents)
        setPage(1)
        setTotalPages(1)
        setTotal(myStudents.length)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch students';
      console.log(errorMessage)
      setError(errorMessage);
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents(1)
  }, [])

  const handleViewStudent = (studentId: string) => {
    router.push(`/students/${studentId}`)
  }

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-12 bg-gray-200 rounded"></div>
              <div className="h-12 bg-gray-200 rounded"></div>
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>Failed to load students</p>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Students</h3>
        </div>
        
        {students.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No students assigned yet</p>
            <p className="text-sm">Students will appear here once they use your teacher code</p>
          </div>
        ) : (
          <>
            {/* Scrollable container */}
            <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
              {students.map((student) => (
                <div 
                  key={student.id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleViewStudent(student.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-medium text-gray-900">{student.name}</h4>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Mail className="w-3 h-3" />
                        <span>{student.email}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{student.assigned_at ? new Date(student.assigned_at).toLocaleDateString() : 'Not assigned'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination Controls - only show for admin users */}
            {isAdmin && totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {students.length} of {total} students
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchStudents(page - 1)}
                    disabled={page === 1}
                    className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => fetchStudents(page + 1)}
                    disabled={page >= totalPages}
                    className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
