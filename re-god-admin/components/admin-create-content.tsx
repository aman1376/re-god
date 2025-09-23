"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AdminApiService from "@/lib/api"

export function CreateCourseModal({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ title: "", description: "", category: "", difficulty: "", thumbnail_url: "" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const uploadThumb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const res = await AdminApiService.uploadLocal(f)
    setForm((s) => ({ ...s, thumbnail_url: res.path }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await AdminApiService.createCourse(form)
      setOpen(false)
      onCreated?.()
      setForm({ title: "", description: "", category: "", difficulty: "", thumbnail_url: "" })
      if (fileRef.current) fileRef.current.value = ""
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-red-800 hover:bg-red-900">New Course</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Course</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>Difficulty</Label>
              <Input value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Thumbnail (Local Upload)</Label>
            <input ref={fileRef} type="file" onChange={uploadThumb} />
            {form.thumbnail_url && <div className="text-xs text-gray-600 mt-1">{form.thumbnail_url}</div>}
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <Button type="submit" className="w-full bg-red-800 hover:bg-red-900" disabled={loading}>{loading ? "Creating..." : "Create Course"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CreateModuleModal({ courseId, onCreated }: { courseId: number, onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [chapters, setChapters] = useState<{ id: number; title: string }[]>([])
  const [form, setForm] = useState({
    title: "",
    description: "",
    order: 1,
    chapter_id: 0,
    key_verses: "",
    key_verses_ref: "",
    key_verses_json: null,
    lesson_study: "",
    lesson_study_ref: "",
    // response_prompt: "",
    music_selection: "",
    further_study: "",
    further_study_json: null,
    // personal_experiences: "",
    resources: "",
    resources_json: null,
    // artwork: "",
    header_image_url: "",
    media_url: "",
  })
  useEffect(() => {
    if (!open) return
    (async () => {
      try {
        const list = await AdminApiService.getChapters(courseId)
        setChapters(list)
      } catch {}
    })()
  }, [open, courseId])

  const uploadHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const res = await AdminApiService.uploadLocal(f)
    setForm((s) => ({ ...s, header_image_url: res.path }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await AdminApiService.createModule(courseId, form)
      setOpen(false)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-red-800 hover:bg-red-900">New Lesson</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Lesson</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Chapter</Label>
              <select className="block w-full border rounded h-10 px-2" value={form.chapter_id} onChange={(e) => setForm({ ...form, chapter_id: Number(e.target.value) })}>
                <option value={0}>No Chapter</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <QuickCreateChapter courseId={courseId} onCreated={async () => { const list = await AdminApiService.getChapters(courseId); setChapters(list); }} />
            </div>
          </div>
          <div>
            <Label>Key Verses (Plain Text)</Label>
            <textarea 
              className="w-full border rounded p-2 text-sm" 
              rows={3} 
              value={form.key_verses} 
              onChange={(e) => setForm({ ...form, key_verses: e.target.value })}
              placeholder="Enter multiple verses, one per line or comma-separated"
            />
            <Label className="block mt-2">Key Verses (Structured JSON)</Label>
            <textarea 
              className="w-full border rounded p-2 text-sm" 
              rows={4} 
              value={JSON.stringify(form.key_verses_json || {}, null, 2)} 
              onChange={(e) => {
                try { 
                  setForm({ ...form, key_verses_json: JSON.parse(e.target.value) }) 
                } catch {
                  // Invalid JSON, keep current value
                }
              }}
              placeholder='{"verses": [{"reference": "John 3:16", "text": "For God so loved..."}, {"reference": "Romans 8:28", "text": "And we know..."}]}'
            />
          </div>
          <div>
            <Label>Lesson Study</Label>
            <textarea 
              className="w-full border rounded p-2 text-sm" 
              rows={3} 
              value={form.lesson_study} 
              onChange={(e) => setForm({ ...form, lesson_study: e.target.value })}
              placeholder="Enter lesson study content"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Key Verses Reference</Label>
              <Input value={form.key_verses_ref} onChange={(e) => setForm({ ...form, key_verses_ref: e.target.value })} placeholder="e.g., Acts 5:30-31 NASB" />
            </div>
            <div>
              <Label>Lesson Study Reference</Label>
              <Input value={form.lesson_study_ref} onChange={(e) => setForm({ ...form, lesson_study_ref: e.target.value })} placeholder="e.g., Romans 2:4 NASB" />
            </div>
          </div>
          {/* <div>
            <Label>Response Prompt</Label>
            <Input value={form.response_prompt} onChange={(e) => setForm({ ...form, response_prompt: e.target.value })} />
          </div> */}
          <div>
            <Label>Music Selection (Song & Artist)</Label>
            <Input 
              value={form.music_selection} 
              onChange={(e) => setForm({ ...form, music_selection: e.target.value })}
              placeholder="e.g., Things We Leave Behind by Michael Card"
            />
            {form.music_selection && (
              <div className="mt-2 p-3 bg-gray-50 rounded border">
                <Label className="text-sm text-gray-600">Preview:</Label>
                <div className="text-sm mt-1">
                  <div className="text-gray-700">
                    <span className="font-medium">"{form.music_selection}"</span>
                    {form.music_selection.includes(' by ') && (
                      <div className="text-xs text-gray-500 mt-1">
                        ♥ {form.music_selection.split(' by ')[1]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <Label>Further Study</Label>
            <Input value={form.further_study} onChange={(e) => setForm({ ...form, further_study: e.target.value })} />
          </div>
          <div>
            <Label>Resources</Label>
            <Input value={form.resources} onChange={(e) => setForm({ ...form, resources: e.target.value })} />
          </div>
          <div>
            <Label>Media URL (Link to Audio/Video)</Label>
            <Input 
              value={form.media_url} 
              onChange={(e) => setForm({ ...form, media_url: e.target.value })}
              placeholder="https://youtube.com/watch?v=... or https://spotify.com/track/..."
            />
            {form.media_url && (
              <div className="text-xs mt-1">
                {form.media_url.startsWith('http') ? (
                  <span className="text-green-600">✓ Valid URL detected</span>
                ) : (
                  <span className="text-red-600">⚠ Please enter a valid URL</span>
                )}
              </div>
            )}
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <Button type="submit" className="w-full bg-red-800 hover:bg-red-900" disabled={loading}>{loading ? "Creating..." : "Create Lesson"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QuickCreateChapter({ courseId, onCreated }: { courseId: number; onCreated?: () => void }) {
  const [title, setTitle] = useState("")
  const [order, setOrder] = useState(1)
  const [cover, setCover] = useState("")
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [saving, setSaving] = useState(false)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const res = await AdminApiService.uploadLocal(f)
    setCover(res.path)
  }

  const create = async () => {
    setSaving(true)
    try {
      await AdminApiService.createChapter(courseId, { title, order, cover_image_url: cover })
      setTitle(""); setOrder(1); setCover("")
      if (fileRef.current) fileRef.current.value = ""
      onCreated?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full">
      <Label>Quick Create Chapter</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        <div>
          <input ref={fileRef} type="file" onChange={upload} className="text-xs" />
          {cover && <div className="text-xs truncate">{cover}</div>}
        </div>
      </div>
      <Button type="button" className="mt-2 w-full sm:w-auto bg-red-800 hover:bg-red-900" onClick={create} disabled={saving || !title}>Add Chapter</Button>
    </div>
  )
}


