import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
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
            description: error instanceof Error ? error.message : String(error),
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
    <section aria-labelledby="speech-heading" className="flex flex-col gap-8">
      <div>
        <h2 id="speech-heading" className="text-sm font-medium">
          <Trans id="settings.section_speech">Speech</Trans>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Trans id="settings.speech.description">
            Configure dictation and spoken output without changing how the Agent
            plans your work.
          </Trans>
        </p>
        <p
          role={hostUnavailable ? "alert" : undefined}
          className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
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

      <section
        className="flex flex-col gap-2"
        aria-labelledby="speech-models-heading"
      >
        <h3
          id="speech-models-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          <Trans id="settings.speech.models_title">Speech models</Trans>
        </h3>
        <div className="divide-y divide-border">
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                <Trans id="settings.speech.automatic_routing">
                  Automatic routing
                </Trans>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                <Trans id="settings.speech.models_description">
                  Auto routing is used by default. ASR and TTS remain
                  capability-required until compatible adapters are connected.
                </Trans>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
              >
                <Trans id="settings.advanced">Advanced</Trans>
              </Button>
            </div>
          </div>
          {advanced ? (
            <div className="py-4">
              <div className="text-sm font-medium">
                <Trans id="settings.speech.manual_routing">
                  Manual speech routing
                </Trans>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Trans id="settings.speech.manual_routing_hint">
                  Pin a specific provider and model for transcription and spoken
                  output instead of letting Cutout choose.
                </Trans>
              </p>
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
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="flex flex-col gap-2"
        aria-labelledby="speech-dictation-heading"
      >
        <h3
          id="speech-dictation-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          <Trans id="settings.speech.dictation">Dictation</Trans>
        </h3>
        <div className="divide-y divide-border">
          <label className="block py-4">
            <span className="block text-sm font-medium">
              <Trans id="settings.speech.microphone_device_id">
                Microphone device ID
              </Trans>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              <Trans id="settings.speech.microphone_device_id_hint">
                Leave empty to use the system default input. Paste a device ID
                to pin one microphone.
              </Trans>
            </span>
            <Input
              className="mt-3"
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
          <div className="py-4">
            <div className="text-sm font-medium">
              <Trans id="settings.speech.trigger_title">
                Dictation trigger
              </Trans>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans id="settings.speech.trigger_hint">
                Choose whether dictation runs while the key is held or stays on
                until you stop it, and which shortcut starts it.
              </Trans>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
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
                  className="mt-1.5 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
                  className="mt-1.5"
                  value={draft.shortcut}
                  disabled={busy || hostUnavailable}
                  onChange={(e) =>
                    setDraft({ ...draft, shortcut: e.target.value })
                  }
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
          </div>
          <label className="flex min-h-14 items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                <Trans id="settings.speech.keep_dictation_visible">
                  Keep dictation visible
                </Trans>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                <Trans id="settings.speech.keep_dictation_visible_hint">
                  Keep the live transcript panel on screen after dictation
                  stops.
                </Trans>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
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
            </span>
          </label>
          <div className="py-4">
            <div className="text-sm font-medium">
              <Trans id="settings.speech.dictionary_title">Dictionary</Trans>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans id="settings.speech.dictionary_hint">
                Add names and terms that transcription should spell exactly.
                Select an entry to remove it.
              </Trans>
            </p>
            <div className="mt-3 flex gap-2">
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
            <div className="mt-3 flex flex-wrap gap-2">
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
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:border-foreground/25 hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
      </section>

      <section
        className="flex flex-col gap-2"
        aria-labelledby="speech-output-heading"
      >
        <h3
          id="speech-output-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          <Trans id="settings.speech.spoken_output">Spoken output</Trans>
        </h3>
        <p className="text-xs text-muted-foreground">
          <Trans id="settings.speech.spoken_output_capability">
            Capability required: voice discovery and playback stay disabled
            until a TTS adapter is available.
          </Trans>
        </p>
        <div className="divide-y divide-border">
          <div className="py-4">
            <div className="text-sm font-medium">
              <Trans id="settings.speech.voice_title">Voice and rate</Trans>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans id="settings.speech.voice_hint">
                The voice name and playback speed used for spoken replies. Both
                unlock once a TTS adapter is connected.
              </Trans>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
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
          </div>
          <label className="flex min-h-14 items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                <Trans id="settings.speech.auto_play_responses">
                  Auto-play responses
                </Trans>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                <Trans id="settings.speech.auto_play_responses_hint">
                  Speak each Agent reply as soon as it arrives, without pressing
                  play.
                </Trans>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Switch
                checked={draft.ttsAutoPlay}
                disabled
                aria-label={t({
                  id: "settings.speech.auto_play_aria",
                  message: "Auto-play TTS responses",
                })}
              />
            </span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
