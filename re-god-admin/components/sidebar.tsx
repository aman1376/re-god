"use client"

import { Home, FileText, Settings, User, LogOut } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated")
    localStorage.removeItem("userEmail")
    router.push("/login")
  }

  const isActive = (path: string) => pathname === path

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

        <div className="flex flex-col items-center space-y-1 text-gray-400">
          <Settings className="w-5 h-5" />
          <span className="text-xs">Settings</span>
        </div>

        <div className="flex flex-col items-center space-y-1 text-gray-400">
          <User className="w-5 h-5" />
          <span className="text-xs">Profile</span>
        </div>
      </nav>

      <div className="mt-auto">
        <button
          onClick={handleLogout}
          className="flex flex-col items-center space-y-1 text-gray-400 hover:text-red-800"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
