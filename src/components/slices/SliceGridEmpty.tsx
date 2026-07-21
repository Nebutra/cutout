/** Empty-state guidance for missing sources and zero-result analysis. */
import { PackageOpen } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { useSource } from '@/store/selectors'

export function SliceGridEmpty() {
  const hasSource = useSource().bitmap !== null
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <PackageOpen className="size-8 text-muted-foreground/60" />
      {hasSource ? (
        <>
          <div className="grid gap-1">
            <p className="text-sm font-medium">
              <Trans id="slices.empty_no_regions_title">No regions found</Trans>
            </p>
            <p className="max-w-64 text-xs text-muted-foreground">
              <Trans id="slices.empty_no_regions_automatic_hint">
                No reusable regions were found. Try a different asset sheet.
              </Trans>
            </p>
          </div>
        </>
      ) : (
        <p className="max-w-56 text-xs text-muted-foreground">
          <Trans id="slices.empty_no_source">
            Drop an asset sheet into the left pane to start slicing.
          </Trans>
        </p>
      )}
    </div>
  )
}
