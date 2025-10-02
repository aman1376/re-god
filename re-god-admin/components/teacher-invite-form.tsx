"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Copy, Check } from "lucide-react"
import AdminApiService from "@/lib/api"
import type { TeacherInviteResponse } from "@/lib/api"

interface TeacherInviteFormProps {
  onInviteSuccess?: (response: TeacherInviteResponse) => void;
}

export function TeacherInviteForm({ onInviteSuccess }: TeacherInviteFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<TeacherInviteResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    max_uses: 1,
    expires_in_days: 30,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await AdminApiService.inviteTeacher({
        ...formData,
        redirect_url: `${window.location.origin}/auth/teacher-signup`,
      })

      setSuccess(response)
      onInviteSuccess?.(response)
      
      // Reset form
      setFormData({
        name: "",
        email: "",
        max_uses: 1,
        expires_in_days: 30,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to invite teacher';
      setError(errorMessage);
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const resetForm = () => {
    setSuccess(null)
    setError("")
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex-1 text-sm bg-red-800 hover:bg-red-900">
          <Plus className="w-4 h-4 mr-2" />
          Invite Teacher
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite New Teacher</DialogTitle>
          <DialogDescription>
            Send an invitation to a teacher with a unique signup code
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">Teacher Invited Successfully!</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Name:</strong> {success.teacher_name}</p>
                <p><strong>Email:</strong> {success.teacher_email}</p>
                <p><strong>Teacher Code:</strong> {success.teacher_code}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Invitation Link</Label>
              <div className="flex gap-2">
                <Input
                  value={success.invitation_link}
                  readOnly
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(success.invitation_link)}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Teacher Code</Label>
              <div className="flex gap-2">
                <Input
                  value={success.teacher_code}
                  readOnly
                  className="flex-1 font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(success.teacher_code)}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Students can use this code during registration to access teacher content
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={resetForm} variant="outline" className="flex-1">
                Close
              </Button>
              <Button onClick={() => setIsOpen(false)} className="flex-1 bg-red-800 hover:bg-red-900">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Teacher Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter teacher's full name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="teacher@example.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max_uses">Max Uses</Label>
                <Input
                  id="max_uses"
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires_in_days">Expires (days)</Label>
                <Input
                  id="expires_in_days"
                  type="number"
                  min="1"
                  value={formData.expires_in_days}
                  onChange={(e) => setFormData({ ...formData, expires_in_days: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-red-800 hover:bg-red-900"
                disabled={isLoading}
              >
                {isLoading ? "Inviting..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}


