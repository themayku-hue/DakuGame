 
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE = 40;
const COLS = 20;
const ROWS = 13;

canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

const message = document.getElementById("message");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");
const keyStatus = document.getElementById("keyStatus");
const alertStatus = document.getElementById("alertStatus");

let currentLevel = 1;
const TOTAL_LEVELS = 20;

let grid = [];
let player = { x: 1, y: 1 };
let guards = [];
let key = { x: 16, y: 2, found: false };
let door = { x: 18, y: 10, open: false };
let exit = { x: 18, y: 11 };

let running = false;
let caught = false;
let escaped = false;
let hidden = false;
let alarm = false;
let gameComplete = false;

let moveTimer = 0;
let lastTime = 0;
let keysDown = {};
let touchDirection = null;
let alertTimer = 0;

// Seeded random generator: har level ka map alag aur repeatable rahega.
function randomGenerator(seed) {
  let value = seed >>> 0;

  return function () {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function inside(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS;
}

function pathExists(map, target) {
  const queue = [{ x: 1, y: 1 }];
  const visited = new Set(["1,1"]);

  while (queue.length) {
    const pos = queue.shift();

    if (pos.x === target.x && pos.y === target.y) {
      return true;
    }

    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];

    for (const [dx, dy] of directions) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      const id = `${x},${y}`;

      if (!inside(x, y) || map[y][x] === "#" || visited.has(id)) {
        continue;
      }

      visited.add(id);
      queue.push({ x, y });
    }
  }

  return false;
}

function createLevel(levelNumber) {
  const random = randomGenerator(levelNumber * 918273 + 4567);

  const map = Array.from(
    { length: ROWS },
    () => Array(COLS).fill(".")
  );

  // Outer walls
  for (let x = 0; x < COLS; x++) {
    map[0][x] = "#";
    map[ROWS - 1][x] = "#";
  }

  for (let y = 0; y < ROWS; y++) {
    map[y][0] = "#";
    map[y][COLS - 1] = "#";
  }

  const start = { x: 1, y: 1 };
  const exitPos = { x: 18, y: 11 };
  const doorPos = { x: 18, y: 10 };

  // Key ki location har level mein badlegi.
  const keyPos = {
    x: 3 + Math.floor(random() * 14),
    y: 2 + Math.floor(random() * 7)
  };

  // Random walls banakar maze tayyar karo.
  const candidates = [];

  for (let y = 2; y <= 9; y++) {
    for (let x = 2; x <= 17; x++) {
      if (
        (x === start.x && y === start.y) ||
        (x === keyPos.x && y === keyPos.y) ||
        (x === doorPos.x && y === doorPos.y) ||
        (x === exitPos.x && y === exitPos.y)
      ) {
        continue;
      }

      candidates.push({ x, y });
    }
  }

  shuffle(candidates, random);

  const wallCount = Math.min(12 + levelNumber * 2, 48);
  let placed = 0;

  for (const pos of candidates) {
    if (placed >= wallCount) break;

    map[pos.y][pos.x] = "#";

    // Key aur door tak raasta hamesha khula rehna chahiye.
    const keyReachable = pathExists(map, keyPos);
    const doorReachable = pathExists(map, doorPos);
    const exitReachable = pathExists(map, exitPos);

    if (keyReachable && doorReachable && exitReachable) {
      placed++;
    } else {
      map[pos.y][pos.x] = ".";
    }
  }

  // Door aur exit
  map[doorPos.y][doorPos.x] = "D";
  map[exitPos.y][exitPos.x] = "E";
  map[keyPos.y][keyPos.x] = "K";
  map[start.y][start.x] = "P";

  // Guards ki sankhya level ke saath badhegi.
  const guardCount = Math.min(2 + Math.floor((levelNumber - 1) / 3), 8);
  const guardSpots = [];

  for (let y = 2; y <= 10; y++) {
    for (let x = 2; x <= 17; x++) {
      if (map[y][x] !== ".") continue;

      const distanceFromPlayer =
        Math.abs(x - start.x) + Math.abs(y - start.y);

      const distanceFromKey =
        Math.abs(x - keyPos.x) + Math.abs(y - keyPos.y);

      if (distanceFromPlayer > 4 && distanceFromKey > 1) {
        guardSpots.push({ x, y });
      }
    }
  }

  shuffle(guardSpots, random);

  for (let i = 0; i < guardCount && i < guardSpots.length; i++) {
    const spot = guardSpots[i];
    map[spot.y][spot.x] = "G";
  }

  return map;
}

function buildLevel() {
  const levelMap = createLevel(currentLevel);

  grid = levelMap.map(row => row.slice());
  guards = [];

  key = { x: 16, y: 2, found: false };
  door = { x: 18, y: 10, open: false };
  exit = { x: 18, y: 11 };
  player = { x: 1, y: 1 };

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y][x];

      if (cell === "P") {
        player = { x, y };
        grid[y][x] = ".";
      }

      if (cell === "K") {
        key = { x, y, found: false };
        grid[y][x] = ".";
      }

      if (cell === "D") {
        door = { x, y, open: false };
        grid[y][x] = ".";
      }

      if (cell === "E") {
        exit = { x, y };
        grid[y][x] = ".";
      }

      if (cell === "G") {
        guards.push({
          x,
          y,
          startX: x,
          startY: y,
          direction: Math.random() < 0.5 ? 1 : -1,
          timer: 0,
          mode: "patrol",
          lastSeen: null
        });

        grid[y][x] = ".";
      }
    }
  }

  hidden = false;
  alarm = false;
  alertTimer = 0;

  updateHUD();
  showMessage(`LEVEL ${currentLevel}: Find the key and escape!`);
}

function updateHUD() {
  keyStatus.textContent = key.found ? "1/1" : "0/1";
  alertStatus.textContent = alarm ? "DANGER" : "SAFE";
  alertStatus.style.color = alarm ? "#ff5555" : "#8df0a4";
}

function showMessage(text) {
  message.textContent = text;
}

function isWall(x, y) {
  if (!inside(x, y)) return true;
  return grid[y][x] === "#";
}

function isClosedDoor(x, y) {
  return x === door.x && y === door.y && !door.open;
}

function isBlocked(x, y) {
  return isWall(x, y) || isClosedDoor(x, y);
}

function startGame() {
  if (gameComplete) {
    currentLevel = 1;
    gameComplete = false;
  }

  buildLevel();

  running = true;
  caught = false;
  escaped = false;
  hidden = false;
  alarm = false;

  moveTimer = 0;
  alertTimer = 0;
  keysDown = {};
  touchDirection = null;

  overlay.classList.add("hidden");
  startBtn.textContent = "START GAME";
  lastTime = 0;
}

function distanceBetween(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function movePlayer(dx, dy) {
  if (!running || caught || escaped) return;

  hidden = false;

  const nx = player.x + dx;
  const ny = player.y + dy;

  if (isWall(nx, ny)) return;

  if (isClosedDoor(nx, ny)) {
    if (!key.found) {
      showMessage("LOCKED! Pehle yellow key dhoondo.");
      return;
    }

    door.open = true;
    showMessage("SECURITY GATE UNLOCKED!");
  }

  player.x = nx;
  player.y = ny;

  if (!key.found && player.x === key.x && player.y === key.y) {
    key.found = true;
    showMessage("KEY FOUND! Ab security gate kholo.");
    updateHUD();
  }

  if (player.x === exit.x && player.y === exit.y) {
    if (!key.found || !door.open) {
      showMessage("Pehle key aur gate unlock karo!");
      return;
    }

    winGame();
    return;
  }

  checkDetection();
}

function canSeePlayer(guard) {
  if (hidden) return false;

  const dx = player.x - guard.x;
  const dy = player.y - guard.y;

  if (Math.abs(dx) + Math.abs(dy) > 5) return false;
  if (dx !== 0 && dy !== 0) return false;

  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);

  for (let i = 1; i < steps; i++) {
    if (isBlocked(guard.x + sx * i, guard.y + sy * i)) {
      return false;
    }
  }

  return true;
}

function checkDetection() {
  if (hidden) {
    alarm = false;
    updateHUD();
    return;
  }

  alarm = false;

  for (const guard of guards) {
    if (distanceBetween(player, guard) === 0) {
      loseGame();
      return;
    }

    if (canSeePlayer(guard)) {
      guard.mode = "chase";
      guard.lastSeen = { ...player };
      alarm = true;
    }
  }

  updateHUD();

  if (alarm) {
    showMessage("GUARD SPOTTED YOU! RUN!");
  }
}

function patrolGuard(guard) {
  const nx = guard.x + guard.direction;

  if (
    isBlocked(nx, guard.y) ||
    nx < guard.startX - 3 ||
    nx > guard.startX + 3
  ) {
    guard.direction *= -1;
    return;
  }

  guard.x = nx;
}

function chaseGuard(guard) {
  if (!guard.lastSeen) {
    guard.mode = "patrol";
    return;
  }

  const queue = [{
    x: guard.x,
    y: guard.y,
    first: null
  }];

  const visited = new Set([`${guard.x},${guard.y}`]);
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  while (queue.length) {
    const pos = queue.shift();

    if (pos.x === player.x && pos.y === player.y) {
      if (pos.first) {
        guard.x = pos.first.x;
        guard.y = pos.first.y;
      }

      if (distanceBetween(guard, player) === 0) {
        loseGame();
      }

      return;
    }

    for (const [dx, dy] of directions) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      const id = `${x},${y}`;

      if (isBlocked(x, y) || visited.has(id)) continue;

      visited.add(id);

      queue.push({
        x,
        y,
        first: pos.first || { x, y }
      });
    }
  }

  guard.mode = "patrol";
  guard.lastSeen = null;
}

function updateGuards(dt) {
  for (const guard of guards) {
    if (!running) return;

    guard.timer += dt;

    if (canSeePlayer(guard)) {
      guard.mode = "chase";
      guard.lastSeen = { ...player };
      alarm = true;
    }

    const speed = guard.mode === "chase"
      ? Math.max(0.22, 0.42 - currentLevel * 0.007)
      : Math.max(0.38, 0.8 - currentLevel * 0.012);

    if (guard.timer < speed) continue;

    guard.timer = 0;

    if (guard.mode === "chase") {
      chaseGuard(guard);
      if (!running) return;
    } else {
      patrolGuard(guard);
    }
  }

  checkDetection();

  if (!alarm) {
    alertTimer += dt;

    if (alertTimer > 3) {
      for (const guard of guards) {
        if (guard.mode === "chase") {
          guard.mode = "patrol";
          guard.lastSeen = null;
        }
      }
    }
  } else {
    alertTimer = 0;
  }
}

function hidePlayer() {
  if (!running) return;

  if (hidden) {
    hidden = false;
    showMessage("You left your hiding place!");
    checkDetection();
    return;
  }

  const around = [
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  const nearWall = around.some(([dx, dy]) =>
    isWall(player.x + dx, player.y + dy)
  );

  if (nearWall) {
    hidden = true;
    alarm = false;
    updateHUD();
    showMessage("HIDDEN! Guards cannot see you.");
  } else {
    showMessage("Chhupne ke liye wall ke paas jao!");
  }
}

function loseGame() {
  if (caught || escaped) return;

  caught = true;
  running = false;

  overlayTitle.textContent = "CAUGHT BY GUARDS!";
  overlayText.textContent = `Level ${currentLevel} failed. Dobara try karo!`;
  startBtn.textContent = "TRY AGAIN";
  overlay.classList.remove("hidden");
}

function winGame() {
  escaped = true;
  running = false;

  if (currentLevel >= TOTAL_LEVELS) {
    gameComplete = true;

    overlayTitle.textContent = "YOU ARE THE ULTIMATE ESCAPER!";
    overlayText.textContent = "Congratulations! Tumne saare 20 levels complete kar liye!";
    startBtn.textContent = "PLAY AGAIN";
  } else {
    overlayTitle.textContent = `LEVEL ${currentLevel} COMPLETE!`;
    overlayText.textContent = `Shabash! Level ${currentLevel} clear. Ab Level ${currentLevel + 1} mein nayi challenge hai.`;

    currentLevel++;
    startBtn.textContent = `NEXT LEVEL ${currentLevel}`;
  }

  overlay.classList.remove("hidden");
}

// DRAWING
function drawFloor() {
  ctx.fillStyle = "#252f2b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#303b35" : "#344039";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

      ctx.strokeStyle = "#ffffff0b";
      ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
}

function drawWalls() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== "#") continue;

      const px = x * TILE;
      const py = y * TILE;

      ctx.fillStyle = "#303a4d";
      ctx.fillRect(px, py, TILE, TILE);

      ctx.fillStyle = "#66748d";
      ctx.fillRect(px + 2, py + 2, TILE - 4, 7);

      ctx.fillStyle = "#424e62";
      ctx.fillRect(px + 3, py + 11, TILE - 6, TILE - 14);

      ctx.strokeStyle = "#202938";
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }
}

function drawDoor() {
  const x = door.x * TILE;
  const y = door.y * TILE;

  ctx.fillStyle = door.open ? "#28774e" : "#b47a34";
  ctx.fillRect(x + 4, y + 3, TILE - 8, TILE - 6);

  ctx.fillStyle = "#ffe29b";
  ctx.font = "bold 10px Arial";
  ctx.fillText(door.open ? "OPEN" : "LOCK", x + 5, y + 24);
}

function drawKey() {
  if (key.found) return;

  const x = key.x * TILE + TILE / 2;
  const y = key.y * TILE + TILE / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);

  ctx.strokeStyle = "#ffd43b";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.arc(-5, -5, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(16, 13);
  ctx.lineTo(11, 18);
  ctx.moveTo(12, 9);
  ctx.lineTo(8, 13);
  ctx.stroke();

  ctx.restore();
}

function drawExit() {
  const x = exit.x * TILE;
  const y = exit.y * TILE;

  ctx.fillStyle = "#11683e";
  ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);

  ctx.strokeStyle = "#7cffae";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);

  ctx.fillStyle = "#d5ffe0";
  ctx.font = "bold 12px Arial";
  ctx.fillText("EXIT", x + 5, y + 24);
}

function drawGuardVision() {
  ctx.save();

  for (const guard of guards) {
    ctx.fillStyle = guard.mode === "chase" ? "#ff2020" : "#ffb347";
    ctx.globalAlpha = 0.13;

    const x = guard.x * TILE + TILE / 2;
    const y = guard.y * TILE + TILE / 2;

    ctx.fillRect(
      guard.direction > 0 ? x + 8 : x - TILE * 3,
      y - 5,
      TILE * 3,
      10
    );
  }

  ctx.restore();
}

function drawCharacter(x, y, color, isPlayer) {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;

  ctx.fillStyle = "#0007";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 9, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();

  if (isPlayer) {
    ctx.fillStyle = "#f2c9a3";
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 5, 1.3, 0, Math.PI * 2);
    ctx.arc(cx + 2, cy - 5, 1.3, 0, Math.PI * 2);
    ctx.fill();

    if (hidden) {
      ctx.strokeStyle = "#75ffb2";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 17, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#202633";
    ctx.fillRect(cx - 9, cy - 12, 18, 5);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(cx + 3, cy - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffe0a0";
    ctx.font = "bold 9px Arial";

    const guard = guards.find(g => g.x === x && g.y === y);
    ctx.fillText(guard && guard.mode === "chase" ? "!" : "GUARD", cx - 10, cy + 24);
  }
}

function draw() {
  drawFloor();
  drawGuardVision();
  drawWalls();
  drawExit();
  drawDoor();
  drawKey();

  for (const guard of guards) {
    drawCharacter(
      guard.x,
      guard.y,
      guard.mode === "chase" ? "#ff3737" : "#d94b4b",
      false
    );
  }

  drawCharacter(player.x, player.y, "#42a5f5", true);
}

function readDirection() {
  if (keysDown.ArrowUp || keysDown.w) return [0, -1];
  if (keysDown.ArrowDown || keysDown.s) return [0, 1];
  if (keysDown.ArrowLeft || keysDown.a) return [-1, 0];
  if (keysDown.ArrowRight || keysDown.d) return [1, 0];

  if (touchDirection === "up") return [0, -1];
  if (touchDirection === "down") return [0, 1];
  if (touchDirection === "left") return [-1, 0];
  if (touchDirection === "right") return [1, 0];

  return [0, 0];
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.05);
  lastTime = timestamp;

  if (running) {
    updateGuards(dt);

    moveTimer += dt;

    if (moveTimer >= 0.15) {
      moveTimer = 0;

      const [dx, dy] = readDirection();

      if (dx !== 0 || dy !== 0) {
        movePlayer(dx, dy);
      }
    }
  }

  draw();
  requestAnimationFrame(gameLoop);
}

// CONTROLS
startBtn.addEventListener("click", startGame);
document.getElementById("hideBtn").addEventListener("click", hidePlayer);

document.getElementById("restartBtn").addEventListener("click", startGame);

document.addEventListener("keydown", event => {
  const k = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(k)
  ) {
    event.preventDefault();
  }

  if (k === " " && !event.repeat) {
    hidePlayer();
    return;
  }

  keysDown[k.startsWith("arrow") ? event.key : k] = true;
});

document.addEventListener("keyup", event => {
  const k = event.key.toLowerCase();
  keysDown[event.key] = false;
  keysDown[k] = false;
});

document.querySelectorAll(".mobile-controls button[data-dir]").forEach(button => {
  const dir = button.dataset.dir;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    touchDirection = dir;
    button.setPointerCapture(event.pointerId);
  });

  function release() {
    if (touchDirection === dir) touchDirection = null;
  }

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

buildLevel();
draw();
requestAnimationFrame(gameLoop);
