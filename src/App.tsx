import { Providers } from '@/components/Providers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * Phase 0 placeholder shell. Validates that Tailwind v4, shadcn, the `@` alias,
 * and the provider tree all compile and render. Replaced by the real
 * split-view workspace in Phase 4.
 */
export default function App() {
  return (
    <Providers>
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Badge variant="secondary">Tauri 2 · React 19 · Vite 8</Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Asset Cutout Studio</h1>
        <p className="text-sm text-muted-foreground">Scaffold online — workspace coming in Phase 4.</p>
        <Button>It compiles</Button>
      </main>
    </Providers>
  )
}
