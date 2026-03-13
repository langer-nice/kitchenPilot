let timerIntervalId = null;
let remainingSeconds = 0;
let onTick = null;
let onDone = null;
let isPaused = false;

function startTimer(seconds, tickCallback, doneCallback) {
  stopTimer();

  remainingSeconds = Number(seconds) || 0;
  onTick = typeof tickCallback === "function" ? tickCallback : null;
  onDone = typeof doneCallback === "function" ? doneCallback : null;
  isPaused = false;

  if (onTick) {
    onTick(remainingSeconds);
  }

  if (remainingSeconds <= 0) {
    if (onDone) {
      onDone();
    }
    return;
  }

  timerIntervalId = window.setInterval(() => {
    if (isPaused) {
      return;
    }

    remainingSeconds -= 1;

    if (onTick) {
      onTick(Math.max(remainingSeconds, 0));
    }

    if (remainingSeconds <= 0) {
      stopTimer();
      if (onDone) {
        onDone();
      }
    }
  }, 1000);
}

function pauseTimer() {
  isPaused = true;
}

function resumeTimer() {
  isPaused = false;
}

function stopTimer() {
  if (timerIntervalId) {
    window.clearInterval(timerIntervalId);
  }
  timerIntervalId = null;
  remainingSeconds = 0;
  isPaused = false;
}

function getTimerState() {
  return {
    remainingSeconds,
    isPaused,
    isRunning: Boolean(timerIntervalId)
  };
}
