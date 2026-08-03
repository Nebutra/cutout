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
  readonly onOpenReleaseNotes?: (note: ReleaseNotesView, restoreFocusTo: HTMLElement) => void;
}) {
  return (
    <div className="flex flex-col">
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
