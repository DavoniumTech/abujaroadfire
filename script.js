/* =========================================================
   ABUJA ROADFIRE — Davonium Technologies
   Original pseudo-3D endless-rider. Pure vanilla JS + Canvas.
   Major architecture: world/camera separation, joint-based
   procedural human animation, layered parallax environment.
   ========================================================= */

(function () {
  "use strict";

  /* =========================== CONFIG =========================== */

  const CONFIG = {
    LANES: [-1, 0, 1],
    LANE_LERP: 10,
    BASE_SPEED: 0.34,
    MAX_SPEED: 1.05,
    SPEED_RAMP: 0.015,
    DIFFICULTY_TICK: 18,
    SPAWN_BASE: 1.05,
    SPAWN_MIN: 0.46,
    LIVES: 3,
    INVINCIBLE_TIME: 1.6,
    JUMP_TIME: 0.62,
    JUMP_HEIGHT: 62,
    LAND_TIME: 0.28,
    TURN_TIME: 0.4,
    CRASH_TIME: 0.7,
    SCORE_PER_SEC: 10,
    FUEL_SCORE: 50,
    BONUS_SCORE: 100,
    COMBO_STEP: 8,
    COMBO_MAX: 5,
    POWERUP_TIME: 7,
    DAY_CYCLE: 95,
    TRAFFIC_LANE_CHANGE_CHANCE: 0.16, // per second, while eligible
    LB_KEY: "localLeaderboard",
    HS_KEY: "divoniumHighScore",
    SOUND_KEY: "soundPreference",
    MOTION_KEY: "reducedMotionPreference",
  };

  const STATE = {
    SPLASH: "SPLASH", MENU: "MENU", READY: "READY", PLAYING: "PLAYING", PAUSED: "PAUSED",
    GAME_OVER: "GAME_OVER", SETTINGS: "SETTINGS", LEADERBOARD: "LEADERBOARD",
    HOWTO: "HOWTO",
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

  /* =========================== CANVAS =========================== */

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let horizonY = 0, groundY = 0, roadCenterX = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizonY = H * 0.33;
    groundY = H * 0.94;
    roadCenterX = W / 2;
  }
  window.addEventListener("resize", resize);
  resize();

  /* =========================== STORAGE =========================== */

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* unavailable */ }
    },
  };

  let soundOn = storage.get(CONFIG.SOUND_KEY, true);
  let reducedMotion = storage.get(CONFIG.MOTION_KEY, false);
  let highScore = storage.get(CONFIG.HS_KEY, 0);
  let leaderboard = storage.get(CONFIG.LB_KEY, []);

  function sanitizeName(raw) {
    if (typeof raw !== "string") return "PLAYER";
    const cleaned = raw.replace(/[^a-zA-Z0-9 _\-]/g, "").trim().slice(0, 12);
    return cleaned.length ? cleaned.toUpperCase() : "PLAYER";
  }

  /* =========================== AUDIO =========================== */

  const audio = {
    ctx: null,
    ensure() {
      if (!soundOn) return null;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
        return this.ctx;
      } catch (e) { return null; }
    },
    tone(freq, dur, type, gain, glideTo) {
      const ac = this.ensure();
      if (!ac) return;
      try {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, ac.currentTime);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ac.currentTime + dur);
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(gain || 0.2, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        osc.connect(g).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + dur + 0.05);
      } catch (e) { /* ignore */ }
    },
    chord(freqs, dur, type, gain) { freqs.forEach((f) => this.tone(f, dur, type, gain)); },
    button() { this.tone(520, 0.08, "square", 0.12); },
    countdown() { this.tone(700, 0.1, "square", 0.15); },
    go() { this.chord([600, 900], 0.2, "square", 0.16); },
    pickup() { this.tone(760, 0.12, "triangle", 0.18, 1200); },
    bonus() { this.tone(880, 0.16, "triangle", 0.2, 1500); },
    crash() { this.tone(120, 0.35, "sawtooth", 0.25, 40); },
    combo() { this.tone(1000, 0.1, "square", 0.14, 1400); },
    boost() { this.tone(200, 0.4, "sawtooth", 0.2, 700); },
    shield() { this.tone(600, 0.25, "sine", 0.18, 900); },
    jump() { this.tone(400, 0.12, "sine", 0.15, 650); },
    land() { this.tone(180, 0.1, "sine", 0.15, 90); },
    gameover() { this.tone(300, 0.5, "sawtooth", 0.2, 80); },
  };

  /* =========================== DOM refs =========================== */

  const el = (id) => document.getElementById(id);
  const screens = {
    splash: el("screen-splash"),
    menu: el("screen-menu"), ready: el("screen-ready"), pause: el("screen-pause"),
    gameover: el("screen-gameover"), howto: el("screen-howto"),
    leaderboard: el("screen-leaderboard"), settings: el("screen-settings"),
    confirm: el("screen-confirm"), share: el("screen-share"),
  };
  const hud = el("hud");

  function showOnly(names) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle("hidden", !names.includes(k)));
  }

  /* =========================== WORLD (persistent ambient) ===========================
     The world/environment clock runs independently of a single run so the main
     menu shows a genuinely live, animated scene rather than a static screenshot. */

  const world = {
    time: Math.random() * 10,
    dayTimer: Math.random() * 30,
    raining: false,
    weatherTimer: 20 + Math.random() * 20,
    rainTimer: 0,
    rain: [],
    ambientTraffic: [],
    ambientSpawnTimer: 1,
  };

  function updateWorld(dt) {
    world.time += dt;
    world.dayTimer += dt;

    world.weatherTimer -= dt;
    if (world.weatherTimer <= 0) {
      world.raining = !world.raining;
      world.weatherTimer = world.raining ? 8 + Math.random() * 6 : 16 + Math.random() * 14;
    }
    if (world.raining && !reducedMotion) {
      world.rainTimer -= dt;
      if (world.rainTimer <= 0) {
        world.rainTimer = 0.012;
        world.rain.push({ x: Math.random() * W, y: -10, speed: 700 + Math.random() * 300 });
      }
    }
    world.rain.forEach((r) => { r.y += r.speed * dt; });
    if (world.rain.length > 220) world.rain.splice(0, world.rain.length - 220);
    world.rain = world.rain.filter((r) => r.y < H + 20);

    // lightweight ambient traffic used only for the main menu backdrop
    if (appState === STATE.MENU) {
      world.ambientSpawnTimer -= dt;
      if (world.ambientSpawnTimer <= 0) {
        world.ambientSpawnTimer = 0.9 + Math.random() * 0.8;
        const kinds = ["car", "suv", "bus", "moto"];
        world.ambientTraffic.push({
          lane: CONFIG.LANES[Math.floor(Math.random() * 3)],
          p: 0.02,
          kind: kinds[Math.floor(Math.random() * kinds.length)],
          speedMul: 0.85 + Math.random() * 0.3,
        });
      }
      world.ambientTraffic.forEach((t) => { t.p += CONFIG.BASE_SPEED * dt * t.speedMul; });
      world.ambientTraffic = world.ambientTraffic.filter((t) => t.p < 1.2);
    }
  }

  function dayPhase(dayTimer) {
    const t = dayTimer % CONFIG.DAY_CYCLE;
    const f = t / CONFIG.DAY_CYCLE;
    if (f < 0.55) return { phase: "day", mix: f / 0.55 };
    if (f < 0.75) return { phase: "sunset", mix: (f - 0.55) / 0.2 };
    return { phase: "night", mix: (f - 0.75) / 0.25 };
  }
  function isNight() { return dayPhase(world.dayTimer).phase === "night" && dayPhase(world.dayTimer).mix > 0.15; }

  /* =========================== GAME STATE (per run) =========================== */

  let game = null;
  let appState = STATE.SPLASH;
  let lastTime = 0;
  let readyTimer = 0;
  let splashTimer = 0;
  let pendingConfirm = null;
  let activeLeaderboardEntry = null;

  const SPLASH_MIN_TIME = 2.6; // guaranteed minimum so the branding is actually seen
  const SPLASH_MESSAGES = ["LOADING WORLD…", "FUELING UP…", "IGNITING ENGINE…", "READY TO RIDE"];

  function spawnSplashParticles() {
    const host = el("splash-particles");
    if (!host) return;
    const count = reducedMotion ? 0 : 22;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      const left = Math.random() * 100;
      const dur = 4 + Math.random() * 5;
      const delay = Math.random() * 6;
      const drift = (Math.random() - 0.5) * 60;
      s.style.left = left + "%";
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = delay + "s";
      s.style.setProperty("--drift", drift + "px");
      s.style.opacity = (0.3 + Math.random() * 0.5).toFixed(2);
      host.appendChild(s);
    }
  }

  function startSplash() {
    appState = STATE.SPLASH;
    splashTimer = 0;
    screens.splash.classList.remove("splash-out", "hidden");
    spawnSplashParticles();
    showOnly(["splash"]);
  }

  function finishSplash() {
    screens.splash.classList.add("splash-out");
    setTimeout(() => { screens.splash.classList.add("hidden"); }, 700);
    goMenu();
  }

  function freshGame() {
    return {
      time: 0,
      score: 0,
      speed: CONFIG.BASE_SPEED,
      lives: CONFIG.LIVES,
      combo: 1,
      comboProgress: 0,
      comboMax: 1,
      difficultyTimer: 0,
      spawnTimer: 0.6,
      spawnInterval: CONFIG.SPAWN_BASE,
      shake: 0,
      camera: { zoom: 1, tilt: 0, bobY: 0 },
      player: {
        lane: 0, prevLane: 0, _x: undefined,
        jumping: false, jumpT: 0,
        landTimer: 0, turnTimer: 0, turnDir: 0,
        crashTimer: 0, gameOverT: 0,
        crashFlash: 0, invincible: 0,
        anim: "RIDING", animT: 0,
        magnet: 0, boost: 0, shield: false,
        activePowerName: null, powerTimeLeft: 0,
      },
      traffic: [],
      obstacles: [],
      collectibles: [],
      powerups: [],
      particles: [],
    };
  }

  /* =========================== INPUT =========================== */

  let touchStart = null;
  const SWIPE_MIN = 26;

  canvas.addEventListener("pointerdown", (e) => {
    touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const dt = performance.now() - touchStart.t;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) moveLane(1); else moveLane(-1);
    } else if (dy < -SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
      doJump();
    } else if (dt < 220) {
      doJump();
    }
    touchStart = null;
  });
  canvas.addEventListener("pointercancel", () => { touchStart = null; });

  window.addEventListener("keydown", (e) => {
    if (document.activeElement && document.activeElement.id === "player-name-input") return;
    if (["ArrowLeft", "a", "A"].includes(e.key)) moveLane(-1);
    else if (["ArrowRight", "d", "D"].includes(e.key)) moveLane(1);
    else if (["ArrowUp", " ", "Spacebar"].includes(e.key)) doJump();
    else if (["p", "P", "Escape"].includes(e.key)) togglePauseKey();
  });

  function moveLane(dir) {
    if (appState !== STATE.PLAYING || !game) return;
    const p = game.player;
    const idx = CONFIG.LANES.indexOf(p.lane);
    const next = clamp(idx + dir, 0, CONFIG.LANES.length - 1);
    if (CONFIG.LANES[next] !== p.lane) {
      p.prevLane = p.lane;
      p.lane = CONFIG.LANES[next];
      p.turnTimer = CONFIG.TURN_TIME;
      p.turnDir = dir;
    }
  }

  function doJump() {
    if (appState !== STATE.PLAYING || !game) return;
    if (game.player.jumping) return;
    game.player.jumping = true;
    game.player.jumpT = 0;
    audio.jump();
  }

  function togglePauseKey() {
    if (appState === STATE.PLAYING) setPaused(true);
    else if (appState === STATE.PAUSED) setPaused(false);
  }

  /* =========================== SCREEN FLOW =========================== */

  function goMenu() {
    appState = STATE.MENU;
    hud.classList.add("hidden");
    el("menu-best-value").textContent = highScore;
    showOnly(["menu"]);
  }

  function startReady() {
    appState = STATE.READY;
    game = freshGame();
    hud.classList.remove("hidden");
    updateHudStatic();
    showOnly(["ready"]);
    readyTimer = 0;
    el("ready-text").textContent = "READY";
  }

  function beginPlaying() {
    appState = STATE.PLAYING;
    showOnly([]);
    hud.classList.remove("hidden");
  }

  function setPaused(pause) {
    if (pause) { appState = STATE.PAUSED; showOnly(["pause"]); }
    else { appState = STATE.PLAYING; showOnly([]); }
  }

  function endGame() {
    appState = STATE.GAME_OVER;
    audio.gameover();
    const isNew = game.score > highScore;
    if (isNew) { highScore = game.score; storage.set(CONFIG.HS_KEY, highScore); }

    const entry = { name: "PLAYER", score: Math.floor(game.score), date: new Date().toISOString().slice(0, 10) };
    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10);
    storage.set(CONFIG.LB_KEY, leaderboard);
    activeLeaderboardEntry = leaderboard.includes(entry) ? entry : null;

    el("gameover-newbest").classList.toggle("hidden", !isNew);
    el("go-score").textContent = Math.floor(game.score);
    el("go-best").textContent = highScore;
    el("go-time").textContent = Math.floor(game.time) + "s";
    el("go-combo").textContent = "x" + game.comboMax;
    const nameInput = el("player-name-input");
    nameInput.value = "";
    showOnly(["gameover"]);
  }

  function renderLeaderboard() {
    const list = el("leaderboard-list");
    list.innerHTML = "";
    if (leaderboard.length === 0) {
      const li = document.createElement("li");
      li.className = "leaderboard-empty";
      li.textContent = "No scores yet — be the first!";
      list.appendChild(li);
      return;
    }
    leaderboard.forEach((entry, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = (i + 1) + ". " + sanitizeName(entry.name) + " — " + entry.date;
      const val = document.createElement("span");
      val.textContent = entry.score;
      li.appendChild(name);
      li.appendChild(val);
      list.appendChild(li);
    });
  }

  /* =========================== HUD =========================== */

  function updateHudStatic() {
    el("hud-best-value").textContent = highScore;
    renderLives();
  }

  function renderLives() {
    const box = el("hud-lives");
    box.innerHTML = "";
    for (let i = 0; i < CONFIG.LIVES; i++) {
      const dot = document.createElement("div");
      dot.className = "life-icon" + (i < game.lives ? "" : " lost");
      box.appendChild(dot);
    }
  }

  function updateHudLive() {
    el("hud-score-value").textContent = Math.floor(game.score);
    const comboBox = el("hud-combo");
    if (game.combo > 1) {
      comboBox.classList.remove("hidden");
      el("hud-combo-value").textContent = game.combo;
    } else comboBox.classList.add("hidden");

    const puBox = el("hud-powerup");
    if (game.player.activePowerName) {
      puBox.classList.remove("hidden");
      el("hud-powerup-name").textContent = game.player.activePowerName;
      const pct = Math.max(0, game.player.powerTimeLeft / CONFIG.POWERUP_TIME);
      el("hud-powerup-fill").style.transform = "scaleX(" + pct + ")";
    } else puBox.classList.add("hidden");
  }

  /* =========================== PSEUDO-3D PROJECTION =========================== */

  function laneX(lane, p) {
    const maxHalf = W * 0.34;
    return roadCenterX + lane * maxHalf * p;
  }
  function projY(p) { return horizonY + p * (groundY - horizonY); }
  function projScale(p) { return 0.12 + p * 0.9; }

  /* =========================== SPAWNING (traffic / obstacles / pickups) =========================== */

  function spawnWave() {
    const g = game;
    const laneChoices = [...CONFIG.LANES];
    const kinds = ["car", "car", "suv", "bus", "moto", "pothole", "cone", "barrier", "fuel", "bonus"];
    let type = kinds[Math.floor(Math.random() * kinds.length)];

    if (Math.random() < 0.07) {
      const lane = laneChoices[Math.floor(Math.random() * 3)];
      const kind = ["SHIELD", "MAGNET", "BOOST"][Math.floor(Math.random() * 3)];
      g.powerups.push({ lane, p: 0.02, kind, bob: Math.random() * 10 });
      return;
    }
    if (type === "fuel" || type === "bonus") {
      const lane = laneChoices[Math.floor(Math.random() * 3)];
      g.collectibles.push({ lane, p: 0.02, kind: type, bob: Math.random() * 10 });
      return;
    }
    if (type === "pothole" || type === "cone" || type === "barrier") {
      const lane = laneChoices[Math.floor(Math.random() * 3)];
      g.obstacles.push({ lane, p: 0.02, kind: type });
      return;
    }
    const blockedLanes = new Set(g.traffic.filter((t) => t.p < 0.25).map((t) => t.lane));
    const free = laneChoices.filter((l) => !blockedLanes.has(l));
    const lane = free.length ? free[Math.floor(Math.random() * free.length)] : laneChoices[Math.floor(Math.random() * 3)];
    const speedMul = type === "bus" ? 0.68 : type === "moto" ? 1.3 : 0.95 + Math.random() * 0.2;
    g.traffic.push({
      lane, prevLane: lane, laneChangeT: 0, p: 0.02, kind: type, speedMul,
      laneChangeCooldown: 1 + Math.random() * 2, braking: 0,
    });
  }

  function spawnParticles(x, y, count, color, spread, life) {
    for (let i = 0; i < count; i++) {
      game.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.5) * spread - spread * 0.3,
        life: life || 0.6, t: 0, color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  /* =========================== TRAFFIC BEHAVIOUR =========================== */

  function updateTrafficAI(t, dt) {
    if (t.laneChangeT > 0) t.laneChangeT = Math.max(0, t.laneChangeT - dt);
    t.laneChangeCooldown -= dt;
    // occasional courteous braking when a vehicle is close ahead in the same lane
    const ahead = game.traffic.find((o) => o !== t && o.lane === t.lane && o.p > t.p && o.p - t.p < 0.08);
    t.braking = ahead ? Math.min(1, t.braking + dt * 3) : Math.max(0, t.braking - dt * 2);

    if (t.laneChangeCooldown <= 0 && t.p > 0.15 && t.p < 0.6 && Math.random() < CONFIG.TRAFFIC_LANE_CHANGE_CHANCE * dt) {
      const options = CONFIG.LANES.filter((l) => l !== t.lane);
      const target = options[Math.floor(Math.random() * options.length)];
      const blocked = game.traffic.some((o) => o !== t && o.lane === target && Math.abs(o.p - t.p) < 0.16)
        || game.obstacles.some((o) => o.lane === target && Math.abs(o.p - t.p) < 0.1);
      if (!blocked) {
        t.prevLane = t.lane;
        t.lane = target;
        t.laneChangeT = 0.45;
        t.laneChangeCooldown = 2.5 + Math.random() * 3;
      } else {
        t.laneChangeCooldown = 1 + Math.random();
      }
    }
  }

  function trafficRenderLane(t) {
    if (t.laneChangeT > 0) return lerp(t.lane, t.prevLane, t.laneChangeT / 0.45);
    return t.lane;
  }

  /* =========================== UPDATE =========================== */

  function update(dt) {
    const g = game;
    g.time += dt;
    g.shake = Math.max(0, g.shake - dt * 3);

    const scoreMul = g.combo * (g.player.boost > 0 ? 1.5 : 1);
    g.score += CONFIG.SCORE_PER_SEC * dt * scoreMul;

    g.difficultyTimer += dt;
    if (g.difficultyTimer >= CONFIG.DIFFICULTY_TICK) {
      g.difficultyTimer = 0;
      g.speed = Math.min(CONFIG.MAX_SPEED, g.speed + CONFIG.SPEED_RAMP);
      g.spawnInterval = Math.max(CONFIG.SPAWN_MIN, g.spawnInterval - 0.06);
    }

    updatePlayer(dt);
    updateCamera(dt);

    const speed = g.speed * (g.player.boost > 0 ? 1.75 : 1);

    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnWave();
      g.spawnTimer = g.spawnInterval * (0.8 + Math.random() * 0.5);
    }

    g.traffic.forEach((t) => {
      updateTrafficAI(t, dt);
      t.p += speed * dt * t.speedMul * (1 - t.braking * 0.4);
    });
    g.obstacles.forEach((o) => { o.p += speed * dt; });
    g.collectibles.forEach((c) => { c.p += speed * dt; c.bob += dt * 4; });
    g.powerups.forEach((u) => { u.p += speed * dt; u.bob += dt * 4; });

    if (g.player.magnet > 0) {
      g.collectibles.forEach((c) => { if (c.p > 0.55 && c.p < 0.95) c.lane = g.player.lane; });
    }

    const inZone = (e) => e.p > 0.82 && e.p < 0.98;

    if (g.player.invincible <= 0) {
      for (const t of g.traffic) {
        if (inZone(t) && t.lane === g.player.lane && !g.player.jumping) { onCrash(); break; }
      }
      for (const o of g.obstacles) {
        if (inZone(o) && o.lane === g.player.lane) {
          const jumpable = o.kind === "pothole";
          if (!(jumpable && g.player.jumping)) { onCrash(); break; }
        }
      }
    }

    g.collectibles = g.collectibles.filter((c) => {
      if (inZone(c) && c.lane === g.player.lane) { collectPickup(c); return false; }
      return c.p < 1.15;
    });
    g.powerups = g.powerups.filter((u) => {
      if (inZone(u) && u.lane === g.player.lane) { collectPowerup(u); return false; }
      return u.p < 1.15;
    });

    g.traffic = g.traffic.filter((t) => t.p < 1.2);
    g.obstacles = g.obstacles.filter((o) => o.p < 1.15);

    g.particles.forEach((pt) => { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 300 * dt; });
    g.particles = g.particles.filter((pt) => pt.t < pt.life);

    if (!reducedMotion && Math.random() < (0.25 + (g.player.boost > 0 ? 0.5 : 0))) {
      spawnParticles(g.player._x + (Math.random() - 0.5) * 20, groundY + 6, 1, "rgba(180,150,110,0.5)", 40, 0.5);
    }

    updateHudLive();
  }

  /* =========================== PLAYER STATE MACHINE =========================== */

  function updatePlayer(dt) {
    const p = game.player;
    const targetX = laneX(p.lane, 1);
    if (p._x === undefined) p._x = targetX;
    p._x += (targetX - p._x) * Math.min(1, dt * CONFIG.LANE_LERP);

    if (p.jumping) {
      p.jumpT += dt / CONFIG.JUMP_TIME;
      if (p.jumpT >= 1) {
        p.jumping = false; p.jumpT = 0;
        p.landTimer = CONFIG.LAND_TIME;
        audio.land();
      }
    }
    p.landTimer = Math.max(0, p.landTimer - dt);
    p.turnTimer = Math.max(0, p.turnTimer - dt);
    p.crashTimer = Math.max(0, p.crashTimer - dt);
    p.invincible = Math.max(0, p.invincible - dt);
    p.crashFlash = Math.max(0, p.crashFlash - dt * 2);
    p.animT += dt;

    if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
    if (p.magnet > 0) p.magnet = Math.max(0, p.magnet - dt);
    if (p.powerTimeLeft > 0) {
      p.powerTimeLeft -= dt;
      if (p.powerTimeLeft <= 0) { p.activePowerName = null; p.shield = false; }
    }

    // resolved animation state, precedence high -> low
    if (game.lives <= 0) p.anim = "GAME_OVER";
    else if (p.crashTimer > 0) p.anim = "CRASHING";
    else if (p.jumping) p.anim = "JUMPING";
    else if (p.landTimer > 0) p.anim = "LANDING";
    else if (p.boost > 0) p.anim = "BOOSTING";
    else if (p.turnTimer > 0) p.anim = p.turnDir < 0 ? "TURNING_LEFT" : "TURNING_RIGHT";
    else p.anim = "RIDING";
  }

  /* =========================== CAMERA =========================== */

  function updateCamera(dt) {
    const g = game, p = g.player, cam = g.camera;
    const targetZoom = p.boost > 0 ? 0.93 : (p.anim === "CRASHING" ? 1.05 : 1);
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 4);
    const targetTilt = p.turnTimer > 0 ? p.turnDir * 0.045 * (p.turnTimer / CONFIG.TURN_TIME) : 0;
    cam.tilt += (targetTilt - cam.tilt) * Math.min(1, dt * 6);
    const targetBob = p.jumping ? -Math.sin(Math.PI * p.jumpT) * 10 : (p.landTimer > 0 ? (p.landTimer / CONFIG.LAND_TIME) * 6 : 0);
    cam.bobY += (targetBob - cam.bobY) * Math.min(1, dt * 8);
  }

  function collectPickup(c) {
    const p = game.player;
    audio[c.kind === "bonus" ? "bonus" : "pickup"]();
    game.score += c.kind === "bonus" ? CONFIG.BONUS_SCORE : CONFIG.FUEL_SCORE;
    game.comboProgress++;
    if (game.comboProgress >= CONFIG.COMBO_STEP) {
      game.comboProgress = 0;
      if (game.combo < CONFIG.COMBO_MAX) { game.combo++; audio.combo(); }
    }
    game.comboMax = Math.max(game.comboMax, game.combo);
    spawnParticles(p._x, projY(0.9), 10, c.kind === "bonus" ? "#ffd166" : "#7CFC9A", 140, 0.5);
  }

  function collectPowerup(u) {
    const p = game.player;
    p.activePowerName = u.kind;
    p.powerTimeLeft = CONFIG.POWERUP_TIME;
    if (u.kind === "SHIELD") { p.shield = true; audio.shield(); }
    else if (u.kind === "MAGNET") { p.magnet = CONFIG.POWERUP_TIME; audio.pickup(); }
    else if (u.kind === "BOOST") { p.boost = CONFIG.POWERUP_TIME; audio.boost(); }
    spawnParticles(p._x, projY(0.9), 16, "#2ee6c8", 160, 0.6);
  }

  function onCrash() {
    const p = game.player;
    if (p.shield) {
      p.shield = false; p.activePowerName = null; p.powerTimeLeft = 0;
      p.invincible = CONFIG.INVINCIBLE_TIME;
      audio.shield();
      spawnParticles(p._x, projY(0.9), 20, "#2ee6c8", 200, 0.5);
      return;
    }
    audio.crash();
    game.lives--;
    game.combo = 1;
    game.comboProgress = 0;
    p.invincible = CONFIG.INVINCIBLE_TIME;
    p.crashFlash = 1;
    p.crashTimer = CONFIG.CRASH_TIME;
    game.shake = 1;
    spawnParticles(p._x, projY(0.9), 12, "#ff6a4d", 220, 0.6);
    spawnParticles(p._x, projY(0.9), 10, "#ffe37a", 180, 0.4);
    renderLives();
    if (game.lives <= 0) setTimeout(() => endGame(), 500);
  }

  /* =========================== SKY / COLOR HELPERS =========================== */

  function lerpColor(c1, c2, t) {
    const a = c1.match(/\d+/g).map(Number);
    const b = c2.match(/\d+/g).map(Number);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function skyColors() {
    const { phase, mix } = dayPhase(world.dayTimer);
    const palettes = {
      day: ["rgb(120,180,240)", "rgb(210,235,250)"],
      sunset: ["rgb(255,140,90)", "rgb(255,205,140)"],
      night: ["rgb(10,16,40)", "rgb(30,36,64)"],
    };
    if (phase === "day") return palettes.day;
    if (phase === "sunset") return [lerpColor(palettes.day[0], palettes.sunset[0], mix), lerpColor(palettes.day[1], palettes.sunset[1], mix)];
    return [lerpColor(palettes.sunset[0], palettes.night[0], mix), lerpColor(palettes.sunset[1], palettes.night[1], mix)];
  }

  /* =========================== RENDER =========================== */

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    const cam = game ? game.camera : { zoom: 1, tilt: 0, bobY: 0 };
    if (game && game.shake > 0 && !reducedMotion) {
      const s = game.shake * 6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    const focusY = H * 0.62;
    ctx.translate(W / 2, focusY + cam.bobY);
    ctx.rotate(cam.tilt);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-W / 2, -focusY);

    drawSky();
    drawClouds();
    drawSkyline();
    drawGround();
    drawRoad();
    if (game) {
      drawShadowsAndEntities();
      drawSpeedLines();
      drawParticles();
    } else {
      drawAmbientTraffic();
      drawDemoRider();
    }
    if (world.raining) drawRain();
    drawVignette();

    if (game && game.player.crashFlash > 0) {
      ctx.fillStyle = `rgba(255,60,60,${game.player.crashFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function drawSky() {
    const [top, bottom] = skyColors();
    const grad = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, horizonY + 40);

    const night = isNight();
    const { phase, mix } = dayPhase(world.dayTimer);
    const cycleT = Math.min(1, (world.dayTimer % CONFIG.DAY_CYCLE) / (CONFIG.DAY_CYCLE * 0.75));
    const cx = W * (0.2 + 0.6 * cycleT);
    const cy = horizonY * (0.35 + 0.4 * Math.sin(Math.PI * cycleT));
    if (phase !== "night" || mix < 0.4) {
      ctx.save();
      ctx.globalAlpha = phase === "night" ? Math.max(0, 1 - mix / 0.4) : 1;
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
      glow.addColorStop(0, phase === "sunset" ? "rgba(255,210,150,0.9)" : "rgba(255,250,220,0.9)");
      glow.addColorStop(1, "rgba(255,250,220,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 60, cy - 60, 120, 120);
      ctx.beginPath();
      ctx.fillStyle = phase === "sunset" ? "#ffdca0" : "#fff7d6";
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (night) {
      ctx.save();
      const starAlpha = Math.min(1, mix * 2);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 46; i++) {
        const sx = (i * 97) % W;
        const sy = (i * 53) % Math.floor(horizonY * 0.8);
        ctx.globalAlpha = (0.25 + ((i * 37) % 10) / 20) * starAlpha;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.restore();
    }
  }

  function drawClouds() {
    const night = isNight();
    ctx.save();
    ctx.globalAlpha = night ? 0.12 : 0.5;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 220 + world.time * 6) % (W + 200)) - 100;
      const cy = horizonY * (0.18 + (i % 3) * 0.12);
      const s = 0.7 + (i % 3) * 0.25;
      drawCloudPuff(cx, cy, s);
    }
    ctx.restore();
  }
  function drawCloudPuff(cx, cy, s) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22 * s, cy + 4 * s, 22 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 22 * s, cy + 4 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Layered cityscape: distant hills -> far hazy building band -> nearer
     detailed band with rooftop props. Each layer scrolls at its own rate
     driven by world.time so the skyline reads as genuine parallax depth
     rather than a single static silhouette. */

  function drawSkyline() {
    const night = isNight();
    const { mix, phase } = dayPhase(world.dayTimer);
    const hazeMix = phase === "sunset" ? mix : 0;
    ctx.save();

    // ---- layer 1: distant hills (slowest, atmospheric haze) ----
    ctx.fillStyle = night ? "rgba(18,24,38,0.55)" : lerpColor("rgba(120,140,150,0.4)", "rgba(255,170,120,0.4)", hazeMix);
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    const hillScroll = world.time * 1.2;
    for (let x = 0; x <= W; x += 30) {
      ctx.lineTo(x, horizonY - 20 - 14 * Math.sin((x + hillScroll) * 0.006 + 1.3) - 8 * Math.sin((x + hillScroll) * 0.017));
    }
    ctx.lineTo(W, horizonY);
    ctx.closePath();
    ctx.fill();

    // ---- layer 2: far building band (hazy, small, medium scroll) ----
    drawBuildingBand({
      scroll: world.time * 4,
      baseY: horizonY,
      minH: 16, maxH: 46, minW: 22, maxW: 34, gap: 6,
      color: night ? "rgba(14,18,32,0.75)" : "rgba(90,105,125,0.4)",
      windowColor: "rgba(255,205,120,0.55)",
      windowChance: 0.22,
      night, seedBase: 7001, detail: false,
    });

    // ---- layer 3: near building band (crisper, taller, faster scroll, rooftop props) ----
    drawBuildingBand({
      scroll: world.time * 9,
      baseY: horizonY + 2,
      minH: 30, maxH: 92, minW: 34, maxW: 56, gap: 4,
      color: night ? "rgba(10,13,24,0.94)" : "rgba(55,64,82,0.62)",
      windowColor: night ? "rgba(255,215,140,0.9)" : "rgba(190,220,255,0.55)",
      windowChance: 0.5,
      night, seedBase: 4231, detail: true,
    });

    ctx.restore();
  }

  function drawBuildingBand(opts) {
    const { scroll, baseY, minH, maxH, minW, maxW, gap, color, windowColor, windowChance, night, seedBase, detail } = opts;
    const span = maxW + gap + 40;
    const startIdx = Math.floor((scroll) / span) - 1;
    const offset = -(scroll % span);
    let i = startIdx;
    let x = offset - span;
    while (x < W + span) {
      const h = minH + ((seedBase * (i + 7) * 13) % (maxH - minH));
      const bw = minW + ((seedBase * (i + 3) * 29) % (maxW - minW));
      const bx = x, by = baseY - h;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, bw, h + 6);

      if (detail) {
        // rooftop silhouette variety: antenna, water tank, or flat ledge
        const roofKind = (seedBase * (i + 11)) % 3;
        ctx.fillStyle = color;
        if (roofKind === 0) {
          ctx.fillRect(bx + bw * 0.4, by - h * 0.18, bw * 0.06, h * 0.18);
        } else if (roofKind === 1) {
          ctx.beginPath();
          ctx.arc(bx + bw * 0.28, by - 3, bw * 0.14, Math.PI, 0);
          ctx.fill();
        } else {
          ctx.fillRect(bx + bw * 0.15, by - 5, bw * 0.7, 5);
        }
      }

      const winCols = Math.max(2, Math.floor(bw / 9));
      const winRows = Math.max(2, Math.floor(h / 10));
      ctx.fillStyle = windowColor;
      for (let r = 0; r < winRows; r++) {
        for (let c = 0; c < winCols; c++) {
          const wx = bx + 4 + c * 9;
          const wy = by + 5 + r * 10;
          const flicker = night ? (Math.sin(world.time * 0.5 + wx * 0.7 + wy) + 1) / 2 : 1;
          const lit = ((seedBase + c * 13 + r * 7 + i * 5) % 100) / 100 < windowChance;
          if (lit && (!night || flicker > 0.1) && wy < by + h - 2 && wx < bx + bw - 5) {
            ctx.globalAlpha = night ? 0.55 + flicker * 0.45 : 0.7;
            ctx.fillRect(wx, wy, 3.2, 4);
          }
        }
      }
      ctx.globalAlpha = 1;
      x += bw + gap;
      i++;
    }
  }

  function drawGround() {
    const night = isNight();
    ctx.fillStyle = night ? "#0b0f14" : "#3a4a34";
    ctx.fillRect(0, horizonY, W, groundY - horizonY + 60);
    ctx.fillStyle = night ? "#05070a" : "#28351f";
    ctx.fillRect(0, groundY, W, H - groundY);

    for (let p = 0.08; p < 1; p += 0.085) {
      const scale = projScale(p);
      const y = projY(p);
      const idx = Math.round(p * 100);
      const leftX = laneX(-1.9, p);
      const rightX = laneX(1.9, p);
      if (idx % 3 === 0) {
        drawUtilityPole(leftX, y, scale, night);
      } else {
        drawTree(leftX, y, scale, night, idx);
      }
      drawTree(rightX, y, scale, night, idx + 1);
    }
  }

  function drawTree(x, y, scale, night, seed) {
    const h = (40 + (seed % 5) * 4) * scale;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = night ? "#231a12" : "#5b3a22";
    ctx.fillRect(x - 2 * scale, y - h * 0.35, 4 * scale, h * 0.35);
    ctx.beginPath();
    ctx.fillStyle = night ? "#16241a" : "#2f6b3a";
    ctx.arc(x, y - h * 0.55, h * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = night ? "#1c2c20" : "#3a7d46";
    ctx.arc(x - h * 0.12, y - h * 0.62, h * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawUtilityPole(x, y, scale, night) {
    ctx.save();
    ctx.strokeStyle = night ? "#2a2a2a" : "#4a4a4a";
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 58 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 10 * scale, y - 50 * scale); ctx.lineTo(x + 10 * scale, y - 50 * scale); ctx.stroke();
    ctx.strokeStyle = "rgba(120,120,120,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale, y - 50 * scale);
    ctx.quadraticCurveTo(x + W * 0.05, y - 46 * scale, x + 60 * scale, y - 52 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoad() {
    const night = isNight();
    ctx.save();
    const bx = laneX(-1.55, 1), bx2 = laneX(1.55, 1);
    const tx = laneX(-1.55, 0.02), tx2 = laneX(1.55, 0.02);
    const grad = ctx.createLinearGradient(0, horizonY, 0, groundY + 40);
    grad.addColorStop(0, night ? "#1a1d22" : "#4a4d52");
    grad.addColorStop(1, night ? "#101215" : "#2c2e33");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(tx, horizonY); ctx.lineTo(tx2, horizonY);
    ctx.lineTo(bx2, groundY + 40); ctx.lineTo(bx, groundY + 40);
    ctx.closePath(); ctx.fill();

    // sidewalks (between road edge and roadside props)
    ctx.fillStyle = night ? "rgba(60,60,64,0.5)" : "rgba(150,148,140,0.55)";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(laneX(1.55 * side, 0.02), horizonY);
      ctx.lineTo(laneX(1.8 * side, 0.02), horizonY);
      ctx.lineTo(laneX(1.8 * side, 1), groundY + 40);
      ctx.lineTo(laneX(1.55 * side, 1), groundY + 40);
      ctx.closePath(); ctx.fill();
    });

    // road texture: cracks / patches / debris
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 9; i++) {
      const p = (i / 9 + world.time * 0.05) % 1;
      const y = projY(p);
      const s = projScale(p);
      ctx.beginPath();
      ctx.ellipse(roadCenterX + (i % 3 - 1) * 40 * s, y, 30 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const p = (i / 5 + world.time * 0.04 + 0.3) % 1;
      const y = projY(p), s = projScale(p);
      ctx.beginPath();
      ctx.moveTo(roadCenterX - 20 * s, y);
      ctx.lineTo(roadCenterX - 4 * s, y + 6 * s);
      ctx.lineTo(roadCenterX + 14 * s, y - 3 * s);
      ctx.stroke();
    }

    // lane lines
    const scroll = game ? (game.time * game.speed * 2.2) % 1 : (world.time * CONFIG.BASE_SPEED * 2.2) % 1;
    ctx.strokeStyle = night ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)";
    [-0.5, 0.5].forEach((laneOffset) => {
      for (let i = 0; i < 14; i++) {
        const p0 = (i / 14 + scroll) % 1;
        const p1 = Math.min(1, p0 + 0.03);
        if (p1 <= p0) continue;
        const y0 = projY(p0), y1 = projY(p1);
        const x0 = laneX(laneOffset * 2, p0), x1 = laneX(laneOffset * 2, p1);
        ctx.lineWidth = 2 + p0 * 6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    });

    // road edges
    ctx.strokeStyle = night ? "rgba(255,200,120,0.5)" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(bx, groundY + 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx2, horizonY); ctx.lineTo(bx2, groundY + 40); ctx.stroke();

    // guardrail posts + streetlights alternating
    for (let p = 0.05; p < 1; p += 0.16) {
      const scale = projScale(p);
      const y = projY(p);
      const idx = Math.round(p * 100);
      const x = laneX(-1.7, p);
      if (idx % 2 === 0) {
        drawStreetlight(x, y, scale, night);
      } else {
        ctx.fillStyle = night ? "#3a3a3a" : "#9a9a9a";
        ctx.fillRect(x - 1.5 * scale, y - 12 * scale, 3 * scale, 12 * scale);
      }
    }
    ctx.restore();
  }

  function drawStreetlight(x, y, scale, night) {
    ctx.save();
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(x - 1.5 * scale, y - 40 * scale, 3 * scale, 40 * scale);
    ctx.fillRect(x - 12 * scale, y - 42 * scale, 12 * scale, 3 * scale);
    if (night) {
      const glow = ctx.createRadialGradient(x - 6 * scale, y - 42 * scale, 1, x - 6 * scale, y - 42 * scale, 40 * scale);
      glow.addColorStop(0, "rgba(255,220,150,0.9)");
      glow.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x - 6 * scale, y - 42 * scale, 40 * scale, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#333";
      ctx.beginPath(); ctx.arc(x - 6 * scale, y - 42 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* --------- entity depth sort + draw --------- */

  function drawShadowsAndEntities() {
    const g = game;
    const items = [];
    g.traffic.forEach((t) => items.push({ p: t.p, lane: trafficRenderLane(t), kind: t.kind, type: "traffic", braking: t.braking }));
    g.obstacles.forEach((o) => items.push({ p: o.p, lane: o.lane, kind: o.kind, type: "obstacle" }));
    g.collectibles.forEach((c) => items.push({ p: c.p, lane: c.lane, kind: c.kind, type: "collectible", bob: c.bob }));
    g.powerups.forEach((u) => items.push({ p: u.p, lane: u.lane, kind: u.kind, type: "powerup", bob: u.bob }));
    items.sort((a, b) => a.p - b.p);

    items.forEach((it) => {
      const p = Math.min(1, it.p);
      const scale = projScale(p);
      const x = laneX(it.lane, p);
      const y = projY(p);
      if (it.type === "traffic") drawVehicle(x, y, scale, it.kind, it.braking);
      else if (it.type === "obstacle") drawObstacle(x, y, scale, it.kind);
      else if (it.type === "collectible") drawCollectible(x, y, scale, it.kind, it.bob);
      else if (it.type === "powerup") drawPowerupIcon(x, y, scale, it.kind, it.bob);
    });

    drawRider(g.player, g.time, false);
  }

  function drawAmbientTraffic() {
    world.ambientTraffic.slice().sort((a, b) => a.p - b.p).forEach((t) => {
      const p = Math.min(1, t.p);
      drawVehicle(laneX(t.lane, p), projY(p), projScale(p), t.kind, 0);
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawVehicle(x, y, scale, kind, braking) {
    const night = isNight();
    const w = (kind === "bus" ? 76 : kind === "suv" ? 62 : kind === "moto" ? 30 : 56) * scale;
    const h = (kind === "bus" ? 48 : kind === "moto" ? 30 : 34) * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.42, w * 0.5, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();

    const bodyColor = { car: "#c0392b", suv: "#2d6cdf", bus: "#e0a52d", moto: "#3a3a3a" }[kind] || "#888";
    const bodyGrad = ctx.createLinearGradient(0, -h * 0.7, 0, 0);
    bodyGrad.addColorStop(0, bodyColor);
    bodyGrad.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = bodyGrad;
    roundRect(-w / 2, -h * 0.7, w, h * 0.7, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(-w / 2, -h * 0.7, w, h * 0.16, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "rgba(200,230,255,0.75)";
    roundRect(-w * 0.36, -h * 0.62, w * 0.72, h * 0.28, 4 * scale);
    ctx.fill();

    if (kind !== "moto") {
      // roofline pillar + side mirrors for a less flat, more recognizable silhouette
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath(); ctx.moveTo(-w * 0.02, -h * 0.62); ctx.lineTo(-w * 0.02, -h * 0.34); ctx.stroke();
      ctx.fillStyle = bodyColor;
      roundRect(-w * 0.52, -h * 0.5, w * 0.06, h * 0.1, 2 * scale); ctx.fill();
      roundRect(w * 0.46, -h * 0.5, w * 0.06, h * 0.1, 2 * scale); ctx.fill();
    }

    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(-w * 0.32, h * 0.05, h * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.32, h * 0.05, h * 0.16, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = night ? "#fff6c8" : "#fff2c0";
    ctx.beginPath(); ctx.arc(-w * 0.38, -h * 0.12, h * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.38, -h * 0.12, h * 0.08, 0, Math.PI * 2); ctx.fill();
    if (night) {
      const glow = ctx.createRadialGradient(0, -h * 0.12, 1, 0, -h * 0.12, w * 0.7);
      glow.addColorStop(0, "rgba(255,240,180,0.35)");
      glow.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, -h * 0.12, w * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    // brake lights (rear, top of frame from camera's perspective -> we approximate at top edge)
    if (braking > 0.05) {
      ctx.fillStyle = `rgba(255,50,50,${0.5 + braking * 0.5})`;
      ctx.beginPath(); ctx.arc(-w * 0.4, -h * 0.66, h * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.4, -h * 0.66, h * 0.06, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacle(x, y, scale, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(0, 10 * scale, 20 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (kind === "pothole") {
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.ellipse(0, 6 * scale, 22 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#333"; ctx.lineWidth = 2 * scale; ctx.stroke();
    } else if (kind === "cone") {
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath();
      ctx.moveTo(0, -26 * scale); ctx.lineTo(14 * scale, 8 * scale); ctx.lineTo(-14 * scale, 8 * scale);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-12 * scale, -6 * scale, 24 * scale, 5 * scale);
    } else {
      ctx.fillStyle = "#e8b33a";
      roundRect(-24 * scale, -12 * scale, 48 * scale, 14 * scale, 3 * scale); ctx.fill();
      ctx.fillStyle = "#222";
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * 14 * scale - 4 * scale, -12 * scale, 6 * scale, 14 * scale);
    }
    ctx.restore();
  }

  function drawCollectible(x, y, scale, kind, bob) {
    const yy = y - Math.sin(bob) * 6 * scale - 18 * scale;
    ctx.save();
    ctx.translate(x, yy);
    ctx.rotate(Math.sin(bob * 0.6) * 0.15);
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 26 * scale);
    glow.addColorStop(0, kind === "bonus" ? "rgba(255,210,80,0.55)" : "rgba(110,255,150,0.5)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 26 * scale, 0, Math.PI * 2); ctx.fill();

    if (kind === "bonus") {
      ctx.fillStyle = "#ffd166";
      drawStar(0, 0, 5, 12 * scale, 6 * scale);
      ctx.fill();
    } else {
      ctx.fillStyle = "#3ddc84";
      roundRect(-8 * scale, -12 * scale, 16 * scale, 22 * scale, 3 * scale); ctx.fill();
      ctx.fillStyle = "#1f8c4d";
      ctx.fillRect(-8 * scale, -12 * scale, 16 * scale, 5 * scale);
    }
    ctx.restore();
  }

  function drawStar(cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3, x = cx, y = cy;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR; y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y); rot += step;
      x = cx + Math.cos(rot) * innerR; y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y); rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
  }

  function drawPowerupIcon(x, y, scale, kind, bob) {
    const yy = y - Math.sin(bob) * 6 * scale - 18 * scale;
    ctx.save();
    ctx.translate(x, yy);
    const colors = { SHIELD: "#4fd1ff", MAGNET: "#ff5fa2", BOOST: "#ffb347" };
    const c = colors[kind] || "#fff";
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 30 * scale);
    glow.addColorStop(0, c);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 30 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 14 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0a0f16";
    ctx.font = `bold ${12 * scale}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(kind[0], 0, 1);
    ctx.restore();
  }

  /* =========================== PLAYER: RIDER + MOTORCYCLE =========================== */
  /* Joint-based procedural human figure. All limbs are drawn as two connected
     segments (upper/lower) pivoting from anatomical joints, driven by the
     resolved animation state so the pose genuinely changes with gameplay. */

  function limbSegment(x0, y0, ang1, len1, ang2, len2, wA, wB, colorA, colorB) {
    const x1 = x0 + Math.cos(ang1) * len1, y1 = y0 + Math.sin(ang1) * len1;
    const totalAngle = ang1 + ang2;
    const x2 = x1 + Math.cos(totalAngle) * len2, y2 = y1 + Math.sin(totalAngle) * len2;
    ctx.strokeStyle = colorA; ctx.lineWidth = wA; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = colorA;
    ctx.beginPath(); ctx.arc(x1, y1, wA * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colorB; ctx.lineWidth = wB; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    return { x: x2, y: y2 };
  }

  function drawRider(p, t, isDemo) {
    const scale = 1.05;
    const x = p._x !== undefined ? p._x : roadCenterX;
    let baseY = groundY - 6;
    const night = isNight();

    let jumpOffset = 0;
    if (p.jumping) jumpOffset = Math.sin(Math.PI * p.jumpT) * CONFIG.JUMP_HEIGHT;
    const landSquash = p.landTimer > 0 ? (p.landTimer / CONFIG.LAND_TIME) : 0;
    const bodyY = baseY - jumpOffset;

    if (p.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.15;
      const glow = ctx.createRadialGradient(x, bodyY - 40, 2, x, bodyY - 40, 60);
      glow.addColorStop(0, "rgba(79,209,255,0.5)");
      glow.addColorStop(1, "rgba(79,209,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, bodyY - 40, 60, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (p.boost > 0 && !reducedMotion) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      const trail = ctx.createLinearGradient(x, bodyY, x, bodyY + 70);
      trail.addColorStop(0, "rgba(255,170,60,0.55)");
      trail.addColorStop(1, "rgba(255,170,60,0)");
      ctx.fillStyle = trail;
      ctx.fillRect(x - 20, bodyY, 40, 70);
      ctx.restore();
    }
    if (night) {
      ctx.save();
      const cone = ctx.createRadialGradient(x, bodyY - 50, 4, x, bodyY - 260, 140);
      cone.addColorStop(0, "rgba(255,250,210,0.35)");
      cone.addColorStop(1, "rgba(255,250,210,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(x - 16, bodyY - 40); ctx.lineTo(x - 90, bodyY - 260);
      ctx.lineTo(x + 90, bodyY - 260); ctx.lineTo(x + 16, bodyY - 40);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.save();
    const squash = p.jumping ? Math.max(0.35, 1 - jumpOffset / CONFIG.JUMP_HEIGHT) : 1 - landSquash * 0.15;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(x, baseY + 8, 36 * squash, 9 * squash, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const invBlink = p.invincible > 0 && Math.floor(t * 12) % 2 === 0;

    ctx.save();
    ctx.translate(x, bodyY);
    if (invBlink) ctx.globalAlpha = 0.4;

    const anim = p.anim || "RIDING";
    const turnAmt = anim === "TURNING_LEFT" ? -1 : anim === "TURNING_RIGHT" ? 1 : 0;
    const boostLean = anim === "BOOSTING" ? 0.16 : 0;
    const crashT = anim === "CRASHING" ? 1 - clamp(p.crashTimer / CONFIG.CRASH_TIME, 0, 1) : 0;

    let lean = turnAmt * 0.14 + boostLean + Math.sin(t * 3.4) * 0.012;
    if (anim === "CRASHING") lean = Math.sin(crashT * 8) * 0.5 * (1 - crashT);
    if (anim === "GAME_OVER") lean = 0.32;
    ctx.rotate(lean);

    drawMotorcycle(scale, t, p, anim, landSquash);
    drawRiderBody(scale, t, p, anim, turnAmt, crashT);

    ctx.restore();
  }

  function drawDemoRider() {
    const p = { _x: roadCenterX, jumping: false, jumpT: 0, landTimer: 0, turnTimer: 0, turnDir: 0,
      crashTimer: 0, invincible: 0, boost: 0, shield: false, anim: "RIDING" };
    drawRider(p, world.time, true);
  }

  function drawMotorcycle(scale, t, p, anim, landSquash) {
    ctx.save();
    ctx.scale(scale, scale);
    const rideBob = Math.sin(t * 8) * 0.8;
    ctx.translate(0, rideBob);

    const suspensionCompress = landSquash * 6;
    const wheelSpin = (t * 900) % 360;

    // rear wheel
    drawWheel(-24, 4 + suspensionCompress * 0.4, wheelSpin);
    // front fork + front wheel (steers slightly with turn)
    const steer = (anim === "TURNING_LEFT" ? -0.12 : anim === "TURNING_RIGHT" ? 0.12 : 0);
    ctx.save();
    ctx.translate(22, 2);
    ctx.rotate(steer);
    ctx.strokeStyle = "#555"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 2 - suspensionCompress); ctx.stroke();
    ctx.restore();
    drawWheel(22, 4 - suspensionCompress * 0.6, wheelSpin * 1.02);

    // engine block
    ctx.fillStyle = "#2b2b2b";
    roundRect(-8, -8, 18, 12, 3); ctx.fill();
    ctx.fillStyle = "#444";
    ctx.fillRect(-6, -6, 6, 4);

    // main frame / body panels
    const bodyGrad = ctx.createLinearGradient(0, -22, 0, -4);
    bodyGrad.addColorStop(0, "#d1442f");
    bodyGrad.addColorStop(1, "#8e2a1f");
    ctx.fillStyle = bodyGrad;
    roundRect(-27, -18, 52, 15, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(-24, -17, 20, 4, 2); ctx.fill();

    // seat
    ctx.fillStyle = "#1a1a1a";
    roundRect(-11, -27, 24, 11, 4); ctx.fill();

    // exhaust pipe with subtle heat shimmer particles
    ctx.fillStyle = "#999";
    roundRect(-34, -7, 12, 6, 3); ctx.fill();
    ctx.fillStyle = "#666";
    ctx.fillRect(-36, -6, 4, 4);

    // handlebar
    ctx.strokeStyle = "#222"; ctx.lineWidth = 3;
    ctx.save();
    ctx.translate(20, -18);
    ctx.rotate(steer * 1.4);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -11); ctx.stroke();
    ctx.restore();

    // headlight + brake light
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath(); ctx.arc(25, -19, 4, 0, Math.PI * 2); ctx.fill();
    if (anim === "LANDING" || anim === "CRASHING") {
      ctx.fillStyle = "rgba(255,60,60,0.9)";
      ctx.beginPath(); ctx.arc(-28, -14, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  function drawWheel(cx, cy, spinDeg) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#666"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#888"; ctx.lineWidth = 1.5;
    ctx.rotate((spinDeg * Math.PI) / 180);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((i / 6) * Math.PI * 2) * 13, Math.sin((i / 6) * Math.PI * 2) * 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRiderBody(scale, t, p, anim, turnAmt, crashT) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-1, -22);

    const jumpTuck = anim === "JUMPING" ? Math.sin(Math.PI * p.jumpT) : 0;
    const boosting = anim === "BOOSTING" ? 1 : 0;
    const gameOver = anim === "GAME_OVER" ? 1 : 0;
    const crashing = anim === "CRASHING" ? 1 : 0;
    const cycle = t * (7 + boosting * 2.5);

    // torso lean forward when boosting, back slightly when jumping, slumped on game over
    let torsoAngle = -Math.PI / 2 + boosting * 0.22 - jumpTuck * 0.1 + gameOver * 0.55;
    if (crashing) torsoAngle += Math.sin(crashT * 10) * 0.6 * (1 - crashT);
    const hipX = 0, hipY = 0;
    const bob = Math.sin(cycle) * 1.4 * (1 - jumpTuck * 0.6);

    ctx.save();
    ctx.translate(hipX, hipY + bob);

    // ---- legs (thigh -> shin), seated pose resting on foot-pegs ----
    const kneeBendBase = 1.9 + jumpTuck * 0.9 + crashing * 0.6;
    const legColor1 = "#1f2a3f", legColor2 = "#141b28";
    const legL = limbSegment(-3, 0, Math.PI * 0.32 + turnAmt * 0.05, 11, kneeBendBase, 11, 7, 6, legColor1, legColor2);
    const legR = limbSegment(3, 0, Math.PI * 0.34 - turnAmt * 0.05, 11, kneeBendBase - 0.15, 11, 7, 6, legColor1, legColor2);
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.ellipse(legL.x, legL.y, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(legR.x, legR.y, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();

    // ---- torso ----
    ctx.save();
    ctx.rotate(0);
    const torsoLen = 20;
    const shoulderX = Math.cos(torsoAngle) * torsoLen;
    const shoulderY = Math.sin(torsoAngle) * torsoLen;
    const torsoGrad = ctx.createLinearGradient(0, 0, shoulderX, shoulderY);
    torsoGrad.addColorStop(0, "#1f2a3f");
    torsoGrad.addColorStop(1, "#324467");
    ctx.strokeStyle = torsoGrad;
    ctx.lineWidth = 13;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(shoulderX, shoulderY); ctx.stroke();
    // chest highlight / jacket stripe
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(shoulderX * 0.2, shoulderY * 0.2); ctx.lineTo(shoulderX * 0.75, shoulderY * 0.75); ctx.stroke();

    // ---- arms (upper arm -> forearm) reaching to handlebar ----
    const handTargetX = 20, handTargetY = -18; // approx handlebar grip in local space
    const shoulderPos = { x: shoulderX, y: shoulderY };
    const reachAngleL = Math.atan2(handTargetY - shoulderPos.y, handTargetX - shoulderPos.x) - 0.35 - turnAmt * 0.1;
    const reachAngleR = Math.atan2(handTargetY - shoulderPos.y, handTargetX - shoulderPos.x) + 0.35 + turnAmt * 0.1;
    const elbowBend = crashing ? Math.sin(crashT * 12) * 1.2 : 0.55 + Math.sin(cycle * 0.7) * 0.05;
    const armColor1 = "#2b3a55", armColor2 = "#233049";
    const armL = limbSegment(shoulderPos.x, shoulderPos.y, reachAngleL, 10, elbowBend, 10, 6, 5, armColor1, armColor2);
    const armR = limbSegment(shoulderPos.x, shoulderPos.y, reachAngleR, 10, -elbowBend, 10, 6, 5, armColor1, armColor2);
    ctx.fillStyle = "#e8b98a";
    ctx.beginPath(); ctx.arc(armL.x, armL.y, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(armR.x, armR.y, 3.4, 0, Math.PI * 2); ctx.fill();

    // ---- neck + head + helmet ----
    const headX = shoulderX * 1.18, headY = shoulderY * 1.18;
    ctx.fillStyle = "#e8b98a";
    ctx.beginPath(); ctx.arc((shoulderX + headX) / 2, (shoulderY + headY) / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(headX, headY, 8, 0, Math.PI * 2); ctx.fill();

    const headYaw = turnAmt * 3; // subtle head turn toward the lane change
    ctx.save();
    ctx.translate(headX, headY);
    ctx.fillStyle = "#ffb347";
    ctx.beginPath(); ctx.arc(0, -1, 9, Math.PI, 0); ctx.fill();
    ctx.fillRect(-9, -1, 18, 4);
    ctx.fillStyle = "rgba(30,40,60,0.88)";
    ctx.beginPath(); ctx.ellipse(2 + headYaw, 1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore(); // torso frame
    ctx.restore(); // hip/bob frame
    ctx.restore(); // outer scale
  }

  /* --------- speed / particles / rain / vignette --------- */

  function drawSpeedLines() {
    if (reducedMotion) return;
    const g = game;
    const intensity = clamp((g.speed - CONFIG.BASE_SPEED) / (CONFIG.MAX_SPEED - CONFIG.BASE_SPEED), 0, 1) + (g.player.boost > 0 ? 0.8 : 0);
    if (intensity <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, intensity * 0.5);
    ctx.strokeStyle = "#fff";
    const count = Math.floor(6 + intensity * 10);
    for (let i = 0; i < count; i++) {
      const seedT = (i * 37 + g.time * 260 * (1 + intensity)) % (W * 1.4);
      const yy = (i * 53) % (H * 0.6) + H * 0.15;
      const len = 30 + intensity * 60;
      const xx = W - seedT;
      ctx.lineWidth = 1 + intensity * 1.5;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - len, yy); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    game.particles.forEach((pt) => {
      const a = Math.max(0, 1 - pt.t / pt.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawRain() {
    ctx.save();
    ctx.strokeStyle = "rgba(180,200,230,0.5)";
    ctx.lineWidth = 1.4;
    world.rain.forEach((r) => {
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 4, r.y + 14); ctx.stroke();
    });
    ctx.fillStyle = "rgba(150,170,200,0.06)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  /* =========================== GAME LOOP =========================== */

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = ts;

    if (appState !== STATE.PAUSED) updateWorld(dt);

    if (appState === STATE.SPLASH) {
      splashTimer += dt;
      const pct = Math.min(1, splashTimer / SPLASH_MIN_TIME);
      const fill = el("splash-bar-fill");
      if (fill) fill.style.width = (pct * 100).toFixed(1) + "%";
      const label = el("splash-loading-text");
      if (label) {
        const idx = Math.min(SPLASH_MESSAGES.length - 1, Math.floor(pct * SPLASH_MESSAGES.length));
        if (label.textContent !== SPLASH_MESSAGES[idx]) label.textContent = SPLASH_MESSAGES[idx];
      }
      if (pct >= 1) finishSplash();
    } else if (appState === STATE.READY) {
      readyTimer += dt;
      const text = el("ready-text");
      if (readyTimer < 0.8) text.textContent = "READY";
      else if (readyTimer < 1.5) { if (text.textContent !== "3") audio.countdown(); text.textContent = "3"; }
      else if (readyTimer < 2.2) { if (text.textContent !== "2") audio.countdown(); text.textContent = "2"; }
      else if (readyTimer < 2.9) { if (text.textContent !== "1") audio.countdown(); text.textContent = "1"; }
      else if (readyTimer < 3.4) { if (text.textContent !== "GO!") audio.go(); text.textContent = "GO!"; }
      else beginPlaying();
    } else if (appState === STATE.PLAYING) {
      update(dt);
    }

    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* =========================== SHARE =========================== */

  function shareScore() {
    const text = `I scored ${Math.floor(game.score)} points in ABUJA ROADFIRE by Davonium Technologies! 🏍️🔥`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => fallbackShare(text));
    } else {
      fallbackShare(text);
    }
  }
  function fallbackShare(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => openShareDialog(text, "Copied to clipboard!")).catch(() => openShareDialog(text, ""));
    } else {
      openShareDialog(text, "");
    }
  }
  function openShareDialog(text, status) {
    el("share-text").value = text;
    el("share-status").textContent = status;
    showOnly(["share"]);
  }

  /* =========================== UI WIRING =========================== */

  function bindToggle(id, key, currentVal, onChange) {
    const btn = el(id);
    btn.dataset.on = currentVal ? "true" : "false";
    btn.addEventListener("click", () => {
      const now = btn.dataset.on !== "true";
      btn.dataset.on = now ? "true" : "false";
      onChange(now);
      storage.set(key, now);
      audio.button();
    });
  }

  function wireUI() {
    el("btn-play").addEventListener("click", () => { audio.button(); startReady(); });
    el("btn-howto").addEventListener("click", () => { audio.button(); showOnly(["howto", "menu"]); });
    el("btn-howto-close").addEventListener("click", () => { audio.button(); showOnly(["menu"]); });
    el("btn-leaderboard").addEventListener("click", () => { audio.button(); renderLeaderboard(); showOnly(["leaderboard", "menu"]); });
    el("btn-leaderboard-close").addEventListener("click", () => { audio.button(); showOnly(["menu"]); });
    el("btn-leaderboard-gameover").addEventListener("click", () => { audio.button(); renderLeaderboard(); showOnly(["leaderboard", "gameover"]); });
    el("btn-settings").addEventListener("click", () => { audio.button(); showOnly(["settings", "menu"]); });
    el("btn-settings-close").addEventListener("click", () => { audio.button(); showOnly(["menu"]); });

    el("btn-pause").addEventListener("click", () => { audio.button(); setPaused(true); });
    el("btn-resume").addEventListener("click", () => { audio.button(); setPaused(false); });
    el("btn-restart-pause").addEventListener("click", () => { audio.button(); startReady(); });
    el("btn-menu-pause").addEventListener("click", () => { audio.button(); goMenu(); });

    el("btn-play-again").addEventListener("click", () => { audio.button(); startReady(); });
    el("btn-menu-gameover").addEventListener("click", () => { audio.button(); goMenu(); });
    el("btn-share").addEventListener("click", () => { audio.button(); shareScore(); });

    el("player-name-input").addEventListener("input", (e) => {
      if (!activeLeaderboardEntry) return;
      activeLeaderboardEntry.name = sanitizeName(e.target.value);
      storage.set(CONFIG.LB_KEY, leaderboard);
    });

    el("btn-sound").addEventListener("click", () => {
      soundOn = !soundOn;
      storage.set(CONFIG.SOUND_KEY, soundOn);
      el("btn-sound").textContent = soundOn ? "🔊" : "🔇";
      el("toggle-sound").dataset.on = soundOn ? "true" : "false";
      if (soundOn) audio.button();
    });
    el("btn-sound").textContent = soundOn ? "🔊" : "🔇";

    bindToggle("toggle-sound", CONFIG.SOUND_KEY, soundOn, (v) => {
      soundOn = v;
      el("btn-sound").textContent = soundOn ? "🔊" : "🔇";
    });
    bindToggle("toggle-motion", CONFIG.MOTION_KEY, reducedMotion, (v) => { reducedMotion = v; });

    el("btn-reset-scores").addEventListener("click", () => {
      audio.button();
      pendingConfirm = () => {
        highScore = 0; leaderboard = [];
        storage.set(CONFIG.HS_KEY, 0);
        storage.set(CONFIG.LB_KEY, []);
        el("menu-best-value").textContent = 0;
      };
      showOnly(["confirm", "settings"]);
    });
    el("btn-confirm-yes").addEventListener("click", () => {
      audio.button();
      if (pendingConfirm) pendingConfirm();
      pendingConfirm = null;
      showOnly(["settings"]);
    });
    el("btn-confirm-no").addEventListener("click", () => { audio.button(); pendingConfirm = null; showOnly(["settings"]); });

    el("btn-share-copy").addEventListener("click", () => {
      const ta = el("share-text");
      ta.select();
      try { document.execCommand("copy"); el("share-status").textContent = "Copied!"; } catch (e) { /* ignore */ }
      audio.button();
    });
    el("btn-share-close").addEventListener("click", () => { audio.button(); showOnly(["gameover"]); });

    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  }

  /* =========================== INITIALIZATION =========================== */

  wireUI();
  startSplash();

  // --- DAVONIUM AD PLACEHOLDER ---
  // Future AdMob / AdSense integration can be added here.

})();
