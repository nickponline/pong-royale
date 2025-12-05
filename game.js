const container = document.getElementById('container');
const teamsSlider = document.getElementById('teamsSlider');
const teamsValue = document.getElementById('teamsValue');
const powerupsCheckbox = document.getElementById('powerups');
const powerupIntervalInput = document.getElementById('powerupInterval');
const sfxCheckbox = document.getElementById('sfx');
const resetButton = document.getElementById('reset');
const scoresDiv = document.getElementById('scores');

// Colors - 8 distinct colors
const COLORS = [
    0xe8e4df,   // 0: Cream/off-white
    0x3d5a6c,   // 1: Teal/dark blue
    0xe07a5f,   // 2: Terracotta/coral
    0x81b29a,   // 3: Sage green
    0x9b5de5,   // 4: Purple
    0xf15bb5,   // 5: Pink
    0x00bbf9,   // 6: Sky blue
    0xfee440    // 7: Yellow
];

const BALL_COLOR = 0x222222;
const POWERUP_COLOR = 0xffd700; // Gold

const COLOR_NAMES = ['Cream', 'Teal', 'Coral', 'Sage', 'Purple', 'Pink', 'Sky', 'Yellow'];
const COLOR_HEX = ['#e8e4df', '#3d5a6c', '#e07a5f', '#81b29a', '#9b5de5', '#f15bb5', '#00bbf9', '#fee440'];

// Game settings
const CANVAS_SIZE = 600;
const GRID_SIZE = 20;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
const BALL_RADIUS = 8;
const BALL_SPEED = 4;

let numTeams = 2;
let powerupsEnabled = false;
let powerupTimer = null;
let powerups = []; // [{ cellX, cellY, mesh }, ...]

// Audio setup
let audioContext = null;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playHitSound() {
    if (!audioContext || !sfxCheckbox.checked) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
}

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.OrthographicCamera(
    0, CANVAS_SIZE,
    0, -CANVAS_SIZE,
    0.1, 1000
);
camera.position.z = 100;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
container.appendChild(renderer.domElement);

// Grid state
let grid = [];
let cellMeshes = [];
let ballMeshes = [];
let balls = [];

// Materials cache
const materials = COLORS.map(color => new THREE.MeshBasicMaterial({ color }));
const ballMaterial = new THREE.MeshBasicMaterial({ color: BALL_COLOR });

// Create powerup textures with symbols and borders
function createPowerupTexture(bgColor, symbol) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 64, 64);

    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 56, 56);

    // Symbol
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

const powerupMaterial = new THREE.MeshBasicMaterial({
    map: createPowerupTexture('#ffd700', '+')
});

// Geometries
const cellGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
const ballGeometry = new THREE.CircleGeometry(BALL_RADIUS, 32);
const powerupGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

function initGrid() {
    // Clear existing meshes
    cellMeshes.forEach(row => row.forEach(mesh => scene.remove(mesh)));
    cellMeshes = [];

    grid = [];
    numTeams = parseInt(teamsSlider.value, 10);

    for (let y = 0; y < GRID_SIZE; y++) {
        grid[y] = [];
        cellMeshes[y] = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            // Divide grid into sectors based on angle from center
            const centerX = GRID_SIZE / 2;
            const centerY = GRID_SIZE / 2;
            const angle = Math.atan2(y - centerY + 0.5, x - centerX + 0.5);
            const normalizedAngle = (angle + Math.PI) / (2 * Math.PI); // 0 to 1
            const teamIndex = Math.floor(normalizedAngle * numTeams) % numTeams;

            grid[y][x] = teamIndex;

            // Create mesh for this cell
            const mesh = new THREE.Mesh(cellGeometry, materials[teamIndex]);
            mesh.position.x = x * CELL_SIZE + CELL_SIZE / 2;
            mesh.position.y = -(y * CELL_SIZE + CELL_SIZE / 2);
            scene.add(mesh);
            cellMeshes[y][x] = mesh;
        }
    }
}

function initBalls() {
    // Clear existing ball meshes
    ballMeshes.forEach(mesh => scene.remove(mesh));
    ballMeshes = [];
    balls = [];

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;
    const spawnRadius = CANVAS_SIZE / 2 - BALL_RADIUS - 20;

    // Create one ball per team at the edge of their sector
    for (let i = 0; i < numTeams; i++) {
        const angle = (i / numTeams) * Math.PI * 2 - Math.PI + (Math.PI / numTeams);
        const x = centerX + Math.cos(angle) * spawnRadius;
        const y = centerY + Math.sin(angle) * spawnRadius;

        // Velocity points inward with some randomness
        const vx = -Math.cos(angle) * BALL_SPEED + (Math.random() - 0.5) * 2;
        const vy = -Math.sin(angle) * BALL_SPEED + (Math.random() - 0.5) * 2;

        // Normalize velocity
        const speed = Math.sqrt(vx * vx + vy * vy);

        balls.push({
            x: x,
            y: y,
            vx: (vx / speed) * BALL_SPEED,
            vy: (vy / speed) * BALL_SPEED,
            team: i,
            spawnAngle: angle
        });
    }

    // Create meshes for balls
    balls.forEach(ball => {
        const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
        mesh.position.x = ball.x;
        mesh.position.y = -ball.y;
        mesh.position.z = 1; // Above cells
        scene.add(mesh);
        ballMeshes.push(mesh);
    });
}

function updateBall(ball, index) {
    // Move ball
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Wall bouncing - all balls bounce off all edges
    if (ball.x - BALL_RADIUS < 0) {
        ball.x = BALL_RADIUS;
        ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + BALL_RADIUS > CANVAS_SIZE) {
        ball.x = CANVAS_SIZE - BALL_RADIUS;
        ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - BALL_RADIUS < 0) {
        ball.y = BALL_RADIUS;
        ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_RADIUS > CANVAS_SIZE) {
        ball.y = CANVAS_SIZE - BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy);
    }

    // Check collision with cells
    checkCellCollision(ball);

    // Update mesh position
    ballMeshes[index].position.x = ball.x;
    ballMeshes[index].position.y = -ball.y;
}

function checkCellCollision(ball) {
    const centerCellX = Math.floor(ball.x / CELL_SIZE);
    const centerCellY = Math.floor(ball.y / CELL_SIZE);

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const cellX = centerCellX + dx;
            const cellY = centerCellY + dy;

            if (cellX < 0 || cellX >= GRID_SIZE || cellY < 0 || cellY >= GRID_SIZE) {
                continue;
            }

            if (grid[cellY][cellX] !== ball.team) {
                const cellLeft = cellX * CELL_SIZE;
                const cellRight = cellLeft + CELL_SIZE;
                const cellTop = cellY * CELL_SIZE;
                const cellBottom = cellTop + CELL_SIZE;

                const closestX = Math.max(cellLeft, Math.min(ball.x, cellRight));
                const closestY = Math.max(cellTop, Math.min(ball.y, cellBottom));

                const distX = ball.x - closestX;
                const distY = ball.y - closestY;
                const distance = Math.sqrt(distX * distX + distY * distY);

                if (distance < BALL_RADIUS) {
                    // Convert cell
                    grid[cellY][cellX] = ball.team;
                    cellMeshes[cellY][cellX].material = materials[ball.team];
                    playHitSound();

                    // Bounce
                    const overlapX = BALL_RADIUS - Math.abs(distX);
                    const overlapY = BALL_RADIUS - Math.abs(distY);

                    if (overlapX < overlapY) {
                        ball.vx = -ball.vx;
                        ball.x += distX > 0 ? overlapX : -overlapX;
                    } else {
                        ball.vy = -ball.vy;
                        ball.y += distY > 0 ? overlapY : -overlapY;
                    }

                    // Add randomness
                    ball.vx += (Math.random() - 0.5) * 0.5;
                    ball.vy += (Math.random() - 0.5) * 0.5;

                    // Normalize speed
                    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
                    ball.vx = (ball.vx / speed) * BALL_SPEED;
                    ball.vy = (ball.vy / speed) * BALL_SPEED;

                    return;
                }
            }
        }
    }
}

function spawnPowerup() {
    // Pick random cell
    const cellX = Math.floor(Math.random() * GRID_SIZE);
    const cellY = Math.floor(Math.random() * GRID_SIZE);

    const mesh = new THREE.Mesh(powerupGeometry, powerupMaterial);
    mesh.position.x = cellX * CELL_SIZE + CELL_SIZE / 2;
    mesh.position.y = -(cellY * CELL_SIZE + CELL_SIZE / 2);
    mesh.position.z = 0.5; // Above cells but below balls
    scene.add(mesh);

    powerups.push({ cellX, cellY, mesh });
}

function removeAllPowerups() {
    powerups.forEach(p => scene.remove(p.mesh));
    powerups = [];
}

function startPowerupTimer() {
    if (powerupTimer) {
        clearInterval(powerupTimer);
    }
    const interval = parseInt(powerupIntervalInput.value, 10) * 1000;
    powerupTimer = setInterval(() => {
        if (powerupsEnabled) {
            spawnPowerup();
        }
    }, interval);
}

function stopPowerupTimer() {
    if (powerupTimer) {
        clearInterval(powerupTimer);
        powerupTimer = null;
    }
    removeAllPowerups();
}

function addBall(team, spawnX, spawnY) {
    // Random angle
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * BALL_SPEED;
    const vy = Math.sin(angle) * BALL_SPEED;

    const ball = { x: spawnX, y: spawnY, vx, vy, team };
    balls.push(ball);

    const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
    mesh.position.x = ball.x;
    mesh.position.y = -ball.y;
    mesh.position.z = 1;
    scene.add(mesh);
    ballMeshes.push(mesh);
}

function checkPowerupCollision(ball) {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const powerup = powerups[i];

        const cellLeft = powerup.cellX * CELL_SIZE;
        const cellRight = cellLeft + CELL_SIZE;
        const cellTop = powerup.cellY * CELL_SIZE;
        const cellBottom = cellTop + CELL_SIZE;

        const closestX = Math.max(cellLeft, Math.min(ball.x, cellRight));
        const closestY = Math.max(cellTop, Math.min(ball.y, cellBottom));

        const distX = ball.x - closestX;
        const distY = ball.y - closestY;
        const distance = Math.sqrt(distX * distX + distY * distY);

        if (distance < BALL_RADIUS) {
            // Spawn new ball of same team at powerup location
            const spawnX = powerup.cellX * CELL_SIZE + CELL_SIZE / 2;
            const spawnY = powerup.cellY * CELL_SIZE + CELL_SIZE / 2;
            addBall(ball.team, spawnX, spawnY);
            scene.remove(powerup.mesh);
            powerups.splice(i, 1);
        }
    }
}

function countCells() {
    const counts = new Array(8).fill(0);
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            counts[grid[y][x]]++;
        }
    }
    return counts;
}

function countBalls() {
    const counts = new Array(8).fill(0);
    balls.forEach(ball => counts[ball.team]++);
    return counts;
}

function updateScores() {
    const cellCounts = countCells();
    const ballCounts = countBalls();
    const totalCells = GRID_SIZE * GRID_SIZE;

    scoresDiv.innerHTML = '';
    for (let i = 0; i < numTeams; i++) {
        const percentage = (cellCounts[i] / totalCells) * 100;

        const healthBar = document.createElement('div');
        healthBar.className = 'health-bar';

        const label = document.createElement('div');
        label.className = 'health-bar-label';
        label.textContent = `${COLOR_NAMES[i]} (${ballCounts[i]})`;

        const track = document.createElement('div');
        track.className = 'health-bar-track';

        const fill = document.createElement('div');
        fill.className = 'health-bar-fill';
        fill.style.width = `${percentage}%`;
        fill.style.backgroundColor = COLOR_HEX[i];

        track.appendChild(fill);
        healthBar.appendChild(label);
        healthBar.appendChild(track);
        scoresDiv.appendChild(healthBar);
    }
}

function gameLoop() {
    balls.forEach((ball, index) => {
        updateBall(ball, index);
        if (powerupsEnabled) {
            checkPowerupCollision(ball);
        }
    });
    updateScores();
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

function reset() {
    initGrid();
    initBalls();
    stopPowerupTimer();
    powerupsEnabled = powerupsCheckbox.checked;
    if (powerupsEnabled) {
        startPowerupTimer();
    }
}

// Event listeners
teamsSlider.addEventListener('input', () => {
    teamsValue.textContent = teamsSlider.value;
});
teamsSlider.addEventListener('change', reset);
powerupsCheckbox.addEventListener('change', reset);
powerupIntervalInput.addEventListener('change', () => {
    if (powerupsEnabled) {
        startPowerupTimer();
    }
});
resetButton.addEventListener('click', reset);

// Initialize audio on first user interaction
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

// Initialize and start
reset();
gameLoop();
