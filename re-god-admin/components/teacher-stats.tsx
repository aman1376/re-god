"use client"

import { useEffect, useState } from "react"
import { BookOpen, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import AdminApiService from "@/lib/api"

export function TeacherStats() {
  const [stats, setStats] = useState<{my_courses: number, assigned_students: number} | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true)
        const data = await AdminApiService.getTeacherStats()
        console.log('Teacher stats:', data)
        setStats(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch teacher stats';
        console.log(errorMessage)
        setError(errorMessage);
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const statsConfig = stats ? [
    {
      title: "My Courses",
      value: stats.my_courses.toString(),
      icon: BookOpen,
      color: "bg-blue-600",
    },
    {
      title: "Assigned Students",
      value: stats.assigned_students.toString(),
      icon: Users,
      color: "bg-green-600",
    },
  ] : []

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>Failed to load teacher stats</p>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">My Teaching Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          {statsConfig.map((stat, index) => {
            const IconComponent = stat.icon
            return (
              <div key={index} className="flex items-center space-x-3">
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-sm text-gray-600">{stat.title}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}



