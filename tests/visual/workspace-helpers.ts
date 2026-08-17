import { expect, type Page } from "@playwright/test";

export type ProjectTool =
  | "Files"
  | "Git"
  | "Library"
  | "DESIGN.md"
  | "Inspect project"
  | "Delivery details";

export async function openProjectTool(page: Page, tool: ProjectTool) {
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: tool, exact: true }).click();
}

export async function openDeliverWorkspace(page: Page) {
  await openProjectTool(page, "Delivery details");
  await expect(page.getByRole("region", { name: "Project workbench" })).toBeVisible();
}
