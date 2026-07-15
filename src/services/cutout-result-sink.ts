import type { CutoutResultSink } from './desktop-tool-executor'
import type { Store } from '@/store/types'

/** Adapt the unified tool loop result into one visible canvas transaction. */
export function createCutoutResultSink(
  getState: () => Pick<Store, 'commitCutoutResult'>,
): CutoutResultSink {
  return {
    commit({ slices }) {
      getState().commitCutoutResult({
        slices: slices.map((slice) => ({
          id: slice.id,
          index: slice.index,
          box: slice.box,
          blob: slice.png,
          width: slice.width,
          height: slice.height,
        })),
      })
    },
  }
}
