import { expect, test } from "./local-state.fixture";
import { projectCount } from "./project-storage";

test("Topbar New project creates clean workspaces without persisting blank drafts", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Describe what you want to design..." });
  const newProject = page.getByRole("button", { name: "New project" });
  const initialCount = await projectCount(page);
  const buttonBox = await newProject.boundingBox();
  expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Web", exact: true }).click();
  await composer.fill("A prompt that should be explicitly cleared");
  await page.getByLabel("Add local files").setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await expect(page.getByLabel("Composer attachments")).toContainText("reference.png");
  await newProject.focus();
  await expect(newProject).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("complementary", { name: "Agent workspace" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Untitled project", exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0);
  expect(await projectCount(page)).toBe(initialCount);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(composer).toBeVisible();
  const projectName = `Persistent project ${Date.now()}`;
  await composer.fill(projectName);
  await page.getByRole("button", { name: "Create from brief" }).click();
  await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
  await newProject.click();
  await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Untitled project", exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0);
  await expect.poll(() => projectCount(page)).toBe(initialCount + 1);

  await newProject.click();
  await newProject.click();
  await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
  expect(await projectCount(page)).toBe(initialCount + 1);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: /^All projects\b/ }).click();
  const directory = page.getByRole("heading", { name: "Your projects" }).locator("../../..");
  await expect(directory.getByRole("button", { name: `Open ${projectName}` })).toHaveCount(1);
  await expect(directory.getByRole("button", { name: "Open Untitled project" })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
