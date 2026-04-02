const appState = {
  currentScreen: "onboarding",
  recipe: null,
  homeActiveEntry: null,
  homeRecipeUrl: "",
  homeRecipeText: "",
  homeScreenshotText: "",
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
  voiceRecognitionSessionId: 0,
  voiceUserSpeaking: false,
  voiceOutputSpeaking: false,
  voiceErrorMessage: "",
  voiceHeard: "",
  voiceExecuting: false,
  voiceCommandStatus: "",
  voiceCommandStatusTimeoutId: null,
  voiceLastTranscript: "",
  voiceLastTranscriptAt: 0,
  voiceLastMatchedCommand: "",
  voiceLastAction: "",
  voiceLastAcceptedCommandAt: 0,
  voiceLastAcceptedCommandScreen: "",
  voiceLastAcceptedCommandTranscript: "",
  voiceScreenEnteredAt: 0,
  voiceLastRecognitionStartAt: 0,
  voiceLastRecognitionEndAt: 0,
  voiceLastRecognitionRestartRequestAt: 0,
  voiceLastAppSpeechStartAt: 0,
  voiceLastAppSpeechEndAt: 0,
  voiceIntroAcceptCommandsAt: 0,
  pendingIntroAdvance: null,
  voicePreparationStepEnteredAt: 0,
  voicePreparationAcceptCommandsAt: 0,
  voiceCommandLockUntil: 0,
  voiceCommandLockReason: "",
  voiceDebugEvents: [],
  cookingVoiceConsumedSessionId: 0,
  cookingVoiceConsumedCommandKey: "",
  cookingVoiceConsumedTranscript: "",
  cookingVoiceReadyAfterTimerPending: false,
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

function ensureTimerOverlay() {
  let overlay = document.getElementById("timer-overlay");
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = "timer-overlay";
  overlay.className = "timer-overlay hidden";

  const panel = document.createElement("div");
  panel.className = "timer-panel";

  const display = document.createElement("div");
  display.className = "timer-display";
  display.innerHTML = '⏱ <span id="timer-value">00:00</span>';

  const actions = document.createElement("div");
  actions.className = "timer-actions";

  const pauseBtn = document.createElement("button");
  pauseBtn.id = "timer-pause-btn";
  pauseBtn.className = "btn btn-secondary";
  pauseBtn.type = "button";
  pauseBtn.textContent = "Pause";
  pauseBtn.addEventListener("click", () => {
    toggleGuidancePause();
    if (appState.currentScreen === "cooking") {
      renderCooking();
      return;
    }
    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
      return;
    }
    updateTimerOverlay();
  });

  const skipBtn = document.createElement("button");
  skipBtn.id = "timer-skip-btn";
  skipBtn.className = "btn btn-primary primary";
  skipBtn.type = "button";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", () => {
    skipTimerAndAdvance();
    updateTimerOverlay();
  });

  actions.append(pauseBtn, skipBtn);
  panel.append(display, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  return overlay;
}

function updateTimerOverlay() {
  const overlay = ensureTimerOverlay();
  const timerValue = document.getElementById("timer-value");
  const pauseBtn = document.getElementById("timer-pause-btn");
  const timerIsActive = Boolean(
    Number.isFinite(appState.activeTimerSeconds) &&
    appState.activeTimerSeconds >= 0 &&
    (appState.timerStatus === "running" || appState.timerStatus === "paused")
  );

  if (!timerIsActive) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    return;
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  if (timerValue) {
    timerValue.textContent = formatTime(appState.activeTimerSeconds);
  }

  if (pauseBtn) {
    pauseBtn.textContent = appState.timerPaused ? "Resume" : "Pause";
  }
}

const VOICE_SYSTEM_ENABLED = false;
const MINIMAL_VOICE_PHASE1_ENABLED = true;
const SpeechRecognition = VOICE_SYSTEM_ENABLED
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
const MinimalSpeechRecognition = MINIMAL_VOICE_PHASE1_ENABLED
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
let voiceRecognition = null;
let minimalVoiceRecognition = null;
let onboardingDemoIntervalId = null;
let lastVoiceSpeechEndAt = null;
let lastVoiceHandledCommand = {
  key: "",
  transcript: "",
  at: 0
};

const ONBOARDING_DEMO_STATES = [
  "Screenshot imported ✓",
  "Ingredients ready",
  "Step 1: Chop the onions",
  "Say 'Next' to continue"
];

function clearOnboardingDemoLoop() {
  if (onboardingDemoIntervalId) {
    window.clearInterval(onboardingDemoIntervalId);
    onboardingDemoIntervalId = null;
  }
}

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
const BUILD_VERSION = "DEV BUILD: v99"; 
const DEV_MODE_STORAGE_KEY = "devModeEnabled";
const INGREDIENT_STAGE_ICON = "assets/img/pizza-slice.svg";
const COOKING_STAGE_ICON = "assets/img/icon-kitchenpilot.svg";
const timerDoneAudio = typeof Audio !== "undefined" ? new Audio("assets/timer-done.wav") : null;
const VOICE_ONBOARDING_STORAGE_KEY = "voiceOnboardingSeen";
const LONG_TIMER_THRESHOLD_SECONDS = 10 * 60;
const PREP_TRANSFORM_KEYWORDS = [
  "chopped", "diced", "sliced", "grated", "minced", "crushed", "peeled", "trimmed",
  "whisked", "rolled", "beaten", "halved", "quartered", "cubed", "shredded", "drained",
  "rinsed", "torn", "cut", "softened"
];
const PREP_ACTION_KEYWORDS = [
  "chop", "dice", "slice", "grate", "mince", "crush", "peel", "trim", "whisk", "roll",
  "beat", "tie", "tuck", "stuff", "season", "scatter", "drain", "cube", "cut", "line",
  "prick", "gather", "slacken", "mix", "prepare", "pat dry", "remove giblets"
];
const COOKING_KEYWORDS = [
  "preheat", "heat", "cook", "roast", "bake", "fry", "boil", "simmer", "saute", "sautee",
  "oven", "stovetop", "gas", "fan", "degrees", "temperature", "bring to the boil",
  "bring to a boil", "gentle boil", "reduce heat", "lower the oven", "lower heat",
  "until tender", "until golden", "until set", "minutes", "minute", "hours", "hour"
];
// Temporary debug isolation: intro screens are click-only so we can determine
// whether unwanted intro auto-advances are coming from voice handling or from
// non-voice intro logic.
const INTRO_SCREENS_CLICK_ONLY_DEBUG = true;
const RECIPE_FLOW_PROTOTYPE_EXAMPLES = [
  {
    title: "Ina Garten's Perfect Roast Chicken",
    sourceUrl: "https://cooking.nytimes.com/recipes/1026751-ina-gartens-perfect-roast-chicken",
    ingredients: [
      "1 roasting chicken",
      "Kosher salt",
      "Freshly ground black pepper",
      "1 large bunch fresh thyme",
      "1 lemon, halved",
      "1 head garlic, cut in half crosswise",
      "2 tablespoons butter, melted",
      "1 large yellow onion, thickly sliced",
      "4 carrots, cut into 2-inch chunks",
      "1 bulb fennel, tops removed and cut into wedges",
      "Olive oil"
    ],
    preparationSteps: [],
    cookingSteps: [
      { text: "Preheat the oven to 425 degrees F." },
      { text: "Remove the chicken giblets and pat the chicken dry. Season the chicken inside and out. Stuff the cavity with thyme, lemon, and garlic. Brush the outside with melted butter. Tie the legs together and tuck the wing tips under. Place the onions, carrots, and fennel in a roasting pan, toss with thyme and olive oil, and place the chicken on top." },
      { text: "Roast the chicken for 1 1/2 hours, or until the juices run clear.", timerSeconds: 90 * 60 },
      { text: "Let the chicken rest for about 20 minutes before slicing and serving with the vegetables.", timerSeconds: 20 * 60 }
    ]
  },
  {
    title: "Ultimate Quiche Lorraine",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/ultimate-quiche-lorraine",
    ingredients: [
      "175g plain flour",
      "100g cold butter, cut into pieces",
      "1 egg yolk",
      "200g lardons",
      "50g gruyere, divided between small dice and finely grated cheese",
      "200ml creme fraiche",
      "200ml double cream",
      "3 eggs, well beaten",
      "Ground nutmeg"
    ],
    preparationSteps: [],
    cookingSteps: [
      { text: "For the pastry, put the flour, butter, egg yolk, and cold water into a food processor and process until the mix binds." },
      { text: "Tip the pastry onto a lightly floured surface, gather into a smooth ball, then roll out as thinly as you can." },
      { text: "Line a loose-bottomed flan tin with the pastry and trim the edges. Press the pastry into the flutes, lightly prick the base with a fork, then chill for 10 minutes.", timerSeconds: 10 * 60 },
      { text: "Put a baking sheet in the oven and heat the oven to 200C. Line the pastry case with foil, fill with dry beans, and bake on the hot sheet for 15 minutes.", timerSeconds: 15 * 60 },
      { text: "Remove the foil and beans and bake for 4 to 5 minutes more until the pastry is pale golden.", timerSeconds: 5 * 60 },
      { text: "While the pastry cooks, heat a small frying pan, add the lardons, and fry until they just start to colour. Remove and drain on paper towels." },
      { text: "Cut three quarters of the gruyere into small dice and finely grate the rest. Scatter the diced gruyere and fried lardons over the pastry case." },
      { text: "Beat the creme fraiche to slacken it, then slowly beat in the double cream. Mix in the beaten eggs, season, and add a pinch of ground nutmeg. Pour three quarters of the filling into the pastry case." },
      { text: "Pull the oven shelf out, put the flan tin on the baking sheet, quickly pour in the rest of the filling, scatter the grated cheese over the top, and push the shelf back into the oven." },
      { text: "Lower the oven to 190C and bake for about 25 minutes, or until golden and softly set.", timerSeconds: 25 * 60 },
      { text: "Let the quiche settle for 4 to 5 minutes, then remove from the tin and serve.", timerSeconds: 5 * 60 }
    ]
  },
  {
    title: "Minestrone Soup",
    sourceUrl: "https://www.loveandlemons.com/minestrone-soup/",
    ingredients: [
      "2 tablespoons extra-virgin olive oil",
      "1 medium yellow onion, chopped",
      "1 carrot, chopped",
      "4 kale leaves, stems chopped and leaves torn",
      "2 to 3 cups small cauliflower pieces",
      "3 garlic cloves, minced",
      "1/4 cup white wine",
      "1 can diced tomatoes",
      "Fresh thyme and rosemary",
      "6 cups vegetable broth",
      "4 to 6 oz pasta",
      "1 cup cooked chickpeas, drained and rinsed",
      "Kale and hemp seed pesto",
      "Chopped parsley (optional)",
      "Parmesan or pecorino (optional)"
    ],
    preparationSteps: [],
    cookingSteps: [
      { text: "Heat the oil in a large pot over medium heat. Add the onion, carrot, and a few pinches of salt and pepper. Cook until the onion is soft and translucent, about 10 minutes.", timerSeconds: 10 * 60 },
      { text: "Stir in the kale stems, cauliflower, and garlic. Season with more salt and pepper and cook 2 more minutes. Add the wine, stir, then add the tomatoes. Simmer for 8 minutes.", timerSeconds: 8 * 60 },
      { text: "Add the herbs, broth, pasta, and chickpeas and simmer until the cauliflower is tender, about 30 minutes.", timerSeconds: 30 * 60 },
      { text: "Meanwhile, make the pesto." },
      { text: "Season the soup to taste. Before serving, stir in the kale until wilted." },
      { text: "Serve the soup with pesto and chopped parsley on the side." }
    ]
  }
];

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
    return false;
  }

  window.setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance("Timer finished");
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = "en-US";
      utterance.onstart = () => {
        window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-start"));
      };
      utterance.onend = () => {
        window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
      };
      utterance.onerror = () => {
        window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Timer completion speech failed:", error);
      window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
    }
  }, 250);
  return true;
}

function setTimerStatus(nextStatus, reason) {
  if (appState.timerStatus !== nextStatus) {
    console.log(`[timer-state] ${appState.timerStatus} -> ${nextStatus}${reason ? ` (${reason})` : ""}`);
    appState.timerStatus = nextStatus;
  }
  updateTimerOverlay();
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

function getVoiceTimestamp() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function roundVoiceTiming(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getDebugTimestampIso() {
  return new Date().toISOString();
}

function getMsSinceScreenEnter(referenceTime = getVoiceTimestamp()) {
  if (!Number.isFinite(appState.voiceScreenEnteredAt) || appState.voiceScreenEnteredAt <= 0) {
    return null;
  }
  return roundVoiceTiming(referenceTime - appState.voiceScreenEnteredAt);
}

function getMsSinceCookingIntroEnter(referenceTime = getVoiceTimestamp(), screenName = appState.currentScreen) {
  if (screenName !== "cookingIntro") {
    return null;
  }
  return getMsSinceScreenEnter(referenceTime);
}

function logVoiceTiming(stage, details = {}) {
  console.log(`[voice-timing] ${stage}`, {
    ...details,
    t: roundVoiceTiming(getVoiceTimestamp())
  });
}

function getVoiceTimerSnapshot() {
  return {
    timerStatus: appState.timerStatus,
    activeTimerSeconds: appState.activeTimerSeconds,
    timerPaused: appState.timerPaused,
    timerSkippedStepIndex: appState.timerSkippedStepIndex
  };
}

function isVoiceCommandLocked() {
  const now = getVoiceTimestamp();
  if (Number(appState.voiceCommandLockUntil || 0) <= now) {
    appState.voiceCommandLockUntil = 0;
    appState.voiceCommandLockReason = "";
    return false;
  }
  return true;
}

function getVoiceCommandLockRemainingMs() {
  if (!isVoiceCommandLocked()) {
    return 0;
  }
  return Math.max(0, roundVoiceTiming(appState.voiceCommandLockUntil - getVoiceTimestamp()));
}

function recordVoiceDebugEvent(type, payload = {}) {
  const entry = {
    type,
    timestamp: getDebugTimestampIso(),
    screen: appState.currentScreen,
    preparationIndex: appState.preparationIndex,
    cookingIndex: appState.cookingIndex,
    transcript: appState.voiceLastTranscript || appState.voiceHeard || "",
    matchedCommand: appState.voiceLastMatchedCommand || "",
    action: appState.voiceLastAction || "",
    timer: getVoiceTimerSnapshot(),
    commandLockActive: isVoiceCommandLocked(),
    commandLockReason: appState.voiceCommandLockReason || "",
    ...payload
  };

  appState.voiceDebugEvents = [entry, ...(appState.voiceDebugEvents || [])].slice(0, 40);
  console.log("[voice-debug]", entry);
}

function recordScreenEntryDebugEvent(screenName, payload = {}) {
  const trackedScreens = new Set(["ingredients", "preparationIntro", "preparation", "cookingIntro"]);
  if (!trackedScreens.has(screenName)) {
    return;
  }

  recordVoiceDebugEvent(`entered-${screenName}`, {
    screenName,
    at: getDebugTimestampIso(),
    ...payload
  });
}

function recordCookingIntroDebugEvent(type, payload = {}, options = {}) {
  const referenceTime = Number.isFinite(options.referenceTime) ? options.referenceTime : getVoiceTimestamp();
  const effectiveScreen = options.screenName || appState.currentScreen;
  const isCookingIntroEvent = effectiveScreen === "cookingIntro";
  if (!isCookingIntroEvent) {
    return;
  }

  recordVoiceDebugEvent(type, {
    msSinceCookingIntroEnter: getMsSinceCookingIntroEnter(referenceTime, effectiveScreen),
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
    msSinceAcceptedVoiceCommand: Number(appState.voiceLastAcceptedCommandAt || 0)
      ? roundVoiceTiming(referenceTime - appState.voiceLastAcceptedCommandAt)
      : null,
    ...payload
  });
}

function recordAutoFlowDebugEvent(type, payload = {}) {
  recordVoiceDebugEvent(type, {
    at: getDebugTimestampIso(),
    msSinceScreenEnter: getMsSinceScreenEnter(),
    lastAcceptedCommandAt: roundVoiceTiming(appState.voiceLastAcceptedCommandAt || 0),
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
    ...payload
  });
}

function setVoiceCommandLock(reason, durationMs = 650) {
  appState.voiceCommandLockUntil = getVoiceTimestamp() + durationMs;
  appState.voiceCommandLockReason = reason || "voice-command";
  recordVoiceDebugEvent("command-lock-set", {
    reason: appState.voiceCommandLockReason,
    durationMs
  });
}

function clearVoiceCommandLock(reason = "") {
  if (!appState.voiceCommandLockUntil && !appState.voiceCommandLockReason) {
    return;
  }

  appState.voiceCommandLockUntil = 0;
  appState.voiceCommandLockReason = "";
  recordVoiceDebugEvent("command-lock-cleared", {
    reason: reason || "cleared"
  });
}

function isVoiceDebugUiEnabled() {
  return getDevModeEnabled();
}

function isPreparationVoiceScreen(screenName = appState.currentScreen) {
  return screenName === "preparation";
}

function recordPreparationVoiceDebugEvent(type, payload = {}) {
  if (!isPreparationVoiceScreen(payload.screen || appState.currentScreen)) {
    return;
  }
  recordVoiceDebugEvent(type, payload);
}

function recordCookingVoiceDebugEvent(type, payload = {}) {
  if (getVoiceScreenMode(payload.screen || appState.currentScreen) !== "cooking") {
    return;
  }
  recordVoiceDebugEvent(type, payload);
}

function normalizeVoiceCommandText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFastVoiceCommand(commandText) {
  const normalized = normalizeVoiceCommandText(commandText);
  if (!normalized) {
    return null;
  }

  const commandMap = {
    // Temporary debug simplification: only allow the minimal explicit command set.
    "next": { key: "next", label: "Next" },
    "repeat": { key: "repeat", label: "Repeat" },
    "pause timer": { key: "pause_timer", label: "Pause Timer" },
    "skip timer": { key: "skip_timer", label: "Skip Timer" }
  };

  return commandMap[normalized] || null;
}

function shouldSuppressDuplicateVoiceCommand(commandKey, transcript) {
  const now = getVoiceTimestamp();
  const normalizedTranscript = normalizeVoiceCommandText(transcript);

  if (
    lastVoiceHandledCommand.key === commandKey &&
    lastVoiceHandledCommand.transcript === normalizedTranscript &&
    now - lastVoiceHandledCommand.at < 900
  ) {
    logVoiceTiming("duplicate-suppressed", {
      commandKey,
      transcript: normalizedTranscript
    });
    recordVoiceDebugEvent("command-ignored-duplicate-after-screen-change", {
      commandKey,
      transcript,
      normalizedTranscript,
      msSinceScreenEnter: getMsSinceScreenEnter(now)
    });
    recordCookingIntroDebugEvent("stale-command-reused", {
      commandKey,
      transcript,
      normalizedTranscript,
      reason: "duplicate-suppressed",
      carriedOverState: true
    }, {
      referenceTime: now
    });
    recordCookingIntroDebugEvent("cookingIntro-stale-transcript-ignored", {
      commandKey,
      transcript,
      normalizedTranscript,
      reason: "duplicate-suppressed"
    }, {
      referenceTime: now
    });
    recordCookingIntroDebugEvent("cookingIntro-command-ignored", {
      commandKey,
      transcript,
      normalizedTranscript,
      reason: "duplicate-suppressed"
    }, {
      referenceTime: now
    });
    return true;
  }

  lastVoiceHandledCommand = {
    key: commandKey,
    transcript: normalizedTranscript,
    at: now
  };
  return false;
}

function logVoiceTranscriptArrival(transcript, options = {}) {
  const now = getVoiceTimestamp();
  const speechEndToTranscriptMs = Number.isFinite(lastVoiceSpeechEndAt)
    ? now - lastVoiceSpeechEndAt
    : null;
  appState.voiceLastTranscript = transcript;
  appState.voiceLastTranscriptAt = now;

  logVoiceTiming("transcript-received", {
    transcript,
    source: options.source || "unknown",
    isFinal: Boolean(options.isFinal),
    speechEndToTranscriptMs: roundVoiceTiming(speechEndToTranscriptMs)
  });
  recordVoiceDebugEvent("transcript-received", {
    transcript,
    source: options.source || "unknown",
    isFinal: Boolean(options.isFinal),
    speechEndToTranscriptMs: roundVoiceTiming(speechEndToTranscriptMs)
  });
  recordCookingIntroDebugEvent("transcript-received", {
    transcript,
    source: options.source || "unknown",
    isFinal: Boolean(options.isFinal),
    speechEndToTranscriptMs: roundVoiceTiming(speechEndToTranscriptMs)
  }, {
    referenceTime: now
  });

  return {
    transcriptReceivedAt: now,
    speechEndAt: lastVoiceSpeechEndAt,
    source: options.source || "unknown",
    isFinal: Boolean(options.isFinal)
  };
}

function shouldIgnorePreparationTranscript(transcript, timing = {}) {
  if (!isPreparationVoiceScreen()) {
    return null;
  }

  const now = Number.isFinite(timing.transcriptReceivedAt) ? timing.transcriptReceivedAt : getVoiceTimestamp();
  const gateUntil = Number(appState.voicePreparationAcceptCommandsAt || 0);

  if (appState.voiceOutputSpeaking) {
    recordPreparationVoiceDebugEvent("transcript-ignored-app-speech", {
      transcript,
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal)
    });
    return "app-speech";
  }

  if (gateUntil && now < gateUntil) {
    console.log("[voice-debug] transcript rejected as stale", {
      transcript,
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now),
      screen: appState.currentScreen
    });
    recordPreparationVoiceDebugEvent("transcript-ignored-stale", {
      transcript,
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now)
    });
    recordVoiceDebugEvent("command-ignored-after-screen-change", {
      transcript,
      reason: "stale",
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      msSinceScreenEnter: getMsSinceScreenEnter(now),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now)
    });
    recordCookingIntroDebugEvent("transcript-ignored-as-stale", {
      transcript,
      reason: "stale",
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now)
    }, {
      referenceTime: now
    });
    recordCookingIntroDebugEvent("stale transcript ignored", {
      transcript,
      reason: "stale",
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now)
    }, {
      referenceTime: now
    });
    recordCookingIntroDebugEvent("cookingIntro-command-ignored", {
      transcript,
      reason: "stale",
      source: timing.source || "unknown",
      isFinal: Boolean(timing.isFinal),
      ignoredUntilMs: roundVoiceTiming(gateUntil - now)
    }, {
      referenceTime: now
    });
    return "stale";
  }

  return null;
}

function logVoiceCommandMatch(commandKey, transcript, timing = {}) {
  const now = getVoiceTimestamp();
  const transcriptToMatchMs = Number.isFinite(timing.transcriptReceivedAt)
    ? now - timing.transcriptReceivedAt
    : null;
  appState.voiceLastMatchedCommand = commandKey;

  logVoiceTiming("command-matched", {
    commandKey,
    transcript,
    source: timing.source || "unknown",
    isFinal: Boolean(timing.isFinal),
    transcriptToMatchMs: roundVoiceTiming(transcriptToMatchMs)
  });
  recordVoiceDebugEvent("command-matched", {
    transcript,
    matchedCommand: commandKey,
    source: timing.source || "unknown",
    isFinal: Boolean(timing.isFinal),
    transcriptToMatchMs: roundVoiceTiming(transcriptToMatchMs)
  });
}

function resetCookingVoiceLiveState(reason = "reset") {
  appState.voiceHeard = "";
  appState.voiceLastTranscript = "";
  appState.voiceLastTranscriptAt = 0;
  appState.voiceLastMatchedCommand = "";
  appState.voiceLastAction = "";
  appState.voiceExecuting = false;
  setVoiceCommandStatus("", 0);
  recordCookingVoiceDebugEvent("cooking-live-state-reset", {
    reason
  });
}

function expireCookingVoiceResult(commandKey, transcript) {
  appState.cookingVoiceConsumedSessionId = Number(appState.voiceRecognitionSessionId || 0);
  appState.cookingVoiceConsumedCommandKey = commandKey || "";
  appState.cookingVoiceConsumedTranscript = normalizeVoiceCommandText(transcript);
  recordCookingVoiceDebugEvent("cooking-session-expired", {
    commandKey: appState.cookingVoiceConsumedCommandKey,
    transcript: appState.cookingVoiceConsumedTranscript,
    speechSessionId: appState.cookingVoiceConsumedSessionId
  });
}

function clearCookingConsumedVoiceState(reason = "clear", payload = {}) {
  appState.cookingVoiceConsumedSessionId = 0;
  appState.cookingVoiceConsumedCommandKey = "";
  appState.cookingVoiceConsumedTranscript = "";
  recordCookingVoiceDebugEvent("cooking-voice-ready-after-timer", {
    reason,
    ...payload
  });
  console.warn("[cooking-debug] cooking-voice-ready-after-timer", {
    reason,
    screen: appState.currentScreen,
    cookingIndex: appState.cookingIndex,
    timerStatus: appState.timerStatus,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
    liveCommand: appState.voiceLastMatchedCommand || "",
    screenMode: getVoiceScreenMode(),
    ...payload
  });
}

function restoreCookingVoiceAfterTimerFinish(reason = "timer-finished", payload = {}) {
  clearCookingConsumedVoiceState(reason, payload);
  resetCookingVoiceLiveState(reason);
  appState.cookingVoiceReadyAfterTimerPending = false;
  recordCookingVoiceDebugEvent("cooking-voice-ready-state-changed", {
    reason,
    ready: true,
    cookingIndex: appState.cookingIndex,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    timerStatus: appState.timerStatus,
    screenMode: getVoiceScreenMode()
  });

  if (
    appState.currentScreen === "cooking" &&
    appState.voiceEnabled &&
    isVoiceRecognitionAllowedOnScreen("cooking") &&
    !appState.voiceListening
  ) {
    startVoiceCommands();
  }
}

function ensureCookingVoiceReady(reason = "step-enter", payload = {}) {
  if (getVoiceScreenMode() !== "cooking") {
    return;
  }

  recordCookingVoiceDebugEvent("cooking-voice-ready-state-changed", {
    reason,
    ready: Boolean(appState.voiceEnabled && !appState.voiceOutputSpeaking),
    cookingIndex: appState.cookingIndex,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    timerStatus: appState.timerStatus,
    liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
    liveCommand: appState.voiceLastMatchedCommand || "",
    consumedSessionId: appState.cookingVoiceConsumedSessionId || 0,
    commandLockUntil: appState.voiceCommandLockUntil || 0,
    screenMode: getVoiceScreenMode(),
    ...payload
  });

  if (
    appState.currentScreen === "cooking" &&
    appState.voiceEnabled &&
    isVoiceRecognitionAllowedOnScreen("cooking") &&
    !appState.voiceOutputSpeaking &&
    !appState.voiceListening
  ) {
    startVoiceCommands();
  }
}

function recordCookingVoicePanelState(reason = "panel-state", payload = {}) {
  if (getVoiceScreenMode() !== "cooking") {
    return;
  }

  recordCookingVoiceDebugEvent("cooking-voice-panel-state-updated", {
    reason,
    cookingIndex: appState.cookingIndex,
    voiceEnabled: appState.voiceEnabled,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    timerStatus: appState.timerStatus,
    screenMode: getVoiceScreenMode(),
    ...payload
  });
}

function shouldIgnoreConsumedCookingVoiceResult(transcript, commandKey = "") {
  if (getVoiceScreenMode() !== "cooking") {
    return false;
  }

  const currentSessionId = Number(appState.voiceRecognitionSessionId || 0);
  if (!currentSessionId || currentSessionId !== Number(appState.cookingVoiceConsumedSessionId || 0)) {
    return false;
  }
  const normalizedTranscript = normalizeVoiceCommandText(transcript);
  const consumedTranscript = appState.cookingVoiceConsumedTranscript || "";
  const consumedCommandKey = appState.cookingVoiceConsumedCommandKey || "";

  if (appState.timerStatus === "completed") {
    recordCookingVoiceDebugEvent("cooking-voice-ready-after-timer", {
      reason: "drop-stale-consumed-session-after-timer-finish",
      transcript: normalizedTranscript,
      commandKey: commandKey || consumedCommandKey,
      speechSessionId: currentSessionId
    });
    clearCookingConsumedVoiceState("timer-finished-session-reset", {
      transcript: normalizedTranscript,
      commandKey: commandKey || consumedCommandKey,
      speechSessionId: currentSessionId
    });
    return false;
  }

  recordCookingVoiceDebugEvent("cooking-command-rejected", {
    reason: "consumed-session",
    commandKey: commandKey || consumedCommandKey,
    transcript: normalizedTranscript,
    speechSessionId: currentSessionId
  });
  resetCookingVoiceLiveState("consumed-session-ignored");
  return true;
}

function canExecuteCookingVoiceCommand(commandKey) {
  if (getVoiceScreenMode() !== "cooking") {
    return false;
  }

  if (appState.voiceOutputSpeaking) {
    recordCookingVoiceDebugEvent("cooking-command-rejected", {
      reason: "app-speaking",
      commandKey,
      transcript: appState.voiceLastTranscript || appState.voiceHeard || ""
    });
    if (commandKey === "next" && appState.timerStatus === "completed") {
      recordCookingVoiceDebugEvent("cooking-voice-next-blocked-after-timer", {
        reason: "app-speaking",
        transcript: appState.voiceLastTranscript || appState.voiceHeard || ""
      });
      recordCookingVoiceDebugEvent("cooking-voice-next-blocked-on-step", {
        reason: "app-speaking",
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        consumedSessionId: appState.cookingVoiceConsumedSessionId || 0,
        commandLockUntil: appState.voiceCommandLockUntil || 0,
        screenMode: getVoiceScreenMode()
      });
      console.warn("[cooking-debug] cooking-voice-next-blocked-after-timer", {
        reason: "app-speaking",
        screen: appState.currentScreen,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        screenMode: getVoiceScreenMode()
      });
    }
    resetCookingVoiceLiveState("app-speaking");
    return false;
  }

  if (commandKey === "skip_timer") {
    const step = getCurrentCookingStep();
    const hasTimer = Boolean(step && Number.isInteger(step.timerSeconds) && step.timerSeconds > 0);
    if (!hasTimer || canProceedFromTimerStep()) {
      recordCookingVoiceDebugEvent("cooking-command-rejected", {
        reason: "skip-timer-unavailable",
        commandKey,
        transcript: appState.voiceLastTranscript || appState.voiceHeard || ""
      });
      resetCookingVoiceLiveState("skip-timer-unavailable");
      return false;
    }
  }

  if (commandKey === "next" && !canProceedFromTimerStep()) {
    recordCookingVoiceDebugEvent("cooking-command-rejected", {
      reason: "timer-running",
      commandKey,
      transcript: appState.voiceLastTranscript || appState.voiceHeard || ""
    });
    if (appState.timerStatus === "completed") {
      recordCookingVoiceDebugEvent("cooking-voice-next-blocked-after-timer", {
        reason: "timer-running",
        transcript: appState.voiceLastTranscript || appState.voiceHeard || ""
      });
      recordCookingVoiceDebugEvent("cooking-voice-next-blocked-on-step", {
        reason: "timer-running",
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        consumedSessionId: appState.cookingVoiceConsumedSessionId || 0,
        commandLockUntil: appState.voiceCommandLockUntil || 0,
        screenMode: getVoiceScreenMode()
      });
      console.warn("[cooking-debug] cooking-voice-next-blocked-after-timer", {
        reason: "timer-running",
        screen: appState.currentScreen,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        screenMode: getVoiceScreenMode()
      });
    }
    setVoiceHint("Timer is still running. Say skip timer or wait.", 2200);
    if (appState.currentScreen === "cooking") {
      renderCooking();
    }
    resetCookingVoiceLiveState("timer-running");
    return false;
  }

  return true;
}

function executeCookingVoiceCommand(commandKey, transcript, timing = {}) {
  if (!canExecuteCookingVoiceCommand(commandKey)) {
    return false;
  }

  const normalizedTranscript = normalizeVoiceCommandText(transcript);
  if (commandKey === "next") {
    console.warn("[cooking-debug] cooking-voice-next-received", {
      transcript: normalizedTranscript,
      screen: appState.currentScreen,
      cookingIndex: appState.cookingIndex,
      timerStatus: appState.timerStatus,
      voiceListening: appState.voiceListening,
      voiceOutputSpeaking: appState.voiceOutputSpeaking,
      liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
      liveCommand: appState.voiceLastMatchedCommand || "",
      commandLockUntil: appState.voiceCommandLockUntil || 0,
      screenMode: getVoiceScreenMode()
    });
  }
  appState.voiceLastMatchedCommand = commandKey;
  appState.voiceLastAction = commandKey;
  appState.voiceLastAcceptedCommandAt = Number.isFinite(timing.transcriptReceivedAt)
    ? timing.transcriptReceivedAt
    : getVoiceTimestamp();
  appState.voiceLastAcceptedCommandScreen = appState.currentScreen;
  appState.voiceLastAcceptedCommandTranscript = normalizedTranscript;

  recordCookingVoiceDebugEvent("cooking-command-accepted", {
    commandKey,
    transcript: normalizedTranscript,
    speechSessionId: Number(appState.voiceRecognitionSessionId || 0)
  });
  if (commandKey === "next" && appState.timerStatus === "completed") {
    recordCookingVoiceDebugEvent("cooking-next-accepted-after-timer", {
      transcript: normalizedTranscript,
      speechSessionId: Number(appState.voiceRecognitionSessionId || 0)
    });
  }

  if (commandKey === "repeat") {
    repeatCurrentCookingStep();
    recordCookingVoiceDebugEvent("step-advanced", {
      source: "voice-repeat",
      cookingIndex: appState.cookingIndex,
      advanced: false
    });
  } else if (commandKey === "skip_timer") {
    skipTimerAndAdvance();
    recordCookingVoiceDebugEvent("timer-skipped", {
      source: "voice-skip-timer",
      cookingIndex: appState.cookingIndex
    });
    recordCookingVoiceDebugEvent("step-advanced", {
      source: "voice-skip-timer",
      cookingIndex: appState.cookingIndex
    });
  } else if (commandKey === "next") {
    goToNextCookingStep();
    recordCookingVoiceDebugEvent("step-advanced", {
      source: "voice-next",
      cookingIndex: appState.cookingIndex
    });
  }

  expireCookingVoiceResult(commandKey, normalizedTranscript);
  resetCookingVoiceLiveState("command-executed");
  return true;
}

function isVoiceUiActive() {
  return Boolean(isVoiceRecognitionAllowedOnScreen() && appState.voiceListening && appState.voiceUserSpeaking);
}

function isVoiceRecognitionAllowedOnScreen(screenName = appState.currentScreen) {
  return isMinimalVoiceAvailableOnScreen(screenName);
}

function syncVoiceIndicatorBars() {
  const stateClass = !appState.voiceEnabled || !isVoiceRecognitionAllowedOnScreen()
    ? "voice-off"
    : isVoiceUiActive()
      ? "voice-active"
      : "voice-idle";
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
  if (!isVoiceRecognitionAllowedOnScreen()) {
    clearVoiceRecognitionActivity();
    return;
  }
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

function suspendVoiceRecognitionForCurrentScreen(reason = "screen-voice-disabled") {
  appState.voiceListening = false;
  clearVoiceRecognitionActivity();
  clearVoiceCommandLock(reason);
  setVoiceCommandStatus("", 0);
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch {
      // Ignore stop errors when recognition is not active.
    }
  }
}

function resetVoiceActivityState() {
  clearVoiceRecognitionActivity();
  setVoiceOutputSpeaking(false);
}

function clearMinimalVoiceTranscriptState() {
  appState.voiceHeard = "";
  appState.voiceLastTranscript = "";
  appState.voiceLastTranscriptAt = 0;
  appState.voiceLastMatchedCommand = "";
  appState.voiceLastAction = "";
  appState.voiceExecuting = false;
  setVoiceCommandStatus("", 0);
}

function isMinimalVoiceNextAvailable() {
  if (appState.currentScreen === "preparation") {
    return true;
  }

  if (appState.currentScreen !== "cooking") {
    return false;
  }

  const step = getCurrentCookingStep();
  const hasTimer = Boolean(step && Number.isInteger(step.timerSeconds) && step.timerSeconds > 0);
  const timerInteractionActive = hasTimer && (appState.timerStatus === "running" || appState.timerStatus === "paused");
  return !timerInteractionActive;
}

function executeMinimalVoiceNext() {
  if (!isMinimalVoiceScreen(appState.currentScreen)) {
    clearMinimalVoiceTranscriptState();
    return;
  }

  if (appState.voiceOutputSpeaking || !isMinimalVoiceNextAvailable()) {
    clearMinimalVoiceTranscriptState();
    renderCurrentVoiceScreen();
    return;
  }

  appState.voiceLastMatchedCommand = "next";
  appState.voiceLastAction = "next";

  if (appState.currentScreen === "preparation") {
    advancePreparationStep();
  } else if (appState.currentScreen === "cooking") {
    goToNextCookingStep();
  }

  clearMinimalVoiceTranscriptState();
}

function startMinimalVoiceController() {
  if (!isMinimalVoiceAvailableOnScreen(appState.currentScreen)) {
    return;
  }

  appState.voiceEnabled = true;
  appState.voiceUnlocked = true;
  appState.voiceErrorMessage = "";
  appState.voiceListening = false;
  clearVoiceRecognitionActivity();
  clearMinimalVoiceTranscriptState();

  if (!minimalVoiceRecognition) {
    minimalVoiceRecognition = new MinimalSpeechRecognition();
    minimalVoiceRecognition.lang = "en-US";
    minimalVoiceRecognition.continuous = true;
    minimalVoiceRecognition.interimResults = false;

    minimalVoiceRecognition.onstart = () => {
      appState.voiceListening = true;
      clearVoiceRecognitionActivity();
      setVoiceCommandStatus("", 0);
      renderCurrentVoiceScreen();
    };

    minimalVoiceRecognition.onresult = (event) => {
      const result = event.results?.[event.resultIndex];
      const transcript = (result?.[0]?.transcript || "").trim();
      if (!transcript || !isMinimalVoiceScreen(appState.currentScreen)) {
        clearMinimalVoiceTranscriptState();
        return;
      }

      const normalizedTranscript = normalizeVoiceCommandText(transcript);
      appState.voiceHeard = transcript;
      appState.voiceLastTranscript = transcript;
      appState.voiceLastTranscriptAt = getVoiceTimestamp();

      if (normalizedTranscript.includes("next")) {
        executeMinimalVoiceNext();
        return;
      }

      clearMinimalVoiceTranscriptState();
      renderCurrentVoiceScreen();
    };

    minimalVoiceRecognition.onspeechstart = () => {
      setVoiceRecognitionActivity(true);
      renderCurrentVoiceScreen();
    };

    minimalVoiceRecognition.onspeechend = () => {
      clearVoiceRecognitionActivity();
      renderCurrentVoiceScreen();
    };

    minimalVoiceRecognition.onend = () => {
      appState.voiceListening = false;
      clearVoiceRecognitionActivity();
      clearMinimalVoiceTranscriptState();
      renderCurrentVoiceScreen();
    };

    minimalVoiceRecognition.onerror = () => {
      appState.voiceListening = false;
      clearVoiceRecognitionActivity();
      clearMinimalVoiceTranscriptState();
      appState.voiceErrorMessage = "Voice input is unavailable right now.";
      renderCurrentVoiceScreen();
    };
  }

  try {
    minimalVoiceRecognition.start();
  } catch {
    appState.voiceListening = false;
    renderCurrentVoiceScreen();
  }
}

function stopMinimalVoiceController() {
  appState.voiceListening = false;
  appState.voiceEnabled = isMinimalVoiceAvailableOnScreen(appState.currentScreen);
  clearVoiceRecognitionActivity();
  clearMinimalVoiceTranscriptState();

  if (minimalVoiceRecognition) {
    try {
      minimalVoiceRecognition.stop();
    } catch {
      // Ignore stop errors when recognition is already stopped.
    }
  }
}

function pulseVoiceRecognitionActivity(durationMs = 700) {
  if (!isVoiceRecognitionAllowedOnScreen()) {
    clearVoiceRecognitionActivity();
    return;
  }
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

function runVoiceAction(actionName, commandLabel, action, delayMs = 0, timing = null) {
  if (actionName) {
    flashActionButton(actionName);
  }
  if (commandLabel) {
    markVoiceCommandExecuted(commandLabel);
  }
  const executeAction = () => {
    const screenBefore = appState.currentScreen;
    const timerBefore = getVoiceTimerSnapshot();
    const now = getVoiceTimestamp();
    const matchToActionMs = Number.isFinite(timing?.matchedAt)
      ? now - timing.matchedAt
      : null;
    appState.voiceLastAction = actionName || commandLabel || "unknown";

    logVoiceTiming("action-executed", {
      commandKey: timing?.commandKey || actionName || commandLabel || "unknown",
      actionName: actionName || "",
      commandLabel: commandLabel || "",
      matchToActionMs: roundVoiceTiming(matchToActionMs)
    });
    recordVoiceDebugEvent("action-before", {
      transcript: appState.voiceLastTranscript || "",
      matchedCommand: timing?.commandKey || "",
      action: actionName || commandLabel || "unknown",
      screenBefore,
      timerBefore,
      matchToActionMs: roundVoiceTiming(matchToActionMs)
    });

    action();

    recordVoiceDebugEvent("action-after", {
      transcript: appState.voiceLastTranscript || "",
      matchedCommand: timing?.commandKey || "",
      action: actionName || commandLabel || "unknown",
      screenBefore,
      screenAfter: appState.currentScreen,
      timerBefore,
      timerAfter: getVoiceTimerSnapshot()
    });
  };

  if (delayMs > 0) {
    window.setTimeout(executeAction, delayMs);
    return;
  }

  executeAction();
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

function getVoiceScreenMode(screenName = appState.currentScreen) {
  if (screenName === "preparation") {
    return "preparation";
  }
  if (screenName === "cooking") {
    return "cooking";
  }
  return "off";
}

function isMinimalVoiceScreen(screenName = appState.currentScreen) {
  return screenName === "preparation" || screenName === "cooking";
}

function isMinimalVoiceAvailableOnScreen(screenName = appState.currentScreen) {
  return Boolean(MINIMAL_VOICE_PHASE1_ENABLED && MinimalSpeechRecognition && isMinimalVoiceScreen(screenName));
}

function isIntroScreen(screenName = appState.currentScreen) {
  return screenName === "ingredientsIntro" ||
    screenName === "preparationIntro" ||
    screenName === "cookingIntro";
}

function getIntroAdvanceTarget(screenName) {
  if (screenName === "ingredientsIntro") {
    return "ingredients";
  }
  if (screenName === "preparationIntro") {
    return "preparation";
  }
  if (screenName === "cookingIntro") {
    return "cooking";
  }
  return "";
}

function getMsSinceIntroEnter(referenceTime = getVoiceTimestamp()) {
  return isIntroScreen() ? getMsSinceScreenEnter(referenceTime) : null;
}

function logIntroAdvanceEvent(type, payload = {}, options = {}) {
  const referenceTime = Number.isFinite(options.referenceTime) ? options.referenceTime : getVoiceTimestamp();
  const introScreenName = options.introScreenName || appState.currentScreen;
  const lastAcceptedAt = Number(appState.voiceLastAcceptedCommandAt || 0);

  recordVoiceDebugEvent(type, {
    introScreenName,
    introAdvanceSource: options.source || payload.source || "",
    msSinceIntroEnter: isIntroScreen(introScreenName)
      ? getMsSinceScreenEnter(referenceTime)
      : null,
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
    msSinceAcceptedVoiceCommand: lastAcceptedAt ? roundVoiceTiming(referenceTime - lastAcceptedAt) : null,
    ...payload
  });
}

function approveIntroAdvance(introScreenName, targetScreen, source, triggerAt, detail = "") {
  appState.pendingIntroAdvance = {
    introScreenName,
    targetScreen,
    source,
    triggerAt,
    detail
  };
}

function consumeIntroAdvanceApproval(introScreenName, targetScreen) {
  const approval = appState.pendingIntroAdvance;
  if (!approval) {
    return null;
  }
  if (approval.introScreenName !== introScreenName || approval.targetScreen !== targetScreen) {
    return null;
  }
  appState.pendingIntroAdvance = null;
  return approval;
}

function hasIntroAdvanceApproval(introScreenName, targetScreen) {
  const approval = appState.pendingIntroAdvance;
  return Boolean(
    approval &&
    approval.introScreenName === introScreenName &&
    approval.targetScreen === targetScreen
  );
}

function requestIntroAdvance(introScreenName, source, triggerAt, action, detail = "") {
  const targetScreen = getIntroAdvanceTarget(introScreenName);
  const introEnteredAt = Number(appState.voiceScreenEnteredAt || 0);
  const acceptAt = Number(appState.voiceIntroAcceptCommandsAt || 0);
  const isCurrentIntro = appState.currentScreen === introScreenName;
  const isAllowedSource = INTRO_SCREENS_CLICK_ONLY_DEBUG
    ? source === "click"
    : (source === "click" || source === "fresh-voice");
  const afterIntroEntry = Number.isFinite(triggerAt) && triggerAt >= introEnteredAt;
  const passesFreshGate = source === "click" ? afterIntroEntry : afterIntroEntry && (!acceptAt || triggerAt >= acceptAt);

  logIntroAdvanceEvent("intro-advance-attempt", {
    source,
    targetScreen,
    detail,
    isCurrentIntro,
    isAllowedSource,
    afterIntroEntry,
    passesFreshGate
  }, {
    referenceTime: triggerAt,
    introScreenName,
    source
  });

  if (!isCurrentIntro || !targetScreen || !isAllowedSource || !passesFreshGate) {
    const blockedSource = !isAllowedSource && source === "fresh-voice"
      ? "voice"
      : "blocked-auto-path";
    logIntroAdvanceEvent("intro-advance-blocked", {
      source: isAllowedSource ? source : blockedSource,
      targetScreen,
      detail,
      isCurrentIntro,
      isAllowedSource,
      afterIntroEntry,
      passesFreshGate,
      introAcceptCommandsAt: roundVoiceTiming(acceptAt)
    }, {
      referenceTime: triggerAt,
      introScreenName,
      source: isAllowedSource ? source : blockedSource
    });
    if (!isAllowedSource && source === "fresh-voice") {
      logIntroAdvanceEvent("intro-advance-blocked-voice", {
        source,
        targetScreen,
        detail,
        reason: "intro-click-only-debug-mode"
      }, {
        referenceTime: triggerAt,
        introScreenName,
        source: "voice"
      });
    } else {
      logIntroAdvanceEvent("intro-advance-blocked-auto", {
        source,
        targetScreen,
        detail,
        reason: "intro-transition-without-valid-click-trigger"
      }, {
        referenceTime: triggerAt,
        introScreenName,
        source: "blocked-auto-path"
      });
    }
    return false;
  }

  approveIntroAdvance(introScreenName, targetScreen, source, triggerAt, detail);
  logIntroAdvanceEvent("intro-advance-allowed", {
    source,
    targetScreen,
    detail
  }, {
    referenceTime: triggerAt,
    introScreenName,
    source
  });
  action();
  return true;
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatRecipeDuration(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "";
  }

  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function getRecipeMetadataItems(recipe) {
  const safeRecipe = recipe || {};
  const coreItems = [
    {
      label: "Prep",
      value: formatRecipeDuration(safeRecipe.prepTime ?? safeRecipe.prepTimeMinutes),
      fallback: "Not provided"
    },
    {
      label: "Cook",
      value: formatRecipeDuration(safeRecipe.cookTime ?? safeRecipe.cookTimeMinutes),
      fallback: "Not provided"
    },
    {
      label: "Total",
      value: formatRecipeDuration(safeRecipe.totalTime ?? safeRecipe.totalTimeMinutes),
      fallback: "Not provided"
    },
    {
      label: "Serves",
      value: safeRecipe.servings ?? safeRecipe.yield ?? "",
      fallback: "Not provided"
    }
  ];

  const secondaryItems = [
    {
      label: "Difficulty",
      value: safeRecipe.difficulty ?? ""
    },
    {
      label: "Category",
      value: safeRecipe.category ?? ""
    },
    {
      label: "Rating",
      value: safeRecipe.rating ?? ""
    },
    {
      label: "Reviews",
      value: safeRecipe.reviewCount ?? ""
    },
    {
      label: "Author",
      value: safeRecipe.author ?? ""
    }
  ];

  const normalizedCoreItems = coreItems.map((item) => ({
    label: item.label,
    value: item.value === null || item.value === undefined || item.value === "" ? item.fallback : String(item.value)
  }));

  const normalizedSecondaryItems = secondaryItems
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    .map((item) => ({
      label: item.label,
      value: String(item.value)
    }));

  return [...normalizedCoreItems, ...normalizedSecondaryItems];
}

function getRecipeMetadataDebugSnapshot(recipe) {
  const safeRecipe = recipe || {};
  return {
    prepTime: safeRecipe.prepTime ?? null,
    prepTimeMinutes: safeRecipe.prepTimeMinutes ?? null,
    cookTime: safeRecipe.cookTime ?? null,
    cookTimeMinutes: safeRecipe.cookTimeMinutes ?? null,
    totalTime: safeRecipe.totalTime ?? null,
    totalTimeMinutes: safeRecipe.totalTimeMinutes ?? null,
    servings: safeRecipe.servings ?? null,
    yield: safeRecipe.yield ?? null,
    difficulty: safeRecipe.difficulty ?? null,
    category: safeRecipe.category ?? null,
    rating: safeRecipe.rating ?? null,
    reviewCount: safeRecipe.reviewCount ?? null,
    author: safeRecipe.author ?? null,
    sourceUrl: safeRecipe.sourceUrl ?? null,
    title: safeRecipe.title ?? null,
    ingredientCount: Array.isArray(safeRecipe.ingredients) ? safeRecipe.ingredients.length : 0,
    preparationStepCount: Array.isArray(safeRecipe.preparationSteps) ? safeRecipe.preparationSteps.length : 0,
    cookingStepCount: Array.isArray(safeRecipe.cookingSteps) ? safeRecipe.cookingSteps.length : 0
  };
}

function setScreen(screenName) {
  const previousScreen = appState.currentScreen;
  const previousWasMinimalVoiceScreen = isMinimalVoiceScreen(previousScreen);
  const nextIsMinimalVoiceScreen = isMinimalVoiceScreen(screenName);
  const previousScreenEnteredAt = appState.voiceScreenEnteredAt;
  const timerBefore = getVoiceTimerSnapshot();
  const enteredAt = getVoiceTimestamp();
  const lastAcceptedCommandAt = Number(appState.voiceLastAcceptedCommandAt || 0);
  const guidanceTransition = isGuidanceScreen(previousScreen) || isGuidanceScreen(screenName);
  const freshVoiceCommandForTransition = Boolean(
    lastAcceptedCommandAt &&
    Number.isFinite(previousScreenEnteredAt) &&
    lastAcceptedCommandAt >= previousScreenEnteredAt
  );

  if (isIntroScreen(previousScreen) && screenName === getIntroAdvanceTarget(previousScreen)) {
    const approval = consumeIntroAdvanceApproval(previousScreen, screenName);
    if (!approval) {
      logIntroAdvanceEvent("intro-advance-blocked", {
        source: "blocked-auto-path",
        targetScreen: screenName,
        detail: "setScreen called without explicit intro approval",
        attemptedNextScreen: screenName
      }, {
        referenceTime: enteredAt,
        introScreenName: previousScreen,
        source: "blocked-auto-path"
      });
      return;
    }
  }

  appState.currentScreen = screenName;
  appState.voiceEnabled = isMinimalVoiceAvailableOnScreen(screenName);
  appState.voiceUnlocked = appState.voiceEnabled;
  appState.voiceErrorMessage = "";
  appState.voiceScreenEnteredAt = enteredAt;
  appState.voiceLastTranscript = "";
  appState.voiceLastMatchedCommand = "";
  appState.voiceLastAction = "";
  clearOnboardingDemoLoop();
  resetVoiceActivityState();
  clearDeferredPreparationSpeech();
  if (!isIntroScreen(screenName)) {
    appState.voiceIntroAcceptCommandsAt = 0;
  }
  if (screenName !== "preparation") {
    appState.voicePreparationStepEnteredAt = 0;
    appState.voicePreparationAcceptCommandsAt = 0;
  }
  if (screenName !== "cooking") {
    appState.cookingVoiceConsumedSessionId = 0;
    appState.cookingVoiceConsumedCommandKey = "";
    appState.cookingVoiceConsumedTranscript = "";
  }
  recordVoiceDebugEvent("screen-change", {
    previousScreen,
    nextScreen: screenName,
    timerBefore,
    timerAfter: getVoiceTimerSnapshot(),
    freshVoiceCommandForTransition,
    lastAcceptedCommandAt: roundVoiceTiming(lastAcceptedCommandAt),
    msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null,
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || ""
  });

  if (guidanceTransition && !freshVoiceCommandForTransition) {
    recordVoiceDebugEvent("screen-transition-without-fresh-command", {
      previousScreen,
      nextScreen: screenName,
      previousScreenEnteredAt: roundVoiceTiming(previousScreenEnteredAt),
      at: getDebugTimestampIso(),
      lastAcceptedCommandAt: roundVoiceTiming(lastAcceptedCommandAt),
      msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null,
      lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
      lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || ""
    });
  }

  if (screenName === "cooking") {
    recordVoiceDebugEvent("screen-change-to-cooking", {
      previousScreen,
      nextScreen: screenName,
      at: getDebugTimestampIso(),
      lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
      lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
      msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null
    });
    recordCookingIntroDebugEvent("screen-change-to-cooking", {
      previousScreen,
      nextScreen: screenName,
      freshVoiceCommandForTransition
    }, {
      referenceTime: enteredAt,
      screenName: previousScreen
    });
  }

  if (isIntroScreen(screenName)) {
    const carriedOverCommandState = {
      introScreen: screenName,
      voiceLastTranscript: appState.voiceLastTranscript || "",
      voiceLastMatchedCommand: appState.voiceLastMatchedCommand || "",
      voiceLastAction: appState.voiceLastAction || "",
      lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
      lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
      msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null
    };

    appState.voiceLastTranscript = "";
    appState.voiceLastTranscriptAt = 0;
    appState.voiceLastMatchedCommand = "";
    appState.voiceLastAction = "";
    appState.voiceLastAcceptedCommandAt = 0;
    appState.voiceLastAcceptedCommandScreen = "";
    appState.voiceLastAcceptedCommandTranscript = "";
    appState.voiceHeard = "";
    appState.voiceExecuting = false;
    appState.voiceIntroAcceptCommandsAt = enteredAt + 450;
    lastVoiceHandledCommand = {
      key: "",
      transcript: "",
      at: 0
    };

    recordVoiceDebugEvent("intro-entered", {
      introScreen: screenName,
      previousScreen,
      freshVoiceCommandForTransition,
      acceptCommandsAfterMs: 450
    });
    recordVoiceDebugEvent("cookingIntro-stale-command-cleared", {
      ...carriedOverCommandState,
      acceptCommandsAfterMs: 450
    });
    recordCookingIntroDebugEvent("cookingIntro-stale-command-cleared", {
      ...carriedOverCommandState,
      acceptCommandsAfterMs: 450
    }, {
      referenceTime: enteredAt,
      screenName
    });
  }

  recordScreenEntryDebugEvent(screenName, {
    previousScreen,
    freshVoiceCommandForTransition,
    lastAcceptedCommandAt: roundVoiceTiming(lastAcceptedCommandAt),
    msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null,
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || ""
  });
  recordCookingIntroDebugEvent("entered-cookingIntro", {
    previousScreen,
    freshVoiceCommandForTransition,
    lastAcceptedCommandAt: roundVoiceTiming(lastAcceptedCommandAt),
    msSinceAcceptedVoiceCommand: lastAcceptedCommandAt ? roundVoiceTiming(enteredAt - lastAcceptedCommandAt) : null,
    lastAcceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
    lastAcceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || ""
  }, {
    referenceTime: enteredAt,
    screenName
  });

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
    stopMinimalVoiceController();
    stopTimer();
  } else if (appState.voiceEnabled && !isVoiceRecognitionAllowedOnScreen(screenName)) {
    suspendVoiceRecognitionForCurrentScreen("intro-click-only-screen");
  }

  switch (screenName) {
    case "onboarding":
      renderOnboarding();
      break;
    case "home":
      renderHome();
      break;
    case "menu":
      renderMenu();
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
      appState.cookingVoiceConsumedSessionId = 0;
      appState.cookingVoiceConsumedCommandKey = "";
      appState.cookingVoiceConsumedTranscript = "";
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

  if (VOICE_SYSTEM_ENABLED && appState.voiceEnabled && isVoiceRecognitionAllowedOnScreen(screenName) && !appState.voiceListening) {
    startVoiceCommands();
  }

  if (previousWasMinimalVoiceScreen && previousScreen !== screenName) {
    stopMinimalVoiceController();
  }

  if (nextIsMinimalVoiceScreen) {
    startMinimalVoiceController();
  } else {
    appState.voiceEnabled = false;
    appState.voiceUnlocked = false;
    appState.voiceListening = false;
    clearVoiceRecognitionActivity();
    clearMinimalVoiceTranscriptState();
  }

  updateTimerOverlay();
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

function normalizePrototypeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9°/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPrototypeKeyword(text, keywords) {
  const normalized = normalizePrototypeText(text);
  return keywords.some((keyword) => normalized.includes(normalizePrototypeText(keyword)));
}

function parseStepDurationSeconds(step) {
  if (Number.isFinite(step?.timerSeconds) && step.timerSeconds > 0) {
    return step.timerSeconds;
  }

  const text = String(step?.text || step || "");
  const hourMatch = text.match(/(\d+(?:\s*1\/2|\.\d+)?)\s*(hour|hours|hr|hrs)/i);
  if (hourMatch) {
    const raw = hourMatch[1].replace(/\s+/g, "");
    const hours = raw.includes("1/2") ? Number.parseInt(raw, 10) + 0.5 : Number.parseFloat(raw);
    if (Number.isFinite(hours)) {
      return Math.round(hours * 60 * 60);
    }
  }

  const minuteMatch = text.match(/(\d+)\s*(minute|minutes|min|mins)/i);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    if (Number.isFinite(minutes)) {
      return minutes * 60;
    }
  }

  return 0;
}

function isCookingLikeText(text) {
  return containsPrototypeKeyword(text, COOKING_KEYWORDS);
}

function isPrepLikeText(text) {
  return containsPrototypeKeyword(text, PREP_ACTION_KEYWORDS) || containsPrototypeKeyword(text, PREP_TRANSFORM_KEYWORDS);
}

function splitPrototypeClauses(text) {
  return String(text || "")
    .split(/\s*(?:\.|;|, then | then | and then )\s*/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function uniquePush(target, value) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

const INGREDIENT_PREP_PATTERNS = [
  { match: /\bfinely chopped\b|\bchopped\b/i, action: "chop", label: "Chop" },
  { match: /\bdiced\b/i, action: "dice", label: "Dice" },
  { match: /\bthinly sliced\b|\bsliced\b/i, action: "slice", label: "Slice" },
  { match: /\bminced\b/i, action: "mince", label: "Mince" },
  { match: /\bgrated\b/i, action: "grate", label: "Grate" },
  { match: /\bcrushed\b/i, action: "crush", label: "Crush" },
  { match: /\bpeeled\b/i, action: "peel", label: "Peel" },
  { match: /\btrimmed\b/i, action: "trim", label: "Trim" },
  { match: /\bshredded\b/i, action: "shred", label: "Shred" }
];

function cleanIngredientNameForPrepTask(ingredientText) {
  return String(ingredientText || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bfinely chopped\b|\bchopped\b|\bdiced\b|\bthinly sliced\b|\bsliced\b|\bminced\b|\bgrated\b|\bcrushed\b|\bpeeled\b|\btrimmed\b|\bshredded\b/gi, " ")
    .replace(/\b(of|and|with|plus|optional|to taste|divided)\b/gi, " ")
    .replace(/\b\d+(?:\/\d+)?(?:\.\d+)?\b/g, " ")
    .replace(/\b(cups?|tablespoons?|tbsp|teaspoons?|tsp|grams?|g|kg|ml|l|oz|lb|lbs|cloves?|bulbs?|heads?)\b/gi, " ")
    .replace(/[,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrepTasksFromIngredients(ingredients) {
  const tasks = [];
  const seenTexts = new Set();

  (Array.isArray(ingredients) ? ingredients : []).forEach((ingredientText) => {
    const ingredient = String(ingredientText || "").trim();
    if (!ingredient) {
      return;
    }

    const prepPattern = INGREDIENT_PREP_PATTERNS.find(({ match }) => match.test(ingredient));
    if (!prepPattern) {
      return;
    }

    const cleanedIngredientName = cleanIngredientNameForPrepTask(ingredient);
    if (!cleanedIngredientName) {
      return;
    }

    const article = /^[aeiou]/i.test(cleanedIngredientName) ? "an" : "the";
    const text = `${prepPattern.label} ${article} ${cleanedIngredientName}`.replace(/\s+/g, " ").trim();
    if (seenTexts.has(text)) {
      return;
    }

    seenTexts.add(text);
    tasks.push({
      ingredient: cleanedIngredientName,
      action: prepPattern.action,
      text
    });
  });

  return {
    prepTasksFromIngredients: tasks
  };
}

function extractIngredientTokensForPrototype(ingredient) {
  const normalized = normalizePrototypeText(ingredient)
    .replace(/\b(optional|plus|divided|between|small|large|medium|fresh|ground|extra-virgin|well|crosswise|pieces|piece|pinch|cups?|tablespoons?|tbsp|teaspoons?|tsp|grams?|g|kg|ml|oz|lb|lbs)\b/g, " ")
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    .split(" ")
    .filter((token) => token.length > 2 && !PREP_TRANSFORM_KEYWORDS.includes(token));
}

function ingredientHasPrepDescriptor(ingredient) {
  return containsPrototypeKeyword(ingredient, PREP_TRANSFORM_KEYWORDS);
}

function hasLongTimerBeforeIndex(cookingSteps, targetIndex) {
  for (let i = 0; i < targetIndex; i += 1) {
    if (parseStepDurationSeconds(cookingSteps[i]) >= LONG_TIMER_THRESHOLD_SECONDS) {
      return true;
    }
  }
  return false;
}

function findEarliestCookingMentionIndex(ingredient, cookingSteps) {
  const tokens = extractIngredientTokensForPrototype(ingredient);
  if (tokens.length === 0) {
    return -1;
  }

  for (let i = 0; i < cookingSteps.length; i += 1) {
    const normalizedStep = normalizePrototypeText(cookingSteps[i]?.text || cookingSteps[i]);
    if (tokens.some((token) => normalizedStep.includes(token))) {
      return i;
    }
  }

  return -1;
}

function extractPrepClausesFromCookingStep(text) {
  return splitPrototypeClauses(text)
    .filter((clause) => isPrepLikeText(clause) && !isCookingLikeText(clause));
}

function classifyRecipeExecutionFlow(recipe) {
  const prepRequirementsBeforeCooking = [];
  const optionalPrepDuringLongTimers = [];
  const cookingSteps = [];
  const rawCookingSteps = Array.isArray(recipe?.cookingSteps) ? recipe.cookingSteps : [];
  const rawPreparationSteps = Array.isArray(recipe?.preparationSteps) ? recipe.preparationSteps : [];

  rawPreparationSteps.forEach((step) => {
    if (step && !isCookingLikeText(step)) {
      uniquePush(prepRequirementsBeforeCooking, String(step).trim());
    }
  });

  rawCookingSteps.forEach((step, index) => {
    const text = String(step?.text || step || "").trim();
    if (!text) {
      return;
    }

    const prepOnlyStep = isPrepLikeText(text) && !isCookingLikeText(text);
    if (prepOnlyStep && hasLongTimerBeforeIndex(rawCookingSteps, index)) {
      uniquePush(optionalPrepDuringLongTimers, text);
      return;
    }

    extractPrepClausesFromCookingStep(text).forEach((clause) => {
      uniquePush(prepRequirementsBeforeCooking, clause);
    });

    uniquePush(cookingSteps, text);
  });

  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  ingredients.forEach((ingredient) => {
    if (!ingredientHasPrepDescriptor(ingredient)) {
      return;
    }

    if (/\boptional\b/i.test(ingredient) && findEarliestCookingMentionIndex(ingredient, rawCookingSteps) === -1) {
      return;
    }

    const firstMentionIndex = findEarliestCookingMentionIndex(ingredient, rawCookingSteps);
    if (firstMentionIndex > 1 && hasLongTimerBeforeIndex(rawCookingSteps, firstMentionIndex)) {
      uniquePush(optionalPrepDuringLongTimers, ingredient);
      return;
    }

    uniquePush(prepRequirementsBeforeCooking, ingredient);
  });

  return {
    prepRequirementsBeforeCooking,
    cookingSteps,
    optionalPrepDuringLongTimers
  };
}

function normalizeRecipeForGuidance(recipe) {
  const cloned = JSON.parse(JSON.stringify(recipe));
  console.log("[recipe-shape] raw parsed recipe", {
    title: cloned.title,
    preparationSteps: cloned.preparationSteps,
    cookingSteps: cloned.cookingSteps,
    preparationCount: Array.isArray(cloned.preparationSteps) ? cloned.preparationSteps.length : 0,
    cookingCount: Array.isArray(cloned.cookingSteps) ? cloned.cookingSteps.length : 0
  });
  cloned.preparationSteps = splitPreparationActions(cloned.preparationSteps || []);
  cloned.executionFlowPrototype = classifyRecipeExecutionFlow(cloned);
  cloned.prepTaskPrototype = extractPrepTasksFromIngredients(cloned.ingredients || []);
  console.log("[recipe-shape] normalized recipe for guidance", {
    title: cloned.title,
    preparationSteps: cloned.preparationSteps,
    cookingSteps: cloned.cookingSteps,
    preparationCount: Array.isArray(cloned.preparationSteps) ? cloned.preparationSteps.length : 0,
    cookingCount: Array.isArray(cloned.cookingSteps) ? cloned.cookingSteps.length : 0
  });
  return cloned;
}

function getRecipeFlowPrototypeExamples() {
  return RECIPE_FLOW_PROTOTYPE_EXAMPLES.map((recipe) => ({
    title: recipe.title,
    sourceUrl: recipe.sourceUrl,
    classification: classifyRecipeExecutionFlow(recipe),
    prepTaskPrototype: extractPrepTasksFromIngredients(recipe.ingredients || [])
  }));
}

window.classifyRecipeExecutionFlow = classifyRecipeExecutionFlow;
window.getRecipeFlowPrototypeExamples = getRecipeFlowPrototypeExamples;
window.extractPrepTasksFromIngredients = extractPrepTasksFromIngredients;

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
  const voiceAvailableOnScreen = isMinimalVoiceAvailableOnScreen();
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
  if (appState.voiceListening && voiceAvailableOnScreen) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceEnabled && voiceAvailableOnScreen;
  voiceToggleInput.disabled = true;
  voiceToggleInput.addEventListener("click", (event) => {
    event.preventDefault();
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
  const voiceAvailableOnScreen = isMinimalVoiceAvailableOnScreen();
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
  if (appState.voiceEnabled && voiceAvailableOnScreen) {
    voiceRow.classList.add("voice-active");
  } else {
    voiceRow.classList.add("voice-off", "voice-panel--cta");
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
  voiceText.textContent = !voiceAvailableOnScreen
    ? "Voice unavailable on this screen"
    : appState.voiceEnabled
    ? (showListeningText && appState.voiceListening ? "Voice listening" : "Voice")
    : "Enable voice control";
  voiceLabel.append(voiceIcon, voiceText);

  const enableVoiceFromPanel = () => {
    return;
  };

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (animateListening && appState.voiceListening && voiceAvailableOnScreen) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceEnabled && voiceAvailableOnScreen;
  voiceToggleInput.disabled = true;
  voiceToggleInput.addEventListener("click", (event) => {
    event.preventDefault();
  });
  voiceSwitchLabel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const slider = document.createElement("span");
  slider.className = "slider";
  voiceSwitchLabel.append(voiceToggleInput, slider);

  const controls = document.createElement("div");
  controls.className = "voice-strip-controls";
  controls.appendChild(voiceSwitchLabel);

  if (showUnlockButton && appState.voiceUnlocked) {
    const readyState = document.createElement("span");
    readyState.className = "voice-ready-badge";
    readyState.textContent = readyLabel;
    controls.appendChild(readyState);
  }

  voiceRow.append(voiceLabel, controls);

  return voiceRow;
}

function unlockVoiceAssistant(options = {}) {
  if (!VOICE_SYSTEM_ENABLED) {
    appState.voiceUnlocked = false;
    appState.voiceEnabled = false;
    appState.voiceListening = false;
    appState.voiceErrorMessage = "";
    setVoiceCommandStatus("", 0);
    renderCurrentVoiceScreen();
    return;
  }

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
  if (!VOICE_SYSTEM_ENABLED) {
    if (typeof onContinue === "function") {
      onContinue();
    }
    return;
  }

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
  if (appState.currentScreen === "preparationIntro" && !hasIntroAdvanceApproval("preparationIntro", "preparation")) {
    logIntroAdvanceEvent("intro-advance-blocked", {
      source: "blocked-auto-path",
      targetScreen: "preparation",
      detail: "startPreparationFlow called without explicit intro approval"
    }, {
      introScreenName: "preparationIntro",
      source: "blocked-auto-path"
    });
    logIntroAdvanceEvent("intro-advance-blocked-auto", {
      source: "blocked-auto-path",
      targetScreen: "preparation",
      detail: "startPreparationFlow called without explicit click approval"
    }, {
      introScreenName: "preparationIntro",
      source: "blocked-auto-path"
    });
    logIntroAdvanceEvent("intro-advance-blocked-auto", {
      source: "blocked-auto-path",
      targetScreen: "preparation",
      detail: "startPreparationFlow called without explicit click approval"
    }, {
      introScreenName: "preparationIntro",
      source: "blocked-auto-path"
    });
    return;
  }
  recordAutoFlowDebugEvent("auto-start-preparation-flow", {
    trigger: "startPreparationFlow"
  });
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
      recordAutoFlowDebugEvent("auto-start-preparation-speech-cancelled", {
        trigger: "requestAnimationFrame",
        currentScreen: appState.currentScreen,
        preparationIndex: appState.preparationIndex
      });
      return;
    }
    recordAutoFlowDebugEvent("auto-start-preparation-speech", {
      trigger: "requestAnimationFrame",
      preparationIndex: appState.preparationIndex
    });
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
    recordAutoFlowDebugEvent("transition-preparation-complete-to-cookingIntro", {
      trigger: "advancePreparationStep:end-of-preparation",
      preparationIndex: appState.preparationIndex,
      totalPreparationSteps: total
    });
    const screenBefore = appState.currentScreen;
    const preparationIndexBefore = appState.preparationIndex;
    const cookingIndexBefore = appState.cookingIndex;

    console.log("[preparation] End of preparation reached; transition to cooking intro", {
      screenBefore,
      screenAfter: "cookingIntro",
      preparationIndexBefore,
      preparationIndexAfter: appState.preparationIndex,
      cookingIndexBefore,
      cookingIndexAfter: 0
    });
    recordVoiceDebugEvent("preparation-complete-to-cooking-intro", {
      screenBefore,
      screenAfter: "cookingIntro",
      preparationIndexBefore,
      preparationIndexAfter: appState.preparationIndex,
      cookingIndexBefore,
      cookingIndexAfter: 0,
      totalPreparationSteps: total
    });
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
    recordAutoFlowDebugEvent("auto-advance-cooking-to-completed", {
      trigger: "goToNextCookingStep:end-of-cooking",
      cookingIndex: appState.cookingIndex
    });
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
  updateTimerOverlay();

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
  updateTimerOverlay();
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

function enterCookingFlow(context = {}) {
  if (appState.currentScreen === "cookingIntro" && !hasIntroAdvanceApproval("cookingIntro", "cooking")) {
    logIntroAdvanceEvent("intro-advance-blocked", {
      source: "blocked-auto-path",
      targetScreen: "cooking",
      detail: "enterCookingFlow called without explicit intro approval"
    }, {
      introScreenName: "cookingIntro",
      source: "blocked-auto-path"
    });
    logIntroAdvanceEvent("intro-advance-blocked-auto", {
      source: "blocked-auto-path",
      targetScreen: "cooking",
      detail: "enterCookingFlow called without explicit click approval"
    }, {
      introScreenName: "cookingIntro",
      source: "blocked-auto-path"
    });
    logIntroAdvanceEvent("intro-advance-blocked-auto", {
      source: "blocked-auto-path",
      targetScreen: "cooking",
      detail: "enterCookingFlow called without explicit click approval"
    }, {
      introScreenName: "cookingIntro",
      source: "blocked-auto-path"
    });
    recordCookingIntroDebugEvent("cookingIntro-auto-start-triggered", {
      triggerSource: context.source || "unknown",
      triggerDetail: context.triggerDetail || "enterCookingFlow called without explicit intro approval",
      freshCommandForCookingIntro: false,
      carriedOverState: true,
      blockedBeforeTransition: true
    });
    return;
  }
  const screenBefore = appState.currentScreen;
  const cookingIndexBefore = appState.cookingIndex;
  const timerBefore = getVoiceTimerSnapshot();
  const now = getVoiceTimestamp();
  const currentScreenIsCookingIntro = screenBefore === "cookingIntro";
  const triggerSource = context.source || "unknown";
  const hasFreshCommand = Boolean(
    currentScreenIsCookingIntro &&
    Number.isFinite(appState.voiceLastAcceptedCommandAt) &&
    appState.voiceLastAcceptedCommandAt >= appState.voiceScreenEnteredAt
  );

  if (currentScreenIsCookingIntro) {
    const carriedOverState = !hasFreshCommand;
    recordCookingIntroDebugEvent("startCookingFlow-called", {
      triggerSource,
      triggerDetail: context.triggerDetail || "",
      freshCommandForCookingIntro: hasFreshCommand,
      carriedOverState,
      acceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
      acceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
      msSinceAcceptedCommand: Number(appState.voiceLastAcceptedCommandAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastAcceptedCommandAt)
        : null,
      msSinceLastTranscript: Number(appState.voiceLastTranscriptAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastTranscriptAt)
        : null,
      msSinceRecognitionStart: Number(appState.voiceLastRecognitionStartAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastRecognitionStartAt)
        : null,
      msSinceRecognitionEnd: Number(appState.voiceLastRecognitionEndAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastRecognitionEndAt)
        : null,
      msSinceRecognitionRestartRequest: Number(appState.voiceLastRecognitionRestartRequestAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastRecognitionRestartRequestAt)
        : null,
      msSinceAppSpeechStart: Number(appState.voiceLastAppSpeechStartAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastAppSpeechStartAt)
        : null,
      msSinceAppSpeechEnd: Number(appState.voiceLastAppSpeechEndAt || 0)
        ? roundVoiceTiming(now - appState.voiceLastAppSpeechEndAt)
        : null,
      voiceListening: appState.voiceListening,
      voiceOutputSpeaking: appState.voiceOutputSpeaking,
      timerStatus: appState.timerStatus
    }, {
      referenceTime: now
    });
    recordCookingIntroDebugEvent("cookingIntro-start-cooking-called", {
      triggerSource,
      triggerDetail: context.triggerDetail || "",
      freshCommandForCookingIntro: hasFreshCommand,
      carriedOverState
    }, {
      referenceTime: now
    });

    if (!hasFreshCommand || triggerSource !== "voice-next") {
      recordCookingIntroDebugEvent("cookingIntro-auto-start-triggered", {
        triggerSource,
        triggerDetail: context.triggerDetail || "",
        freshCommandForCookingIntro: hasFreshCommand,
        carriedOverState,
        acceptedCommandTranscript: appState.voiceLastAcceptedCommandTranscript || "",
        acceptedCommandScreen: appState.voiceLastAcceptedCommandScreen || "",
        msSinceAcceptedCommand: Number(appState.voiceLastAcceptedCommandAt || 0)
          ? roundVoiceTiming(now - appState.voiceLastAcceptedCommandAt)
          : null,
        msSinceLastTranscript: Number(appState.voiceLastTranscriptAt || 0)
          ? roundVoiceTiming(now - appState.voiceLastTranscriptAt)
          : null,
        msSinceRecognitionRestartRequest: Number(appState.voiceLastRecognitionRestartRequestAt || 0)
          ? roundVoiceTiming(now - appState.voiceLastRecognitionRestartRequestAt)
          : null
      }, {
        referenceTime: now
      });
    }
  }

  appState.cookingIndex = 0;
  appState.activeTimerSeconds = null;
  appState.timerPaused = false;
  appState.timerSkippedStepIndex = null;
  setTimerStatus("idle", "enter cooking flow");
  setScreen("cooking");

  console.log("[cooking-intro] Entering cooking flow", {
    screenBefore,
    screenAfter: appState.currentScreen,
    cookingIndexBefore,
    cookingIndexAfter: appState.cookingIndex,
    timerBefore,
    timerAfter: getVoiceTimerSnapshot()
  });
  recordVoiceDebugEvent("cooking-intro-enter-flow", {
    screenBefore,
    screenAfter: appState.currentScreen,
    cookingIndexBefore,
    cookingIndexAfter: appState.cookingIndex,
    timerBefore,
    timerAfter: getVoiceTimerSnapshot()
  });
}

function shouldIgnoreIntroCommand(commandText, timing = {}) {
  if (!isIntroScreen(appState.currentScreen)) {
    return false;
  }

  const transcriptReceivedAt = Number.isFinite(timing.transcriptReceivedAt)
    ? timing.transcriptReceivedAt
    : getVoiceTimestamp();
  const acceptAt = Number(appState.voiceIntroAcceptCommandsAt || 0);
  if (!acceptAt || transcriptReceivedAt >= acceptAt) {
    return false;
  }

  recordVoiceDebugEvent("intro-auto-advance-blocked", {
    introScreen: appState.currentScreen,
    transcript: commandText,
    normalizedTranscript: normalizeVoiceCommandText(commandText),
    reason: "received-before-intro-freshness-gate",
    ignoredUntilMs: roundVoiceTiming(acceptAt - transcriptReceivedAt)
  });
  recordVoiceDebugEvent("cookingIntro-command-ignored-as-carried-over", {
    transcript: commandText,
    normalizedTranscript: normalizeVoiceCommandText(commandText),
    reason: "received-before-intro-freshness-gate",
    ignoredUntilMs: roundVoiceTiming(acceptAt - transcriptReceivedAt)
  });
  recordCookingIntroDebugEvent("cookingIntro-command-ignored-as-carried-over", {
    transcript: commandText,
    normalizedTranscript: normalizeVoiceCommandText(commandText),
    reason: "received-before-cookingIntro-freshness-gate",
    ignoredUntilMs: roundVoiceTiming(acceptAt - transcriptReceivedAt)
  }, {
    referenceTime: transcriptReceivedAt
  });
  recordCookingIntroDebugEvent("cookingIntro-command-ignored", {
    transcript: commandText,
    normalizedTranscript: normalizeVoiceCommandText(commandText),
    reason: "carried-over",
    ignoredUntilMs: roundVoiceTiming(acceptAt - transcriptReceivedAt)
  }, {
    referenceTime: transcriptReceivedAt
  });

  return true;
}

function handleVoiceCommand(commandText, options = {}) {
  if (!VOICE_SYSTEM_ENABLED) {
    return;
  }

  if (getVoiceScreenMode() === "off") {
    return;
  }

  const command = normalizeVoiceCommandText(commandText);
  const timing = {
    transcriptReceivedAt: options.transcriptReceivedAt ?? null,
    source: options.source || "final",
    isFinal: Boolean(options.isFinal),
    commandKey: options.commandKey || null,
    matchedAt: null
  };

  if (getVoiceScreenMode() === "cooking") {
    const cookingCommandMap = {
      next: "next",
      repeat: "repeat",
      "skip timer": "skip_timer"
    };
    const cookingCommandKey = cookingCommandMap[command] || "";
    if (cookingCommandKey === "next") {
      recordCookingVoiceDebugEvent("cooking-voice-next-received", {
        transcript: command,
        rawTranscript: commandText,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        screenMode: getVoiceScreenMode()
      });
      recordCookingVoiceDebugEvent("cooking-voice-next-received-on-step", {
        transcript: command,
        rawTranscript: commandText,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        consumedSessionId: appState.cookingVoiceConsumedSessionId || 0,
        commandLockUntil: appState.voiceCommandLockUntil || 0,
        screenMode: getVoiceScreenMode()
      });
      console.warn("[cooking-debug] cooking-voice-next-received", {
        transcript: command,
        rawTranscript: commandText,
        screen: appState.currentScreen,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        commandLockUntil: appState.voiceCommandLockUntil || 0,
        screenMode: getVoiceScreenMode(),
        source: timing.source || "unknown"
      });
    }
    if (!cookingCommandKey) {
      recordCookingVoiceDebugEvent("cooking-command-rejected", {
        reason: "invalid-command",
        commandKey: "",
        transcript: command
      });
      resetCookingVoiceLiveState("invalid-command");
      return;
    }
    executeCookingVoiceCommand(cookingCommandKey, commandText, timing);
    return;
  }

  if (shouldIgnoreIntroCommand(commandText, timing)) {
    return;
  }

  if (INTRO_SCREENS_CLICK_ONLY_DEBUG && isIntroScreen(appState.currentScreen) && command === "next") {
    const blockedAt = Number.isFinite(timing.transcriptReceivedAt) ? timing.transcriptReceivedAt : getVoiceTimestamp();
    logIntroAdvanceEvent("intro-advance-blocked-voice", {
      source: "fresh-voice",
      transcript: commandText,
      normalizedTranscript: command,
      reason: "intro-click-only-debug-mode"
    }, {
      referenceTime: blockedAt,
      introScreenName: appState.currentScreen,
      source: "voice"
    });
    setVoiceCommandStatus("Listening...", 0);
    renderCurrentVoiceScreen();
    return;
  }

  if (isVoiceCommandLocked()) {
    recordVoiceDebugEvent("command-ignored-lock", {
      transcript: commandText,
      matchedCommand: options.commandKey || "",
      commandLockReason: appState.voiceCommandLockReason || "",
      commandLockRemainingMs: getVoiceCommandLockRemainingMs()
    });
    recordPreparationVoiceDebugEvent("command-ignored-lock", {
      transcript: commandText,
      matchedCommand: options.commandKey || "",
      commandLockReason: appState.voiceCommandLockReason || "",
      commandLockRemainingMs: getVoiceCommandLockRemainingMs()
    });
    return;
  }

  setVoiceCommandStatus("Processing voice command...", 700);

  function matchCommand(commandKey) {
    timing.commandKey = commandKey;
    timing.matchedAt = getVoiceTimestamp();
    appState.voiceLastAction = "";
    appState.voiceLastAcceptedCommandAt = timing.matchedAt;
    appState.voiceLastAcceptedCommandScreen = appState.currentScreen;
    appState.voiceLastAcceptedCommandTranscript = command;
    if (commandKey === "next") {
      console.log("[voice-debug] next accepted", {
        transcript: commandText,
        normalizedTranscript: command,
        screen: appState.currentScreen
      });
    }
    recordVoiceDebugEvent("command-accepted-after-screen-change", {
      commandKey,
      transcript: commandText,
      normalizedTranscript: command,
      msSinceScreenEnter: getMsSinceScreenEnter(timing.matchedAt),
      acceptedOnScreen: appState.currentScreen
    });
    if (isIntroScreen(appState.currentScreen) && commandKey === "next") {
      recordVoiceDebugEvent("intro-advance-triggered-by-fresh-voice-command", {
        introScreen: appState.currentScreen,
        transcript: commandText,
        normalizedTranscript: command
      });
    }
    recordCookingIntroDebugEvent("cookingIntro-command-accepted", {
      commandKey,
      transcript: commandText,
      normalizedTranscript: command,
      acceptedOnScreen: appState.currentScreen
    }, {
      referenceTime: timing.matchedAt
    });
    if (commandKey === "next") {
      recordCookingIntroDebugEvent("cookingIntro-next-accepted", {
        transcript: commandText,
        normalizedTranscript: command,
        acceptedOnScreen: appState.currentScreen
      }, {
        referenceTime: timing.matchedAt
      });
    }
    logVoiceCommandMatch(commandKey, commandText, timing);
  }

  if (appState.currentScreen === "ingredientsIntro") {
    if (command === "next") {
      matchCommand("next");
      setVoiceCommandLock("ingredientsIntro:continue");
      runVoiceAction("next", "Continue", () => {
        requestIntroAdvance(
          "ingredientsIntro",
          "fresh-voice",
          timing.matchedAt || getVoiceTimestamp(),
          () => setScreen("ingredients"),
          "voice-next"
        );
      }, 0, timing);
      return;
    }
  }

  if (appState.currentScreen === "preparationIntro") {
    if (command === "next") {
      matchCommand("next");
      setVoiceCommandLock("preparationIntro:continue");
      runVoiceAction("next", "Continue", () => {
        requestIntroAdvance(
          "preparationIntro",
          "fresh-voice",
          timing.matchedAt || getVoiceTimestamp(),
          () => startPreparationFlow(),
          "voice-next"
        );
      }, 0, timing);
      return;
    }
  }

  if (appState.currentScreen === "ingredients") {
    recordVoiceDebugEvent("ingredient-voice-heard", {
      transcript: commandText,
      normalizedTranscript: command
    });

    if (command === "next") {
      matchCommand("next");
      setVoiceCommandLock("ingredients:ready");
      runVoiceAction("next", "Ready", () => {
        setScreen("preparationIntro");
      }, 0, timing);
      return;
    }

    const ingredientIndex = findIngredientIndexFromVoice(command);
    if (ingredientIndex >= 0) {
      recordVoiceDebugEvent("ingredient-match-found", {
        transcript: commandText,
        normalizedTranscript: command,
        ingredientIndex,
        ingredient: appState.recipe?.ingredients?.[ingredientIndex] || ""
      });
      matchCommand("check_ingredient");
      const screenBefore = appState.currentScreen;
      const timerBefore = getVoiceTimerSnapshot();
      highlightVoiceIngredient(ingredientIndex);
      markVoiceCommandExecuted("Check Ingredient");
      appState.voiceLastAction = "check-ingredient";
      recordVoiceDebugEvent("action-before", {
        transcript: commandText,
        matchedCommand: "check_ingredient",
        action: "check-ingredient",
        screenBefore,
        timerBefore
      });
      window.setTimeout(() => {
        logVoiceTiming("action-executed", {
          commandKey: "check_ingredient",
          actionName: "check-ingredient",
          commandLabel: "Check Ingredient",
          matchToActionMs: roundVoiceTiming(getVoiceTimestamp() - timing.matchedAt)
        });
        setIngredientChecked(ingredientIndex, true);
        clearVoiceIngredientHighlight();
        renderIngredients();
        recordVoiceDebugEvent("ingredient-checked-by-voice", {
          transcript: commandText,
          normalizedTranscript: command,
          ingredientIndex,
          ingredient: appState.recipe?.ingredients?.[ingredientIndex] || ""
        });
        recordVoiceDebugEvent("action-after", {
          transcript: commandText,
          matchedCommand: "check_ingredient",
          action: "check-ingredient",
          screenBefore,
          screenAfter: appState.currentScreen,
          timerBefore,
          timerAfter: getVoiceTimerSnapshot()
        });
      }, 140);
      return;
    }

    recordVoiceDebugEvent("ingredient-match-not-found", {
      transcript: commandText,
      normalizedTranscript: command
    });
  }

  if (command === "next") {
    if (appState.currentScreen === "cookingIntro") {
      matchCommand("next");
      setVoiceCommandLock("cookingIntro:next");
      runVoiceAction("next", "Start Cooking", () => {
        requestIntroAdvance(
          "cookingIntro",
          "fresh-voice",
          timing.matchedAt || getVoiceTimestamp(),
          () => enterCookingFlow({
            source: "voice-next",
            triggerDetail: "cookingIntro-command-accepted"
          }),
          "voice-next"
        );
      }, 0, timing);
      return;
    }

    if (appState.currentScreen === "preparation") {
      matchCommand("next");
      setVoiceCommandLock("preparation:next");
      if (appState.recipe && appState.preparationIndex >= appState.recipe.preparationSteps.length - 1) {
        console.log("[preparation] Final preparation command received", {
          transcript: commandText,
          preparationIndex: appState.preparationIndex
        });
        recordVoiceDebugEvent("preparation-final-command", {
          transcript: commandText,
          preparationIndex: appState.preparationIndex
        });
      }
      runVoiceAction("next", "Next", () => {
        advancePreparationStep();
      }, 0, timing);
      return;
    }

    if (appState.currentScreen === "timerActive" && !canProceedFromTimerStep()) {
      setVoiceHint("Timer is still running. Say skip timer or wait.", 2200);
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
      return;
    }

    matchCommand("next");
    setVoiceCommandLock("cooking:next");
    runVoiceAction("next", "Next", () => {
      goToNextCookingStep();
    }, 0, timing);
    return;
  }

  if (command === "repeat") {
    if (appState.currentScreen === "preparation") {
      matchCommand("repeat");
      runVoiceAction("repeat", "Repeat", () => {
        const prepText = getCurrentPreparationText();
        if (prepText) {
          speak(prepText);
        }
      }, 0, timing);
      return;
    }

    matchCommand("repeat");
    runVoiceAction("repeat", "Repeat", () => {
      repeatCurrentCookingStep();
    }, 0, timing);
    return;
  }

  if (command === "pause timer") {
    matchCommand("pause_timer");
    runVoiceAction("pause", "Pause", () => {
      toggleGuidancePause();
    }, 0, timing);
    return;
  }

  if (command === "skip timer") {
    matchCommand("skip_timer");
    setVoiceCommandLock("timer:skip");
    runVoiceAction("skip-timer", "Skip Timer", () => {
      skipTimerAndAdvance();
    }, 0, timing);
    return;
  }

  console.log("[voice-debug] transcript ignored: invalid command", {
    transcript: commandText,
    normalizedTranscript: command,
    screen: appState.currentScreen
  });
  recordVoiceDebugEvent("command-ignored-after-screen-change", {
    transcript: commandText,
    normalizedTranscript: command,
    reason: "invalid-command",
    msSinceScreenEnter: getMsSinceScreenEnter()
  });
  recordCookingIntroDebugEvent("cookingIntro-command-ignored", {
    transcript: commandText,
    normalizedTranscript: command,
    reason: "invalid-command"
  });
  recordVoiceDebugEvent("command-invalid", {
    transcript: commandText,
    normalizedTranscript: command
  });

  if (appState.voiceListening) {
    recordVoiceDebugEvent("command-no-match", {
      transcript: commandText
    });
    setVoiceCommandStatus("Listening...", 0);
    renderCurrentVoiceScreen();
  }
}

function startVoiceCommands() {
  if (!VOICE_SYSTEM_ENABLED) {
    appState.voiceEnabled = false;
    appState.voiceListening = false;
    appState.voiceErrorMessage = "";
    resetVoiceActivityState();
    appState.voiceExecuting = false;
    appState.voiceHeard = "";
    setVoiceCommandStatus("", 0);
    renderCurrentVoiceScreen();
    return;
  }

  if (!SpeechRecognition) {
    appState.voiceEnabled = false;
    appState.voiceErrorMessage = "Voice input is not supported in this browser.";
    renderCurrentVoiceScreen();
    return;
  }

  appState.voiceEnabled = true;
  appState.voiceErrorMessage = "";

  if (getVoiceScreenMode() === "off") {
    appState.voiceListening = false;
    clearVoiceRecognitionActivity();
    setVoiceCommandStatus("", 0);
    renderCurrentVoiceScreen();
    return;
  }

  if (appState.voiceListening) {
    renderCurrentVoiceScreen();
    return;
  }

  if (!voiceRecognition) {
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.lang = "en-US";
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;

    voiceRecognition.onresult = (event) => {
      let latestTranscript = "";
      let latestIsFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = (result?.[0]?.transcript || "").trim();
        if (!transcript) {
          continue;
        }
        latestTranscript = transcript;
        latestIsFinal = Boolean(result.isFinal);
      }

      if (!latestTranscript) {
        return;
      }

      const fastCommand = getFastVoiceCommand(latestTranscript);
      if (getVoiceScreenMode() === "cooking" && shouldIgnoreConsumedCookingVoiceResult(latestTranscript, fastCommand?.key || "")) {
        return;
      }

      const transcriptTiming = logVoiceTranscriptArrival(latestTranscript, {
        source: latestIsFinal ? "final" : "interim",
        isFinal: latestIsFinal
      });

      if (getVoiceScreenMode() === "off") {
        appState.voiceHeard = "";
        clearVoiceRecognitionActivity();
        setVoiceCommandStatus("", 0);
        return;
      }

      if (getVoiceScreenMode() === "cooking" && appState.voiceOutputSpeaking) {
        recordCookingVoiceDebugEvent("cooking-command-rejected", {
          reason: "app-speaking",
          commandKey: fastCommand?.key || "",
          transcript: normalizeVoiceCommandText(latestTranscript)
        });
        if (appState.timerStatus === "completed" && (fastCommand?.key || "") === "next") {
          recordCookingVoiceDebugEvent("cooking-voice-next-blocked-after-timer", {
            reason: "app-speaking",
            transcript: normalizeVoiceCommandText(latestTranscript)
          });
        }
        resetCookingVoiceLiveState("app-speaking-result");
        return;
      }

      const ignoredPreparationReason = shouldIgnorePreparationTranscript(latestTranscript, transcriptTiming);
      if (ignoredPreparationReason) {
        return;
      }

      appState.voiceHeard = latestTranscript;
      pulseVoiceRecognitionActivity();
      const heardLabel = latestTranscript.length > 26 ? `${latestTranscript.slice(0, 26)}...` : latestTranscript;
      setVoiceCommandStatus(`Heard: ${heardLabel}`, latestIsFinal ? 1000 : 350);
      renderCurrentVoiceScreen();

      if (fastCommand) {
        if (getVoiceScreenMode() !== "cooking" && shouldSuppressDuplicateVoiceCommand(fastCommand.key, latestTranscript)) {
          return;
        }

        handleVoiceCommand(latestTranscript, {
          ...transcriptTiming,
          commandKey: fastCommand.key
        });
        return;
      }

      if (latestIsFinal) {
        handleVoiceCommand(latestTranscript, transcriptTiming);
      }
    };

    voiceRecognition.onstart = () => {
      if (!appState.voiceEnabled) {
        return;
      }
      appState.voiceLastRecognitionStartAt = getVoiceTimestamp();
      logVoiceTiming("recognition-started", {
        screen: appState.currentScreen
      });
      recordCookingIntroDebugEvent("recognition-start", {
        voiceEnabled: appState.voiceEnabled,
        voiceListeningBeforeStart: appState.voiceListening
      }, {
        referenceTime: appState.voiceLastRecognitionStartAt
      });
      recordPreparationVoiceDebugEvent("recognition-start", {
        screen: appState.currentScreen
      });
      appState.voiceListening = true;
      appState.voiceUserSpeaking = false;
      setVoiceCommandStatus("Listening...", 0);
      renderCurrentVoiceScreen();
    };

    voiceRecognition.onspeechstart = () => {
      if (!appState.voiceEnabled) {
        return;
      }
      appState.voiceRecognitionSessionId += 1;
      setVoiceRecognitionActivity(true);
    };

    voiceRecognition.onspeechend = () => {
      lastVoiceSpeechEndAt = getVoiceTimestamp();
      logVoiceTiming("speech-ended", {});
      clearVoiceRecognitionActivity();
    };

    voiceRecognition.onend = () => {
      appState.voiceLastRecognitionEndAt = getVoiceTimestamp();
      logVoiceTiming("recognition-ended", {
        voiceEnabled: appState.voiceEnabled,
        screen: appState.currentScreen
      });
      recordCookingIntroDebugEvent("recognition-end", {
        voiceEnabled: appState.voiceEnabled,
        willAttemptRestart: Boolean(appState.voiceEnabled && isVoiceRecognitionAllowedOnScreen(appState.currentScreen))
      }, {
        referenceTime: appState.voiceLastRecognitionEndAt
      });
      recordPreparationVoiceDebugEvent("recognition-end", {
        screen: appState.currentScreen,
        voiceEnabled: appState.voiceEnabled
      });
      appState.voiceListening = false;
      clearVoiceRecognitionActivity();
      if (appState.voiceEnabled && isVoiceRecognitionAllowedOnScreen(appState.currentScreen)) {
        appState.voiceLastRecognitionRestartRequestAt = getVoiceTimestamp();
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
      logVoiceTiming("recognition-error", {
        error: event && event.error ? String(event.error) : "unknown"
      });
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
    logVoiceTiming("recognition-start-requested", {
      screen: appState.currentScreen
    });
  } catch (error) {
    const errorName = error && error.name ? String(error.name) : "";
    const errorMessage = error && error.message ? String(error.message) : "";
    const recoverableStartState = errorName === "InvalidStateError" || /start/i.test(errorMessage);

    if (recoverableStartState) {
      appState.voiceEnabled = true;
      appState.voiceListening = true;
      appState.voiceErrorMessage = "";
      setVoiceCommandStatus("Listening...", 0);
      if (appState.currentScreen === "cooking") {
        recordCookingVoiceDebugEvent("cooking-voice-ready-restored", {
          reason: "recognition-already-active",
          errorName,
          errorMessage,
          cookingIndex: appState.cookingIndex,
          timerStatus: appState.timerStatus,
          screenMode: getVoiceScreenMode()
        });
        recordCookingVoicePanelState("recognition-already-active", {
          errorName,
          errorMessage
        });
      }
    } else {
      appState.voiceEnabled = false;
      appState.voiceErrorMessage = "Could not start voice input. Check microphone permission and try again.";
      setVoiceCommandStatus("", 0);
      if (appState.currentScreen === "cooking") {
        recordCookingVoiceDebugEvent("cooking-voice-ready-not-restored", {
          reason: "recognition-start-failed",
          errorName,
          errorMessage,
          cookingIndex: appState.cookingIndex,
          timerStatus: appState.timerStatus,
          screenMode: getVoiceScreenMode()
        });
        recordCookingVoicePanelState("recognition-start-failed", {
          errorName,
          errorMessage
        });
      }
    }
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
  clearVoiceCommandLock("voice-stopped");
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
  if (!VOICE_SYSTEM_ENABLED) {
    appState.voiceEnabled = false;
    appState.voiceListening = false;
    appState.voiceErrorMessage = "";
    resetVoiceActivityState();
    appState.voiceExecuting = false;
    appState.voiceHeard = "";
    clearVoiceCommandLock("voice-disabled");
    setVoiceCommandStatus("", 0);
    renderCurrentVoiceScreen();
    return;
  }

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
  if (!VOICE_SYSTEM_ENABLED) {
    return false;
  }
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
  const voiceAvailableOnScreen = isMinimalVoiceAvailableOnScreen(targetScreen);
  const voiceStateClass = !appState.voiceEnabled || !voiceAvailableOnScreen ? "voice-off" : isVoiceUiActive() ? "voice-active" : "voice-idle";
  trigger.classList.add(voiceStateClass);
  trigger.setAttribute("aria-label", !voiceAvailableOnScreen ? "Voice unavailable on this screen" : appState.voiceListening ? "Voice listening" : "Voice ready");
  trigger.disabled = true;

  const bars = document.createElement("div");
  bars.className = "voice-bars";

  for (let i = 0; i < 5; i += 1) {
    const bar = document.createElement("span");
    bar.className = "voice-bar";
    bars.appendChild(bar);
  }

  trigger.appendChild(bars);
  if (!appState.voiceEnabled || !voiceAvailableOnScreen) {
    const label = document.createElement("span");
    label.className = "voice-indicator-text";
    label.textContent = voiceAvailableOnScreen ? "Voice ready" : "Voice unavailable";
    trigger.appendChild(label);
  }

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

  const pageFooter = document.createElement("div");
  pageFooter.className = "page-footer";

  const footer = document.createElement("div");
  footer.className = "action-bar";

  pageFooter.append(
    footer,
    createBottomNavigation(getBottomNavSection())
  );

  page.append(header, content, pageFooter);
  appEl.appendChild(page);

  if (isVoiceDebugUiEnabled()) {
    header.appendChild(createVoiceDebugCopyButton());
  }

  return { page, header, content, footer, pageFooter };
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

function createStageScreenShell(options = {}) {
  const { screenClassName = "", navSection = getBottomNavSection() } = options;

  appEl.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = ["screen", "stage-screen", screenClassName].filter(Boolean).join(" ");

  const header = document.createElement("div");
  header.className = "stage-screen__header";

  const main = document.createElement("div");
  main.className = "stage-screen__main";

  const pageFooter = document.createElement("div");
  pageFooter.className = "page-footer";

  const footer = document.createElement("div");
  footer.className = "action-bar action-bar--stage";

  pageFooter.append(
    footer,
    createBottomNavigation(navSection)
  );

  screen.append(header, main, pageFooter);
  appEl.appendChild(screen);

  if (isVoiceDebugUiEnabled()) {
    header.appendChild(createVoiceDebugCopyButton());
  }

  return { screen, header, main, footer, pageFooter };
}

function getBottomNavSection(screenName = appState.currentScreen) {
  if (screenName === "home") {
    return "home";
  }

  if (screenName === "menu") {
    return "menu";
  }

  if (
    screenName === "analysis" ||
    screenName === "ingredientsIntro" ||
    screenName === "ingredients" ||
    screenName === "preparationIntro" ||
    screenName === "preparation"
  ) {
    return "ingredients";
  }

  if (
    screenName === "cookingIntro" ||
    screenName === "cooking" ||
    screenName === "timerActive" ||
    screenName === "completed"
  ) {
    return "cooking";
  }

  return null;
}

function getBottomNavTarget(sectionKey) {
  if (sectionKey === "home") {
    return "home";
  }

  if (sectionKey === "menu") {
    return "menu";
  }

  if (!appState.recipe) {
    return "home";
  }

  if (sectionKey === "ingredients") {
    return "ingredientsIntro";
  }

  if (sectionKey === "cooking") {
    return "cookingIntro";
  }

  return "home";
}

function isBottomNavSectionEnabled(sectionKey) {
  if (sectionKey === "ingredients" || sectionKey === "cooking") {
    return Boolean(appState.recipe);
  }

  return true;
}

function navigateToPrimarySection(sectionKey) {
  if (!isBottomNavSectionEnabled(sectionKey)) {
    return;
  }
  const targetScreen = getBottomNavTarget(sectionKey);
  setScreen(targetScreen);
}

function createBottomNavigation(activeSection) {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Primary");

  const items = [
    { key: "home", label: "Home", iconClass: "fa-solid fa-house" },
    { key: "ingredients", label: "Ingredients", iconClass: "fa-solid fa-list-check" },
    { key: "cooking", label: "Cooking", iconClass: "fa-solid fa-fire-burner" },
    { key: "menu", label: "Menu", iconClass: "fa-solid fa-bars" }
  ];

  items.forEach((item) => {
    const button = document.createElement("button");
    const isActive = item.key === activeSection;
    const isEnabled = isBottomNavSectionEnabled(item.key);
    button.type = "button";
    button.className = [
      "bottom-nav__item",
      isActive ? "is-active" : "",
      !isEnabled ? "is-disabled" : ""
    ].filter(Boolean).join(" ");
    if (isActive) {
      button.setAttribute("aria-current", "page");
    }
    if (!isEnabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.tabIndex = -1;
    } else {
      button.addEventListener("click", () => {
        navigateToPrimarySection(item.key);
      });
    }

    const icon = document.createElement("i");
    icon.className = `${item.iconClass} bottom-nav__icon`;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "bottom-nav__label";
    label.textContent = item.label;

    button.append(icon, label);
    nav.appendChild(button);
  });

  return nav;
}

function createActionButtonsRow(buttonConfigs, className = "") {
  const row = document.createElement("div");
  row.className = ["action-row", className].filter(Boolean).join(" ");

  buttonConfigs
    .filter(Boolean)
    .forEach((config) => {
      const button = createButton(config.label, config.className || "", config.onClick || (() => {}), config.actionName);
      if (config.disabled) {
        button.disabled = true;
      }
      if (config.title) {
        button.title = config.title;
      }
      if (config.ariaLabel) {
        button.setAttribute("aria-label", config.ariaLabel);
      }
      row.appendChild(button);
    });

  return row;
}

function createStageActionRow(backConfig, nextConfig) {
  return createActionButtonsRow([
    backConfig ? { label: "Back", className: "ghost-action", actionName: "back", ...backConfig } : null,
    nextConfig ? { label: "Next", className: "primary", actionName: "next", ...nextConfig } : null
  ], "stage-actions stage-actions--two");
}

function createCookingActionArea(options = {}) {
  const {
    timerInteractionActive = false,
    timerPaused = false,
    canGoBack = true,
    onQuit,
    onPauseTimer,
    onBack,
    onNext,
    onSkipTimer,
    onRepeat,
    repeatEnabled = true
  } = options;

  const fragment = document.createDocumentFragment();

  fragment.appendChild(createActionButtonsRow([
    {
      label: "Quit",
      className: "ghost-action",
      onClick: onQuit,
      actionName: "stop"
    },
    timerInteractionActive
      ? {
        label: timerPaused ? "Resume Timer" : "Pause Timer",
        className: "primary",
        onClick: onPauseTimer,
        actionName: "pause"
      }
      : {
        label: "Repeat",
        className: "ghost-action",
        onClick: onRepeat,
        actionName: "repeat",
        disabled: !repeatEnabled,
        title: repeatEnabled ? "" : "Repeat is not available on this screen"
      }
  ], "cooking-actions cooking-actions--top"));

  fragment.appendChild(createActionButtonsRow([
    {
      label: "Back",
      className: "ghost-action",
      onClick: onBack,
      actionName: "back",
      disabled: !canGoBack
    },
    timerInteractionActive
      ? {
        label: "Skip Timer",
        className: "",
        onClick: onSkipTimer,
        actionName: "skip-timer"
      }
      : {
        label: "Next",
        className: "primary",
        onClick: onNext,
        actionName: "next"
      }
  ], "cooking-actions cooking-actions--bottom"));

  return fragment;
}

function getVoiceDebugSnapshot() {
  return {
    screen: appState.currentScreen,
    transcript: appState.voiceLastTranscript || appState.voiceHeard || "",
    matchedCommand: appState.voiceLastMatchedCommand || "",
    lastAction: appState.voiceLastAction || "",
    preparationIndex: appState.preparationIndex,
    cookingIndex: appState.cookingIndex,
    timer: getVoiceTimerSnapshot(),
    commandLockActive: isVoiceCommandLocked(),
    commandLockReason: appState.voiceCommandLockReason || "",
    commandLockRemainingMs: getVoiceCommandLockRemainingMs(),
    recentEvents: (appState.voiceDebugEvents || []).slice(0, 5)
  };
}

function createVoiceDebugCopyButton() {
  const wrap = document.createElement("div");
  wrap.className = "voice-debug-copy";

  const button = createButton("Copy voice debug", "voice-debug-copy__button", async () => {
    const payload = JSON.stringify(getVoiceDebugSnapshot(), null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      status.textContent = "Voice debug copied";
      status.dataset.state = "success";
    } catch (error) {
      console.error("Voice debug copy failed:", error);
      status.textContent = "Copy failed";
      status.dataset.state = "error";
    }

    if (statusTimeoutId) {
      window.clearTimeout(statusTimeoutId);
    }
    statusTimeoutId = window.setTimeout(() => {
      status.textContent = "";
      status.dataset.state = "";
      statusTimeoutId = null;
    }, 1800);
  });

  button.classList.add("btn-inline");

  const status = document.createElement("span");
  status.className = "voice-debug-copy__status";
  status.setAttribute("aria-live", "polite");

  let statusTimeoutId = null;

  wrap.append(button, status);
  return wrap;
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

async function ensureTesseractLoaded() {
  if (window.Tesseract && typeof window.Tesseract.recognize === "function") {
    return window.Tesseract;
  }

  throw new Error("OCR is unavailable right now. Please refresh and try again.");
}

async function extractTextFromImage(fileOrBlob) {
  const Tesseract = await ensureTesseractLoaded();
  const result = await Tesseract.recognize(fileOrBlob, "eng");
  const extractedText = String(result?.data?.text || "").trim();

  if (!extractedText) {
    throw new Error("Could not read text from screenshot");
  }

  return extractedText;
}

function renderOnboarding() {
  const screen = clearAndSetScreenTitle("KitchenPilot", "Hands-free cooking guide");
  screen.classList.add("onboarding-screen");

  const main = document.createElement("div");
  main.className = "onboarding-main";

  const demoCard = createCard();
  demoCard.classList.add("onboarding-demo-card");

  const demoIcon = createRecipeIcon(COOKING_STAGE_ICON, "KitchenPilot");
  demoIcon.classList.add("onboarding-demo-icon");

  const demoStatus = document.createElement("p");
  demoStatus.className = "onboarding-demo-status";
  demoStatus.setAttribute("aria-live", "polite");
  demoStatus.textContent = ONBOARDING_DEMO_STATES[0];

  demoCard.append(demoIcon, demoStatus);

  const actions = document.createElement("div");
  actions.className = "onboarding-actions";

  actions.append(
    createButton("Start cooking", "primary primary-action", () => setScreen("home"), "start"),
    createInlineButton("Skip", "onboarding-skip", () => setScreen("home"), "skip")
  );

  main.append(demoCard, actions);
  screen.appendChild(main);

  let currentStateIndex = 0;

  function showDemoState(nextIndex) {
    demoStatus.classList.add("is-transitioning");

    window.setTimeout(() => {
      currentStateIndex = nextIndex % ONBOARDING_DEMO_STATES.length;
      demoStatus.textContent = ONBOARDING_DEMO_STATES[currentStateIndex];
      demoStatus.classList.remove("is-transitioning");
    }, 140);
  }

  onboardingDemoIntervalId = window.setInterval(() => {
    showDemoState(currentStateIndex + 1);
  }, 2000);
}

function renderHome() {
  const { page, content, footer } = createTitledPage("KitchenPilot", "Hands-free cooking guide", "home-screen");
  let isAnalyzing = false;
  let isReadingScreenshot = false;
  let currentAnalysisController = null;
  let loadingOverlay = null;
  const devModeEnabled = getDevModeEnabled();

  const homeMain = document.createElement("div");
  homeMain.className = "home-main";

  const hero = document.createElement("div");
  hero.className = "home-hero";

  const heroIcon = document.createElement("div");
  heroIcon.className = "home-hero-icon";
  heroIcon.setAttribute("aria-hidden", "true");

  const heroImage = document.createElement("img");
  heroImage.src = COOKING_STAGE_ICON;
  heroImage.alt = "";
  heroImage.loading = "eager";
  heroImage.decoding = "async";
  heroIcon.appendChild(heroImage);

  hero.appendChild(heroIcon);
  homeMain.appendChild(hero);

  const entrySection = document.createElement("div");
  entrySection.className = "home-entry-section";

  function setEntryLabelContent(element, iconClassName, text) {
    element.textContent = "";

    const icon = document.createElement("i");
    icon.className = `${iconClassName} home-entry-icon`;
    icon.setAttribute("aria-hidden", "true");

    const labelText = document.createElement("span");
    labelText.textContent = text;

    element.append(icon, labelText);
  }

  function ensureEntryExpanded(entryKey) {
    if (appState.homeActiveEntry === entryKey) {
      return;
    }
    appState.homeActiveEntry = entryKey;
    renderHome();
  }

  const screenshotCard = createCard();
  screenshotCard.classList.add("home-entry-card", "home-entry-card--interactive");
  screenshotCard.setAttribute("role", "button");
  screenshotCard.setAttribute("tabindex", "0");
  screenshotCard.setAttribute("aria-label", "Upload a screenshot or photo");

  const screenshotTitle = document.createElement("div");
  screenshotTitle.className = "home-entry-label";
  setEntryLabelContent(screenshotTitle, "fa-regular fa-image", "Upload a screenshot or photo");

  const screenshotHelper = document.createElement("p");
  screenshotHelper.className = "small home-entry-helper";
  screenshotHelper.textContent = "From Instagram, books, or notes";

  const screenshotInput = document.createElement("input");
  screenshotInput.type = "file";
  screenshotInput.accept = "image/*";
  screenshotInput.hidden = true;

  screenshotCard.append(screenshotTitle, screenshotHelper, screenshotInput);
  entrySection.appendChild(screenshotCard);

  const urlCard = createCard();
  urlCard.classList.add("home-entry-card", "home-entry-card--interactive");
  urlCard.setAttribute("role", "button");
  urlCard.setAttribute("tabindex", "0");
  urlCard.setAttribute("aria-label", "Paste a recipe link");

  const urlTitle = document.createElement("div");
  urlTitle.className = "home-entry-label";
  setEntryLabelContent(urlTitle, "fa-solid fa-link", "Paste a recipe link");

  const urlContent = document.createElement("div");
  urlContent.className = "home-entry-content";

  const urlInput = document.createElement("input");
  urlInput.id = "recipeUrl";
  urlInput.placeholder = "Paste a recipe link";
  urlInput.type = "url";
  urlInput.value = appState.homeRecipeUrl || "";
  urlContent.appendChild(urlInput);
  urlCard.append(urlTitle, urlContent);
  entrySection.appendChild(urlCard);

  const textCard = createCard();
  textCard.classList.add("home-entry-card", "home-entry-card--interactive");
  textCard.setAttribute("role", "button");
  textCard.setAttribute("tabindex", "0");
  textCard.setAttribute("aria-label", "Paste recipe text");

  const textTitle = document.createElement("div");
  textTitle.className = "home-entry-label";
  setEntryLabelContent(textTitle, "fa-regular fa-file-lines", "Paste recipe text");

  const textContent = document.createElement("div");
  textContent.className = "home-entry-content";

  const textInput = document.createElement("textarea");
  textInput.id = "recipeText";
  textInput.placeholder = "Paste your recipe text here";
  textInput.value = appState.homeRecipeText || "";
  textContent.appendChild(textInput);
  textCard.append(textTitle, textContent);
  entrySection.appendChild(textCard);

  const validation = document.createElement("p");
  validation.className = "form-error";
  validation.hidden = !appState.homeValidationMessage;
  validation.textContent = appState.homeValidationMessage || "";

  homeMain.append(entrySection, validation);

  function hideLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.remove();
      loadingOverlay = null;
    }
  }

  function showLoadingOverlay(options = {}) {
    const {
      titleText = "Analyse de la recette...",
      subtitleText = "Cela peut prendre quelques secondes.",
      cancelLabel = "",
      onCancel = null
    } = options;
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
    title.textContent = titleText;

    const subtitle = document.createElement("p");
    subtitle.className = "loading-subtitle";
    subtitle.textContent = subtitleText;

    panel.append(spinner, title, subtitle);
    if (cancelLabel && typeof onCancel === "function") {
      const cancelBtn = createButton(cancelLabel, "", () => {
        onCancel();
      });
      cancelBtn.classList.add("loading-cancel-btn");
      panel.appendChild(cancelBtn);
    }

    loadingOverlay.appendChild(panel);
    page.appendChild(loadingOverlay);
  }

  function clearValidation() {
    if (validation.hidden) {
      return;
    }
    if (urlInput.value.trim() || textInput.value.trim() || appState.homeScreenshotText.trim()) {
      appState.homeValidationMessage = "";
      validation.hidden = true;
      validation.textContent = "";
    }
  }

  function syncEntryVisibility() {
    const activeEntry = appState.homeActiveEntry;
    urlCard.classList.toggle("is-expanded", activeEntry === "url");
    textCard.classList.toggle("is-expanded", activeEntry === "text");
    urlContent.hidden = activeEntry !== "url";
    textContent.hidden = activeEntry !== "text";
  }

  function syncScreenshotCardState() {
    const hasScreenshot = Boolean(appState.homeScreenshotText.trim());
    screenshotCard.classList.toggle("is-ready", hasScreenshot);
    screenshotCard.classList.toggle("is-busy", isReadingScreenshot);
    screenshotHelper.textContent = hasScreenshot
      ? "Screenshot loaded ✓ Tap to replace"
      : "From Instagram, books, or notes";
  }

  function hasHomeInput() {
    return Boolean(
      urlInput.value.trim() ||
      textInput.value.trim() ||
      appState.homeScreenshotText.trim()
    );
  }

  function syncStartButtonState() {
    if (isAnalyzing) {
      startBtn.disabled = true;
      return;
    }

    startBtn.disabled = !hasHomeInput() || isReadingScreenshot;
  }

  function resetAnalysisUi() {
    isAnalyzing = false;
    currentAnalysisController = null;
    startBtn.textContent = "Start Cooking";
    hideLoadingOverlay();
    syncStartButtonState();
  }

  function resetScreenshotUi() {
    isReadingScreenshot = false;
    hideLoadingOverlay();
    screenshotInput.value = "";
    syncScreenshotCardState();
    syncStartButtonState();
  }

  function storeScreenshotText(text) {
    appState.homeScreenshotText = text;
    clearValidation();
    syncScreenshotCardState();
    syncStartButtonState();
  }

  async function handleScreenshotSource(fileOrBlob) {
    if (!fileOrBlob || isReadingScreenshot) {
      return;
    }

    isReadingScreenshot = true;
    syncScreenshotCardState();
    syncStartButtonState();
    showLoadingOverlay({
      titleText: "Reading recipe from screenshot...",
      subtitleText: "This can take a few seconds."
    });

    try {
      const extractedText = await extractTextFromImage(fileOrBlob);
      storeScreenshotText(extractedText);
      resetScreenshotUi();
    } catch (error) {
      console.error("Screenshot OCR failed:", error);
      appState.homeValidationMessage = "Could not read text from screenshot";
      validation.textContent = appState.homeValidationMessage;
      validation.hidden = false;
      resetScreenshotUi();
    }
  }

  screenshotInput.addEventListener("change", async () => {
    const file = screenshotInput.files && screenshotInput.files[0];
    if (!file) {
      return;
    }

    await handleScreenshotSource(file);
  });

  const openScreenshotPicker = () => {
    if (isReadingScreenshot) {
      return;
    }
    screenshotInput.click();
  };

  screenshotCard.addEventListener("click", () => {
    openScreenshotPicker();
  });
  screenshotCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openScreenshotPicker();
    }
  });

  const activateUrlCard = () => {
    ensureEntryExpanded("url");
    window.requestAnimationFrame(() => {
      urlInput.focus();
    });
  };

  urlCard.addEventListener("click", (event) => {
    if (event.target === urlInput) {
      return;
    }
    activateUrlCard();
  });
  urlCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateUrlCard();
    }
  });

  const activateTextCard = () => {
    ensureEntryExpanded("text");
    window.requestAnimationFrame(() => {
      textInput.focus();
      textInput.scrollTop = 0;
    });
  };

  textCard.addEventListener("click", (event) => {
    if (event.target === textInput) {
      return;
    }
    activateTextCard();
  });
  textCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateTextCard();
    }
  });

  const handleImagePaste = async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type && item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    event.preventDefault();
    const imageBlob = imageItem.getAsFile();
    if (!imageBlob) {
      return;
    }

    await handleScreenshotSource(imageBlob);
  };

  urlInput.addEventListener("paste", handleImagePaste);
  textInput.addEventListener("paste", handleImagePaste);

  const startBtn = createButton("Start Cooking", "primary", async () => {
    if (isAnalyzing) {
      return;
    }

    appState.homeRecipeUrl = urlInput.value;
    appState.homeRecipeText = textInput.value;
    const recipeUrl = urlInput.value.trim();
    const recipeText = textInput.value.trim();
    const screenshotText = appState.homeScreenshotText.trim();
    const parseInput = recipeText || screenshotText || recipeUrl;

    if (!parseInput) {
      appState.homeValidationMessage = "Please add a recipe URL, recipe text, or screenshot before continuing.";
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
    showLoadingOverlay({
      titleText: "Analyse de la recette...",
      subtitleText: "Cela peut prendre quelques secondes.",
      cancelLabel: "Annuler",
      onCancel: () => {
        if (currentAnalysisController) {
          currentAnalysisController.abort();
        }
        resetAnalysisUi();
      }
    });

    try {
      const parsedRecipe = await parseRecipeText(parseInput, {
        signal: currentAnalysisController ? currentAnalysisController.signal : undefined
      });
      const recipe = normalizeRecipeForGuidance(parsedRecipe);
      recipe.sourceUrl = recipe.sourceUrl || recipeUrl || "";

      appState.recipe = recipe;
      console.log("[recipe-shape] recipe stored in appState", {
        title: appState.recipe.title,
        preparationSteps: appState.recipe.preparationSteps,
        cookingSteps: appState.recipe.cookingSteps,
        preparationCount: Array.isArray(appState.recipe.preparationSteps) ? appState.recipe.preparationSteps.length : 0,
        cookingCount: Array.isArray(appState.recipe.cookingSteps) ? appState.recipe.cookingSteps.length : 0
      });
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

  const homeActions = document.createElement("div");
  homeActions.className = "button-row home-actions";
  homeActions.appendChild(startBtn);
  footer.appendChild(homeActions);

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
      appState.homeActiveEntry = "url";
      appState.homeRecipeUrl = EXAMPLE_RECIPE_URL;
      appState.homeRecipeText = "";
      appState.homeScreenshotText = "";
      urlInput.value = appState.homeRecipeUrl;
      textInput.value = appState.homeRecipeText;
      textInput.scrollTop = 0;
      syncEntryVisibility();
      syncScreenshotCardState();
      syncStartButtonState();
      clearValidation();
    });

    const loadExampleTextBtn = createButton(EXAMPLE_RECIPE_BUTTON_LABEL, "", () => {
      appState.homeActiveEntry = "text";
      appState.homeRecipeText = EXAMPLE_RECIPE_TEXT;
      appState.homeScreenshotText = "";
      appState.homeRecipeUrl = "";
      textInput.value = appState.homeRecipeText;
      textInput.scrollTop = 0;
      urlInput.value = appState.homeRecipeUrl;
      syncEntryVisibility();
      syncScreenshotCardState();
      syncStartButtonState();
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

  content.appendChild(homeMain);

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
  content.appendChild(devModeRow);

  urlInput.addEventListener("input", () => {
    if (appState.homeActiveEntry !== "url") {
      appState.homeActiveEntry = "url";
    }
    appState.homeRecipeUrl = urlInput.value;
    clearValidation();
    syncStartButtonState();
  });

  textInput.addEventListener("input", () => {
    if (appState.homeActiveEntry !== "text") {
      appState.homeActiveEntry = "text";
    }
    appState.homeRecipeText = textInput.value;
    textInput.scrollTop = 0;
    clearValidation();
    syncStartButtonState();
  });

  if (!appState.homeActiveEntry) {
    if (appState.homeRecipeText.trim()) {
      appState.homeActiveEntry = "text";
    } else if (appState.homeRecipeUrl.trim()) {
      appState.homeActiveEntry = "url";
    }
  }

  syncEntryVisibility();
  syncScreenshotCardState();
  syncStartButtonState();
}

function renderMenu() {
  const { content, footer } = createTitledPage("Menu", "Settings and shortcuts live here", "menu-screen");

  const card = createCard();

  const intro = document.createElement("p");
  intro.className = "stage-description menu-copy";
  intro.textContent = "This area is reserved for future settings and menu actions. Voice behavior remains disabled here.";

  const status = document.createElement("p");
  status.className = "small menu-copy";
  status.textContent = appState.recipe
    ? "A recipe is still loaded. Use the bottom navigation to jump back into Ingredients or Cooking."
    : "No recipe is currently loaded. Start from Home when you are ready.";

  card.append(intro, status);
  content.appendChild(card);

  footer.appendChild(createActionButtonsRow([
    {
      label: "Back to Home",
      className: "primary",
      onClick: () => setScreen("home"),
      actionName: "home"
    }
  ], "menu-actions"));
}

function renderAnalysis() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const { content, footer } = createTitledPage("Recipe Analysis", "Review parsed steps before cooking", "review-screen");

  const summaryCard = createCard();
  summaryCard.classList.add("analysis-card");
  const recipeTitle = document.createElement("h2");
  recipeTitle.className = "analysis-title";
  recipeTitle.textContent = appState.recipe.title;

  const metadataDebugSnapshot = getRecipeMetadataDebugSnapshot(appState.recipe);
  console.log("[Recipe Analysis] metadata snapshot", metadataDebugSnapshot);

  const metadataItems = getRecipeMetadataItems(appState.recipe);
  const metadataList = document.createElement("dl");
  metadataList.className = "analysis-metadata";

  metadataItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "analysis-metadata-item";

    const label = document.createElement("dt");
    label.className = "analysis-metadata-label";
    label.textContent = `${item.label}:`;

    const value = document.createElement("dd");
    value.className = "analysis-metadata-value";
    value.textContent = item.value;

    row.append(label, value);
    metadataList.appendChild(row);
  });

  summaryCard.append(recipeTitle, metadataList);

  const summaryList = document.createElement("ul");
  summaryList.className = "list analysis-summary-list";

  const ingredientCount = document.createElement("li");
  ingredientCount.textContent = `${appState.recipe.ingredients.length} ingredients`;

  const prepCount = document.createElement("li");
  prepCount.textContent = `${appState.recipe.preparationSteps.length} preparation steps`;

  const cookingCount = document.createElement("li");
  cookingCount.textContent = `${appState.recipe.cookingSteps.length} cooking steps`;

  summaryList.append(ingredientCount, prepCount, cookingCount);
  summaryCard.appendChild(summaryList);

  if (DEV_MODE) {
    const debugBlock = document.createElement("pre");
    debugBlock.className = "analysis-debug";
    debugBlock.textContent = JSON.stringify(metadataDebugSnapshot, null, 2);
    summaryCard.appendChild(debugBlock);
  }

  content.appendChild(summaryCard);

  footer.appendChild(createActionButtonsRow([
    {
      label: "Back",
      className: "ghost-action",
      onClick: () => setScreen("home"),
      actionName: "back"
    },
    {
      label: "Next",
      className: "primary",
      onClick: () => {
        maybeShowVoiceOnboarding(() => setScreen("ingredientsIntro"));
      },
      actionName: "next"
    }
  ], "analysis-actions"));
}

function renderStageIntro(title, description, backScreen, continueScreen, continueLabel, helperNote, stageLabelText = "") {
  const { screen, header, main, footer } = createStageScreenShell();

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

  footer.appendChild(createStageActionRow(
    {
      onClick: () => setScreen(backScreen)
    },
    {
      label: continueLabel || "Continue",
      onClick: () => setScreen(continueScreen)
    }
  ));
}

function renderIngredientsIntro() {
  const { header, main, footer } = createStageScreenShell({
    navSection: "ingredients"
  });

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
    hintMessage: "Voice commands are disabled on this intro. Tap Next to continue.",
    hintMs: 2200,
    showListeningText: false,
    animateListening: false,
    showUnlockButton: true,
    unlockLabel: "Unlock Voice",
    readyLabel: "Voice ready"
  }));
  appendVoiceError(main);
  footer.appendChild(createStageActionRow(
    {
      onClick: () => setScreen("analysis")
    },
    {
      onClick: () => {
        requestIntroAdvance(
          "ingredientsIntro",
          "click",
          getVoiceTimestamp(),
          () => {
            recordVoiceDebugEvent("intro-advance-triggered-by-click", {
              introScreen: "ingredientsIntro",
              triggerAction: "primary-button"
            });
            setScreen("ingredients");
          },
          "primary-button"
        );
      }
    }
  ));
}

function renderPreparationIntro() {
  const { header, main, footer } = createStageScreenShell({
    navSection: "ingredients"
  });

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
  main.appendChild(createVoiceActivationCard("Voice commands are disabled on this intro. Tap Next to continue."));
  footer.appendChild(createStageActionRow(
    {
      onClick: () => setScreen("ingredients")
    },
    {
      onClick: () => {
        requestIntroAdvance(
          "preparationIntro",
          "click",
          getVoiceTimestamp(),
          () => {
            recordVoiceDebugEvent("intro-advance-triggered-by-click", {
              introScreen: "preparationIntro",
              triggerAction: "primary-button"
            });
            startPreparationFlow();
          },
          "primary-button"
        );
      }
    }
  ));
}

function renderCookingIntro() {
  const { header, main, footer } = createStageScreenShell({
    navSection: "cooking"
  });

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Cooking Mode";

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = "STAGE 3";

  const recipeIcon = createRecipeIcon(COOKING_STAGE_ICON, "");

  header.append(title, stageLabel);
  main.append(recipeIcon);
  main.appendChild(createVoiceActivationCard(
    INTRO_SCREENS_CLICK_ONLY_DEBUG
      ? "Voice commands are disabled on this intro. Tap Next to continue."
      : "Voice enabled. You can say: Next, Repeat, Pause."
  ));
  footer.appendChild(createStageActionRow(
    {
      onClick: () => openPreparationIntro()
    },
    {
      onClick: () => {
        requestIntroAdvance(
          "cookingIntro",
          "click",
          getVoiceTimestamp(),
          () => {
            recordVoiceDebugEvent("intro-advance-triggered-by-click", {
              introScreen: "cookingIntro",
              triggerAction: "primary-button"
            });
            enterCookingFlow({
              source: "button-next",
              triggerDetail: "cookingIntro-primary-button"
            });
          },
          "primary-button"
        );
      }
    }
  ));
}

function renderIngredients(options = {}) {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const { restoreScrollTop = null } = options;

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
      const currentScrollTop = appEl.querySelector(".page-content")?.scrollTop ?? 0;
      setIngredientChecked(index, checkbox.checked);
      renderIngredients({ restoreScrollTop: currentScrollTop });
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

  const markAllBtn = createButton("Mark all as ready", "", () => {
    const currentScrollTop = appEl.querySelector(".page-content")?.scrollTop ?? 0;
    appState.ingredientChecks = appState.recipe.ingredients.map(() => true);
    renderIngredients({ restoreScrollTop: currentScrollTop });
  });

  card.append(list, markAllBtn);
  content.appendChild(card);

  footer.appendChild(createStageActionRow(
    {
      onClick: () => setScreen("ingredientsIntro")
    },
    {
      onClick: () => setScreen("preparationIntro")
    }
  ));

  if (Number.isFinite(restoreScrollTop)) {
    window.requestAnimationFrame(() => {
      const pageContent = appEl.querySelector(".page-content");
      if (pageContent) {
        pageContent.scrollTop = restoreScrollTop;
      }
    });
  }
}

function renderPreparation() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const total = appState.recipe.preparationSteps.length;

  if (total === 0) {
    recordAutoFlowDebugEvent("auto-advance-preparation-empty-to-cookingIntro", {
      trigger: "renderPreparation:no-preparation-steps"
    });
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
    appState.voicePreparationStepEnteredAt = getVoiceTimestamp();
    appState.voicePreparationAcceptCommandsAt = Number.POSITIVE_INFINITY;
    appState.lastSpokenPreparationIndex = idx;
    speak(currentText);
  }

  footer.appendChild(createActionButtonsRow([
    {
      label: "Back",
      className: "ghost-action",
      onClick: () => {
        if (appState.preparationIndex > 0) {
          appState.preparationIndex -= 1;
          renderPreparation();
        } else {
          openPreparationIntro();
        }
      },
      actionName: "back"
    },
    {
      label: "Repeat",
      className: "ghost-action",
      onClick: () => speak(currentText),
      actionName: "repeat"
    },
    {
      label: "Next",
      className: "primary",
      onClick: () => {
        advancePreparationStep();
      },
      actionName: "next"
    }
  ], "preparation-actions"));
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
  recordAutoFlowDebugEvent("auto-start-timer", {
    trigger: "startStepTimerIfNeeded",
    cookingIndex: appState.cookingIndex,
    timerSeconds: step.timerSeconds
  });
  console.log("[timer-state] Starting timer for step", appState.cookingIndex + 1, "seconds:", step.timerSeconds);

  startTimer(
    step.timerSeconds,
    (secondsLeft) => {
      appState.activeTimerSeconds = secondsLeft;
      const timerDisplay = document.getElementById("timerDisplay");
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(secondsLeft);
      }
      updateTimerOverlay();
    },
    () => {
      appState.activeTimerSeconds = 0;
      appState.timerMessage = "Timer finished";
      appState.timerPaused = false;
      setTimerStatus("completed", "timer done callback");
      recordCookingVoiceDebugEvent("cooking-timer-finished", {
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || ""
      });
      console.warn("[cooking-debug] cooking-timer-finished", {
        screen: appState.currentScreen,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        screenMode: getVoiceScreenMode()
      });
      appState.cookingVoiceReadyAfterTimerPending = true;
      suspendVoiceRecognitionForCurrentScreen("cooking-timer-finished");
      const timerNotice = document.getElementById("timerNotice");
      if (timerNotice) {
        timerNotice.textContent = "Timer finished";
      }
      const timerDisplay = document.getElementById("timerDisplay");
      if (timerDisplay) {
        timerDisplay.textContent = "00:00";
      }
      const didSpeakTimerFinished = playTimerDoneFeedback();
      if (!didSpeakTimerFinished) {
        restoreCookingVoiceAfterTimerFinish("timer-finished-no-speech", {
          cookingIndex: appState.cookingIndex,
          timerStatus: appState.timerStatus
        });
      }

      if (appState.currentScreen === "cooking") {
        renderCooking();
      }
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
      updateTimerOverlay();
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

  updateTimerOverlay();
}

function renderCooking() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const total = appState.recipe.cookingSteps.length;

  if (total === 0) {
    recordAutoFlowDebugEvent("auto-advance-cooking-empty-to-completed", {
      trigger: "renderCooking:no-cooking-steps"
    });
    setScreen("completed");
    return;
  }

  const idx = appState.cookingIndex;
  const step = appState.recipe.cookingSteps[idx];
  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;
  const cookingVoiceAvailable = Boolean(appState.voiceEnabled && isVoiceRecognitionAllowedOnScreen("cooking"));
  recordCookingVoiceDebugEvent("cooking-step-entered", {
    cookingIndex: idx,
    timerStatus: appState.timerStatus,
    hasTimer,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    screenMode: getVoiceScreenMode()
  });
  recordCookingVoiceDebugEvent("cooking-voice-state-on-step-enter", {
    cookingIndex: idx,
    timerStatus: appState.timerStatus,
    hasTimer,
    voiceListening: appState.voiceListening,
    voiceOutputSpeaking: appState.voiceOutputSpeaking,
    liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
    liveCommand: appState.voiceLastMatchedCommand || "",
    consumedSessionId: appState.cookingVoiceConsumedSessionId || 0,
    consumedCommandKey: appState.cookingVoiceConsumedCommandKey || "",
    commandLockUntil: appState.voiceCommandLockUntil || 0,
    screenMode: getVoiceScreenMode()
  });
  recordCookingVoiceDebugEvent(
    cookingVoiceAvailable ? "cooking-voice-enabled-on-step-enter" : "cooking-voice-disabled-on-step-enter",
    {
      cookingIndex: idx,
      timerStatus: appState.timerStatus,
      hasTimer,
      voiceEnabled: appState.voiceEnabled,
      voiceListening: appState.voiceListening,
      voiceOutputSpeaking: appState.voiceOutputSpeaking,
      screenMode: getVoiceScreenMode()
    }
  );
  recordCookingVoicePanelState("step-enter", {
    cookingIndex: idx,
    hasTimer
  });

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
  ensureCookingVoiceReady("cooking-step-entered", {
    cookingIndex: idx,
    hasTimer,
    timerStatus: appState.timerStatus
  });

  const timerInteractionActive = hasTimer && (appState.timerStatus === "running" || appState.timerStatus === "paused");

  footer.appendChild(createCookingActionArea({
    timerInteractionActive,
    timerPaused: appState.timerPaused,
    canGoBack: idx > 0,
    onQuit: () => stopCookingFlow(true),
    onPauseTimer: () => {
      toggleGuidancePause();
      renderCooking();
    },
    onBack: () => goToPreviousCookingStep(),
    onNext: () => {
      recordCookingVoiceDebugEvent("cooking-click-next-triggered-after-timer", {
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        screenMode: getVoiceScreenMode()
      });
      console.warn("[cooking-debug] cooking-click-next-triggered-after-timer", {
        screen: appState.currentScreen,
        cookingIndex: appState.cookingIndex,
        timerStatus: appState.timerStatus,
        voiceListening: appState.voiceListening,
        voiceOutputSpeaking: appState.voiceOutputSpeaking,
        liveTranscript: appState.voiceLastTranscript || appState.voiceHeard || "",
        liveCommand: appState.voiceLastMatchedCommand || "",
        screenMode: getVoiceScreenMode()
      });
      goToNextCookingStep();
    },
    onSkipTimer: () => {
      skipTimerAndAdvance();
    },
    onRepeat: () => repeatCurrentCookingStep(),
    repeatEnabled: true
  }));
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
    recordAutoFlowDebugEvent("auto-advance-timerActive-missing-step-to-completed", {
      trigger: "renderTimerActive:missing-step"
    });
    setScreen("completed");
    return;
  }

  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;
  if (!hasTimer) {
    recordAutoFlowDebugEvent("auto-advance-timerActive-no-timer-to-cooking", {
      trigger: "renderTimerActive:no-timer",
      cookingIndex: appState.cookingIndex
    });
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

  footer.appendChild(createCookingActionArea({
    timerInteractionActive,
    timerPaused: appState.timerPaused,
    canGoBack: idx > 0,
    onQuit: () => stopCookingFlow(true),
    onPauseTimer: () => {
      toggleGuidancePause();
      renderTimerActive();
    },
    onBack: () => goToPreviousCookingStep(),
    onNext: () => goToNextCookingStep(),
    onSkipTimer: () => {
      skipTimerAndAdvance();
    },
    onRepeat: () => repeatCurrentCookingStep(),
    repeatEnabled: !timerInteractionActive
  }));
}

function renderCompleted() {
  const { header, main, footer } = createStageScreenShell({
    screenClassName: "completed-screen",
    navSection: "cooking"
  });

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Recipe Completed";
  header.appendChild(title);
  main.classList.add("completed-screen__main");

  const recipeIcon = createRecipeIcon(COOKING_STAGE_ICON, "");

  const message = document.createElement("p");
  message.className = "stage-description completed-message";
  message.textContent = "Your dish is ready to serve";

  const subtext = document.createElement("p");
  subtext.className = "small completed-subtext";
  subtext.textContent = "Nice work in the kitchen.";

  main.append(recipeIcon, message, subtext);

  const actions = document.createElement("div");
  actions.className = "completed-actions";
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
  appState.voiceLastAppSpeechStartAt = getVoiceTimestamp();
  recordCookingIntroDebugEvent("app-speech-start", {
    voiceOutputSpeakingBeforeStart: appState.voiceOutputSpeaking
  }, {
    referenceTime: appState.voiceLastAppSpeechStartAt
  });
  if (isPreparationVoiceScreen()) {
    appState.voicePreparationAcceptCommandsAt = Number.POSITIVE_INFINITY;
    recordPreparationVoiceDebugEvent("app-speech-start", {
      screen: appState.currentScreen,
      preparationIndex: appState.preparationIndex
    });
  }
  setVoiceOutputSpeaking(true);
  if (appState.currentScreen === "cooking") {
    recordCookingVoicePanelState("speech-start", {
      cookingIndex: appState.cookingIndex,
      timerStatus: appState.timerStatus
    });
  }
});

window.addEventListener("kitchenpilot:voice-speech-end", () => {
  appState.voiceLastAppSpeechEndAt = getVoiceTimestamp();
  recordCookingIntroDebugEvent("app-speech-end", {
    voiceOutputSpeakingBeforeEnd: appState.voiceOutputSpeaking
  }, {
    referenceTime: appState.voiceLastAppSpeechEndAt
  });
  if (isPreparationVoiceScreen()) {
    const now = getVoiceTimestamp();
    appState.voicePreparationAcceptCommandsAt = now + 450;
    recordPreparationVoiceDebugEvent("app-speech-end", {
      screen: appState.currentScreen,
      preparationIndex: appState.preparationIndex,
      commandsAcceptedAfterMs: 450
    });
  }
  setVoiceOutputSpeaking(false);
  if (appState.cookingVoiceReadyAfterTimerPending) {
    restoreCookingVoiceAfterTimerFinish("timer-finished-speech-ended", {
      cookingIndex: appState.cookingIndex,
      timerStatus: appState.timerStatus
    });
    return;
  }
  if (appState.currentScreen === "cooking") {
    recordCookingVoicePanelState("speech-end", {
      cookingIndex: appState.cookingIndex,
      timerStatus: appState.timerStatus
    });
    ensureCookingVoiceReady("cooking-step-speech-ended", {
      cookingIndex: appState.cookingIndex,
      timerStatus: appState.timerStatus
    });
  }
});

ensureTimerOverlay();
updateTimerOverlay();
setScreen("onboarding");
