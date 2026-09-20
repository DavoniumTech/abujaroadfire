/* =========================================================
   DAVONIUM TECHNOLOGIES
   ABUJA ROADFIRE
   RIDE • DODGE • SURVIVE

   COMPLETE GAME ENGINE
   Canvas 2D + Vanilla JavaScript
   No External Dependencies
   ========================================================= */

"use strict";

/* =========================================================
   1. DOM REFERENCES
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const canvas = $("#game-canvas");
const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;

if (!canvas || !ctx) {
  console.error("ABUJA ROADFIRE: Canvas could not be initialized.");
}

/* =========================================================
   2. GAME CONSTANTS
   ========================================================= */

const GAME_NAME = "ABUJA ROADFIRE";
const COMPANY_NAME = "DAVONIUM TECHNOLOGIES";

const STORAGE_KEYS = {
  highScore: "divoniumHighScore",
  sound: "soundPreference",
  reducedMotion: "reducedMotionPreference",
  leaderboard: "localLeaderboard"
};

const STATES = Object.freeze({
  SPLASH: "SPLASH",
  MENU: "MENU",
  HOW_TO_PLAY: "HOW_TO_PLAY",
  READY: "READY",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  SETTINGS: "SETTINGS",
  LEADERBOARD: "LEADERBOARD",
  GAME_OVER: "GAME_OVER",
  SHARE: "SHARE"
});

const POWERUPS = Object.freeze({
  SHIELD: "SHIELD",
  NITRO: "NITRO",
  MULTIPLIER: "MULTIPLIER"
});

const COLORS = {
  skyTop: "#0b1526",
  skyMiddle: "#1b3347",
  skyBottom: "#586879",
  road: "#202731",
  roadDark: "#121820",
  lane: "#e9d8a6",
  edge: "#c46e43",
  buildingDark: "#182333",
  buildingLight: "#34465a",
  window: "#ffca72",
  white: "#f4f8ff",
  muted: "#8495ac",
  red: "#ff4f36",
  orange: "#ff9b45",
  gold: "#ffc857",
  cyan: "#4fe7ff",
  green: "#66f0a5",
  purple: "#ad91ff",
  danger: "#ff405d"
};

const WORLD = {
  horizon: 0.29,
  roadBottomWidth: 0.96,
  roadTopWidth: 0.09,
  roadCenter: 0.5,
  laneCount: 3,
  laneWidth: 1 / 3,
  maxDepth: 1,
  nearDepth: 0.02
};

const PLAYER = {
  width: 0.115,
  height: 0.23,
  y: 0.78,
  lane: 1,
  targetLane: 1,
  x: 0.5,
  targetX: 0.5,
  lean: 0,
  targetLean: 0,
  speed: 0,
  maxSpeed: 1,
  acceleration: 0,
  animationTime: 0,
  invulnerable: 0,
  shieldTime: 0,
  nitroTime: 0,
  multiplierTime: 0,
  jumpTime: 0,
  jumpHeight: 0,
  hitFlash: 0,
  alive: true
};

/* =========================================================
   3. GAME STATE
   ========================================================= */

const game = {
  state: STATES.SPLASH,

  width: 0,
  height: 0,
  dpr: 1,

  time: 0,
  delta: 0,
  lastFrame: 0,

  distance: 0,
  score: 0,
  bestScore: 0,
  combo: 0,
  maxCombo: 0,
  lives: 3,
  speed: 0,
  roadScroll: 0,

  difficulty: 0,
  spawnTimer: 0,
  collectibleTimer: 0,
  sceneryTimer: 0,
  eventTimer: 0,

  cameraShake: 0,
  cameraShakeStrength: 0,

  soundEnabled: true,
  reducedMotion: false,

  muted: false,
  gameOverSaved: false,
  newBest: false,

  readyCountdown: 3,
  readyTimer: 0,

  swipeStartX: 0,
  swipeStartY: 0,
  pointerActive: false,

  touchFeedbackX: 0,
  touchFeedbackY: 0,

  eventMessage: "",
  eventMessageTimer: 0,

  activePowerup: null,

  traffic: [],
  scenery: [],
  collectibles: [],
  particles: [],
  floatingTexts: [],
  roadMarks: [],

  objectId: 0,

  stars: [],
  skyline: [],

  audioContext: null,
  masterGain: null
};

/* =========================================================
   4. UTILITY FUNCTIONS
   ========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function inverseLerp(start, end, value) {
  if (start === end) return 0;
  return (value - start) / (end - start);
}

function smoothStep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function random(min = 0, max = 1) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function choose(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function chance(probability) {
  return Math.random() < probability;
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatNumber(value) {
  return Math.floor(value).toLocaleString("en-US");
}

function nowDate() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getElementText(selector, value) {
  const element = $(selector);
  if (element) {
    element.textContent = value;
  }
}

function showElement(selector) {
  const element = $(selector);
  if (element) {
    element.classList.remove("hidden");
  }
}

function hideElement(selector) {
  const element = $(selector);
  if (element) {
    element.classList.add("hidden");
  }
}

function setText(selector, value) {
  const element = $(selector);
  if (element) {
    element.textContent = value;
  }
}

function setHTML(selector, value) {
  const element = $(selector);
  if (element) {
    element.innerHTML = value;
  }
}

/* =========================================================
   5. STORAGE
   ========================================================= */

function loadPreferences() {
  const highScore = Number(
    readStorage(STORAGE_KEYS.highScore, "0")
  );

  game.bestScore = Number.isFinite(highScore) ? highScore : 0;

  const soundPreference = readStorage(
    STORAGE_KEYS.sound,
    "true"
  );

  const reducedMotionPreference = readStorage(
    STORAGE_KEYS.reducedMotion,
    "false"
  );

  game.soundEnabled = soundPreference !== "false";
  game.reducedMotion = reducedMotionPreference === "true";

  applyReducedMotionPreference();
}

function savePreferences() {
  writeStorage(
    STORAGE_KEYS.sound,
    String(game.soundEnabled)
  );

  writeStorage(
    STORAGE_KEYS.reducedMotion,
    String(game.reducedMotion)
  );
}

function getLeaderboard() {
  const raw = readStorage(
    STORAGE_KEYS.leaderboard,
    "[]"
  );

  const leaderboard = safeJsonParse(raw, []);

  if (!Array.isArray(leaderboard)) {
    return [];
  }

  return leaderboard
    .filter((entry) => entry && typeof entry === "object")
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 10);
}

function saveLeaderboardEntry(name, score) {
  const leaderboard = getLeaderboard();

  leaderboard.push({
    name: String(name || "RIDER").slice(0, 18),
    score: Math.floor(score),
    date: nowDate()
  });

  leaderboard.sort((a, b) => {
    return Number(b.score || 0) - Number(a.score || 0);
  });

  writeStorage(
    STORAGE_KEYS.leaderboard,
    JSON.stringify(leaderboard.slice(0, 10))
  );
}

function resetScores() {
  writeStorage(STORAGE_KEYS.highScore, "0");
  writeStorage(STORAGE_KEYS.leaderboard, "[]");
  game.bestScore = 0;
  game.newBest = false;
  renderLeaderboard();
  updateMenuBest();
  showToast("SCORES RESET");
}

/* =========================================================
   6. AUDIO
   ========================================================= */

function initializeAudio() {
  if (!game.soundEnabled) return;

  if (game.audioContext) return;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    game.audioContext = new AudioContextClass();
    game.masterGain = game.audioContext.createGain();
    game.masterGain.gain.value = 0.055;
    game.masterGain.connect(game.audioContext.destination);
  } catch (error) {
    console.warn("Audio unavailable:", error);
  }
}

function resumeAudio() {
  if (!game.audioContext) {
    initializeAudio();
  }

  if (
    game.audioContext &&
    game.audioContext.state === "suspended"
  ) {
    game.audioContext.resume().catch(() => {});
  }
}

function playTone(
  frequency = 440,
  duration = 0.08,
  type = "sine",
  volume = 0.15
) {
  if (!game.soundEnabled) return;
  if (!game.audioContext || !game.masterGain) return;

  try {
    const audio = game.audioContext;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      frequency,
      audio.currentTime
    );

    gain.gain.setValueAtTime(
      0.001,
      audio.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, volume),
      audio.currentTime + 0.012
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audio.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(game.masterGain);

    oscillator.start();
    oscillator.stop(audio.currentTime + duration + 0.02);
  } catch {
    /* Audio failure should never stop gameplay. */
  }
}

function playSound(name) {
  if (!game.soundEnabled) return;

  switch (name) {
    case "click":
      playTone(440, 0.07, "sine", 0.12);
      break;

    case "start":
      playTone(330, 0.09, "square", 0.1);
      window.setTimeout(() => {
        playTone(520, 0.12, "square", 0.12);
      }, 80);
      break;

    case "coin":
      playTone(720, 0.06, "triangle", 0.12);
      window.setTimeout(() => {
        playTone(980, 0.1, "triangle", 0.1);
      }, 45);
      break;

    case "powerup":
      playTone(380, 0.08, "triangle", 0.12);
      window.setTimeout(() => {
        playTone(640, 0.08, "triangle", 0.12);
      }, 70);
      window.setTimeout(() => {
        playTone(920, 0.12, "triangle", 0.1);
      }, 140);
      break;

    case "collision":
      playTone(90, 0.22, "sawtooth", 0.18);
      playTone(150, 0.13, "square", 0.08);
      break;

    case "lane":
      playTone(240, 0.045, "sine", 0.06);
      break;

    case "gameover":
      playTone(260, 0.13, "sawtooth", 0.12);
      window.setTimeout(() => {
        playTone(180, 0.2, "sawtooth", 0.1);
      }, 110);
      break;

    case "menu":
      playTone(580, 0.05, "sine", 0.06);
      break;

    default:
      playTone(440, 0.05, "sine", 0.06);
  }
}

/* =========================================================
   7. SCREEN MANAGEMENT
   ========================================================= */

const SCREEN_SELECTORS = [
  "#screen-splash",
  "#screen-menu",
  "#screen-howto",
  "#screen-ready",
  "#screen-paused",
  "#screen-settings",
  "#screen-leaderboard",
  "#screen-game-over",
  "#screen-share"
];

function hideAllScreens() {
  SCREEN_SELECTORS.forEach((selector) => {
    hideElement(selector);
  });
}

function showScreen(screenState) {
  hideAllScreens();

  game.state = screenState;

  const selectorMap = {
    [STATES.SPLASH]: "#screen-splash",
    [STATES.MENU]: "#screen-menu",
    [STATES.HOW_TO_PLAY]: "#screen-howto",
    [STATES.READY]: "#screen-ready",
    [STATES.PAUSED]: "#screen-paused",
    [STATES.SETTINGS]: "#screen-settings",
    [STATES.LEADERBOARD]: "#screen-leaderboard",
    [STATES.GAME_OVER]: "#screen-game-over",
    [STATES.SHARE]: "#screen-share"
  };

  const selector = selectorMap[screenState];

  if (selector) {
    showElement(selector);
  }

  updateHudVisibility();
}

function updateHudVisibility() {
  const hud = $("#hud");

  if (!hud) return;

  const visible =
    game.state === STATES.PLAYING ||
    game.state === STATES.READY ||
    game.state === STATES.PAUSED;

  hud.classList.toggle("hidden", !visible);
}

function openMenu() {
  playSound("menu");
  showScreen(STATES.MENU);
  updateMenuBest();
}

function openHowToPlay() {
  playSound("click");
  showScreen(STATES.HOW_TO_PLAY);
}

function openSettings() {
  playSound("click");
  syncSettingsUI();
  showScreen(STATES.SETTINGS);
}

function openLeaderboard() {
  playSound("click");
  renderLeaderboard();
  showScreen(STATES.LEADERBOARD);
}

/* =========================================================
   8. CANVAS RESIZE
   ========================================================= */

function resizeCanvas() {
  if (!canvas || !ctx) return;

  const rect = canvas.getBoundingClientRect();

  game.width = Math.max(1, rect.width);
  game.height = Math.max(1, rect.height);

  game.dpr = clamp(window.devicePixelRatio || 1, 1, 2);

  canvas.width = Math.floor(game.width * game.dpr);
  canvas.height = Math.floor(game.height * game.dpr);

  ctx.setTransform(
    game.dpr,
    0,
    0,
    game.dpr,
    0,
    0
  );

  createSkyline();
  createStars();
}

/* =========================================================
   9. WORLD INITIALIZATION
   ========================================================= */

function createStars() {
  game.stars = [];

  const count = game.reducedMotion ? 35 : 90;

  for (let i = 0; i < count; i += 1) {
    game.stars.push({
      x: random(0, 1),
      y: random(0.02, 0.31),
      radius: random(0.4, 1.5),
      alpha: random(0.18, 0.8),
      twinkle: random(0, Math.PI * 2)
    });
  }
}

function createSkyline() {
  game.skyline = [];

  let x = -0.02;

  while (x < 1.08) {
    const width = random(0.025, 0.075);
    const height = random(0.04, 0.18);

    game.skyline.push({
      x,
      width,
      height,
      color: choose([
        "#101b2b",
        "#172536",
        "#1d2c3e",
        "#24354a",
        "#152234"
      ]),
      antenna: chance(0.16),
      windows: chance(0.72)
    });

    x += width + random(0.004, 0.017);
  }
}

function resetPlayer() {
  PLAYER.lane = 1;
  PLAYER.targetLane = 1;
  PLAYER.x = laneToX(1);
  PLAYER.targetX = laneToX(1);
  PLAYER.lean = 0;
  PLAYER.targetLean = 0;
  PLAYER.speed = 0;
  PLAYER.maxSpeed = 1;
  PLAYER.acceleration = 0;
  PLAYER.animationTime = 0;
  PLAYER.invulnerable = 0;
  PLAYER.shieldTime = 0;
  PLAYER.nitroTime = 0;
  PLAYER.multiplierTime = 0;
  PLAYER.jumpTime = 0;
  PLAYER.jumpHeight = 0;
  PLAYER.hitFlash = 0;
  PLAYER.alive = true;
}

function resetWorld() {
  game.distance = 0;
  game.score = 0;
  game.combo = 0;
  game.maxCombo = 0;
  game.lives = 3;
  game.speed = 0;
  game.roadScroll = 0;
  game.difficulty = 0;
  game.spawnTimer = 0;
  game.collectibleTimer = 0;
  game.sceneryTimer = 0;
  game.eventTimer = 0;
  game.cameraShake = 0;
  game.cameraShakeStrength = 0;
  game.eventMessage = "";
  game.eventMessageTimer = 0;
  game.activePowerup = null;
  game.gameOverSaved = false;
  game.newBest = false;

  game.traffic.length = 0;
  game.scenery.length = 0;
  game.collectibles.length = 0;
  game.particles.length = 0;
  game.floatingTexts.length = 0;
  game.roadMarks.length = 0;

  resetPlayer();

  createInitialRoadMarks();
  createInitialScenery();
}

/* =========================================================
   10. ROAD GEOMETRY
   ========================================================= */

function horizonY() {
  return game.height * WORLD.horizon;
}

function roadBottomY() {
  return game.height * 1.08;
}

function roadY(depth) {
  const perspective = Math.pow(clamp(depth, 0, 1), 0.88);

  return lerp(
    horizonY(),
    roadBottomY(),
    perspective
  );
}

function roadWidthAt(depth) {
  const perspective = Math.pow(clamp(depth, 0, 1), 0.88);

  return lerp(
    game.width * WORLD.roadTopWidth,
    game.width * WORLD.roadBottomWidth,
    perspective
  );
}

function roadCenterAt(depth) {
  const drift =
    Math.sin(game.time * 0.00025) *
    game.width *
    0.006;

  return game.width * WORLD.roadCenter + drift;
}

function roadLeftAt(depth) {
  return roadCenterAt(depth) - roadWidthAt(depth) / 2;
}

function roadRightAt(depth) {
  return roadCenterAt(depth) + roadWidthAt(depth) / 2;
}

function laneToX(lane) {
  const normalizedLane =
    clamp(lane, 0, WORLD.laneCount - 1) /
    (WORLD.laneCount - 1);

  const bottomLeft = -0.38;
  const bottomRight = 0.38;

  return game.width * 0.5 +
    game.width *
      lerp(bottomLeft, bottomRight, normalizedLane);
}

function worldXToScreen(worldX, depth) {
  const left = roadLeftAt(depth);
  const width = roadWidthAt(depth);

  return left + width * worldX;
}

function laneWorldX(lane) {
  return (lane + 0.5) / WORLD.laneCount;
}

/* =========================================================
   11. ROAD MARKINGS
   ========================================================= */

function createInitialRoadMarks() {
  for (let i = 0; i < 22; i += 1) {
    game.roadMarks.push({
      id: nextId(),
      depth: i / 22,
      length: random(0.025, 0.07),
      offset: choose([1 / 3, 2 / 3])
    });
  }
}

function updateRoadMarks(dt) {
  for (const mark of game.roadMarks) {
    mark.depth += dt * (0.25 + game.speed * 0.4);

    if (mark.depth > 1.1) {
      mark.depth = random(-0.08, 0.02);
      mark.length = random(0.025, 0.07);
    }
  }
}

function drawRoadMarkings() {
  const laneOffsets = [1 / 3, 2 / 3];

  for (const mark of game.roadMarks) {
    const depth = mark.depth;
    const y = roadY(depth);
    const nextY = roadY(depth + mark.length);

    const roadLeft = roadLeftAt(depth);
    const roadWidth = roadWidthAt(depth);

    for (const offset of laneOffsets) {
      const x = roadLeft + roadWidth * offset;
      const width = Math.max(1, roadWidth * 0.008);

      ctx.save();
      ctx.globalAlpha = clamp(depth * 1.4, 0.05, 0.75);
      ctx.fillStyle = COLORS.lane;
      ctx.fillRect(
        x - width / 2,
        y,
        width,
        Math.max(2, nextY - y)
      );
      ctx.restore();
    }
  }
}

/* =========================================================
   12. BACKGROUND AND CITY
   ========================================================= */

function drawBackground() {
  const width = game.width;
  const height = game.height;
  const horizon = horizonY();

  const skyGradient = ctx.createLinearGradient(
    0,
    0,
    0,
    horizon + height * 0.12
  );

  skyGradient.addColorStop(0, COLORS.skyTop);
  skyGradient.addColorStop(0.52, COLORS.skyMiddle);
  skyGradient.addColorStop(1, COLORS.skyBottom);

  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  drawMoon();
  drawStars();
  drawDistantClouds();
  drawSkyline();
  drawHorizonGlow();
}

function drawMoon() {
  const x = game.width * 0.79;
  const y = game.height * 0.12;
  const radius = Math.min(game.width, game.height) * 0.035;

  ctx.save();

  const glow = ctx.createRadialGradient(
    x,
    y,
    radius * 0.2,
    x,
    y,
    radius * 3
  );

  glow.addColorStop(0, "rgba(255,224,165,0.24)");
  glow.addColorStop(1, "rgba(255,224,165,0)");

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8dcb5";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.skyTop;
  ctx.beginPath();
  ctx.arc(
    x + radius * 0.36,
    y - radius * 0.15,
    radius * 0.92,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawStars() {
  for (const star of game.stars) {
    const alpha =
      star.alpha +
      Math.sin(game.time * 0.002 + star.twinkle) * 0.12;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0.05, 0.9);
    ctx.fillStyle = "#d9eaff";
    ctx.beginPath();
    ctx.arc(
      star.x * game.width,
      star.y * game.height,
      star.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawDistantClouds() {
  const y = game.height * 0.2;

  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#d9e5ed";

  for (let i = 0; i < 5; i += 1) {
    const x =
      ((i * 0.29 + game.time * 0.000003) % 1.3) *
      game.width -
      game.width * 0.15;

    ctx.beginPath();
    ctx.ellipse(
      x,
      y + Math.sin(i) * 18,
      game.width * 0.12,
      game.height * 0.025,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawSkyline() {
  const horizon = horizonY();

  for (const building of game.skyline) {
    const x = building.x * game.width;
    const width = building.width * game.width;
    const height = building.height * game.height;
    const y = horizon - height;

    ctx.save();
    ctx.fillStyle = building.color;
    ctx.fillRect(x, y, width, height);

    if (building.antenna) {
      ctx.strokeStyle = "#52677b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + width * 0.5, y);
      ctx.lineTo(x + width * 0.5, y - height * 0.18);
      ctx.stroke();
    }

    if (building.windows && width > 12) {
      const columns = Math.max(1, Math.floor(width / 10));
      const rows = Math.max(1, Math.floor(height / 16));

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (chance(0.36)) {
            ctx.fillStyle = COLORS.window;
            ctx.globalAlpha = random(0.12, 0.5);

            ctx.fillRect(
              x + 4 + column * 9,
              y + 8 + row * 15,
              3,
              4
            );
          }
        }
      }
    }

    ctx.restore();
  }
}

function drawHorizonGlow() {
  const y = horizonY();

  const gradient = ctx.createLinearGradient(
    0,
    y - game.height * 0.1,
    0,
    y + game.height * 0.12
  );

  gradient.addColorStop(0, "rgba(255,168,98,0)");
  gradient.addColorStop(0.55, "rgba(255,168,98,0.12)");
  gradient.addColorStop(1, "rgba(255,168,98,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(
    0,
    y - game.height * 0.1,
    game.width,
    game.height * 0.22
  );
}

/* =========================================================
   13. ROAD DRAWING
   ========================================================= */

function drawRoad() {
  const horizon = horizonY();
  const center = roadCenterAt(1);
  const bottomWidth = roadWidthAt(1);
  const topWidth = roadWidthAt(0);

  const leftTop = game.width * 0.5 - topWidth / 2;
  const rightTop = game.width * 0.5 + topWidth / 2;

  const leftBottom = center - bottomWidth / 2;
  const rightBottom = center + bottomWidth / 2;

  const groundGradient = ctx.createLinearGradient(
    0,
    horizon,
    0,
    game.height
  );

  groundGradient.addColorStop(0, "#263646");
  groundGradient.addColorStop(0.4, "#1c2935");
  groundGradient.addColorStop(1, "#090e15");

  ctx.fillStyle = groundGradient;
  ctx.fillRect(
    0,
    horizon,
    game.width,
    game.height - horizon
  );

  ctx.save();

  ctx.fillStyle = "#111923";
  ctx.beginPath();
  ctx.moveTo(leftTop, horizon);
  ctx.lineTo(rightTop, horizon);
  ctx.lineTo(rightBottom, game.height);
  ctx.lineTo(leftBottom, game.height);
  ctx.closePath();
  ctx.fill();

  drawRoadShoulders(
    leftTop,
    rightTop,
    leftBottom,
    rightBottom,
    horizon
  );

  drawRoadMarkings();

  ctx.restore();
}

function drawRoadShoulders(
  leftTop,
  rightTop,
  leftBottom,
  rightBottom,
  horizon
) {
  const shoulderWidth = Math.max(3, game.width * 0.012);

  ctx.save();

  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = shoulderWidth;
  ctx.globalAlpha = 0.65;

  ctx.beginPath();
  ctx.moveTo(leftTop, horizon);
  ctx.lineTo(leftBottom, game.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightTop, horizon);
  ctx.lineTo(rightBottom, game.height);
  ctx.stroke();

  ctx.restore();
}

/* =========================================================
   14. SCENERY OBJECTS
   ========================================================= */

function nextId() {
  game.objectId += 1;
  return game.objectId;
}

function createInitialScenery() {
  for (let i = 0; i < 25; i += 1) {
    game.scenery.push(createSceneryObject(random(0, 1)));
  }
}

function createSceneryObject(depth = 0) {
  const side = chance(0.5) ? -1 : 1;

  return {
    id: nextId(),
    type: choose([
      "building",
      "lamp",
      "tree",
      "sign",
      "barrier"
    ]),
    depth,
    side,
    offset: random(0.03, 0.2),
    scale: random(0.75, 1.35),
    rotation: random(-0.04, 0.04),
    seed: random(0, 1000)
  };
}

function updateScenery(dt) {
  for (const object of game.scenery) {
    object.depth += dt * (0.14 + game.speed * 0.2);

    if (object.depth > 1.12) {
      Object.assign(
        object,
        createSceneryObject(random(-0.12, 0.02))
      );
    }
  }
}

function drawScenery() {
  const sorted = [...game.scenery].sort(
    (a, b) => a.depth - b.depth
  );

  for (const object of sorted) {
    drawSceneryObject(object);
  }
}

function sceneryPosition(object) {
  const depth = clamp(object.depth, 0, 1);
  const y = roadY(depth);
  const width = roadWidthAt(depth);
  const center = roadCenterAt(depth);

  const x =
    center +
    object.side *
      (width * 0.5 + width * object.offset);

  const scale = lerp(0.1, 1.3, depth) * object.scale;

  return {
    x,
    y,
    scale,
    depth
  };
}

function drawSceneryObject(object) {
  const position = sceneryPosition(object);

  if (position.depth <= 0) return;

  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.scale(position.scale, position.scale);

  switch (object.type) {
    case "building":
      drawSceneryBuilding(object);
      break;

    case "lamp":
      drawStreetLamp(object);
      break;

    case "tree":
      drawRoadsideTree(object);
      break;

    case "sign":
      drawRoadSign(object);
      break;

    case "barrier":
      drawRoadBarrier(object);
      break;

    default:
      break;
  }

  ctx.restore();
}

function drawSceneryBuilding(object) {
  const side = object.side;

  const width = 35 + Math.abs(object.seed % 30);
  const height = 60 + Math.abs(object.seed % 90);

  ctx.save();
  ctx.translate(0, -height);

  ctx.fillStyle = "#182534";
  ctx.fillRect(-width / 2, 0, width, height);

  ctx.fillStyle = "#2b3b4c";
  ctx.fillRect(
    -width / 2,
    0,
    width * 0.18,
    height
  );

  for (let y = 10; y < height - 8; y += 14) {
    for (let x = -width / 2 + 6; x < width / 2 - 3; x += 11) {
      if (chance(0.5)) {
        ctx.fillStyle = COLORS.window;
        ctx.globalAlpha = random(0.18, 0.55);
        ctx.fillRect(x, y, 4, 5);
      }
    }
  }

  ctx.restore();

  if (side < 0) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(-width / 2, 0, width, 4);
  }
}

function drawStreetLamp() {
  const height = 115;

  ctx.save();
  ctx.translate(0, -height);

  ctx.strokeStyle = "#3e4b59";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, 0);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(20, 8);
  ctx.lineTo(24, 17);
  ctx.stroke();

  const glow = ctx.createRadialGradient(
    24,
    20,
    1,
    24,
    20,
    36
  );

  glow.addColorStop(0, "rgba(255,220,139,0.55)");
  glow.addColorStop(1, "rgba(255,220,139,0)");

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(24, 20, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffdb91";
  ctx.beginPath();
  ctx.arc(24, 17, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRoadsideTree() {
  const height = 80;

  ctx.save();
  ctx.translate(0, -height * 0.7);

  ctx.fillStyle = "#47372b";
  ctx.fillRect(-4, 25, 8, 50);

  const foliage = ctx.createRadialGradient(
    -9,
    0,
    2,
    0,
    0,
    38
  );

  foliage.addColorStop(0, "#5e9368");
  foliage.addColorStop(1, "#182f2d");

  ctx.fillStyle = foliage;

  const circles = [
    [-15, 14, 19],
    [10, 9, 22],
    [0, -8, 25],
    [-22, -3, 16],
    [22, -8, 17]
  ];

  for (const [x, y, radius] of circles) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRoadSign() {
  ctx.save();

  ctx.strokeStyle = "#4e5d6c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -65);
  ctx.stroke();

  ctx.fillStyle = "#173b4d";
  ctx.strokeStyle = "#6fa0ad";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(-24, -84, 48, 25, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#b3e9ef";
  ctx.font = "bold 7px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ABUJA", 0, -69);

  ctx.restore();
}

function drawRoadBarrier() {
  ctx.save();

  ctx.fillStyle = "#59616a";
  ctx.fillRect(-24, -8, 48, 8);

  ctx.fillStyle = COLORS.red;

  for (let x = -21; x < 23; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.lineTo(x + 7, -8);
    ctx.lineTo(x + 1, 0);
    ctx.lineTo(x - 6, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/* =========================================================
   15. TRAFFIC SYSTEM
   ========================================================= */

const VEHICLE_TYPES = [
  {
    type: "sedan",
    width: 0.13,
    height: 0.2,
    color: "#b73630",
    roof: "#762b2b"
  },
  {
    type: "taxi",
    width: 0.13,
    height: 0.2,
    color: "#d8a83d",
    roof: "#9d792c"
  },
  {
    type: "van",
    width: 0.16,
    height: 0.23,
    color: "#a6b4bd",
    roof: "#687a87"
  },
  {
    type: "sport",
    width: 0.14,
    height: 0.18,
    color: "#3264a9",
    roof: "#213f71"
  },
  {
    type: "bus",
    width: 0.2,
    height: 0.3,
    color: "#3c7c70",
    roof: "#255149"
  }
];

function createTrafficVehicle(depth = -0.1) {
  const vehicleType = choose(VEHICLE_TYPES);
  const lane = randomInt(0, WORLD.laneCount - 1);

  return {
    id: nextId(),
    type: vehicleType.type,
    lane,
    worldX: laneWorldX(lane),
    depth,
    speed: random(0.25, 0.8),
    width: vehicleType.width,
    height: vehicleType.height,
    color: vehicleType.color,
    roofColor: vehicleType.roof,
    passed: false,
    hit: false,
    blink: random(0, Math.PI * 2),
    seed: random(0, 1000)
  };
}

function spawnTraffic() {
  const vehicle = createTrafficVehicle(
    random(-0.2, -0.04)
  );

  const tooClose = game.traffic.some((other) => {
    return (
      other.lane === vehicle.lane &&
      other.depth < 0.25
    );
  });

  if (!tooClose) {
    game.traffic.push(vehicle);
  }
}

function updateTraffic(dt) {
  for (const vehicle of game.traffic) {
    const relativeSpeed =
      0.23 +
      game.speed * 0.58 -
      vehicle.speed * 0.14;

    vehicle.depth += dt * relativeSpeed;
    vehicle.blink += dt * 4;

    if (
      !vehicle.passed &&
      vehicle.depth > 0.74
    ) {
      vehicle.passed = true;
      game.combo += 1;
      game.maxCombo = Math.max(
        game.maxCombo,
        game.combo
      );

      const bonus = 15 + game.combo * 2;
      addScore(bonus);

      createFloatingText(
        vehicleScreenX(vehicle),
        vehicleScreenY(vehicle) - 25,
        `+${bonus}`,
        COLORS.green
      );
    }
  }

  game.traffic = game.traffic.filter(
    (vehicle) => vehicle.depth < 1.2 && !vehicle.hit
  );
}

function vehicleScreenX(vehicle) {
  return worldXToScreen(
    vehicle.worldX,
    clamp(vehicle.depth, 0, 1)
  );
}

function vehicleScreenY(vehicle) {
  return roadY(clamp(vehicle.depth, 0, 1));
}

function drawTraffic() {
  const sorted = [...game.traffic].sort(
    (a, b) => a.depth - b.depth
  );

  for (const vehicle of sorted) {
    drawTrafficVehicle(vehicle);
  }
}

function drawTrafficVehicle(vehicle) {
  const depth = clamp(vehicle.depth, 0, 1);
  if (depth <= 0) return;

  const x = vehicleScreenX(vehicle);
  const y = vehicleScreenY(vehicle);

  const scale = lerp(0.12, 1.15, depth);
  const width = game.width * vehicle.width * scale;
  const height = game.height * vehicle.height * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);

  drawVehicleBody(
    vehicle,
    width,
    height,
    scale
  );

  ctx.restore();
}

function drawVehicleBody(vehicle, width, height, scale) {
  const bodyWidth = width;
  const bodyHeight = height;

  ctx.save();

  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 5 * scale;

  ctx.fillStyle = vehicle.color;

  ctx.beginPath();
  ctx.roundRect(
    -bodyWidth / 2,
    0,
    bodyWidth,
    bodyHeight,
    Math.max(2, bodyWidth * 0.1)
  );
  ctx.fill();

  ctx.shadowColor = "transparent";

  const roofHeight =
    bodyHeight *
    (vehicle.type === "bus" ? 0.55 : 0.43);

  const roofWidth =
    bodyWidth *
    (vehicle.type === "van" ? 0.85 : 0.72);

  ctx.fillStyle = vehicle.roofColor;

  ctx.beginPath();
  ctx.roundRect(
    -roofWidth / 2,
    bodyHeight * 0.35,
    roofWidth,
    roofHeight,
    Math.max(2, bodyWidth * 0.07)
  );
  ctx.fill();

  const windowGradient = ctx.createLinearGradient(
    0,
    bodyHeight * 0.4,
    0,
    bodyHeight * 0.72
  );

  windowGradient.addColorStop(0, "#b4d8e0");
  windowGradient.addColorStop(0.5, "#426276");
  windowGradient.addColorStop(1, "#172c3d");

  ctx.fillStyle = windowGradient;

  ctx.beginPath();
  ctx.roundRect(
    -roofWidth * 0.4,
    bodyHeight * 0.43,
    roofWidth * 0.8,
    roofHeight * 0.48,
    Math.max(1, bodyWidth * 0.04)
  );
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(0.5, scale);

  ctx.beginPath();
  ctx.moveTo(0, bodyHeight * 0.44);
  ctx.lineTo(0, bodyHeight * 0.87);
  ctx.stroke();

  drawVehicleLights(
    bodyWidth,
    bodyHeight,
    scale
  );

  drawVehicleWheels(
    bodyWidth,
    bodyHeight,
    scale
  );

  if (vehicle.type === "taxi") {
    ctx.fillStyle = "#fff1ae";
    ctx.fillRect(
      -bodyWidth * 0.18,
      bodyHeight * 0.24,
      bodyWidth * 0.36,
      bodyHeight * 0.07
    );
  }

  ctx.restore();
}

function drawVehicleLights(width, height, scale) {
  const lightWidth = Math.max(2, width * 0.13);
  const lightHeight = Math.max(2, height * 0.06);

  ctx.fillStyle = "#ff4141";

  ctx.fillRect(
    -width * 0.32,
    height * 0.08,
    lightWidth,
    lightHeight
  );

  ctx.fillRect(
    width * 0.19,
    height * 0.08,
    lightWidth,
    lightHeight
  );

  ctx.fillStyle = "#d8f4ff";

  ctx.fillRect(
    -width * 0.32,
    height * 0.87,
    lightWidth,
    lightHeight
  );

  ctx.fillRect(
    width * 0.19,
    height * 0.87,
    lightWidth,
    lightHeight
  );
}

function drawVehicleWheels(width, height, scale) {
  const wheelWidth = Math.max(2, width * 0.13);
  const wheelHeight = Math.max(5, height * 0.2);

  ctx.fillStyle = "#080b10";

  const positions = [
    [-width * 0.48, height * 0.22],
    [width * 0.35, height * 0.22],
    [-width * 0.48, height * 0.7],
    [width * 0.35, height * 0.7]
  ];

  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.roundRect(
      x,
      y,
      wheelWidth,
      wheelHeight,
      wheelWidth * 0.35
    );
    ctx.fill();
  }
}

/* =========================================================
   16. PLAYER MOTORCYCLE
   ========================================================= */

function drawPlayer() {
  const x = lerp(
    PLAYER.x,
    PLAYER.targetX,
    1 - Math.pow(0.0001, game.delta)
  );

  PLAYER.x = x;

  const baseY = game.height * PLAYER.y;
  const jumpOffset = -PLAYER.jumpHeight * game.height;

  const bikeScale = clamp(
    Math.min(game.width, game.height) / 650,
    0.65,
    1.35
  );

  ctx.save();

  ctx.translate(
    game.width * PLAYER.x,
    baseY + jumpOffset
  );

  ctx.rotate(PLAYER.lean);

  if (PLAYER.invulnerable > 0) {
    ctx.globalAlpha =
      0.55 + Math.sin(game.time * 0.025) * 0.25;
  }

  drawPlayerShadow(bikeScale);
  drawBike(bikeScale);
  drawRider(bikeScale);

  if (PLAYER.shieldTime > 0) {
    drawPlayerShield(bikeScale);
  }

  ctx.restore();
}

function drawPlayerShadow(scale) {
  ctx.save();

  ctx.translate(0, 10 * scale);
  ctx.scale(1, 0.25);

  const shadow = ctx.createRadialGradient(
    0,
    0,
    2,
    0,
    0,
    45 * scale
  );

  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    43 * scale,
    20 * scale,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawBike(scale) {
  const t = PLAYER.animationTime;
  const wheelRotation = t * 9;

  const wheelRadius = 17 * scale;
  const wheelWidth = 7 * scale;

  const rearWheelX = -19 * scale;
  const frontWheelX = 22 * scale;
  const wheelY = 18 * scale;

  drawBikeWheel(
    rearWheelX,
    wheelY,
    wheelRadius,
    wheelWidth,
    wheelRotation
  );

  drawBikeWheel(
    frontWheelX,
    wheelY,
    wheelRadius,
    wheelWidth,
    wheelRotation
  );

  ctx.save();

  ctx.strokeStyle = "#7d8a98";
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(rearWheelX, wheelY);
  ctx.lineTo(-5 * scale, -3 * scale);
  ctx.lineTo(frontWheelX, wheelY);
  ctx.stroke();

  ctx.strokeStyle = "#d2dbe2";
  ctx.lineWidth = 2 * scale;

  ctx.beginPath();
  ctx.moveTo(frontWheelX, wheelY);
  ctx.lineTo(28 * scale, -9 * scale);
  ctx.stroke();

  ctx.restore();

  const bodyGradient = ctx.createLinearGradient(
    -20 * scale,
    -10 * scale,
    18 * scale,
    15 * scale
  );

  bodyGradient.addColorStop(0, "#ff8a55");
  bodyGradient.addColorStop(0.4, "#ed3f2f");
  bodyGradient.addColorStop(1, "#7e1720");

  ctx.fillStyle = bodyGradient;

  ctx.beginPath();
  ctx.moveTo(-25 * scale, 5 * scale);
  ctx.lineTo(-12 * scale, -9 * scale);
  ctx.lineTo(10 * scale, -11 * scale);
  ctx.lineTo(24 * scale, 3 * scale);
  ctx.lineTo(13 * scale, 12 * scale);
  ctx.lineTo(-17 * scale, 12 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#101a25";

  ctx.beginPath();
  ctx.moveTo(-7 * scale, -9 * scale);
  ctx.lineTo(10 * scale, -8 * scale);
  ctx.lineTo(16 * scale, -1 * scale);
  ctx.lineTo(-2 * scale, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffdfaa";
  ctx.beginPath();
  ctx.ellipse(
    24 * scale,
    0,
    3 * scale,
    4 * scale,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.fillStyle = "#f8f3d1";
  ctx.beginPath();
  ctx.ellipse(
    26 * scale,
    -3 * scale,
    2 * scale,
    2 * scale,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.fillStyle = "#111820";
  ctx.fillRect(
    -23 * scale,
    10 * scale,
    9 * scale,
    4 * scale
  );

  ctx.fillStyle = "#e9e2cd";
  ctx.fillRect(
    -28 * scale,
    6 * scale,
    4 * scale,
    4 * scale
  );

  drawExhaustSmoke(scale);
}

function drawBikeWheel(
  x,
  y,
  radius,
  width,
  rotation
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#070a0f";
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    width,
    radius,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.strokeStyle = "#8b9ba9";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    width * 0.45,
    radius * 0.86,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.strokeStyle = "#4c5c6d";
  ctx.lineWidth = 1;

  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(angle) * width * 0.35,
      Math.sin(angle) * radius * 0.75
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawExhaustSmoke(scale) {
  if (game.reducedMotion) return;

  if (game.speed < 0.25) return;

  const amount = PLAYER.nitroTime > 0 ? 2 : 1;

  for (let i = 0; i < amount; i += 1) {
    const x = -30 * scale - random(0, 8) * scale;
    const y = 8 * scale + random(-3, 3) * scale;

    ctx.save();
    ctx.globalAlpha = random(0.12, 0.3);
    ctx.fillStyle = "#b7c2ca";
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      random(2, 6) * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawRider(scale) {
  const t = PLAYER.animationTime;
  const runningMotion = Math.sin(t * 7);
  const ridingMotion = Math.sin(t * 5);

  const shoulderY = -39 * scale;
  const headY = -61 * scale;

  const armSwing = runningMotion * 1.5 * scale;
  const legSwing = ridingMotion * 2.5 * scale;

  ctx.save();

  /* Legs */
  ctx.strokeStyle = "#101a2a";
  ctx.lineWidth = 8 * scale;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-7 * scale, -5 * scale);
  ctx.lineTo(
    -13 * scale + legSwing,
    10 * scale
  );
  ctx.lineTo(-21 * scale, 19 * scale);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(5 * scale, -5 * scale);
  ctx.lineTo(
    11 * scale - legSwing,
    9 * scale
  );
  ctx.lineTo(20 * scale, 18 * scale);
  ctx.stroke();

  /* Shoes */
  ctx.fillStyle = "#070a10";

  ctx.beginPath();
  ctx.ellipse(
    -22 * scale,
    20 * scale,
    8 * scale,
    3 * scale,
    -0.15,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(
    21 * scale,
    19 * scale,
    8 * scale,
    3 * scale,
    0.15,
    0,
    Math.PI * 2
  );
  ctx.fill();

  /* Torso */
  const torsoGradient = ctx.createLinearGradient(
    -13 * scale,
    -39 * scale,
    13 * scale,
    -8 * scale
  );

  torsoGradient.addColorStop(0, "#354d68");
  torsoGradient.addColorStop(1, "#152538");

  ctx.fillStyle = torsoGradient;

  ctx.beginPath();
  ctx.moveTo(-13 * scale, -41 * scale);
  ctx.lineTo(12 * scale, -41 * scale);
  ctx.lineTo(15 * scale, -12 * scale);
  ctx.lineTo(-10 * scale, -10 * scale);
  ctx.closePath();
  ctx.fill();

  /* Jacket stripe */
  ctx.strokeStyle = "#ff4f36";
  ctx.lineWidth = 3 * scale;

  ctx.beginPath();
  ctx.moveTo(-8 * scale, -38 * scale);
  ctx.lineTo(-5 * scale, -13 * scale);
  ctx.stroke();

  /* Neck */
  ctx.fillStyle = "#a96d52";
  ctx.fillRect(
    -5 * scale,
    -48 * scale,
    10 * scale,
    9 * scale
  );

  /* Arms */
  ctx.strokeStyle = "#233a51";
  ctx.lineWidth = 7 * scale;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-10 * scale, -37 * scale);
  ctx.lineTo(
    -19 * scale + armSwing,
    -23 * scale
  );
  ctx.lineTo(-12 * scale, -15 * scale);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(10 * scale, -37 * scale);
  ctx.lineTo(
    19 * scale - armSwing,
    -23 * scale
  );
  ctx.lineTo(14 * scale, -13 * scale);
  ctx.stroke();

  /* Gloves */
  ctx.fillStyle = "#080d16";

  ctx.beginPath();
  ctx.arc(
    -12 * scale,
    -14 * scale,
    4 * scale,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.arc(
    14 * scale,
    -13 * scale,
    4 * scale,
    0,
    Math.PI * 2
  );
  ctx.fill();

  /* Helmet */
  ctx.fillStyle = "#111a27";

  ctx.beginPath();
  ctx.arc(
    0,
    headY + 3 * scale,
    14 * scale,
    Math.PI,
    Math.PI * 2
  );
  ctx.lineTo(
    14 * scale,
    headY + 8 * scale
  );
  ctx.lineTo(
    -14 * scale,
    headY + 8 * scale
  );
  ctx.closePath();
  ctx.fill();

  /* Helmet visor */
  ctx.fillStyle = "#8fc5d5";

  ctx.beginPath();
  ctx.roundRect(
    -10 * scale,
    headY + 1 * scale,
    20 * scale,
    7 * scale,
    3 * scale
  );
  ctx.fill();

  ctx.fillStyle = "rgba(9,23,36,0.75)";
  ctx.fillRect(
    -8 * scale,
    headY + 2 * scale,
    16 * scale,
    4 * scale
  );

  /* Helmet highlight */
  ctx.strokeStyle = "#ff6d4f";
  ctx.lineWidth = 2 * scale;

  ctx.beginPath();
  ctx.arc(
    0,
    headY + 2 * scale,
    10 * scale,
    Math.PI * 1.1,
    Math.PI * 1.75
  );
  ctx.stroke();

  ctx.restore();
}

function drawPlayerShield(scale) {
  const pulse =
    1 + Math.sin(game.time * 0.008) * 0.05;

  const radius = 65 * scale * pulse;

  ctx.save();

  const gradient = ctx.createRadialGradient(
    0,
    -20 * scale,
    radius * 0.2,
    0,
    -20 * scale,
    radius
  );

  gradient.addColorStop(
    0,
    "rgba(79,231,255,0.02)"
  );

  gradient.addColorStop(
    0.72,
    "rgba(79,231,255,0.08)"
  );

  gradient.addColorStop(
    1,
    "rgba(79,231,255,0.25)"
  );

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, -20 * scale, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(79,231,255,0.8)";
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([7 * scale, 6 * scale]);

  ctx.beginPath();
  ctx.arc(
    0,
    -20 * scale,
    radius,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.restore();
}

/* =========================================================
   17. PLAYER CONTROLS
   ========================================================= */

function movePlayer(direction) {
  if (game.state !== STATES.PLAYING) return;

  const nextLane = clamp(
    PLAYER.targetLane + direction,
    0,
    WORLD.laneCount - 1
  );

  if (nextLane === PLAYER.targetLane) {
    return;
  }

  PLAYER.targetLane = nextLane;
  PLAYER.targetX = laneToX(nextLane);
  PLAYER.targetLean = direction * 0.13;

  playSound("lane");

  window.setTimeout(() => {
    PLAYER.targetLean = 0;
  }, 180);
}

function jumpPlayer() {
  if (game.state !== STATES.PLAYING) return;

  if (PLAYER.jumpTime > 0) return;

  PLAYER.jumpTime = 0.75;
  PLAYER.jumpHeight = 0;

  playSound("click");
}

function activateNitro() {
  if (game.state !== STATES.PLAYING) return;

  PLAYER.nitroTime = Math.max(
    PLAYER.nitroTime,
    2.5
  );

  game.activePowerup = POWERUPS.NITRO;

  createFloatingText(
    game.width * 0.5,
    game.height * 0.42,
    "NITRO!",
    COLORS.cyan
  );

  showToast("NITRO BOOST");
  playSound("powerup");
}

function handleKeyboard(event) {
  const key = event.key.toLowerCase();

  if (
    [
      "arrowleft",
      "arrowright",
      "arrowup",
      " ",
      "a",
      "d",
      "w",
      "s",
      "p",
      "escape"
    ].includes(key)
  ) {
    event.preventDefault();
  }

  if (key === "arrowleft" || key === "a") {
    movePlayer(-1);
  }

  if (key === "arrowright" || key === "d") {
    movePlayer(1);
  }

  if (key === "arrowup" || key === "w" || key === " ") {
    jumpPlayer();
  }

  if (key === "n") {
    activateNitro();
  }

  if (key === "p" || key === "escape") {
    togglePause();
  }

  if (key === "enter" && game.state === STATES.MENU) {
    startGame();
  }
}

function handlePointerDown(event) {
  if (!canvas) return;

  game.pointerActive = true;
  game.swipeStartX = event.clientX;
  game.swipeStartY = event.clientY;

  showTouchFeedback(
    event.clientX,
    event.clientY
  );
}

function handlePointerUp(event) {
  if (!game.pointerActive) return;

  game.pointerActive = false;

  const deltaX = event.clientX - game.swipeStartX;
  const deltaY = event.clientY - game.swipeStartY;

  const horizontalThreshold = 25;
  const verticalThreshold = 30;

  if (
    Math.abs(deltaX) > Math.abs(deltaY) &&
    Math.abs(deltaX) > horizontalThreshold
  ) {
    movePlayer(deltaX > 0 ? 1 : -1);
    return;
  }

  if (
    deltaY < -verticalThreshold &&
    Math.abs(deltaY) > Math.abs(deltaX)
  ) {
    jumpPlayer();
  }
}

function handlePointerCancel() {
  game.pointerActive = false;
}

function showTouchFeedback(x, y) {
  const feedback = $("#touch-feedback");

  if (!feedback) return;

  feedback.style.left = `${x}px`;
  feedback.style.top = `${y}px`;

  feedback.classList.remove("active");

  void feedback.offsetWidth;

  feedback.classList.add("active");
}

/* =========================================================
   18. COLLISION DETECTION
   ========================================================= */

function getPlayerCollisionBox() {
  const x = game.width * PLAYER.x;
  const y = game.height * PLAYER.y;

  return {
    x: x - game.width * 0.045,
    y: y - game.height * 0.12,
    width: game.width * 0.09,
    height: game.height * 0.2
  };
}

function getTrafficCollisionBox(vehicle) {
  const depth = clamp(vehicle.depth, 0, 1);
  const scale = lerp(0.12, 1.15, depth);

  const x = vehicleScreenX(vehicle);
  const y = vehicleScreenY(vehicle);

  const width = game.width * vehicle.width * scale;
  const height = game.height * vehicle.height * scale;

  return {
    x: x - width * 0.5,
    y: y - height,
    width,
    height
  };
}

function boxesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function checkTrafficCollisions() {
  if (PLAYER.invulnerable > 0) return;

  const playerBox = getPlayerCollisionBox();

  for (const vehicle of game.traffic) {
    if (vehicle.hit) continue;

    if (vehicle.depth < 0.48 || vehicle.depth > 0.94) {
      continue;
    }

    const vehicleBox = getTrafficCollisionBox(vehicle);

    if (boxesOverlap(playerBox, vehicleBox)) {
      handleCollision(vehicle);
      break;
    }
  }
}

function handleCollision(vehicle) {
  vehicle.hit = true;

  if (PLAYER.shieldTime > 0) {
    PLAYER.shieldTime = 0;
    PLAYER.invulnerable = 0.8;

    createImpactParticles(
      vehicleScreenX(vehicle),
      vehicleScreenY(vehicle) - 25
    );

    showToast("SHIELD ABSORBED IMPACT");
    playSound("collision");
    addScore(40);
    return;
  }

  PLAYER.invulnerable = 1.4;
  PLAYER.hitFlash = 0.4;

  game.lives = Math.max(0, game.lives - 1);
  game.combo = 0;

  game.cameraShake = 0.4;
  game.cameraShakeStrength = 15;

  createImpactParticles(
    vehicleScreenX(vehicle),
    vehicleScreenY(vehicle) - 25
  );

  createFloatingText(
    game.width * PLAYER.x,
    game.height * PLAYER.y - 80,
    "-1 LIFE",
    COLORS.danger
  );

  showToast("COLLISION");

  playSound("collision");

  if (game.lives <= 0) {
    endGame();
  }
}

/* =========================================================
   19. COLLECTIBLES AND POWERUPS
   ========================================================= */

function createCollectible(depth = -0.05) {
  const types = [
    "coin",
    "coin",
    "coin",
    "shield",
    "nitro",
    "multiplier"
  ];

  const type = choose(types);
  const lane = randomInt(0, WORLD.laneCount - 1);

  return {
    id: nextId(),
    type,
    lane,
    worldX: laneWorldX(lane),
    depth,
    rotation: random(0, Math.PI * 2),
    collected: false,
    bob: random(0, Math.PI * 2)
  };
}

function spawnCollectible() {
  game.collectibles.push(
    createCollectible(random(-0.15, -0.03))
  );
}

function updateCollectibles(dt) {
  for (const collectible of game.collectibles) {
    collectible.depth += dt * (0.24 + game.speed * 0.44);
    collectible.rotation += dt * 4;
    collectible.bob += dt * 4;
  }

  game.collectibles = game.collectibles.filter(
    (item) => item.depth < 1.15 && !item.collected
  );

  checkCollectibleCollisions();
}

function drawCollectibles() {
  const sorted = [...game.collectibles].sort(
    (a, b) => a.depth - b.depth
  );

  for (const collectible of sorted) {
    drawCollectible(collectible);
  }
}

function drawCollectible(collectible) {
  const depth = clamp(collectible.depth, 0, 1);
  if (depth <= 0) return;

  const x = worldXToScreen(
    collectible.worldX,
    depth
  );

  const y =
    roadY(depth) -
    Math.sin(collectible.bob) *
      lerp(2, 10, depth);

  const scale = lerp(0.15, 1.2, depth);
  const radius = 7 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(collectible.rotation);

  if (collectible.type === "coin") {
    drawCoin(radius);
  } else if (collectible.type === "shield") {
    drawShieldPickup(radius);
  } else if (collectible.type === "nitro") {
    drawNitroPickup(radius);
  } else if (collectible.type === "multiplier") {
    drawMultiplierPickup(radius);
  }

  ctx.restore();
}

function drawCoin(radius) {
  const gradient = ctx.createRadialGradient(
    0,
    0,
    1,
    0,
    0,
    radius * 1.4
  );

  gradient.addColorStop(0, "#fff1a3");
  gradient.addColorStop(0.5, "#ffc857");
  gradient.addColorStop(1, "#b46d19");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fff1a3";
  ctx.lineWidth = Math.max(1, radius * 0.15);
  ctx.stroke();

  ctx.fillStyle = "#8e5719";
  ctx.font = `bold ${Math.max(5, radius)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₦", 0, 0.5);
}

function drawShieldPickup(radius) {
  ctx.fillStyle = "rgba(79,231,255,0.22)";
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = Math.max(1, radius * 0.18);

  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius, -radius * 0.45);
  ctx.lineTo(radius * 0.7, radius * 0.75);
  ctx.lineTo(0, radius * 1.15);
  ctx.lineTo(-radius * 0.7, radius * 0.75);
  ctx.lineTo(-radius, -radius * 0.45);
  ctx.closePath();
  ctx.stroke();
}

function drawNitroPickup(radius) {
  ctx.fillStyle = "rgba(79,231,255,0.22)";
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = Math.max(1, radius * 0.2);

  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.cyan;
  ctx.beginPath();
  ctx.moveTo(radius * 0.2, -radius);
  ctx.lineTo(-radius * 0.15, -radius * 0.05);
  ctx.lineTo(radius * 0.15, -radius * 0.05);
  ctx.lineTo(-radius * 0.25, radius);
  ctx.lineTo(radius * 0.55, -radius * 0.3);
  ctx.lineTo(radius * 0.15, -radius * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawMultiplierPickup(radius) {
  ctx.fillStyle = "rgba(173,145,255,0.2)";
  ctx.strokeStyle = COLORS.purple;
  ctx.lineWidth = Math.max(1, radius * 0.2);

  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.purple;
  ctx.font = `bold ${Math.max(6, radius * 1.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("×2", 0, 0);
}

function checkCollectibleCollisions() {
  const playerBox = getPlayerCollisionBox();

  for (const collectible of game.collectibles) {
    if (collectible.collected) continue;

    if (
      collectible.depth < 0.55 ||
      collectible.depth > 0.98
    ) {
      continue;
    }

    const x = worldXToScreen(
      collectible.worldX,
      collectible.depth
    );

    const y = roadY(collectible.depth);

    const radius = 15 * collectible.depth;

    const box = {
      x: x - radius,
      y: y - radius,
      width: radius * 2,
      height: radius * 2
    };

    if (boxesOverlap(playerBox, box)) {
      collectItem(collectible);
    }
  }
}

function collectItem(item) {
  item.collected = true;

  if (item.type === "coin") {
    const points = 25 + game.combo * 3;
    addScore(points);
    game.combo += 1;
    game.maxCombo = Math.max(
      game.maxCombo,
      game.combo
    );

    createCoinParticles(
      worldXToScreen(item.worldX, item.depth),
      roadY(item.depth)
    );

    createFloatingText(
      game.width * PLAYER.x,
      game.height * PLAYER.y - 75,
      `+${points}`,
      COLORS.gold
    );

    playSound("coin");
  }

  if (item.type === "shield") {
    PLAYER.shieldTime = 8;
    game.activePowerup = POWERUPS.SHIELD;
    showToast("SHIELD ACTIVE");
    createPowerupParticles(COLORS.cyan);
    playSound("powerup");
  }

  if (item.type === "nitro") {
    PLAYER.nitroTime = 5;
    game.activePowerup = POWERUPS.NITRO;
    showToast("NITRO READY");
    createPowerupParticles(COLORS.cyan);
    playSound("powerup");
  }

  if (item.type === "multiplier") {
    PLAYER.multiplierTime = 7;
    game.activePowerup = POWERUPS.MULTIPLIER;
    showToast("DOUBLE SCORE");
    createPowerupParticles(COLORS.purple);
    playSound("powerup");
  }
}

/* =========================================================
   20. PARTICLE SYSTEM
   ========================================================= */

function createParticle(options = {}) {
  if (game.particles.length > 650) {
    game.particles.shift();
  }

  game.particles.push({
    x: options.x ?? game.width * 0.5,
    y: options.y ?? game.height * 0.5,
    vx: options.vx ?? random(-40, 40),
    vy: options.vy ?? random(-80, 10),
    gravity: options.gravity ?? 80,
    life: options.life ?? 0.6,
    maxLife: options.life ?? 0.6,
    size: options.size ?? random(1, 4),
    color: options.color ?? COLORS.white,
    alpha: options.alpha ?? 1,
    drag: options.drag ?? 0.96,
    shape: options.shape ?? "circle",
    rotation: options.rotation ?? random(0, Math.PI * 2),
    rotationSpeed: options.rotationSpeed ?? random(-4, 4)
  });
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.life -= dt;

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    particle.vx *= Math.pow(particle.drag, dt * 60);
    particle.vy += particle.gravity * dt;

    particle.rotation += particle.rotationSpeed * dt;
  }

  game.particles = game.particles.filter(
    (particle) => particle.life > 0
  );
}

function drawParticles() {
  for (const particle of game.particles) {
    const alpha =
      clamp(particle.life / particle.maxLife, 0, 1) *
      particle.alpha;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);

    if (particle.shape === "square") {
      ctx.fillRect(
        -particle.size / 2,
        -particle.size / 2,
        particle.size,
        particle.size
      );
    } else {
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        particle.size,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }
}

function createImpactParticles(x, y) {
  const count = game.reducedMotion ? 12 : 36;

  for (let i = 0; i < count; i += 1) {
    const angle = random(0, Math.PI * 2);
    const speed = random(40, 190);

    createParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 110,
      life: random(0.25, 0.7),
      size: random(1, 4),
      color: choose([
        COLORS.red,
        COLORS.orange,
        COLORS.gold,
        "#dce7f2"
      ]),
      shape: "square"
    });
  }
}

function createCoinParticles(x, y) {
  const count = game.reducedMotion ? 5 : 13;

  for (let i = 0; i < count; i += 1) {
    createParticle({
      x,
      y,
      vx: random(-50, 50),
      vy: random(-100, -30),
      gravity: 100,
      life: random(0.3, 0.65),
      size: random(1, 3),
      color: COLORS.gold
    });
  }
}

function createPowerupParticles(color) {
  const x = game.width * PLAYER.x;
  const y = game.height * PLAYER.y - 40;

  const count = game.reducedMotion ? 12 : 30;

  for (let i = 0; i < count; i += 1) {
    const angle = random(0, Math.PI * 2);
    const speed = random(30, 130);

    createParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0,
      life: random(0.3, 0.9),
      size: random(1, 3),
      color
    });
  }
}

function createSpeedParticles() {
  if (game.reducedMotion) return;
  if (game.speed < 0.58) return;
  if (!chance(0.4)) return;

  const x = random(0.18, 0.82) * game.width;
  const y = random(0.48, 0.9) * game.height;

  createParticle({
    x,
    y,
    vx: random(-12, 12),
    vy: random(90, 220),
    gravity: 0,
    life: random(0.18, 0.45),
    size: random(1, 2),
    color: "rgba(220,235,245,0.7)",
    shape: "square"
  });
}

/* =========================================================
   21. FLOATING TEXT
   ========================================================= */

function createFloatingText(x, y, text, color) {
  game.floatingTexts.push({
    x,
    y,
    text,
    color,
    life: 1,
    maxLife: 1,
    vy: -38
  });
}

function updateFloatingTexts(dt) {
  for (const item of game.floatingTexts) {
    item.life -= dt;
    item.y += item.vy * dt;
  }

  game.floatingTexts = game.floatingTexts.filter(
    (item) => item.life > 0
  );
}

function drawFloatingTexts() {
  for (const item of game.floatingTexts) {
    ctx.save();

    ctx.globalAlpha = clamp(item.life, 0, 1);
    ctx.fillStyle = item.color;
    ctx.font = "900 17px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 10;

    ctx.fillText(item.text, item.x, item.y);

    ctx.restore();
  }
}

/* =========================================================
   22. GAME SCORING
   ========================================================= */

function addScore(points) {
  let multiplier = 1;

  if (PLAYER.multiplierTime > 0) {
    multiplier = 2;
  }

  const comboMultiplier =
    1 + Math.min(game.combo, 20) * 0.04;

  game.score += Math.floor(
    points * multiplier * comboMultiplier
  );
}

function updateDifficulty() {
  game.difficulty = clamp(
    game.distance / 1800,
    0,
    1
  );
}

function updateMenuBest() {
  setText(
    "#menu-best",
    `BEST SCORE: ${formatNumber(game.bestScore)}`
  );
}

/* =========================================================
   23. GAME UPDATE LOOP
   ========================================================= */

function updateGame(dt) {
  if (game.state !== STATES.PLAYING) {
    return;
  }

  game.time += dt * 1000;
  game.distance += dt * (0.4 + game.speed * 1.7);

  updateDifficulty();

  PLAYER.animationTime += dt;
  PLAYER.speed = game.speed;

  PLAYER.invulnerable = Math.max(
    0,
    PLAYER.invulnerable - dt
  );

  PLAYER.hitFlash = Math.max(
    0,
    PLAYER.hitFlash - dt
  );

  PLAYER.shieldTime = Math.max(
    0,
    PLAYER.shieldTime - dt
  );

  PLAYER.nitroTime = Math.max(
    0,
    PLAYER.nitroTime - dt
  );

  PLAYER.multiplierTime = Math.max(
    0,
    PLAYER.multiplierTime - dt
  );

  if (
    PLAYER.shieldTime <= 0 &&
    PLAYER.nitroTime <= 0 &&
    PLAYER.multiplierTime <= 0
  ) {
    game.activePowerup = null;
  }

  if (PLAYER.jumpTime > 0) {
    PLAYER.jumpTime -= dt;

    const progress = 1 - PLAYER.jumpTime / 0.75;
    PLAYER.jumpHeight =
      Math.sin(progress * Math.PI) * 0.12;
  } else {
    PLAYER.jumpHeight = 0;
  }

  const targetSpeed =
    PLAYER.nitroTime > 0
      ? 1
      : 0.45 + game.difficulty * 0.45;

  game.speed = lerp(
    game.speed,
    targetSpeed,
    1 - Math.pow(0.0001, dt)
  );

  if (PLAYER.nitroTime > 0) {
    game.speed = Math.min(1.2, game.speed + 0.18);
  }

  game.roadScroll += dt * (0.25 + game.speed);

  updateRoadMarks(dt);
  updateScenery(dt);

  game.spawnTimer -= dt;
  game.collectibleTimer -= dt;

  const trafficInterval = lerp(
    1.15,
    0.42,
    game.difficulty
  );

  if (game.spawnTimer <= 0) {
    spawnTraffic();
    game.spawnTimer = trafficInterval;
  }

  if (game.collectibleTimer <= 0) {
    spawnCollectible();
    game.collectibleTimer = random(0.55, 1.3);
  }

  updateTraffic(dt);
  updateCollectibles(dt);
  checkTrafficCollisions();

  createSpeedParticles();
  updateParticles(dt);
  updateFloatingTexts(dt);

  if (game.eventMessageTimer > 0) {
    game.eventMessageTimer -= dt;

    if (game.eventMessageTimer <= 0) {
      hideEventMessage();
    }
  }

  game.cameraShake = Math.max(
    0,
    game.cameraShake - dt
  );

  if (game.cameraShake <= 0) {
    game.cameraShakeStrength = 0;
  }

  updateHUD();
}

/* =========================================================
   24. RENDER LOOP
   ========================================================= */

function renderGame() {
  if (!ctx) return;

  ctx.setTransform(
    game.dpr,
    0,
    0,
    game.dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    game.width,
    game.height
  );

  ctx.save();

  if (
    game.cameraShake > 0 &&
    !game.reducedMotion
  ) {
    const shakeX = random(
      -game.cameraShakeStrength,
      game.cameraShakeStrength
    );

    const shakeY = random(
      -game.cameraShakeStrength,
      game.cameraShakeStrength
    );

    ctx.translate(shakeX, shakeY);
  }

  drawBackground();
  drawRoad();
  drawScenery();
  drawCollectibles();
  drawTraffic();
  drawPlayer();
  drawParticles();
  drawFloatingTexts();

  ctx.restore();

  drawSpeedOverlay();
  drawVignette();

  if (PLAYER.hitFlash > 0) {
    drawHitFlash();
  }
}

function drawSpeedOverlay() {
  if (game.speed < 0.7) return;
  if (game.reducedMotion) return;

  const intensity = clamp(
    (game.speed - 0.7) / 0.5,
    0,
    1
  );

  ctx.save();
  ctx.globalAlpha = intensity * 0.3;
  ctx.strokeStyle = "#dceaf2";
  ctx.lineWidth = 1;

  for (let i = 0; i < 12; i += 1) {
    const x = random(0, game.width);
    const y = random(
      game.height * 0.32,
      game.height * 0.94
    );

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + random(-3, 3),
      y + random(12, 35)
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    game.width * 0.5,
    game.height * 0.5,
    game.width * 0.18,
    game.width * 0.5,
    game.height * 0.5,
    game.width * 0.78
  );

  gradient.addColorStop(
    0,
    "rgba(0,0,0,0)"
  );

  gradient.addColorStop(
    1,
    "rgba(0,0,0,0.54)"
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(
    0,
    0,
    game.width,
    game.height
  );
}

function drawHitFlash() {
  ctx.save();
  ctx.globalAlpha = clamp(
    PLAYER.hitFlash * 2,
    0,
    0.55
  );

  ctx.fillStyle = "#ff3042";
  ctx.fillRect(
    0,
    0,
    game.width,
    game.height
  );

  ctx.restore();
}

/* =========================================================
   25. HUD UPDATE
   ========================================================= */

function updateHUD() {
  setText(
    "#hud-score",
    formatNumber(game.score)
  );

  setText(
    "#hud-best",
    formatNumber(game.bestScore)
  );

  setText(
    "#hud-combo-value",
    `x${Math.max(1, game.combo)}`
  );

  setText(
    "#hud-speed-value",
    `${Math.floor(game.speed * 180)}`
  );

  const powerupFill = $("#powerup-fill");

  if (powerupFill) {
    let progress = 0;

    if (PLAYER.shieldTime > 0) {
      progress = PLAYER.shieldTime / 8;
    } else if (PLAYER.nitroTime > 0) {
      progress = PLAYER.nitroTime / 5;
    } else if (PLAYER.multiplierTime > 0) {
      progress = PLAYER.multiplierTime / 7;
    }

    powerupFill.style.width = `${clamp(
      progress * 100,
      0,
      100
    )}%`;
  }

  const powerupLabel = $("#powerup-label");

  if (powerupLabel) {
    if (PLAYER.shieldTime > 0) {
      powerupLabel.textContent = "SHIELD";
    } else if (PLAYER.nitroTime > 0) {
      powerupLabel.textContent = "NITRO";
    } else if (PLAYER.multiplierTime > 0) {
      powerupLabel.textContent = "DOUBLE SCORE";
    } else {
      powerupLabel.textContent = "NO POWERUP";
    }
  }

  const lives = $$(".life-icon");

  lives.forEach((life, index) => {
    life.classList.toggle(
      "lost",
      index >= game.lives
    );
  });
}

/* =========================================================
   26. GAME START, PAUSE, AND END
   ========================================================= */

function startGame() {
  resumeAudio();
  playSound("start");

  resetWorld();

  game.readyCountdown = 3;
  game.readyTimer = 0;

  showScreen(STATES.READY);

  setText("#ready-text", "3");
  setText(
    "#ready-subtext",
    "GET READY TO RIDE"
  );

  window.setTimeout(() => {
    if (game.state === STATES.READY) {
      setText("#ready-text", "2");
    }
  }, 850);

  window.setTimeout(() => {
    if (game.state === STATES.READY) {
      setText("#ready-text", "1");
    }
  }, 1700);

  window.setTimeout(() => {
    if (game.state === STATES.READY) {
      setText("#ready-text", "GO!");
      setText(
        "#ready-subtext",
        "DODGE TRAFFIC • COLLECT REWARDS"
      );
      playSound("start");
    }
  }, 2550);

  window.setTimeout(() => {
    if (game.state === STATES.READY) {
      showScreen(STATES.PLAYING);
    }
  }, 3200);
}

function togglePause() {
  if (game.state === STATES.PLAYING) {
    showScreen(STATES.PAUSED);
    playSound("click");
    return;
  }

  if (game.state === STATES.PAUSED) {
    showScreen(STATES.PLAYING);
    playSound("click");
  }
}

function restartGame() {
  playSound("click");
  startGame();
}

function endGame() {
  if (game.state === STATES.GAME_OVER) return;

  game.state = STATES.GAME_OVER;

  if (game.score > game.bestScore) {
    game.bestScore = game.score;
    game.newBest = true;

    writeStorage(
      STORAGE_KEYS.highScore,
      String(game.bestScore)
    );
  }

  playSound("gameover");
  updateGameOverUI();
  showScreen(STATES.GAME_OVER);
}

function updateGameOverUI() {
  setText(
    "#gameover-score",
    formatNumber(game.score)
  );

  setText(
    "#gameover-best",
    formatNumber(game.bestScore)
  );

  setText(
    "#gameover-distance",
    `${Math.floor(game.distance)}m`
  );

  setText(
    "#gameover-combo",
    `x${game.maxCombo}`
  );

  const newBest = $("#newbest");

  if (newBest) {
    newBest.classList.toggle(
      "hidden",
      !game.newBest
    );
  }

  const nameInput = $("#player-name");

  if (nameInput) {
    nameInput.value = "";
  }

  updateMenuBest();
}

/* =========================================================
   27. EVENT MESSAGES
   ========================================================= */

function showToast(message) {
  const toast = $("#event-toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("visible");

  void toast.offsetWidth;

  toast.classList.add("visible");

  game.eventMessageTimer = 2.1;
}

function hideEventMessage() {
  const toast = $("#event-toast");

  if (toast) {
    toast.classList.remove("visible");
  }
}

/* =========================================================
   28. LEADERBOARD UI
   ========================================================= */

function renderLeaderboard() {
  const list = $("#leaderboard-list");
  const empty = $("#leaderboard-empty");

  if (!list) return;

  const leaderboard = getLeaderboard();

  list.innerHTML = "";

  if (empty) {
    empty.classList.toggle(
      "hidden",
      leaderboard.length > 0
    );
  }

  leaderboard.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const rank = document.createElement("div");
    rank.className = "leaderboard-rank";
    rank.textContent = String(index + 1);

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.className = "leaderboard-name";
    name.textContent = entry.name || "RIDER";

    const date = document.createElement("div");
    date.className = "leaderboard-date";

    date.textContent = entry.date
      ? new Date(entry.date).toLocaleDateString()
      : "LOCAL SCORE";

    info.appendChild(name);
    info.appendChild(date);

    const score = document.createElement("div");
    score.className = "leaderboard-score";
    score.textContent = formatNumber(entry.score);

    row.appendChild(rank);
    row.appendChild(info);
    row.appendChild(score);

    list.appendChild(row);
  });
}

function saveCurrentScore() {
  if (game.gameOverSaved) return;

  const input = $("#player-name");

  const name =
    input && input.value.trim()
      ? input.value.trim()
      : "RIDER";

  saveLeaderboardEntry(name, game.score);

  game.gameOverSaved = true;

  showToast("SCORE SAVED");
  renderLeaderboard();
  playSound("coin");
}

/* =========================================================
   29. SHARE SYSTEM
   ========================================================= */

function buildShareMessage() {
  return [
    "🔥 ABUJA ROADFIRE 🔥",
    "",
    `Score: ${formatNumber(game.score)}`,
    `Distance: ${Math.floor(game.distance)}m`,
    `Best Combo: x${game.maxCombo}`,
    "",
    "Ride • Dodge • Survive",
    "Powered by Davonium Technologies"
  ].join("\n");
}

function openShareScreen() {
  const shareText = $("#share-text");

  if (shareText) {
    shareText.value = buildShareMessage();
  }

  showScreen(STATES.SHARE);
}

async function nativeShare() {
  const message = buildShareMessage();

  if (!navigator.share) {
    showShareStatus("Native sharing is not available.");
    return;
  }

  try {
    await navigator.share({
      title: GAME_NAME,
      text: message
    });

    showShareStatus("Share dialog opened.");
  } catch {
    showShareStatus("Sharing cancelled.");
  }
}

async function copyShareText() {
  const message = buildShareMessage();

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(message);
      showShareStatus("Score copied to clipboard.");
      return;
    }

    const textarea = $("#share-text");

    if (textarea) {
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      showShareStatus("Score copied.");
    }
  } catch {
    showShareStatus(
      "Copy is unavailable on this device."
    );
  }
}

function showShareStatus(message) {
  setText("#share-status", message);
}

/* =========================================================
   30. SETTINGS
   ========================================================= */

function applyReducedMotionPreference() {
  document.body.classList.toggle(
    "reduced-motion",
    game.reducedMotion
  );
}

function syncSettingsUI() {
  const soundToggle = $("#setting-sound");
  const motionToggle = $("#setting-reduced-motion");

  if (soundToggle) {
    soundToggle.setAttribute(
      "aria-checked",
      String(game.soundEnabled)
    );

    soundToggle.classList.toggle(
      "active",
      game.soundEnabled
    );
  }

  if (motionToggle) {
    motionToggle.setAttribute(
      "aria-checked",
      String(game.reducedMotion)
    );

    motionToggle.classList.toggle(
      "active",
      game.reducedMotion
    );
  }
}

function toggleSoundSetting() {
  game.soundEnabled = !game.soundEnabled;
  savePreferences();
  syncSettingsUI();

  if (game.soundEnabled) {
    resumeAudio();
    playSound("click");
  }
}

function toggleMotionSetting() {
  game.reducedMotion = !game.reducedMotion;
  savePreferences();
  applyReducedMotionPreference();
  syncSettingsUI();
}

/* =========================================================
   31. BUTTON EVENT BINDINGS
   ========================================================= */

function bindButton(selector, handler) {
  const element = $(selector);

  if (!element) return;

  element.addEventListener("click", (event) => {
    event.preventDefault();
    resumeAudio();
    handler(event);
  });
}

function bindUI() {
  bindButton("#btn-play", startGame);
  bindButton("#btn-howto", openHowToPlay);
  bindButton("#btn-leaderboard", openLeaderboard);
  bindButton("#btn-settings", openSettings);

  bindButton("#btn-howto-back", openMenu);
  bindButton("#btn-leaderboard-back", openMenu);
  bindButton("#btn-settings-back", openMenu);

  bindButton("#btn-resume", () => {
    showScreen(STATES.PLAYING);
  });

  bindButton("#btn-restart", restartGame);
  bindButton("#btn-pause-menu", openMenu);

  bindButton("#btn-play-again", restartGame);
  bindButton("#btn-gameover-leaderboard", openLeaderboard);
  bindButton("#btn-gameover-menu", openMenu);

  bindButton("#btn-save-score", saveCurrentScore);
  bindButton("#btn-share-score", openShareScreen);

  bindButton("#btn-native-share", nativeShare);
  bindButton("#btn-copy-share", copyShareText);
  bindButton("#btn-share-back", () => {
    showScreen(STATES.GAME_OVER);
  });

  bindButton("#setting-sound", toggleSoundSetting);
  bindButton(
    "#setting-reduced-motion",
    toggleMotionSetting
  );

  bindButton("#btn-reset-scores", () => {
    showElement("#screen-reset-confirm");
  });

  bindButton("#btn-cancel-reset", () => {
    hideElement("#screen-reset-confirm");
  });

  bindButton("#btn-confirm-reset", () => {
    resetScores();
    hideElement("#screen-reset-confirm");
  });

  bindButton("#btn-pause", togglePause);
  bindButton("#btn-sound", toggleSoundSetting);
}

/* =========================================================
   32. AD PLACEHOLDER
   ========================================================= */

// --- DAVONIUM AD PLACEHOLDER ---
// Future AdMob / AdSense integration can be added here.

/* =========================================================
   33. INPUT INITIALIZATION
   ========================================================= */

function bindInputEvents() {
  window.addEventListener(
    "keydown",
    handleKeyboard,
    { passive: false }
  );

  if (canvas) {
    canvas.addEventListener(
      "pointerdown",
      handlePointerDown,
      { passive: true }
    );

    canvas.addEventListener(
      "pointerup",
      handlePointerUp,
      { passive: true }
    );

    canvas.addEventListener(
      "pointercancel",
      handlePointerCancel,
      { passive: true }
    );

    canvas.addEventListener(
      "pointerleave",
      handlePointerCancel,
      { passive: true }
    );
  }

  window.addEventListener(
    "resize",
    resizeCanvas,
    { passive: true }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.hidden &&
        game.state === STATES.PLAYING
      ) {
        showScreen(STATES.PAUSED);
      }
    }
  );
}

/* =========================================================
   34. SPLASH INITIALIZATION
   ========================================================= */

function runSplashSequence() {
  showScreen(STATES.SPLASH);

  const splashText = $("#splash-loading-text");

  const messages = [
    "INITIALIZING ROAD SYSTEM",
    "LOADING TRAFFIC NETWORK",
    "BUILDING ABUJA CITY",
    "CALIBRATING RIDER",
    "SYSTEM READY"
  ];

  let index = 0;

  const interval = window.setInterval(() => {
    if (splashText) {
      splashText.textContent = messages[index];
    }

    index += 1;

    if (index >= messages.length) {
      window.clearInterval(interval);
    }
  }, 500);

  window.setTimeout(() => {
    showScreen(STATES.MENU);
    updateMenuBest();
  }, 3000);
}

/* =========================================================
   35. MAIN ANIMATION LOOP
   ========================================================= */

function animationLoop(timestamp) {
  if (!game.lastFrame) {
    game.lastFrame = timestamp;
  }

  const rawDelta =
    (timestamp - game.lastFrame) / 1000;

  game.lastFrame = timestamp;

  game.delta = clamp(rawDelta, 0, 0.05);

  if (
    game.state === STATES.PLAYING
  ) {
    updateGame(game.delta);
  }

  renderGame();

  requestAnimationFrame(animationLoop);
}

/* =========================================================
   36. INITIALIZATION
   ========================================================= */

function initializeGame() {
  loadPreferences();
  resizeCanvas();
  resetWorld();
  bindUI();
  bindInputEvents();
  syncSettingsUI();
  updateMenuBest();
  updateHUDVisibility();

  if (typeof ctx.roundRect !== "function") {
    /*
      Older browsers may not support roundRect.
      The game still runs because the main gameplay
      does not depend on this method in every browser.
    */
    console.warn(
      "Canvas roundRect is not supported by this browser."
    );
  }

  runSplashSequence();

  requestAnimationFrame(animationLoop);
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeGame,
    { once: true }
  );
} else {
  initializeGame();
}
