const messagesEl = document.getElementById("chatMessages");
const form = document.getElementById("chatForm");
const input = document.getElementById("questionInput");
const sendButton = document.getElementById("sendButton");
const clearButton = document.getElementById("clearButton");
const voiceButton = document.getElementById("voiceButton");
const audioButton = document.getElementById("audioButton");
const audioLabel = document.getElementById("audioLabel");
const modePill = document.getElementById("modePill");
const modeLabel = document.getElementById("modeLabel");
const toast = document.getElementById("toast");

let conversation = [];
let busy = false;
let readAloud = false;
let recognition = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setMode(mode, webSearch = false) {
  modePill.classList.toggle("demo", mode !== "gpt");
  modeLabel.textContent = mode === "gpt" && webSearch ? "GPT + WEB SEARCH" : mode === "gpt" ? "GPT CONNECTED" : "DEMO MODE · OFFLINE";
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Status unavailable");
    const status = await response.json();
    setMode(status.mode, Boolean(status.webSearch));
    if (status.mode === "demo") {
      showToast("Offline Demo Mode is active. Add an API key to enable live web research.");
    }
  } catch {
    setMode("demo");
  }
}

function addMessage(role, content, meta = "", citations = []) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user-row" : "assistant-row"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "🙂" : "🦏";
  avatar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "message-content";
  const speaker = document.createElement("span");
  speaker.className = "speaker";
  speaker.textContent = role === "user" ? "YOU" : "RHINO EXPLORER";
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role === "user" ? "user-bubble" : "assistant-bubble"}`;
  bubble.textContent = content;
  body.append(speaker, bubble);
  if (role === "assistant" && Array.isArray(citations) && citations.length) {
    const sources = document.createElement("div");
    sources.className = "message-sources";
    const heading = document.createElement("span");
    heading.className = "sources-heading";
    heading.textContent = "WEB SOURCES";
    sources.append(heading);
    for (const source of citations.slice(0, 8)) {
      if (!source || typeof source.url !== "string" || !/^https?:\/\//i.test(source.url)) continue;
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || new URL(source.url).hostname;
      sources.append(link);
    }
    if (sources.querySelector("a")) body.append(sources);
  }
  if (meta) {
    const footer = document.createElement("span");
    footer.className = "message-meta";
    footer.textContent = meta;
    body.append(footer);
  }
  row.append(avatar, body);
  messagesEl.append(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "message-row assistant-row";
  row.id = "typingRow";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "🦏";
  const body = document.createElement("div");
  body.className = "message-content";
  const label = document.createElement("span");
  label.className = "speaker";
  label.textContent = "RHINO EXPLORER IS THINKING";
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant-bubble";
  bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  body.append(label, bubble);
  row.append(avatar, body);
  messagesEl.append(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  document.getElementById("typingRow")?.remove();
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  sendButton.querySelector("span:first-child").textContent = value ? "Thinking..." : "Ask Rhino";
}

function speak(text) {
  if (!readAloud || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.97;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function sendQuestion(question) {
  const cleaned = question.trim();
  if (!cleaned || busy) return;
  input.value = "";
  input.style.height = "auto";
  addMessage("user", cleaned);
  conversation.push({ role: "user", content: cleaned });
  setBusy(true);
  addTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation.slice(-10) })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Something went wrong.");
    removeTyping();
    setMode(payload.mode || "demo", Boolean(payload.webSearch));
    const meta = payload.webSearch
      ? "Live internet research · Check with exhibit staff for individual-animal details."
      : payload.mode === "gpt"
        ? "AI-generated · Check with exhibit staff for animal-specific details."
        : "Offline demo answer · Not a live internet search.";
    addMessage("assistant", payload.answer, meta, payload.citations || []);
    conversation.push({ role: "assistant", content: payload.answer });
    conversation = conversation.slice(-10);
    speak(payload.answer);
  } catch (error) {
    removeTyping();
    addMessage("assistant", error.message || "I couldn't connect just now. Please try again.", "Please ask an exhibit staff member for help.");
    showToast("Message could not be sent.");
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => sendQuestion(button.dataset.question || ""));
});

clearButton.addEventListener("click", () => {
  if (busy) return;
  conversation = [];
  messagesEl.innerHTML = "";
  addMessage("assistant", "Welcome back, explorer! What would you like to discover about white rhinos?", "Start with a topic or ask your own question.");
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  input.focus();
});

audioButton.addEventListener("click", () => {
  readAloud = !readAloud;
  audioButton.classList.toggle("active", readAloud);
  audioLabel.textContent = readAloud ? "Audio on" : "Read aloud";
  if (!readAloud && "speechSynthesis" in window) window.speechSynthesis.cancel();
  showToast(readAloud ? "Spoken answers are on." : "Spoken answers are off.");
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.addEventListener("result", (event) => {
    input.value = event.results[0][0].transcript;
    input.dispatchEvent(new Event("input"));
    input.focus();
  });
  recognition.addEventListener("error", () => showToast("Voice input was unavailable. You can type your question instead."));
  voiceButton.addEventListener("click", () => {
    try { recognition.start(); showToast("Listening... ask your rhino question."); }
    catch { showToast("Voice input is already listening or unavailable."); }
  });
} else {
  voiceButton.disabled = true;
  voiceButton.title = "Voice input is not supported in this browser.";
  voiceButton.style.opacity = ".45";
  voiceButton.addEventListener("click", () => showToast("Try a browser that supports speech recognition, or type your question."));
}

loadStatus();
