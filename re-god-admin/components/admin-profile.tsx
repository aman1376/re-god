import { MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import AdminApiService, { type MyCodeResponse, type UserProfile } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@clerk/nextjs"

export function AdminProfile() {
  const { user } = useAuth()
  const { user: clerkUser } = useUser()
  const [myCode, setMyCode] = useState<string>("")
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const data = await AdminApiService.getMyTeacherCode()
        setMyCode(data.teacher_code)
      } catch (_) {
        // ignore, not critical for rendering
      }
    })()
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const profileData = await AdminApiService.getUserProfile()
        setProfile(profileData)
      } catch (_) {
        // ignore, fallback to context user
      }
    })()
  }, [])
  
  // Determine which avatar to use: profile avatar > clerk avatar > placeholder
  const avatarUrl = profile?.avatar_url || clerkUser?.imageUrl || user?.avatar_url || "/placeholder.svg?height=64&width=64"
  const userName = profile?.name || user?.name || clerkUser?.fullName || "User"
  const userCity = profile?.city || "Main Church"
  
  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-gray-300 rounded-full overflow-hidden">
            <img 
              src={avatarUrl} 
              alt={userName} 
              className="w-full h-full object-cover" 
              onError={(e) => {
                // Fallback to placeholder if image fails to load
                e.currentTarget.src = "/placeholder.svg?height=64&width=64"
              }}
            />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {userName}
            </h2>
            <div className="flex items-center text-gray-600 mt-1">
              <MapPin className="w-4 h-4 mr-1" />
              <span>{userCity}</span>
            </div>
            {myCode && (
              <div className="mt-2 text-sm text-gray-700">
                Teacher Code: <span className="font-mono font-semibold">{myCode}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
