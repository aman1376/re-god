"use client"

import { useEffect, useState } from "react"
import { BookOpen, Clock, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import AdminApiService, { type StudentAnalytics as StudentAnalyticsType } from "@/lib/api"

interface StudentAnalyticsProps {
  studentId: string
}

export function StudentAnalytics({ studentId }: StudentAnalyticsProps) {
  const [analytics, setAnalytics] = useState<StudentAnalyticsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true)
        const data = await AdminApiService.getStudentAnalytics(studentId)
        console.log('Student analytics:', data)
        setAnalytics(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics';
        console.log(errorMessage)
        setError(errorMessage);
      } finally {
        setIsLoading(false)
      }
    }

    if (studentId) {
      fetchAnalytics()
    }
  }, [studentId])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-800 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold text-red-600 mb-4">
            {error.includes('403') || error.includes('permission') ? 'Access Denied' : 'Error Loading Analytics'}
          </h2>
          <p className="text-gray-600 mb-4">
            {error.includes('403') || error.includes('permission') 
              ? 'You don\'t have permission to view this student\'s analytics.' 
              : error || 'Failed to load analytics'}
          </p>
        </div>
      </div>
    )
  }

  const maxHours = Math.max(...analytics.time_series.map(d => d.hours), 120)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Student Analytics</h1>
        <h2 className="text-xl font-medium text-gray-900">{analytics.student.name}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Time Spent Chart */}
          <Card className="bg-white">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Spent</h3>
              <div className="relative h-64">
                <div className="absolute inset-0 flex items-end justify-between px-4">
                  {analytics.time_series.map((data, index) => (
                    <div key={index} className="flex flex-col items-center flex-1">
                      <div className="w-full flex items-end justify-center px-1">
                        <div
                          className="rounded-t-lg transition-all duration-300 hover:opacity-80"
                          style={{
                            backgroundColor: '#8B0000',
                            height: `${(data.hours / maxHours) * 200}px`,
                            width: '100%',
                            maxWidth: '40px',
                            minHeight: '20px'
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 mt-2">{data.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Section */}
          <Card className="bg-white">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress</h3>
              <div className="space-y-4">
                {/* Courses */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">Courses</span>
                    <span className="text-sm text-gray-600">
                      {analytics.stats.finished_courses}/{analytics.stats.total_courses}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{
                        backgroundColor: '#8B0000',
                        width: `${analytics.stats.course_progress_percentage}%`
                      }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-500 mt-1">
                    {analytics.stats.course_progress_percentage}%
                  </div>
                </div>

                {/* Lessons */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">Lessons</span>
                    <span className="text-sm text-gray-600">
                      {analytics.stats.completed_lessons}/{analytics.stats.total_lessons}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{
                        backgroundColor: '#8B0000',
                        width: `${analytics.stats.lesson_progress_percentage}%`
                      }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-500 mt-1">
                    {analytics.stats.lesson_progress_percentage}%
                  </div>
                </div>

                {/* Quizzes */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">Quizzes</span>
                    <span className="text-sm text-gray-600">
                      {analytics.stats.completed_quizzes}/{Math.ceil(analytics.stats.total_courses * 3)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{
                        backgroundColor: '#8B0000',
                        width: `${analytics.stats.quiz_progress_percentage}%`
                      }}
                    />
                  </div>
                  <div className="text-right text-xs text-gray-500 mt-1">
                    {analytics.stats.quiz_progress_percentage}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stats Cards */}
        <div className="space-y-6">
          {/* Time Spent Card */}
          <Card className="bg-red-800 text-white">
            <CardContent className="p-6">
              <div className="flex justify-center mb-4">
                <div className="bg-white bg-opacity-20 p-4 rounded-lg">
                  <BookOpen className="w-8 h-8" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium mb-1">Time spent</div>
                <div className="text-3xl font-bold">{analytics.stats.time_spent_hours} hours</div>
              </div>
            </CardContent>
          </Card>

          {/* Average Time Card */}
          <Card className="bg-red-800 text-white">
            <CardContent className="p-6">
              <div className="flex justify-center mb-4">
                <div className="bg-white bg-opacity-20 p-4 rounded-lg">
                  <Clock className="w-8 h-8" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium mb-1">Average/day</div>
                <div className="text-3xl font-bold">{analytics.stats.avg_time_per_day_hours} hours</div>
              </div>
            </CardContent>
          </Card>

          {/* Finished Courses Card */}
          <Card className="bg-red-800 text-white">
            <CardContent className="p-6">
              <div className="flex justify-center mb-4">
                <div className="bg-white bg-opacity-20 p-4 rounded-lg">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium mb-1">Finished Courses</div>
                <div className="text-3xl font-bold">{analytics.stats.finished_courses}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

