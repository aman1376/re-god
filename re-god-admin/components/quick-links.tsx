import { Link, Database } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useRef, useState } from "react"
import AdminApiService from "@/lib/api"

export function QuickLinks() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [msg, setMsg] = useState<string>("")

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setMsg("Uploading...")
    try {
      const res = await AdminApiService.uploadLocal(f)
      setMsg(`Uploaded: ${res.path}`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
            <div className="w-12 h-12 bg-red-800 rounded-lg flex items-center justify-center">
              <Link className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Access Codes</h4>
              <div className="text-sm text-gray-600">Database Access</div>
              <div className="text-xs text-blue-600 mt-1">Login Shortcuts</div>
            </div>
          </div>

          <div className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
            <div className="w-12 h-12 bg-red-800 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Total Lessons</h4>
              <div className="text-sm text-gray-600">Track Progress</div>
              <div className="text-sm font-semibold text-gray-900 mt-1">150</div>
            </div>
          </div>

          {/* <div className="p-4 border border-gray-200 rounded-lg">
            <h4 className="font-semibold text-gray-900">Upload (Local)</h4>
            <input ref={fileRef} onChange={handleLocalUpload} type="file" className="block mt-2 text-sm" />
            {msg && <div className="text-xs text-gray-600 mt-1">{msg}</div>}
          </div> */}
        </div>
      </CardContent>
    </Card>
  )
}
