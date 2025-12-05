const container = document.getElementById('container');
const fourSidedCheckbox = document.getElementById('fourSided');
const powerupsCheckbox = document.getElementById('powerups');
const powerupIntervalInput = document.getElementById('powerupInterval');
const resetButton = document.getElementById('reset');
const scoresDiv = document.getElementById('scores');

// Colors - 4 distinct colors for 4-sided mode
const COLORS = [
    0xe8e4df,   // 0: Cream/off-white (left)
    0x3d5a6c,   // 1: Teal/dark blue (right)
    0xe07a5f,   // 2: Terracotta/coral (top)
    0x81b29a    // 3: Sage green (bottom)
];

const BALL_COLOR = 0x222222;
const POWERUP_COLOR = 0xffd700; // Gold

const COLOR_NAMES = ['Cream', 'Teal', 'Coral', 'Sage'];
const COLOR_HEX = ['#e8e4df', '#3d5a6c', '#e07a5f', '#81b29a'];

// Game settings
const CANVAS_SIZE = 600;
const GRID_SIZE = 20;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
const BALL_RADIUS = 8;
const BALL_SPEED = 4;

let fourSidedMode = false;
let powerupsEnabled = false;
let powerupTimer = null;
let powerups = []; // [{ cellX, cellY, mesh }, ...]

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x667eea);

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
const powerupMaterial = new THREE.MeshBasicMaterial({ color: POWERUP_COLOR });

// Geometries
const cellGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
const ballGeometry = new THREE.CircleGeometry(BALL_RADIUS, 32);
const powerupGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);

function initGrid() {
    // Clear existing meshes
    cellMeshes.forEach(row => row.forEach(mesh => scene.remove(mesh)));
    cellMeshes = [];

    grid = [];
    fourSidedMode = fourSidedCheckbox.checked;

    for (let y = 0; y < GRID_SIZE; y++) {
        grid[y] = [];
        cellMeshes[y] = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            let teamIndex;
            if (fourSidedMode) {
                const isLeft = x < GRID_SIZE / 2;
                const isTop = y < GRID_SIZE / 2;
                if (isLeft && isTop) {
                    teamIndex = 0;
                } else if (!isLeft && isTop) {
                    teamIndex = 2;
                } else if (isLeft && !isTop) {
                    teamIndex = 3;
                } else {
                    teamIndex = 1;
                }
            } else {
                teamIndex = x < GRID_SIZE / 2 ? 0 : 1;
            }
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

    // Left ball
    balls.push({
        x: BALL_RADIUS + 10,
        y: CANVAS_SIZE / 2,
        vx: BALL_SPEED,
        vy: BALL_SPEED * (Math.random() - 0.5) * 2,
        team: 0,
        bounceEdge: 'left'
    });

    // Right ball
    balls.push({
        x: CANVAS_SIZE - BALL_RADIUS - 10,
        y: CANVAS_SIZE / 2,
        vx: -BALL_SPEED,
        vy: BALL_SPEED * (Math.random() - 0.5) * 2,
        team: 1,
        bounceEdge: 'right'
    });

    if (fourSidedMode) {
        // Top ball
        balls.push({
            x: CANVAS_SIZE / 2,
            y: BALL_RADIUS + 10,
            vx: BALL_SPEED * (Math.random() - 0.5) * 2,
            vy: BALL_SPEED,
            team: 2,
            bounceEdge: 'top'
        });

        // Bottom ball
        balls.push({
            x: CANVAS_SIZE / 2,
            y: CANVAS_SIZE - BALL_RADIUS - 10,
            vx: BALL_SPEED * (Math.random() - 0.5) * 2,
            vy: -BALL_SPEED,
            team: 3,
            bounceEdge: 'bottom'
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

    // Wall bouncing based on which edge the ball belongs to
    if (ball.bounceEdge === 'left') {
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx);
        }
    } else if (ball.bounceEdge === 'right') {
        if (ball.x + BALL_RADIUS > CANVAS_SIZE) {
            ball.x = CANVAS_SIZE - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx);
        }
    } else if (ball.bounceEdge === 'top') {
        if (ball.y - BALL_RADIUS < 0) {
            ball.y = BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
        }
    } else if (ball.bounceEdge === 'bottom') {
        if (ball.y + BALL_RADIUS > CANVAS_SIZE) {
            ball.y = CANVAS_SIZE - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy);
        }
    }

    // Top/bottom wall bouncing for left/right balls
    if (ball.bounceEdge === 'left' || ball.bounceEdge === 'right') {
        if (ball.y - BALL_RADIUS < 0) {
            ball.y = BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
        }
        if (ball.y + BALL_RADIUS > CANVAS_SIZE) {
            ball.y = CANVAS_SIZE - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy);
        }
    }

    // Left/right wall bouncing for top/bottom balls
    if (ball.bounceEdge === 'top' || ball.bounceEdge === 'bottom') {
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx);
        }
        if (ball.x + BALL_RADIUS > CANVAS_SIZE) {
            ball.x = CANVAS_SIZE - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx);
        }
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

function addBall(team, bounceEdge, spawnX, spawnY) {
    // Random angle
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * BALL_SPEED;
    const vy = Math.sin(angle) * BALL_SPEED;

    const ball = { x: spawnX, y: spawnY, vx, vy, team, bounceEdge };
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
            // Ball hit the powerup - spawn new ball of same type at powerup location
            const spawnX = powerup.cellX * CELL_SIZE + CELL_SIZE / 2;
            const spawnY = powerup.cellY * CELL_SIZE + CELL_SIZE / 2;
            addBall(ball.team, ball.bounceEdge, spawnX, spawnY);
            scene.remove(powerup.mesh);
            powerups.splice(i, 1);
        }
    }
}

function countCells() {
    const counts = [0, 0, 0, 0];
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            counts[grid[y][x]]++;
        }
    }
    return counts;
}

function updateScores() {
    const counts = countCells();
    const numColors = fourSidedMode ? 4 : 2;

    scoresDiv.innerHTML = '';
    for (let i = 0; i < numColors; i++) {
        const scoreEl = document.createElement('span');
        scoreEl.className = 'score';
        scoreEl.style.backgroundColor = COLOR_HEX[i];
        scoreEl.textContent = `${COLOR_NAMES[i]}: ${counts[i]}`;
        scoresDiv.appendChild(scoreEl);
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
fourSidedCheckbox.addEventListener('change', reset);
powerupsCheckbox.addEventListener('change', reset);
powerupIntervalInput.addEventListener('change', () => {
    if (powerupsEnabled) {
        startPowerupTimer();
    }
});
resetButton.addEventListener('click', reset);

// Initialize and start
reset();
gameLoop();
