import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSpeechPreferencesService,
  speechPreferencesStorageAvailable,
  type SpeechPreferences,
} from "@/speech";
const service = createSpeechPreferencesService(),
  key = ["speech", "preferences"] as const;
export function useSpeechPreferences() {
  return {
    ...useQuery({ queryKey: key, queryFn: () => service.load() }),
    storageAvailable: speechPreferencesStorageAvailable(),
  };
}
export function useSaveSpeechPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SpeechPreferences) => service.save(value),
    onSuccess: (value) => client.setQueryData(key, value),
  });
}
export function useResetSpeechPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => service.reset(),
    onSuccess: (value) => client.setQueryData(key, value),
  });
}
