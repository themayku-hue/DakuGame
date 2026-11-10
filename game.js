 
"use strict";

// ==========================================
// PRISON BREAK - COMPLETE GAME
// 20 LEVELS + COINS + CONTINUOUS MOVEMENT
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE = 40;
const COLS = 20;
const ROWS = 13;

const TOTAL_LEVELS = 20;
const LEVEL_PRICE = 40;
const WIN_REWARD = 10;
const LOSE_PENALTY = 2;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");

const keyStatus = document.getElementById("keyStatus");
const levelStatus = document.getElementById("levelStatus");
const message = document.getElementById("message");

const levelSelection = document.getElementById("levelSelection");
const levelList = document.getElementById("levelList");

let coins = Number(localStorage.getItem("prisonCoins") || 0);

let unlockedLevels = [];

try {
  unlockedLevels = JSON.parse(
    localStorage.getItem("prisonUnlockedLevels") || "[1]"
  );
} catch {
  unlockedLevels = [1];
}

if (!Array.isArray(unlockedLevels)) unlockedLevels = [1];

unlockedLevels = [...new Set([1, ...unlockedLevels])]
  .filter(n => Number.isInteger(n) && n >= 1 && n <= TOTAL_LEVELS);

let currentLevel = 1;
let selectedLevel = 1;

let map = [];
let player = { x: 1, y: 1 };

let guards = [];
let key = { x: 10, y: 6 };
let door = { x: 18, y: 10, open: false };
let exit = { x: 18, y: 11 };

let hasKey = false;
let running = false;
let caught = false;
let escaped = false;
let hidden = false;

let touchDirection = null;
let moveTimer = 0;
let guardTimer = 0;
let attemptCharged = false;

const keysPressed = {};

// ==========================================
// SAVE AND COINS
// ==========================================

function saveProgress() {
  localStorage.setItem("prisonCoins", String(coins));
  localStorage.setItem(
    "prisonUnlockedLevels",
    JSON.stringify(unlockedLevels)
  );
}

function updateCoins() {
  document.getElementById("coinBalance").textContent = coins;
  document.getElementById("coinBalanceMenu").textContent = coins;
}

function updateHUD() {
  keyStatus.textContent = hasKey ? "YES" : "NO";
  levelStatus.textContent = currentLevel;
  updateCoins();
}

function addCoins(amount) {
  coins += amount;
  saveProgress();
  updateCoins();
}

function unlockLevel(level) {
  if (!unlockedLevels.includes(level)) {
    unlockedLevels.push(level);
  }

  saveProgress();
}

// ==========================================
// LEVEL MENU
// ==========================================

function showLevelSelection() {
  running = false;
  touchDirection = null;

  overlay.classList.add("hidden");
  levelSelection.classList.add("show");

  levelList.innerHTML = "";

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const unlocked = unlockedLevels.includes(i);
    const button = document.createElement("button");

    button.className = "level-card " +
      (unlocked ? "unlocked" : "locked");

    button.textContent = unlocked
      ? `LEVEL ${i} - PLAY`
      : `🔒 LEVEL ${i} - 40 COINS`;

    button.addEventListener("click", () => {
      if (unlockedLevels.includes(i)) {
        selectedLevel = i;
        startSelectedLevel();
        return;
      }

      if (coins < LEVEL_PRICE) {
        alert("Not enough coins! You need 40 coins.");
        return;
      }

      if (!confirm(`Unlock Level ${i} for 40 coins?`)) return;

      coins -= LEVEL_PRICE;
      unlockLevel(i);
      updateCoins();
      showLevelSelection();
    });

    levelList.appendChild(button);
  }

  updateCoins();
}

function startSelectedLevel() {
  currentLevel = selectedLevel;

  levelSelection.classList.remove("show");
  overlay.classList.add("hidden");

  startGame();
}

// ==========================================
// MAP
// ==========================================

function isWall(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
    return true;
  }

  return map[y][x] === 1;
}

function createLevel(level) {
  map = [];

  for (let y = 0; y < ROWS; y++) {
    const row = [];

    for (let x = 0; x < COLS; x++) {
      row.push(
        x === 0 || y === 0 ||
        x === COLS - 1 || y === ROWS - 1
          ? 1 : 0
      );
    }

    map.push(row);
  }

  const patterns = [
    [[4,2],[4,3],[4,4],[4,5],[8,7],[9,7],[10,7]],
    [[6,2],[6,3],[6,4],[11,5],[11,6],[11,7]],
    [[3,5],[4,5],[5,5],[9,3],[9,4],[9,5]],
    [[7,2],[7,3],[7,4],[13,7],[14,7],[15,7]],
    [[4,7],[5,7],[6,7],[12,2],[12,3],[12,4]]
  ];

  const pattern = patterns[(level - 1) % patterns.length];

  pattern.forEach(([x, y]) => {
    map[y][x] = 1;
  });

  const extra = Math.min(10, Math.floor(level / 2));

  for (let i = 0; i < extra; i++) {
    const x = 3 + ((i * 5 + level * 2) % 14);
    const y = 2 + ((i * 3 + level) % 8);

    if (
      !(x === 1 && y === 1) &&
      !(x === key.x && y === key.y) &&
      !(x === door.x && y === door.y) &&
      !(x === exit.x && y === exit.y)
    ) {
      map[y][x] = 1;
    }
  }

  // Clear player route
  for (let x = 1; x <= 18; x++) {
    map[1][x] = 0;
  }

  for (let y = 1; y <= 11; y++) {
    map[y][18] = 0;
  }

  // Clear route to key
  map[6][10] = 0;
  map[6][9] = 0;
  map[6][8] = 0;
  map[5][8] = 0;
  map[4][8] = 0;
  map[3][8] = 0;

  map[1][1] = 0;
  map[key.y][key.x] = 0;
  map[door.y][door.x] = 0;
  map[exit.y][exit.x] = 0;
}

// ==========================================
// GUARDS
// ==========================================

function createGuards() {
  guards = [];

  const count = Math.min(2 + Math.floor(currentLevel / 3), 8);

  const positions = [
    [8,2], [14,4], [5,9], [15,8],
    [10,3], [3,7], [16,2], [12,9]
  ];

  for (let i = 0; i < count; i++) {
    let [x, y] = positions[i];

    if (isWall(x, y)) {
      x = 2 + i;
      y = 2;
    }

    guards.push({
      x,
      y,
      direction: i % 2 === 0 ? 1 : -1
    });
  }
}

function moveGuards() {
  if (!running) return;

  for (const guard of guards) {
    let dx = 0;
    let dy = 0;

    const distance =
      Math.abs(player.x - guard.x) +
      Math.abs(player.y - guard.y);

    if (!hidden && distance < 8) {
      if (Math.abs(player.x - guard.x) >
          Math.abs(player.y - guard.y)) {
        dx = Math.sign(player.x - guard.x);
      } else {
        dy = Math.sign(player.y - guard.y);
      }
    } else {
      guard.direction *= Math.random() > 0.7 ? -1 : 1;
      dx = guard.direction;
    }

    const nx = guard.x + dx;
    const ny = guard.y + dy;

    if (!isWall(nx, ny)) {
      guard.x = nx;
      guard.y = ny;
    }

    if (
      guard.x === player.x &&
      guard.y === player.y &&
      !hidden
    ) {
      loseGame();
      return;
    }
  }
}

// ==========================================
// START GAME
// ==========================================

function startGame() {
  currentLevel = selectedLevel;

  player = { x: 1, y: 1 };
  key = { x: 10, y: 6 };
  door = { x: 18, y: 10, open: false };
  exit = { x: 18, y: 11 };

  hasKey = false;
  caught = false;
  escaped = false;
  hidden = false;

  attemptCharged = false;
  touchDirection = null;

  moveTimer = 0;
  guardTimer = 0;

  createLevel(currentLevel);
  createGuards();

  running = true;

  message.textContent = "Find the key and escape!";

  overlay.classList.add("hidden");
  levelSelection.classList.remove("show");

  updateHUD();
  draw();
}

// ==========================================
// PLAYER
// ==========================================

function movePlayer(dx, dy) {
  if (!running || caught || escaped) return;

  const nx = player.x + dx;
  const ny = player.y + dy;

  if (isWall(nx, ny)) return;

  player.x = nx;
  player.y = ny;

  hidden = false;

  checkObjects();

  if (!running) return;

  for (const guard of guards) {
    if (guard.x === player.x && guard.y === player.y) {
      loseGame();
      return;
    }
  }

  draw();
}

function checkObjects() {
  if (
    player.x === key.x &&
    player.y === key.y &&
    !hasKey
  ) {
    hasKey = true;
    message.textContent = "Key collected! Find the door.";
    updateHUD();
  }

  if (
    player.x === door.x &&
    player.y === door.y
  ) {
    if (hasKey) {
      door.open = true;
      message.textContent = "Door opened! Reach the exit!";
    } else {
      message.textContent = "You need the key first!";
    }
  }

  if (
    player.x === exit.x &&
    player.y === exit.y
  ) {
    if (door.open && hasKey) {
      winGame();
    } else {
      message.textContent = "Find the key and open the door!";
    }
  }
}

// ==========================================
// HIDE
// ==========================================

function hidePlayer() {
  if (!running) return;

  const nearbyWall =
    isWall(player.x + 1, player.y) ||
    isWall(player.x - 1, player.y) ||
    isWall(player.x, player.y + 1) ||
    isWall(player.x, player.y - 1);

  if (nearbyWall) {
    hidden = true;
    message.textContent = "HIDDEN! Guards cannot see you.";
  } else {
    message.textContent = "Move beside a wall to hide!";
  }

  draw();
}

// ==========================================
// WIN
// ==========================================

function winGame() {
  if (escaped || caught) return;

  escaped = true;
  running = false;
  touchDirection = null;

  addCoins(WIN_REWARD);

  if (currentLevel < TOTAL_LEVELS) {
    unlockLevel(currentLevel + 1);
  }

  overlayTitle.textContent =
    currentLevel === TOTAL_LEVELS
      ? "ALL LEVELS COMPLETE!"
      : `LEVEL ${currentLevel} COMPLETE!`;

  overlayText.textContent = "You earned 10 coins!";

  startBtn.textContent =
    currentLevel === TOTAL_LEVELS
      ? "LEVEL MENU"
      : "NEXT LEVEL";

  overlay.classList.remove("hidden");
}

// ==========================================
// LOSE - NEGATIVE COINS ALLOWED
// ==========================================

function loseGame() {
  if (caught || escaped) return;

  caught = true;
  running = false;
  touchDirection = null;

  if (!attemptCharged) {
    coins -= LOSE_PENALTY;
    attemptCharged = true;
    saveProgress();
  }

  updateCoins();

  overlayTitle.textContent = "CAUGHT BY GUARDS!";
  overlayText.textContent =
    "2 coins deducted! Balance: " + coins;

  startBtn.textContent = "TRY AGAIN";

  overlay.classList.remove("hidden");
}

// ==========================================
// DRAW
// ==========================================

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;

      if (map[y][x] === 1) {
        ctx.fillStyle = "#344354";
        ctx.fillRect(px, py, TILE, TILE);

        ctx.fillStyle = "#526579";
        ctx.fillRect(px + 4, py + 4, 32, 32);
      } else {
        ctx.fillStyle =
          (x + y) % 2 === 0 ? "#172a2c" : "#1b3030";

        ctx.fillRect(px, py, TILE, TILE);
      }

      ctx.strokeStyle = "#263b3c";
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }

  // EXIT
  ctx.fillStyle = "#1d8d56";
  ctx.fillRect(exit.x * TILE + 4, exit.y * TILE + 4, 32, 32);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText("E", exit.x * TILE + 20, exit.y * TILE + 27);

  // DOOR
  ctx.fillStyle = door.open ? "#1c9c67" : "#b47b30";
  ctx.fillRect(door.x * TILE + 5, door.y * TILE + 3, 30, 34);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Arial";
  ctx.fillText(
    door.open ? "✓" : "D",
    door.x * TILE + 20,
    door.y * TILE + 26
  );

  // KEY
  if (!hasKey) {
    const kx = key.x * TILE + 20;
    const ky = key.y * TILE + 20;

    ctx.fillStyle = "#ffdf42";
    ctx.beginPath();
    ctx.arc(kx, ky, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(kx + 6, ky - 3, 13, 6);
  }

  // GUARDS
  for (const guard of guards) {
    const gx = guard.x * TILE + 20;
    const gy = guard.y * TILE + 20;

    ctx.fillStyle = "#e94d52";
    ctx.beginPath();
    ctx.arc(gx, gy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px Arial";
    ctx.fillText("G", gx, gy + 5);
  }

  // PLAYER
  const px = player.x * TILE + 20;
  const py = player.y * TILE + 20;

  ctx.fillStyle = hidden ? "#5acbff" : "#38a8ff";
  ctx.beginPath();
  ctx.arc(px, py, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px Arial";
  ctx.fillText("P", px, py + 5);

  ctx.textAlign = "start";
}

// ==========================================
// KEYBOARD
// ==========================================

document.addEventListener("keydown", event => {
  const name = event.key.toLowerCase();

  const directions = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0]
  };

  if (name === " ") {
    event.preventDefault();
    hidePlayer();
    return;
  }

  if (directions[name]) {
    event.preventDefault();

    if (!keysPressed[name]) {
      keysPressed[name] = true;
      movePlayer(...directions[name]);
    }
  }
});

document.addEventListener("keyup", event => {
  keysPressed[event.key.toLowerCase()] = false;
});

// ==========================================
// MOBILE BUTTONS - HOLD TO RUN
// ==========================================

document.querySelectorAll(".mobile-controls button").forEach(button => {

  button.addEventListener("pointerdown", event => {
    event.preventDefault();

    if (!running) return;

    try {
      button.setPointerCapture(event.pointerId);
    } catch (error) {}

    const dir = button.dataset.dir;

    const directions = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0]
    };

    if (!directions[dir]) return;

    touchDirection = dir;
    moveTimer = 0;

    // First step immediately
    movePlayer(...directions[dir]);
  });

  function stopMoving(event) {
    event.preventDefault();
    touchDirection = null;
    moveTimer = 0;
  }

  button.addEventListener("pointerup", stopMoving);
  button.addEventListener("pointercancel", stopMoving);
  button.addEventListener("lostpointercapture", stopMoving);
});

window.addEventListener("blur", () => {
  touchDirection = null;
});

// ==========================================
// GAME LOOP - CONTINUOUS MOVEMENT
// ==========================================

let lastFrame = 0;

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000, 0.05);
  lastFrame = timestamp;

  if (running) {
    moveTimer += delta;
    guardTimer += delta;

    const directions = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0]
    };

    // Hold button: repeat movement every 0.12 seconds
    if (touchDirection && moveTimer >= 0.12) {
      moveTimer = 0;

      const dir = directions[touchDirection];

      if (dir) {
        movePlayer(...dir);
      }
    }

    const guardSpeed = Math.max(
      0.25,
      0.75 - currentLevel * 0.018
    );

    if (guardTimer >= guardSpeed) {
      guardTimer = 0;
      moveGuards();
      draw();
    }
  }

  requestAnimationFrame(gameLoop);
}

// ==========================================
// MAIN BUTTONS
// ==========================================

startBtn.addEventListener("click", () => {
  if (escaped) {
    selectedLevel =
      currentLevel >= TOTAL_LEVELS ? 1 : currentLevel + 1;
  } else {
    selectedLevel = currentLevel;
  }

  startSelectedLevel();
});

document.getElementById("menuBtn").addEventListener(
  "click",
  showLevelSelection
);

document.getElementById("levelsBtn").addEventListener(
  "click",
  showLevelSelection
);

document.getElementById("restartBtn").addEventListener(
  "click",
  () => {
    selectedLevel = currentLevel;
    startSelectedLevel();
  }
);

document.getElementById("hideBtn").addEventListener(
  "click",
  hidePlayer
);

// ==========================================
// INITIALIZE
// ==========================================

createLevel(1);
draw();
updateHUD();
showLevelSelection();

requestAnimationFrame(gameLoop);
