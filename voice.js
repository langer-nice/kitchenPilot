function speak(text) {
  if (!text || typeof text !== "string") {
    return;
  }

  if (!("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";

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
