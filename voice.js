let activeUtteranceText = "";
let activeUtteranceInProgress = false;
let activeUtteranceStartedAt = 0;
let activeUtteranceEndedAt = 0;
let activeUtteranceCancelledAt = 0;
let activeUtteranceInterrupted = false;

function speak(text) {
  if (!text || typeof text !== "string") {
    return;
  }

  if (!("speechSynthesis" in window)) {
    return;
  }

  if (typeof window.kitchenPilotCanSpeak === "function" && !window.kitchenPilotCanSpeak()) {
    return;
  }

  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  window.dispatchEvent(new CustomEvent("kitchenpilot:voice-utterance-requested", {
    detail: {
      text: normalizedText,
      speakingActive: activeUtteranceInProgress,
      previousText: activeUtteranceText || ""
    }
  }));

  // Avoid cancelling and restarting the exact same step narration during
  // same-step re-renders; that was cutting cooking instructions off mid-sentence.
  if (activeUtteranceInProgress && activeUtteranceText === normalizedText) {
    return;
  }

  if (activeUtteranceInProgress && activeUtteranceText && activeUtteranceText !== normalizedText) {
    activeUtteranceCancelledAt = Date.now();
    activeUtteranceInterrupted = true;
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-interrupted", {
      detail: {
        previousText: activeUtteranceText,
        nextText: normalizedText,
        cancelledAt: activeUtteranceCancelledAt
      }
    }));
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-cancelled", {
      detail: {
        text: activeUtteranceText,
        cancelledAt: activeUtteranceCancelledAt,
        reason: "replaced-by-new-utterance"
      }
    }));
  }

  window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));

  const utterance = new SpeechSynthesisUtterance(normalizedText);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  utterance.onstart = () => {
    activeUtteranceInProgress = true;
    activeUtteranceText = normalizedText;
    activeUtteranceStartedAt = Date.now();
    activeUtteranceInterrupted = false;
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-started", {
      detail: {
        text: normalizedText,
        startedAt: activeUtteranceStartedAt
      }
    }));
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-start"));
  };
  utterance.onend = () => {
    activeUtteranceInProgress = false;
    activeUtteranceEndedAt = Date.now();
    activeUtteranceText = "";
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-ended", {
      detail: {
        text: normalizedText,
        startedAt: activeUtteranceStartedAt,
        endedAt: activeUtteranceEndedAt,
        interrupted: activeUtteranceInterrupted
      }
    }));
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
  };
  utterance.onerror = () => {
    activeUtteranceInProgress = false;
    activeUtteranceEndedAt = Date.now();
    activeUtteranceText = "";
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-cancelled", {
      detail: {
        text: normalizedText,
        cancelledAt: activeUtteranceEndedAt,
        reason: "speech-error"
      }
    }));
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
  };

  activeUtteranceInProgress = true;
  activeUtteranceText = normalizedText;
  activeUtteranceInterrupted = false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function updateVoiceStatusIndicator(text) {
  const statusEl = document.getElementById("voice-status");
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text || "";
}

function setVoiceMicPulse(enabled) {
  const toggles = document.querySelectorAll(".mic-switch");
  toggles.forEach((toggle) => {
    if (enabled) {
      toggle.classList.add("listening");
    } else {
      toggle.classList.remove("listening");
    }
  });
}

window.updateVoiceStatusIndicator = updateVoiceStatusIndicator;
window.setVoiceMicPulse = setVoiceMicPulse;
window.getKitchenPilotVoiceState = () => ({
  currentUtteranceText: activeUtteranceText,
  speakingActive: activeUtteranceInProgress,
  startedAt: activeUtteranceStartedAt || null,
  endedAt: activeUtteranceEndedAt || null,
  cancelledAt: activeUtteranceCancelledAt || null,
  interrupted: activeUtteranceInterrupted
});
