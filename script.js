/* =========================================================
   ABUJA ROADFIRE — Davonium Technologies
   Original endless-runner arcade game. Pure vanilla JS + Canvas.
   ========================================================= */

(function () {
  "use strict";

  /* =========================== CONFIG =========================== */

  const CONFIG = {
    LANES: [-1, 0, 1],
    LANE_LERP: 10,          // lane-change smoothing speed
    BASE_SPEED: 0.34,        // progress units per second (0..1 travel)
    MAX_SPEED: 0.95,
    SPEED_RAMP: 0.014,       // speed gained per difficulty tick
    DIFFICULTY_TICK: 18,     // seconds between difficulty increases
    SPAWN_BASE: 1.05,        // seconds between spawns at start
    SPAWN_MIN: 0.48,
    LIVES: 3,
    INVINCIBLE_TIME: 1.6,
    JUMP_TIME: 0.62,
    JUMP_HEIGHT: 60,
    SCORE_PER_SEC: 10,
    FUEL_SCORE: 50,
    BONUS_SCORE: 100,
    COMBO_STEP: 8,           // pickups needed per combo level
    COMBO_MAX: 5,
    POWERUP_TIME: 7,
    DAY_CYCLE: 95,           // seconds for a full day->sunset->night cycle
    LB_KEY: "localLeaderboard",
    HS_KEY: "divoniumHighScore",
    SOUND_KEY: "soundPreference",
    MOTION_KEY: "reducedMotionPreference",
  };

  const STATE = {
    MENU: "MENU", READY: "READY", PLAYING: "PLAYING", PAUSED: "PAUSED",
    GAME_OVER: "GAME_OVER", SETTINGS: "SETTINGS", LEADERBOARD: "LEADERBOARD",
    HOWTO: "HOWTO",
  };

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
    horizonY = H * 0.34;
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
    button() { this.tone(520, 0.08, "square", 0.12); },
    pickup() { this.tone(760, 0.12, "triangle", 0.18, 1200); },
    bonus() { this.tone(880, 0.16, "triangle", 0.2, 1500); },
    crash() { this.tone(120, 0.35, "sawtooth", 0.25, 40); },
    combo() { this.tone(1000, 0.1, "square", 0.14, 1400); },
    boost() { this.tone(200, 0.4, "sawtooth", 0.2, 700); },
    shield() { this.tone(600, 0.25, "sine", 0.18, 900); },
    jump() { this.tone(400, 0.12, "sine", 0.15, 650); },
    gameover() { this.tone(300, 0.5, "sawtooth", 0.2, 80); },
  };

  /* =========================== DOM refs =========================== */

  const el = (id) => document.getElementById(id);
  const screens = {
    menu: el("screen-menu"), ready: el("screen-ready"), pause: el("screen-pause"),
    gameover: el("screen-gameover"), howto: el("screen-howto"),
    leaderboard: el("screen-leaderboard"), settings: el("screen-settings"),
    confirm: el("screen-confirm"), share: el("screen-share"),
  };
  const hud = el("hud");

  function showOnly(names) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle("hidden", !names.includes(k)));
  }

  /* =========================== GAME STATE =========================== */

  let game = null; // created fresh each run
  let appState = STATE.MENU;
  let lastTime = 0;
  let readyTimer = 0;
  let pendingConfirm = null;

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
      dayTimer: Math.random() * 20,
      weatherTimer: 14 + Math.random() * 10,
      raining: false,
      rainTimer: 0,
      shake: 0,
      player: {
        lane: 0, laneVisual: 0,
        jumping: false, jumpT: 0,
        crashFlash: 0,
        invincible: 0,
        anim: "IDLE", animT: 0,
        magnet: 0, boost: 0, shield: false,
        activePowerName: null, powerTimeLeft: 0,
      },
      traffic: [],
      obstacles: [],
      collectibles: [],
      powerups: [],
      particles: [],
      rain: [],
    };
  }

  /* =========================== INPUT =========================== */

  let touchStart = null;
  const SWIPE_MIN = 28;

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
    if (["ArrowLeft", "a", "A"].includes(e.key)) moveLane(-1);
    else if (["ArrowRight", "d", "D"].includes(e.key)) moveLane(1);
    else if (["ArrowUp", " ", "Spacebar"].includes(e.key)) doJump();
    else if (["p", "P", "Escape"].includes(e.key)) togglePauseKey();
  });

  function moveLane(dir) {
    if (appState !== STATE.PLAYING || !game) return;
    const idx = CONFIG.LANES.indexOf(game.player.lane);
    const next = Math.max(0, Math.min(CONFIG.LANES.length - 1, idx + dir));
    game.player.lane = CONFIG.LANES[next];
  }

  function doJump() {
    if (appState !== STATE.PLAYING || !game) return;
    if (game.player.jumping) return;
    game.player.jumping = true;
    game.player.jumpT = 0;
    game.player.anim = "JUMP";
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
    if (pause) {
      appState = STATE.PAUSED;
      showOnly(["pause"]);
    } else {
      appState = STATE.PLAYING;
      showOnly([]);
    }
  }

  function endGame() {
    appState = STATE.GAME_OVER;
    audio.gameover();
    const isNew = game.score > highScore;
    if (isNew) { highScore = game.score; storage.set(CONFIG.HS_KEY, highScore); }
    leaderboard.push({ score: game.score, date: new Date().toISOString().slice(0, 10) });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10);
    storage.set(CONFIG.LB_KEY, leaderboard);

    el("gameover-newbest").classList.toggle("hidden", !isNew);
    el("go-score").textContent = game.score;
    el("go-best").textContent = highScore;
    el("go-time").textContent = Math.floor(game.time) + "s";
    el("go-combo").textContent = "x" + game.comboMax;
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
      name.textContent = (i + 1) + ". " + entry.date;
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

  /* =========================== ENTITY HELPERS =========================== */

  function laneX(lane, p) {
    const maxHalf = W * 0.34;
    return roadCenterX + lane * maxHalf * p;
  }
  function projY(p) { return horizonY + p * (groundY - horizonY); }
  function projScale(p) { return 0.12 + p * 0.9; }

  function spawnWave() {
    const g = game;
    const laneChoices = [...CONFIG.LANES];
    const roll = Math.random();
    const kinds = ["car", "car", "suv", "bus", "moto", "pothole", "cone", "barrier", "fuel", "bonus"];
    let type = kinds[Math.floor(Math.random() * kinds.length)];

    // occasional power-up
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

    // traffic: leave at least one lane free among simultaneous spawns
    const blockedLanes = new Set(g.traffic.filter((t) => t.p < 0.25).map((t) => t.lane));
    const free = laneChoices.filter((l) => !blockedLanes.has(l));
    const lane = free.length ? free[Math.floor(Math.random() * free.length)] : laneChoices[Math.floor(Math.random() * 3)];
    const speedMul = type === "bus" ? 0.7 : type === "moto" ? 1.25 : 0.95 + Math.random() * 0.2;
    g.traffic.push({ lane, p: 0.02, kind: type, speedMul });
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

  /* =========================== UPDATE =========================== */

  function update(dt) {
    const g = game;
    g.time += dt;
    g.dayTimer += dt;
    g.shake = Math.max(0, g.shake - dt * 3);

    // score
    const scoreMul = g.combo * (g.player.boost > 0 ? 1.5 : 1);
    g.score += CONFIG.SCORE_PER_SEC * dt * scoreMul;

    // difficulty
    g.difficultyTimer += dt;
    if (g.difficultyTimer >= CONFIG.DIFFICULTY_TICK) {
      g.difficultyTimer = 0;
      g.speed = Math.min(CONFIG.MAX_SPEED, g.speed + CONFIG.SPEED_RAMP);
      g.spawnInterval = Math.max(CONFIG.SPAWN_MIN, g.spawnInterval - 0.06);
    }

    // weather
    g.weatherTimer -= dt;
    if (g.weatherTimer <= 0) {
      g.raining = !g.raining;
      g.weatherTimer = g.raining ? 8 + Math.random() * 6 : 16 + Math.random() * 14;
    }
    if (g.raining && !reducedMotion) {
      g.rainTimer -= dt;
      if (g.rainTimer <= 0) {
        g.rainTimer = 0.01;
        g.rain.push({ x: Math.random() * W, y: -10, speed: 700 + Math.random() * 300 });
      }
    }
    g.rain.forEach((r) => { r.y += r.speed * dt; });
    g.rain = g.rain.filter((r) => r.y < H + 20);

    // player
    const p = g.player;
    const targetX = laneX(p.lane, 1);
    if (p._x === undefined) p._x = targetX;
    p._x += (targetX - p._x) * Math.min(1, dt * CONFIG.LANE_LERP);

    if (p.jumping) {
      p.jumpT += dt / CONFIG.JUMP_TIME;
      if (p.jumpT >= 1) { p.jumping = false; p.jumpT = 0; p.anim = "RUN"; }
    }
    p.invincible = Math.max(0, p.invincible - dt);
    p.crashFlash = Math.max(0, p.crashFlash - dt * 2);
    p.animT += dt;

    if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
    if (p.magnet > 0) p.magnet = Math.max(0, p.magnet - dt);
    if (p.powerTimeLeft > 0) {
      p.powerTimeLeft -= dt;
      if (p.powerTimeLeft <= 0) {
        p.activePowerName = null;
        p.shield = false;
      }
    }

    const speed = g.speed * (p.boost > 0 ? 1.7 : 1);

    // spawn
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnWave();
      g.spawnTimer = g.spawnInterval * (0.8 + Math.random() * 0.5);
    }

    // advance entities
    g.traffic.forEach((t) => { t.p += speed * dt * t.speedMul; });
    g.obstacles.forEach((o) => { o.p += speed * dt; });
    g.collectibles.forEach((c) => { c.p += speed * dt; c.bob += dt * 4; });
    g.powerups.forEach((u) => { u.p += speed * dt; u.bob += dt * 4; });

    // magnet attraction
    if (p.magnet > 0) {
      g.collectibles.forEach((c) => {
        if (c.p > 0.55 && c.p < 0.95) c.lane = p.lane;
      });
    }

    // collision zone
    const inZone = (e) => e.p > 0.82 && e.p < 0.98;

    if (p.invincible <= 0) {
      for (const t of g.traffic) {
        if (inZone(t) && t.lane === p.lane && !p.jumping) { onCrash(); break; }
      }
      for (const o of g.obstacles) {
        if (inZone(o) && o.lane === p.lane) {
          const jumpable = o.kind === "pothole";
          if (!(jumpable && p.jumping)) { onCrash(); break; }
        }
      }
    }

    // pickups
    g.collectibles = g.collectibles.filter((c) => {
      if (inZone(c) && c.lane === p.lane) {
        collectPickup(c);
        return false;
      }
      return c.p < 1.15;
    });
    g.powerups = g.powerups.filter((u) => {
      if (inZone(u) && u.lane === p.lane) {
        collectPowerup(u);
        return false;
      }
      return u.p < 1.15;
    });

    g.traffic = g.traffic.filter((t) => t.p < 1.2);
    g.obstacles = g.obstacles.filter((o) => o.p < 1.15);

    // particles
    g.particles.forEach((pt) => {
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 300 * dt;
    });
    g.particles = g.particles.filter((pt) => pt.t < pt.life);

    // ambient dust while riding
    if (!reducedMotion && Math.random() < 0.35) {
      spawnParticles(p._x + (Math.random() - 0.5) * 20, groundY + 6, 1, "rgba(180,150,110,0.5)", 40, 0.5);
    }

    updateHudLive();
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
      p.shield = false;
      p.activePowerName = null;
      p.powerTimeLeft = 0;
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
    game.shake = 1;
    p.anim = "CRASH";
    spawnParticles(p._x, projY(0.9), 24, "#ff6a4d", 220, 0.6);
    renderLives();
    if (game.lives <= 0) {
      setTimeout(() => endGame(), 250);
    }
  }

  /* =========================== TIME OF DAY / SKY =========================== */

  function dayPhase() {
    const t = (game ? game.dayTimer : 0) % CONFIG.DAY_CYCLE;
    const f = t / CONFIG.DAY_CYCLE; // 0..1
    // 0-0.55 day, 0.55-0.75 sunset, 0.75-1 night (loops back to day)
    if (f < 0.55) return { phase: "day", mix: f / 0.55 };
    if (f < 0.75) return { phase: "sunset", mix: (f - 0.55) / 0.2 };
    return { phase: "night", mix: (f - 0.75) / 0.25 };
  }

  function lerpColor(c1, c2, t) {
    const a = c1.match(/\d+/g).map(Number);
    const b = c2.match(/\d+/g).map(Number);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function skyColors() {
    const { phase, mix } = dayPhase();
    const palettes = {
      day: ["rgb(120,180,240)", "rgb(210,235,250)"],
      sunset: ["rgb(255,140,90)", "rgb(255,205,140)"],
      night: ["rgb(10,16,40)", "rgb(30,36,64)"],
    };
    if (phase === "day") return palettes.day;
    if (phase === "sunset") {
      return [lerpColor(palettes.day[0], palettes.sunset[0], mix), lerpColor(palettes.day[1], palettes.sunset[1], mix)];
    }
    return [lerpColor(palettes.sunset[0], palettes.night[0], mix), lerpColor(palettes.sunset[1], palettes.night[1], mix)];
  }

  function isNight() {
    const { phase, mix } = dayPhase();
    return phase === "night" && mix > 0.15;
  }

  /* =========================== RENDER =========================== */

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (game && game.shake > 0 && !reducedMotion) {
      const s = game.shake * 6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    drawSky();
    drawSkyline();
    drawGround();
    drawRoad();
    if (game) {
      drawShadowsAndEntities();
      drawParticles();
      if (game.raining) drawRain();
    }
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

    // sun / moon
    const night = isNight();
    const { phase, mix } = dayPhase();
    let cx = W * (0.2 + 0.6 * Math.min(1, (game ? game.dayTimer % CONFIG.DAY_CYCLE : 0) / (CONFIG.DAY_CYCLE * 0.75)));
    let cy = horizonY * (0.35 + 0.4 * Math.sin(Math.PI * Math.min(1, (game ? game.dayTimer % CONFIG.DAY_CYCLE : 0) / (CONFIG.DAY_CYCLE * 0.75))));
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
      ctx.globalAlpha = Math.min(1, mix * 2);
      // stars
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97) % W;
        const sy = (i * 53) % Math.floor(horizonY * 0.8);
        ctx.globalAlpha = (0.3 + ((i * 37) % 10) / 20) * Math.min(1, mix * 2);
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.restore();
    }
  }

  function drawSkyline() {
    const night = isNight();
    ctx.save();
    // distant hills
    ctx.fillStyle = "rgba(70,90,80,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= W; x += 40) {
      ctx.lineTo(x, horizonY - 14 - 10 * Math.sin(x * 0.01 + 2));
    }
    ctx.lineTo(W, horizonY);
    ctx.closePath();
    ctx.fill();

    // city buildings silhouette
    const seed = 12345;
    let rx = 0;
    let i = 0;
    while (rx < W) {
      const bw = 30 + ((seed * (i + 1)) % 40);
      const bh = 24 + ((seed * (i + 3)) % 70);
      const bx = rx;
      const by = horizonY - bh;
      ctx.fillStyle = night ? "rgba(20,26,46,0.9)" : "rgba(60,70,90,0.55)";
      ctx.fillRect(bx, by, bw - 4, bh);
      if (night) {
        ctx.fillStyle = "rgba(255,210,120,0.85)";
        for (let wy = by + 6; wy < horizonY - 6; wy += 9) {
          for (let wx = bx + 4; wx < bx + bw - 8; wx += 8) {
            if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 3, 3);
          }
        }
      }
      rx += bw;
      i++;
    }
    ctx.restore();
  }

  function drawGround() {
    const night = isNight();
    ctx.fillStyle = night ? "#0b0f14" : "#3a4a34";
    ctx.fillRect(0, horizonY, W, groundY - horizonY + 60);
    ctx.fillStyle = night ? "#05070a" : "#28351f";
    ctx.fillRect(0, groundY, W, H - groundY);

    // roadside trees (midground) using simple lane sweep by p
    for (let p = 0.08; p < 1; p += 0.09) {
      const scale = projScale(p);
      const y = projY(p);
      const leftX = laneX(-1.9, p);
      const rightX = laneX(1.9, p);
      drawTree(leftX, y, scale, night);
      drawTree(rightX, y, scale, night);
    }
  }

  function drawTree(x, y, scale, night) {
    const h = 46 * scale;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = night ? "#231a12" : "#5b3a22";
    ctx.fillRect(x - 2 * scale, y - h * 0.35, 4 * scale, h * 0.35);
    ctx.beginPath();
    ctx.fillStyle = night ? "#16241a" : "#2f6b3a";
    ctx.arc(x, y - h * 0.55, h * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoad() {
    const night = isNight();
    ctx.save();
    // road trapezoid
    const bx = laneX(-1.55, 1), bx2 = laneX(1.55, 1);
    const tx = laneX(-1.55, 0.02), tx2 = laneX(1.55, 0.02);
    const grad = ctx.createLinearGradient(0, horizonY, 0, groundY + 40);
    grad.addColorStop(0, night ? "#1a1d22" : "#4a4d52");
    grad.addColorStop(1, night ? "#101215" : "#2c2e33");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(tx, horizonY);
    ctx.lineTo(tx2, horizonY);
    ctx.lineTo(bx2, groundY + 40);
    ctx.lineTo(bx, groundY + 40);
    ctx.closePath();
    ctx.fill();

    // road texture patches
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 8; i++) {
      const p = (i / 8 + (game ? game.time * 0.05 : 0)) % 1;
      const y = projY(p);
      const s = projScale(p);
      ctx.beginPath();
      ctx.ellipse(roadCenterX + (i % 3 - 1) * 40 * s, y, 30 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // lane lines (dashed, animated)
    const scroll = game ? (game.time * game.speed * 2.2) % 1 : 0;
    ctx.strokeStyle = night ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)";
    [-0.5, 0.5].forEach((laneOffset) => {
      for (let i = 0; i < 14; i++) {
        const p0 = (i / 14 + scroll) % 1;
        const p1 = Math.min(1, p0 + 0.03);
        if (p1 <= p0) continue;
        const y0 = projY(p0), y1 = projY(p1);
        const x0 = laneX(laneOffset * 2, p0), x1 = laneX(laneOffset * 2, p1);
        ctx.lineWidth = 2 + p0 * 6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    });

    // road edges
    ctx.strokeStyle = night ? "rgba(255,200,120,0.5)" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(bx, groundY + 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx2, horizonY); ctx.lineTo(bx2, groundY + 40); ctx.stroke();

    // streetlights
    for (let p = 0.05; p < 1; p += 0.22) {
      const scale = projScale(p);
      const y = projY(p);
      const x = laneX(-1.75, p);
      ctx.fillStyle = "#1c1c1c";
      ctx.fillRect(x - 1.5 * scale, y - 40 * scale, 3 * scale, 40 * scale);
      if (night) {
        const glow = ctx.createRadialGradient(x, y - 40 * scale, 1, x, y - 40 * scale, 40 * scale);
        glow.addColorStop(0, "rgba(255,220,150,0.9)");
        glow.addColorStop(1, "rgba(255,220,150,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y - 40 * scale, 40 * scale, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#333";
        ctx.beginPath(); ctx.arc(x, y - 40 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawShadowsAndEntities() {
    const g = game;
    const items = [];
    g.traffic.forEach((t) => items.push({ ...t, type: "traffic" }));
    g.obstacles.forEach((o) => items.push({ ...o, type: "obstacle" }));
    g.collectibles.forEach((c) => items.push({ ...c, type: "collectible" }));
    g.powerups.forEach((u) => items.push({ ...u, type: "powerup" }));
    items.sort((a, b) => a.p - b.p); // far to near

    items.forEach((it) => {
      const p = Math.min(1, it.p);
      const scale = projScale(p);
      const x = laneX(it.lane, p);
      const y = projY(p);
      if (it.type === "traffic") drawVehicle(x, y, scale, it.kind);
      else if (it.type === "obstacle") drawObstacle(x, y, scale, it.kind);
      else if (it.type === "collectible") drawCollectible(x, y, scale, it.kind, it.bob);
      else if (it.type === "powerup") drawPowerupIcon(x, y, scale, it.kind, it.bob);
    });

    drawPlayer();
  }

  function drawVehicle(x, y, scale, kind) {
    const night = isNight();
    const w = (kind === "bus" ? 74 : kind === "suv" ? 60 : kind === "moto" ? 30 : 56) * scale;
    const h = (kind === "bus" ? 46 : kind === "moto" ? 30 : 34) * scale;
    ctx.save();
    ctx.translate(x, y);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.42, w * 0.5, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();

    const bodyColor = { car: "#c0392b", suv: "#2d6cdf", bus: "#e0a52d", moto: "#444" }[kind] || "#888";
    ctx.fillStyle = bodyColor;
    roundRect(-w / 2, -h * 0.7, w, h * 0.7, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "rgba(200,230,255,0.75)";
    roundRect(-w * 0.36, -h * 0.62, w * 0.72, h * 0.28, 4 * scale);
    ctx.fill();
    // wheels
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(-w * 0.32, h * 0.05, h * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.32, h * 0.05, h * 0.16, 0, Math.PI * 2); ctx.fill();
    // lights
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
    let rot = (Math.PI / 2) * 3;
    let x = cx, y = cy;
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
    glow.addColorStop(0, c + "");
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* --------- Player (human rider + motorcycle) --------- */

  function drawPlayer() {
    const g = game, p = g.player;
    const scale = 1.05;
    const x = p._x !== undefined ? p._x : roadCenterX;
    let y = groundY - 6;
    const night = isNight();

    let jumpOffset = 0;
    if (p.jumping) {
      jumpOffset = Math.sin(Math.PI * p.jumpT) * CONFIG.JUMP_HEIGHT;
    }
    const bodyY = y - jumpOffset;

    // shield aura
    if (p.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(g.time * 6) * 0.15;
      const glow = ctx.createRadialGradient(x, bodyY - 40, 2, x, bodyY - 40, 60);
      glow.addColorStop(0, "rgba(79,209,255,0.5)");
      glow.addColorStop(1, "rgba(79,209,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, bodyY - 40, 60, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // boost trail
    if (p.boost > 0 && !reducedMotion) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      const trail = ctx.createLinearGradient(x, bodyY, x, bodyY + 60);
      trail.addColorStop(0, "rgba(255,170,60,0.5)");
      trail.addColorStop(1, "rgba(255,170,60,0)");
      ctx.fillStyle = trail;
      ctx.fillRect(x - 18, bodyY, 36, 60);
      ctx.restore();
    }
    // headlight cone at night
    if (night) {
      ctx.save();
      const cone = ctx.createRadialGradient(x, bodyY - 50, 4, x, bodyY - 260, 140);
      cone.addColorStop(0, "rgba(255,250,210,0.35)");
      cone.addColorStop(1, "rgba(255,250,210,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(x - 16, bodyY - 40);
      ctx.lineTo(x - 90, bodyY - 260);
      ctx.lineTo(x + 90, bodyY - 260);
      ctx.lineTo(x + 16, bodyY - 40);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // shadow on ground
    ctx.save();
    const squash = p.jumping ? Math.max(0.35, 1 - jumpOffset / CONFIG.JUMP_HEIGHT) : 1;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(x, y + 8, 34 * squash, 9 * squash, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const invBlink = p.invincible > 0 && Math.floor(g.time * 12) % 2 === 0;

    ctx.save();
    ctx.translate(x, bodyY);
    if (invBlink) ctx.globalAlpha = 0.4;
    const lean = (p.lane !== 0 ? p.lane * 0.12 : 0) + Math.sin(p.animT * 14) * (p.jumping ? 0 : 0.015);
    ctx.rotate(lean);

    drawMotorcycle(scale, g.time, p);
    drawRiderBody(scale, g.time, p);

    ctx.restore();
  }

  function drawMotorcycle(scale, t, p) {
    ctx.save();
    ctx.scale(scale, scale);
    const wheelSpin = (t * 900) % 360;

    // rear/front wheel
    [-24, 22].forEach((wx) => {
      ctx.save();
      ctx.translate(wx, 4);
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5;
      ctx.rotate((wheelSpin * Math.PI) / 180);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos((i / 5) * Math.PI * 2) * 13, Math.sin((i / 5) * Math.PI * 2) * 13);
        ctx.stroke();
      }
      ctx.restore();
    });

    // frame / body
    ctx.fillStyle = "#c0392b";
    roundRect(-26, -18, 50, 16, 5); ctx.fill();
    ctx.fillStyle = "#8e2a1f";
    roundRect(-10, -26, 22, 12, 4); ctx.fill(); // seat area
    // exhaust
    ctx.fillStyle = "#888";
    ctx.fillRect(-30, -6, 10, 6);
    // handlebar
    ctx.strokeStyle = "#222"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, -18); ctx.lineTo(28, -30); ctx.stroke();
    // headlight
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath(); ctx.arc(24, -20, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawRiderBody(scale, t, p) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-2, -30);

    const state = p.anim;
    const bob = state === "RUN" ? Math.sin(t * 10) * 1.5 : 0;
    const armSwing = Math.sin(t * 10) * (state === "CRASH" ? 0 : 0.35);
    const crash = state === "CRASH";

    ctx.save();
    ctx.translate(0, bob + (crash ? 4 : 0));
    if (crash) ctx.rotate(0.35);

    // torso
    ctx.fillStyle = "#2b3a55";
    roundRect(-8, -18, 16, 22, 5); ctx.fill();
    ctx.fillStyle = "#1f2a3f";
    roundRect(-8, -18, 16, 8, 4); ctx.fill();

    // arms
    ctx.strokeStyle = "#2b3a55"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-16 + armSwing * 6, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(16, -6 + (crash ? -6 : 0)); ctx.stroke();
    ctx.fillStyle = "#e8b98a";
    ctx.beginPath(); ctx.arc(-16 + armSwing * 6, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, -6 + (crash ? -6 : 0), 3, 0, Math.PI * 2); ctx.fill();

    // legs
    ctx.strokeStyle = "#1a2233"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-14, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(12, 14); ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.fillRect(-18, 12, 8, 5);
    ctx.fillRect(9, 12, 8, 5);

    // neck + head
    ctx.fillStyle = "#e8b98a";
    ctx.fillRect(-3, -22, 6, 6);
    ctx.beginPath(); ctx.arc(0, -28, 8, 0, Math.PI * 2); ctx.fill();
    // helmet
    ctx.fillStyle = "#ffb347";
    ctx.beginPath(); ctx.arc(0, -29, 9, Math.PI, 0); ctx.fill();
    ctx.fillRect(-9, -29, 18, 4);
    ctx.fillStyle = "rgba(30,40,60,0.85)";
    ctx.beginPath(); ctx.ellipse(2, -27, 5, 4, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  /* --------- particles / rain / vignette --------- */

  function drawParticles() {
    game.particles.forEach((pt) => {
      const a = Math.max(0, 1 - pt.t / pt.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawRain() {
    ctx.save();
    ctx.strokeStyle = "rgba(180,200,230,0.5)";
    ctx.lineWidth = 1.4;
    game.rain.forEach((r) => {
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 4, r.y + 14);
      ctx.stroke();
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

    if (appState === STATE.READY) {
      readyTimer += dt;
      const text = el("ready-text");
      if (readyTimer < 0.8) text.textContent = "READY";
      else if (readyTimer < 1.5) text.textContent = "3";
      else if (readyTimer < 2.2) text.textContent = "2";
      else if (readyTimer < 2.9) text.textContent = "1";
      else if (readyTimer < 3.4) text.textContent = "GO!";
      else { beginPlaying(); }
    } else if (appState === STATE.PLAYING) {
      update(dt);
    }

    if (game) render();
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
      navigator.clipboard.writeText(text).then(() => {
        openShareDialog(text, "Copied to clipboard!");
      }).catch(() => openShareDialog(text, ""));
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

    el("btn-sound").addEventListener("click", () => {
      soundOn = !soundOn;
      storage.set(CONFIG.SOUND_KEY, soundOn);
      el("btn-sound").textContent = soundOn ? "🔊" : "🔇";
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

    // prevent page scroll on touch
    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  }

  wireUI();
  goMenu();

  // --- DAVONIUM AD PLACEHOLDER ---
  // Future AdMob / AdSense integration can be added here.

})();

