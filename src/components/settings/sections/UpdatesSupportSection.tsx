import { RecoverySection } from "./RecoverySection";
import { UpdatesSection } from "./UpdatesSection";
import type { DesktopUpdateController } from "@/updater/service";

export function UpdatesSupportSection({
  prepareRecoverySnapshot,
  updateController,
}: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly updateController?: DesktopUpdateController;
}) {
  return (
    <div className="flex flex-col">
      <UpdatesSection
        prepareRecoverySnapshot={prepareRecoverySnapshot}
        controller={updateController}
      />
      <RecoverySection />
    </div>
  );
}
