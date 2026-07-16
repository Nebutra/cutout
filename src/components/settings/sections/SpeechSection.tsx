import { useEffect, useState } from "react";
import { Loader2, Mic, RotateCcw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
        toast.success(
          t({
            id: "settings.speech.saved_toast",
            message: "Speech preferences saved",
          }),
        );
      } catch (error) {
        toast.error(
          t({
            id: "settings.speech.save_failed_toast",
            message: "Could not save speech preferences",
          }),
          {
            description:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
    };
  if (query.isLoading)
    return (
      <div
        role="status"
        className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        <Trans id="settings.speech.loading">Loading speech settings…</Trans>
      </div>
    );
  if (query.isError)
    return (
      <div role="alert">
        <p className="text-sm text-destructive">
          <Trans id="settings.speech.load_failed">
            Speech settings could not be loaded.
          </Trans>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          <Trans id="settings.speech.retry">Retry</Trans>
        </Button>
      </div>
    );
  return (
    <section aria-labelledby="speech-heading" className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <Mic className="size-4" />
          <h2 id="speech-heading" className="text-sm font-semibold">
            <Trans id="settings.section_speech">Speech</Trans>
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans id="settings.speech.description">
            Configure dictation and spoken output without changing how the
            Agent plans your work.
          </Trans>
        </p>
        <p
          role={hostUnavailable ? "alert" : undefined}
          className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <Trans id="settings.speech.host_required">
            Host required: microphone enumeration and system-level shortcuts
            need an authorized desktop host.
          </Trans>
          {hostUnavailable ? (
            <>
              {" "}
              <Trans id="settings.speech.host_unavailable_suffix">
                Changes here can't be saved until then.
              </Trans>
            </>
          ) : null}
        </p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            <Trans id="settings.speech.models_title">Speech models</Trans>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            <Trans id="settings.advanced">Advanced</Trans>
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans id="settings.speech.models_description">
            Auto routing is used by default. ASR and TTS remain
            capability-required until compatible adapters are connected.
          </Trans>
        </p>
        {advanced ? (
          <div className="mt-3 flex flex-col gap-2">
            {SPEECH_MODEL_DIMENSIONS.map((dimension) => {
              const localized =
                dimension.task === "asr"
                  ? {
                      label: t({
                        id: "settings.dimension_asr_label",
                        message: "Speech to text",
                      }),
                      description: t({
                        id: "settings.dimension_asr_description",
                        message: "Transcribe spoken audio.",
                      }),
                    }
                  : {
                      label: t({
                        id: "settings.dimension_tts_label",
                        message: "Text to speech",
                      }),
                      description: t({
                        id: "settings.dimension_tts_description",
                        message: "Create spoken audio.",
                      }),
                    };
              return (
                <ModelSlot
                  key={dimension.task}
                  {...dimension}
                  {...localized}
                  advanced
                />
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">
          <Trans id="settings.speech.dictation">Dictation</Trans>
        </h3>
        <label className="mt-3 block text-xs text-muted-foreground">
          <Trans id="settings.speech.microphone_device_id">
            Microphone device ID
          </Trans>
          <Input
            value={draft.microphoneDeviceId}
            disabled={busy || hostUnavailable}
            onChange={(e) =>
              setDraft({ ...draft, microphoneDeviceId: e.target.value })
            }
            placeholder={t({
              id: "settings.speech.not_set",
              message: "Not set",
            })}
            aria-label={t({
              id: "settings.speech.microphone_device_id",
              message: "Microphone device ID",
            })}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            <Trans id="settings.speech.activation">Activation</Trans>
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
              <option value="push-to-talk">
                {t({
                  id: "settings.speech.push_to_talk",
                  message: "Push to talk",
                })}
              </option>
              <option value="toggle">
                {t({ id: "settings.speech.toggle", message: "Toggle" })}
              </option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            <Trans id="settings.speech.shortcut">Shortcut</Trans>
            <Input
              value={draft.shortcut}
              disabled={busy || hostUnavailable}
              onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
              placeholder={t({
                id: "settings.speech.not_set",
                message: "Not set",
              })}
              aria-label={t({
                id: "settings.speech.shortcut_aria",
                message: "Speech shortcut",
              })}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <Trans id="settings.speech.keep_dictation_visible">
            Keep dictation visible
          </Trans>
          <Switch
            checked={draft.keepDictationVisible}
            disabled={busy || hostUnavailable}
            onCheckedChange={(value) =>
              setDraft({ ...draft, keepDictationVisible: value })
            }
            aria-label={t({
              id: "settings.speech.keep_dictation_visible",
              message: "Keep dictation visible",
            })}
          />
        </label>
        <div className="mt-3">
          <label className="text-xs text-muted-foreground">
            <Trans id="settings.speech.dictionary_entry">
              Dictionary entry
            </Trans>
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              value={dictionary}
              disabled={busy || hostUnavailable}
              onChange={(e) => setDictionary(e.target.value)}
              aria-label={t({
                id: "settings.speech.dictionary_entry",
                message: "Dictionary entry",
              })}
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
              <Trans id="settings.add">Add</Trans>
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
                aria-label={t({
                  id: "settings.speech.remove_entry",
                  message: `Remove ${value}`,
                })}
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
          <h3 className="text-sm font-medium">
            <Trans id="settings.speech.spoken_output">Spoken output</Trans>
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans id="settings.speech.spoken_output_capability">
            Capability required: voice discovery and playback stay disabled
            until a TTS adapter is available.
          </Trans>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input
            value={draft.ttsVoice}
            disabled
            aria-label={t({
              id: "settings.speech.tts_voice",
              message: "TTS voice",
            })}
            placeholder={t({
              id: "settings.speech.tts_adapter_required",
              message: "TTS adapter required",
            })}
          />
          <Input
            type="number"
            value={draft.ttsRate}
            disabled
            aria-label={t({
              id: "settings.speech.tts_rate",
              message: "TTS rate",
            })}
          />
        </div>
        <label className="mt-3 flex items-center justify-between text-sm">
          <Trans id="settings.speech.auto_play_responses">
            Auto-play responses
          </Trans>
          <Switch
            checked={draft.ttsAutoPlay}
            disabled
            aria-label={t({
              id: "settings.speech.auto_play_aria",
              message: "Auto-play TTS responses",
            })}
          />
        </label>
      </div>
      <div className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" disabled={busy || !storageAvailable}>
              <RotateCcw />
              <Trans id="settings.speech.reset">Reset</Trans>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans id="settings.speech.reset_title">
                  Reset speech preferences?
                </Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans id="settings.speech.reset_description">
                  This restores dictation, dictionary, shortcut and TTS
                  preferences to defaults.
                </Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans id="settings.cancel">Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => void reset.mutateAsync()}>
                <Trans id="settings.speech.reset_confirm">Reset speech</Trans>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          disabled={!changed || busy || !storageAvailable}
          onClick={() => void persist()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : null}
          <Trans id="settings.speech.save_changes">Save changes</Trans>
        </Button>
      </div>
    </section>
  );
}
