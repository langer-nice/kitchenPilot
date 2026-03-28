let activeUtteranceText = "";
let activeUtteranceInProgress = false;

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

  // Avoid cancelling and restarting the exact same step narration during
  // same-step re-renders; that was cutting cooking instructions off mid-sentence.
  if (activeUtteranceInProgress && activeUtteranceText === normalizedText) {
    return;
  }

  window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));

  const utterance = new SpeechSynthesisUtterance(normalizedText);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  utterance.onstart = () => {
    activeUtteranceInProgress = true;
    activeUtteranceText = normalizedText;
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-start"));
  };
  utterance.onend = () => {
    activeUtteranceInProgress = false;
    activeUtteranceText = "";
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
  };
  utterance.onerror = () => {
    activeUtteranceInProgress = false;
    activeUtteranceText = "";
    window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));
  };

  activeUtteranceInProgress = true;
  activeUtteranceText = normalizedText;
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
