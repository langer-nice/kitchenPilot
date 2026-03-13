const appState = {
  currentScreen: "home",
  recipe: null,
  preparationIndex: 0,
  cookingIndex: 0,
  timerMessage: "",
  activeTimerSeconds: null,
  timerPaused: false,
  voiceListening: false
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
    case "ingredients":
      renderIngredients();
      break;
    case "preparation":
      renderPreparation();
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
    renderCooking();
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
  }

  speak("Cooking paused.");
  const notice = document.getElementById("timerNotice");
  if (notice) {
    notice.textContent = appState.timerMessage;
  }
}

function stopCookingFlow() {
  stopTimer();
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
    stopTimer();
    appState.activeTimerSeconds = 0;
    appState.timerMessage = "Timer skipped";
    const notice = document.getElementById("timerNotice");
    const display = document.getElementById("timerDisplay");
    if (notice) {
      notice.textContent = "Timer skipped";
    }
    if (display) {
      display.textContent = "00:00";
    }
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
      const status = document.getElementById("voiceStatus");
      if (status) {
        status.textContent = "Voice commands unavailable";
      }
    };
  }

  appState.voiceListening = true;
  voiceRecognition.start();
  const status = document.getElementById("voiceStatus");
  if (status) {
    status.textContent = "Listening for voice commands";
  }
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

  const status = document.getElementById("voiceStatus");
  if (status && appState.currentScreen === "cooking") {
    status.textContent = "Voice commands off";
  }
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
    const recipe = parseRecipeInput(textInput.value, urlInput.value);
    appState.recipe = recipe;
    appState.preparationIndex = 0;
    appState.cookingIndex = 0;
    setScreen("analysis");
  });

  const exampleBtn = createButton("Load Example Recipe", "", () => {
    appState.recipe = JSON.parse(JSON.stringify(EXAMPLE_RECIPE));
    appState.preparationIndex = 0;
    appState.cookingIndex = 0;
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

  const titleCard = createCard();
  const recipeTitle = document.createElement("h2");
  recipeTitle.textContent = appState.recipe.title;
  titleCard.appendChild(recipeTitle);
  screen.appendChild(titleCard);

  const stepsCard = createCard();
  const stepsHeading = document.createElement("p");
  stepsHeading.className = "meta";
  stepsHeading.textContent = "Detected cooking steps";
  const ol = document.createElement("ol");
  ol.className = "list";

  appState.recipe.cookingSteps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step.text;
    ol.appendChild(li);
  });

  stepsCard.append(stepsHeading, ol);
  screen.appendChild(stepsCard);

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(
    createButton("Start Guided Cooking", "primary", () => setScreen("ingredients")),
    createButton("Back to Home", "", () => setScreen("home"))
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
    createButton("Ready", "primary", () => setScreen("preparation")),
    createButton("Back", "", () => setScreen("analysis"))
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
    setScreen("cooking");
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
    createButton("Next", "primary", () => {
      if (appState.preparationIndex < total - 1) {
        appState.preparationIndex += 1;
        renderPreparation();
      } else {
        setScreen("cooking");
      }
    }),
    createButton("Repeat", "", () => speak(currentText)),
    createButton("Back", "", () => {
      if (appState.preparationIndex > 0) {
        appState.preparationIndex -= 1;
        renderPreparation();
      } else {
        setScreen("ingredients");
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

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `Step ${idx + 1} of ${total}`;
  screen.appendChild(meta);

  const voiceCard = createCard();
  const voiceStatus = document.createElement("p");
  voiceStatus.className = "meta";
  voiceStatus.id = "voiceStatus";
  if (!SpeechRecognition) {
    voiceStatus.textContent = "Voice commands not supported in this browser";
  } else {
    voiceStatus.textContent = appState.voiceListening ? "Listening for voice commands" : "Voice commands off";
  }

  const voiceActions = document.createElement("div");
  voiceActions.className = "button-row two";
  voiceActions.append(
    createButton("Start Voice Commands", "", () => startVoiceCommands()),
    createButton("Stop Voice Commands", "", () => stopVoiceCommands())
  );
  voiceCard.append(voiceStatus, voiceActions);
  screen.appendChild(voiceCard);

  const card = createCard();
  const instruction = document.createElement("p");
  instruction.className = "instruction";
  instruction.textContent = step.text;
  card.appendChild(instruction);
  screen.appendChild(card);

  const hasTimer = Number.isInteger(step.timerSeconds) && step.timerSeconds > 0;

  if (hasTimer) {
    const timerCard = createCard();
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

    const timerActions = document.createElement("div");
    timerActions.className = "button-row three";
    timerActions.append(
      createButton("Pause timer", "", () => {
        const t = getTimerState();
        if (!t.isRunning) {
          return;
        }
        if (appState.timerPaused) {
          resumeTimer();
          appState.timerPaused = false;
          appState.timerMessage = "Timer running";
        } else {
          pauseTimer();
          appState.timerPaused = true;
          appState.timerMessage = "Timer paused";
        }
        const notice = document.getElementById("timerNotice");
        if (notice) {
          notice.textContent = appState.timerMessage;
        }
      }),
      createButton("Skip timer", "", () => {
        stopTimer();
        appState.activeTimerSeconds = 0;
        appState.timerMessage = "Timer skipped";
        const notice = document.getElementById("timerNotice");
        const display = document.getElementById("timerDisplay");
        if (notice) {
          notice.textContent = "Timer skipped";
        }
        if (display) {
          display.textContent = "00:00";
        }
      }),
      createButton("Repeat step", "", () => repeatCurrentCookingStep())
    );

    timerCard.append(timerLabel, timerDisplay, timerNotice, timerActions);
    screen.appendChild(timerCard);

    const timerState = getTimerState();
    if (!timerState.isRunning || appState.activeTimerSeconds === null) {
      startStepTimerIfNeeded(step);
    }
  } else {
    stopTimer();
    appState.activeTimerSeconds = null;
    appState.timerMessage = "";
    appState.timerPaused = false;
  }

  speak(step.text);

  const actions = document.createElement("div");
  actions.className = "button-row";

  actions.append(
    createButton("Previous Step", "", () => goToPreviousCookingStep()),
    createButton("Repeat Step", "", () => repeatCurrentCookingStep()),
    createButton("Next Step", "primary", () => goToNextCookingStep()),
    createButton("Pause", "", () => toggleGuidancePause()),
    createButton("Stop Cooking", "danger", () => stopCookingFlow())
  );

  screen.appendChild(actions);
}

function renderCompleted() {
  const screen = clearAndSetScreenTitle("Recipe Completed", "Nice work in the kitchen");

  const card = createCard();
  const message = document.createElement("p");
  message.className = "instruction";
  message.textContent = "Recipe Completed";
  card.appendChild(message);
  screen.appendChild(card);

  const actions = document.createElement("div");
  actions.className = "button-row";
  actions.append(
    createButton("Cook Again", "primary", () => {
      appState.preparationIndex = 0;
      appState.cookingIndex = 0;
      setScreen("ingredients");
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
