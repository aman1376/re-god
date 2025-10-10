"use client"

import { Home, FileText, Settings, User, LogOut, Users } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { logout, user } = useAuth()

  const handleLogout = () => {
    logout()
  }

  const isActive = (path: string) => pathname === path
  
  // Check if user is admin or teacher
  const isAdmin = user?.roles?.includes('admin') && user?.role === 'admin'
  const isTeacher = user?.roles?.includes('teacher') || user?.role === 'teacher'

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
      <div className="w-8 h-8 bg-red-800 rounded flex items-center justify-center mb-8">
        <div className="w-4 h-4 bg-white rounded-sm"></div>
      </div>

      <nav className="flex flex-col space-y-6">
        <button 
          onClick={() => router.push("/dashboard")}
          className={`flex flex-col items-center space-y-1 ${isActive("/dashboard") ? "text-red-800" : "text-gray-400 hover:text-red-800"}`}
        >
          <Home className="w-5 h-5" />
          <span className="text-xs">Dashboard</span>
        </button>

        <button 
          onClick={() => router.push("/content-manager")}
          className={`flex flex-col items-center space-y-1 ${isActive("/content-manager") ? "text-red-800" : "text-gray-400 hover:text-red-800"}`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-xs">Content</span>
        </button>

        {(isAdmin || isTeacher) && (
          <button 
            onClick={() => router.push("/students")}
            className={`flex flex-col items-center space-y-1 ${isActive("/students") || pathname?.startsWith("/students/") ? "text-red-800" : "text-gray-400 hover:text-red-800"}`}
          >
            <Users className="w-5 h-5" />
            <span className="text-xs">Students</span>
          </button>
        )}

        <div className="flex flex-col items-center space-y-1 text-gray-400">
          <Settings className="w-5 h-5" />
          <span className="text-xs">Settings</span>
        </div>

        <button
          onClick={() => router.push("/profile")}
          className={`flex flex-col items-center space-y-1 ${isActive("/profile") ? "text-red-800" : "text-gray-400 hover:text-red-800"}`}
        >
          <User className="w-5 h-5" />
          <span className="text-xs">Profile</span>
        </button>
      </nav>

      <div className="mt-auto">
        <button
          onClick={handleLogout}
          className="flex flex-col items-center space-y-1 text-gray-400 hover:text-red-800 transition-colors duration-200 p-2 rounded-lg hover:bg-red-50"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-xs">Logout</span>
        </button>
      </div>
    </div>
  )
}
