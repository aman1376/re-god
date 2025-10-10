"use client"

import { useEffect, useState } from "react"
import { Users, Mail, Calendar } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import AdminApiService from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

interface Student {
  id: string
  name: string
  email: string
  assigned_at: string
}

export function TeacherStudents() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setIsLoading(true)
        const data = isAdmin ? await AdminApiService.getStudentsDirectory() : await AdminApiService.getMyStudents()
        console.log('My students:', data)
        setStudents(data as Student[])
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch students';
        console.log(errorMessage)
        setError(errorMessage);
      } finally {
        setIsLoading(false)
      }
    }

    fetchStudents()
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
          <div className="space-y-3">
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
                      <span>{new Date(student.assigned_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
