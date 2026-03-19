const appState = {
  currentScreen: "home",
  recipe: null,
  ingredientChecks: [],
  preparationIndex: 0,
  cookingIndex: 0,
  timerMessage: "",
  timerStatus: "idle",
  timerMessageTimeoutId: null,
  activeTimerSeconds: null,
  timerPaused: false,
  voiceEnabled: false,
  voiceListening: false,
  voiceErrorMessage: "",
  voiceHeard: "",
  voiceExecuting: false,
  voiceCommandStatus: "",
  voiceCommandStatusTimeoutId: null,
  lastSpokenCookingIndex: null,
  voiceHintMessage: "",
  voiceHintTimeoutId: null,
  timerSkippedStepIndex: null
};

const appEl = document.getElementById("app");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;

const EXAMPLE_RECIPE_URL = "https://www.bbcgoodfood.com/recipes/spaghetti-aglio-e-olio";
const EXAMPLE_RECIPE_TEXT = `Spaghetti Aglio e Olio

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
    return;
  }

  appState.voiceCommandStatusTimeoutId = window.setTimeout(() => {
    appState.voiceCommandStatus = appState.voiceListening ? "Listening..." : "";
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
  if (typeof window.setVoiceMicPulse === "function") {
    window.setVoiceMicPulse(appState.voiceListening);
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

function isGuidanceScreen(screenName) {
  return screenName === "cooking" || screenName === "timerActive" || screenName === "cookingIntro";
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setScreen(screenName) {
  appState.currentScreen = screenName;

  if (!isGuidanceScreen(screenName)) {
    appState.timerMessage = "";
    clearTimerMessageLater();
    setVoiceCommandStatus("", 0);
    appState.voiceHeard = "";
    appState.voiceExecuting = false;
    setTimerStatus("idle", `leaving guidance to ${screenName}`);
    appState.activeTimerSeconds = null;
    appState.timerPaused = false;
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
      renderStageIntro(
        "Ingredient Check",
        "Confirm that all ingredients are ready before you start.",
        "analysis",
        "ingredients",
        "Continue",
        "",
        "STAGE 1"
      );
      break;
    case "ingredients":
      renderIngredients();
      break;
    case "preparationIntro":
      renderStageIntro(
        "Preparation",
        "Complete quick prep tasks before active cooking starts.",
        "ingredients",
        "preparation",
        "Continue",
        "",
        "STAGE 2"
      );
      break;
    case "preparation":
      renderPreparation();
      break;
    case "cookingIntro":
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

  if (command.includes("next")) {
    if (appState.currentScreen === "preparation") {
      flashActionButton("next");
      markVoiceCommandExecuted("Next");
      advancePreparationStep();
      return;
    }

    if (appState.currentScreen === "timerActive" && !canProceedFromTimerStep()) {
      setVoiceHint("Timer is still running. Say skip timer or wait.", 2200);
      if (appState.currentScreen === "timerActive") {
        renderTimerActive();
      }
      return;
    }

    flashActionButton("next");
    markVoiceCommandExecuted("Next");
    goToNextCookingStep();
    return;
  }

  if (command.includes("previous") || command.includes("back")) {
    if (appState.currentScreen === "cookingIntro") {
      flashActionButton("back");
      markVoiceCommandExecuted("Back");
      setScreen("preparationIntro");
      return;
    }

    if (appState.currentScreen === "preparation") {
      flashActionButton("back");
      markVoiceCommandExecuted("Back");
      goBackPreparationStep();
      return;
    }

    flashActionButton("back");
    markVoiceCommandExecuted("Back");
    goToPreviousCookingStep();
    return;
  }

  if (command.includes("repeat")) {
    if (appState.currentScreen === "preparation") {
      flashActionButton("repeat");
      markVoiceCommandExecuted("Repeat");
      const prepText = getCurrentPreparationText();
      if (prepText) {
        speak(prepText);
      }
      return;
    }

    flashActionButton("repeat");
    markVoiceCommandExecuted("Repeat");
    repeatCurrentCookingStep();
    return;
  }

  if (command.includes("pause")) {
    flashActionButton("pause");
    markVoiceCommandExecuted("Pause");
    toggleGuidancePause();
    return;
  }

  if (appState.currentScreen === "cookingIntro" && command.includes("start") && command.includes("cook")) {
    flashActionButton("next");
    markVoiceCommandExecuted("Start Cooking");
    setScreen("cooking");
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
    flashActionButton("stop");
    markVoiceCommandExecuted("Stop");
    stopCookingFlow();
    return;
  }

  if (command.includes("skip") && command.includes("timer")) {
    flashActionButton("skip-timer");
    markVoiceCommandExecuted("Skip Timer");
    skipTimerAndAdvance();
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
      setVoiceCommandStatus("Listening...", 0);
      renderCurrentVoiceScreen();
    };

    voiceRecognition.onend = () => {
      appState.voiceListening = false;
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
  appState.voiceExecuting = false;
  setVoiceCommandStatus("Listening...", 0);
  if (typeof window.setVoiceMicPulse === "function") {
    window.setVoiceMicPulse(true);
  }
  try {
    voiceRecognition.start();
  } catch {
    appState.voiceEnabled = false;
    appState.voiceErrorMessage = "Could not start voice input. Check microphone permission and try again.";
    setVoiceCommandStatus("", 0);
    if (typeof window.setVoiceMicPulse === "function") {
      window.setVoiceMicPulse(false);
    }
  }
  renderCurrentVoiceScreen();
}

function stopVoiceCommands() {
  appState.voiceEnabled = false;
  appState.voiceListening = false;
  appState.voiceErrorMessage = "";
  appState.voiceExecuting = false;
  appState.voiceHeard = "";
  setVoiceCommandStatus("", 0);
  if (typeof window.setVoiceMicPulse === "function") {
    window.setVoiceMicPulse(false);
  }
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
    if (appState.currentScreen === "cooking") {
      renderCooking();
    }
    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
    }
  }, timeoutMs);
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

function getTimelineWindow(steps, currentIndex) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const start = Math.max(0, currentIndex - 1);
  const end = Math.min(safeSteps.length - 1, currentIndex + 1);
  const windowSteps = [];

  for (let i = start; i <= end; i += 1) {
    const step = safeSteps[i] || {};
    const kind = i < currentIndex ? "past" : i > currentIndex ? "next" : "current";
    windowSteps.push({
      index: i,
      text: String(step.text || ""),
      hasTimer: Number.isInteger(step.timerSeconds) && step.timerSeconds > 0,
      kind
    });
  }

  return windowSteps;
}

function createFocusedStepTimeline(steps, currentIndex) {
  const card = createCard();
  card.classList.add("timeline-card", "step-context-card");

  const list = document.createElement("ol");
  list.className = "step-timeline";

  const windowSteps = getTimelineWindow(steps, currentIndex);
  windowSteps.forEach((item) => {
    const li = document.createElement("li");
    li.className = `timeline-item step-item step-${item.kind} ${item.kind}`;
    li.dataset.stepKind = item.kind;

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

    if (item.hasTimer) {
      const timerIcon = document.createElement("div");
      timerIcon.className = "step-timer-icon";
      timerIcon.setAttribute("aria-hidden", "true");
      timerIcon.innerHTML = '<i class="fa-regular fa-clock"></i>';
      li.appendChild(timerIcon);
    }

    list.appendChild(li);
  });

  card.appendChild(list);
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

function renderHome() {
  const screen = clearAndSetScreenTitle("KitchenPilot", "Hands-free cooking guide");
  let isTextInputVisible = false;
  let isAnalyzing = false;
  let analysisAbortController = null;

  const card = createCard();
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Recipe URL";
  urlLabel.setAttribute("for", "recipeUrl");

  const urlInput = document.createElement("input");
  urlInput.id = "recipeUrl";
  urlInput.placeholder = "Paste a recipe link";
  urlInput.type = "url";

  const textLabel = document.createElement("label");
  textLabel.textContent = "Recipe Text";
  textLabel.setAttribute("for", "recipeText");

  const textInput = document.createElement("textarea");
  textInput.id = "recipeText";
  textInput.placeholder = "Paste your recipe text here";
  textInput.hidden = true;

  const textToggle = document.createElement("button");
  textToggle.type = "button";
  textToggle.className = "text-toggle-link";
  textToggle.textContent = "Paste recipe text instead";

  function syncTextInputVisibility() {
    textInput.hidden = !isTextInputVisible;
    textLabel.hidden = !isTextInputVisible;
    textToggle.textContent = isTextInputVisible ? "Hide recipe text input" : "Paste recipe text instead";
  }

  textToggle.addEventListener("click", () => {
    isTextInputVisible = !isTextInputVisible;
    syncTextInputVisibility();
  });

  const validation = document.createElement("p");
  validation.className = "form-error";
  validation.hidden = true;

  textLabel.hidden = true;
  card.append(urlLabel, urlInput, textLabel, textInput, validation);
  screen.appendChild(card);

  const exampleCard = createCard();
  const exampleTitle = document.createElement("h2");
  exampleTitle.textContent = "Load example recipe";

  const exampleActions = document.createElement("div");
  exampleActions.className = "button-row";

  const loadExampleUrlBtn = createButton("Load example URL", "", () => {
    urlInput.value = EXAMPLE_RECIPE_URL;
    textInput.value = "";
    clearValidation();
  });

  const loadExampleTextBtn = createButton("Load example text", "", () => {
    isTextInputVisible = true;
    syncTextInputVisibility();
    textInput.value = EXAMPLE_RECIPE_TEXT;
    urlInput.value = "";
    clearValidation();
  });

  exampleActions.append(loadExampleUrlBtn, loadExampleTextBtn);
  exampleCard.append(exampleTitle, exampleActions);
  screen.appendChild(exampleCard);

  const actions = document.createElement("div");
  actions.className = "button-row";

  function clearValidation() {
    if (validation.hidden) {
      return;
    }
    if (urlInput.value.trim() || textInput.value.trim()) {
      validation.hidden = true;
      validation.textContent = "";
    }
  }

  function showAnalysisOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "loading-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-live", "assertive");

    const panel = document.createElement("div");
    panel.className = "loading-overlay__panel";

    const spinner = document.createElement("div");
    spinner.className = "loading-overlay__spinner";
    spinner.setAttribute("aria-hidden", "true");

    const title = document.createElement("p");
    title.className = "loading-overlay__title";
    title.textContent = "Analyse de la recette...";

    const subtitle = document.createElement("p");
    subtitle.className = "loading-overlay__subtitle";
    subtitle.textContent = "Cela peut prendre quelques secondes.";

    const cancelBtn = createButton("Annuler", "", () => {
      if (analysisAbortController) {
        analysisAbortController.abort();
      }
      hideAnalysisOverlay();
    });
    cancelBtn.classList.add("loading-overlay__cancel");

    panel.append(spinner, title, subtitle, cancelBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function hideAnalysisOverlay() {
    isAnalyzing = false;
    analysisAbortController = null;
    const overlay = document.querySelector(".loading-overlay");
    if (overlay) {
      overlay.remove();
    }
    startBtn.disabled = false;
    startBtn.textContent = "Start Cooking";
  }

  const startBtn = createButton("Start Cooking", "primary", async () => {
    if (isAnalyzing) {
      return;
    }

    const recipeUrl = urlInput.value.trim();
    const recipeText = textInput.value.trim();
    const parseInput = recipeText || recipeUrl;

    if (!parseInput) {
      validation.textContent = "Please paste a recipe URL or recipe text before continuing.";
      validation.hidden = false;
      return;
    }

    validation.hidden = true;
    validation.textContent = "";

    isAnalyzing = true;
    analysisAbortController = new AbortController();
    startBtn.disabled = true;
    startBtn.textContent = "Analysing...";
    showAnalysisOverlay();

    try {
      const parsedRecipe = await parseRecipeText(parseInput, {
        signal: analysisAbortController.signal
      });
      const recipe = normalizeRecipeForGuidance(parsedRecipe);

      hideAnalysisOverlay();
      appState.recipe = recipe;
      initializeIngredientChecklist(recipe);
      appState.preparationIndex = 0;
      appState.cookingIndex = 0;
      appState.timerSkippedStepIndex = null;
      setScreen("analysis");
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }

      console.error("Recipe parsing failed:", error);
      hideAnalysisOverlay();
      const message = error && error.message ? error.message : "Could not parse recipe. Please try again.";
      validation.textContent = message;
      validation.hidden = false;
    }
  });

  actions.append(startBtn);
  screen.appendChild(actions);
  screen.appendChild(textToggle);

  urlInput.addEventListener("input", clearValidation);
  textInput.addEventListener("input", clearValidation);
  syncTextInputVisibility();
}

function renderAnalysis() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const screen = clearAndSetScreenTitle("Recipe Analysis", "Review parsed steps before cooking");

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
  screen.appendChild(summaryCard);

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(
    createButton("Start Guided Cooking", "primary", () => setScreen("ingredientsIntro")),
    createButton("Back to Home", "", () => setScreen("home"))
  );

  screen.appendChild(actions);
}

function renderStageIntro(title, description, backScreen, continueScreen, continueLabel, helperNote, stageLabelText = "") {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const titleEl = document.createElement("h1");
  titleEl.className = "stage-title";
  titleEl.textContent = title;

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = stageLabelText || "";

  const recipeIcon = document.createElement("div");
  recipeIcon.className = "recipe-icon";
  recipeIcon.setAttribute("aria-hidden", "true");
  recipeIcon.innerHTML = '<i class="fa-solid fa-pizza-slice"></i>';

  const descriptionEl = document.createElement("p");
  descriptionEl.className = "stage-description";
  descriptionEl.textContent = description;

  screen.append(titleEl, stageLabel, recipeIcon, descriptionEl);

  if (helperNote) {
    const note = document.createElement("p");
    note.className = "small stage-description";
    note.textContent = helperNote;
    screen.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => setScreen(backScreen), "back"),
    createButton(continueLabel || "Continue", "primary primary-action", () => setScreen(continueScreen), "next")
  );

  screen.appendChild(actions);
  appEl.appendChild(screen);
}

function renderCookingIntro() {
  appEl.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "screen stage-screen";

  const title = document.createElement("h1");
  title.className = "stage-title";
  title.textContent = "Cooking Mode";

  const stageLabel = document.createElement("p");
  stageLabel.className = "stage-label";
  stageLabel.textContent = "STAGE 3";

  const recipeIcon = document.createElement("div");
  recipeIcon.className = "recipe-icon";
  recipeIcon.setAttribute("aria-hidden", "true");
  recipeIcon.innerHTML = '<i class="fa-solid fa-pizza-slice"></i>';

  screen.append(title, stageLabel, recipeIcon);

  const voiceCard = createCard();
  voiceCard.classList.add("voice-card");

  const voiceTitle = document.createElement("p");
  voiceTitle.className = "voice-card-text";
  voiceTitle.textContent = "Enable voice commands for hands-free cooking";

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
      hintMessage: "Voice enabled. You can say: Next, Repeat, Pause.",
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
  appendVoiceCommandStatus(voiceCard);
  appendVoiceError(voiceCard);
  screen.appendChild(voiceCard);

  const actions = document.createElement("div");
  actions.className = "stage-actions";
  actions.append(
    createButton("Home", "secondary-action", () => setScreen("home"), "home"),
    createButton("Back", "secondary-action", () => setScreen("preparationIntro"), "back"),
    createButton("Start Cooking", "primary primary-action", () => setScreen("cooking"), "next")
  );

  screen.appendChild(actions);
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

  const card = createCard();
  const list = document.createElement("ul");
  list.className = "list ingredient-checklist";

  appState.recipe.ingredients.forEach((ingredient, index) => {
    const li = document.createElement("li");
    li.className = "ingredient-item";

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

  const { content, footer } = createTitledPage("Preparation", `Preparation ${idx + 1} of ${total}`, "page-shell--guided");

  appendVoiceCommandStatus(content);

  const card = createCard();
  const text = document.createElement("p");
  text.className = "instruction";
  text.textContent = currentText;
  card.appendChild(text);
  content.appendChild(card);

  speak(currentText);

  const actions = document.createElement("div");
  actions.className = "button-row three";

  actions.append(
    createButton("Back", "", () => {
      if (appState.preparationIndex > 0) {
        appState.preparationIndex -= 1;
        renderPreparation();
      } else {
        setScreen("preparationIntro");
      }
    }, "back"),
    createButton("Repeat", "", () => speak(currentText), "repeat"),
    createButton("Next", "primary", () => {
      if (appState.preparationIndex < total - 1) {
        appState.preparationIndex += 1;
        renderPreparation();
      } else {
        setScreen("cookingIntro");
      }
    }, "next")
  );

  footer.appendChild(actions);
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
      speak("Timer finished.");
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

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2 voice-panel compact-voice";
  if (appState.voiceEnabled) {
    voiceRow.classList.add("voice-active");
  }

  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";
  const voiceIcon = document.createElement("i");
  voiceIcon.className = "fa-solid fa-microphone voice-icon";
  voiceIcon.setAttribute("aria-hidden", "true");
  const voiceText = document.createElement("span");
  voiceText.textContent = appState.voiceListening ? "Voice listening" : "Voice";
  voiceLabel.append(voiceIcon, voiceText);

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
      hintMessage: "Voice commands enabled. Say: Next, Repeat, Pause.",
      hintMs: 2600
    });
  });

  const slider = document.createElement("span");
  slider.className = "slider";
  voiceSwitchLabel.append(voiceToggleInput, slider);
  voiceRow.append(voiceLabel, voiceSwitchLabel);
  content.appendChild(voiceRow);
  appendVoiceCommandStatus(content);
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

    timerCard.append(timerIcon, timerDisplay);

    content.appendChild(timerCard);
  }

  content.appendChild(createFocusedStepTimeline(appState.recipe.cookingSteps, idx));

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

  timerCard.append(timerIcon, timerDisplay);
  content.appendChild(timerCard);

  content.appendChild(createFocusedStepTimeline(appState.recipe.cookingSteps, idx));

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2 voice-panel compact-voice";
  if (appState.voiceEnabled) {
    voiceRow.classList.add("voice-active");
  }
  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";

  const voiceIcon = document.createElement("i");
  voiceIcon.className = "fa-solid fa-microphone voice-icon";
  voiceIcon.setAttribute("aria-hidden", "true");

  const voiceText = document.createElement("span");
  voiceText.textContent = appState.voiceListening ? "Voice listening" : "Voice";

  voiceLabel.append(voiceIcon, voiceText);

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
      hintMessage: "Voice commands enabled. Say: Pause, Skip timer, Next.",
      hintMs: 2600
    });
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  voiceSwitchLabel.append(voiceToggleInput, slider);
  voiceRow.append(voiceLabel, voiceSwitchLabel);
  content.appendChild(voiceRow);
  appendVoiceCommandStatus(content);
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
  const screen = clearAndSetScreenTitle("Recipe Completed", "Nice work in the kitchen");

  const card = createCard();
  const message = document.createElement("p");
  message.className = "meta";
  message.textContent = "Your dish is ready to serve.";
  card.appendChild(message);
  screen.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row";
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
    createButton("Return Home", "", () => {
      appState.recipe = null;
      setScreen("home");
    })
  );
  screen.appendChild(actions);
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

setScreen("home");
