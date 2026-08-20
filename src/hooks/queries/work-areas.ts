/**
 * Areas-of-work query + mutation.
 *
 * A local, non-secret preference, so the hook calls the local module directly
 * (same shape as `hooks/queries/export-prefs`). Reading is intentionally the
 * only consumption path: the stored selection may reorder or prefill UI and
 * nothing else — it never installs, enables, gates or routes a Design Profile.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkAreaId } from "@/components/onboarding/areas-of-work";
import {
  DEFAULT_WORK_AREAS_STATE,
  readWorkAreasState,
  saveWorkAreas,
  type WorkAreasStateV1,
} from "@/services/work-areas-prefs.local";

export const workAreasKeys = { all: ["work-areas"] as const };

export function useWorkAreas() {
  return useQuery<WorkAreasStateV1>({
    queryKey: workAreasKeys.all,
    queryFn: async () =>
      readWorkAreasState(localStorage) ?? DEFAULT_WORK_AREAS_STATE,
  });
}

export function useSaveWorkAreas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (areas: readonly WorkAreaId[]) =>
      saveWorkAreas(localStorage, areas),
    onSuccess: () => qc.invalidateQueries({ queryKey: workAreasKeys.all }),
  });
}
