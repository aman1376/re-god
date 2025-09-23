"use client"

import { useEffect, useState } from "react"
import { Users, BookOpen, Monitor } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import AdminApiService, { type AdminStats } from "@/lib/api"

export function AdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true)
        const data = await AdminApiService.getAdminStats()
        console.log(data)
        setStats(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch stats';
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
      title: "Teachers Count",
      value: stats.total_teachers.toString(),
      icon: BookOpen,
      color: "bg-red-800",
    },
    {
      title: "Total Users",
      value: stats.total_users.toString(),
      icon: Users,
      color: "bg-red-800",
    },
    // {
    //   title: "Students",
    //   value: stats.total_students.toString(),
    //   icon: Monitor,
    //   color: "bg-red-800",
    // },
  ] : []

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Statistics</h3>
        
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading statistics...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-500">{error}</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {statsConfig.map((stat, index) => (
              <div key={index} className="text-center">
                <div className={`${stat.color} rounded-lg p-4 mb-2`}>
                  <stat.icon className="w-6 h-6 text-white mx-auto" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.title}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
