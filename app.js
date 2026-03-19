const appState = {
  currentScreen: "home",
  recipe: null,
  homeRecipeUrl: "",
  homeRecipeText: "",
  homeTextInputVisible: false,
  homeValidationMessage: "",
  ingredientChecks: [],
  preparationIndex: 0,
  cookingIndex: 0,
  timerMessage: "",
  timerStatus: "idle",
  timerMessageTimeoutId: null,
  activeTimerSeconds: null,
  timerPaused: false,
  voiceEnabled: false,
  voiceUnlocked: false,
  voiceListening: false,
  voiceUserSpeaking: false,
  voiceOutputSpeaking: false,
  voiceErrorMessage: "",
  voiceHeard: "",
  voiceExecuting: false,
  voiceCommandStatus: "",
  voiceCommandStatusTimeoutId: null,
  lastSpokenPreparationIndex: null,
  lastSpokenCookingIndex: null,
  voiceHintMessage: "",
  voiceHintTimeoutId: null,
  voiceUserSpeakingTimeoutId: null,
  voiceIngredientHighlightIndex: null,
  voiceIngredientHighlightTimeoutId: null,
  timerSkippedStepIndex: null,
  preparationSpeechFrameId: null
};

const appEl = document.getElementById("app");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;

const EXAMPLE_RECIPE_URL = "https://www.bbcgoodfood.com/recipes/spaghetti-aglio-e-olio";
// Dev Mode switch:
// - true  = load the short-timer example recipe for faster testing
// - false = load the normal realistic example recipe
const DEV_MODE = true;

const NORMAL_EXAMPLE_RECIPE_TEXT = `Spaghetti Aglio e Olio

Ingredients:
200g spaghetti
3 cloves garlic
4 tbsp olive oil
Salt
Chili flakes (optional)
Parsley (optional)

Instructions:
1. Bring a large pot of salted water to a boil.
2. Cook the spaghetti according to package instructions.
3. Meanwhile, heat olive oil in a pan over medium heat.
4. Add sliced garlic and cook until lightly golden.
5. Add chili flakes if desired.
6. Drain the pasta and add it to the pan.
7. Toss well and cook for 1-2 minutes.
8. Serve with parsley.`;

const DEV_EXAMPLE_RECIPE_TEXT = `Spaghetti Aglio e Olio

Ingredients:
200g spaghetti
3 cloves garlic
4 tbsp olive oil
Salt
Chili flakes (optional)
Parsley (optional)

Instructions:
1. Bring a large pot of salted water to a boil and wait 5 seconds.
2. Cook the spaghetti for 10 seconds.
3. Meanwhile, heat olive oil in a pan over medium heat.
4. Add sliced garlic and cook for 10 seconds until lightly golden.
5. Add chili flakes if desired.
6. Drain the pasta and add it to the pan.
7. Toss well and cook for 10 seconds.
8. Serve with parsley.`;

const EXAMPLE_RECIPE_TEXT = DEV_MODE ? DEV_EXAMPLE_RECIPE_TEXT : NORMAL_EXAMPLE_RECIPE_TEXT;
// "(DEV)" means the example recipe uses short timers for faster testing.
const EXAMPLE_RECIPE_BUTTON_LABEL = DEV_MODE ? "Load Example Recipe (DEV)" : "Load Example Recipe";
const BUILD_VERSION = "DEV BUILD: v44"; 
const DEV_MODE_STORAGE_KEY = "devModeEnabled";
const INGREDIENT_STAGE_ICON = "assets/img/pizza-slice.svg";
const COOKING_STAGE_ICON = "assets/img/icon-kitchenpilot.svg";
const timerDoneAudio = typeof Audio !== "undefined" ? new Audio("assets/timer-done.wav") : null;
const VOICE_ONBOARDING_STORAGE_KEY = "voiceOnboardingSeen";

if (timerDoneAudio) {
  timerDoneAudio.preload = "auto";
}

function playTimerDoneFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(200);
  }

  const playTimerDoneSound = () => {
    if (!timerDoneAudio) {
      return;
    }
    try {
      timerDoneAudio.currentTime = 0;
      const playback = timerDoneAudio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          console.warn("Timer completion sound could not play:", error);
        });
      }
    } catch (error) {
      console.warn("Timer completion sound failed:", error);
    }
  };

  playTimerDoneSound();

  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  if (!canSpeak || !window.kitchenPilotCanSpeak?.()) {
    return;
  }

  window.setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance("Timer finished");
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = "en-US";

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Timer completion speech failed:", error);
    }
  }, 250);
}

function setTimerStatus(nextStatus, reason) {
  if (appState.timerStatus !== nextStatus) {
    console.log(`[timer-state] ${appState.timerStatus} -> ${nextStatus}${reason ? ` (${reason})` : ""}`);
    appState.timerStatus = nextStatus;
  }
}

function clearTimerMessageLater() {
  if (appState.timerMessageTimeoutId) {
    window.clearTimeout(appState.timerMessageTimeoutId);
    appState.timerMessageTimeoutId = null;
  }
}

function setVoiceCommandStatus(message, timeoutMs = 1200) {
  appState.voiceCommandStatus = message || "";

  if (appState.voiceCommandStatusTimeoutId) {
    window.clearTimeout(appState.voiceCommandStatusTimeoutId);
    appState.voiceCommandStatusTimeoutId = null;
  }

  if (!timeoutMs) {
    if (!message) {
      appState.voiceExecuting = false;
    }
    return;
  }

  appState.voiceCommandStatusTimeoutId = window.setTimeout(() => {
    appState.voiceCommandStatus = appState.voiceListening ? "Listening..." : "";
    appState.voiceExecuting = false;
    appState.voiceCommandStatusTimeoutId = null;
    if (appState.currentScreen === "preparation") {
      renderPreparation();
    }
    if (appState.currentScreen === "cooking") {
      renderCooking();
    }
    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
    }
    if (appState.currentScreen === "cookingIntro") {
      renderCookingIntro();
    }
  }, timeoutMs);
}

function renderCurrentVoiceScreen() {
  if (appState.currentScreen === "ingredientsIntro") {
    renderIngredientsIntro();
  }
  if (appState.currentScreen === "ingredients") {
    renderIngredients();
  }
  if (appState.currentScreen === "preparationIntro") {
    renderPreparationIntro();
  }
  if (appState.currentScreen === "preparation") {
    renderPreparation();
  }
  if (appState.currentScreen === "cooking") {
    renderCooking();
  }
  if (appState.currentScreen === "timerActive") {
    renderTimerActive();
  }
  if (appState.currentScreen === "cookingIntro") {
    renderCookingIntro();
  }
}

function markVoiceCommandExecuted(commandLabel) {
  appState.voiceExecuting = true;
  appState.voiceHeard = commandLabel || "";
  setVoiceCommandStatus(`Executing: ${commandLabel || "command"}`, 650);
}

function isVoiceUiActive() {
  return Boolean(appState.voiceUserSpeaking || appState.voiceOutputSpeaking);
}

function syncVoiceIndicatorBars() {
  const stateClass = !appState.voiceEnabled ? "voice-off" : isVoiceUiActive() ? "voice-active" : "voice-idle";
  const indicators = document.querySelectorAll(".voice-indicator-bar");

  indicators.forEach((indicator) => {
    indicator.classList.remove("voice-off", "voice-idle", "voice-active");
    indicator.classList.add(stateClass);
  });
}

function setVoiceUserSpeaking(isSpeaking) {
  const nextValue = Boolean(isSpeaking);
  if (appState.voiceUserSpeaking === nextValue) {
    return;
  }
  appState.voiceUserSpeaking = nextValue;
  syncVoiceIndicatorBars();
}

function setVoiceRecognitionActivity(isActive) {
  setVoiceUserSpeaking(isActive);
}

function clearVoiceRecognitionActivity() {
  if (appState.voiceUserSpeakingTimeoutId) {
    window.clearTimeout(appState.voiceUserSpeakingTimeoutId);
    appState.voiceUserSpeakingTimeoutId = null;
  }
  setVoiceUserSpeaking(false);
}

function clearDeferredPreparationSpeech() {
  if (appState.preparationSpeechFrameId !== null) {
    window.cancelAnimationFrame(appState.preparationSpeechFrameId);
    appState.preparationSpeechFrameId = null;
  }
}

function resetVoiceActivityState() {
  clearVoiceRecognitionActivity();
  setVoiceOutputSpeaking(false);
}

function pulseVoiceRecognitionActivity(durationMs = 700) {
  setVoiceUserSpeaking(true);

  if (appState.voiceUserSpeakingTimeoutId) {
    window.clearTimeout(appState.voiceUserSpeakingTimeoutId);
  }

  appState.voiceUserSpeakingTimeoutId = window.setTimeout(() => {
    appState.voiceUserSpeakingTimeoutId = null;
    setVoiceUserSpeaking(false);
  }, durationMs);
}

function setVoiceOutputSpeaking(isSpeaking) {
  const nextValue = Boolean(isSpeaking);
  if (appState.voiceOutputSpeaking === nextValue) {
    return;
  }
  appState.voiceOutputSpeaking = nextValue;
  syncVoiceIndicatorBars();
}

function appendVoiceCommandStatus(screen) {
  const statusText = appState.voiceCommandStatus || (appState.voiceListening ? "Listening..." : "");
  if (!statusText) {
    return;
  }

  const status = document.createElement("div");
  status.id = "voice-status";
  status.className = "notice voice-command-status voice-status";
  status.textContent = statusText;

  if (statusText.toLowerCase().startsWith("heard:")) {
    status.classList.add("voice-detected");
  } else if (statusText.toLowerCase().startsWith("executing")) {
    status.classList.add("voice-executing");
  } else {
    status.classList.add("voice-listening");
  }

  if (typeof window.updateVoiceStatusIndicator === "function") {
    window.updateVoiceStatusIndicator(statusText);
  }

  screen.appendChild(status);
}

function appendVoiceError(screen) {
  if (!appState.voiceErrorMessage) {
    return;
  }

  const errorEl = document.createElement("p");
  errorEl.className = "voice-error";
  errorEl.textContent = appState.voiceErrorMessage;
  screen.appendChild(errorEl);
}

function flashActionButton(actionName) {
  if (!actionName) {
    return;
  }

  const target = document.querySelector(`[data-action="${actionName}"]`);
  if (!target) {
    return;
  }

  target.classList.remove("voice-active");
  target.classList.add("voice-active");
  window.setTimeout(() => {
    target.classList.remove("voice-active");
  }, 560);
}

function clearVoiceIngredientHighlight() {
  if (appState.voiceIngredientHighlightTimeoutId) {
    window.clearTimeout(appState.voiceIngredientHighlightTimeoutId);
    appState.voiceIngredientHighlightTimeoutId = null;
  }
  appState.voiceIngredientHighlightIndex = null;
}

function highlightVoiceIngredient(index, durationMs = 260) {
  clearVoiceIngredientHighlight();
  appState.voiceIngredientHighlightIndex = index;
  renderIngredients();
  appState.voiceIngredientHighlightTimeoutId = window.setTimeout(() => {
    appState.voiceIngredientHighlightIndex = null;
    appState.voiceIngredientHighlightTimeoutId = null;
    if (appState.currentScreen === "ingredients") {
      renderIngredients();
    }
  }, durationMs);
}

function runVoiceAction(actionName, commandLabel, action, delayMs = 110) {
  if (actionName) {
    flashActionButton(actionName);
  }
  if (commandLabel) {
    markVoiceCommandExecuted(commandLabel);
  }
  window.setTimeout(() => {
    action();
  }, delayMs);
}

function isGuidanceScreen(screenName) {
  return screenName === "ingredientsIntro" ||
    screenName === "ingredients" ||
    screenName === "preparationIntro" ||
    screenName === "preparation" ||
    screenName === "cooking" ||
    screenName === "timerActive" ||
    screenName === "cookingIntro";
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setScreen(screenName) {
  const previousScreen = appState.currentScreen;
  appState.currentScreen = screenName;
  resetVoiceActivityState();
  clearDeferredPreparationSpeech();

  if (previousScreen === "preparation" && screenName !== "preparation") {
    appState.lastSpokenPreparationIndex = null;
  }

  if (!isGuidanceScreen(screenName)) {
    appState.timerMessage = "";
    clearTimerMessageLater();
    setVoiceCommandStatus("", 0);
    appState.voiceHeard = "";
    appState.voiceExecuting = false;
    setTimerStatus("idle", `leaving guidance to ${screenName}`);
    appState.activeTimerSeconds = null;
    appState.timerPaused = false;
    appState.lastSpokenPreparationIndex = null;
    appState.lastSpokenCookingIndex = null;
    stopVoiceCommands();
    stopTimer();
  }

  switch (screenName) {
    case "home":
      renderHome();
      break;
    case "analysis":
      renderAnalysis();
      break;
    case "ingredientsIntro":
      renderIngredientsIntro();
      break;
    case "ingredients":
      renderIngredients();
      break;
    case "preparationIntro":
      appState.preparationIndex = 0;
      appState.lastSpokenPreparationIndex = null;
      renderPreparationIntro();
      break;
    case "preparation":
      renderPreparation();
      break;
    case "cookingIntro":
      appState.cookingIndex = 0;
      appState.lastSpokenCookingIndex = null;
      appState.activeTimerSeconds = null;
      appState.timerPaused = false;
      appState.timerSkippedStepIndex = null;
      renderCookingIntro();
      break;
    case "cooking":
      renderCooking();
      break;
    case "timerActive":
      renderTimerActive();
      break;
    case "completed":
      renderCompleted();
      break;
    default:
      renderHome();
  }
}

function splitPreparationActions(preparationSteps) {
  const normalized = [];

  preparationSteps.forEach((step) => {
    const parts = String(step)
      .split(/\s*(?:;|\.|, then | then )\s*/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length <= 1) {
      normalized.push(String(step).trim());
      return;
    }

    parts.forEach((part) => {
      normalized.push(part);
    });
  });

  return normalized.filter(Boolean);
}

function normalizeRecipeForGuidance(recipe) {
  const cloned = JSON.parse(JSON.stringify(recipe));
  cloned.preparationSteps = splitPreparationActions(cloned.preparationSteps || []);
  return cloned;
}

function initializeIngredientChecklist(recipe) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  appState.ingredientChecks = ingredients.map(() => false);
}

function setIngredientChecked(index, checked) {
  if (!Array.isArray(appState.ingredientChecks) || index < 0 || index >= appState.ingredientChecks.length) {
    return;
  }

  appState.ingredientChecks[index] = Boolean(checked);
}

function toggleIngredientChecked(index) {
  if (!Array.isArray(appState.ingredientChecks) || index < 0 || index >= appState.ingredientChecks.length) {
    return;
  }

  appState.ingredientChecks[index] = !appState.ingredientChecks[index];
}

function areAllIngredientsReady() {
  return Array.isArray(appState.ingredientChecks) &&
    appState.ingredientChecks.length > 0 &&
    appState.ingredientChecks.every(Boolean);
}

function hasUncheckedIngredients() {
  return Array.isArray(appState.ingredientChecks) &&
    appState.ingredientChecks.some((checked) => !checked);
}

function normalizeVoiceMatchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIngredientVoiceTokens(ingredient) {
  const stopWords = new Set([
    "g", "kg", "mg", "ml", "l", "tbsp", "tsp", "cup", "cups",
    "oz", "lb", "lbs", "optional", "fresh", "large", "small",
    "medium", "to", "taste"
  ]);

  return normalizeVoiceMatchText(ingredient)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token) && !/^\d+$/.test(token));
}

function getIngredientVoiceKey(ingredient) {
  const tokens = getIngredientVoiceTokens(ingredient);
  if (tokens.length === 0) {
    return "";
  }

  return tokens[tokens.length - 1];
}

function findIngredientIndexFromVoice(commandText) {
  if (!appState.recipe || !Array.isArray(appState.recipe.ingredients)) {
    return -1;
  }

  const normalizedCommand = normalizeVoiceMatchText(commandText);
  if (!normalizedCommand) {
    return -1;
  }

  return appState.recipe.ingredients.findIndex((ingredient) => {
    const ingredientKey = getIngredientVoiceKey(ingredient);
    if (ingredientKey && normalizedCommand.includes(ingredientKey)) {
      return true;
    }

    const tokens = getIngredientVoiceTokens(ingredient);
    if (tokens.length === 0) {
      return false;
    }

    return tokens.some((token) => normalizedCommand.includes(token));
  });
}

function createVoiceActivationCard(enableMessage) {
  const voiceCard = createCard();
  voiceCard.classList.add("voice-card");

  const voiceTitle = document.createElement("p");
  voiceTitle.className = "voice-card-text";
  voiceTitle.textContent = enableMessage;

  const row = document.createElement("div");
  row.className = "voice-row";

  const voiceState = document.createElement("p");
  voiceState.className = "voice-row-label";
  voiceState.textContent = "Voice commands";

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (appState.voiceListening) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceEnabled;
  voiceToggleInput.disabled = !SpeechRecognition;
  voiceToggleInput.addEventListener("click", (event) => {
    event.preventDefault();
    const nextEnabled = !appState.voiceEnabled;
    setVoiceEnabled(nextEnabled, {
      hintMessage: enableMessage,
      hintMs: 2200,
      statusMessage: nextEnabled ? "Command mode enabled" : "Command mode disabled",
      statusMs: 900
    });
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  voiceSwitchLabel.append(voiceToggleInput, slider);
  row.append(voiceState, voiceSwitchLabel);
  voiceCard.append(voiceTitle, row);
  appendVoiceError(voiceCard);
  return voiceCard;
}

function createCompactVoiceStrip(options = {}) {
  const {
    hintMessage = "Voice commands enabled. Say: Next, Repeat, Pause.",
    hintMs = 2200,
    showListeningText = false,
    animateListening = false,
    showUnlockButton = false,
    unlockLabel = "Unlock Voice",
    readyLabel = "Voice ready"
  } = options;

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2 voice-panel compact-voice";
  if (appState.voiceEnabled) {
    voiceRow.classList.add("voice-active");
  }
  if (!animateListening) {
    voiceRow.classList.add("voice-panel--static");
  }

  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";

  const voiceIcon = document.createElement("i");
  voiceIcon.className = "fa-solid fa-microphone voice-icon";
  voiceIcon.setAttribute("aria-hidden", "true");

  const voiceText = document.createElement("span");
  voiceText.textContent = showListeningText && appState.voiceListening ? "Voice listening" : "Voice";
  voiceLabel.append(voiceIcon, voiceText);

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (animateListening && appState.voiceListening) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceEnabled;
  voiceToggleInput.disabled = !SpeechRecognition;
  voiceToggleInput.addEventListener("click", (event) => {
    event.preventDefault();
    const nextEnabled = !appState.voiceEnabled;
    setVoiceEnabled(nextEnabled, {
      hintMessage,
      hintMs
    });
  });

  const slider = document.createElement("span");
  slider.className = "slider";
  voiceSwitchLabel.append(voiceToggleInput, slider);

  const controls = document.createElement("div");
  controls.className = "voice-strip-controls";
  controls.appendChild(voiceSwitchLabel);

  if (showUnlockButton && !appState.voiceUnlocked) {
    const unlockBtn = createButton(unlockLabel, "inline-btn voice-unlock-btn", () => {
      unlockVoiceAssistant({
        statusMessage: readyLabel,
        enableHintMessage: hintMessage,
        enableHintMs: hintMs
      });
    });
    controls.appendChild(unlockBtn);
  } else if (showUnlockButton && appState.voiceUnlocked) {
    const readyState = document.createElement("span");
    readyState.className = "voice-ready-badge";
    readyState.textContent = readyLabel;
    controls.appendChild(readyState);
  }

  voiceRow.append(voiceLabel, controls);

  return voiceRow;
}

function unlockVoiceAssistant(options = {}) {
  const {
    statusMessage = "Voice ready",
    enableHintMessage = "",
    enableHintMs = 2200
  } = options;

  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  appState.voiceUnlocked = true;
  appState.voiceEnabled = true;
  appState.voiceErrorMessage = "";

  if (canSpeak) {
    try {
      const utterance = new SpeechSynthesisUtterance(statusMessage);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Voice unlock speech failed:", error);
    }
  }

  setVoiceEnabled(true, {
    hintMessage: enableHintMessage,
    hintMs: enableHintMs
  });
}

function hasSeenVoiceOnboarding() {
  try {
    return window.localStorage.getItem(VOICE_ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markVoiceOnboardingSeen() {
  try {
    window.localStorage.setItem(VOICE_ONBOARDING_STORAGE_KEY, "true");
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

function resetVoiceOnboardingSeen() {
  try {
    window.localStorage.removeItem(VOICE_ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

function showVoiceOnboardingOverlay(onContinue) {
  if (document.querySelector(".voice-onboarding-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "voice-modal-overlay voice-onboarding-overlay";

  const modal = document.createElement("div");
  modal.className = "voice-modal voice-onboarding-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Voice onboarding");

  const title = document.createElement("h2");
  title.textContent = "Use your voice to control cooking";

  const copy = document.createElement("p");
  copy.className = "voice-modal-copy";
  copy.textContent = "Tap 'Enable Voice' and say things like 'next step' or 'repeat'";

  const checkboxRow = document.createElement("label");
  checkboxRow.className = "voice-onboarding-checkbox";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";

  const checkboxText = document.createElement("span");
  checkboxText.textContent = "Don't show again";

  checkboxRow.append(checkbox, checkboxText);

  const primaryBtn = createButton("Enable Voice", "primary", () => {
    markVoiceOnboardingSeen();
    overlay.remove();

    if (typeof unlockVoiceAssistant === "function" && !appState.voiceUnlocked) {
      unlockVoiceAssistant({
        statusMessage: "Voice ready",
        enableHintMessage: "Voice commands enabled. Say: Next, Repeat, Pause.",
        enableHintMs: 2200
      });
    } else {
      setVoiceEnabled(true, {
        hintMessage: "Voice commands enabled. Say: Next, Repeat, Pause.",
        hintMs: 2200
      });
    }

    if (typeof onContinue === "function") {
      onContinue();
    }
  });

  const secondaryBtn = createButton("Not now", "", () => {
    if (checkbox.checked) {
      markVoiceOnboardingSeen();
    }
    overlay.remove();
    if (typeof onContinue === "function") {
      onContinue();
    }
  });

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(primaryBtn, secondaryBtn);

  modal.append(title, copy, checkboxRow, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function maybeShowVoiceOnboarding(onContinue) {
  if (appState.voiceEnabled || hasSeenVoiceOnboarding()) {
    if (typeof onContinue === "function") {
      onContinue();
    }
    return;
  }

  showVoiceOnboardingOverlay(onContinue);
}

function getDevModeEnabled() {
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setDevModeEnabled(enabled) {
  try {
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function getCurrentCookingStep() {
  if (!appState.recipe || !appState.recipe.cookingSteps) {
    return null;
  }
  return appState.recipe.cookingSteps[appState.cookingIndex] || null;
}

function getCurrentPreparationText() {
  if (!appState.recipe || !Array.isArray(appState.recipe.preparationSteps)) {
    return "";
  }
  return appState.recipe.preparationSteps[appState.preparationIndex] || "";
}

function resetPreparationFlowState() {
  appState.preparationIndex = 0;
  appState.lastSpokenPreparationIndex = null;
}

function openPreparationIntro() {
  resetPreparationFlowState();
  setScreen("preparationIntro");
}

function startPreparationFlow() {
  resetPreparationFlowState();
  const initialPreparationText = appState.recipe?.preparationSteps?.[0] || "";
  appState.lastSpokenPreparationIndex = 0;
  setScreen("preparation");

  if (!initialPreparationText) {
    return;
  }

  appState.preparationSpeechFrameId = window.requestAnimationFrame(() => {
    appState.preparationSpeechFrameId = null;
    if (appState.currentScreen !== "preparation" || appState.preparationIndex !== 0) {
      return;
    }
    speak(initialPreparationText);
  });
}

function advancePreparationStep() {
  if (!appState.recipe) {
    return;
  }
  const total = appState.recipe.preparationSteps.length;
  if (appState.preparationIndex < total - 1) {
    appState.preparationIndex += 1;
    renderPreparation();
  } else {
    setScreen("cookingIntro");
  }
}

function goBackPreparationStep() {
  if (!appState.recipe) {
    return;
  }
  if (appState.preparationIndex > 0) {
    appState.preparationIndex -= 1;
    renderPreparation();
  } else {
    setScreen("preparationIntro");
  }
}

function goToNextCookingStep() {
  if (!appState.recipe) {
    return;
  }

  if (appState.cookingIndex < appState.recipe.cookingSteps.length - 1) {
    appState.cookingIndex += 1;
    appState.activeTimerSeconds = null;
    setTimerStatus("idle", "next step");
    appState.timerSkippedStepIndex = null;
    renderCooking();
  } else {
    stopTimer();
    setScreen("completed");
  }
}

function canProceedFromTimerStep() {
  const step = getCurrentCookingStep();
  const hasTimer = step && Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;

  if (!hasTimer) {
    return true;
  }

  return appState.activeTimerSeconds === 0 || appState.timerSkippedStepIndex === appState.cookingIndex;
}

function goToPreviousCookingStep() {
  if (!appState.recipe) {
    return;
  }

  if (appState.cookingIndex > 0) {
    appState.cookingIndex -= 1;
    appState.activeTimerSeconds = null;
    setTimerStatus("idle", "previous step");
    appState.timerSkippedStepIndex = null;
    renderCooking();
  }
}

function skipActiveTimer() {
  stopTimer();
  appState.activeTimerSeconds = 0;
  appState.timerMessage = "Timer skipped";
  appState.timerPaused = false;
  setTimerStatus("skipped", "skip active timer");
  appState.timerSkippedStepIndex = appState.cookingIndex;
  console.log("[timer-state] Skip applied for step", appState.cookingIndex + 1);
  const notice = document.getElementById("timerNotice");
  const display = document.getElementById("timerDisplay");
  if (notice) {
    notice.textContent = "Timer skipped";
  }
  if (display) {
    display.textContent = "00:00";
  }

  clearTimerMessageLater();
  appState.timerMessageTimeoutId = window.setTimeout(() => {
    if (appState.timerStatus === "skipped" && appState.cookingIndex === appState.timerSkippedStepIndex) {
      appState.timerMessage = "";
      if (appState.currentScreen === "cooking") {
        renderCooking();
      }
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
    }
    appState.timerMessageTimeoutId = null;
  }, 700);
}

function repeatCurrentCookingStep() {
  const step = getCurrentCookingStep();
  if (step) {
    speak(step.text);
  }
}

function toggleGuidancePause() {
  const t = getTimerState();
  if (t.isRunning) {
    if (appState.timerPaused) {
      resumeTimer();
      appState.timerPaused = false;
      appState.timerMessage = "Timer running";
      setTimerStatus("running", "guidance resume");
    } else {
      pauseTimer();
      appState.timerPaused = true;
      appState.timerMessage = "Timer paused";
      setTimerStatus("paused", "guidance pause");
    }
  } else {
    appState.timerMessage = "Guidance paused";
    speak("Cooking paused.");
  }

  const notice = document.getElementById("timerNotice");
  if (notice) {
    notice.textContent = appState.timerMessage;
  }
}

function stopCookingFlow(requireConfirmation = false) {
  if (requireConfirmation) {
    const confirmed = window.confirm("Quit cooking and return to home?");
    if (!confirmed) {
      return;
    }
  }

  stopTimer();
  appState.timerSkippedStepIndex = null;
  setScreen("home");
}

function skipTimerAndAdvance() {
  skipActiveTimer();
  goToNextCookingStep();
}

function handleVoiceCommand(commandText) {
  const command = commandText.toLowerCase();
  setVoiceCommandStatus("Processing voice command...", 700);

  if (appState.currentScreen === "ingredientsIntro") {
    if (command.includes("next") || command.includes("continue") || command.includes("start")) {
      runVoiceAction("next", "Continue", () => {
        setScreen("ingredients");
      });
      return;
    }

    if (command.includes("back")) {
      runVoiceAction("back", "Back", () => {
        setScreen("analysis");
      });
      return;
    }
  }

  if (appState.currentScreen === "preparationIntro") {
    if (command.includes("next") || command.includes("continue") || command.includes("start")) {
      runVoiceAction("next", "Continue", () => {
        startPreparationFlow();
      });
      return;
    }

    if (command.includes("back")) {
      runVoiceAction("back", "Back", () => {
        setScreen("ingredients");
      });
      return;
    }
  }

  if (appState.currentScreen === "ingredients") {
    const ingredientIndex = findIngredientIndexFromVoice(command);
    if (ingredientIndex >= 0) {
      highlightVoiceIngredient(ingredientIndex);
      markVoiceCommandExecuted("Check Ingredient");
      window.setTimeout(() => {
        setIngredientChecked(ingredientIndex, true);
        clearVoiceIngredientHighlight();
        renderIngredients();
      }, 140);
      return;
    }

    if (command.includes("next") || command.includes("ready") || command.includes("continue")) {
      runVoiceAction("next", "Ready", () => {
        setScreen("preparationIntro");
      });
      return;
    }

    if (command.includes("back")) {
      runVoiceAction("back", "Back", () => {
        setScreen("ingredientsIntro");
      });
      return;
    }

    return;
  }

  if (command.includes("next")) {
    if (appState.currentScreen === "preparation") {
      runVoiceAction("next", "Next", () => {
        advancePreparationStep();
      });
      return;
    }

    if (appState.currentScreen === "timerActive" && !canProceedFromTimerStep()) {
      setVoiceHint("Timer is still running. Say skip timer or wait.", 2200);
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
      return;
    }

    runVoiceAction("next", "Next", () => {
      goToNextCookingStep();
    });
    return;
  }

  if (command.includes("previous") || command.includes("back")) {
    if (appState.currentScreen === "cookingIntro") {
      runVoiceAction("back", "Back", () => {
        openPreparationIntro();
      });
      return;
    }

    if (appState.currentScreen === "preparation") {
      runVoiceAction("back", "Back", () => {
        goBackPreparationStep();
      });
      return;
    }

    runVoiceAction("back", "Back", () => {
      goToPreviousCookingStep();
    });
    return;
  }

  if (command.includes("repeat")) {
    if (appState.currentScreen === "preparation") {
      runVoiceAction("repeat", "Repeat", () => {
        const prepText = getCurrentPreparationText();
        if (prepText) {
          speak(prepText);
        }
      });
      return;
    }

    runVoiceAction("repeat", "Repeat", () => {
      repeatCurrentCookingStep();
    });
    return;
  }

  if (command.includes("pause")) {
    runVoiceAction("pause", "Pause", () => {
      toggleGuidancePause();
    });
    return;
  }

  if (appState.currentScreen === "cookingIntro" && command.includes("start") && command.includes("cook")) {
    runVoiceAction("next", "Start Cooking", () => {
      setScreen("cooking");
    });
    return;
  }

  if (command.includes("start") && command.includes("timer")) {
    const step = getCurrentCookingStep();
    const hasTimer = step && Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;

    if (!hasTimer) {
      setVoiceHint("This step has no timer.", 1800);
      return;
    }

    if (appState.timerStatus === "paused") {
      resumeTimer();
      appState.timerPaused = false;
      appState.timerMessage = "Timer running";
      setTimerStatus("running", "voice start timer resume");
      markVoiceCommandExecuted("Start Timer");
    } else if (appState.timerStatus === "idle") {
      startStepTimerIfNeeded(step);
      markVoiceCommandExecuted("Start Timer");
    }

    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
    }
    return;
  }

  if (command.includes("stop")) {
    runVoiceAction("stop", "Stop", () => {
      stopCookingFlow();
    });
    return;
  }

  if (command.includes("skip") && command.includes("timer")) {
    runVoiceAction("skip-timer", "Skip Timer", () => {
      skipTimerAndAdvance();
    });
    return;
  }

  if (appState.voiceListening) {
    setVoiceCommandStatus("Listening...", 0);
    renderCurrentVoiceScreen();
  }
}

function startVoiceCommands() {
  if (!SpeechRecognition) {
    appState.voiceEnabled = false;
    appState.voiceErrorMessage = "Voice input is not supported in this browser.";
    renderCurrentVoiceScreen();
    return;
  }

  appState.voiceEnabled = true;
  appState.voiceErrorMessage = "";

  if (appState.voiceListening) {
    renderCurrentVoiceScreen();
    return;
  }

  if (!voiceRecognition) {
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = "en-US";
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = false;

    voiceRecognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      if (!latest || !latest[0]) {
        return;
      }

      const transcript = (latest[0].transcript || "").trim();
      if (!transcript) {
        return;
      }

      appState.voiceHeard = transcript;
      pulseVoiceRecognitionActivity();
      const heardLabel = transcript.length > 26 ? `${transcript.slice(0, 26)}...` : transcript;
      setVoiceCommandStatus(`Heard: ${heardLabel}`, 1000);
      renderCurrentVoiceScreen();

      window.setTimeout(() => {
        handleVoiceCommand(transcript);
      }, 90);
    };

    voiceRecognition.onstart = () => {
      if (!appState.voiceEnabled) {
        return;
      }
      appState.voiceListening = true;
      appState.voiceUserSpeaking = false;
      setVoiceCommandStatus("Listening...", 0);
      renderCurrentVoiceScreen();
    };

    voiceRecognition.onspeechstart = () => {
      if (!appState.voiceEnabled) {
        return;
      }
      setVoiceRecognitionActivity(true);
    };

    voiceRecognition.onspeechend = () => {
      clearVoiceRecognitionActivity();
    };

    voiceRecognition.onend = () => {
      appState.voiceListening = false;
      clearVoiceRecognitionActivity();
      if (appState.voiceEnabled && isGuidanceScreen(appState.currentScreen)) {
        setVoiceCommandStatus("Listening...", 0);
        try {
          voiceRecognition.start();
        } catch {
          // Ignore duplicate start attempts.
        }
      } else {
        setVoiceCommandStatus("", 0);
        renderCurrentVoiceScreen();
      }
    };

    voiceRecognition.onerror = (event) => {
      appState.voiceEnabled = false;
      appState.voiceListening = false;
      resetVoiceActivityState();
      appState.voiceExecuting = false;
      const code = event && event.error ? String(event.error) : "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        appState.voiceErrorMessage = "Microphone permission denied. Enable microphone access and try again.";
      } else if (code === "audio-capture") {
        appState.voiceErrorMessage = "No microphone was found. Connect a microphone and try again.";
      } else {
        appState.voiceErrorMessage = "Voice input is currently unavailable. Please try again.";
      }
      setVoiceHint("Voice unavailable in this browser.", 2500);
      setVoiceCommandStatus("", 0);
      if (appState.currentScreen === "cooking") {
        renderCooking();
      }
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
    };
  }

  appState.voiceListening = false;
  resetVoiceActivityState();
  appState.voiceExecuting = false;
  setVoiceCommandStatus("Listening...", 0);
  try {
    voiceRecognition.start();
  } catch {
    appState.voiceEnabled = false;
    appState.voiceErrorMessage = "Could not start voice input. Check microphone permission and try again.";
    setVoiceCommandStatus("", 0);
  }
  renderCurrentVoiceScreen();
}

function stopVoiceCommands() {
  appState.voiceEnabled = false;
  appState.voiceListening = false;
  resetVoiceActivityState();
  appState.voiceErrorMessage = "";
  appState.voiceExecuting = false;
  appState.voiceHeard = "";
  setVoiceCommandStatus("", 0);
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch {
      // Ignore stop errors when recognition is not active.
    }
  }

  renderCurrentVoiceScreen();
}

function setVoiceEnabled(nextEnabled, options = {}) {
  const { hintMessage = "", hintMs = 0, statusMessage = "", statusMs = 0 } = options;

  if (nextEnabled) {
    startVoiceCommands();
    if (appState.voiceEnabled && hintMessage) {
      setVoiceHint(hintMessage, hintMs || 2200);
    }
    if (appState.voiceEnabled && statusMessage) {
      setVoiceCommandStatus(statusMessage, statusMs || 900);
    }
  } else {
    stopVoiceCommands();
    if (statusMessage) {
      setVoiceCommandStatus(statusMessage, statusMs || 900);
    }
  }

  renderCurrentVoiceScreen();
}

window.kitchenPilotCanSpeak = function kitchenPilotCanSpeak() {
  return Boolean(appState.voiceEnabled && appState.voiceUnlocked);
};

function setVoiceHint(message, timeoutMs = 2500) {
  appState.voiceHintMessage = message;

  if (appState.voiceHintTimeoutId) {
    window.clearTimeout(appState.voiceHintTimeoutId);
  }

  if (!timeoutMs) {
    appState.voiceHintTimeoutId = null;
    return;
  }

  appState.voiceHintTimeoutId = window.setTimeout(() => {
    appState.voiceHintMessage = "";
    appState.voiceHintTimeoutId = null;
    if (appState.currentScreen === "ingredients") {
      renderIngredients();
    }
    if (appState.currentScreen === "cooking") {
      renderCooking();
    }
    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
    }
  }, timeoutMs);
}

function createVoiceIndicatorBar(targetScreen) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "voice-indicator-bar";
  const voiceStateClass = !appState.voiceEnabled ? "voice-off" : isVoiceUiActive() ? "voice-active" : "voice-idle";
  trigger.classList.add(voiceStateClass);
  trigger.setAttribute("aria-label", "Open voice settings");

  const bars = document.createElement("div");
  bars.className = "voice-bars";

  for (let i = 0; i < 5; i += 1) {
    const bar = document.createElement("span");
    bar.className = "voice-bar";
    bars.appendChild(bar);
  }

  trigger.appendChild(bars);
  trigger.addEventListener("click", () => {
    openVoiceSettingsModal(targetScreen);
  });

  return trigger;
}

function openVoiceSettingsModal(targetScreen) {
  const overlay = document.createElement("div");
  overlay.className = "voice-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "voice-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Voice settings");

  const title = document.createElement("h2");
  title.textContent = "Voice Settings";

  const status = document.createElement("p");
  status.className = "voice-modal-copy";
  if (!appState.voiceEnabled) {
    status.textContent = "Voice commands are off.";
  } else if (isVoiceUiActive()) {
    status.textContent = "Voice is active right now.";
  } else {
    status.textContent = "Voice is on and ready.";
  }

  const toggleBtn = createButton(
    appState.voiceEnabled ? "Turn Voice Off" : "Turn Voice On",
    "primary",
    () => {
      overlay.remove();
      setVoiceEnabled(!appState.voiceEnabled, {
        hintMessage: !appState.voiceEnabled
          ? "Voice commands enabled. Say: Next, Repeat, Pause."
          : "Voice commands disabled.",
        hintMs: 2200
      });

      if (targetScreen === "cooking") {
        renderCooking();
      }
      if (targetScreen === "timerActive") {
        renderTimerActive();
      }
      if (targetScreen === "ingredients") {
        renderIngredients();
      }
      if (targetScreen === "preparation") {
        renderPreparation();
      }
    }
  );

  const closeBtn = createButton("Close", "", () => {
    overlay.remove();
    if (targetScreen === "ingredients") {
      renderIngredients();
    }
    if (targetScreen === "preparation") {
      renderPreparation();
    }
    if (targetScreen === "cooking") {
      renderCooking();
    }
    if (targetScreen === "timerActive") {
      renderTimerActive();
    }
  });

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(toggleBtn, closeBtn);

  modal.append(title, status);

  if (appState.voiceErrorMessage) {
    const error = document.createElement("p");
    error.className = "voice-error";
    error.textContent = appState.voiceErrorMessage;
    modal.appendChild(error);
  }

  modal.appendChild(actions);
  overlay.appendChild(modal);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

function createButton(label, className, onClick, actionName) {
  const btn = document.createElement("button");
  btn.textContent = label;
  const classes = className ? className.split(/\s+/).filter(Boolean) : [];
  const hasPrimary = classes.includes("primary");
  const hasDanger = classes.includes("danger");

  classes.push("btn");
  if (hasPrimary) {
    classes.push("btn-primary");
  } else if (hasDanger) {
    classes.push("btn-danger");
  } else {
    classes.push("btn-secondary");
  }

  btn.className = classes.join(" ");
  if (actionName) {
    btn.dataset.action = actionName;
  }
  btn.addEventListener("click", onClick);
  return btn;
}

function createInlineButton(label, className, onClick, actionName) {
  const classes = ["inline-btn", "btn-inline", className || ""].join(" ").trim();
  return createButton(label, classes, onClick, actionName);
}

function createCard() {
  const card = document.createElement("section");
  card.className = "card step-card";
  return card;
}

function getStepListItems(steps, currentIndex) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const allSteps = [];

  for (let i = 0; i < safeSteps.length; i += 1) {
    const step = safeSteps[i] || {};
    const kind = i < currentIndex ? "past" : i > currentIndex ? "next" : "current";
    allSteps.push({
      index: i,
      text: String(step.text || ""),
      hasTimer: Number.isInteger(step.timerSeconds) && step.timerSeconds > 0,
      kind
    });
  }

  return allSteps;
}

function createScrollableStepPanel(steps, currentIndex, options = {}) {
  const {
    panelLabel = "Steps",
    showTimers = false
  } = options;

  const card = createCard();
  card.classList.add("timeline-card", "step-context-card", "step-list-panel");
  card.setAttribute("aria-label", panelLabel);

  const list = document.createElement("ol");
  list.className = "step-timeline";

  const stepItems = getStepListItems(steps, currentIndex);
  stepItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = `timeline-item step-item step-${item.kind} ${item.kind}`;
    li.dataset.stepKind = item.kind;
    li.dataset.stepIndex = String(item.index);

    const textWrap = document.createElement("div");
    textWrap.className = "step-text";

    const stepLabel = document.createElement("p");
    stepLabel.className = "timeline-step-label";
    stepLabel.textContent = `Step ${item.index + 1}`;

    const text = document.createElement("p");
    text.className = "timeline-step-text";
    text.textContent = item.text;

    textWrap.append(stepLabel, text);
    li.appendChild(textWrap);

    if (showTimers && item.hasTimer) {
      const timerIcon = document.createElement("div");
      timerIcon.className = "step-timer-icon";
      timerIcon.setAttribute("aria-hidden", "true");
      timerIcon.innerHTML = '<i class="fa-regular fa-clock"></i>';
      li.appendChild(timerIcon);
    }

    list.appendChild(li);
  });

  card.appendChild(list);

  window.requestAnimationFrame(() => {
    const currentItem = list.querySelector('[data-step-kind="current"]');
    if (currentItem) {
      currentItem.scrollIntoView({ block: "nearest" });
    }
  });

  return card;
}

function clearAndSetScreenTitle(title, subtitle) {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen";

  const h1 = document.createElement("h1");
  h1.textContent = title;
  screen.appendChild(h1);

  if (subtitle) {
    const p = document.createElement("p");
    p.className = "subtitle";
    p.textContent = subtitle;
    screen.appendChild(p);
  }

  appEl.appendChild(screen);
  return screen;
}

function createPageShell(screenClassName = "") {
  appEl.innerHTML = "";

  const page = document.createElement("div");
  page.className = ["screen", "page-shell", screenClassName].filter(Boolean).join(" ");

  const header = document.createElement("div");
  header.className = "page-header";

  const content = document.createElement("div");
  content.className = "page-content";

  const footer = document.createElement("div");
  footer.className = "action-bar";

  page.append(header, content, footer);
  appEl.appendChild(page);

  return { page, header, content, footer };
}

function createTitledPage(title, subtitle, screenClassName = "") {
  const shell = createPageShell(screenClassName);

  const h1 = document.createElement("h1");
  h1.textContent = title;
  shell.header.appendChild(h1);

  if (subtitle) {
    const p = document.createElement("p");
    p.className = "subtitle";
    p.textContent = subtitle;
    shell.header.appendChild(p);
  }

  return shell;
}

function createRecipeIcon(assetPath, label = "") {
  const recipeIcon = document.createElement("div");
  recipeIcon.className = "recipe-icon";
  recipeIcon.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.src = assetPath;
  image.alt = label;
  image.loading = "eager";
  image.decoding = "async";

  recipeIcon.appendChild(image);
  return recipeIcon;
}

function renderHome() {
  const screen = clearAndSetScreenTitle("KitchenPilot", "Hands-free cooking guide");
  screen.classList.add("home-screen");
  let isAnalyzing = false;
  let currentAnalysisController = null;
  let loadingOverlay = null;
  const devModeEnabled = getDevModeEnabled();

  const homeMain = document.createElement("div");
  homeMain.className = "home-main";

  const card = createCard();
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Recipe URL";
  urlLabel.setAttribute("for", "recipeUrl");

  const urlInput = document.createElement("input");
  urlInput.id = "recipeUrl";
  urlInput.placeholder = "Paste a recipe link";
  urlInput.type = "url";
  urlInput.value = appState.homeRecipeUrl || "";

  const textLabel = document.createElement("label");
  textLabel.textContent = "Recipe Text";
  textLabel.setAttribute("for", "recipeText");

  const textInput = document.createElement("textarea");
  textInput.id = "recipeText";
  textInput.placeholder = "Paste your recipe text here";
  textInput.value = appState.homeRecipeText || "";
  textInput.hidden = !appState.homeTextInputVisible;

  const textToggle = document.createElement("button");
  textToggle.type = "button";
  textToggle.className = "text-toggle-link";
  textToggle.textContent = "Paste recipe text instead";

  function syncTextInputVisibility() {
    textInput.hidden = !appState.homeTextInputVisible;
    textLabel.hidden = !appState.homeTextInputVisible;
    textToggle.textContent = appState.homeTextInputVisible ? "Hide recipe text input" : "Paste recipe text instead";
  }

  textToggle.addEventListener("click", () => {
    appState.homeTextInputVisible = !appState.homeTextInputVisible;
    syncTextInputVisibility();
  });

  const validation = document.createElement("p");
  validation.className = "form-error";
  validation.hidden = !appState.homeValidationMessage;
  validation.textContent = appState.homeValidationMessage || "";

  textLabel.hidden = !appState.homeTextInputVisible;
  card.append(urlLabel, urlInput, textLabel, textInput, validation);
  homeMain.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row";

  function hideLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.remove();
      loadingOverlay = null;
    }
  }

  function resetAnalysisUi() {
    isAnalyzing = false;
    currentAnalysisController = null;
    startBtn.disabled = false;
    startBtn.textContent = "Start Cooking";
    hideLoadingOverlay();
  }

  function showLoadingOverlay() {
    hideLoadingOverlay();

    loadingOverlay = document.createElement("div");
    loadingOverlay.className = "loading-overlay";

    const panel = document.createElement("div");
    panel.className = "loading-overlay-card";

    const spinner = document.createElement("div");
    spinner.className = "loading-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const title = document.createElement("p");
    title.className = "loading-title";
    title.textContent = "Analyse de la recette...";

    const subtitle = document.createElement("p");
    subtitle.className = "loading-subtitle";
    subtitle.textContent = "Cela peut prendre quelques secondes.";

    const cancelBtn = createButton("Annuler", "", () => {
      if (currentAnalysisController) {
        currentAnalysisController.abort();
      }
      resetAnalysisUi();
    });
    cancelBtn.classList.add("loading-cancel-btn");

    panel.append(spinner, title, subtitle, cancelBtn);
    loadingOverlay.appendChild(panel);
    screen.appendChild(loadingOverlay);
  }

  const startBtn = createButton("Start Cooking", "primary", async () => {
    if (isAnalyzing) {
      return;
    }

    appState.homeRecipeUrl = urlInput.value;
    appState.homeRecipeText = textInput.value;
    const recipeUrl = urlInput.value.trim();
    const recipeText = textInput.value.trim();
    const parseInput = recipeText || recipeUrl;

    if (!parseInput) {
      appState.homeValidationMessage = "Please paste a recipe URL or recipe text before continuing.";
      validation.textContent = appState.homeValidationMessage;
      validation.hidden = false;
      return;
    }

    appState.homeValidationMessage = "";
    validation.hidden = true;
    validation.textContent = "";

    isAnalyzing = true;
    startBtn.disabled = true;
    startBtn.textContent = "Analysing...";
    currentAnalysisController = typeof AbortController !== "undefined" ? new AbortController() : null;
    showLoadingOverlay();

    try {
      const parsedRecipe = await parseRecipeText(parseInput, {
        signal: currentAnalysisController ? currentAnalysisController.signal : undefined
      });
      const recipe = normalizeRecipeForGuidance(parsedRecipe);

      appState.recipe = recipe;
      initializeIngredientChecklist(recipe);
      appState.preparationIndex = 0;
      appState.cookingIndex = 0;
      appState.timerSkippedStepIndex = null;
      resetAnalysisUi();
      setScreen("analysis");
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }

      console.error("Recipe parsing failed:", error);
      const message = error && error.message ? error.message : "Could not parse recipe. Please try again.";
      appState.homeValidationMessage = message;
      validation.textContent = message;
      validation.hidden = false;
      resetAnalysisUi();
    }
  });

  actions.append(startBtn);
  homeMain.append(actions, textToggle);

  if (devModeEnabled) {
    const devToolsCard = createCard();
    devToolsCard.classList.add("dev-tools-card");

    const devToolsTitle = document.createElement("h2");
    devToolsTitle.textContent = "Dev Tools";

    const buildLabel = document.createElement("p");
    buildLabel.className = "small";
    buildLabel.textContent = BUILD_VERSION;

    const exampleActions = document.createElement("div");
    exampleActions.className = "button-row";

    const loadExampleUrlBtn = createButton("Load example URL", "", () => {
      appState.homeRecipeUrl = EXAMPLE_RECIPE_URL;
      appState.homeRecipeText = "";
      urlInput.value = appState.homeRecipeUrl;
      textInput.value = appState.homeRecipeText;
      clearValidation();
    });

    const loadExampleTextBtn = createButton(EXAMPLE_RECIPE_BUTTON_LABEL, "", () => {
      appState.homeTextInputVisible = true;
      syncTextInputVisibility();
      appState.homeRecipeText = EXAMPLE_RECIPE_TEXT;
      appState.homeRecipeUrl = "";
      textInput.value = appState.homeRecipeText;
      urlInput.value = appState.homeRecipeUrl;
      clearValidation();
    });

    exampleActions.append(loadExampleUrlBtn, loadExampleTextBtn);

    const devActions = document.createElement("div");
    devActions.className = "button-row";

    const devResetBtn = createButton("Reset Voice Onboarding", "inline-btn", () => {
      resetVoiceOnboardingSeen();
    });
    devResetBtn.classList.add("homepage-reset-btn");

    const forceOnboardingBtn = createButton("Force Show Voice Onboarding", "inline-btn", () => {
      showVoiceOnboardingOverlay();
    });
    forceOnboardingBtn.classList.add("homepage-reset-btn");

    devActions.append(devResetBtn, forceOnboardingBtn);
    devToolsCard.append(devToolsTitle, buildLabel, exampleActions, devActions);
    homeMain.appendChild(devToolsCard);
  }

  screen.appendChild(homeMain);

  const devModeRow = document.createElement("div");
  devModeRow.className = "dev-mode-row";

  const devModeLabel = document.createElement("p");
  devModeLabel.className = "small dev-mode-label";
  devModeLabel.textContent = "Dev Mode";

  const devModeSwitch = document.createElement("label");
  devModeSwitch.className = "mic-switch";
  devModeSwitch.setAttribute("aria-label", "Toggle Dev Mode");

  const devModeInput = document.createElement("input");
  devModeInput.type = "checkbox";
  devModeInput.checked = devModeEnabled;
  devModeInput.addEventListener("change", () => {
    setDevModeEnabled(devModeInput.checked);
    renderHome();
  });

  const devModeSlider = document.createElement("span");
  devModeSlider.className = "slider";
  devModeSwitch.append(devModeInput, devModeSlider);
  devModeRow.append(devModeLabel, devModeSwitch);
  screen.appendChild(devModeRow);

  const clearValidation = () => {
    if (validation.hidden) {
      return;
    }
    if (urlInput.value.trim() || textInput.value.trim()) {
      appState.homeValidationMessage = "";
      validation.hidden = true;
      validation.textContent = "";
    }
  };

  urlInput.addEventListener("input", () => {
    appState.homeRecipeUrl = urlInput.value;
    clearValidation();
  });
  textInput.addEventListener("input", () => {
    appState.homeRecipeText = textInput.value;
    clearValidation();
  });
  syncTextInputVisibility();
}

function renderAnalysis() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const { content, footer } = createTitledPage("Recipe Analysis", "Review parsed steps before cooking", "review-screen");

  const summaryCard = createCard();
  const recipeTitle = document.createElement("h2");
  recipeTitle.textContent = appState.recipe.title;

  const summaryList = document.createElement("ul");
  summaryList.className = "list";

  const ingredientCount = document.createElement("li");
  ingredientCount.textContent = `${appState.recipe.ingredients.length} ingredients`;

  const prepCount = document.createElement("li");
  prepCount.textContent = `${appState.recipe.preparationSteps.length} preparation steps`;

  const cookingCount = document.createElement("li");
  cookingCount.textContent = `${appState.recipe.cookingSteps.length} cooking steps`;

  summaryList.append(ingredientCount, prepCount, cookingCount);
  summaryCard.append(recipeTitle, summaryList);
  content.appendChild(summaryCard);

  const actions = document.createElement("div");
  actions.className = "button-row analysis-actions";
  actions.append(
    createButton("Start Guided Cooking", "primary", () => {
      maybeShowVoiceOnboarding(() => setScreen("ingredientsIntro"));
    }),
    createButton("Back to Home", "", () => setScreen("home"))
  );

  footer.appendChild(actions);
}

function renderStageIntro(title, description, backScreen, continueScreen, continueLabel, helperNote, stageLabelText = "") {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const main = document.createElement("div");
  main.className = "stage-screen__main";

  const footer = document.createElement("div");
  footer.className = "stage-screen__footer";

  const titleEl = document.createElement("h1");
  titleEl.className = "stage-title";
  titleEl.textContent = title;

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = stageLabelText || "";

  const recipeIcon = createRecipeIcon(INGREDIENT_STAGE_ICON, "");

  const descriptionEl = document.createElement("p");
  descriptionEl.className = "stage-description";
  descriptionEl.textContent = description;

  header.append(titleEl, stageLabel);
  main.append(recipeIcon, descriptionEl);

  if (helperNote) {
    const note = document.createElement("p");
    note.className = "small stage-description";
    note.textContent = helperNote;
    main.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => setScreen(backScreen), "back"),
    createButton(continueLabel || "Continue", "primary primary-action", () => setScreen(continueScreen), "next")
  );

  footer.appendChild(actions);
  screen.append(header, main, footer);
  appEl.appendChild(screen);
}

function renderIngredientsIntro() {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const main = document.createElement("div");
  main.className = "stage-screen__main";

  const footer = document.createElement("div");
  footer.className = "stage-screen__footer";

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Ingredient Check";

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = "STAGE 1";

  const recipeIcon = createRecipeIcon(INGREDIENT_STAGE_ICON, "");

  const description = document.createElement("p");
  description.className = "stage-description";
  description.textContent = "Confirm that all ingredients are ready before you start.";

  header.append(title, stageLabel);
  main.append(recipeIcon, description);
  main.appendChild(createCompactVoiceStrip({
    hintMessage: "Voice enabled. You can say: Check garlic, check onions.",
    hintMs: 2200,
    showListeningText: false,
    animateListening: false,
    showUnlockButton: true,
    unlockLabel: "Unlock Voice",
    readyLabel: "Voice ready"
  }));
  appendVoiceError(main);

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => setScreen("analysis"), "back"),
    createButton("Continue", "primary primary-action", () => setScreen("ingredients"), "next")
  );

  footer.appendChild(actions);
  screen.append(header, main, footer);
  appEl.appendChild(screen);
}

function renderPreparationIntro() {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const main = document.createElement("div");
  main.className = "stage-screen__main";

  const footer = document.createElement("div");
  footer.className = "stage-screen__footer";

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Preparation";

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = "STAGE 2";

  const recipeIcon = createRecipeIcon(INGREDIENT_STAGE_ICON, "");

  const description = document.createElement("p");
  description.className = "stage-description";
  description.textContent = "Complete quick prep tasks before active cooking starts.";

  header.append(title, stageLabel);
  main.append(recipeIcon, description);
  main.appendChild(createVoiceActivationCard("Voice enabled. You can say: Next, Repeat, Back."));

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => setScreen("ingredients"), "back"),
    createButton("Continue", "primary primary-action", () => startPreparationFlow(), "next")
  );

  footer.appendChild(actions);
  screen.append(header, main, footer);
  appEl.appendChild(screen);
}

function renderCookingIntro() {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const main = document.createElement("div");
  main.className = "stage-screen__main";

  const footer = document.createElement("div");
  footer.className = "stage-screen__footer";

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Cooking Mode";

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = "STAGE 3";

  const recipeIcon = createRecipeIcon(COOKING_STAGE_ICON, "");

  header.append(title, stageLabel);
  main.append(recipeIcon);
  main.appendChild(createVoiceActivationCard("Voice enabled. You can say: Next, Repeat, Pause."));

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => openPreparationIntro(), "back"),
    createButton("Start Cooking", "primary primary-action", () => setScreen("cooking"), "next")
  );

  footer.appendChild(actions);
  screen.append(header, main, footer);
  appEl.appendChild(screen);
}

function renderIngredients() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  if (!Array.isArray(appState.ingredientChecks) || appState.ingredientChecks.length !== appState.recipe.ingredients.length) {
    initializeIngredientChecklist(appState.recipe);
  }

  const { content, footer } = createTitledPage("Ingredient Check", "Verify ingredients before you begin");
  content.appendChild(createVoiceIndicatorBar("ingredients"));
  appendVoiceError(content);

  const card = createCard();
  const list = document.createElement("ul");
  list.className = "list ingredient-checklist";

  appState.recipe.ingredients.forEach((ingredient, index) => {
    const li = document.createElement("li");
    li.className = "ingredient-item";
    if (appState.voiceIngredientHighlightIndex === index) {
      li.classList.add("voice-matched");
    }

    const label = document.createElement("label");
    label.className = "ingredient-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(appState.ingredientChecks[index]);
    checkbox.setAttribute("aria-label", ingredient);
    checkbox.addEventListener("change", () => {
      setIngredientChecked(index, checkbox.checked);
      renderIngredients();
    });

    const text = document.createElement("span");
    text.className = "ingredient-text";
    text.textContent = ingredient;

    if (appState.ingredientChecks[index]) {
      li.classList.add("checked");
    }

    label.append(checkbox, text);
    li.appendChild(label);
    list.appendChild(li);
  });

  const status = document.createElement("p");
  status.className = `notice ingredient-status ${areAllIngredientsReady() ? "ingredients-ready" : "ingredients-missing"}`;
  status.textContent = areAllIngredientsReady() ? "All ingredients ready" : "You are missing ingredients";

  const markAllBtn = createButton("Mark all as ready", "", () => {
    appState.ingredientChecks = appState.recipe.ingredients.map(() => true);
    renderIngredients();
  });

  card.append(list, status, markAllBtn);
  content.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row two";
  actions.append(
    createButton("Back", "", () => setScreen("ingredientsIntro")),
    createButton("Ready", "primary", () => setScreen("preparationIntro"))
  );
  footer.appendChild(actions);
}

function renderPreparation() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const total = appState.recipe.preparationSteps.length;

  if (total === 0) {
    setScreen("cookingIntro");
    return;
  }

  const idx = appState.preparationIndex;
  const currentText = appState.recipe.preparationSteps[idx];

  const { content, footer } = createTitledPage("Preparation", `Preparation ${idx + 1} of ${total}`, "page-shell--guided preparation-screen");
  content.appendChild(createVoiceIndicatorBar("preparation"));
  appendVoiceError(content);
  content.appendChild(createScrollableStepPanel(
    appState.recipe.preparationSteps.map((stepText) => ({ text: stepText })),
    idx,
    { panelLabel: "Preparation steps" }
  ));

  if (appState.lastSpokenPreparationIndex !== idx) {
    appState.lastSpokenPreparationIndex = idx;
    speak(currentText);
  }

  const primaryRow = document.createElement("div");
  primaryRow.className = "action-row cooking-actions primary-actions";
  primaryRow.append(
    createButton("Repeat", "primary btn-next", () => speak(currentText), "repeat"),
    createButton("Next", "primary btn-next", () => {
      advancePreparationStep();
    }, "next")
  );

  const secondaryRow = document.createElement("div");
  secondaryRow.className = "action-row secondary-actions";
  secondaryRow.append(
    createButton("Back", "ghost-action", () => {
      if (appState.preparationIndex > 0) {
        appState.preparationIndex -= 1;
        renderPreparation();
      } else {
        openPreparationIntro();
      }
    }, "back")
  );

  footer.append(primaryRow, secondaryRow);
}

function startStepTimerIfNeeded(step) {
  if (!step || !step.timerSeconds) {
    appState.activeTimerSeconds = null;
    appState.timerMessage = "";
    appState.timerPaused = false;
    setTimerStatus("idle", "step has no timer");
    return;
  }

  appState.timerMessage = "Timer running";
  appState.timerPaused = false;
  setTimerStatus("running", "auto start step timer");
  console.log("[timer-state] Starting timer for step", appState.cookingIndex + 1, "seconds:", step.timerSeconds);

  startTimer(
    step.timerSeconds,
    (secondsLeft) => {
      appState.activeTimerSeconds = secondsLeft;
      const timerDisplay = document.getElementById("timerDisplay");
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(secondsLeft);
      }
    },
    () => {
      appState.activeTimerSeconds = 0;
      appState.timerMessage = "Timer finished";
      appState.timerPaused = false;
      setTimerStatus("completed", "timer done callback");
      const timerNotice = document.getElementById("timerNotice");
      if (timerNotice) {
        timerNotice.textContent = "Timer finished";
      }
      const timerDisplay = document.getElementById("timerDisplay");
      if (timerDisplay) {
        timerDisplay.textContent = "00:00";
      }
      playTimerDoneFeedback();

      if (appState.currentScreen === "cooking") {
        renderCooking();
      }
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
    }
  );
}

function ensureCurrentStepTimerStarted() {
  const step = getCurrentCookingStep();
  const hasTimer = step && Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;
  const timerState = getTimerState();

  if (!hasTimer) {
    return;
  }

  const timerWasSkipped = appState.timerSkippedStepIndex === appState.cookingIndex;
  if (timerWasSkipped || appState.timerStatus === "skipped" || appState.timerStatus === "completed") {
    return;
  }

  if (!timerState.isRunning && appState.activeTimerSeconds === null) {
    startStepTimerIfNeeded(step);
  }
}

function renderCooking() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const total = appState.recipe.cookingSteps.length;

  if (total === 0) {
    setScreen("completed");
    return;
  }

  const idx = appState.cookingIndex;
  const step = appState.recipe.cookingSteps[idx];
  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;

  const { page, header, content, footer } = createPageShell("cooking-screen cooking-container page-shell--guided");

  const top = document.createElement("section");
  top.className = "cooking-top";

  const recipeName = document.createElement("p");
  recipeName.className = "meta recipe-name";
  recipeName.textContent = appState.recipe.title;

  const stepMeta = document.createElement("p");
  stepMeta.className = "meta step-indicator";
  stepMeta.textContent = `Step ${idx + 1} / ${total}`;

  top.append(recipeName, stepMeta);
  header.appendChild(top);

  content.appendChild(createVoiceIndicatorBar("cooking"));
  appendVoiceError(content);

  if (hasTimer) {
    ensureCurrentStepTimerStarted();
  }

  if (hasTimer) {
    const timerCard = document.createElement("section");
    timerCard.className = "timer-panel";
    if (appState.timerStatus === "paused") {
      timerCard.classList.add("timer-paused");
    } else {
      timerCard.classList.add("timer-running");
    }

    const timerIcon = document.createElement("i");
    timerIcon.className = "fa-solid fa-stopwatch timer-icon";
    timerIcon.setAttribute("aria-hidden", "true");

    const timerDisplay = document.createElement("span");
    timerDisplay.className = "timer-display";
    timerDisplay.id = "timerDisplay";
    timerDisplay.textContent = formatTime(appState.activeTimerSeconds ?? step.timerSeconds);

    const timerText = document.createElement("div");
    timerText.className = "timer-text";
    timerText.appendChild(timerDisplay);

    if (appState.timerStatus === "paused") {
      const pausedLabel = document.createElement("p");
      pausedLabel.className = "timer-substatus";
      pausedLabel.textContent = "En pause";
      timerText.appendChild(pausedLabel);
    }

    timerCard.append(timerIcon, timerText);

    content.appendChild(timerCard);
  }

  content.appendChild(createScrollableStepPanel(
    appState.recipe.cookingSteps,
    idx,
    { panelLabel: "Cooking steps", showTimers: true }
  ));

  if (!hasTimer) {
    stopTimer();
    appState.activeTimerSeconds = null;
    setTimerStatus("idle", "render cooking untimed step");
    if (appState.timerMessage === "Timer paused" || appState.timerMessage === "Timer running") {
      appState.timerMessage = "";
    }
    appState.timerPaused = false;
  }

  if (appState.lastSpokenCookingIndex !== idx) {
    speak(step.text);
    appState.lastSpokenCookingIndex = idx;
  }

  const timerInteractionActive = hasTimer && (appState.timerStatus === "running" || appState.timerStatus === "paused");

  const primaryRow = document.createElement("div");
  primaryRow.className = "action-row cooking-actions primary-actions";

  if (timerInteractionActive) {
    primaryRow.append(
      createButton(appState.timerPaused ? "Resume Timer" : "Pause Timer", "primary btn-next", () => {
        toggleGuidancePause();
        renderCooking();
      }, "pause"),
      createButton("Skip Timer", "", () => {
        skipTimerAndAdvance();
      }, "skip-timer")
    );
  } else {
    primaryRow.append(
      createButton("Repeat", "primary btn-next", () => repeatCurrentCookingStep(), "repeat"),
      createButton("Next", "primary btn-next", () => goToNextCookingStep(), "next")
    );
  }

  const secondaryRow = document.createElement("div");
  secondaryRow.className = "action-row secondary-actions";
  const backBtn = createButton("Back", "ghost-action", () => goToPreviousCookingStep(), "back");
  backBtn.disabled = idx === 0;
  secondaryRow.append(
    backBtn,
    createButton("Quit", "ghost-action", () => stopCookingFlow(true), "stop")
  );

  footer.append(primaryRow, secondaryRow);
}

function renderTimerActive() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const total = appState.recipe.cookingSteps.length;
  const idx = appState.cookingIndex;
  const step = getCurrentCookingStep();

  if (!step) {
    setScreen("completed");
    return;
  }

  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;
  if (!hasTimer) {
    setScreen("cooking");
    return;
  }

  const { header, content, footer } = createPageShell("cooking-screen cooking-container page-shell--guided");

  const top = document.createElement("section");
  top.className = "cooking-top";

  const recipeName = document.createElement("p");
  recipeName.className = "meta recipe-name";
  recipeName.textContent = appState.recipe.title;

  const stepMeta = document.createElement("p");
  stepMeta.className = "meta step-indicator";
  stepMeta.textContent = `Step ${idx + 1} / ${total}`;

  top.append(recipeName, stepMeta);
  header.appendChild(top);

  const timerCard = document.createElement("section");
  timerCard.className = "timer-panel";
  if (appState.timerStatus === "paused") {
    timerCard.classList.add("timer-paused");
  } else {
    timerCard.classList.add("timer-running");
  }

  const timerIcon = document.createElement("i");
  timerIcon.className = "fa-solid fa-stopwatch timer-icon";
  timerIcon.setAttribute("aria-hidden", "true");

  const timerDisplay = document.createElement("span");
  timerDisplay.className = "timer-display";
  timerDisplay.id = "timerDisplay";
  timerDisplay.textContent = formatTime(appState.activeTimerSeconds ?? step.timerSeconds);

  const timerText = document.createElement("div");
  timerText.className = "timer-text";
  timerText.appendChild(timerDisplay);

  if (appState.timerStatus === "paused") {
    const pausedLabel = document.createElement("p");
    pausedLabel.className = "timer-substatus";
    pausedLabel.textContent = "En pause";
    timerText.appendChild(pausedLabel);
  }

  timerCard.append(timerIcon, timerText);
  content.appendChild(timerCard);

  content.appendChild(createScrollableStepPanel(
    appState.recipe.cookingSteps,
    idx,
    { panelLabel: "Cooking steps", showTimers: true }
  ));

  content.appendChild(createVoiceIndicatorBar("timerActive"));
  appendVoiceError(content);

  if (appState.lastSpokenCookingIndex !== idx) {
    speak(step.text);
    appState.lastSpokenCookingIndex = idx;
  }

  ensureCurrentStepTimerStarted();

  const timerInteractionActive = appState.timerStatus === "running" || appState.timerStatus === "paused";

  const primaryRow = document.createElement("div");
  primaryRow.className = "action-row cooking-actions primary-actions";

  if (timerInteractionActive) {
    primaryRow.append(
      createButton(appState.timerPaused ? "Resume Timer" : "Pause Timer", "primary btn-next", () => {
        toggleGuidancePause();
        renderTimerActive();
      }, "pause"),
      createButton("Skip Timer", "", () => {
        skipTimerAndAdvance();
      }, "skip-timer")
    );
  } else {
    primaryRow.append(
      createButton("Repeat", "primary btn-next", () => repeatCurrentCookingStep(), "repeat"),
      createButton("Next", "primary btn-next", () => goToNextCookingStep(), "next")
    );
  }

  const secondaryRow = document.createElement("div");
  secondaryRow.className = "action-row secondary-actions";
  const backBtn = createButton("Back", "ghost-action", () => goToPreviousCookingStep(), "back");
  backBtn.disabled = idx === 0;
  secondaryRow.append(
    backBtn,
    createButton("Quit", "ghost-action", () => stopCookingFlow(true), "stop")
  );

  footer.append(primaryRow, secondaryRow);
}

function renderCompleted() {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen completed-screen";

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Recipe Completed";
  header.appendChild(title);

  const main = document.createElement("div");
  main.className = "stage-screen__main completed-screen__main";

  const recipeIcon = createRecipeIcon(COOKING_STAGE_ICON, "");

  const message = document.createElement("p");
  message.className = "stage-description completed-message";
  message.textContent = "Your dish is ready to serve";

  const subtext = document.createElement("p");
  subtext.className = "small completed-subtext";
  subtext.textContent = "Nice work in the kitchen.";

  main.append(recipeIcon, message, subtext);

  const footer = document.createElement("div");
  footer.className = "stage-screen__footer completed-screen__footer";

  const actions = document.createElement("div");
  actions.className = "button-row completed-actions";
  actions.append(
    createButton("Cook Again", "primary", () => {
      appState.preparationIndex = 0;
      appState.cookingIndex = 0;
      appState.timerSkippedStepIndex = null;
      initializeIngredientChecklist(appState.recipe);
      setScreen("ingredientsIntro");
    }),
    createButton("Save Recipe", "", () => {
      alert("Save feature placeholder: recipe would be saved here.");
    }),
    createButton("Return Home", "ghost-action", () => {
      appState.recipe = null;
      setScreen("home");
    })
  );
  footer.appendChild(actions);
  screen.append(header, main, footer);
  appEl.appendChild(screen);
}

window.addEventListener("keydown", (event) => {
  if (!isGuidanceScreen(appState.currentScreen) || !appState.recipe) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "arrowright" || key === "n") {
    if (appState.currentScreen === "timerActive" && !canProceedFromTimerStep()) {
      return;
    }
    goToNextCookingStep();
  }

  if (key === "arrowleft" || key === "p") {
    goToPreviousCookingStep();
  }

  if (key === "r") {
    repeatCurrentCookingStep();
  }

  if (key === " ") {
    event.preventDefault();
    toggleGuidancePause();
  }
});

window.addEventListener("kitchenpilot:voice-speech-start", () => {
  setVoiceOutputSpeaking(true);
});

window.addEventListener("kitchenpilot:voice-speech-end", () => {
  setVoiceOutputSpeaking(false);
});

setScreen("home");
