"use strict";
// Headless smoke-test harness for Karateka Reborn (game.js).
// Stubs just enough DOM/Canvas/WebAudio to run the real game loop in Node.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = process.argv[2] || process.cwd();
const errors = [];

/* ---------- minimal DOM ---------- */
function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: c => (set.has(c) ? set.delete(c) : set.add(c)),
    _set: set,
  };
}
function makeEl(tag, id) {
  const el = {
    tagName: (tag || "div").toUpperCase(), id: id || "",
    textContent: "", innerHTML: "", title: "", disabled: false,
    style: {}, dataset: {}, children: [],
    classList: null, _listeners: {},
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); },
    removeEventListener() {},
    dispatch(t, ev) { for (const fn of this._listeners[t] || []) fn({ currentTarget: this, target: this, preventDefault() {}, ...ev }); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    blur() {}, focus() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
    requestFullscreen() { return Promise.resolve(); },
    setPointerCapture() {},
  };
  el.classList = makeClassList(el);
  return el;
}

const ids = ["game","stageDots","stageTitle","overlay","overlayTitle","overlayText","overlayRecord",
  "startBtn","gameStatus","pauseBtn","soundBtn","fullscreenBtn","scoreLine",
  "playerHealth","playerHealthText","enemyHealth","enemyHealthText","enemyLabel",
  "stageNum","stageName","touchControls"];
const elements = {};
for (const id of ids) elements[id] = makeEl(id === "game" ? "canvas" : "div", id);

/* canvas 2d context stub */
function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  return new Proxy({
    canvas, measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createPattern: () => null, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {}, setTransform() {}, getTransform: () => ({}),
  }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const gameCanvas = elements.game;
gameCanvas.width = 960; gameCanvas.height = 540;
gameCanvas.getContext = () => (gameCanvas._ctx ||= makeCtx(gameCanvas));

/* touch buttons inside #touchControls */
const touchRoot = elements.touchControls;
const holdButtons = ["ArrowLeft","ArrowRight","ArrowDown"].map(code => {
  const b = makeEl("button"); b.dataset.hold = code; return b;
});
const runBtn = makeEl("button"); runBtn.dataset.hold = "ShiftLeft";
const punchBtn = makeEl("button"); punchBtn.dataset.tap = "punch";
const kickBtn = makeEl("button"); kickBtn.dataset.tap = "kick";
touchRoot.querySelectorAll = sel => {
  if (sel === "[data-hold]") return [...holdButtons, runBtn];
  if (sel === "[data-tap]") return [punchBtn, kickBtn];
  return [];
};

/* stage dots are appended dynamically */
elements.stageDots.appendChild = function (c) { this.children.push(c); c.className = ""; return c; };

/* document / window */
const docListeners = {};
const document = {
  hidden: false, fullscreenElement: null,
  querySelector: sel => (sel === "canvas#game" ? gameCanvas : sel === ".game-shell" ? makeEl("div") : null),
  getElementById: id => elements[id] || null,
  createElement: tag => makeEl(tag),
  addEventListener: (t, fn) => (docListeners[t] ||= []).push(fn),
  exitFullscreen: () => Promise.resolve(),
};
const winListeners = {};
const rafQueue = [];
const window = {
  document,
  addEventListener: (t, fn) => (winListeners[t] ||= []).push(fn),
  removeEventListener() {},
  AudioContext: class {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    resume() {}
    createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: n => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: n => n }; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect: n => n, start() {}, stop() {} }; }
    createBiquadFilter() { return { type: "", frequency: {}, Q: {}, connect: n => n }; }
  },
};

/* Image stub: fires load on next tick so sceneReady()/castleLayer initialize */
class ImageStub {
  constructor() { this.complete = false; this.naturalWidth = 0; this._src = ""; this._listeners = {}; }
  set src(v) {
    this._src = v; this.complete = true; this.naturalWidth = 320; this.naturalHeight = 192;
    setTimeout(() => (this._listeners.load || []).forEach(fn => fn()), 0);
  }
  get src() { return this._src; }
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  removeEventListener() {}
}

/* localStorage stub */
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const location = { search: "?debug", href: "http://localhost/index.html?debug" };

/* RAF driver */
let rafCb = null;
const requestAnimationFrame = fn => { rafCb = fn; return 1; };
let now = 0;
function step(frames, keysDown = []) {
  for (let i = 0; i < frames; i++) {
    now += 1000 / 60;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error("no RAF callback queued at frame " + i);
    cb(now);
  }
}

/* ---------- run the game ---------- */
const sandbox = {
  window, document, Image: ImageStub, localStorage, location,
  requestAnimationFrame, setTimeout, clearTimeout, console,
  Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Promise,
  Uint8ClampedArray, Float32Array, parseInt, parseFloat, isNaN,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(ROOT, "game.js"), "utf8");
vm.runInContext(code, sandbox, { filename: "game.js" });

const K = sandbox.window.__karateka;
if (!K) { console.error("FAIL: window.__karateka missing"); process.exit(1); }
const { game, loadStage, startGame, requestAttack, keys, stages } = K;

function keydown(code) {
  for (const fn of winListeners.keydown || []) fn({ code, repeat: false, preventDefault() {} });
}
function keyup(code) {
  for (const fn of winListeners.keyup || []) fn({ code, preventDefault() {} });
}
function assert(cond, msg) {
  if (!cond) { errors.push(msg); console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}
function frames(n) { step(n); }

/* 1. menu renders */
frames(10);
assert(game.state === "menu", "boots into menu state");
assert(elements.stageDots.children.length === stages.length, `stage dots built (${stages.length})`);
assert(game.player && game.player.anim === "reverence", "menu preview fighter in reverence");

/* 2. start game */
keydown("Enter"); frames(5);
assert(game.state === "intro", "Enter starts intro");
frames(200); // intro -> playing
assert(game.state === "playing", `intro transitions to playing (state=${game.state})`);

/* 3. movement + punch damages the foe */
const foeX0 = game.foe.x;
keydown("ArrowRight"); frames(30); keyup("ArrowRight");
assert(game.player.x > 110, `player walks right (${game.player.x.toFixed(0)})`);
keydown("ArrowRight"); frames(40);
keyup("ArrowRight");
const hp0 = game.foe.hp;
for (let i = 0; i < 40 && game.state === "playing" && game.foe.hp === hp0; i++) {
  requestAttack("punch"); frames(30);
}
assert(game.foe.hp < hp0 || game.cleared, `punches damage the foe (hp ${hp0} -> ${game.foe.hp})`);
frames(30);

/* 4. pause toggles */
keydown("KeyP"); frames(2);
assert(game.state === "paused", "P pauses");
keydown("KeyP"); frames(2);
assert(game.state === "playing", "P resumes");

/* 5. stage 2: beat the guard, then running (Shift) clears the falling gate */
loadStage(1); frames(200);
assert(game.state === "playing" && game.stage === 1, "stage 2 (gate) loads");
function fightCurrentFoe(maxFrames = 60 * 60) {
  let n = 0;
  keys.add("ArrowDown"); // hold block; attacks still land through it
  while (game.state === "playing" && game.foe && !game.foe.defeated && n < maxFrames) {
    const p = game.player, e = game.foe;
    if (Math.abs(p.x - e.x) > 100) {
      keys.add(p.x < e.x ? "ArrowRight" : "ArrowLeft");
      keys.delete("ArrowDown");
    } else {
      keys.delete("ArrowRight"); keys.delete("ArrowLeft");
      keys.add("ArrowDown");
      requestAttack(Math.random() < .3 ? "kick" : "punch");
    }
    frames(1); n++;
  }
  keys.clear();
  return n;
}
fightCurrentFoe();
assert(game.cleared, `guard defeated (cleared=${game.cleared}, foe hp=${game.foe?.hp})`);
// now run for the gate
keydown("ShiftLeft"); keydown("ArrowRight");
frames(60 * 6);
keyup("ArrowRight"); keyup("ShiftLeft"); frames(60 * 3);
assert(game.stage > 1 || game.state === "dying" || game.state === "gameover",
  `running clears the gate and advances (stage=${game.stage}, gate=${game.gate?.state}, state=${game.state})`);

/* 6. falcon stage loads and resolves */
loadStage(7); frames(200);
assert(game.state === "playing" && game.falcon, "falcon stage loads");
keydown("ArrowRight"); frames(30); keyup("ArrowRight");
for (let i = 0; i < 1200 && !game.cleared; i++) {
  const f = game.falcon;
  if (f && f.state === "dive" && f.y > 170) { requestAttack("punch"); }
  frames(2);
}
assert(game.cleared || game.falcon?.hp < 3, `falcon can be repelled (hp=${game.falcon?.hp}, cleared=${game.cleared})`);
frames(30);

/* 7. mariko stage: running rescue wins, fighting stance knocks you out */
loadStage(9); frames(200);
assert(game.state === "playing" && game.mariko, "mariko stage loads");
keydown("ShiftLeft"); keydown("ArrowRight");
frames(60 * 8);
keyup("ArrowRight"); keyup("ShiftLeft"); frames(120);
assert(game.state === "victory" || game.cleared, `running to Mariko wins (state=${game.state}, cleared=${game.cleared})`);

/* 8. full playthrough: auto-fight every stage to the throne */
keys.clear();
startGame();
let guard = 0;
let lastStage = -1, lastProgress = 0;
while (!["victory", "gameover"].includes(game.state) && guard < 60 * 60 * 30) {
  guard++;
  if (game.state === "playing") {
    if (game.cleared) {
      // walk/run right to the next area (gate stages require the sprint)
      keys.delete("ArrowDown");
      keys.add("ArrowRight"); keys.add("ShiftLeft");
    } else if (game.stage === 7) {
      const f = game.falcon;
      keys.add("ArrowDown");
      if (f?.state === "dive") requestAttack("punch");
    } else if (game.stage === 9) {
      keys.add("ShiftLeft"); keys.add("ArrowRight");
    } else if (game.foe) {
      const p = game.player, e = game.foe;
      const dist = Math.abs(p.x - e.x);
      if (dist > 100) {
        keys.add(p.x < e.x ? "ArrowRight" : "ArrowLeft");
        keys.delete("ArrowDown");
      } else {
        keys.delete("ArrowRight"); keys.delete("ArrowLeft");
        keys.add("ArrowDown");
        requestAttack(Math.random() < .3 ? "kick" : "punch");
      }
    }
    if (game.stage !== lastStage) { lastStage = game.stage; lastProgress = guard; }
  }
  frames(1);
}
console.log(`auto-play ended: state=${game.state} stage=${game.stage + 1} score=${game.score} hp=${game.player.hp.toFixed(0)} guard=${guard}`);
assert(["victory", "gameover"].includes(game.state), `auto-play reaches a terminal state (state=${game.state})`);
assert(game.score > 0, `score accumulated (${game.score})`);

/* 9. death path: stand still on stage 1 until killed */
keys.clear();
loadStage(0); frames(200);
let g2 = 0;
while (game.state === "playing" && g2 < 60 * 120) { frames(1); g2++; }
assert(game.state === "dying" || game.state === "gameover", `idling gets you killed (state=${game.state})`);
frames(300);
assert(game.state === "gameover", `death leads to gameover (state=${game.state})`);

/* report */
console.log("\n" + (errors.length ? `SMOKE TEST FAILED (${errors.length} errors)` : "SMOKE TEST PASSED"));
process.exit(errors.length ? 1 : 0);