"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TeacherInviteForm } from "./teacher-invite-form"
import AdminApiService, { type Teacher } from "@/lib/api"

export function TeachersDirectory() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchTeachers = async () => {
    try {
      setIsLoading(true)
      const data = await AdminApiService.getTeachersDirectory()
      setTeachers(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch teachers';
      setError(errorMessage);
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTeachers()
  }, [])

  const handleInviteSuccess = () => {
    fetchTeachers() // Refresh the list
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Teachers Directory</h3>
        
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading teachers...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : (
          <>
            <div className="space-y-3">
              {teachers.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  No teachers found. Invite your first teacher below.
                </div>
              ) : (
                teachers.slice(0, 5).map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img 
                        src={teacher.avatar_url || "/placeholder.svg"} 
                        alt={teacher.name} 
                        className="w-8 h-8 rounded-full" 
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">{teacher.name}</span>
                        <div className="text-xs text-gray-500">{teacher.email}</div>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <span className={`text-xs px-2 py-1 rounded ${
                        teacher.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {teacher.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {teachers.length > 5 && (
              <Button variant="ghost" className="w-full mt-4 text-sm text-gray-600">
                View All ({teachers.length})
              </Button>
            )}
          </>
        )}
        
        <div className="flex space-x-2 mt-4">
          <Button variant="outline" className="flex-1 text-sm bg-white text-gray-700 border-gray-300">
            Find Teachers
          </Button>
          <TeacherInviteForm onInviteSuccess={handleInviteSuccess} />
        </div>
      </CardContent>
    </Card>
  )
}
