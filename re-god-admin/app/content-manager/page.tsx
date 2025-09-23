"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import AdminApiService from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ContentManagerPage() {
  const [courses, setCourses] = useState<any[]>([])
  const [chapters, setChapters] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'details' | 'media' | 'quiz'>('details')
  const [courseId, setCourseId] = useState<number | null>(null)
  const [chapterId, setChapterId] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const c = await AdminApiService.getCourses()
        setCourses(c)
        if (c.length > 0) setCourseId(c[0].id)
      } catch {}
    })()
  }, [])

  useEffect(() => {
    if (!courseId) return
    (async () => {
      const ch = await AdminApiService.getChapters(courseId)
      setChapters(ch)
      if (ch.length > 0) setChapterId(ch[0].id)
      const mods = await AdminApiService.getModules(courseId)
      setModules(mods)
    })()
  }, [courseId])

  const course = courses.find(c => c.id === courseId)
  const chapter = chapters.find(c => c.id === chapterId)
  const [courseForm, setCourseForm] = useState<any>({})
  const [chapterForm, setChapterForm] = useState<any>({})
  const [lessonForm, setLessonForm] = useState<any>({})

  useEffect(() => { if (course) setCourseForm(course) }, [courseId, courses.length])
  useEffect(() => { if (chapter) setChapterForm(chapter) }, [chapterId, chapters.length])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Content Manager</h1>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
        <div className="w-full sm:w-auto">
          <Label>Course</Label>
          <select className="border rounded h-10 px-2 w-full sm:w-auto" value={courseId ?? 0} onChange={(e) => setCourseId(Number(e.target.value))}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <Label>Chapter</Label>
          <select className="border rounded h-10 px-2 w-full sm:w-auto" value={chapterId ?? 0} onChange={(e) => setChapterId(Number(e.target.value))}>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant={activeTab==='details' ? undefined : 'outline'} onClick={() => setActiveTab('details')}>Details</Button>
        <Button variant={activeTab==='media' ? undefined : 'outline'} onClick={() => setActiveTab('media')}>Media</Button>
        <Button variant={activeTab==='quiz' ? undefined : 'outline'} onClick={() => setActiveTab('quiz')}>Quiz</Button>
      </div>

      {activeTab === 'details' && (
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Details</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Course</h3>
              <Label>Title</Label>
              <Input value={courseForm?.title || ''} onChange={(e)=>setCourseForm({...courseForm, title: e.target.value})} />
              <Label className="mt-2 block">Description</Label>
              <Input value={courseForm?.description || ''} onChange={(e)=>setCourseForm({...courseForm, description: e.target.value})} />
              <div className="mt-2">
                <Button onClick={async()=>{await AdminApiService.updateCourse(courseId!, courseForm); const list = await AdminApiService.getCourses(); setCourses(list)}}>Save Course</Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Chapter</h3>
              <Label>Title</Label>
              <Input value={chapterForm?.title || ''} onChange={(e)=>setChapterForm({...chapterForm, title: e.target.value})} />
              <Label className="mt-2 block">Order</Label>
              <Input type="number" value={chapterForm?.order || 0} onChange={(e)=>setChapterForm({...chapterForm, order: Number(e.target.value)})} />
              <div className="mt-2">
                <Button onClick={async()=>{if(!chapterId) return; await AdminApiService.updateChapter(courseId!, chapterId, chapterForm); const ch = await AdminApiService.getChapters(courseId!); setChapters(ch)}}>Save Chapter</Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Lessons in Chapter</h3>
              <ul className="space-y-1 text-sm">
                {modules.filter((m:any)=>m.chapter_id===chapterId).map((m:any)=> (
                  <li key={m.id} className="flex justify-between items-center border rounded px-2 py-1">
                    <span>#{m.order} {m.title}</span>
                    <Button size="sm" variant="outline" onClick={()=>setLessonForm(m)}>Edit</Button>
                  </li>
                ))}
              </ul>
              {lessonForm?.id && (
                <div className="mt-3 border rounded p-2 space-y-2">
                  <Label>Lesson Title</Label>
                  <Input value={lessonForm.title} onChange={(e)=>setLessonForm({...lessonForm, title: e.target.value})} />
                  <Label className="block">Order</Label>
                  <Input type="number" value={lessonForm.order} onChange={(e)=>setLessonForm({...lessonForm, order: Number(e.target.value)})} />
                  <div>
                    <Label>Key Verses (Plain Text)</Label>
                    <textarea 
                      className="w-full border rounded p-2 text-sm" 
                      rows={3} 
                      value={lessonForm.key_verses || ''} 
                      onChange={(e)=>setLessonForm({...lessonForm, key_verses: e.target.value})}
                      placeholder="Enter multiple verses, one per line or comma-separated"
                    />
                    <Label className="block mt-2">Key Verses (Structured JSON)</Label>
                    <textarea 
                      className="w-full border rounded p-2 text-sm" 
                      rows={4} 
                      value={JSON.stringify(lessonForm.key_verses_json || {}, null, 2)} 
                      onChange={(e)=>{
                        try { 
                          setLessonForm({...lessonForm, key_verses_json: JSON.parse(e.target.value)}) 
                        } catch {
                          // Invalid JSON, keep current value
                        }
                      }}
                      placeholder='{"verses": [{"reference": "John 3:16", "text": "For God so loved..."}, {"reference": "Romans 8:28", "text": "And we know..."}]}'
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Key Verses Reference</Label>
                      <Input value={lessonForm.key_verses_ref || ''} onChange={(e)=>setLessonForm({...lessonForm, key_verses_ref: e.target.value})} />
                    </div>
                    <div>
                      <Label>Lesson Study Reference</Label>
                      <Input value={lessonForm.lesson_study_ref || ''} onChange={(e)=>setLessonForm({...lessonForm, lesson_study_ref: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <Label>Lesson Study</Label>
                    <textarea 
                      className="w-full border rounded p-2 text-sm" 
                      rows={3} 
                      value={lessonForm.lesson_study || ''} 
                      onChange={(e)=>setLessonForm({...lessonForm, lesson_study: e.target.value})}
                      placeholder="Enter lesson study content"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label>Response Prompt</Label>
                      <Input value={lessonForm.response_prompt || ''} onChange={(e)=>setLessonForm({...lessonForm, response_prompt: e.target.value})} />
                    </div>
                    <div>
                      <Label>Music Selection (Song & Artist)</Label>
                      <Input 
                        value={lessonForm.music_selection || ''} 
                        onChange={(e)=>setLessonForm({...lessonForm, music_selection: e.target.value})}
                        placeholder="e.g., Things We Leave Behind by Michael Card"
                      />
                      {lessonForm.music_selection && (
                        <div className="mt-2 p-2 bg-gray-50 rounded border">
                          <div className="text-xs">
                            <div className="text-gray-700">
                              <span className="font-medium">"{lessonForm.music_selection}"</span>
                              {lessonForm.music_selection.includes(' by ') && (
                                <div className="text-xs text-gray-500 mt-1">
                                  ♥ {lessonForm.music_selection.split(' by ')[1]}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Further Study (Plain)</Label>
                    <Input value={lessonForm.further_study || ''} onChange={(e)=>setLessonForm({...lessonForm, further_study: e.target.value})} />
                    <Label className="block mt-2">Further Study (Structured JSON)</Label>
                    <textarea className="w-full border rounded p-2 text-sm" rows={4} value={JSON.stringify(lessonForm.further_study_json || {}, null, 2)} onChange={(e)=>{
                      try { setLessonForm({...lessonForm, further_study_json: JSON.parse(e.target.value)}) } catch {}
                    }} />
                  </div>
                  <div>
                    <Label>Resources (Plain)</Label>
                    <Input value={lessonForm.resources || ''} onChange={(e)=>setLessonForm({...lessonForm, resources: e.target.value})} />
                    <Label className="block mt-2">Resources (Structured JSON)</Label>
                    <textarea className="w-full border rounded p-2 text-sm" rows={4} value={JSON.stringify(lessonForm.resources_json || {}, null, 2)} onChange={(e)=>{
                      try { setLessonForm({...lessonForm, resources_json: JSON.parse(e.target.value)}) } catch {}
                    }} />
                  </div>
                  <div>
                    <Label>Media URL (Link to Audio/Video)</Label>
                    <Input 
                      value={lessonForm.media_url || ''} 
                      onChange={(e)=>setLessonForm({...lessonForm, media_url: e.target.value})}
                      placeholder="https://youtube.com/watch?v=... or https://spotify.com/track/..."
                    />
                    {lessonForm.media_url && (
                      <div className="text-xs mt-1">
                        {lessonForm.media_url.startsWith('http') ? (
                          <span className="text-green-600">✓ Valid URL</span>
                        ) : (
                          <span className="text-red-600">⚠ Please enter a valid URL</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <Button onClick={async()=>{await AdminApiService.updateModule(courseId!, lessonForm.id, lessonForm); const mods = await AdminApiService.getModules(courseId!); setModules(mods)}}>Save Lesson</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {activeTab === 'media' && (
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Media (Local and S3)</h2>
          <S3Uploader label="Upload to S3" onUploaded={(url)=>setChapterForm({...chapterForm, cover_image_url: url})} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <Label>Chapter Cover URL</Label>
              <Input value={chapterForm?.cover_image_url || ''} onChange={(e)=>setChapterForm({...chapterForm, cover_image_url: e.target.value})} />
            </div>
            {/* Lessons do not have images; media controls left for chapter-only */}
          </div>
        </CardContent>
      </Card>
      )}

      {activeTab === 'quiz' && (
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Quiz (Chapter)</h2>
          <QuizEditor
            initial={chapters.find((c) => c.id === chapterId)?.quiz}
            onSave={async (quiz) => {
              if (!courseId || !chapterId) return
              await AdminApiService.updateChapter(courseId, chapterId, { title: chapters.find(c=>c.id===chapterId)?.title, order: chapters.find(c=>c.id===chapterId)?.order, cover_image_url: chapters.find(c=>c.id===chapterId)?.cover_image_url, quiz } as any)
              const ch = await AdminApiService.getChapters(courseId)
              setChapters(ch)
            }}
          />
        </CardContent>
      </Card>
      )}
    </div>
  )
}

function QuizEditor({ initial, onSave }: { initial?: any; onSave: (quiz: any) => Promise<void> }) {
  const [questions, setQuestions] = useState<any[]>(initial?.questions || [])

  const addQ = () => {
    setQuestions((q) => [...q, { prompt: '', options: ['', ''], correctIndex: 0 }])
  }
  const updateQ = (idx: number, update: any) => {
    setQuestions((q) => q.map((item, i) => (i === idx ? { ...item, ...update } : item)))
  }
  const addOption = (idx: number) => {
    setQuestions((q) => q.map((item, i) => (i === idx ? { ...item, options: [...item.options, ''] } : item)))
  }
  const save = async () => {
    await onSave({ questions })
  }

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={idx} className="border rounded p-3 space-y-2">
          <div>
            <Label>Question</Label>
            <Input value={q.prompt} onChange={(e) => updateQ(idx, { prompt: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Options</Label>
            {q.options.map((opt: string, oi: number) => (
              <div key={oi} className="flex gap-2 items-center">
                <input type="radio" name={`correct-${idx}`} checked={q.correctIndex === oi} onChange={() => updateQ(idx, { correctIndex: oi })} />
                <Input value={opt} onChange={(e) => updateQ(idx, { options: q.options.map((o: string, i: number) => (i===oi ? e.target.value : o)) })} />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => addOption(idx)}>Add Option</Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" onClick={addQ}>Add Question</Button>
        <Button type="button" className="bg-red-800 hover:bg-red-900" onClick={save}>Save Quiz</Button>
      </div>
    </div>
  )
}

function S3Uploader({ label, onUploaded }: { label: string; onUploaded: (url: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    try {
      const presign = await AdminApiService.presignS3Upload(file.name, file.type || 'application/octet-stream')
      await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      onUploaded(presign.public_url)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label>{label}</Label>
        <input type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
      </div>
      <Button type="button" onClick={upload} disabled={!file || busy}>{busy ? 'Uploading...' : 'Upload'}</Button>
    </div>
  )
}


