const { expect } = require("@playwright/test");

const APP_SCREEN = "#app";
const SCREEN_TIMEOUT_MS = 15_000;
const TRANSITION_TIMEOUT_MS = 6_000;

async function getUiSnapshot(page) {
  return page.evaluate(() => {
    const app = document.getElementById("app");
    return {
      screen: app?.dataset.screen || "",
      heading: document.querySelector("h1")?.textContent?.trim() || "",
      subtitle: document.querySelector(".subtitle")?.textContent?.trim() || "",
      stepIndicator: document.querySelector(".step-indicator")?.textContent?.trim() || "",
      timerOverlayVisible: Boolean(document.querySelector("#timer-overlay:not(.hidden)")),
      timerValue: document.querySelector("#timer-value")?.textContent?.trim() || "",
      failureVisible: /Cooking Unavailable/i.test(document.body.textContent || ""),
      nextVisible: Array.from(document.querySelectorAll("[data-action='next']")).some((node) => {
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && !node.disabled;
      }),
      skipVisible: Boolean(document.querySelector("#timer-skip-btn")) &&
        !document.querySelector("#timer-overlay")?.classList.contains("hidden")
    };
  });
}

async function waitForScreen(page, screenName) {
  await page.waitForFunction(
    (expected) => document.getElementById("app")?.dataset.screen === expected,
    screenName,
    { timeout: SCREEN_TIMEOUT_MS }
  );
}

async function expectNoFailureState(page) {
  const snapshot = await getUiSnapshot(page);
  expect(snapshot.failureVisible, `Unexpected cooking failure screen on ${snapshot.screen}`).toBe(false);
}

async function gotoHome(page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const screen = await page.locator(APP_SCREEN).getAttribute("data-screen");
  if (screen === "onboarding") {
    await page.getByRole("button", { name: /^Start cooking$/i }).click();
  }

  await waitForScreen(page, "home");
}

async function startRecipeFromPastedText(page, recipeText) {
  await gotoHome(page);
  await page.locator('[aria-label="Paste recipe text"]').click();
  await page.locator("#recipeText").fill(recipeText);
  await page.getByRole("button", { name: /^Start Cooking$/ }).click();
  await waitForScreen(page, "analysis");
  await expectNoFailureState(page);
}

async function waitForProgressFrom(page, beforeSnapshot, actionLabel) {
  await page.waitForFunction(
    (previous) => {
      const app = document.getElementById("app");
      const current = {
        screen: app?.dataset.screen || "",
        heading: document.querySelector("h1")?.textContent?.trim() || "",
        subtitle: document.querySelector(".subtitle")?.textContent?.trim() || "",
        stepIndicator: document.querySelector(".step-indicator")?.textContent?.trim() || "",
        timerOverlayVisible: Boolean(document.querySelector("#timer-overlay:not(.hidden)")),
        failureVisible: /Cooking Unavailable/i.test(document.body.textContent || "")
      };

      return current.failureVisible ||
        current.screen === "completed" ||
        JSON.stringify(current) !== JSON.stringify(previous);
    },
    beforeSnapshot,
    { timeout: TRANSITION_TIMEOUT_MS }
  );

  await expectNoFailureState(page);
  const afterSnapshot = await getUiSnapshot(page);
  expect(
    afterSnapshot.screen === "completed" ||
    JSON.stringify({
      screen: afterSnapshot.screen,
      heading: afterSnapshot.heading,
      subtitle: afterSnapshot.subtitle,
      stepIndicator: afterSnapshot.stepIndicator,
      timerOverlayVisible: afterSnapshot.timerOverlayVisible,
      failureVisible: afterSnapshot.failureVisible
    }) !== JSON.stringify(beforeSnapshot),
    `${actionLabel} did not advance the app state`
  ).toBe(true);
}

async function advanceVisibleNext(page) {
  const before = await getUiSnapshot(page);
  await page.locator("[data-action='next']").first().click();
  await waitForProgressFrom(page, {
    screen: before.screen,
    heading: before.heading,
    subtitle: before.subtitle,
    stepIndicator: before.stepIndicator,
    timerOverlayVisible: before.timerOverlayVisible,
    failureVisible: before.failureVisible
  }, "Next");
}

async function skipActiveTimer(page) {
  const before = await getUiSnapshot(page);
  await page.locator("#timer-skip-btn").click();
  await waitForProgressFrom(page, {
    screen: before.screen,
    heading: before.heading,
    subtitle: before.subtitle,
    stepIndicator: before.stepIndicator,
    timerOverlayVisible: before.timerOverlayVisible,
    failureVisible: before.failureVisible
  }, "Skip Timer");
}

async function completeRecipeViaTapFlow(page, options = {}) {
  const { maxTransitions = 40 } = options;

  for (let index = 0; index < maxTransitions; index += 1) {
    await expectNoFailureState(page);
    const snapshot = await getUiSnapshot(page);

    if (snapshot.screen === "completed") {
      return;
    }

    if (snapshot.skipVisible) {
      await skipActiveTimer(page);
      continue;
    }

    if (snapshot.nextVisible) {
      await advanceVisibleNext(page);
      continue;
    }

    throw new Error(`Flow stuck on screen "${snapshot.screen}" at "${snapshot.heading}" (${snapshot.stepIndicator || snapshot.subtitle || "no progress marker"})`);
  }

  throw new Error(`Recipe did not reach completed state within ${maxTransitions} transitions`);
}

module.exports = {
  completeRecipeViaTapFlow,
  expectNoFailureState,
  getUiSnapshot,
  gotoHome,
  startRecipeFromPastedText,
  waitForScreen
};
