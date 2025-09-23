import { MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import AdminApiService, { type MyCodeResponse } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"

export function AdminProfile() {
  const [myCode, setMyCode] = useState<string>("")

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
  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-gray-300 rounded-full overflow-hidden">
            <img src="/placeholder.svg?height=64&width=64" alt="Admin User" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Admin User</h2>
            <div className="flex items-center text-gray-600 mt-1">
              <MapPin className="w-4 h-4 mr-1" />
              <span>Main Church</span>
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
