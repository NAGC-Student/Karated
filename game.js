(() => {
  "use strict";
  const canvas = document.querySelector("canvas#game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, floorY = 438;
  const $ = id => document.getElementById(id);
  const keys = new Set();
  const gameShell = document.querySelector(".game-shell");
  const STORAGE_BEST = "karateka-reborn-best";
  const STORAGE_MUTED = "karateka-reborn-muted";

  /* ---------- sprites ---------- */
  // Todos os sprites já estão desenhados no sentido certo: herói olha para a DIREITA,
  // guardas, Akuma e Mariko olham para a ESQUERDA. Por isso nunca é preciso espelhar.
  const spriteCache = new Map();
  const spriteCounts = {
    hero:  { stance:5, walk:10, run:10, reverence:3, victory:2, punch:11, kick:5, death:5 },
    enemy: { stance:5, walk:10, run:10, reverence:3, punch:11, kick:5, death:5 },
    akuma: { pose:3, stance:1, walk:11, punch:3, kick:5, death:5 },
    mariko:{ wait:2, stand:1 }
  };
  function spriteFrame(who, anim, index) {
    const count = spriteCounts[who]?.[anim] || 1;
    const frame = ((index % count) + count) % count;
    const key = `${who}_${anim}_${String(frame).padStart(2,"0")}`;
    if (!spriteCache.has(key)) {
      const image = new Image();
      image.src = `assets/sprites/${key}.png`;
      spriteCache.set(key, image);
    }
    return spriteCache.get(key);
  }
  // pré-carrega tudo para nunca haver quadro invisível no primeiro uso
  for (const who in spriteCounts) for (const anim in spriteCounts[who])
    for (let i = 0; i < spriteCounts[who][anim]; i++) spriteFrame(who, anim, i);

  /* ---------- arte original extraída de CASTLE.BCG (disco IBM, 1986) ---------- */
  // A imagem é tingida uma única vez em um canvas fora de tela para virar
  // uma silhueta sépia discreta no horizonte, sem pesar no loop.
  const castleImage = new Image();
  const castleLayer = document.createElement("canvas");
  castleLayer.width = 320; castleLayer.height = 192;
  let castleReady = false;
  castleImage.addEventListener("load", () => {
    const c = castleLayer.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(castleImage, 0, 0, 320, 192);
    try {
      c.globalCompositeOperation = "saturation";
      c.fillStyle = "#808080"; c.fillRect(0, 0, 320, 192);
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = "rgba(196,161,101,.5)"; c.fillRect(0, 0, 320, 192);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "rgba(12,11,9,.35)"; c.fillRect(0, 0, 320, 192);
    } catch (_) { /* se o blend não existir, a arte original continua válida */ }
    castleReady = true;
  });
  castleImage.src = "assets/original/CASTLE.png";

  /* ---------- cenários originais reconstruídos dos scripts do disco ---------- */
  // FUJI.BCG (64×192) e composições de cenário dos bancos KSI/KS (CAL00/03/04/07).
  // São desenhados como camadas de fundo; os personagens continuam sendo os sprites do port.
  const originalScene = {};
  for (const [key, file] of Object.entries({
    fuji: "assets/original/FUJI.png",
    hall: "assets/original/PALACE_HALL.png",
    stairs: "assets/original/PALACE_STAIRS.png",
    door: "assets/original/PALACE_DOOR.png",
    corridor: "assets/original/PALACE_CORRIDOR.png"
  })) {
    const img = new Image();
    img.src = file;
    originalScene[key] = img;
  }
  const sceneReady = key => {
    const img = originalScene[key];
    return !!(img && img.complete && img.naturalWidth);
  };


  /* ---------- efeitos sonoros procedurais (sem arquivos externos) ---------- */
  let audioCtx = null;
  function audio() {
    if (game.muted) return null;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (_) { return null; }
  }
  function tone(freq, dur, type = "square", vol = .06, slide = 0, delay = 0) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur + .03);
  }
  let noiseBuffer = null;
  function noise(dur = .12, vol = .05, freq = 1200, delay = 0) {
    const ac = audio();
    if (!ac) return;
    if (!noiseBuffer) {
      noiseBuffer = ac.createBuffer(1, Math.floor(ac.sampleRate * .4), ac.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer;
    const filter = ac.createBiquadFilter(); filter.type = "bandpass";
    filter.frequency.value = freq; filter.Q.value = .9;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(t0); src.stop(t0 + dur + .02);
  }
  function sfx(name) {
    if (game.muted) return;
    switch (name) {
      case "punch": tone(190, .07, "triangle", .05, -90); noise(.05, .025, 1800); break;
      case "kick": tone(130, .12, "sawtooth", .055, -70); noise(.08, .03, 900); break;
      case "hit": tone(95, .1, "square", .06, -45); noise(.1, .07, 700); break;
      case "block": tone(520, .05, "square", .04); tone(780, .04, "triangle", .03, 0, .02); break;
      case "whiff": noise(.07, .02, 2400); break;
      case "falcon": tone(950, .18, "sawtooth", .05, -420); break;
      case "gate": noise(.55, .1, 220); tone(70, .5, "sawtooth", .05, -25); break;
      case "death": tone(240, .55, "triangle", .07, -190); noise(.3, .04, 300); break;
      case "clear": [392, 523, 659].forEach((f, i) => tone(f, .16, "triangle", .045, 0, i * .09)); break;
      case "victory": [392, 494, 587, 784, 988].forEach((f, i) => tone(f, .22, "triangle", .05, 0, i * .12)); break;
      case "start": [196, 262, 392].forEach((f, i) => tone(f, .2, "triangle", .045, 0, i * .1)); break;
      case "pause": tone(440, .07, "square", .03); break;
    }
  }

  function readStore(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* modo privado */ }
  }

  /* ---------- etapas (jornada contínua dentro da fortaleza) ---------- */
  const stages = [
    { name:"O PENHASCO", sub:"Os guardas de Akuma vigiam o caminho até a fortaleza.", bg:"cliff", type:"fight",
      foe:{ who:"enemy", hp:60, dmg:8,  think:[1.5,.8], kick:.20, speed:38 } },
    { name:"O PÁTIO EXTERNO", sub:"O portão de ferro cai de repente. Corra (SHIFT) para passar a tempo!", bg:"courtyard", type:"fight", gate:true,
      foe:{ who:"enemy", hp:75, dmg:10, think:[1.3,.7], kick:.25, speed:42, x:470 } },
    { name:"A MURALHA", sub:"A fortaleza de Akuma ergue-se sobre você. Outro guarda bloqueia a passagem.", bg:"rampart", type:"fight",
      foe:{ who:"enemy", hp:82, dmg:9,  think:[1.25,.65], kick:.26, speed:45 } },
    { name:"O PÁTIO INTERNO", sub:"Colunas originais do castelo escondem guardas à espreita.", bg:"hall", type:"fight",
      foe:{ who:"enemy", hp:92, dmg:10, think:[1.15,.6], kick:.28, speed:48 } },
    { name:"O PALÁCIO", sub:"Corredores fechados e guardas mais ágeis.", bg:"door", type:"fight",
      foe:{ who:"enemy", hp:102, dmg:11, think:[1.05,.55], kick:.30, speed:52 } },
    { name:"A ESCADARIA", sub:"A escada original leva ao salão. Não deixe o guarda encurralar você.", bg:"stairs", type:"fight",
      foe:{ who:"enemy", hp:112, dmg:12, think:[.98,.5], kick:.32, speed:55 } },
    { name:"O SALÃO INTERNO", sub:"Os guardas de elite atacam sem hesitar.", bg:"corridor", type:"fight",
      foe:{ who:"enemy", hp:122, dmg:13, think:[.9,.45], kick:.35, speed:58 } },
    { name:"O FALCÃO", sub:"O pássaro de Akuma ataca do alto. Rebata cada mergulho no momento exato!", bg:"courtyard", type:"falcon" },
    { name:"A SALA DO TRONO", sub:"Akuma espera por você.", bg:"throne", type:"fight",
      foe:{ who:"akuma", hp:155, dmg:14, think:[.85,.45], kick:.35, speed:58 } },
    { name:"A PRISÃO", sub:"Mariko aguarda. Ela não reconhece um guerreiro em postura de luta.", bg:"prison", type:"mariko" }
  ];

  (function buildStageDots() {
    const box = $("stageDots");
    if (!box) return;
    for (let i = 0; i < stages.length; i++) box.appendChild(document.createElement("i"));
  })();

  const game = {
    state:"menu", last:0, time:0, stage:0, score:0, best:0, muted:false, message:"", messageTimer:0, shake:0,
    player:null, foe:null, falcon:null, gate:null, mariko:null, particles:[],
    cleared:false, timer:0, fade:0, endTimer:0, victoryLock:0,
    attackBuffer:null, deathTimer:0, lastHitFatal:false, hitReason:"", statusBeforePause:""
  };

  function loadStored() {
    game.best = Math.max(0, parseInt(readStore(STORAGE_BEST, "0"), 10) || 0);
    game.muted = readStore(STORAGE_MUTED, "0") === "1";
  }
  function saveBest() {
    if (game.score > game.best) game.best = game.score;
    writeStore(STORAGE_BEST, game.best);
  }

  function fighter(who, x, cfg) {
    const maxHp = cfg?.hp || 100;
    return { who, player:who==="hero", x, y:floorY, hp:maxHp, maxHp, cfg, action:"idle",
      actionTime:0, attackCooldown:0, hitFlash:0, block:false, running:false, lock:0,
      sinceHit:99, defeated:false, aiTimer:1.1, attackDone:false, anim:"stance", animTime:0,
      animDur:0, attackType:"punch", bowTimer:0, stun:0 };
  }

  /* ---------- fluxo de etapas ---------- */
  function setupStage(i) {
    game.stage = i;
    const st = stages[i];
    game.cleared = false; game.foe = null; game.falcon = null; game.gate = null; game.mariko = null;
    game.victoryLock = 0; game.endTimer = 0; game.particles = []; game.shake = 0;
    game.attackBuffer = null; game.lastHitFatal = false; game.hitReason = "";
    game.message = ""; game.messageTimer = 0;
    const p = game.player || fighter("hero", 110);
    p.x = 110; p.action = "idle"; p.anim = "stance"; p.animTime = 0; p.block = false; p.running = false;
    p.actionTime = 0; p.attackCooldown = 0; p.bowTimer = 0; p.lock = 0; p.stun = 0; p.attackDone = true;
    if (p.hp <= 0) p.hp = p.maxHp;
    game.player = p;
    if (st.type === "fight") game.foe = fighter(st.foe.who, st.foe.x || 675, st.foe);
    if (st.type === "falcon") game.falcon = { x:W+60, y:110, state:"enter", t:0, hp:3, maxHp:3, tx:0, sx:0, sy:0, cool:1.4, flash:0, flap:0 };
    if (st.type === "mariko") game.mariko = { x:790, state:"wait", t:0, hinted:false };
    if (st.gate) game.gate = { x:740, state:"open", t:0 };
    $("stageTitle").textContent = `ETAPA ${String(i+1).padStart(2,"0")} — ${st.name}`;
    updateHud();
  }
  function loadStage(i) {
    setupStage(i);
    game.state = "intro"; game.timer = 2.6; game.fade = 1;
  }
  function startFade() { game.state = "fade"; game.fade = 0; }
  function startGame() {
    if (!["menu","gameover","victory"].includes(game.state)) return;
    audio(); sfx("start");
    game.score = 0; game.particles = []; game.player = null; game.time = 0;
    game.attackBuffer = null; game.deathTimer = 0; game.lastHitFatal = false; game.hitReason = "";
    $("overlay").classList.add("hidden");
    $("startBtn").blur();
    $("gameStatus").textContent = "JORNADA EM ANDAMENTO";
    setupStage(0); loadStage(0);
    updatePauseButton(); updateScoreLine();
  }
  function showOverlay(title, text, button, record = "") {
    $("overlayTitle").innerHTML = title;
    $("overlayText").textContent = text;
    const rec = $("overlayRecord");
    if (rec) { rec.textContent = record; rec.style.display = record ? "" : "none"; }
    $("startBtn").textContent = button;
    $("overlay").classList.remove("hidden");
    updatePauseButton();
  }
  function killPlayer(reason) {
    if (game.state === "dying" || game.state === "gameover") return;
    const p = game.player;
    if (!p) return;
    p.hp = 0; p.action = "fall"; p.anim = "death"; p.animTime = 0; p.attackDone = true;
    game.hitReason = reason;
    game.deathTimer = 1.35;
    game.state = "dying";
    game.attackBuffer = null;
    $("gameStatus").textContent = "FIM DE JOGO";
    updateHud(); sfx("death");
  }
  function finishDeath() {
    saveBest();
    game.state = "gameover";
    showOverlay("O GUERREIRO<br>CAIU", game.hitReason || "Você foi derrotado.", "TENTAR NOVAMENTE",
      `PONTUAÇÃO ${String(game.score).padStart(6,"0")} · RECORDE ${String(game.best).padStart(6,"0")}`);
  }
  function updateHud() {
    const p = game.player, st = stages[game.stage];
    if (!p || !st) return;
    $("playerHealth").style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
    $("playerHealthText").textContent = Math.ceil(p.hp);
    if (st.type === "mariko") {
      $("enemyHealth").style.width = "0%";
      $("enemyHealthText").textContent = "—";
    } else if (st.type === "falcon") {
      const f = game.falcon;
      $("enemyHealth").style.width = `${f ? Math.max(0, f.hp / f.maxHp * 100) : 0}%`;
      $("enemyHealthText").textContent = f ? `${Math.ceil(f.hp)}/${f.maxHp}` : "—";
    } else {
      const foe = game.foe;
      $("enemyHealth").style.width = `${foe ? Math.max(0, foe.hp / foe.maxHp * 100) : 0}%`;
      $("enemyHealthText").textContent = foe ? `${Math.ceil(foe.hp / foe.maxHp * 100)}` : "—";
    }
    $("enemyLabel").textContent = st.type === "falcon" ? "FALCÃO" : st.type === "mariko" ? "MARIKO"
      : st.foe?.who === "akuma" ? "AKUMA" : "GUARDA";
    $("stageNum").textContent = `${game.stage + 1}/${stages.length}`;
    $("stageName").textContent = st.name;
    const dots = $("stageDots")?.children;
    if (dots) for (let i = 0; i < dots.length; i++) dots[i].className = i < game.stage ? "done" : i === game.stage ? "active" : "";
    updateScoreLine(); updatePauseButton();
  }
  function updateScoreLine() {
    const el = $("scoreLine");
    if (el) el.textContent = `PONTOS ${String(game.score).padStart(6,"0")} · RECORDE ${String(game.best).padStart(6,"0")}`;
  }
  function addScore(points) {
    game.score += points;
    if (game.score > game.best) game.best = game.score;
    updateScoreLine();
  }
  function setMessage(text) { game.message = text; game.messageTimer = 0.8; }
  function burst(x, y, color) {
    for (let i = 0; i < 9; i++) game.particles.push({ x, y, vx:(Math.random()-.5)*190, vy:(Math.random()-.8)*160, life:.35+Math.random()*.25, color });
  }

  /* ---------- combate ---------- */
  function requestAttack(type = "punch") {
    const p = game.player;
    if (!p || game.state !== "playing") return;
    if (p.attackCooldown > 0 || p.action === "attack") {
      game.attackBuffer = { type, t: .16 };
      return;
    }
    attack(p, type);
  }
  function attack(p, type = "punch") {
    if (game.state !== "playing" || p.attackCooldown > 0 || p.hp <= 0 || p.lock > 0 || p.bowTimer > 0) return;
    if (game.mariko) return;
    // como no original: correndo você não luta; é preciso voltar à postura de combate
    if (p.running) { setMessage("PARE DE CORRER PARA LUTAR"); return; }
    p.action = "attack"; p.attackType = type;
    p.actionTime = type === "kick" ? .43 : .34;
    p.attackCooldown = type === "kick" ? .62 : .43;
    p.attackDone = false; p.block = false; p.anim = type; p.animTime = 0; p.animDur = p.actionTime;
    game.attackBuffer = null;
    sfx(type === "kick" ? "kick" : "punch");
  }
  function damage(target, amount, fatal = false) {
    target.hp = Math.max(0, target.hp - amount);
    target.hitFlash = .14; target.sinceHit = 0;
    if (!target.player) target.stun = .12;
    if (target.player) game.lastHitFatal = fatal;
    burst(target.x, target.y - 80, "#e6c27c");
    game.shake = Math.max(game.shake, 5);
    sfx("hit");
  }
  function playerAttackCheck() {
    const p = game.player, e = game.foe, f = game.falcon;
    if (p.action !== "attack" || p.attackDone || p.actionTime > (p.attackType === "kick" ? .23 : .18)) return;
    p.attackDone = true;
    if (e && !e.defeated && e.hp > 0 && Math.abs(p.x - e.x) < 116) {
      damage(e, p.attackType === "kick" ? 17 : 12);
      addScore(100); setMessage("GOLPE PRECISO!");
    } else if (f && f.state === "dive" && Math.abs(p.x - f.x) < 170 && f.y > floorY - 230) {
      f.hp--; f.flash = .3; f.state = f.hp > 0 ? "retreat" : "flee"; f.t = 0;
      burst(f.x, f.y, "#e6c27c"); game.shake = 6; addScore(150); sfx("hit");
      setMessage(f.hp > 0 ? "REBATIDO!" : "O FALCÃO FUGIU!");
      if (f.hp <= 0) clear();
    } else setMessage("ERROU O ALCANCE");
    updateHud();
  }
  function clear() {
    game.cleared = true; game.victoryLock = 1.1; addScore(500); sfx("clear");
    // jornada mais longa: pequena recuperação entre etapas para continuar viável
    const p = game.player;
    if (p && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 25);
  }
  function enemyThink(dt) {
    const e = game.foe, p = game.player;
    if (!e || e.hp <= 0 || p.hp <= 0) return;
    const c = e.cfg;
    if (e.stun > 0) {
      if (e.action === "attack") { e.action = "idle"; e.attackDone = true; }
      e.anim = "stance"; e.animTime = 0;
      return;
    }
    e.aiTimer -= dt;
    if (e.action === "attack") {
      if (e.actionTime <= (e.attackType === "kick" ? .25 : .18) && !e.attackDone) {
        e.attackDone = true;
        if (Math.abs(e.x - p.x) < 112) {
          if (p.running) { damage(p, p.hp, true); setMessage("ATINGIDO CORRENDO!"); } // morte em um golpe
          else if (p.block) { setMessage("DEFESA!"); burst(p.x + 30, p.y - 65, "#a6c5b5"); sfx("block"); }
          else damage(p, c.dmg);
        }
      }
      if (e.actionTime <= 0) { e.action = "idle"; e.anim = "stance"; e.animTime = 0; }
      return;
    }
    const dx = Math.abs(e.x - p.x);
    if (e.aiTimer <= 0 && dx < 155) {
      e.action = "attack"; e.attackType = Math.random() < c.kick ? "kick" : "punch";
      e.anim = e.attackType; e.animTime = 0;
      e.actionTime = e.attackType === "kick" ? .58 : .48; e.animDur = e.actionTime;
      e.attackDone = false; e.aiTimer = c.think[0] + Math.random() * c.think[1];
      sfx(e.attackType === "kick" ? "kick" : "punch");
    } else if (dx > 110) {
      e.x -= Math.min(c.speed * dt, dx - 104);
      e.action = "walk";
      if (e.anim !== "walk") { e.anim = "walk"; e.animTime = 0; }
    } else if (e.action === "walk") { e.action = "idle"; e.anim = "stance"; e.animTime = 0; }
  }
  function falconThink(dt) {
    const f = game.falcon, p = game.player;
    if (!f) return;
    f.t += dt; f.flap += dt * 14; f.flash = Math.max(0, f.flash - dt);
    const hoverY = 105 + Math.sin(game.time * 3) * 12;
    if (f.state === "enter") {
      f.x -= 330 * dt; f.y = hoverY;
      if (f.x <= 700) { f.state = "hover"; f.t = 0; }
    } else if (f.state === "hover") {
      f.x = 640 + Math.sin(game.time * 1.4) * 190; f.y = hoverY;
      f.cool -= dt;
      if (f.cool <= 0 && p.hp > 0) { f.state = "warn"; f.t = 0; f.tx = p.x; f.sx = f.x; f.sy = f.y; sfx("falcon"); }
    } else if (f.state === "warn") {          // aviso: marca no chão onde ela vai mergulhar
      f.x = f.sx + Math.sin(f.t * 40) * 3;
      if (f.t >= .75) { f.state = "dive"; f.t = 0; }
    } else if (f.state === "dive") {
      const k = Math.min(1, f.t / .6);
      f.x = f.sx + (f.tx - f.sx) * k; f.y = f.sy + (floorY - 85 - f.sy) * k * k;
      if (k >= 1) {
        if (Math.abs(p.x - f.tx) < 75 && p.hp > 0) {
          if (p.running) { damage(p, p.hp, true); setMessage("ATINGIDO CORRENDO!"); }
          else if (p.block) { setMessage("DEFESA!"); burst(p.x + 30, p.y - 85, "#a6c5b5"); sfx("block"); }
          else damage(p, 14);
        }
        f.state = "retreat"; f.t = 0;
      }
    } else if (f.state === "retreat") {
      f.y += (hoverY - f.y) * Math.min(1, dt * 6);
      if (f.t >= .7) { f.state = "hover"; f.t = 0; f.cool = 1.3 + Math.random() * .9; }
    } else if (f.state === "flee") { f.x += 420 * dt; f.y -= 180 * dt; }
  }
  function gateThink(dt) {
    const g = game.gate, p = game.player;
    if (!g) return;
    if (g.state === "open" && game.cleared && p.x >= 560) {
      // pausa curta de aviso: dá tempo de segurar SHIFT + → antes do portão cair
      g.state = "warn"; g.t = 0; setMessage("CORRA! O PORTÃO ESTÁ CAINDO!"); sfx("gate");
    } else if (g.state === "warn") {
      g.t += dt;
      if (g.t >= .55) { g.state = "falling"; g.t = 0; }
    } else if (g.state === "falling") {
      g.t += dt;
      if (g.t >= .9) {
        g.state = "down"; g.t = .9;
        if (p.x < g.x + 20) killPlayer("O portão de ferro fechou antes de você passar.");
      }
    }
    if (g.state === "down" && game.state === "playing" && p.x < g.x + 40) p.x = g.x + 40;
  }
  function marikoThink(dt) {
    const m = game.mariko, p = game.player;
    if (!m) return;
    m.t += dt;
    if (m.state === "wait" && !m.hinted && p.x >= m.x - 270) {
      m.hinted = true;
      setMessage("APROXIME-SE CORRENDO (SHIFT)");
    }
    if (m.state === "wait" && p.x >= m.x - 150) {
      if (p.running) {                                           // chegou correndo, sem postura de luta
        m.state = "saved"; m.t = 0; p.bowTimer = 3; p.anim = "reverence"; p.animTime = 0; game.endTimer = 2.6;
        addScore(2000); sfx("clear");
      } else {                                                   // chegou em postura de luta
        m.state = "kick"; m.t = 0; setMessage("ELA ACHOU QUE VOCÊ ERA UM INIMIGO!");
        damage(p, p.hp); game.shake = 10; game.endTimer = 1.4;
      }
    } else if (m.state === "kick") {
      m.x = Math.max(p.x + 70, m.x - 220 * dt);
      game.endTimer -= dt;
      if (game.endTimer <= 0 && game.state === "playing") killPlayer("Mariko o nocauteou: não se aproxime dela em postura de luta.");
    } else if (m.state === "saved") {
      game.endTimer -= dt;
      if (game.endTimer <= 1.4 && p.anim === "reverence") { p.bowTimer = 0; p.anim = "victory"; p.animTime = 0; p.lock = 1.4; }
      if (game.endTimer <= 0 && game.state === "playing") {
        saveBest(); game.state = "victory"; $("gameStatus").textContent = "VITÓRIA"; sfx("victory");
        showOverlay("MARIKO<br><em>RESGATADA</em>", "Você atravessou a fortaleza de Akuma. A princesa está livre.",
          "JOGAR NOVAMENTE", `PONTUAÇÃO ${String(game.score).padStart(6,"0")} · RECORDE ${String(game.best).padStart(6,"0")}`);
      }
    }
  }

  /* ---------- atualização ---------- */
  function updateParticles(dt) {
    game.particles = game.particles.filter(a => a.life > 0);
    for (const a of game.particles) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.vy += 300 * dt; a.life -= dt;
    }
  }

  function update(dt) {
    if (game.state === "menu") {
      game.time += dt;
      if (game.player) { game.player.bowTimer = .65; game.player.animTime += dt; }
      return;
    }
    if (game.state === "paused") return;
    if (game.state === "dying") {
      game.time += dt * .35;
      game.deathTimer -= dt;
      const p = game.player;
      if (p) { p.animTime += dt; p.hitFlash = Math.max(0, p.hitFlash - dt); }
      game.shake = Math.max(0, game.shake - dt * 20);
      updateParticles(dt);
      if (game.deathTimer <= 0) finishDeath();
      return;
    }
    if (game.state === "intro") {
      game.timer -= dt; game.time += dt; game.fade = Math.max(0, game.fade - dt * 1.6);
      for (const f of [game.player, game.foe]) if (f) f.animTime += dt;
      if (game.timer <= 0) {
        game.state = "playing"; game.attackBuffer = null;
        if (game.stage === 0) { const p = game.player; p.bowTimer = .65; p.anim = "reverence"; p.animTime = 0; }
      }
      return;
    }
    if (game.state === "fade") {
      game.fade += dt * 2.2;
      if (game.fade >= 1) loadStage(game.stage + 1);
      return;
    }
    if (game.state !== "playing") return;
    game.time += dt;
    const p = game.player, e = game.foe;
    for (const f of [p, e]) {
      if (!f) continue;
      f.actionTime = Math.max(0, f.actionTime - dt);
      f.attackCooldown = Math.max(0, f.attackCooldown - dt);
      f.hitFlash = Math.max(0, f.hitFlash - dt);
      f.stun = Math.max(0, f.stun - dt);
      f.sinceHit += dt;
      // vida regenerativa: quem fica 3 s sem ser atingido se recupera aos poucos
      if (f.sinceHit > 3 && f.hp > 0 && f.hp < f.maxHp && !game.cleared) f.hp = Math.min(f.maxHp, f.hp + (f.player ? 5 : 3) * dt);
      f.animTime += dt;
    }
    if (game.victoryLock > 0) { game.victoryLock = Math.max(0, game.victoryLock - dt); p.lock = game.victoryLock; }
    else if (p.lock > 0) p.lock = Math.max(0, p.lock - dt);
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const moving = keys.has("ArrowLeft") || keys.has("ArrowRight");
    p.block = keys.has("ArrowDown") && p.action !== "attack" && p.lock <= 0 && p.bowTimer <= 0;
    p.running = sprint && moving && !p.block && p.action !== "attack" && p.bowTimer <= 0 && p.lock <= 0 && p.hp > 0;
    if (p.bowTimer > 0) p.bowTimer = Math.max(0, p.bowTimer - dt);

    // pequeno buffer de input: um soco/chute pedido no fim do cooldown ainda entra
    if (game.attackBuffer) {
      game.attackBuffer.t -= dt;
      if (game.attackBuffer.t <= 0) game.attackBuffer = null;
      else if (p.attackCooldown <= 0 && p.action !== "attack" && p.lock <= 0 && p.bowTimer <= 0 && !p.running && !p.block) {
        const type = game.attackBuffer.type; game.attackBuffer = null; attack(p, type);
      }
    }

    const gateWarn = game.gate && game.gate.state === "warn";
    const frozen = p.bowTimer > 0 || p.lock > 0 || gateWarn || (game.mariko && game.mariko.state !== "wait");
    if (p.hp > 0 && !p.block && p.action !== "attack" && !frozen) {
      const speed = sprint ? 245 : 170;
      if (keys.has("ArrowLeft")) { p.x -= speed * dt; p.action = "walk"; }
      else if (keys.has("ArrowRight")) { p.x += speed * dt; p.action = "walk"; }
      else p.action = "idle";
    } else if (p.block) p.action = "block";
    else if (frozen && p.action !== "attack") p.action = "idle";
    // contra o guarda vivo o jogador não passa por ele
    const maxX = e && !e.defeated ? e.x - 70 : game.mariko ? game.mariko.x - 90 : 915;
    p.x = Math.max(70, Math.min(maxX, p.x));
    playerAttackCheck();
    if (p.action === "attack" && p.actionTime <= 0) { p.action = "idle"; p.anim = "stance"; p.animTime = 0; }
    if (p.action === "walk" && !moving) p.action = "idle";
    if (p.bowTimer > 0) {
      if (p.anim !== "reverence") { p.anim = "reverence"; p.animTime = 0; }
    } else if (p.lock > 0) {
      if (p.anim !== "victory") { p.anim = "victory"; p.animTime = 0; }
    } else if (p.action === "walk" || p.action === "idle" || p.action === "block") {
      const nextAnim = p.action === "walk" ? (sprint ? "run" : "walk") : "stance";
      if (p.anim !== nextAnim) { p.anim = nextAnim; p.animTime = 0; }
    }
    enemyThink(dt); falconThink(dt); gateThink(dt); marikoThink(dt);
    if (game.state !== "playing") return;
    if (e && e.hp <= 0 && !e.defeated) {
      e.defeated = true; e.action = "fall"; e.anim = "death"; e.animTime = 0;
      clear(); p.anim = "victory"; p.animTime = 0; updateHud();
    }
    const marikoKick = game.mariko && game.mariko.state === "kick";
    if (p.hp <= 0 && !marikoKick) {
      killPlayer(game.lastHitFatal ? "Correndo, um único golpe é fatal." : "Você foi derrotado.");
    }
    // avançar para a próxima área
    if (game.state === "playing" && game.cleared && p.x >= 880 && game.stage < stages.length - 1 && !(game.gate && game.gate.state !== "down")) startFade();
    game.messageTimer = Math.max(0, game.messageTimer - dt);
    game.shake = Math.max(0, game.shake - dt * 20);
    updateParticles(dt);
    updateHud();
  }

  /* ---------- desenho ---------- */
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function drawCastleLayer(x, y, scale = 1, alpha = .18) {
    if (!castleReady) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(castleLayer, Math.round(x), Math.round(y), Math.round(320 * scale), Math.round(192 * scale));
    ctx.restore();
  }
  function drawSky(dusk, withCastle = false) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (dusk) { g.addColorStop(0, "#4a3b3b"); g.addColorStop(.58, "#a2694f"); g.addColorStop(.59, "#b98660"); g.addColorStop(1, "#3d382f"); }
    else { g.addColorStop(0, "#665a49"); g.addColorStop(.58, "#b18a61"); g.addColorStop(.59, "#c6a174"); g.addColorStop(1, "#4b4638"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dusk ? "#e09a6a" : "#d9b982"; ctx.beginPath(); ctx.arc(730, 135, 68, 0, Math.PI * 2); ctx.fill();
    if (withCastle) drawCastleLayer(552, 112, .9, .2);   // fortaleza original no horizonte
    ctx.fillStyle = "#716a58"; ctx.beginPath(); ctx.moveTo(0,340); ctx.lineTo(160,155); ctx.lineTo(265,285); ctx.lineTo(420,120); ctx.lineTo(620,340); ctx.fill();
    ctx.fillStyle = "#4e5146"; ctx.beginPath(); ctx.moveTo(300,345); ctx.lineTo(520,180); ctx.lineTo(690,330); ctx.lineTo(820,205); ctx.lineTo(960,350); ctx.fill();
    rect(120,90,75,7,"#d0b18a"); rect(145,82,50,8,"#d0b18a"); rect(410,120,90,6,"#d0b18a");
  }
  function drawFloor(base, line, dots) {
    rect(0, 400, W, 140, base);
    for (let i = 0; i < 16; i++) { const x = i * 65; rect(x,405,42,3,line); rect(x+18,423,34,2,"#292c26"); }
    rect(0, floorY, W, H - floorY, "#292b25"); rect(0, floorY, W, 4, "#8d7958");
    if (dots) for (let i = 0; i < 40; i++) rect((i*83)%W, 455+(i*37)%75, 2, 2, "#6c614b");
  }
  function drawFujiBand(alpha = .5) {
    if (!sceneReady("fuji")) return;
    const tw = 138, th = 414, y = floorY - th;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    for (let x = -tw / 2; x < W; x += tw) ctx.drawImage(originalScene.fuji, Math.round(x), y, tw, th);
    ctx.restore();
  }
  function drawOriginalInterior(kind) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#100d09"); g.addColorStop(.55, "#261c13"); g.addColorStop(1, "#16110d");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // tochas quentes nas paredes
    for (const tx of [118, 480, 842]) {
      const glow = ctx.createRadialGradient(tx, 210, 8, tx, 210, 210);
      glow.addColorStop(0, "rgba(214,146,84,.24)"); glow.addColorStop(1, "rgba(214,146,84,0)");
      ctx.fillStyle = glow; ctx.fillRect(tx - 220, 0, 440, 430);
    }
    if (sceneReady(kind)) {
      ctx.save();
      ctx.globalAlpha = .96;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(originalScene[kind], 0, -1, W, 480);
      ctx.restore();
    }
    ctx.fillStyle = "rgba(14,11,8,.16)"; ctx.fillRect(0, 0, W, 400);
    drawFloor("#3a2b1e", "#5b432c", false);
  }
  function drawBackground(kind) {
    if (kind === "cliff") {
      drawSky(false, true);
      drawFujiBand(.58);
      rect(90,282,100,58,"#39382f"); rect(76,274,128,10,"#292b25"); rect(108,248,65,30,"#484237"); rect(96,243,88,8,"#292b25");
      drawFloor("#37382f", "#555044", true);
    } else if (kind === "courtyard") {
      drawSky(true, true);
      rect(0,300,W,100,"#2f2c26"); for (let i = 0; i < 20; i++) rect(i*50+6,284,32,18,"#2f2c26");
      for (let i = 0; i < 12; i++) rect(i*84+30,330,10,40,"#1f1d19");
      rect(90,230,110,72,"#3a362c"); rect(76,222,138,10,"#242018"); rect(106,190,72,36,"#453f33"); rect(94,184,96,8,"#242018");
      drawFloor("#3a382f", "#4d493d", true);
    } else if (kind === "rampart") {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#171b21"); sky.addColorStop(.5, "#5d4636"); sky.addColorStop(.72, "#a87352"); sky.addColorStop(1, "#2a2119");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(224,154,106,.22)"; ctx.beginPath(); ctx.arc(760, 120, 92, 0, Math.PI*2); ctx.fill();
      if (castleReady) {
        ctx.save(); ctx.globalAlpha = .92; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(castleLayer, Math.round((W - 730) / 2), 0, 730, 438);
        ctx.restore();
      }
      ctx.fillStyle = "rgba(12,11,9,.22)"; ctx.fillRect(0, 0, W, 400);
      drawFloor("#3b3329", "#574a3a", true);
    } else if (kind === "hall" || kind === "stairs" || kind === "door" || kind === "corridor") {
      drawOriginalInterior(kind);
    } else if (kind === "palace" || kind === "palace2") {
      const alt = kind === "palace2";
      rect(0,0,W,H,alt ? "#1d2528" : "#2a2017");
      rect(0,0,W,70,alt ? "#141a1d" : "#1c150e");
      for (let i = 0; i < 7; i++) {
        const x = i * 160;
        rect(x,0,16,400,alt ? "#2f3d42" : "#3d2b19");
        rect(x+34,100,112,250,alt ? "#4a5a5c" : "#6b5a3f");
        for (let k = 0; k < 4; k++) rect(x+34+k*28,100,3,250,alt ? "#2a3436" : "#3d3222");
        for (let k = 0; k < 6; k++) rect(x+34,100+k*42,112,3,alt ? "#2a3436" : "#3d3222");
        rect(x+78,40,24,34,"#b94a35"); rect(x+86,74,8,10,"#7a2b1f");
      }
      rect(0,70,W,12,alt ? "#2f3d42" : "#3d2b19");
      drawFloor(alt ? "#2c2a22" : "#4a3622", alt ? "#3f3b2e" : "#5d4529", false);
    } else if (kind === "throne") {
      rect(0,0,W,H,"#2a1210"); rect(0,0,W,60,"#1a0b0a");
      for (let i = 0; i < 6; i++) { const x = 30 + i * 180; rect(x,60,24,340,"#4a1c18"); rect(x-6,60,36,10,"#7a2b1f"); }
      rect(440,210,100,12,"#7a2b1f"); rect(450,222,80,120,"#3a1512"); rect(430,330,120,16,"#7a2b1f"); rect(425,346,130,54,"#2a0f0d");
      rect(468,150,44,60,"#b94a35"); rect(476,160,28,10,"#e6c27c");
      drawFloor("#3a1a16", "#5a2a22", false);
      rect(380,404,200,34,"#6d1d1a");
    } else if (kind === "prison") {
      rect(0,0,W,H,"#26282a");
      for (let y = 0; y < 400; y += 28) for (let x = (y/28%2)*30; x < W; x += 60) { rect(x,y,56,2,"#1b1d1f"); rect(x,y,2,28,"#1b1d1f"); }
      rect(640,70,270,330,"#141516");
      for (let i = 0; i < 9; i++) rect(652+i*30,70,8,330,"#2e3032");
      rect(640,70,270,10,"#3a3d3f");
      rect(700,110,60,50,"#0b0c0d"); rect(708,118,44,34,"#3a4a63");
      drawFloor("#34363a", "#44474b", false);
    }
  }
  function drawGate(g) {
    if (!g) return;
    const x = g.x, top = 250;
    rect(x-62,top-30,26,floorY-top+30,"#3a362c"); rect(x+36,top-30,26,floorY-top+30,"#3a362c");
    rect(x-70,top-40,140,16,"#242018");
    const frac = g.state === "open" || g.state === "warn" ? 0 : g.state === "falling" ? Math.min(1, g.t / .9) ** 2 : 1;
    const bottom = top - 24 + (floorY - top + 24) * frac;
    for (let i = 0; i < 6; i++) rect(x-33+i*13, top-24, 5, bottom - (top-24), "#16171a");
    if (frac > 0) rect(x-36, bottom-8, 72, 8, "#0f1012");
    if (g.state === "warn" || g.state === "falling") {
      ctx.save();
      ctx.textAlign = "center"; ctx.font = "bold 17px monospace";
      ctx.fillStyle = Math.floor(game.time * 12) % 2 ? "#e06045" : "#f1d39b";
      ctx.fillText(g.state === "warn" ? "PREPARE-SE!" : "CORRA!", x, top - 52);
      ctx.restore();
    }
  }
  function drawFighter(f) {
    const who = f.who;
    let anim = f.anim || "stance";
    if (f.action === "block") anim = "stance";
    if (f.action === "fall" || f.hp <= 0) anim = "death";
    if (!spriteCounts[who][anim]) anim = "stance";
    const count = spriteCounts[who][anim];
    const attackFps = f.animDur > 0 ? count / f.animDur : 20;
    const fps = anim === "walk" ? 10 : anim === "run" ? 14 : (anim === "punch" || anim === "kick") ? attackFps
      : anim === "death" ? 7 : anim === "reverence" ? 5 : anim === "victory" ? 3 : 5;
    let frame = Math.floor(f.animTime * fps);
    if (anim === "stance") frame = count - 1;                // última pose = guarda de luta
    else if (["death","reverence","punch","kick"].includes(anim)) frame = Math.min(count - 1, frame);
    else frame = frame % count;
    const img = spriteFrame(who, anim, frame);
    if (!img.complete || !img.naturalWidth) return;
    const scale = who === "akuma" ? 2.75 : 2.6;
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.fillStyle = "#17181388";
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 1, 30, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(Math.round(f.x), Math.round(f.y));
    if (f.hitFlash > 0) ctx.globalAlpha = .55 + .45 * Math.sin(f.hitFlash * 55);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -dw/2, -dh, dw, dh);
    ctx.restore();
  }
  function drawMariko(m) {
    if (!m) return;
    const img = spriteFrame("mariko", m.state === "wait" ? "wait" : "stand", Math.floor(m.t * 1.5));
    if (!img.complete || !img.naturalWidth) return;
    const s = 2.6, dw = img.width * s, dh = img.height * s;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#17181388"; ctx.beginPath(); ctx.ellipse(m.x, floorY-1, 26, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.drawImage(img, Math.round(m.x - dw/2), floorY - dh, dw, dh);
    ctx.restore();
  }
  function drawFalcon(f) {
    if (!f) return;
    if (f.state === "warn") {            // marca de alerta no chão
      ctx.fillStyle = "#c8432f"; ctx.globalAlpha = .5 + .5 * Math.sin(f.t * 30);
      ctx.fillRect(Math.round(f.tx - 40), floorY - 4, 80, 5); ctx.globalAlpha = 1;
      ctx.font = "bold 22px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#e6c27c";
      ctx.fillText("!", f.tx, floorY - 14); ctx.textAlign = "left";
    }
    const s = 4, up = Math.sin(f.flap) > 0;
    ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y));
    if (f.flash > 0) ctx.globalAlpha = .5 + .5 * Math.sin(f.flash * 80);
    const px = (cx, cy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(cx * s, cy * s, w * s, h * s); };
    px(-5,-1,10,4,"#3a2b1d"); px(-7,-2,3,3,"#4a3724"); px(-8,-1,2,1,"#e6c27c");   // corpo, cabeça, bico
    px(-7,-2,1,1,"#e8dfca"); px(5,0,4,2,"#2a1f14"); px(-4,3,3,1,"#a07a4a");       // olho, cauda, garras
    if (up) { px(-3,-5,8,4,"#4a3724"); px(0,-8,6,3,"#3a2b1d"); px(3,-10,4,2,"#2a1f14"); }
    else    { px(-3,3,8,3,"#4a3724"); px(0,6,6,3,"#3a2b1d"); px(3,9,4,2,"#2a1f14"); }
    ctx.restore();
  }
  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(" "); let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    ctx.fillText(line, x, y);
  }
  function drawCards() {
    const st = stages[game.stage];
    if (game.state === "intro") {
      ctx.fillStyle = `rgba(10,9,7,${game.timer > .5 ? .82 : game.timer / .5 * .82})`;
      ctx.fillRect(0, 0, W, H);
      if (game.timer > .3) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#c8a66a"; ctx.font = "bold 16px monospace";
        ctx.fillText(`ETAPA ${game.stage + 1} DE ${stages.length}`, W/2, 215);
        ctx.fillStyle = "#f1d39b"; ctx.font = "bold 40px monospace";
        ctx.fillText(st.name, W/2, 265);
        ctx.fillStyle = "#e5d1a9"; ctx.font = "16px monospace";
        wrapText(st.sub, W/2, 305, 640, 24);
        ctx.textAlign = "left";
      }
      if (game.fade > 0) { ctx.fillStyle = `rgba(10,9,7,${game.fade})`; ctx.fillRect(0, 0, W, H); }
    } else if (game.state === "fade") { ctx.fillStyle = `rgba(10,9,7,${Math.min(1, game.fade)})`; ctx.fillRect(0, 0, W, H); }
    else if (game.state === "paused") {
      ctx.save();
      ctx.fillStyle = "rgba(10,9,7,.78)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#c8a66a"; ctx.font = "bold 15px monospace";
      ctx.fillText("JOGO PAUSADO", W / 2, H / 2 - 34);
      ctx.fillStyle = "#f1d39b"; ctx.font = "bold 42px monospace";
      ctx.fillText("PAUSA", W / 2, H / 2 + 14);
      ctx.fillStyle = "#e5d1a9"; ctx.font = "14px monospace";
      ctx.fillText("P / ESC PARA CONTINUAR", W / 2, H / 2 + 50);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  function draw() {
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
    drawBackground(stages[game.stage].bg);
    if (game.player) {
      ctx.fillStyle = "#e0c99d"; ctx.font = "10px monospace"; ctx.fillText("道", 28, 35);
      drawGate(game.gate);
      drawMariko(game.mariko);
      if (game.foe) drawFighter(game.foe);
      drawFighter(game.player);
      drawFalcon(game.falcon);
      for (const a of game.particles) { ctx.globalAlpha = Math.max(0, a.life * 2); rect(a.x, a.y, 4, 4, a.color); ctx.globalAlpha = 1; }
      if (game.messageTimer > 0 && game.state === "playing") { ctx.textAlign = "center"; ctx.font = "bold 23px monospace"; ctx.fillStyle = "#f1d39b"; ctx.fillText(game.message, W/2, 85); ctx.textAlign = "left"; }
      if (game.cleared && game.state === "playing" && game.stage < stages.length - 1 && game.victoryLock <= 0 && Math.floor(game.time * 2.5) % 2 === 0) {
        ctx.textAlign = "right"; ctx.font = "bold 26px monospace"; ctx.fillStyle = "#f1d39b"; ctx.fillText("AVANCE  →", W - 30, 130); ctx.textAlign = "left";
      }
    }
    drawCards();
    ctx.restore();
  }
  function loop(now) {
    const dt = Math.min((now - game.last) / 1000 || 0, .033); game.last = now;
    update(dt); draw(); requestAnimationFrame(loop);
  }

  /* ---------- pausa, som e tela cheia ---------- */
  function updatePauseButton() {
    const btn = $("pauseBtn");
    if (!btn) return;
    const paused = game.state === "paused";
    btn.textContent = paused ? "▶" : "II";
    btn.disabled = !(paused || game.state === "playing");
    btn.setAttribute("aria-label", paused ? "Continuar jogo" : "Pausar jogo");
    btn.title = paused ? "Continuar (P)" : "Pausar (P)";
  }
  function togglePause() {
    if (game.state === "playing") {
      game.statusBeforePause = $("gameStatus").textContent;
      game.state = "paused"; keys.clear();
      $("gameStatus").textContent = "EM PAUSA";
      sfx("pause");
    } else if (game.state === "paused") {
      game.state = "playing"; keys.clear();
      $("gameStatus").textContent = game.statusBeforePause || "JORNADA EM ANDAMENTO";
      sfx("pause");
    } else return;
    updatePauseButton(); updateHud();
  }
  function updateSoundButton() {
    const btn = $("soundBtn");
    if (!btn) return;
    btn.textContent = game.muted ? "MUDO" : "SOM";
    btn.setAttribute("aria-pressed", game.muted ? "true" : "false");
    btn.setAttribute("aria-label", game.muted ? "Ligar som" : "Desligar som");
    btn.title = game.muted ? "Ligar som (M)" : "Desligar som (M)";
  }
  function toggleMute() {
    game.muted = !game.muted;
    writeStore(STORAGE_MUTED, game.muted ? "1" : "0");
    updateSoundButton();
    if (!game.muted) sfx("pause");
  }
  function updateFullscreenButton() {
    const btn = $("fullscreenBtn");
    if (!btn) return;
    const on = !!document.fullscreenElement;
    btn.textContent = on ? "⤡" : "⛶";
    btn.setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
    btn.title = on ? "Sair da tela cheia (F)" : "Tela cheia (F)";
  }
  function toggleFullscreen() {
    if (!gameShell) return;
    try {
      if (document.fullscreenElement) {
        const p = document.exitFullscreen?.();
        if (p?.catch) p.catch(() => {});
      } else {
        const p = gameShell.requestFullscreen?.();
        if (p?.catch) p.catch(() => {});
      }
    } catch (_) { /* iOS Safari não suporta */ }
  }
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  function bindTouchControls() {
    const root = $("touchControls");
    if (!root) return;
    root.querySelectorAll("[data-hold]").forEach(btn => {
      const code = btn.dataset.hold;
      const down = e => {
        e.preventDefault(); audio(); keys.add(code); btn.classList.add("active");
        if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (_) {} }
      };
      const up = e => { e.preventDefault(); keys.delete(code); btn.classList.remove("active"); };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("lostpointercapture", up);
    });
    root.querySelectorAll("[data-tap]").forEach(btn => {
      const type = btn.dataset.tap;
      btn.addEventListener("pointerdown", e => {
        e.preventDefault(); audio(); btn.classList.add("active"); requestAttack(type);
        setTimeout(() => btn.classList.remove("active"), 120);
      });
      btn.addEventListener("pointerup", () => btn.classList.remove("active"));
      btn.addEventListener("pointercancel", () => btn.classList.remove("active"));
      btn.addEventListener("pointerleave", () => btn.classList.remove("active"));
    });
  }

  function isGameActive() {
    return ["playing", "intro", "paused", "dying", "fade"].includes(game.state);
  }
  window.addEventListener("keydown", e => {
    if (e.code === "KeyM" && !e.repeat) { toggleMute(); return; }
    if (e.code === "KeyF" && !e.repeat) { e.preventDefault(); toggleFullscreen(); return; }
    if (e.code === "KeyP" && !e.repeat) { e.preventDefault(); togglePause(); return; }
    if (e.code === "Escape" && !e.repeat) {
      if (!document.fullscreenElement) { e.preventDefault(); togglePause(); }
      return;
    }
    if (e.code === "Enter") {
      if (["menu","gameover","victory"].includes(game.state)) { e.preventDefault(); startGame(); return; }
      if (game.state === "paused") { e.preventDefault(); togglePause(); return; }
    }
    if (["ArrowLeft","ArrowRight","ArrowDown","ArrowUp","Space"].includes(e.code) && isGameActive()) e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space" && !e.repeat) requestAttack("punch");
    if (e.code === "KeyX" && !e.repeat) requestAttack("kick");
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") togglePause();
  });
  $("startBtn").addEventListener("click", startGame);
  $("pauseBtn").addEventListener("click", e => { e.currentTarget.blur(); togglePause(); });
  $("soundBtn").addEventListener("click", e => { e.currentTarget.blur(); toggleMute(); });
  $("fullscreenBtn").addEventListener("click", e => { e.currentTarget.blur(); toggleFullscreen(); });
  bindTouchControls();
  window.addEventListener("beforeunload", saveBest);

  loadStored();
  updateSoundButton();
  updateFullscreenButton();
  setupStage(0);
  game.player.anim = "reverence"; game.player.x = 285; game.player.animTime = 0;   // pré-visualização do menu
  updateScoreLine();
  const initialRecord = $("overlayRecord");
  if (initialRecord) {
    if (game.best > 0) initialRecord.textContent = `RECORDE ${String(game.best).padStart(6,"0")}`;
    else initialRecord.style.display = "none";
  }
  if (location.search.includes("debug")) window.__karateka = { game, loadStage, stages, keys, startGame, togglePause, requestAttack, sfx };
  requestAnimationFrame(loop);
})();
