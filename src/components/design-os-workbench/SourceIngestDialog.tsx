import { useState } from 'react'
import { FileText, FileUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { EverythingInput } from '@/ingestion/everything-inbox'
import type { NativeRepositoryScanResult } from '@/platform/native'

export interface SourceIngestDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onPrepare: (input: EverythingInput, repository?: RepositoryIngestMetadata) => Promise<void> | void
  readonly onPrepareBatch?: (inputs: readonly EverythingInput[]) => Promise<void> | void
  readonly nativeRepositoryAvailable?: boolean
  readonly onSelectRepository?: () => Promise<NativeRepositoryScanResult>
}

export interface RepositoryIngestMetadata { readonly scan: NativeRepositoryScanResult; readonly role: 'reference'; readonly license: 'proprietary' }

const license = { kind: 'proprietary', holder: 'Project owner' } as const

export function SourceIngestDialog({ open, onOpenChange, onPrepare, onPrepareBatch }: SourceIngestDialogProps) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const submit = () => {
    const cleanContent = content.trim()
    if (!cleanContent) return
    const isUrl = /^https?:\/\/\S+$/i.test(cleanContent)
    const input: EverythingInput = isUrl
      ? { type: 'url-descriptor', url: cleanContent, role: 'reference', license }
      : { type: 'inline-text', sourceKind: 'idea', title: cleanContent.slice(0, 80), text: cleanContent, role: 'requirement', license, promptProvenance: 'Source kind is intentionally left for Agent interpretation.' }
    void onPrepare(input)
    onOpenChange(false)
  }

  const previewFiles = async () => {
    const inputs: EverythingInput[] = []
    for (const file of files) {
      const sourceKind = fileKind(file)
      if (sourceKind === 'video') continue
      inputs.push({ type: 'local-file', path: file.name, bytes: new Uint8Array(await file.arrayBuffer()), sourceKind, mediaType: file.type || undefined, title: file.name, role: 'reference', license })
    }
    if (inputs.length) await (onPrepareBatch ? onPrepareBatch(inputs) : Promise.all(inputs.map((input) => onPrepare(input))))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add sources</DialogTitle>
          <DialogDescription>Add files, paste text, or enter a URL. The Agent will interpret how each source supports your outcome.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Paste text or URL" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste notes, requirements, code, or a URL…" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline" size="sm">
              <label><FileUp /> Add files<input aria-label="Add local files" className="sr-only" multiple type="file" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /></label>
            </Button>
          </div>
          <Button type="button" size="sm" disabled={!content.trim()} onClick={submit}>Add</Button>
        </div>
        {files.length ? <div className="space-y-2" aria-label="Source queue">
          {files.map((file, index) => { const kind = fileKind(file); const blocked = kind === 'video'; return <div key={`${file.name}:${index}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"><FileText className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{kind} · {blocked ? 'Adapter required' : 'Ready to preview'}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, item) => item !== index))}><X /></Button></div> })}
          <Button type="button" size="sm" onClick={() => void previewFiles()} disabled={files.every((file) => fileKind(file) === 'video')}>Add {files.filter((file) => fileKind(file) !== 'video').length} sources</Button>
          {files.some((file) => fileKind(file) === 'video') ? <p className="text-xs text-muted-foreground">Videos stay queued as adapter-required; this host does not process or upload them.</p> : null}
        </div> : null}
      </DialogContent>
    </Dialog>
  )
}

function fileKind(file: File): Extract<EverythingInput, { type: 'local-file' }>['sourceKind'] {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('image/')) return file.name.toLowerCase().includes('screenshot') ? 'screenshot' : 'photo'
  if (/\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|html)$/i.test(file.name)) return 'code'
  return 'document'
}
