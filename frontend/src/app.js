const ringLength = 2 * Math.PI * 29;
const storage = {
  tasks: "focus.tasks",
  shortBreak: "focus.shortBreak",
  longBreak: "focus.longBreak",
  spotifyClientId: "focus.spotifyClientId",
};

let sessionIndex = 1;
let totalSessions = 4;
let focusMinutes = 15;
let remaining = focusMinutes * 60;
let total = focusMinutes * 60;
let running = false;
let timerHandle = 0;
let alwaysTop = false;
let audioReady = false;

const timerReadout = document.getElementById("timerReadout");
const progressRing = document.getElementById("progressRing");
const sessionLabel = document.getElementById("sessionIndex");
const sessionDots = document.getElementById("sessionDots");
const playPause = document.getElementById("playPause");
const trackName = document.getElementById("trackName");
const trackDetail = document.getElementById("trackDetail");
const trackTime = document.getElementById("trackTime");
const dropZone = document.getElementById("dropZone");
const audioPlayer = document.getElementById("audioPlayer");
const visualizer = document.getElementById("visualizer");
const taskList = document.getElementById("taskList");
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const shortBreakInput = document.getElementById("shortBreakInput");
const longBreakInput = document.getElementById("longBreakInput");
const spotifyModal = document.getElementById("spotifyModal");
const helpModal = document.getElementById("helpModal");
const spotifyClientId = document.getElementById("spotifyClientId");
const spotifyAccessToken = document.getElementById("spotifyAccessToken");
const spotifyConnectButton = document.getElementById("spotifyConnectButton");
const spotifyStatus = document.getElementById("spotifyStatus");
const topButtons = Array.from(document.querySelectorAll('[data-action="always-top-footer"]'));

progressRing.style.strokeDasharray = `${ringLength}`;

function backend() {
  return window.go?.main?.App;
}

function callBackend(method, ...args) {
  const app = backend();
  if (!app || typeof app[method] !== "function") {
    return Promise.resolve(undefined);
  }
  return app[method](...args);
}

function readTasks() {
  const stored = localStorage.getItem(storage.tasks);
  if (stored) {
    try {
      const tasks = JSON.parse(stored);
      if (Array.isArray(tasks)) {
        return tasks;
      }
    } catch {
      // Fall back to defaults below.
    }
  }
  return [
    { text: "Design UI in Go/Wails", done: true },
    { text: "Code EXE backend integration", done: false },
    { text: "Integrate spotify API / local playback", done: false },
  ];
}

function writeTasks(tasks) {
  localStorage.setItem(storage.tasks, JSON.stringify(tasks));
}

function renderTasks() {
  const tasks = readTasks();
  taskList.innerHTML = "";
  tasks.forEach((task, index) => {
    const row = document.createElement("div");
    row.className = `task-row ${task.done ? "done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => {
      const next = readTasks();
      next[index].done = checkbox.checked;
      writeTasks(next);
      renderTasks();
    });

    const input = document.createElement("input");
    input.type = "text";
    input.value = task.text;
    input.setAttribute("aria-label", "Task text");
    input.addEventListener("change", () => {
      const next = readTasks();
      next[index].text = input.value.trim() || "Untitled task";
      writeTasks(next);
      renderTasks();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", "Remove task");
    remove.addEventListener("click", () => {
      const next = readTasks();
      next.splice(index, 1);
      writeTasks(next);
      renderTasks();
    });

    row.append(checkbox, input, remove);
    taskList.append(row);
  });
}

function initBreaks() {
  shortBreakInput.value = localStorage.getItem(storage.shortBreak) || "5";
  longBreakInput.value = localStorage.getItem(storage.longBreak) || "15";
  shortBreakInput.addEventListener("change", () => saveBreak(shortBreakInput, storage.shortBreak));
  longBreakInput.addEventListener("change", () => saveBreak(longBreakInput, storage.longBreak));
}

function saveBreak(input, key) {
  const value = Math.min(180, Math.max(1, Number(input.value) || 1));
  input.value = String(value);
  localStorage.setItem(key, String(value));
}

function formatTime(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderTimer() {
  timerReadout.textContent = formatTime(remaining);
  const elapsed = total - remaining;
  const progress = total === 0 ? 0 : elapsed / total;
  progressRing.style.strokeDashoffset = `${ringLength * (1 - progress)}`;
}

function renderSessions() {
  sessionLabel.textContent = String(sessionIndex);
  sessionDots.innerHTML = "";
  for (let index = 1; index <= totalSessions; index += 1) {
    const dot = document.createElement("span");
    dot.className = `dot ${index === sessionIndex ? "current" : ""} ${index < sessionIndex ? "complete" : ""}`;
    sessionDots.append(dot);
  }
}

function tick() {
  if (!running) {
    return;
  }
  remaining = Math.max(0, remaining - 1);
  renderTimer();
  if (remaining === 0) {
    setRunning(false);
    sessionIndex = sessionIndex >= totalSessions ? 1 : sessionIndex + 1;
    renderSessions();
  }
}

function setRunning(value) {
  running = value;
  if (!audioReady) {
    playPause.textContent = running ? "II" : "▶";
  }
  if (running && timerHandle === 0) {
    timerHandle = window.setInterval(tick, 1000);
  }
  if (!running && timerHandle !== 0) {
    window.clearInterval(timerHandle);
    timerHandle = 0;
  }
}

function resetTimer(minutes = focusMinutes) {
  total = minutes * 60;
  remaining = total;
  sessionIndex = 1;
  setRunning(false);
  renderTimer();
  renderSessions();
}

function setPlayback(status) {
  if (!status) {
    return;
  }
  trackName.textContent = status.track || "No audio selected";
  trackDetail.textContent = status.detail || "Import an MP3 or connect Spotify";
  trackTime.textContent = status.time || "00:00 / 00:00";

  if (status.audioData) {
    audioPlayer.src = status.audioData;
    audioReady = true;
    playPause.textContent = "▶";
    visualizer.classList.remove("active");
    audioPlayer.play().catch(() => undefined);
  } else if (status.source === "spotify") {
    audioReady = false;
    audioPlayer.removeAttribute("src");
    playPause.textContent = "OK";
    visualizer.classList.add("active");
  }
}

function renderAlwaysTop() {
  topButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(alwaysTop));
    button.classList.toggle("active", alwaysTop);
  });
}

function toggleAlwaysTop() {
  alwaysTop = !alwaysTop;
  renderAlwaysTop();
  callBackend("ToggleAlwaysOnTop", alwaysTop).then((enabled) => {
    if (typeof enabled === "boolean") {
      alwaysTop = enabled;
      renderAlwaysTop();
    }
  });
}

function openModal(modal) {
  modal.hidden = false;
}

function closeModals() {
  spotifyModal.hidden = true;
  helpModal.hidden = true;
}

function openSpotifyModal() {
  spotifyClientId.value = localStorage.getItem(storage.spotifyClientId) || "";
  spotifyAccessToken.value = "";
  spotifyStatus.textContent = "";
  openModal(spotifyModal);
}

function connectSpotify() {
  const clientId = spotifyClientId.value.trim();
  const accessToken = spotifyAccessToken.value.trim();
  if (clientId) {
    localStorage.setItem(storage.spotifyClientId, clientId);
  }
  if (!clientId && !accessToken) {
    spotifyStatus.textContent = "Enter a Client ID or paste an access token.";
    return;
  }

  spotifyStatus.textContent = accessToken ? "Checking token..." : "Opening Spotify login...";
  spotifyConnectButton.disabled = true;
  callBackend("ConnectSpotify", { clientId, accessToken })
    .then((status) => {
      setPlayback(status);
      spotifyStatus.textContent = "Connected.";
      window.setTimeout(closeModals, 700);
    })
    .catch((error) => {
      spotifyStatus.textContent = error?.message || String(error);
    })
    .finally(() => {
      spotifyConnectButton.disabled = false;
    });
}

function importAudio() {
  callBackend("ImportAudio")
    .then((status) => setPlayback(status))
    .catch((error) => {
      trackDetail.textContent = error?.message || "Could not import audio";
    });
}

function toggleAudio() {
  if (audioReady && audioPlayer.src) {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(() => undefined);
    } else {
      audioPlayer.pause();
    }
    return;
  }
  setRunning(!running);
}

function updateAudioTime() {
  if (!audioReady) {
    return;
  }
  const current = Number.isFinite(audioPlayer.currentTime) ? audioPlayer.currentTime : 0;
  const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
  trackTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

document.addEventListener("click", (event) => {
  const modalClose = event.target.closest("[data-modal-close]");
  if (modalClose) {
    closeModals();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "minimise") {
    callBackend("Minimise");
  }
  if (action === "maximise") {
    callBackend("ToggleMaximise");
  }
  if (action === "close") {
    callBackend("Close");
  }
  if (action === "always-top-footer") {
    toggleAlwaysTop();
  }
  if (action === "spotify") {
    openSpotifyModal();
  }
  if (action === "spotify-help") {
    openModal(helpModal);
  }
  if (action === "audio") {
    importAudio();
  }
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    return;
  }
  const tasks = readTasks();
  tasks.push({ text, done: false });
  writeTasks(tasks);
  taskInput.value = "";
  renderTasks();
});

document.getElementById("timerStage").addEventListener("click", () => {
  setRunning(!running);
});

playPause.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAudio();
});

spotifyConnectButton.addEventListener("click", connectSpotify);

audioPlayer.addEventListener("play", () => {
  playPause.textContent = "II";
  visualizer.classList.add("active");
});
audioPlayer.addEventListener("pause", () => {
  playPause.textContent = "▶";
  visualizer.classList.remove("active");
});
audioPlayer.addEventListener("timeupdate", updateAudioTime);
audioPlayer.addEventListener("loadedmetadata", updateAudioTime);
audioPlayer.addEventListener("ended", () => {
  playPause.textContent = "▶";
  visualizer.classList.remove("active");
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.code === "Space" && !typing) {
    event.preventDefault();
    toggleAudio();
  }
  if (key === "r" && !typing) {
    resetTimer();
  }
  if (key === "s" && !typing) {
    openSpotifyModal();
  }
  if (key === "n" && !typing) {
    callBackend("Close");
  }
  if (key === "escape") {
    closeModals();
  }
});

["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("drop-ready");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drop-ready");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  const source = URL.createObjectURL(file);
  audioReady = true;
  audioPlayer.src = source;
  setPlayback({
    source: "local",
    track: file.name.replace(/\.[^/.]+$/, ""),
    detail: "Local audio",
    time: "00:00 / 00:00",
  });
  audioPlayer.src = source;
  audioPlayer.play().catch(() => undefined);
});

callBackend("CurrentPlayback").then((status) => setPlayback(status));
renderTasks();
initBreaks();
renderTimer();
renderSessions();
renderAlwaysTop();
