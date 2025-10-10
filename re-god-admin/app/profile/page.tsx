"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { UserProfile } from "@/components/user-profile"

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      router.push("/sign-in")
    }
  }, [user, router])

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800"></div>
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="flex-1 bg-gray-50">
        <UserProfile />
      </div>
    </AdminLayout>
  )
}
