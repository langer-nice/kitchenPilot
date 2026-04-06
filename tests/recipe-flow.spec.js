const { test, expect } = require("@playwright/test");
const {
  SIMPLE_PASTED_RECIPE,
  SIMPLE_PARSED_RECIPE,
  TIMER_PASTED_RECIPE,
  TIMER_PARSED_RECIPE
} = require("./fixtures/recipes");
const {
  completeRecipeViaTapFlow,
  expectNoFailureState,
  startRecipeFromPastedText,
  waitForScreen
} = require("./helpers");

test.describe("KitchenPilot tap-only recipe regression flow", () => {
  test("simple pasted recipe completes", async ({ page }) => {
    await startRecipeFromPastedText(page, SIMPLE_PASTED_RECIPE, SIMPLE_PARSED_RECIPE);
    await completeRecipeViaTapFlow(page);

    await waitForScreen(page, "completed");
    await expect(page.getByRole("heading", { name: "Recipe Completed" })).toBeVisible();
  });

  test("timer recipe completes", async ({ page }) => {
    await startRecipeFromPastedText(page, TIMER_PASTED_RECIPE, TIMER_PARSED_RECIPE);
    await completeRecipeViaTapFlow(page);

    await waitForScreen(page, "completed");
    await expect(page.getByRole("heading", { name: "Recipe Completed" })).toBeVisible();
  });

  test("recook works for the same recipe", async ({ page }) => {
    await startRecipeFromPastedText(page, SIMPLE_PASTED_RECIPE, SIMPLE_PARSED_RECIPE);
    await completeRecipeViaTapFlow(page);
    await waitForScreen(page, "completed");

    await page.getByRole("button", { name: /^Cook Again$/ }).click();
    await waitForScreen(page, "ingredientsIntro");

    await completeRecipeViaTapFlow(page);
    await waitForScreen(page, "completed");
    await expect(page.getByRole("heading", { name: "Recipe Completed" })).toBeVisible();
  });

  test("back to home resets input state", async ({ page }) => {
    await startRecipeFromPastedText(page, SIMPLE_PASTED_RECIPE, SIMPLE_PARSED_RECIPE);
    await completeRecipeViaTapFlow(page);
    await waitForScreen(page, "completed");

    await page.getByRole("button", { name: /^Return Home$/ }).click();
    await waitForScreen(page, "home");
    await expectNoFailureState(page);

    await page.locator('[aria-label="Paste recipe text"]').click();
    await expect(page.locator("#recipeText")).toHaveValue("");
    await expect(page.locator("#recipeUrl")).toHaveValue("");
    await expect(page.locator(".home-entry-card.is-ready")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Start Cooking$/ })).toBeDisabled();
  });
});
