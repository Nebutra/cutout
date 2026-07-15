import { LazyStore } from "@tauri-apps/plugin-store";
import {
  defaultSpeechPreferences,
  speechPreferencesSchema,
  type SpeechPreferences,
} from "./schema";
const KEY = "speech.preferences";
export interface SpeechPreferencesStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  save?(): Promise<void>;
}
export interface SpeechPreferencesService {
  load(): Promise<SpeechPreferences>;
  save(value: SpeechPreferences): Promise<SpeechPreferences>;
  reset(): Promise<SpeechPreferences>;
}
type SpeechGlobal = typeof globalThis & {
  __CUTOUT_SPEECH_STORE__?: SpeechPreferencesStore;
  __TAURI_INTERNALS__?: unknown;
};
export function speechPreferencesStorageAvailable() {
  const host = globalThis as SpeechGlobal;
  return Boolean(host.__CUTOUT_SPEECH_STORE__ || host.__TAURI_INTERNALS__);
}
function defaultStore(): SpeechPreferencesStore {
  const host = globalThis as SpeechGlobal;
  if (host.__CUTOUT_SPEECH_STORE__) return host.__CUTOUT_SPEECH_STORE__;
  if (host.__TAURI_INTERNALS__) return new LazyStore("settings.json");
  return {
    async get() {
      return undefined;
    },
    async set() {
      throw new Error(
        "Speech preferences require the authorized desktop host.",
      );
    },
    async delete() {
      throw new Error(
        "Speech preferences require the authorized desktop host.",
      );
    },
  };
}
export function createSpeechPreferencesService(
  store: SpeechPreferencesStore = defaultStore(),
): SpeechPreferencesService {
  return {
    async load() {
      try {
        const parsed = speechPreferencesSchema.safeParse(await store.get(KEY));
        return parsed.success ? parsed.data : defaultSpeechPreferences;
      } catch {
        return defaultSpeechPreferences;
      }
    },
    async save(input) {
      const value = speechPreferencesSchema.parse(input);
      await store.set(KEY, value);
      await store.save?.();
      return value;
    },
    async reset() {
      await store.delete(KEY);
      await store.save?.();
      return defaultSpeechPreferences;
    },
  };
}
