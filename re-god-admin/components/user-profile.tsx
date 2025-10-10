"use client"

import { useEffect, useState } from "react"
import { Edit3, Save, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AdminApiService from "@/lib/api"
import type { UserProfile, UserProfileUpdate } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { AvatarUpload } from "@/components/avatar-upload"
import { useUser } from "@clerk/nextjs"

export function UserProfile() {
  const { user } = useAuth()
  const { user: clerkUser } = useUser()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editingSection, setEditingSection] = useState<'personal' | 'church' | null>(null)
  const [formData, setFormData] = useState<UserProfileUpdate>({})
  const [error, setError] = useState("")
  const [uploadSuccess, setUploadSuccess] = useState("")

  useEffect(() => {
    fetchProfile()
  }, [])


  const fetchProfile = async () => {
    try {
      setIsLoading(true)
      const data = await AdminApiService.getUserProfile()
      setProfile(data)
      setFormData({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        age: data.age || undefined,
        church_admin_name: data.church_admin_name || '',
        home_church: data.home_church || '',
        country: data.country || '',
        city: data.city || '',
        postal_code: data.postal_code || '',
        church_admin_cell_phone: data.church_admin_cell_phone || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setError("")
      const updatedProfile = await AdminApiService.updateUserProfile(formData)
      setProfile(updatedProfile)
      setIsEditing(false)
      setEditingSection(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditingSection(null)
    setError("")
    // Reset form data to original values
    if (profile) {
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        age: profile.age || undefined,
        church_admin_name: profile.church_admin_name || '',
        home_church: profile.home_church || '',
        country: profile.country || '',
        city: profile.city || '',
        postal_code: profile.postal_code || '',
        church_admin_cell_phone: profile.church_admin_cell_phone || ''
      })
    }
  }

  const handleInputChange = (field: keyof UserProfileUpdate, value: string | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleEditSection = (section: 'personal' | 'church') => {
    setEditingSection(section)
    setIsEditing(true)
  }

  const handleUploadSuccess = async () => {
    // Refresh profile data
    await fetchProfile()
    
    // Show success message
    setUploadSuccess('Avatar updated successfully!')
    
    // Clear success message after 3 seconds
    setTimeout(() => setUploadSuccess(""), 3000)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="p-6">
        <div className="text-center py-8 text-red-500">
          <p>{error}</p>
          <Button onClick={fetchProfile} className="mt-4">Retry</Button>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const fullName = profile.name
  const userRole = profile.roles?.[0] || 'User'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800" style={{ color: '#8B0000' }}>My Profile</h1>
      </div>

      {/* Profile Header Card */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center space-x-6">
            <AvatarUpload
              profile={profile}
              fullName={fullName}
              onUploadSuccess={handleUploadSuccess}
              onError={setError}
            />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{fullName}</h2>
              <p className="text-lg text-gray-600 capitalize">{userRole}</p>
              <p className="text-sm text-gray-500">{profile.city && profile.country ? `${profile.city}, ${profile.country}` : 'Location not set'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information Card */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900" style={{ color: '#8B0000' }}>Personal Information</h3>
            {!isEditing || editingSection !== 'personal' ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleEditSection('personal')}
                className="text-red-800 border-red-800 hover:bg-red-50"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  onClick={handleSave}
                  className="bg-red-800 hover:bg-red-900"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCancel}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email Address</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.email}</p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="phone"
                  value={formData.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.phone || '-'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="age">Age</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="age"
                  type="number"
                  value={formData.age || ''}
                  onChange={(e) => handleInputChange('age', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.age || '-'}</p>
              )}
            </div>

            <div>
              <Label>User Role</Label>
              <p className="mt-1 text-gray-900 capitalize">{userRole}</p>
            </div>

            <div>
              <Label htmlFor="church_admin_name">Church Admin Name</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="church_admin_name"
                  value={formData.church_admin_name || ''}
                  onChange={(e) => handleInputChange('church_admin_name', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.church_admin_name || '-'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="home_church">Home Church</Label>
              {isEditing && editingSection === 'personal' ? (
                <Input
                  id="home_church"
                  value={formData.home_church || ''}
                  onChange={(e) => handleInputChange('home_church', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.home_church || '-'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Church Address Card */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900" style={{ color: '#8B0000' }}>Church Address</h3>
            {!isEditing || editingSection !== 'church' ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleEditSection('church')}
                className="text-red-800 border-red-800 hover:bg-red-50"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  onClick={handleSave}
                  className="bg-red-800 hover:bg-red-900"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCancel}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="country">Country</Label>
              {isEditing && editingSection === 'church' ? (
                <Input
                  id="country"
                  value={formData.country || ''}
                  onChange={(e) => handleInputChange('country', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.country || '-'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              {isEditing && editingSection === 'church' ? (
                <Input
                  id="city"
                  value={formData.city || ''}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.city || '-'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="postal_code">Postal Code</Label>
              {isEditing && editingSection === 'church' ? (
                <Input
                  id="postal_code"
                  value={formData.postal_code || ''}
                  onChange={(e) => handleInputChange('postal_code', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.postal_code || '-'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="church_admin_cell_phone">Church Admin Cell Phone</Label>
              {isEditing && editingSection === 'church' ? (
                <Input
                  id="church_admin_cell_phone"
                  value={formData.church_admin_cell_phone || ''}
                  onChange={(e) => handleInputChange('church_admin_cell_phone', e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.church_admin_cell_phone || '-'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="text-center text-red-500">
          <p>{error}</p>
        </div>
      )}
      
      {uploadSuccess && (
        <div className="text-center text-green-600">
          <p>{uploadSuccess}</p>
        </div>
      )}
    </div>
  )
}
