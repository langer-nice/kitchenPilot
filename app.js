const appState = {
  currentScreen: "home",
  recipe: null,
  preparationIndex: 0,
  cookingIndex: 0,
  timerMessage: "",
  timerStatus: "idle",
  timerMessageTimeoutId: null,
  activeTimerSeconds: null,
  timerPaused: false,
  voiceListening: false,
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
  status.className = "notice voice-command-status";
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
        "Continue"
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
        "Continue"
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
  }, 1200);
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
    const confirmed = window.confirm("Stop cooking and return to home?");
    if (!confirmed) {
      return;
    }
  }

  stopTimer();
  appState.timerSkippedStepIndex = null;
  setScreen("home");
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
    skipActiveTimer();
    if (appState.currentScreen === "timerActive") {
      renderTimerActive();
    }
    if (appState.currentScreen === "cooking") {
      renderCooking();
    }
  }

  if (appState.voiceListening) {
    setVoiceCommandStatus("Listening...", 0);
    renderCurrentVoiceScreen();
  }
}

function startVoiceCommands() {
  if (!SpeechRecognition || appState.voiceListening) {
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
      if (!appState.voiceListening) {
        return;
      }
      setVoiceCommandStatus("Listening...", 0);
      renderCurrentVoiceScreen();
    };

    voiceRecognition.onend = () => {
      if (appState.voiceListening && isGuidanceScreen(appState.currentScreen)) {
        setVoiceCommandStatus("Listening...", 0);
        voiceRecognition.start();
      }
    };

    voiceRecognition.onerror = () => {
      appState.voiceListening = false;
      appState.voiceExecuting = false;
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

  appState.voiceListening = true;
  appState.voiceExecuting = false;
  setVoiceCommandStatus("Listening...", 0);
  if (typeof window.setVoiceMicPulse === "function") {
    window.setVoiceMicPulse(true);
  }
  voiceRecognition.start();
  renderCurrentVoiceScreen();
}

function stopVoiceCommands() {
  appState.voiceListening = false;
  appState.voiceExecuting = false;
  appState.voiceHeard = "";
  setVoiceCommandStatus("", 0);
  if (typeof window.setVoiceMicPulse === "function") {
    window.setVoiceMicPulse(false);
  }
  if (voiceRecognition) {
    voiceRecognition.onend = null;
    voiceRecognition.stop();
    voiceRecognition.onend = () => {
      if (appState.voiceListening && isGuidanceScreen(appState.currentScreen)) {
        voiceRecognition.start();
      }
    };
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
  if (className) {
    btn.className = className;
  }
  if (actionName) {
    btn.dataset.action = actionName;
  }
  btn.addEventListener("click", onClick);
  return btn;
}

function createInlineButton(label, className, onClick, actionName) {
  const classes = ["inline-btn", className || ""].join(" ").trim();
  return createButton(label, classes, onClick, actionName);
}

function createCard() {
  const card = document.createElement("section");
  card.className = "card";
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
      kind
    });
  }

  return windowSteps;
}

function createFocusedStepTimeline(title, steps, currentIndex) {
  const card = createCard();
  card.classList.add("timeline-card");

  const heading = document.createElement("p");
  heading.className = "meta";
  heading.textContent = title || "Steps";
  card.appendChild(heading);

  const list = document.createElement("ol");
  list.className = "step-timeline";

  const windowSteps = getTimelineWindow(steps, currentIndex);
  windowSteps.forEach((item) => {
    const li = document.createElement("li");
    li.className = `timeline-item ${item.kind}`;
    li.dataset.stepKind = item.kind;

    const stepLabel = document.createElement("p");
    stepLabel.className = "timeline-step-label";
    stepLabel.textContent = `Step ${item.index + 1}`;

    const text = document.createElement("p");
    text.className = "timeline-step-text";
    text.textContent = item.text;

    li.append(stepLabel, text);
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

function renderHome() {
  const screen = clearAndSetScreenTitle("KitchenPilot", "Hands-free cooking guide");

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

  const validation = document.createElement("p");
  validation.className = "form-error";
  validation.hidden = true;

  card.append(urlLabel, urlInput, textLabel, textInput, validation);
  screen.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row";

  const startBtn = createButton("Start Cooking", "primary", async () => {
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

    startBtn.disabled = true;
    startBtn.textContent = "Analysing...";

    try {
      const parsedRecipe = await parseRecipeText(parseInput);
      const recipe = normalizeRecipeForGuidance(parsedRecipe);

      appState.recipe = recipe;
      appState.preparationIndex = 0;
      appState.cookingIndex = 0;
      appState.timerSkippedStepIndex = null;
      setScreen("analysis");
    } catch (error) {
      console.error("Recipe parsing failed:", error);
      const message = error && error.message ? error.message : "Could not parse recipe. Please try again.";
      alert(message);
      startBtn.disabled = false;
      startBtn.textContent = "Start Cooking";
    }
  });

  const exampleBtn = createButton("Load Example Recipe", "", () => {
    appState.recipe = normalizeRecipeForGuidance(EXAMPLE_RECIPE);
    appState.preparationIndex = 0;
    appState.cookingIndex = 0;
    appState.timerSkippedStepIndex = null;
    setScreen("analysis");
  });

  actions.append(startBtn, exampleBtn);
  screen.appendChild(actions);

  const clearValidation = () => {
    if (validation.hidden) {
      return;
    }
    if (urlInput.value.trim() || textInput.value.trim()) {
      validation.hidden = true;
      validation.textContent = "";
    }
  };

  urlInput.addEventListener("input", clearValidation);
  textInput.addEventListener("input", clearValidation);
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

function renderStageIntro(title, description, backScreen, continueScreen, continueLabel, helperNote) {
  const screen = clearAndSetScreenTitle(title, description);

  if (helperNote) {
    const note = document.createElement("p");
    note.className = "small";
    note.textContent = helperNote;
    screen.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "button-row two";
  actions.append(
    createButton("Back", "", () => setScreen(backScreen)),
    createButton(continueLabel || "Continue", "primary", () => setScreen(continueScreen))
  );

  screen.appendChild(actions);
}

function renderCookingIntro() {
  const screen = clearAndSetScreenTitle(
    "Cooking Mode",
    "Follow each step with compact controls and optional hands-free voice guidance."
  );

  appendVoiceCommandStatus(screen);

  const voiceCard = createCard();
  voiceCard.classList.add("compact-card");

  const voiceTitle = document.createElement("p");
  voiceTitle.className = "meta";
  voiceTitle.textContent = "Enable voice commands for hands-free cooking";

  const row = document.createElement("div");
  row.className = "header-row";

  const voiceState = document.createElement("p");
  voiceState.className = "small";
  voiceState.textContent = appState.voiceListening ? "Voice commands: On" : "Voice commands: Off";

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (appState.voiceListening) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceListening;
  voiceToggleInput.disabled = !SpeechRecognition;
  voiceToggleInput.addEventListener("change", () => {
    if (voiceToggleInput.checked) {
      startVoiceCommands();
      setVoiceHint("Voice enabled. You can say: Next, Repeat, Pause.", 2200);
      setVoiceCommandStatus("Command mode enabled", 900);
    } else {
      stopVoiceCommands();
      setVoiceCommandStatus("Command mode disabled", 900);
    }
    renderCookingIntro();
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  voiceSwitchLabel.append(voiceToggleInput, slider);
  row.append(voiceState, voiceSwitchLabel);
  voiceCard.append(voiceTitle, row);
  screen.appendChild(voiceCard);

  const actions = document.createElement("div");
  actions.className = "button-row two";
  actions.append(
    createButton("Back", "", () => setScreen("preparationIntro"), "back"),
    createButton("Start Cooking", "primary", () => setScreen("cooking"), "next")
  );

  screen.appendChild(actions);
}

function renderIngredients() {
  if (!appState.recipe) {
    setScreen("home");
    return;
  }

  const screen = clearAndSetScreenTitle("Ingredient Check", "Verify ingredients before you begin");

  const card = createCard();
  const list = document.createElement("ul");
  list.className = "list";

  appState.recipe.ingredients.forEach((ingredient) => {
    const li = document.createElement("li");
    li.textContent = ingredient;
    list.appendChild(li);
  });

  card.appendChild(list);
  screen.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row two";
  actions.append(
    createButton("Back", "", () => setScreen("ingredientsIntro")),
    createButton("Ready", "primary", () => setScreen("preparationIntro"))
  );
  screen.appendChild(actions);
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

  const screen = clearAndSetScreenTitle("Preparation", `Preparation ${idx + 1} of ${total}`);

  appendVoiceCommandStatus(screen);

  const card = createCard();
  const text = document.createElement("p");
  text.className = "instruction";
  text.textContent = currentText;
  card.appendChild(text);
  screen.appendChild(card);

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

  screen.appendChild(actions);
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

  const screen = clearAndSetScreenTitle("Cooking Mode", appState.recipe.title);
  screen.classList.add("cooking-screen");

  const topRow = document.createElement("div");
  topRow.className = "header-row row-1";

  const previousBtn = createInlineButton("<", "secondary", () => goToPreviousCookingStep(), "back");
  previousBtn.disabled = idx === 0;
  previousBtn.setAttribute("aria-label", "Previous step");

  const meta = document.createElement("p");
  meta.className = "meta step-indicator";
  meta.textContent = `Step ${idx + 1} of ${total}`;

  const stopBtn = createInlineButton("Stop", "danger-link", () => stopCookingFlow(true), "stop");

  topRow.append(previousBtn, meta, stopBtn);
  screen.appendChild(topRow);

  const card = createFocusedStepTimeline("Focused step timeline", appState.recipe.cookingSteps, idx);
  if (hasTimer) {
    const timerMeta = document.createElement("p");
    timerMeta.className = "meta";
    timerMeta.textContent = `Includes a ${formatTime(step.timerSeconds)} timer.`;
    card.appendChild(timerMeta);
  }
  screen.appendChild(card);

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2";
  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";
  voiceLabel.textContent = "Voice";

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (appState.voiceListening) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceListening;
  voiceToggleInput.disabled = !SpeechRecognition;
  voiceToggleInput.addEventListener("change", () => {
    if (voiceToggleInput.checked) {
      startVoiceCommands();
      setVoiceHint("Voice commands enabled. Say: Next, Repeat, Pause.", 2600);
    } else {
      stopVoiceCommands();
    }
    renderCooking();
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  voiceSwitchLabel.append(voiceToggleInput, slider);
  voiceRow.append(voiceLabel, voiceSwitchLabel);
  screen.appendChild(voiceRow);

  appendVoiceCommandStatus(screen);

  if (appState.voiceHintMessage) {
    const hint = document.createElement("p");
    hint.className = "small voice-hint";
    hint.textContent = appState.voiceHintMessage;
    screen.appendChild(hint);
  }

  if (hasTimer) {
    ensureCurrentStepTimerStarted();

    const timerCard = createCard();
    timerCard.classList.add("compact-card");

    const timerLabel = document.createElement("p");
    timerLabel.className = "meta";
    timerLabel.textContent = "Timer";

    const timerDisplay = document.createElement("div");
    timerDisplay.className = "timer";
    timerDisplay.id = "timerDisplay";
    timerDisplay.textContent = formatTime(appState.activeTimerSeconds ?? step.timerSeconds);

    const timerNotice = document.createElement("p");
    timerNotice.id = "timerNotice";
    timerNotice.className = "notice";
    timerNotice.textContent = appState.timerMessage || "Timer running";

    timerCard.append(timerLabel, timerDisplay, timerNotice);
    screen.appendChild(timerCard);
  }

  const instructionCard = createCard();
  instructionCard.classList.add("step-detail-card");
  const instructionLabel = document.createElement("p");
  instructionLabel.className = "meta";
  instructionLabel.textContent = "Step instructions";
  const instructionText = document.createElement("p");
  instructionText.className = "instruction step-detail-text";
  instructionText.textContent = step.text;
  instructionCard.append(instructionLabel, instructionText);
  screen.appendChild(instructionCard);

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

  if (!hasTimer && appState.timerMessage) {
    const info = document.createElement("p");
    info.className = "notice";
    info.textContent = appState.timerMessage;
    screen.appendChild(info);
  }

  const actionBar = document.createElement("div");
  actionBar.className = "action-bar";
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";

  if (hasTimer) {
    actionRow.classList.add("timer-action-row");
    const timerAllowsNext = appState.timerStatus === "completed" || appState.timerStatus === "skipped";
    actionRow.append(
      createButton(appState.timerPaused ? "Resume Timer" : "Pause Timer", "compact-btn", () => {
        toggleGuidancePause();
        renderCooking();
      }, "pause"),
      createButton("Repeat", "compact-btn", () => repeatCurrentCookingStep(), "repeat"),
      createButton(
        timerAllowsNext ? "Next" : "Skip Timer",
        "primary next-btn",
        () => {
          if (timerAllowsNext) {
            goToNextCookingStep();
          } else {
            skipActiveTimer();
            renderCooking();
          }
        },
        timerAllowsNext ? "next" : "skip-timer"
      )
    );
  } else {
    actionRow.classList.add("no-timer-action-row");
    actionRow.append(
      createButton("Repeat", "compact-btn", () => repeatCurrentCookingStep(), "repeat"),
      createButton("Next", "primary next-btn", () => goToNextCookingStep(), "next")
    );
  }

  actionBar.appendChild(actionRow);
  screen.appendChild(actionBar);
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

  const screen = clearAndSetScreenTitle("Timer Active", appState.recipe.title);
  screen.classList.add("cooking-screen");

  const topRow = document.createElement("div");
  topRow.className = "header-row row-1";

  const previousBtn = createInlineButton("<", "secondary", () => setScreen("cooking"), "back");
  previousBtn.setAttribute("aria-label", "Back to cooking step");

  const meta = document.createElement("p");
  meta.className = "meta step-indicator";
  meta.textContent = `Step ${idx + 1} of ${total}`;

  const stopBtn = createInlineButton("Stop", "danger-link", () => stopCookingFlow(true), "stop");

  topRow.append(previousBtn, meta, stopBtn);
  screen.appendChild(topRow);

  const timerCard = createCard();
  timerCard.classList.add("compact-card");
  const timerLabel = document.createElement("p");
  timerLabel.className = "meta";
  timerLabel.textContent = "Timer";

  const timerDisplay = document.createElement("div");
  timerDisplay.className = "timer";
  timerDisplay.id = "timerDisplay";
  timerDisplay.textContent = formatTime(appState.activeTimerSeconds ?? step.timerSeconds);

  const timerNotice = document.createElement("p");
  timerNotice.id = "timerNotice";
  timerNotice.className = "notice";
  timerNotice.textContent = appState.timerMessage || "Timer ready";

  timerCard.append(timerLabel, timerDisplay, timerNotice);
  screen.appendChild(timerCard);

  const card = createFocusedStepTimeline("Focused step timeline", appState.recipe.cookingSteps, idx);
  screen.appendChild(card);

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2";
  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";
  voiceLabel.textContent = "Voice";

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
  if (appState.voiceListening) {
    voiceSwitchLabel.classList.add("listening");
  }
  voiceSwitchLabel.setAttribute("aria-label", "Toggle voice commands");

  const voiceToggleInput = document.createElement("input");
  voiceToggleInput.type = "checkbox";
  voiceToggleInput.checked = appState.voiceListening;
  voiceToggleInput.disabled = !SpeechRecognition;
  voiceToggleInput.addEventListener("change", () => {
    if (voiceToggleInput.checked) {
      startVoiceCommands();
      setVoiceHint("Voice commands enabled. Say: Pause, Skip timer, Next.", 2600);
    } else {
      stopVoiceCommands();
    }
    renderTimerActive();
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  voiceSwitchLabel.append(voiceToggleInput, slider);
  voiceRow.append(voiceLabel, voiceSwitchLabel);
  screen.appendChild(voiceRow);

  appendVoiceCommandStatus(screen);

  if (appState.voiceHintMessage) {
    const hint = document.createElement("p");
    hint.className = "small voice-hint";
    hint.textContent = appState.voiceHintMessage;
    screen.appendChild(hint);
  }

  if (appState.lastSpokenCookingIndex !== idx) {
    speak(step.text);
    appState.lastSpokenCookingIndex = idx;
  }

  ensureCurrentStepTimerStarted();

  const readyForNext = appState.timerStatus === "completed" || appState.timerStatus === "skipped";

  const actionBar = document.createElement("div");
  actionBar.className = "action-bar";
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.classList.add("timer-action-row");

  const nextBtn = createButton(
    "Next",
    readyForNext ? "primary next-btn" : "compact-btn",
    () => goToNextCookingStep(),
    "next"
  );
  nextBtn.disabled = !readyForNext;

  const skipBtn = createButton(
    "Skip Timer",
    readyForNext ? "compact-btn" : "primary compact-btn",
    () => {
      skipActiveTimer();
      renderTimerActive();
    },
    "skip-timer"
  );
  skipBtn.disabled = readyForNext;

  actionRow.append(
    createButton(appState.timerPaused ? "Resume Timer" : "Pause Timer", "compact-btn", () => {
      toggleGuidancePause();
      renderTimerActive();
    }, "pause"),
    createButton("Repeat", "compact-btn", () => repeatCurrentCookingStep(), "repeat"),
    skipBtn,
    nextBtn
  );

  actionBar.appendChild(actionRow);
  screen.appendChild(actionBar);
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
