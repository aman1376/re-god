"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Check, ArrowLeft, ArrowRight, BookOpen, FileText, Film, HelpCircle, X } from "lucide-react"
import AdminApiService from "@/lib/api"

// Quiz interfaces
interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer?: string; // For backward compatibility and single answer questions
  correctAnswers?: string[]; // For multiple correct answers
}

interface QuizData {
  questions: QuizQuestion[];
}

type ContentType = "course" | "module"
type FormMode = "create" | "edit"

interface ContentManagerModalProps {
  mode: FormMode
  contentType: ContentType
  courseId?: number
  initialData?: any
  onSuccess?: () => void
  triggerButton: React.ReactNode
}

// Helper Components for Steps
const CourseStep1 = ({ form, setForm }: { form: any, setForm: (form: any) => void }) => (
  <Card>
    <CardHeader>
      <CardTitle>Course Details</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </div>
    </CardContent>
  </Card>
)

const CourseStep2 = ({ form, setForm, courseId }: { form: any, setForm: (form: any) => void, courseId?: number }) => {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const uploadThumb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    setUploading(true)
    try {
      // Use structured upload if we have a courseId (editing), otherwise use generic upload
      if (courseId) {
        const res = await AdminApiService.uploadCourseCover(f, courseId)
        setForm((s: any) => ({ ...s, thumbnail_url: res.cover_url }))
      } else {
        const res = await AdminApiService.uploadFile(f)
        setForm((s: any) => ({ ...s, thumbnail_url: res.path }))
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload thumbnail. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Course Thumbnail</CardTitle>
        <p className="text-sm text-gray-500 mt-1">Upload to Supabase (with local fallback)</p>
      </CardHeader>
      <CardContent>
        <Label>Upload Thumbnail</Label>
        <Input ref={fileRef} type="file" onChange={uploadThumb} accept="image/*" disabled={uploading} />
        {uploading && <p className="text-sm text-blue-600 mt-2">Uploading...</p>}
        {form.thumbnail_url && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">Preview:</p>
            <img src={AdminApiService.getUploadUrl(form.thumbnail_url)} alt="Thumbnail Preview" className="mt-2 rounded-lg max-h-48" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const CourseStep3 = ({ form, setForm, courseId }: { form: any, setForm: (form: any) => void, courseId?: number }) => {
  const [chapters, setChapters] = useState<{ id: number; title: string; order: number; cover_image_url?: string }[]>([])
  const [newChapter, setNewChapter] = useState({ title: "", order: 1, cover_image_url: "" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const addChapter = () => {
    if (!newChapter.title.trim()) return

    // Auto-increment order based on existing chapters
    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.order || 0)) : 0
    const nextOrder = maxOrder + 1

    const chapter = {
      id: Date.now(), // Temporary ID for UI
      title: newChapter.title,
      order: nextOrder,
      cover_image_url: newChapter.cover_image_url
    }

    setChapters(prev => [...prev, chapter])
    setNewChapter({ title: "", order: nextOrder + 1, cover_image_url: "" })
    if (fileRef.current) fileRef.current.value = ""

    // Update form with chapters
    setForm((f: any) => ({ ...f, chapters: [...chapters, chapter] }))
  }

  const removeChapter = (id: number) => {
    const updatedChapters = chapters.filter(c => c.id !== id)
    setChapters(updatedChapters)
    setForm((f: any) => ({ ...f, chapters: updatedChapters }))
  }

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !courseId) return
    
    try {
      // For chapter thumbnails during course creation, use generic upload
      // After chapter is created, we can use the structured upload
      const res = await AdminApiService.uploadFile(f)
      setNewChapter(prev => ({ ...prev, cover_image_url: res.path }))
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload cover image. Please try again.')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Course Chapters</CardTitle>
        <div className="text-sm text-gray-600">
          {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} added
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Chapters */}
        {chapters.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Added Chapters:</Label>
            {chapters.map((chapter, index) => (
              <div key={chapter.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-red-800 text-white rounded-full flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{chapter.title}</div>
                  <div className="text-sm text-gray-600">Order: {chapter.order}</div>
                </div>
                {chapter.cover_image_url && (
                  <img src={chapter.cover_image_url} alt={chapter.title} className="w-12 h-12 object-cover rounded" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeChapter(chapter.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Chapter */}
        <div className="border-t pt-4">
          <Label className="text-sm font-medium">Add New Chapter</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <div>
              <Input
                placeholder="Chapter Title"
                value={newChapter.title}
                onChange={(e) => setNewChapter(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <Input
                type="number"
                placeholder="Order"
                value={newChapter.order}
                onChange={(e) => setNewChapter(prev => ({ ...prev, order: Number(e.target.value) }))}
                min={1}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  ref={fileRef}
                  type="file"
                  onChange={uploadCover}
                  className="text-xs"
                  placeholder="Cover image"
                />
              </div>
              <Button
                type="button"
                onClick={addChapter}
                disabled={!newChapter.title.trim()}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {chapters.length === 0 && (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No chapters added yet.</p>
            <p className="text-sm">Add chapters to organize your course content.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ModuleStep1 = ({ form, setForm, courses, selectedCourseId, onCourseChange }: { 
  form: any, 
  setForm: (form: any) => void, 
  courses: { id: number; title: string }[],
  selectedCourseId?: number,
  onCourseChange: (courseId: number) => void
}) => (
  <Card>
    <CardHeader><CardTitle>Course Selection</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label>Select Course</Label>
        <Select 
          value={selectedCourseId?.toString()} 
          onValueChange={(value) => onCourseChange(Number(value))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a course for this lesson" />
          </SelectTrigger>
          <SelectContent>
            {courses.length > 0 ? (
              courses.map((course) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-red-600" />
                    <span>{course.title}</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-gray-500 text-center">
                No courses available. Create a course first.
              </div>
            )}
          </SelectContent>
        </Select>
        {courses.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">
            💡 Tip: You need to create a course first before adding lessons.
          </p>
        )}
      </div>
    </CardContent>
  </Card>
)

const ModuleStep2 = ({ 
  form, 
  setForm, 
  chapters, 
  selectedCourseId, 
  onChaptersUpdate 
}: { 
  form: any, 
  setForm: (form: any) => void, 
  chapters: any[],
  selectedCourseId?: number,
  onChaptersUpdate: (chapters: any[]) => void
}) => {
  const [showAddChapter, setShowAddChapter] = useState(false)
  const [newChapter, setNewChapter] = useState({ title: "", order: 1, cover_image_url: "" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const addChapter = async () => {
    if (!newChapter.title.trim() || !selectedCourseId) return

    try {
      // Auto-increment order based on existing chapters
      const maxOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.order || 0)) : 0
      const nextOrder = maxOrder + 1

      const chapterData = {
        title: newChapter.title,
        order: nextOrder,
        cover_image_url: newChapter.cover_image_url
      }

      const response = await AdminApiService.createChapter(selectedCourseId, chapterData)
      
      // Add the new chapter to the list
      const updatedChapters = [...chapters, response]
      onChaptersUpdate(updatedChapters)
      
      // Reset form with next order
      setNewChapter({ title: "", order: nextOrder + 1, cover_image_url: "" })
      setShowAddChapter(false)
      if (fileRef.current) fileRef.current.value = ""
      
      // Auto-select the new chapter
      setForm({ ...form, chapter_id: response.id })
    } catch (error) {
      console.error("Failed to create chapter:", error)
    }
  }

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !selectedCourseId) return
    
    try {
      // For new chapters, use generic upload initially
      // After creation, can be updated with structured upload
      const res = await AdminApiService.uploadFile(f)
      setNewChapter(prev => ({ ...prev, cover_image_url: res.path }))
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload cover image. Please try again.')
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <Label>Order</Label>
            <Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Chapter</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddChapter(!showAddChapter)}
              className="text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Chapter
            </Button>
          </div>
          
          <Select value={form.chapter_id?.toString()} onValueChange={(value) => setForm({ ...form, chapter_id: Number(value) })}>
            <SelectTrigger>
              <SelectValue placeholder={chapters.length === 0 ? "No chapters available" : "Select a chapter"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">No Chapter</SelectItem>
              {chapters.length > 0 ? (
                chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{c.title}</span>
                      {c.cover_image_url && (
                        <img src={c.cover_image_url} alt={c.title} className="w-4 h-4 object-cover rounded" />
                      )}
            </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-sm text-gray-500 text-center">
                  No chapters available for this course yet.
            </div>
              )}
            </SelectContent>
          </Select>

          {/* Add Chapter Form */}
          {showAddChapter && (
            <div className="mt-4 p-4 border rounded-lg bg-gray-50">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Add New Chapter</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddChapter(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
          </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
                    <Input
                      placeholder="Chapter Title"
                      value={newChapter.title}
                      onChange={(e) => setNewChapter(prev => ({ ...prev, title: e.target.value }))}
                    />
          </div>
          <div>
                    <Input
                      type="number"
                      placeholder="Order"
                      value={newChapter.order}
                      onChange={(e) => setNewChapter(prev => ({ ...prev, order: Number(e.target.value) }))}
                      min={1}
            />
          </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
            <Input 
                        ref={fileRef}
                        type="file"
                        onChange={uploadCover}
                        className="text-xs"
                        placeholder="Cover image"
                      />
                      </div>
                    <Button
                      type="button"
                      onClick={addChapter}
                      disabled={!newChapter.title.trim()}
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {chapters.length === 0 && !showAddChapter && (
            <p className="text-xs text-gray-500 mt-1">
              💡 Tip: Create chapters first in the course creation flow or add one here for better organization.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const ModuleStep3 = ({ form, setForm }: { form: any, setForm: (form: any) => void }) => (
  <Card>
    <CardHeader><CardTitle>Lesson Content</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div>
        <Label>Key Verses</Label>
        <Textarea value={form.key_verses} onChange={(e) => setForm({ ...form, key_verses: e.target.value })} placeholder="Enter verses, one per line." />
      </div>
      <div>
        <Label>Key Verses Reference</Label>
        <Input value={form.key_verses_ref} onChange={(e) => setForm({ ...form, key_verses_ref: e.target.value })} placeholder="e.g., John 3:16, Romans 8:28" />
      </div>
      <div>
        <Label>Lesson Study</Label>
        <Textarea value={form.lesson_study} onChange={(e) => setForm({ ...form, lesson_study: e.target.value })} rows={5} placeholder="Main lesson content." />
      </div>
      <div>
        <Label>Lesson Study Reference</Label>
        <Input value={form.lesson_study_ref} onChange={(e) => setForm({ ...form, lesson_study_ref: e.target.value })} placeholder="e.g., Genesis 1:1-31, Matthew 5:1-12" />
      </div>
      <div>
        <Label>Further Study</Label>
        <Textarea value={form.further_study} onChange={(e) => setForm({ ...form, further_study: e.target.value })} placeholder="Additional study material." />
      </div>
    </CardContent>
  </Card>
)

const ModuleStep4 = ({ form, setForm, courseId, moduleId }: { form: any, setForm: (form: any) => void, courseId?: number, moduleId?: number }) => {
  const headerImageRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const uploadHeaderImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    setUploading(true)
    try {
      // Use structured upload if we have all IDs, otherwise use generic upload
      if (courseId && form.chapter_id && moduleId) {
        const res = await AdminApiService.uploadLessonImage(f, courseId, form.chapter_id, moduleId)
        setForm((s: any) => ({ ...s, header_image_url: res.image_url }))
      } else {
        const res = await AdminApiService.uploadFile(f)
        setForm((s: any) => ({ ...s, header_image_url: res.path }))
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload header image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media & Attachments</CardTitle>
        <p className="text-sm text-gray-500 mt-1">Upload to Supabase (with local fallback)</p>
      </CardHeader>
      <CardContent className="space-y-4">
            <div>
          <Label>Header Image</Label>
          <Input ref={headerImageRef} type="file" onChange={uploadHeaderImage} accept="image/*" disabled={uploading} />
          {uploading && <p className="text-sm text-blue-600 mt-2">Uploading...</p>}
          {form.header_image_url && (
            <div className="mt-2">
              <p className="text-sm text-gray-600">Preview:</p>
              <img src={AdminApiService.getUploadUrl(form.header_image_url)} alt="Header Image Preview" className="mt-2 rounded-lg max-h-48" />
            </div>
          )}
            </div>
          <div>
        <Label>Media URL (Audio/Video)</Label>
        <Input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
          </div>
              <div>
        <Label>Music Selection</Label>
        <Input value={form.music_selection} onChange={(e) => setForm({ ...form, music_selection: e.target.value })} placeholder="Song Title by Artist" />
          </div>
        <div>
        <Label>Resources</Label>
        <Textarea value={form.resources} onChange={(e) => setForm({ ...form, resources: e.target.value })} placeholder="Links to articles, books, etc." />
      </div>
    </CardContent>
  </Card>
  )
}

const QuizQuestionCard = ({
  question, 
  index, 
  onUpdate, 
  onUpdateOptions, 
  onRemove 
}: {
  question: QuizQuestion;
  index: number;
  onUpdate: (updates: Partial<QuizQuestion>) => void;
  onUpdateOptions: (optionIndex: number, value: string) => void;
  onRemove: () => void;
}) => {
  const handleTypeChange = (newType: QuizQuestion['type']) => {
    let updates: Partial<QuizQuestion> = { type: newType }
    
    if (newType === 'true_false') {
      updates.options = ['True', 'False']
      updates.correctAnswer = '0'
      updates.correctAnswers = undefined // Clear multiple answers
    } else if (newType === 'multiple_choice') {
      updates.options = ['', '', '', '']
      updates.correctAnswer = undefined // Clear single answer
      updates.correctAnswers = [] // Initialize empty array for multiple answers
    } else if (newType === 'short_answer') {
      updates.options = undefined
      updates.correctAnswer = undefined
      updates.correctAnswers = undefined
    }
    
    onUpdate(updates)
  }

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Question {index + 1}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Question Type</Label>
          <Select value={question.type} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
              <SelectItem value="true_false">True/False</SelectItem>
              <SelectItem value="short_answer">Short Answer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Question</Label>
          <Textarea
            value={question.question}
            onChange={(e) => onUpdate({ question: e.target.value })}
            placeholder="Enter your question here..."
            rows={2}
          />
        </div>

        {(question.type === 'multiple_choice' || question.type === 'true_false') && question.options && (
          <div>
            <Label>Answer Options</Label>
            {question.type === 'multiple_choice' && (
              <p className="text-sm text-gray-600 mb-2">Check all correct answers:</p>
            )}
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => {
                const optionId = optionIndex.toString();
                const isCorrect = question.type === 'multiple_choice' 
                  ? (question.correctAnswers || []).includes(optionId)
                  : question.correctAnswer === optionId;
                
                const handleCorrectChange = () => {
                  if (question.type === 'multiple_choice') {
                    const currentCorrect = question.correctAnswers || [];
                    const newCorrect = isCorrect 
                      ? currentCorrect.filter(id => id !== optionId)
                      : [...currentCorrect, optionId];
                    onUpdate({ correctAnswers: newCorrect });
                  } else {
                    // For true/false, only one answer can be correct
                    onUpdate({ correctAnswer: optionId });
                  }
                };

                return (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                        name={question.type === 'multiple_choice' ? `correct-${question.id}-${optionIndex}` : `correct-${question.id}`}
                        checked={isCorrect}
                        onChange={handleCorrectChange}
                        className={`w-4 h-4 ${question.type === 'multiple_choice' ? 'text-green-600' : 'text-green-600'}`}
                      />
                      <Input
                        value={option}
                        onChange={(e) => onUpdateOptions(optionIndex, e.target.value)}
                        placeholder={`Option ${optionIndex + 1}`}
                        className={isCorrect ? 'border-green-500 bg-green-50' : ''}
                      />
                    </div>
                    {isCorrect && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {question.type === 'multiple_choice' 
                ? 'Check all correct answers (multiple selections allowed)'
                : 'Select the correct answer by clicking the radio button next to it'
              }
            </p>
          </div>
        )}

        {question.type === 'short_answer' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-sm text-blue-700 font-medium">Reflection Question</p>
            </div>
            <p className="text-xs text-blue-600 mt-1">
              Students will provide their own thoughtful responses based on their understanding and reflection.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ModuleStep5 = ({ quizData, setQuizData }: { quizData: QuizData, setQuizData: (data: QuizData) => void }) => {
  const addQuizQuestion = () => {
    const newQuestion: QuizQuestion = {
      id: `q${Date.now()}`,
      type: 'multiple_choice',
      question: '',
      options: ['', '', '', ''],
      correctAnswer: undefined,
      correctAnswers: []
    }
    setQuizData({
      ...quizData,
      questions: [...quizData.questions, newQuestion]
    })
  }

  const removeQuizQuestion = (questionId: string) => {
    setQuizData({
      ...quizData,
      questions: quizData.questions.filter((q: QuizQuestion) => q.id !== questionId)
    })
  }

  const updateQuizQuestion = (questionId: string, updates: Partial<QuizQuestion>) => {
    setQuizData({
      ...quizData,
      questions: quizData.questions.map((q: QuizQuestion) =>
        q.id === questionId ? { ...q, ...updates } : q
      )
    })
  }

  const updateQuizOptions = (questionId: string, optionIndex: number, value: string) => {
    setQuizData({
      ...quizData,
      questions: quizData.questions.map((q: QuizQuestion) => {
        if (q.id === questionId && q.options) {
          const newOptions = [...q.options]
          newOptions[optionIndex] = value
          return { ...q, options: newOptions }
        }
        return q
      })
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Quiz Builder</CardTitle>
        <Button type="button" onClick={addQuizQuestion} size="sm"><Plus className="w-4 h-4 mr-2" />Add Question</Button>
      </CardHeader>
      <CardContent>
        {quizData.questions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
            <p>No quiz questions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {quizData.questions.map((q, i) => (
              <QuizQuestionCard
                key={q.id}
                question={q}
                index={i}
                onUpdate={(updates) => updateQuizQuestion(q.id, updates)}
                onUpdateOptions={(optIndex, val) => updateQuizOptions(q.id, optIndex, val)}
                onRemove={() => removeQuizQuestion(q.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ContentManagerModal({
  mode,
  contentType,
  courseId,
  initialData,
  onSuccess,
  triggerButton,
}: ContentManagerModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Form states
  const [courseForm, setCourseForm] = useState({
    title: "",
    thumbnail_url: "",
    chapters: [] as { id: number; title: string; order: number; cover_image_url?: string }[]
  })

  const [moduleForm, setModuleForm] = useState({
    title: "",
    order: 1,
    chapter_id: 0,
    key_verses: "",
    key_verses_ref: "",
    lesson_study: "",
    lesson_study_ref: "",
    music_selection: "",
    further_study: "",
    resources: "",
    header_image_url: "",
    media_url: "",
  })

  const [quizData, setQuizData] = useState<QuizData>({ questions: [] })
  const [chapters, setChapters] = useState<{ id: number; title: string }[]>([])
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>(courseId)
  const [existingModules, setExistingModules] = useState<any[]>([])

  // Load initial data and chapters
  useEffect(() => {
    if (contentType === 'module' && open) {
      // Load courses for module creation
      AdminApiService.getCourses().then(courseList => {
        setCourses(courseList.map((c: any) => ({ id: c.id, title: c.title })))
        if (courseId && !selectedCourseId) {
          setSelectedCourseId(courseId)
        }
      }).catch(() => setCourses([]))
    }
    
    if (contentType === 'module' && selectedCourseId && open) {
      AdminApiService.getChapters(selectedCourseId).then(setChapters).catch(() => setChapters([]))
      // Load existing modules to determine next order
      AdminApiService.getModules(selectedCourseId).then(modules => {
        setExistingModules(modules)
        // Auto-increment order for new modules
        const maxOrder = modules.length > 0 ? Math.max(...modules.map((m: any) => m.order || 0)) : 0
        setModuleForm(prev => ({ ...prev, order: maxOrder + 1 }))
      }).catch(() => setExistingModules([]))
    }
    
    if (initialData) {
      if (contentType === 'course') {
        setCourseForm({ ...initialData, chapters: initialData.chapters || [] })
      } else if (contentType === 'module') {
        setModuleForm(initialData)
        if (initialData.quiz) setQuizData(initialData.quiz)
      }
    }
  }, [initialData, contentType, open, courseId, selectedCourseId])

  const handleCourseChange = (newCourseId: number) => {
    setSelectedCourseId(newCourseId)
    setChapters([]) // Clear chapters when course changes
    setExistingModules([]) // Clear modules when course changes
    // Load chapters for the new course
    AdminApiService.getChapters(newCourseId).then(setChapters).catch(() => setChapters([]))
    // Load existing modules to determine next order
    AdminApiService.getModules(newCourseId).then(modules => {
      setExistingModules(modules)
      // Auto-increment order for new modules
      const maxOrder = modules.length > 0 ? Math.max(...modules.map((m: any) => m.order || 0)) : 0
      setModuleForm(prev => ({ ...prev, order: maxOrder + 1 }))
    }).catch(() => setExistingModules([]))
  }

  const title = `${mode === "create" ? "Create" : "Edit"} ${contentType === "course" ? "Course" : "Lesson"}`
  const totalSteps = contentType === "course" ? 3 : 5

  const nextStep = () => {
    // Validation for module step 1 (course selection)
    if (contentType === "module" && step === 1 && !selectedCourseId) {
      setError("Please select a course before proceeding.")
      return
    }
    setError("") // Clear any previous errors
    setStep((prev) => Math.min(prev + 1, totalSteps))
  }
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1))

  const handleSubmit = async () => {
    setLoading(true)
    setError("")
    try {
      if (contentType === 'course') {
        if (mode === 'create') {
          // First create the course
          console.log('Creating course with payload:', {
            title: courseForm.title,
            thumbnail_url: courseForm.thumbnail_url
          })
          const courseResponse = await AdminApiService.createCourse({
            title: courseForm.title,
            thumbnail_url: courseForm.thumbnail_url
          })

          // Then create chapters if any exist
          if (courseForm.chapters && courseForm.chapters.length > 0) {
            for (const chapter of courseForm.chapters) {
              await AdminApiService.createChapter(courseResponse.id, {
                title: chapter.title,
                order: chapter.order,
                cover_image_url: chapter.cover_image_url
              })
            }
          }
        } else {
          await AdminApiService.updateCourse(initialData.id, courseForm)
        }
      } else if (contentType === 'module' && selectedCourseId) {
        const payload = { ...moduleForm, quiz: quizData.questions.length > 0 ? quizData : null }
        if (mode === 'create') {
          await AdminApiService.createModule(selectedCourseId, payload)
        } else {
          await AdminApiService.updateModule(selectedCourseId, initialData.id, payload)
        }
      }
      onSuccess?.()
      setOpen(false)
    } catch (err) {
      console.error('Error in handleSubmit:', err)
      let errorMessage = "An error occurred."
      
      // Enhanced error handling with better debugging
      if (err instanceof Error) {
        console.log('Error is instance of Error:', {
          message: err.message,
          detail: (err as any).detail,
          error: (err as any).error
        })
        errorMessage = err.message
      } else if (typeof err === 'object' && err !== null) {
        console.log('Error is object:', err)
        // Handle API error responses
        if ('error' in err && typeof err.error === 'object' && err.error !== null) {
          if ('message' in err.error) {
            errorMessage = err.error.message as string
          } else if ('detail' in err.error) {
            errorMessage = err.error.detail as string
          }
        } else if ('detail' in err) {
          errorMessage = err.detail as string
        } else if ('message' in err) {
          errorMessage = err.message as string
        } else {
          // Fallback: try to stringify the error object
          try {
            errorMessage = JSON.stringify(err)
          } catch {
            errorMessage = String(err)
          }
        }
      } else if (typeof err === 'string') {
        errorMessage = err
      } else {
        errorMessage = String(err)
      }
      
      console.log('Final error message:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${step > i ? 'bg-red-800' : 'bg-gray-300'}`}>
                {i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className="w-16 h-1 bg-gray-300 mx-2">
                  <div className="h-1 bg-red-800" style={{ width: step > i + 1 ? '100%' : step === i + 1 ? '50%' : '0%' }}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex-grow overflow-y-auto p-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Course Steps */}
              {contentType === "course" && step === 1 && <CourseStep1 form={courseForm} setForm={setCourseForm} />}
              {contentType === "course" && step === 2 && <CourseStep2 form={courseForm} setForm={setCourseForm} courseId={initialData?.id} />}
              {contentType === "course" && step === 3 && <CourseStep3 form={courseForm} setForm={setCourseForm} courseId={courseId} />}

              {/* Module Steps */}
              {contentType === "module" && step === 1 && <ModuleStep1 form={moduleForm} setForm={setModuleForm} courses={courses} selectedCourseId={selectedCourseId} onCourseChange={handleCourseChange} />}
              {contentType === "module" && step === 2 && <ModuleStep2 form={moduleForm} setForm={setModuleForm} chapters={chapters} selectedCourseId={selectedCourseId} onChaptersUpdate={setChapters} />}
              {contentType === "module" && step === 3 && <ModuleStep3 form={moduleForm} setForm={setModuleForm} />}
              {contentType === "module" && step === 4 && <ModuleStep4 form={moduleForm} setForm={setModuleForm} courseId={selectedCourseId} moduleId={initialData?.id} />}
              {contentType === "module" && step === 5 && <ModuleStep5 quizData={quizData} setQuizData={setQuizData} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div>
            {step > 1 && (
              <Button onClick={prevStep} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
            )}
          </div>
          <div>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            {step < totalSteps && (
              <Button onClick={nextStep} className="bg-red-800 hover:bg-red-900">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {step === totalSteps && (
              <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700" disabled={loading}>
                {loading ? 'Saving...' : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {mode === 'create' ? 'Create' : 'Save Changes'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CreateCourseModal({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ title: "", description: "", category: "", difficulty: "", thumbnail_url: "" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <ContentManagerModal
      mode="create"
      contentType="course"
      onSuccess={onCreated}
      triggerButton={<Button className="bg-red-800 hover:bg-red-900">New Course</Button>}
    />
  )
}

export function CreateModuleModal({ courseId, onCreated }: { courseId: number, onCreated?: () => void }) {
  return (
    <ContentManagerModal
      mode="create"
      contentType="module"
      courseId={courseId}
      onSuccess={onCreated}
      triggerButton={<Button className="bg-red-800 hover:bg-red-900">New Lesson</Button>}
    />
  )
}



