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

  window.dispatchEvent(new CustomEvent("kitchenpilot:voice-speech-end"));

  const utterance = new SpeechSynthesisUtterance(text);
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
