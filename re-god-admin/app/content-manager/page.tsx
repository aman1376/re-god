"use client"

import { useEffect, useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import AdminApiService from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ContentManagerModal } from "@/components/admin-create-content"
import { 
  ChevronLeft, 
  ChevronRight, 
  Edit, 
  Trash2, 
  Plus, 
  BookOpen, 
  HelpCircle, 
  X 
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface Course {
  id: number
  title: string
  thumbnail_url?: string
}

interface Chapter {
  id: number
  title: string
  order: number
  cover_image_url?: string
  course_id: number
}

interface QuizQuestion {
  id: string
  type: 'multiple_choice' | 'true_false' | 'short_answer'
  question: string
  options?: string[]
  correctAnswer?: string
  explanation?: string
}

interface QuizData {
  questions: QuizQuestion[]
}

interface Module {
  id: number
  title: string
  order: number
  chapter_id?: number
  course_id: number
  key_verses?: string
  lesson_study?: string
  music_selection?: string
  further_study?: string
  resources?: string
  header_image_url?: string
  media_url?: string
  quiz?: QuizData
}

export default function ContentManagerPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)
  const [editingModule, setEditingModule] = useState<Module | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [moduleQuizResponses, setModuleQuizResponses] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetchCourses()
  }, [])

  useEffect(() => {
    if (selectedCourseId) {
      fetchChapters(selectedCourseId)
      fetchModules(selectedCourseId)
    }
  }, [selectedCourseId])

  const fetchCourses = async () => {
    try {
      const list = await AdminApiService.getCourses()
      setCourses(list)
      if (list.length > 0 && !selectedCourseId) {
        setSelectedCourseId(list[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch courses", error)
    }
  }

  const fetchChapters = async (courseId: number) => {
    try {
      const list = await AdminApiService.getChapters(courseId)
      setChapters(list)
    } catch (error) {
      console.error("Failed to fetch chapters", error)
    }
  }

  const fetchModules = async (courseId: number) => {
    try {
      const list = await AdminApiService.getModules(courseId)
      setModules(list)
      
      // Check quiz responses for each module
      const responseChecks: Record<number, boolean> = {}
      for (const module of list) {
        try {
          const response = await AdminApiService.getModuleQuizResponses(courseId, module.id)
          responseChecks[module.id] = response.has_responses
        } catch (error) {
          console.error(`Failed to check quiz responses for module ${module.id}:`, error)
          responseChecks[module.id] = false
        }
      }
      setModuleQuizResponses(responseChecks)
    } catch (error) {
      console.error("Failed to fetch modules", error)
    }
  }

  const handleChapterClick = (chapter: Chapter) => {
    setSelectedChapter(chapter)
    setEditingModule(null)
  }

  const handleBackToChapters = () => {
    setSelectedChapter(null)
    setEditingModule(null)
  }

  const handleEditModule = (module: Module) => {
    // Check if module has quiz responses - if so, warn about quiz editing restrictions
    if (module.quiz && module.quiz.questions.length > 0 && moduleQuizResponses[module.id]) {
      const confirmed = confirm(
        "This lesson has quiz responses from students. Quiz questions cannot be edited once students have answered them. " +
        "You can still edit other content. Do you want to continue?"
      )
      if (!confirmed) return
    }
    setEditingModule(module)
  }

  const handleSaveModule = async () => {
    if (!editingModule || !selectedCourseId) return

    try {
      // Create a copy of the module data for update
      const updateData = { ...editingModule }
      
      // If module has quiz responses, remove quiz data from update to prevent changes
      if (moduleQuizResponses[editingModule.id] && editingModule.quiz) {
        console.warn("Module has quiz responses - quiz data will not be updated")
        delete updateData.quiz
      }
      
      await AdminApiService.updateModule(selectedCourseId, editingModule.id, updateData)
      await fetchModules(selectedCourseId)
      setEditingModule(null)
      alert("Lesson updated successfully!")
    } catch (error) {
      console.error("Failed to update module", error)
      alert("Failed to update lesson. Please try again.")
    }
  }

  const handleDeleteModule = async (moduleId: number) => {
    if (!selectedCourseId || !confirm("Are you sure you want to delete this lesson? This action cannot be undone.")) return

    try {
      await AdminApiService.deleteModule(selectedCourseId, moduleId)
      await fetchModules(selectedCourseId)
      alert("Lesson deleted successfully!")
    } catch (error) {
      console.error("Failed to delete module", error)
      alert("Failed to delete lesson. Please try again.")
    }
  }

  const selectedCourse = courses.find(c => c.id === selectedCourseId)
  const chapterModules = selectedChapter 
    ? modules.filter(m => m.chapter_id === selectedChapter.id).sort((a, b) => a.order - b.order)
    : []

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % courses.length)
    setSelectedCourseId(courses[(currentSlide + 1) % courses.length]?.id)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + courses.length) % courses.length)
    setSelectedCourseId(courses[(currentSlide - 1 + courses.length) % courses.length]?.id)
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header with Course Carousel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Content Manager</h1>
            <ContentManagerModal
              mode="create"
              contentType="course"
              onSuccess={fetchCourses}
              triggerButton={<Button className="bg-red-800 hover:bg-red-900"><Plus className="w-4 h-4 mr-2" />New Course</Button>}
            />
          </div>

          {/* Course Carousel */}
          {courses.length > 0 && (
            <div className="relative bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Courses</h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevSlide}
                    disabled={courses.length <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextSlide}
                    disabled={courses.length <= 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedCourseId}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-6"
                >
                  <div className="w-48 h-32 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                    {selectedCourse?.thumbnail_url ? (
                      <img
                        src={AdminApiService.getUploadUrl(selectedCourse.thumbnail_url)}
                        alt={selectedCourse.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900">{selectedCourse?.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{chapters.length} chapters • {modules.length} lessons</p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Course indicator dots */}
              {courses.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {courses.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentSlide(index)
                        setSelectedCourseId(courses[index].id)
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentSlide ? 'bg-red-800 w-8' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chapters or Lessons View */}
        <AnimatePresence mode="wait">
          {!selectedChapter ? (
            // Chapters Grid
            <motion.div
              key="chapters"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">Chapters</h2>
                {selectedCourseId && (
                  <ContentManagerModal
                    mode="create"
                    contentType="module"
                    courseId={selectedCourseId}
                    onSuccess={() => fetchModules(selectedCourseId)}
                    triggerButton={<Button className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />New Lesson</Button>}
                  />
                )}
              </div>

              {chapters.length === 0 ? (
                <Card className="p-12 text-center">
                  <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No chapters yet. Create lessons to get started.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {chapters.sort((a, b) => a.order - b.order).map((chapter, index) => (
                    <motion.div
                      key={chapter.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                    >
                      <Card
                        className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden group"
                        onClick={() => handleChapterClick(chapter)}
                      >
                        <div className="relative h-40 bg-gradient-to-br from-red-800 to-red-900 overflow-hidden">
                          {chapter.cover_image_url ? (
                            <img
                              src={AdminApiService.getUploadUrl(chapter.cover_image_url)}
                              alt={chapter.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <BookOpen className="w-16 h-16 text-white opacity-50" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-3 left-3">
                            <span className="bg-white text-red-800 text-xs font-bold px-2 py-1 rounded">
                              Chapter {chapter.order}
                            </span>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 mb-2">{chapter.title}</h3>
                          <p className="text-sm text-gray-500">
                            {modules.filter(m => m.chapter_id === chapter.id).length} lessons
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            // Lessons List
            <motion.div
              key="lessons"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={handleBackToChapters}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Chapters
                </Button>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-800">{selectedChapter.title}</h2>
                  <p className="text-sm text-gray-500">{chapterModules.length} lessons</p>
                </div>
              </div>

              {chapterModules.length === 0 ? (
                <Card className="p-12 text-center">
                  <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No lessons in this chapter yet.</p>
                </Card>
              ) : (
                <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
                  {chapterModules.map((module, index) => (
                    <motion.div
                      key={module.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      {editingModule?.id === module.id ? (
                        // Edit Form
                        <Card className="p-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold">Edit Lesson</h3>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingModule(null)}
                              >
                                Cancel
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label>Title</Label>
                                <Input
                                  value={editingModule.title}
                                  onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label>Order</Label>
                                <Input
                                  type="number"
                                  value={editingModule.order}
                                  onChange={(e) => setEditingModule({ ...editingModule, order: Number(e.target.value) })}
                                />
                              </div>
                            </div>

                            <div>
                              <Label>Key Verses</Label>
                              <Textarea
                                value={editingModule.key_verses || ''}
                                onChange={(e) => setEditingModule({ ...editingModule, key_verses: e.target.value })}
                                rows={3}
                              />
                            </div>

                            <div>
                              <Label>Lesson Study</Label>
                              <Textarea
                                value={editingModule.lesson_study || ''}
                                onChange={(e) => setEditingModule({ ...editingModule, lesson_study: e.target.value })}
                                rows={5}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label>Music Selection</Label>
                                <Input
                                  value={editingModule.music_selection || ''}
                                  onChange={(e) => setEditingModule({ ...editingModule, music_selection: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label>Media URL</Label>
                                <Input
                                  value={editingModule.media_url || ''}
                                  onChange={(e) => setEditingModule({ ...editingModule, media_url: e.target.value })}
                                />
                              </div>
                            </div>

                            <div>
                              <Label>Further Study</Label>
                              <Textarea
                                value={editingModule.further_study || ''}
                                onChange={(e) => setEditingModule({ ...editingModule, further_study: e.target.value })}
                                rows={3}
                              />
                            </div>

                            <div>
                              <Label>Resources</Label>
                              <Textarea
                                value={editingModule.resources || ''}
                                onChange={(e) => setEditingModule({ ...editingModule, resources: e.target.value })}
                                rows={3}
                              />
                            </div>

                            {/* Quiz Section */}
                            <div className="border-t pt-6">
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-semibold text-gray-900">Quiz Questions</h4>
                                {moduleQuizResponses[editingModule.id] && editingModule.quiz && editingModule.quiz.questions.length > 0 ? (
                                  <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                                    ⚠️ Quiz has student responses - editing disabled
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const newQuestion: QuizQuestion = {
                                        id: `q${Date.now()}`,
                                        type: 'multiple_choice',
                                        question: '',
                                        options: ['', '', '', ''],
                                        correctAnswer: '0'
                                      }
                                      setEditingModule({
                                        ...editingModule,
                                        quiz: {
                                          questions: [...(editingModule.quiz?.questions || []), newQuestion]
                                        }
                                      })
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Question
                                  </Button>
                                )}
                              </div>

                              <div className="space-y-4">
                                {(editingModule.quiz?.questions || []).map((question, qIndex) => (
                                  <QuizQuestionEditor
                                    key={question.id}
                                    question={question}
                                    index={qIndex}
                                    disabled={moduleQuizResponses[editingModule.id] && editingModule.quiz && editingModule.quiz.questions.length > 0}
                                    onUpdate={(updates) => {
                                      if (moduleQuizResponses[editingModule.id] && editingModule.quiz && editingModule.quiz.questions.length > 0) {
                                        alert("Cannot edit quiz questions that have student responses")
                                        return
                                      }
                                      const updatedQuestions = editingModule.quiz?.questions.map((q, i) =>
                                        i === qIndex ? { ...q, ...updates } : q
                                      ) || []
                                      setEditingModule({
                                        ...editingModule,
                                        quiz: { questions: updatedQuestions }
                                      })
                                    }}
                                    onUpdateOptions={(optionIndex, value) => {
                                      if (moduleQuizResponses[editingModule.id] && editingModule.quiz && editingModule.quiz.questions.length > 0) {
                                        alert("Cannot edit quiz questions that have student responses")
                                        return
                                      }
                                      const updatedOptions = question.options?.map((opt, i) =>
                                        i === optionIndex ? value : opt
                                      ) || []
                                      const updatedQuestions = editingModule.quiz?.questions.map((q, i) =>
                                        i === qIndex ? { ...q, options: updatedOptions } : q
                                      ) || []
                                      setEditingModule({
                                        ...editingModule,
                                        quiz: { questions: updatedQuestions }
                                      })
                                    }}
                                    onRemove={() => {
                                      if (moduleQuizResponses[editingModule.id] && editingModule.quiz && editingModule.quiz.questions.length > 0) {
                                        alert("Cannot delete quiz questions that have student responses")
                                        return
                                      }
                                      const updatedQuestions = editingModule.quiz?.questions.filter((_, i) => i !== qIndex) || []
                                      setEditingModule({
                                        ...editingModule,
                                        quiz: { questions: updatedQuestions }
                                      })
                                    }}
                                  />
                                ))}

                                {(!editingModule.quiz?.questions || editingModule.quiz.questions.length === 0) && (
                                  <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                                    <HelpCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                    <p>No quiz questions yet.</p>
                                    <p className="text-sm">Add questions to create an interactive quiz for this lesson.</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex gap-2 pt-4">
                              <Button
                                onClick={handleSaveModule}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Save Changes
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setEditingModule(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ) : (
                        // Lesson Card
                        <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="flex flex-col md:flex-row">
                            {/* Left: Image */}
                            <div className="w-full md:w-64 h-48 md:h-auto bg-gradient-to-br from-blue-600 to-blue-800 flex-shrink-0">
                              {module.header_image_url ? (
                                <img
                                  src={AdminApiService.getUploadUrl(module.header_image_url)}
                                  alt={module.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BookOpen className="w-16 h-16 text-white opacity-50" />
                                </div>
                              )}
                            </div>

                            {/* Right: Content */}
                            <div className="flex-1 p-6">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                                      Lesson {module.order}
                                    </span>
                                  </div>
                                  <h3 className="text-xl font-bold text-gray-900">{module.title}</h3>
                                </div>
                              </div>

                              <div className="space-y-3 text-sm text-gray-600">
                                {module.key_verses && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Key Verses:</span>
                                    <p className="mt-1 line-clamp-2">{module.key_verses}</p>
                                  </div>
                                )}

                                {module.lesson_study && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Lesson Study:</span>
                                    <p className="mt-1 line-clamp-3">{module.lesson_study}</p>
                                  </div>
                                )}

                                {module.music_selection && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Music:</span>
                                    <p className="mt-1">{module.music_selection}</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 mt-4 pt-4 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditModule(module)}
                                  className="flex items-center gap-2"
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteModule(module.id)}
                                  className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </AdminLayout>
  )
}

// Quiz Question Editor Component
function QuizQuestionEditor({
  question,
  index,
  disabled = false,
  onUpdate,
  onUpdateOptions,
  onRemove
}: {
  question: QuizQuestion
  index: number
  disabled?: boolean
  onUpdate: (updates: Partial<QuizQuestion>) => void
  onUpdateOptions: (optionIndex: number, value: string) => void
  onRemove: () => void
}) {
  const handleTypeChange = (newType: QuizQuestion['type']) => {
    let updates: Partial<QuizQuestion> = { type: newType }

    if (newType === 'true_false') {
      updates.options = ['True', 'False']
      updates.correctAnswer = '0'
    } else if (newType === 'multiple_choice') {
      updates.options = ['', '', '', '']
      updates.correctAnswer = '0'
    } else if (newType === 'short_answer') {
      updates.options = undefined
      updates.correctAnswer = undefined
    }

    onUpdate(updates)
  }

  const addOption = () => {
    if (question.options) {
      onUpdateOptions(question.options.length, '')
    }
  }

  const removeOption = (optionIndex: number) => {
    if (question.options && question.options.length > 2) {
      const newOptions = question.options.filter((_, i) => i !== optionIndex)
      onUpdate({ options: newOptions })
      if (question.correctAnswer === optionIndex.toString()) {
        onUpdate({ correctAnswer: '0' })
      } else if (question.correctAnswer && parseInt(question.correctAnswer) > optionIndex) {
        onUpdate({ correctAnswer: (parseInt(question.correctAnswer) - 1).toString() })
      }
    }
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h5 className="font-semibold text-gray-900">Question {index + 1}</h5>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {/* Question Type */}
          <div>
            <Label>Question Type</Label>
            <select
              value={question.type}
              onChange={(e) => handleTypeChange(e.target.value as QuizQuestion['type'])}
              disabled={disabled}
              className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True/False</option>
              <option value="short_answer">Short Answer</option>
            </select>
          </div>

          {/* Question Text */}
          <div>
            <Label>Question</Label>
            <Textarea
              value={question.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              placeholder="Enter your question here..."
              rows={2}
              disabled={disabled}
              className={disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
            />
          </div>

          {/* Options (for multiple choice and true/false) */}
          {question.type !== 'short_answer' && question.options && (
            <div>
              <Label>Answer Options</Label>
              <div className="space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={question.correctAnswer === optionIndex.toString()}
                      onChange={() => onUpdate({ correctAnswer: optionIndex.toString() })}
                      disabled={disabled}
                      className={`text-blue-600 ${disabled ? 'cursor-not-allowed' : ''}`}
                    />
                    <Input
                      value={option}
                      onChange={(e) => onUpdateOptions(optionIndex, e.target.value)}
                      placeholder={`Option ${optionIndex + 1}`}
                      className={`flex-1 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      disabled={disabled}
                    />
                    {question.options && question.options.length > 2 && !disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(optionIndex)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {question.type === 'multiple_choice' && !disabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    className="mt-2"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Explanation */}
          <div>
            <Label>Explanation (Optional)</Label>
            <Textarea
              value={question.explanation || ''}
              onChange={(e) => onUpdate({ explanation: e.target.value })}
              placeholder="Explain why this is the correct answer..."
              rows={2}
              disabled={disabled}
              className={disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
            />
          </div>

          {/* Question Type Indicators */}
          <div className="text-xs text-gray-500">
            {question.type === 'multiple_choice' && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="font-medium text-blue-700">Multiple Choice</span>
                </div>
                <p className="text-blue-600 mt-1">Students will select one correct answer from multiple options.</p>
              </div>
            )}

            {question.type === 'true_false' && (
              <div className="p-2 bg-green-50 border border-green-200 rounded">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-green-700">True/False</span>
                </div>
                <p className="text-green-600 mt-1">Students will determine if the statement is true or false.</p>
              </div>
            )}

            {question.type === 'short_answer' && (
              <div className="p-2 bg-purple-50 border border-purple-200 rounded">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="font-medium text-purple-700">Short Answer</span>
                </div>
                <p className="text-purple-600 mt-1">Students will provide their own thoughtful responses based on their understanding.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
