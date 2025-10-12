"use client"

import { useEffect, useState } from "react"
import { Trash2, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import AdminApiService, { type Student } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

export function StudentsDirectory() {
  const { user } = useAuth()
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage] = useState(10)

  // Check if user has admin permissions
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'

  const fetchStudents = async (pageNum: number = 1) => {
    try {
      setIsLoading(true)
      const data = await AdminApiService.getStudentsDirectory(pageNum, itemsPerPage)
      console.log('Students:', data)
      setStudents(data.items)
      setPage(data.page)
      setTotalPages(data.total_pages)
      setTotal(data.total)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch students';
      console.log(errorMessage)
      setError(errorMessage);
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    console.log('StudentsDirectory: Making API call for admin user')
    fetchStudents(1)
  }, [])

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Are you sure you want to delete this student?')) {
      return
    }

    try {
      await AdminApiService.deleteStudent(studentId)
      // Refresh the list
      fetchStudents()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete student';
      alert(errorMessage)
    }
  }

  const handleViewStudent = (studentId: string) => {
    router.push(`/students/${studentId}`)
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900" style={{ color: '#8B0000' }}>List of Students</h2>
        </div>
        
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading students...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : students.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">First Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Last Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Email Address</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Phone Number</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr 
                    key={student.id} 
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleViewStudent(student.id)}
                  >
                    <td className="py-4 px-4 text-sm text-gray-900">{student.first_name || '-'}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">{student.last_name || '-'}</td>
                    <td className="py-4 px-4 text-sm">
                      <a 
                        href={`mailto:${student.email}`} 
                        className="text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {student.email}
                      </a>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600">{student.phone || '-'}</td>
                    <td className="py-4 px-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteStudent(student.id)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoading && !error && students.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {students.length} of {total} students
            </div>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchStudents(page - 1)}
                  disabled={page === 1}
                  className="px-4"
                >
                  Previous
                </Button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchStudents(page + 1)}
                  disabled={page >= totalPages}
                  className="px-4"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

