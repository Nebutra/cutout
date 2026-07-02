/**
 * Export-preference query + mutation.
 *
 * Local, non-secret pref (plugin-store) — the hook calls the local module
 * directly, like theme/language. The export mutations (`hooks/queries/cutout`)
 * read the remembered dir at mutate-time; this hook drives the Settings toggle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  loadExportPrefs,
  setRememberDir,
  type ExportPrefs,
} from '@/services/export-prefs.local'

export const exportPrefsKeys = { all: ['export-prefs'] as const }

export function useExportPrefs() {
  return useQuery<ExportPrefs>({
    queryKey: exportPrefsKeys.all,
    queryFn: loadExportPrefs,
  })
}

export function useSetRememberDir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => setRememberDir(on),
    onSuccess: () => qc.invalidateQueries({ queryKey: exportPrefsKeys.all }),
  })
}
