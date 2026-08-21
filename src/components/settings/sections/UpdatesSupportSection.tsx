import { Trans } from "@lingui/react/macro";
import { RecoverySection } from "./RecoverySection";
import { UpdatesSection } from "./UpdatesSection";
import type { DesktopUpdateController } from "@/updater/service";
import type { LocalizedReleaseNotes } from "@/updater/contracts";
import type { ReleaseNotesView } from "@/updater/release-notes";

export function UpdatesSupportSection({
  prepareRecoverySnapshot,
  updateController,
  currentReleaseNotes,
  onOpenReleaseNotes,
}: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly updateController?: DesktopUpdateController;
  readonly currentReleaseNotes?: LocalizedReleaseNotes;
  readonly onOpenReleaseNotes?: (
    note: ReleaseNotesView,
    restoreFocusTo: HTMLElement,
  ) => void;
}) {
  return (
    // A plain wrapper, not a landmark: UpdatesSection and RecoverySection are
    // each already a region, and nesting one named "Updates and support" around
    // one named "Updates" is duplicate landmark noise for screen readers — and
    // it made getByRole("region", { name: "Updates" }) resolve to two elements.
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-sm font-medium">
          <Trans id="settings.section_updates">Updates and support</Trans>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Trans id="settings.updates.description">
            Keep Cutout current and recover local work when something goes wrong.
          </Trans>
        </p>
      </div>
      <UpdatesSection
        prepareRecoverySnapshot={prepareRecoverySnapshot}
        controller={updateController}
        currentReleaseNotes={currentReleaseNotes}
        onOpenReleaseNotes={onOpenReleaseNotes}
      />
      <RecoverySection />
    </div>
  );
}
