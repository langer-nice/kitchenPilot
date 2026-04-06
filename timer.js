let timerIntervalId = null;
let remainingSeconds = 0;
let onTick = null;
let onDone = null;
let isPaused = false;
let status = "idle";

function setStatus(nextStatus, reason) {
  if (status !== nextStatus) {
    console.log(`[timer] ${status} -> ${nextStatus}${reason ? ` (${reason})` : ""}`);
    status = nextStatus;
  }
}

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
    setStatus("completed", "startTimer with non-positive seconds");
    if (onDone) {
      onDone();
    }
    return;
  }

  setStatus("running", "startTimer");

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
  setStatus("paused", "pauseTimer");
}

function resumeTimer() {
  isPaused = false;
  if (timerIntervalId) {
    setStatus("running", "resumeTimer");
  }
}

function stopTimer() {
  if (timerIntervalId) {
    window.clearInterval(timerIntervalId);
  }
  timerIntervalId = null;
  remainingSeconds = 0;
  isPaused = false;
  setStatus("idle", "stopTimer");
}

function resetTimerEngine() {
  stopTimer();
  onTick = null;
  onDone = null;
  setStatus("idle", "resetTimerEngine");
}

function getTimerState() {
  return {
    remainingSeconds,
    isPaused,
    isRunning: Boolean(timerIntervalId),
    status
  };
}
