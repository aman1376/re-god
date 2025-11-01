"use client"

import { useEffect, useState } from "react"
import { Trash2, Users, ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import AdminApiService, { type Student, type Teacher } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

export function StudentsDirectory() {
  const { user } = useAuth()
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage] = useState(10)
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null)

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

  const fetchTeachers = async () => {
    try {
      const data = await AdminApiService.getAllTeachers()
      setTeachers(data)
    } catch (err) {
      console.error('Failed to fetch teachers:', err)
    }
  }

  useEffect(() => {
    console.log('StudentsDirectory: Making API call for admin user')
    fetchStudents(1)
    if (isAdmin) {
      fetchTeachers()
    }
  }, [isAdmin])

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

  const handleTeacherChange = async (studentId: string, teacherId: string) => {
    if (!isAdmin) return
    
    setUpdatingStudentId(studentId)
    try {
      const result = await AdminApiService.updateStudentTeacher(studentId, teacherId)
      
      // Update the student in the local state
      setStudents(prev => prev.map(s => 
        s.id === studentId 
          ? { ...s, teacher_id: result.teacher_id, teacher_name: result.teacher_name, teacher_code: result.teacher_code }
          : s
      ))
      
      setEditingTeacherId(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update student\'s teacher';
      alert(errorMessage)
    } finally {
      setUpdatingStudentId(null)
    }
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
                  {isAdmin && (
                    <>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Teacher Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Teacher Code</th>
                    </>
                  )}
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr 
                    key={student.id} 
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td 
                      className="py-4 px-4 text-sm text-gray-900 cursor-pointer"
                      onClick={() => handleViewStudent(student.id)}
                    >
                      {student.first_name || '-'}
                    </td>
                    <td 
                      className="py-4 px-4 text-sm text-gray-600 cursor-pointer"
                      onClick={() => handleViewStudent(student.id)}
                    >
                      {student.last_name || '-'}
                    </td>
                    <td 
                      className="py-4 px-4 text-sm cursor-pointer"
                      onClick={() => handleViewStudent(student.id)}
                    >
                      <a 
                        href={`mailto:${student.email}`} 
                        className="text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {student.email}
                      </a>
                    </td>
                    <td 
                      className="py-4 px-4 text-sm text-gray-600 cursor-pointer"
                      onClick={() => handleViewStudent(student.id)}
                    >
                      {student.phone || '-'}
                    </td>
                    {isAdmin && (
                      <>
                        <td className="py-4 px-4 text-sm text-gray-600">
                          {editingTeacherId === student.id ? (
                            <select
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              value={student.teacher_id || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleTeacherChange(student.id, e.target.value)
                                }
                              }}
                              disabled={updatingStudentId === student.id}
                              onBlur={() => setEditingTeacherId(null)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Select Teacher</option>
                              {teachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                  {teacher.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div 
                              className="flex items-center gap-1 cursor-pointer hover:text-blue-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingTeacherId(student.id)
                              }}
                            >
                              <span>{student.teacher_name || '-'}</span>
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td 
                          className="py-4 px-4 text-sm text-gray-600 cursor-pointer"
                          onClick={() => handleViewStudent(student.id)}
                        >
                          {student.teacher_code || '-'}
                        </td>
                      </>
                    )}
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

