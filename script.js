"use strict";

/*
===========================================================
 ABUJA ROADFIRE
 DAVONIUM TECHNOLOGIES
 Canvas Motorcycle Racing Game
===========================================================
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const canvas = $("game-canvas");
  const ctx = canvas.getContext("2d");

  if (!canvas || !ctx) {
    console.error("Canvas could not be initialized.");
    return;
  }

  /*
  =========================================================
  STORAGE
  =========================================================
  */

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

  let gameState = STATES.SPLASH;
  let previousState = STATES.SPLASH;

  const safeRead = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const safeRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable.
    }
  };

  const getBooleanPreference = (key, defaultValue) => {
    const value = safeRead(key);

    if (value === null) {
      return defaultValue;
    }

    return value === "true";
  };

  let soundEnabled = getBooleanPreference(
    STORAGE_KEYS.sound,
    true
  );

  let reducedMotion = getBooleanPreference(
    STORAGE_KEYS.reducedMotion,
    false
  );

  let bestScore = Number(
    safeRead(STORAGE_KEYS.highScore, "0")
  ) || 0;

  /*
  =========================================================
  GAME VARIABLES
  =========================================================
  */

  let width = 0;
  let height = 0;
  let dpr = 1;

  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  let lives = 3;

  let gameTime = 0;
  let totalTime = 0;
  let speed = 0.42;
  let distance = 0;

  let playerLane = 0;
  let targetLane = 0;
  let playerLean = 0;

  let invulnerableTimer = 0;
  let readyTimer = 0;
  let splashTimer = 0;
  let pauseTime = 0;
  let gameOverSaved = false;

  let spawnTimer = 0;
  let collectibleTimer = 0;
  let sceneryTimer = 0;
  let roadScroll = 0;

  let activePowerup = null;
  let powerupTimer = 0;

  let objects = [];
  let particles = [];
  let scenery = [];
  let floatingTexts = [];

  let lastFrame = 0;
  let animationFrame = 0;

  const LANES = [-1, 0, 1];

  const COLORS = {
    skyTop: "#09152d",
    skyBottom: "#e87938",
    road: "#202633",
    roadEdge: "#e7c56d",
    lane: "#f5e8ba",
    city: "#172032",
    forest: "#152e2c",
    grass: "#17382f",
    player: "#ff4b32",
    playerDark: "#8b1e27",
    white: "#ffffff",
    yellow: "#ffd166",
    cyan: "#48e0ff",
    green: "#63e6a5",
    danger: "#ff5364"
  };

  /*
  =========================================================
  DAVONIUM AD PLACEHOLDER
  Future AdMob / AdSense integration can be added here.
  =========================================================
  */

  // --- DAVONIUM AD PLACEHOLDER ---
  // Future AdMob / AdSense integration can be added here.

  /*
  =========================================================
  DOM HELPERS
  =========================================================
  */

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = String(value);
    }
  }

  function setVisible(id, visible) {
    const element = $(id);

    if (!element) {
      return;
    }

    element.hidden = !visible;
    element.classList.toggle("is-hidden", !visible);
  }

  function addClass(id, className) {
    const element = $(id);

    if (element) {
      element.classList.add(className);
    }
  }

  function removeClass(id, className) {
    const element = $(id);

    if (element) {
      element.classList.remove(className);
    }
  }

  function setProgress(id, value) {
    const element = $(id);

    if (!element) {
      return;
    }

    const safeValue = Math.max(0, Math.min(100, value));

    element.style.width = `${safeValue}%`;
    element.style.transform = `scaleX(${safeValue / 100})`;
    element.setAttribute("aria-valuenow", String(Math.round(safeValue)));
  }

  function announce(message) {
    setText("aria-status", message);
    setText("aria-live", message);
  }

  /*
  =========================================================
  CANVAS RESIZING
  =========================================================
  */

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    width = Math.max(320, rect.width || window.innerWidth);
    height = Math.max(480, rect.height || window.innerHeight);

    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /*
  =========================================================
  AUDIO
  =========================================================
  */

  let audioContext = null;

  function getAudioContext() {
    if (!soundEnabled) {
      return null;
    }

    try {
      if (!audioContext) {
        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;

        if (!AudioContextClass) {
          return null;
        }

        audioContext = new AudioContextClass();
      }

      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }

      return audioContext;
    } catch {
      return null;
    }
  }

  function beep(
    frequency = 440,
    duration = 0.08,
    type = "square",
    volume = 0.035
  ) {
    const audio = getAudioContext();

    if (!audio) {
      return;
    }

    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(
        frequency,
        audio.currentTime
      );

      gain.gain.setValueAtTime(
        volume,
        audio.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  }

  function playMoveSound() {
    beep(240, 0.045, "triangle", 0.025);
  }

  function playCollectSound() {
    beep(720, 0.08, "sine", 0.04);
    beep(980, 0.1, "sine", 0.025);
  }

  function playCrashSound() {
    beep(95, 0.24, "sawtooth", 0.055);
  }

  function playStartSound() {
    beep(420, 0.1, "square", 0.03);
    beep(620, 0.12, "square", 0.035);
  }

  /*
  =========================================================
  SCREEN MANAGEMENT
  =========================================================
  */

  const SCREEN_IDS = [
    "screen-splash",
    "screen-menu",
    "screen-ready",
    "screen-pause",
    "screen-howto",
    "screen-leaderboard",
    "screen-settings",
    "screen-confirm",
    "screen-gameover",
    "screen-share"
  ];

  function hideAllScreens() {
    SCREEN_IDS.forEach((id) => setVisible(id, false));
  }

  function showScreen(id) {
    hideAllScreens();

    if (id) {
      setVisible(id, true);
    }
  }

  function updateHUDVisibility() {
    const visible =
      gameState === STATES.PLAYING ||
      gameState === STATES.PAUSED;

    setVisible("hud", visible);
    setVisible("touch-feedback", gameState === STATES.PLAYING);
  }

  function transitionTo(nextState) {
    previousState = gameState;
    gameState = nextState;

    updateHUDVisibility();

    if (nextState === STATES.MENU) {
      showScreen("screen-menu");
      announce("Main menu");
    }

    if (nextState === STATES.HOW_TO_PLAY) {
      showScreen("screen-howto");
      announce("How to play");
    }

    if (nextState === STATES.SETTINGS) {
      showScreen("screen-settings");
      updateSettingsUI();
      announce("Settings");
    }

    if (nextState === STATES.LEADERBOARD) {
      showScreen("screen-leaderboard");
      renderLeaderboard();
      announce("Leaderboard");
    }

    if (nextState === STATES.PAUSED) {
      showScreen("screen-pause");
      announce("Game paused");
    }

    if (nextState === STATES.SHARE) {
      showScreen("screen-share");
      prepareShareScreen();
      announce("Share your score");
    }

    if (nextState === STATES.GAME_OVER) {
      showScreen("screen-gameover");
      updateGameOverScreen();
      announce("Game over");
    }

    if (nextState === STATES.READY) {
      showScreen("screen-ready");
      setText("ready-label", "GET READY");
      setText("ready-text", "3");
      setText("ready-subtext", "Prepare for the road");
      readyTimer = 0;
    }

    if (nextState === STATES.PLAYING) {
      hideAllScreens();
      announce("Race started");
    }
  }

  /*
  =========================================================
  SPLASH SCREEN
  =========================================================
  */

  function updateSplash(delta) {
    splashTimer += delta;

    const duration = 2.1;
    const progress = Math.min(splashTimer / duration, 1);
    const percentage = progress * 100;

    setProgress("splash-bar-fill", percentage);
    setProgress("splash-progress", percentage);

    setText(
      "splash-loading-text",
      progress < 1 ? "INITIALIZING ROAD SYSTEM..." : "READY"
    );

    if (progress >= 1) {
      transitionTo(STATES.MENU);
      updateMenuStats();
    }
  }

  /*
  =========================================================
  MENU
  =========================================================
  */

  function updateMenuStats() {
    setText("menu-best-score", bestScore.toLocaleString());
    setText("menu-version", "V2.0 • DAVONIUM TECHNOLOGIES");
  }

  /*
  =========================================================
  GAME RESET
  =========================================================
  */

  function resetGameVariables() {
    score = 0;
    combo = 0;
    bestCombo = 0;
    lives = 3;

    gameTime = 0;
    distance = 0;
    speed = 0.42;

    playerLane = 0;
    targetLane = 0;
    playerLean = 0;

    invulnerableTimer = 0;
    spawnTimer = 0;
    collectibleTimer = 0;
    sceneryTimer = 0;
    roadScroll = 0;

    activePowerup = null;
    powerupTimer = 0;

    objects = [];
    particles = [];
    scenery = [];
    floatingTexts = [];

    gameOverSaved = false;

    updateHUD();
  }

  function startGame() {
    resetGameVariables();

    transitionTo(STATES.READY);
    beep(320, 0.08, "triangle", 0.025);
  }

  function beginPlaying() {
    transitionTo(STATES.PLAYING);
    playStartSound();
  }

  /*
  =========================================================
  READY COUNTDOWN
  =========================================================
  */

  function updateReady(delta) {
    readyTimer += delta;

    if (readyTimer < 1) {
      setText("ready-text", "3");
      setText("ready-label", "GET READY");
    } else if (readyTimer < 2) {
      setText("ready-text", "2");
      setText("ready-label", "GET READY");
    } else if (readyTimer < 3) {
      setText("ready-text", "1");
      setText("ready-label", "GET READY");
    } else if (readyTimer < 3.65) {
      setText("ready-text", "GO!");
      setText("ready-label", "RIDE!");
      setText("ready-subtext", "Stay on the road");
    } else {
      beginPlaying();
    }
  }

  /*
  =========================================================
  ROAD GEOMETRY
  =========================================================
  */

  function getHorizon() {
    return height * 0.32;
  }

  function getRoadGeometry(depth) {
    const horizon = getHorizon();
    const progress = Math.pow(Math.max(0, depth), 1.55);

    const y = horizon + progress * (height - horizon);
    const farWidth = width * 0.13;
    const nearWidth = width * 0.98;

    const roadWidth =
      farWidth + (nearWidth - farWidth) * progress;

    const center = width / 2;

    return {
      y,
      center,
      roadWidth,
      left: center - roadWidth / 2,
      right: center + roadWidth / 2,
      progress
    };
  }

  function getLaneX(lane, depth) {
    const geometry = getRoadGeometry(depth);

    return geometry.center +
      lane * geometry.roadWidth * 0.28;
  }

  /*
  =========================================================
  BACKGROUND DRAWING
  =========================================================
  */

  function drawBackground() {
    const horizon = getHorizon();

    const gradient = ctx.createLinearGradient(
      0,
      0,
      0,
      height
    );

    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(0.52, "#bf5d42");
    gradient.addColorStop(1, COLORS.skyBottom);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawSun();
    drawDistantMountains(horizon);
    drawCitySilhouette(horizon);
    drawSideGround(horizon);
  }

  function drawSun() {
    const x = width * 0.75;
    const y = height * 0.18;
    const radius = Math.min(width, height) * 0.075;

    const gradient = ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      radius
    );

    gradient.addColorStop(0, "rgba(255,235,163,0.95)");
    gradient.addColorStop(1, "rgba(255,190,80,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDistantMountains(horizon) {
    ctx.save();
    ctx.fillStyle = "#263644";
    ctx.beginPath();
    ctx.moveTo(0, horizon + 30);

    for (let x = 0; x <= width; x += 60) {
      const peak =
        horizon -
        25 -
        Math.sin(x * 0.018) * 28 -
        Math.cos(x * 0.047) * 18;

      ctx.lineTo(x, peak);
    }

    ctx.lineTo(width, horizon + 80);
    ctx.lineTo(0, horizon + 80);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCitySilhouette(horizon) {
    ctx.save();
    ctx.fillStyle = COLORS.city;

    const buildingWidth = Math.max(22, width / 22);

    for (
      let x = 0;
      x < width;
      x += buildingWidth + 7
    ) {
      const buildingHeight =
        20 +
        Math.abs(Math.sin(x * 0.09)) * 70;

      ctx.fillRect(
        x,
        horizon - buildingHeight,
        buildingWidth,
        buildingHeight
      );

      ctx.fillStyle = "rgba(255,210,110,0.25)";

      for (
        let wy = horizon - buildingHeight + 12;
        wy < horizon - 5;
        wy += 15
      ) {
        if (Math.floor(x + wy) % 3 === 0) {
          ctx.fillRect(x + 5, wy, 5, 5);
        }
      }

      ctx.fillStyle = COLORS.city;
    }

    ctx.restore();
  }

  function drawSideGround(horizon) {
    ctx.save();

    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.restore();
  }

  function drawRoad() {
    const horizon = getHorizon();
    const far = getRoadGeometry(0);
    const near = getRoadGeometry(1);

    ctx.save();

    ctx.fillStyle = COLORS.road;
    ctx.beginPath();
    ctx.moveTo(far.left, horizon);
    ctx.lineTo(far.right, horizon);
    ctx.lineTo(near.right, height);
    ctx.lineTo(near.left, height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = COLORS.roadEdge;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(far.left, horizon);
    ctx.lineTo(near.left, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(far.right, horizon);
    ctx.lineTo(near.right, height);
    ctx.stroke();

    drawLaneMarkings();

    ctx.restore();
  }

  function drawLaneMarkings() {
    const lanePositions = [-0.5, 0.5];

    for (const lane of lanePositions) {
      for (let i = 0; i < 18; i++) {
        let depth =
          ((i / 18 + roadScroll) % 1);

        const nextDepth = Math.min(depth + 0.045, 1);

        const start = getRoadGeometry(depth);
        const end = getRoadGeometry(nextDepth);

        const x1 =
          start.center +
          lane * start.roadWidth * 0.55;

        const x2 =
          end.center +
          lane * end.roadWidth * 0.55;

        ctx.strokeStyle = COLORS.lane;
        ctx.lineWidth = Math.max(1, depth * 5);

        ctx.beginPath();
        ctx.moveTo(x1, start.y);
        ctx.lineTo(x2, end.y);
        ctx.stroke();
      }
    }
  }

  /*
  =========================================================
  SCENERY
  =========================================================
  */

  function spawnScenery() {
    const side = Math.random() < 0.5 ? -1 : 1;

    scenery.push({
      type: Math.random() < 0.65 ? "tree" : "sign",
      side,
      depth: 0.02,
      size: 0.6 + Math.random() * 0.7
    });
  }

  function updateScenery(delta) {
    sceneryTimer -= delta;

    if (sceneryTimer <= 0) {
      sceneryTimer = 0.22;
      spawnScenery();
    }

    for (let i = scenery.length - 1; i >= 0; i--) {
      const item = scenery[i];

      item.depth += delta * speed * 0.65;

      if (item.depth > 1.1) {
        scenery.splice(i, 1);
      }
    }
  }

  function drawScenery() {
    for (const item of scenery) {
      const geometry = getRoadGeometry(item.depth);
      const scale = 0.2 + item.depth * item.size;
      const x =
        geometry.center +
        item.side * (geometry.roadWidth * 0.64);

      const y = geometry.y;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      if (item.type === "tree") {
        drawTree();
      } else {
        drawRoadSign();
      }

      ctx.restore();
    }
  }

  function drawTree() {
    ctx.fillStyle = "#4d3025";
    ctx.fillRect(-7, -80, 14, 80);

    ctx.fillStyle = "#1c5140";

    ctx.beginPath();
    ctx.arc(0, -105, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#27684c";

    ctx.beginPath();
    ctx.arc(-20, -82, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(22, -80, 27, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRoadSign() {
    ctx.fillStyle = "#777b82";
    ctx.fillRect(-3, -70, 6, 70);

    ctx.fillStyle = "#ffcc52";
    ctx.fillRect(-27, -100, 54, 32);

    ctx.strokeStyle = "#3a3540";
    ctx.lineWidth = 4;
    ctx.strokeRect(-27, -100, 54, 32);

    ctx.fillStyle = "#342c31";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GO", 0, -79);
  }

  /*
  =========================================================
  TRAFFIC AND COLLECTIBLES
  =========================================================
  */

  function spawnTraffic() {
    const lane = LANES[
      Math.floor(Math.random() * LANES.length)
    ];

    const typeRoll = Math.random();

    let type = "car";

    if (typeRoll > 0.75) {
      type = "bus";
    } else if (typeRoll > 0.55) {
      type = "taxi";
    }

    objects.push({
      type,
      lane,
      depth: 0.01,
      speedFactor: 0.8 + Math.random() * 0.3,
      passed: false,
      hit: false
    });
  }

  function spawnCollectible() {
    const lane = LANES[
      Math.floor(Math.random() * LANES.length)
    ];

    const powerups = ["coin", "shield", "boost", "magnet"];

    const type =
      powerups[Math.floor(Math.random() * powerups.length)];

    objects.push({
      type,
      lane,
      depth: 0.01,
      speedFactor: 0.95,
      passed: false,
      hit: false
    });
  }

  function updateObjects(delta) {
    spawnTimer -= delta;
    collectibleTimer -= delta;

    const difficulty =
      Math.min(gameTime / 80, 1) * 0.15;

    if (spawnTimer <= 0) {
      spawnTimer = Math.max(
        0.5,
        1.05 - difficulty - gameTime * 0.002
      );

      spawnTraffic();
    }

    if (collectibleTimer <= 0) {
      collectibleTimer = 1.7 + Math.random() * 2.4;
      spawnCollectible();
    }

    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];

      object.depth +=
        delta *
        speed *
        object.speedFactor *
        (activePowerup === "boost" ? 1.22 : 1);

      if (
        object.depth > 0.76 &&
        object.depth < 1.02 &&
        !object.hit &&
        Math.abs(object.lane - playerLane) < 0.35
      ) {
        handleObjectCollision(object);
      }

      if (
        object.type === "car" ||
        object.type === "bus" ||
        object.type === "taxi"
      ) {
        if (
          !object.passed &&
          object.depth > 0.92
        ) {
          object.passed = true;

          if (!object.hit) {
            score += 10;
            combo += 1;
            bestCombo = Math.max(bestCombo, combo);

            if (combo > 0 && combo % 5 === 0) {
              score += combo * 5;
              createFloatingText(
                `COMBO x${combo}`,
                width / 2,
                height * 0.4,
                COLORS.yellow
              );
            }
          }
        }
      }

      if (object.depth > 1.2) {
        objects.splice(i, 1);
      }
    }
  }

  function handleObjectCollision(object) {
    object.hit = true;

    const isCollectible =
      object.type === "coin" ||
      object.type === "shield" ||
      object.type === "boost" ||
      object.type === "magnet";

    if (isCollectible) {
      collectPowerup(object.type);
      return;
    }

    if (invulnerableTimer > 0) {
      return;
    }

    if (activePowerup === "shield") {
      activePowerup = null;
      powerupTimer = 0;
      invulnerableTimer = 1.2;

      createExplosion(
        getLaneX(playerLane, 1),
        height * 0.83,
        COLORS.cyan
      );

      beep(860, 0.1, "sine", 0.04);
      return;
    }

    lives -= 1;
    combo = 0;
    invulnerableTimer = 1.6;

    createExplosion(
      getLaneX(playerLane, 1),
      height * 0.83,
      COLORS.danger
    );

    flashImpact();
    playCrashSound();
    updateHUD();

    if (lives <= 0) {
      finishGame();
    }
  }

  function collectPowerup(type) {
    if (type === "coin") {
      score += 100;
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);

      createFloatingText(
        "+100",
        width / 2,
        height * 0.4,
        COLORS.yellow
      );
    }

    if (type === "shield") {
      activePowerup = "shield";
      powerupTimer = 8;
    }

    if (type === "boost") {
      activePowerup = "boost";
      powerupTimer = 5;
      score += 50;
    }

    if (type === "magnet") {
      activePowerup = "magnet";
      powerupTimer = 7;
      score += 50;
    }

    createExplosion(
      getLaneX(playerLane, 0.92),
      height * 0.76,
      COLORS.yellow
    );

    playCollectSound();
    updateHUD();
  }

  /*
  =========================================================
  OBJECT RENDERING
  =========================================================
  */

  function drawObjects() {
    const sortedObjects = [...objects].sort(
      (a, b) => a.depth - b.depth
    );

    for (const object of sortedObjects) {
      const geometry = getRoadGeometry(object.depth);
      const x = getLaneX(object.lane, object.depth);
      const y = geometry.y;

      const scale = 0.15 + object.depth * 0.95;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      if (object.type === "coin") {
        drawCoin();
      } else if (object.type === "shield") {
        drawPowerup("S");
      } else if (object.type === "boost") {
        drawPowerup("B");
      } else if (object.type === "magnet") {
        drawPowerup("M");
      } else {
        drawVehicle(object.type);
      }

      ctx.restore();
    }
  }

  function drawVehicle(type) {
    let bodyColor = "#d83b35";

    if (type === "taxi") {
      bodyColor = "#e8bb38";
    }

    if (type === "bus") {
      bodyColor = "#3988b8";
    }

    ctx.fillStyle = "#121923";
    ctx.fillRect(-34, -62, 68, 64);

    ctx.fillStyle = bodyColor;

    if (type === "bus") {
      ctx.fillRect(-39, -82, 78, 82);
    } else {
      ctx.beginPath();
      ctx.roundRect(-32, -67, 64, 67, 10);
      ctx.fill();
    }

    ctx.fillStyle = "#8bc4d1";
    ctx.fillRect(-23, -54, 46, 20);

    ctx.fillStyle = "#202c3b";
    ctx.fillRect(-27, -16, 12, 21);
    ctx.fillRect(15, -16, 12, 21);

    ctx.fillStyle = "#ffdf82";
    ctx.fillRect(-24, -63, 12, 7);
    ctx.fillRect(12, -63, 12, 7);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-24, -5, 12, 6);
    ctx.fillRect(12, -5, 12, 6);
  }

  function drawCoin() {
    ctx.fillStyle = "#ffcf46";
    ctx.beginPath();
    ctx.arc(0, -30, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff1a4";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#8c5a1d";
    ctx.font = "bold 23px Arial";
    ctx.textAlign = "center";
    ctx.fillText("$", 0, -22);
  }

  function drawPowerup(letter) {
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(0, -30, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#e1ffff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#123147";
    ctx.font = "bold 27px Arial";
    ctx.textAlign = "center";
    ctx.fillText(letter, 0, -21);
  }

  /*
  =========================================================
  PLAYER MOTORCYCLE
  =========================================================
  */

  function updatePlayer(delta) {
    const difference = targetLane - playerLane;

    playerLane += difference * Math.min(1, delta * 10);

    const desiredLean = difference * 0.45;

    playerLean +=
      (desiredLean - playerLean) *
      Math.min(1, delta * 9);

    if (invulnerableTimer > 0) {
      invulnerableTimer -= delta;
    }
  }

  function drawPlayer() {
    const x = getLaneX(playerLane, 1);
    const y = height * 0.83;

    if (
      invulnerableTimer > 0 &&
      Math.floor(invulnerableTimer * 12) % 2 === 0
    ) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(playerLean);

    const scale = Math.min(width / 480, 1.2);
    ctx.scale(scale, scale);

    drawMotorcycle();

    ctx.restore();
  }

  function drawMotorcycle() {
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 13, 47, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rear wheel.
    ctx.fillStyle = "#090d14";
    ctx.beginPath();
    ctx.ellipse(0, -5, 13, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#76818f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -5, 7, 25, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Motorcycle body.
    ctx.fillStyle = COLORS.playerDark;
    ctx.beginPath();
    ctx.moveTo(-24, -20);
    ctx.lineTo(-17, -57);
    ctx.lineTo(17, -57);
    ctx.lineTo(27, -20);
    ctx.lineTo(14, 3);
    ctx.lineTo(-14, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(-17, -51);
    ctx.lineTo(0, -70);
    ctx.lineTo(18, -51);
    ctx.lineTo(22, -20);
    ctx.lineTo(-22, -20);
    ctx.closePath();
    ctx.fill();

    // Front wheel.
    ctx.fillStyle = "#080c13";
    ctx.beginPath();
    ctx.ellipse(0, -91, 11, 27, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#778392";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -91, 6, 19, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Rider body.
    ctx.fillStyle = "#1a2535";
    ctx.beginPath();
    ctx.moveTo(-19, -65);
    ctx.lineTo(-30, -105);
    ctx.lineTo(-12, -125);
    ctx.lineTo(12, -125);
    ctx.lineTo(30, -105);
    ctx.lineTo(19, -65);
    ctx.closePath();
    ctx.fill();

    // Helmet.
    ctx.fillStyle = "#26384e";
    ctx.beginPath();
    ctx.arc(0, -139, 21, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#80eaff";
    ctx.beginPath();
    ctx.arc(6, -140, 12, -0.9, 0.6);
    ctx.lineTo(5, -132);
    ctx.closePath();
    ctx.fill();

    // Arms.
    ctx.strokeStyle = "#d2a17e";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(-17, -104);
    ctx.lineTo(-35, -83);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(17, -104);
    ctx.lineTo(35, -83);
    ctx.stroke();

    // Headlight.
    ctx.fillStyle = "#fff4b5";
    ctx.beginPath();
    ctx.arc(0, -73, 7, 0, Math.PI * 2);
    ctx.fill();

    // Exhaust glow.
    ctx.fillStyle = "rgba(255,145,52,0.85)";
    ctx.beginPath();
    ctx.ellipse(23, -7, 5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /*
  =========================================================
  PARTICLES AND EFFECTS
  =========================================================
  */

  function createExplosion(x, y, color) {
    const amount = reducedMotion ? 8 : 22;

    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 30 + Math.random() * 130;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        life: 0.45 + Math.random() * 0.55,
        maxLife: 1,
        size: 2 + Math.random() * 5,
        color
      });
    }
  }

  function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];

      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 80 * delta;

      if (particle.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.save();

      ctx.globalAlpha = Math.max(
        0,
        particle.life / particle.maxLife
      );

      ctx.fillStyle = particle.color;

      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }
  }

  function createFloatingText(text, x, y, color) {
    floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 1.1
    });
  }

  function updateFloatingTexts(delta) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const item = floatingTexts[i];

      item.life -= delta;
      item.y -= 35 * delta;

      if (item.life <= 0) {
        floatingTexts.splice(i, 1);
      }
    }
  }

  function drawFloatingTexts() {
    for (const item of floatingTexts) {
      ctx.save();

      ctx.globalAlpha = Math.max(0, item.life);
      ctx.fillStyle = item.color;
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText(item.text, item.x, item.y);

      ctx.restore();
    }
  }

  function flashImpact() {
    const flash = $("impact-flash");

    if (!flash) {
      return;
    }

    flash.classList.remove("active");

    // Force a browser style recalculation.
    void flash.offsetWidth;

    flash.classList.add("active");

    window.setTimeout(() => {
      flash.classList.remove("active");
    }, 180);
  }

  /*
  =========================================================
  POWERUPS
  =========================================================
  */

  function updatePowerup(delta) {
    if (!activePowerup) {
      return;
    }

    powerupTimer -= delta;

    if (powerupTimer <= 0) {
      activePowerup = null;
      powerupTimer = 0;
    }

    updateHUD();
  }

  /*
  =========================================================
  HUD
  =========================================================
  */

  function updateHUD() {
    setText("hud-score", Math.floor(score).toLocaleString());
    setText("hud-best", Math.floor(bestScore).toLocaleString());
    setText("hud-combo-value", `x${combo}`);
    setText("hud-speed-value", `${Math.round(speed * 100)} km/h`);

    const powerupVisible = Boolean(activePowerup);

    setVisible("hud-powerup", powerupVisible);

    if (powerupVisible) {
      setText(
        "hud-powerup-name",
        activePowerup.toUpperCase()
      );

      setProgress(
        "hud-powerup-fill",
        (powerupTimer / 8) * 100
      );
    }

    for (let i = 1; i <= 3; i++) {
      const life = $(`life-${i}`);

      if (life) {
        life.classList.toggle("empty", i > lives);
        life.setAttribute(
          "aria-hidden",
          i > lives ? "true" : "false"
        );
      }
    }

    const soundIcon = $("hud-sound-icon");

    if (soundIcon) {
      soundIcon.textContent = soundEnabled ? "🔊" : "🔇";
    }
  }

  /*
  =========================================================
  GAME LOOP UPDATES
  =========================================================
  */

  function updatePlaying(delta) {
    gameTime += delta;
    totalTime += delta;

    distance += speed * delta;
    roadScroll = (roadScroll + delta * speed * 1.8) % 1;

    speed = Math.min(
      1.05,
      0.42 + gameTime * 0.006
    );

    if (activePowerup === "boost") {
      speed = Math.min(1.25, speed * 1.25);
    }

    score += delta * speed * 12;

    updatePlayer(delta);
    updateObjects(delta);
    updateScenery(delta);
    updatePowerup(delta);
    updateParticles(delta);
    updateFloatingTexts(delta);

    updateHUD();
  }

  function updatePaused(delta) {
    pauseTime += delta;
  }

  /*
  =========================================================
  MAIN DRAW
  =========================================================
  */

  function renderGame() {
    ctx.clearRect(0, 0, width, height);

    drawBackground();
    drawRoad();
    drawScenery();
    drawObjects();

    if (
      gameState === STATES.PLAYING ||
      gameState === STATES.PAUSED ||
      gameState === STATES.GAME_OVER
    ) {
      drawPlayer();
    }

    drawParticles();
    drawFloatingTexts();

    if (gameState === STATES.PAUSED) {
      drawPauseOverlay();
    }
  }

  function drawPauseOverlay() {
    ctx.save();

    ctx.fillStyle = "rgba(5,10,20,0.35)";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", width / 2, height * 0.48);

    ctx.restore();
  }

  /*
  =========================================================
  GAME OVER
  =========================================================
  */

  function finishGame() {
    if (gameState === STATES.GAME_OVER) {
      return;
    }

    const finalScore = Math.floor(score);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      safeWrite(
        STORAGE_KEYS.highScore,
        String(bestScore)
      );
    }

    transitionTo(STATES.GAME_OVER);
  }

  function updateGameOverScreen() {
    const finalScore = Math.floor(score);
    const isNewBest = finalScore >= bestScore && finalScore > 0;

    setVisible("gameover-newbest", isNewBest);

    setText(
      "gameover-score",
      finalScore.toLocaleString()
    );

    setText(
      "gameover-best",
      Math.floor(bestScore).toLocaleString()
    );

    setText(
      "gameover-time",
      `${Math.floor(gameTime)}s`
    );

    setText(
      "gameover-combo",
      `x${bestCombo}`
    );

    const playerName = $("player-name");

    if (playerName) {
      playerName.value = "";
    }
  }

  /*
  =========================================================
  LEADERBOARD
  =========================================================
  */

  function getLeaderboard() {
    try {
      const stored = safeRead(
        STORAGE_KEYS.leaderboard,
        "[]"
      );

      const parsed = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          name: String(item.name || "RIDER"),
          score: Number(item.score) || 0,
          date: String(item.date || "")
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  function saveLeaderboard(entries) {
    safeWrite(
      STORAGE_KEYS.leaderboard,
      JSON.stringify(entries)
    );
  }

  function renderLeaderboard() {
    const list = $("leaderboard-list");

    if (!list) {
      return;
    }

    list.replaceChildren();

    const leaderboard = getLeaderboard();

    if (leaderboard.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No scores yet. Become the first rider!";
      list.appendChild(empty);
      return;
    }

    leaderboard.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";

      const rank = document.createElement("span");
      rank.textContent = `#${index + 1}`;

      const name = document.createElement("span");
      name.textContent = entry.name;

      const points = document.createElement("strong");
      points.textContent = entry.score.toLocaleString();

      row.append(rank, name, points);
      list.appendChild(row);
    });
  }

  function saveCurrentScore() {
    if (gameOverSaved) {
      return;
    }

    const nameInput = $("player-name");

    let name = nameInput
      ? nameInput.value.trim()
      : "";

    if (!name) {
      name = "RIDER";
    }

    name = name.slice(0, 20);

    const entries = getLeaderboard();

    entries.push({
      name,
      score: Math.floor(score),
      date: new Date().toISOString()
    });

    saveLeaderboard(
      entries
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    );

    gameOverSaved = true;

    announce("Score saved");
    beep(660, 0.08, "sine", 0.03);
  }

  /*
  =========================================================
  SHARE
  =========================================================
  */

  function getShareMessage() {
    return [
      "🏍️ ABUJA ROADFIRE",
      "Powered by DAVONIUM TECHNOLOGIES",
      "",
      `My score: ${Math.floor(score).toLocaleString()}`,
      `Best combo: x${bestCombo}`,
      "",
      "Can you beat my score?",
      "#AbujaRoadfire #DavoniumTechnologies"
    ].join("\n");
  }

  function prepareShareScreen() {
    const message = getShareMessage();

    const shareText = $("share-text");

    if (shareText) {
      shareText.value = message;
    }

    setText("share-status", "");
  }

  async function copyShareMessage() {
    const message = getShareMessage();

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        setText("share-status", "Copied to clipboard!");
        return;
      }
    } catch {
      // Use fallback below.
    }

    const textArea = $("share-text");

    if (textArea) {
      textArea.focus();
      textArea.select();

      try {
        document.execCommand("copy");
        setText("share-status", "Copied!");
      } catch {
        setText(
          "share-status",
          "Select the text and copy it manually."
        );
      }
    }
  }

  async function nativeShare() {
    const message = getShareMessage();

    if (!navigator.share) {
      setText(
        "share-status",
        "Native sharing is not supported. Use Copy."
      );
      return;
    }

    try {
      await navigator.share({
        title: "ABUJA ROADFIRE",
        text: message
      });

      setText("share-status", "Share completed.");
    } catch (error) {
      if (error && error.name !== "AbortError") {
        setText("share-status", "Sharing was cancelled.");
      }
    }
  }

  /*
  =========================================================
  SETTINGS
  =========================================================
  */

  function updateSettingsUI() {
    const soundSetting = $("setting-sound");
    const motionSetting = $("setting-reduced-motion");

    if (soundSetting) {
      soundSetting.checked = soundEnabled;
      soundSetting.setAttribute(
        "aria-checked",
        String(soundEnabled)
      );
    }

    if (motionSetting) {
      motionSetting.checked = reducedMotion;
      motionSetting.setAttribute(
        "aria-checked",
        String(reducedMotion)
      );
    }
  }

  function toggleSound(value) {
    soundEnabled = Boolean(value);

    safeWrite(
      STORAGE_KEYS.sound,
      String(soundEnabled)
    );

    updateSettingsUI();

    if (soundEnabled) {
      beep(600, 0.08, "sine", 0.03);
    }
  }

  function toggleReducedMotion(value) {
    reducedMotion = Boolean(value);

    safeWrite(
      STORAGE_KEYS.reducedMotion,
      String(reducedMotion)
    );

    updateSettingsUI();
  }

  function resetScores() {
    safeRemove(STORAGE_KEYS.highScore);
    safeRemove(STORAGE_KEYS.leaderboard);

    bestScore = 0;

    updateMenuStats();
    updateHUD();
    renderLeaderboard();

    transitionTo(STATES.MENU);
    announce("Scores reset");
  }

  /*
  =========================================================
  PAUSE AND RESUME
  =========================================================
  */

  function pauseGame() {
    if (gameState !== STATES.PLAYING) {
      return;
    }

    transitionTo(STATES.PAUSED);
  }

  function resumeGame() {
    if (gameState !== STATES.PAUSED) {
      return;
    }

    transitionTo(STATES.PLAYING);
  }

  /*
  =========================================================
  PLAYER CONTROLS
  =========================================================
  */

  function movePlayer(direction) {
    if (gameState !== STATES.PLAYING) {
      return;
    }

    const nextLane = Math.max(
      -1,
      Math.min(1, targetLane + direction)
    );

    if (nextLane !== targetLane) {
      targetLane = nextLane;
      playMoveSound();
    }
  }

  function movePlayerToLane(lane) {
    if (gameState !== STATES.PLAYING) {
      return;
    }

    targetLane = Math.max(-1, Math.min(1, lane));
    playMoveSound();
  }

  /*
  =========================================================
  KEYBOARD CONTROLS
  =========================================================
  */

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (
      key === "arrowleft" ||
      key === "a"
    ) {
      event.preventDefault();
      movePlayer(-1);
    }

    if (
      key === "arrowright" ||
      key === "d"
    ) {
      event.preventDefault();
      movePlayer(1);
    }

    if (
      key === "p" ||
      key === "escape"
    ) {
      event.preventDefault();

      if (gameState === STATES.PLAYING) {
        pauseGame();
      } else if (gameState === STATES.PAUSED) {
        resumeGame();
      }
    }

    if (
      key === " " &&
      gameState === STATES.PLAYING
    ) {
      event.preventDefault();

      if (activePowerup === "boost") {
        powerupTimer = Math.min(8, powerupTimer + 1);
      }
    }
  });

  /*
  =========================================================
  MOBILE SWIPE CONTROLS
  =========================================================
  */

  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    touchStartX = event.clientX;
    touchStartY = event.clientY;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (gameState !== STATES.PLAYING) {
      return;
    }

    const deltaX = event.clientX - touchStartX;
    const deltaY = event.clientY - touchStartY;

    const minimumSwipe = 35;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) >= minimumSwipe) {
        movePlayer(deltaX > 0 ? 1 : -1);
      }
    } else if (deltaY < -minimumSwipe) {
      if (activePowerup === "boost") {
        powerupTimer = Math.min(8, powerupTimer + 1);
      }
    }
  });

  /*
  =========================================================
  BUTTON EVENT HELPERS
  =========================================================
  */

  function listen(id, eventName, callback) {
    const element = $(id);

    if (element) {
      element.addEventListener(eventName, callback);
    }
  }

  /*
  =========================================================
  BUTTON EVENTS
  =========================================================
  */

  listen("btn-play", "click", () => {
    startGame();
  });

  listen("btn-howto", "click", () => {
    transitionTo(STATES.HOW_TO_PLAY);
  });

  listen("btn-howto-back", "click", () => {
    transitionTo(STATES.MENU);
  });

  listen("btn-leaderboard", "click", () => {
    transitionTo(STATES.LEADERBOARD);
  });

  listen("btn-settings", "click", () => {
    transitionTo(STATES.SETTINGS);
  });

  listen("btn-settings-back", "click", () => {
    transitionTo(STATES.MENU);
  });

  listen("btn-pause", "click", () => {
    pauseGame();
  });

  listen("btn-resume", "click", () => {
    resumeGame();
  });

  listen("btn-restart", "click", () => {
    startGame();
  });

  listen("btn-pause-menu", "click", () => {
    transitionTo(STATES.MENU);
    updateMenuStats();
  });

  listen("btn-hud-sound", "click", () => {
    toggleSound(!soundEnabled);
  });

  listen("setting-sound", "change", (event) => {
    toggleSound(event.target.checked);
  });

  listen("setting-reduced-motion", "change", (event) => {
    toggleReducedMotion(event.target.checked);
  });

  listen("btn-reset-scores", "click", () => {
    transitionTo(STATES.MENU);
    resetScores();
  });

  listen("btn-confirm-reset", "click", () => {
    resetScores();
  });

  listen("btn-cancel-reset", "click", () => {
    transitionTo(STATES.SETTINGS);
  });

  listen("btn-save-score", "click", () => {
    saveCurrentScore();
  });

  listen("btn-play-again", "click", () => {
    startGame();
  });

  listen("btn-gameover-leaderboard", "click", () => {
    saveCurrentScore();
    transitionTo(STATES.LEADERBOARD);
  });

  listen("btn-share-score", "click", () => {
    transitionTo(STATES.SHARE);
  });

  listen("btn-gameover-menu", "click", () => {
    transitionTo(STATES.MENU);
    updateMenuStats();
  });

  listen("btn-native-share", "click", () => {
    nativeShare();
  });

  listen("btn-copy-share", "click", () => {
    copyShareMessage();
  });

  listen("btn-share-back", "click", () => {
    transitionTo(STATES.GAME_OVER);
  });

  /*
  =========================================================
  ANIMATION LOOP
  =========================================================
  */

  function update(delta) {
    if (gameState === STATES.SPLASH) {
      updateSplash(delta);
    }

    if (gameState === STATES.READY) {
      updateReady(delta);
    }

    if (gameState === STATES.PLAYING) {
      updatePlaying(delta);
    }

    if (gameState === STATES.PAUSED) {
      updatePaused(delta);
    }

    if (gameState !== STATES.PLAYING) {
      updateParticles(delta);
      updateFloatingTexts(delta);
    }
  }

  function frame(timestamp) {
    if (!lastFrame) {
      lastFrame = timestamp;
    }

    let delta = (timestamp - lastFrame) / 1000;
    lastFrame = timestamp;

    // Prevent large updates after the browser tab is inactive.
    delta = Math.min(delta, 0.05);

    update(delta);
    renderGame();

    animationFrame = window.requestAnimationFrame(frame);
  }

  /*
  =========================================================
  INITIALIZATION
  =========================================================
  */

  function initialize() {
    resizeCanvas();
    updateMenuStats();
    updateSettingsUI();
    updateHUD();

    transitionTo(STATES.SPLASH);

    // No external assets or network requests are needed.
    animationFrame = window.requestAnimationFrame(frame);
  }

  initialize();

  /*
  =========================================================
  CLEANUP
  =========================================================
  */

  window.addEventListener("beforeunload", () => {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
  });
})();
