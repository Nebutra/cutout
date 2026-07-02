/**
 * KeyField (spec §7) — a write-only secret input.
 *
 * The key is **write-only from the UI's perspective**: this field never renders
 * a stored secret. The `value` it holds is only the *replacement* the user is
 * typing right now; the parent clears it the instant it is handed to `setKey()`.
 * When a key already exists in the keychain (`hasKey`), the placeholder invites
 * a replacement ("已配置，输入以替换") instead of implying the field is empty.
 *
 * A local show/hide toggle reveals only what the user is currently typing (never
 * a persisted secret) so they can verify a paste — it does not read anything back.
 */
import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface KeyFieldProps {
  readonly id: string
  readonly value: string
  readonly onChange: (next: string) => void
  /** Whether a secret already exists in the keychain for this provider. */
  readonly hasKey: boolean
  readonly disabled?: boolean
}

export function KeyField({ id, value, onChange, hasKey, disabled }: KeyFieldProps) {
  const [reveal, setReveal] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        <KeyRound className="size-3.5 text-muted-foreground" />
        API Key
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={reveal ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasKey ? '已配置，输入以替换' : '输入 API Key'}
          className="pr-8 font-mono"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          disabled={disabled}
          aria-label={reveal ? '隐藏' : '显示'}
          onClick={() => setReveal((v) => !v)}
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
        >
          {reveal ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <p className={cn('text-xs text-muted-foreground')}>
        密钥仅写入系统钥匙串，永不回传或显示。
      </p>
    </div>
  )
}
