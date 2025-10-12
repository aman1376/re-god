"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Search, X, User, Mail, Phone, Calendar, Hash } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TeacherInviteForm } from "./teacher-invite-form"
import AdminApiService, { type Teacher } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

export function TeachersDirectory() {
  const { user } = useAuth()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage] = useState(50)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Check if user has admin permissions
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'

  const fetchTeachers = async (pageNum: number = 1) => {
    try {
      setIsLoading(true)
      const data = await AdminApiService.getTeachersDirectory(pageNum, itemsPerPage)
      setTeachers(data.items)
      setFilteredTeachers(data.items)
      setPage(data.page)
      setTotalPages(data.total_pages)
      setTotal(data.total)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch teachers';
      setError(errorMessage);
    } finally {
      setIsLoading(false)
    }
  }

  // Filter teachers based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTeachers(teachers)
    } else {
      const filtered = teachers.filter(teacher => 
        teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredTeachers(filtered)
    }
  }, [searchQuery, teachers])

  useEffect(() => {
    console.log('TeachersDirectory: Making API call for admin user')
    fetchTeachers(1)
  }, [])

  const handleInviteSuccess = () => {
    fetchTeachers(1) // Refresh the list from page 1
  }

  return (
    <>
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Teachers Directory</h3>
        </div>
        
        {/* Search Bar */}
        {showSearch && (
          <div className="mb-4 relative">
            <Input
              type="text"
              placeholder="Search teachers by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
            <button
              onClick={() => {
                setShowSearch(false)
                setSearchQuery("")
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading teachers...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : (
          <>
            {/* Scrollable container */}
            <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
              {filteredTeachers.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  {searchQuery ? 'No teachers found matching your search.' : 'No teachers found. Invite your first teacher below.'}
                </div>
              ) : (
                filteredTeachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between">
                    <div 
                      className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
                      onClick={() => {
                        setSelectedTeacher(teacher)
                        setShowModal(true)
                      }}
                    >
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
            
            {/* Pagination Controls */}
            {teachers.length > 0 && totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {teachers.length} of {total} teachers
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTeachers(page - 1)}
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
                    onClick={() => fetchTeachers(page + 1)}
                    disabled={page >= totalPages}
                    className="px-4"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        
        <div className="flex space-x-2 mt-4">
          <Button 
            variant="outline" 
            className="flex-1 text-sm bg-white text-gray-700 border-gray-300"
            onClick={() => setShowSearch(!showSearch)}
          >
            <Search className="w-4 h-4 mr-2" />
            {showSearch ? 'Hide Search' : 'Find Teachers'}
          </Button>
          <TeacherInviteForm onInviteSuccess={handleInviteSuccess} />
        </div>
      </CardContent>
    </Card>

    {/* Teacher Profile Modal */}
    {showModal && selectedTeacher && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Teacher Profile</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Teacher Info */}
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-center space-x-4">
                <img 
                  src={selectedTeacher.avatar_url || "/placeholder.svg"} 
                  alt={selectedTeacher.name} 
                  className="w-16 h-16 rounded-full" 
                />
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{selectedTeacher.name}</h3>
                  <p className="text-gray-600">{selectedTeacher.email}</p>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    selectedTeacher.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedTeacher.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Teacher Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Full Name</p>
                      <p className="text-gray-600">{selectedTeacher.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email Address</p>
                      <p className="text-gray-600">{selectedTeacher.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Hash className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Teacher Code</p>
                      <p className="text-gray-600 font-mono">{selectedTeacher.teacher_code || 'Not assigned'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Joined Date</p>
                      <p className="text-gray-600">
                        {selectedTeacher.created_at ? new Date(selectedTeacher.created_at).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Role</p>
                      <p className="text-gray-600 capitalize">Teacher</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <div className={`w-3 h-3 rounded-full ${selectedTeacher.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Status</p>
                      <p className="text-gray-600">{selectedTeacher.is_active ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="flex items-center space-x-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Contact</p>
                  <p className="text-gray-600">Email: {selectedTeacher.email}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end mt-8 pt-6 border-t border-gray-200">
              <Button
                onClick={() => setShowModal(false)}
                className="px-6"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
