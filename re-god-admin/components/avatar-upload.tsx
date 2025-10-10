"use client"

import { useState } from "react"
import { Camera } from "lucide-react"
import { useUser } from "@clerk/nextjs"

interface AvatarUploadProps {
  profile: {
    id: string
    avatar_url?: string
  }
  fullName: string
  onUploadSuccess: () => void
  onError: (error: string) => void
}

export function AvatarUpload({ profile, fullName, onUploadSuccess, onError }: AvatarUploadProps) {
  const { user: clerkUser } = useUser()
  const [isUploading, setIsUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsUploading(true)
      onError("")

      // Validate file type
      if (!file.type.startsWith('image/')) {
        onError('Please select a valid image file')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
        onError(`Image size must be less than 5MB (current: ${fileSizeMB}MB)`)
        return
      }

      // Create preview URL
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)

      // Import API service dynamically
      const { default: AdminApiService } = await import('@/lib/api')

      // Upload avatar using backend API
      const result = await AdminApiService.uploadAvatar(file)
      
      // Clear preview and trigger success
      setImagePreview(null)
      onUploadSuccess()
      
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to upload image')
      setImagePreview(null)
    } finally {
      setIsUploading(false)
    }
  }

  // Determine which avatar to use: preview > profile avatar > clerk avatar > placeholder
  const avatarUrl = imagePreview || profile.avatar_url || clerkUser?.imageUrl
  
  return (
    <div className="relative">
      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt={imagePreview ? "Preview" : "Profile"} 
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initials if image fails to load
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `
                <div class="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                  <span class="text-white text-2xl font-bold">${fullName.charAt(0).toUpperCase()}</span>
                </div>
              `
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <span className="text-white text-2xl font-bold">
              {fullName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="absolute bottom-0 right-0">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="avatar-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="avatar-upload"
          className={`
            flex items-center justify-center
            w-8 h-8
            bg-white rounded-full 
            shadow-lg
            cursor-pointer 
            transition-all duration-200
            ${isUploading 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:bg-blue-50 hover:shadow-xl hover:scale-110 active:scale-95'
            }
          `}
          title={isUploading ? 'Uploading...' : 'Click to upload avatar'}
        >
          {isUploading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
          ) : (
            <Camera className="w-4 h-4 text-gray-600" />
          )}
        </label>
      </div>
    </div>
  )
}