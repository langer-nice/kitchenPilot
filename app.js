const appState = {
  currentScreen: "home",
  recipe: null,
  preparationIndex: 0,
  cookingIndex: 0,
  timerMessage: "",
  activeTimerSeconds: null,
  timerPaused: false,
  voiceListening: false,
  lastSpokenCookingIndex: null,
  voiceHintMessage: "",
  voiceHintTimeoutId: null,
  timerSkippedStepIndex: null
};

const appEl = document.getElementById("app");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setScreen(screenName) {
  appState.currentScreen = screenName;

  if (screenName !== "cooking") {
    appState.timerMessage = "";
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
      renderStageIntro(
        "Cooking Mode",
        "Follow each step with voice help and compact controls.",
        "preparationIntro",
        "cooking",
        "Start Cooking"
      );
      break;
    case "cooking":
      renderCooking();
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

function goToNextCookingStep() {
  if (!appState.recipe) {
    return;
  }

  if (appState.cookingIndex < appState.recipe.cookingSteps.length - 1) {
    appState.cookingIndex += 1;
    appState.activeTimerSeconds = null;
    appState.timerSkippedStepIndex = null;
    renderCooking();
  } else {
    stopTimer();
    setScreen("completed");
  }
}

function goToPreviousCookingStep() {
  if (!appState.recipe) {
    return;
  }

  if (appState.cookingIndex > 0) {
    appState.cookingIndex -= 1;
    appState.activeTimerSeconds = null;
    appState.timerSkippedStepIndex = null;
    renderCooking();
  }
}

function skipActiveTimer() {
  stopTimer();
  appState.activeTimerSeconds = 0;
  appState.timerMessage = "Timer skipped";
  appState.timerSkippedStepIndex = appState.cookingIndex;
  const notice = document.getElementById("timerNotice");
  const display = document.getElementById("timerDisplay");
  if (notice) {
    notice.textContent = "Timer skipped";
  }
  if (display) {
    display.textContent = "00:00";
  }
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
    } else {
      pauseTimer();
      appState.timerPaused = true;
      appState.timerMessage = "Timer paused";
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

  if (command.includes("next")) {
    goToNextCookingStep();
    return;
  }

  if (command.includes("previous") || command.includes("back")) {
    goToPreviousCookingStep();
    return;
  }

  if (command.includes("repeat")) {
    repeatCurrentCookingStep();
    return;
  }

  if (command.includes("pause")) {
    toggleGuidancePause();
    return;
  }

  if (command.includes("stop")) {
    stopCookingFlow();
    return;
  }

  if (command.includes("skip") && command.includes("timer")) {
    skipActiveTimer();
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
      handleVoiceCommand(latest[0].transcript || "");
    };

    voiceRecognition.onend = () => {
      if (appState.voiceListening && appState.currentScreen === "cooking") {
        voiceRecognition.start();
      }
    };

    voiceRecognition.onerror = () => {
      appState.voiceListening = false;
      setVoiceHint("Voice unavailable in this browser.", 2500);
      if (appState.currentScreen === "cooking") {
        renderCooking();
      }
    };
  }

  appState.voiceListening = true;
  voiceRecognition.start();
}

function stopVoiceCommands() {
  appState.voiceListening = false;
  if (voiceRecognition) {
    voiceRecognition.onend = null;
    voiceRecognition.stop();
    voiceRecognition.onend = () => {
      if (appState.voiceListening && appState.currentScreen === "cooking") {
        voiceRecognition.start();
      }
    };
  }
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
  }, timeoutMs);
}

function createButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  if (className) {
    btn.className = className;
  }
  btn.addEventListener("click", onClick);
  return btn;
}

function createInlineButton(label, className, onClick) {
  const classes = ["inline-btn", className || ""].join(" ").trim();
  return createButton(label, classes, onClick);
}

function createCard() {
  const card = document.createElement("section");
  card.className = "card";
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

  card.append(urlLabel, urlInput, textLabel, textInput);
  screen.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row";

  const startBtn = createButton("Start Cooking", "primary", () => {
    const recipe = normalizeRecipeForGuidance(parseRecipeInput(textInput.value, urlInput.value));
    appState.recipe = recipe;
    appState.preparationIndex = 0;
    appState.cookingIndex = 0;
    appState.timerSkippedStepIndex = null;
    setScreen("analysis");
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

function renderStageIntro(title, description, backScreen, continueScreen, continueLabel) {
  const screen = clearAndSetScreenTitle(title, description);

  const actions = document.createElement("div");
  actions.className = "button-row two";
  actions.append(
    createButton("Back", "", () => setScreen(backScreen)),
    createButton(continueLabel || "Continue", "primary", () => setScreen(continueScreen))
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
    }),
    createButton("Repeat", "", () => speak(currentText)),
    createButton("Next", "primary", () => {
      if (appState.preparationIndex < total - 1) {
        appState.preparationIndex += 1;
        renderPreparation();
      } else {
        setScreen("cookingIntro");
      }
    })
  );

  screen.appendChild(actions);
}

function startStepTimerIfNeeded(step) {
  if (!step || !step.timerSeconds) {
    appState.activeTimerSeconds = null;
    appState.timerMessage = "";
    appState.timerPaused = false;
    return;
  }

  appState.timerMessage = "Timer running";
  appState.timerPaused = false;

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

  const screen = clearAndSetScreenTitle("Cooking Mode", appState.recipe.title);
  screen.classList.add("cooking-screen");

  const topRow = document.createElement("div");
  topRow.className = "header-row row-1";

  const previousBtn = createInlineButton("<", "secondary", () => goToPreviousCookingStep());
  previousBtn.disabled = idx === 0;
  previousBtn.setAttribute("aria-label", "Previous step");

  const meta = document.createElement("p");
  meta.className = "meta step-indicator";
  meta.textContent = `Step ${idx + 1} of ${total}`;

  const stopBtn = createInlineButton("Stop", "danger-link", () => stopCookingFlow(true));

  topRow.append(previousBtn, meta, stopBtn);
  screen.appendChild(topRow);

  const voiceRow = document.createElement("div");
  voiceRow.className = "header-row row-2";
  const voiceLabel = document.createElement("p");
  voiceLabel.className = "meta voice-label";
  voiceLabel.textContent = "Voice";

  const voiceSwitchLabel = document.createElement("label");
  voiceSwitchLabel.className = "mic-switch";
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

  if (appState.voiceHintMessage) {
    const hint = document.createElement("p");
    hint.className = "small voice-hint";
    hint.textContent = appState.voiceHintMessage;
    screen.appendChild(hint);
  }

  const card = createCard();
  const instruction = document.createElement("p");
  instruction.className = "instruction";
  instruction.textContent = step.text;
  card.appendChild(instruction);
  screen.appendChild(card);

  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;
  const timerWasSkipped = hasTimer && appState.timerSkippedStepIndex === idx;

  if (hasTimer) {
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

    const timerState = getTimerState();
    if (!timerWasSkipped && (!timerState.isRunning || appState.activeTimerSeconds === null)) {
      startStepTimerIfNeeded(step);
    }
  } else {
    stopTimer();
    appState.activeTimerSeconds = null;
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
    actionRow.append(
      createButton(appState.timerPaused ? "Resume Timer" : "Pause Timer", "compact-btn", () => {
        toggleGuidancePause();
        renderCooking();
      }),
      createButton("Repeat", "compact-btn", () => repeatCurrentCookingStep()),
      createButton(timerWasSkipped ? "Next" : "Skip Timer", "primary next-btn", () => {
        if (timerWasSkipped) {
          goToNextCookingStep();
        } else {
          skipActiveTimer();
          renderCooking();
        }
      })
    );
  } else {
    actionRow.append(
      createButton("Pause Cooking", "compact-btn", () => {
        toggleGuidancePause();
        renderCooking();
      }),
      createButton("Repeat", "compact-btn", () => repeatCurrentCookingStep()),
      createButton("Next", "primary next-btn", () => goToNextCookingStep())
    );
  }

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
  if (appState.currentScreen !== "cooking" || !appState.recipe) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "arrowright" || key === "n") {
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
