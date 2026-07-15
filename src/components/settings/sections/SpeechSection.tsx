import { useEffect, useState } from "react";
import { Loader2, Mic, RotateCcw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { defaultSpeechPreferences, type SpeechPreferences } from "@/speech";
import {
  useResetSpeechPreferences,
  useSaveSpeechPreferences,
  useSpeechPreferences,
} from "@/hooks/queries/speech";
import { ModelSlot } from "../ModelSlot";
import { SPEECH_MODEL_DIMENSIONS } from "../speech-model-dimensions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
export function SpeechSection() {
  const query = useSpeechPreferences(),
    save = useSaveSpeechPreferences(),
    reset = useResetSpeechPreferences(),
    [draft, setDraft] = useState<SpeechPreferences>(
      query.data ?? defaultSpeechPreferences,
    ),
    [advanced, setAdvanced] = useState(false),
    [dictionary, setDictionary] = useState("");
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const storageAvailable = query.storageAvailable ?? true,
    hostUnavailable = !storageAvailable,
    busy = query.isLoading || save.isPending || reset.isPending,
    changed =
      JSON.stringify(draft) !==
      JSON.stringify(query.data ?? defaultSpeechPreferences),
    persist = async () => {
      try {
        await save.mutateAsync(draft);
        toast.success("Speech preferences saved");
      } catch (error) {
        toast.error("Could not save speech preferences", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
  if (query.isLoading)
    return (
      <div
        role="status"
        className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Loading speech settings…
      </div>
    );
  if (query.isError)
    return (
      <div role="alert">
        <p className="text-sm text-destructive">
          Speech settings could not be loaded.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  return (
    <section aria-labelledby="speech-heading" className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <Mic className="size-4" />
          <h2 id="speech-heading" className="text-sm font-semibold">
            Speech
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure dictation and spoken output without changing how the Agent
          plans your work.
        </p>
        <p
          role={hostUnavailable ? "alert" : undefined}
          className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          Host required: microphone enumeration and system-level shortcuts
          need an authorized desktop host.
          {hostUnavailable
            ? " Changes here can't be saved until then."
            : null}
        </p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Speech models</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            Advanced
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Auto routing is used by default. ASR and TTS remain
          capability-required until compatible adapters are connected.
        </p>
        {advanced ? (
          <div className="mt-3 flex flex-col gap-2">
            {SPEECH_MODEL_DIMENSIONS.map((dimension) => (
              <ModelSlot key={dimension.task} {...dimension} advanced />
            ))}
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Dictation</h3>
        <label className="mt-3 block text-xs text-muted-foreground">
          Microphone device ID
          <Input
            value={draft.microphoneDeviceId}
            disabled={busy || hostUnavailable}
            onChange={(e) =>
              setDraft({ ...draft, microphoneDeviceId: e.target.value })
            }
            placeholder="Not set"
            aria-label="Microphone device ID"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            Activation
            <select
              value={draft.activationMode}
              disabled={busy || hostUnavailable}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  activationMode: e.target
                    .value as SpeechPreferences["activationMode"],
                })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="push-to-talk">Push to talk</option>
              <option value="toggle">Toggle</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Shortcut
            <Input
              value={draft.shortcut}
              disabled={busy || hostUnavailable}
              onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
              placeholder="Not set"
              aria-label="Speech shortcut"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          Keep dictation visible
          <Switch
            checked={draft.keepDictationVisible}
            disabled={busy || hostUnavailable}
            onCheckedChange={(value) =>
              setDraft({ ...draft, keepDictationVisible: value })
            }
            aria-label="Keep dictation visible"
          />
        </label>
        <div className="mt-3">
          <label className="text-xs text-muted-foreground">
            Dictionary entry
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              value={dictionary}
              disabled={busy || hostUnavailable}
              onChange={(e) => setDictionary(e.target.value)}
              aria-label="Dictionary entry"
            />
            <Button
              variant="outline"
              disabled={!dictionary.trim() || busy || hostUnavailable}
              onClick={() => {
                setDraft({
                  ...draft,
                  dictionary: [
                    ...new Set([...draft.dictionary, dictionary.trim()]),
                  ],
                });
                setDictionary("");
              }}
            >
              Add
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {draft.dictionary.map((value) => (
              <button
                key={value}
                type="button"
                disabled={busy || hostUnavailable}
                onClick={() =>
                  setDraft({
                    ...draft,
                    dictionary: draft.dictionary.filter(
                      (item) => item !== value,
                    ),
                  })
                }
                className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-50"
                aria-label={`Remove ${value}`}
              >
                {value} ×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4" />
          <h3 className="text-sm font-medium">Spoken output</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Capability required: voice discovery and playback stay disabled until
          a TTS adapter is available.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input
            value={draft.ttsVoice}
            disabled
            aria-label="TTS voice"
            placeholder="TTS adapter required"
          />
          <Input
            type="number"
            value={draft.ttsRate}
            disabled
            aria-label="TTS rate"
          />
        </div>
        <label className="mt-3 flex items-center justify-between text-sm">
          Auto-play responses
          <Switch
            checked={draft.ttsAutoPlay}
            disabled
            aria-label="Auto-play TTS responses"
          />
        </label>
      </div>
      <div className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" disabled={busy || !storageAvailable}>
              <RotateCcw />
              Reset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset speech preferences?</AlertDialogTitle>
              <AlertDialogDescription>
                This restores dictation, dictionary, shortcut and TTS
                preferences to defaults.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void reset.mutateAsync()}>
                Reset speech
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          disabled={!changed || busy || !storageAvailable}
          onClick={() => void persist()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : null}Save
          changes
        </Button>
      </div>
    </section>
  );
}
