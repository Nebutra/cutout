import { Lock, Minus, Plus, Scissors, Sparkles } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { SettingsMenu } from './SettingsMenu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function TopBar() {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#090f16]/90 px-4 text-white backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scissors className="size-3.5" />
        </div>
        <span className="text-base font-semibold tracking-tight">Cutout</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
        >
          Generative UI Kit
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Saved locally
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Zoom out"
          >
            <Minus />
          </Button>
          <span className="min-w-12 text-center tabular-nums">100%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Zoom in"
          >
            <Plus />
          </Button>
        </div>
        <Badge
          variant="outline"
          className="h-8 gap-1.5 border-white/10 bg-white/[0.04] px-3 text-white"
        >
          <Sparkles className="size-3 text-cyan-300" />
          2,450 credits
        </Badge>
        <Badge
          variant="outline"
          className="h-8 gap-1.5 border-white/10 bg-white/[0.04] px-3 text-muted-foreground"
        >
          <Lock className="size-3" />
          Local
        </Badge>
        <ThemeToggle />
        <SettingsMenu />
      </div>
    </header>
  )
}
