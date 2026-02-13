document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // UI要素
    const uiScore = document.getElementById('score-val');
    const uiLives = document.getElementById('lives-val'); 
    const uiSpeed = document.getElementById('speed-val');
    const nitroBar = document.getElementById('nitro-bar');
    
    const startMenu = document.getElementById('start-menu');
    const pauseMenu = document.getElementById('pause-overlay');
    const gameOverScreen = document.getElementById('game-over');
    const diffDisplay = document.getElementById('diff-display');
    const transitionLayer = document.getElementById('transition-layer');
    const blackCurtain = document.getElementById('black-curtain');

    const btnStart = document.getElementById('start-button');
    const btnResume = document.getElementById('btn-resume');
    const btnQuit = document.getElementById('btn-quit');
    const btnRetry = document.getElementById('btn-retry');
    const btnTitle = document.getElementById('btn-title');
    const diffSelector = document.getElementById('difficulty-selector');

    // ゲーム定数
    const ROAD_WIDTH = 2200; 
    const SEGMENT_LENGTH = 200;
    const DRAW_DISTANCE = 300; 
    const BASE_FOV = 0.8;

    const COLORS = {
        sky: "#87CEEB",
        ground: "#3c8c40",
        road: "#333333",
    };

    let horizonY = 0;
    let centerX = 0;
    const CAM_HEIGHT_TPS = 700;   
    let currentCamHeight = CAM_HEIGHT_TPS;

    // ゲーム状態
    let player = { x: 0, z: 0, speed: 0 };
    let enemies = [];
    let particles = [];
    let lives = 3;
    let score = 0; 
    let gameState = 'start';
    let keys = {};
    
    let invincibility = 0;
    let nitro = 100;
    
    let shakeX = 0; let shakeY = 0;
    let currentFOV = BASE_FOV;
    let currTurn = 0;

    let menuSelection = 0; 
    const difficulties = [
        { label: "EASY", val: 1.0, max: 220 },
        { label: "NORMAL", val: 1.5, max: 300 },
        { label: "HARD", val: 2.0, max: 420 }
    ];
    let diffIndex = 1; 
    let difficultyMultiplier = 1.5;
    let maxSpeedSetting = 300;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        centerX = canvas.width / 2;
        horizonY = canvas.height / 2.3;
    }
    window.addEventListener('resize', resize);
    resize();

    setTimeout(() => {
        triggerTransition(() => {
            blackCurtain.style.opacity = 0; 
            setTimeout(() => blackCurtain.style.display = 'none', 300);
        });
    }, 100);

    function triggerTransition(callback) {
        transitionLayer.style.display = 'flex'; 
        transitionLayer.classList.remove('animating');
        void transitionLayer.offsetWidth;
        transitionLayer.classList.add('animating');
        setTimeout(() => { if (callback) callback(); }, 500);
        setTimeout(() => {
            transitionLayer.classList.remove('animating');
            transitionLayer.style.display = 'none'; 
        }, 1000);
    }

    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) {
            if (gameState !== 'playing') e.preventDefault();
        }
        if (gameState !== 'playing') handleMenuInput(e.code);
        else if (e.code === 'KeyP') performMenuAction('pause');
    });
    window.addEventListener('keyup', e => keys[e.code] = false);

    function handleMenuInput(code) {
        if (code === 'ArrowUp' || code === 'ArrowDown') {
            menuSelection = (menuSelection === 0) ? 1 : 0;
            updateMenuVisuals();
        }
        else if (code === 'ArrowLeft' || code === 'ArrowRight') {
            if (gameState === 'start') {
                changeDifficulty(code === 'ArrowLeft' ? -1 : 1);
                menuSelection = 1; updateMenuVisuals();
            }
        }
        else if (code === 'Enter' || code === 'Space') executeMenuSelection();
    }

    function updateMenuVisuals() {
        if (gameState === 'start') {
            btnStart.classList.toggle('selected', menuSelection === 0);
            diffSelector.classList.toggle('selected', menuSelection === 1);
        } else if (gameState === 'paused') {
            btnResume.classList.toggle('selected', menuSelection === 0);
            btnQuit.classList.toggle('selected', menuSelection === 1);
        } else if (gameState === 'gameover') {
            btnRetry.classList.toggle('selected', menuSelection === 0);
            btnTitle.classList.toggle('selected', menuSelection === 1);
        }
    }

    function executeMenuSelection() {
        if (gameState === 'start') performMenuAction('start');
        else if (gameState === 'paused') performMenuAction(menuSelection === 0 ? 'resume' : 'quit');
        else if (gameState === 'gameover') performMenuAction(menuSelection === 0 ? 'retry' : 'quit');
    }

    function changeDifficulty(dir) {
        diffIndex = (diffIndex + dir + difficulties.length) % difficulties.length;
        diffDisplay.innerText = difficulties[diffIndex].label;
    }

    function performMenuAction(action) {
        if (action === 'start' || action === 'retry') {
            triggerTransition(() => {
                startMenu.style.display = 'none';
                gameOverScreen.style.display = 'none';
                initGame();
            });
        } else if (action === 'pause') {
            gameState = 'paused';
            pauseMenu.style.display = 'flex';
            menuSelection = 0; updateMenuVisuals();
        } else if (action === 'resume') {
            gameState = 'playing';
            pauseMenu.style.display = 'none';
        } else if (action === 'quit') {
            triggerTransition(() => location.reload());
        }
    }

    function initGame() {
        const setting = difficulties[diffIndex];
        difficultyMultiplier = setting.val;
        maxSpeedSetting = setting.max;
        player.x = 0; player.z = 0; player.speed = 0;
        enemies = []; particles = [];
        lives = 3; score = 0; nitro = 100;
        currTurn = 0; invincibility = 0;
        uiLives.innerText = lives; uiScore.innerText = "0"; uiSpeed.innerText = "0";
        gameState = 'playing';
    }

    function createExplosion(x, y, scale) {
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 20 * scale;
            particles.push({
                x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (Math.random() * 15 * scale),
                life: 1.0, color: ['#ff0000', '#ff8800', '#ffff00', '#ffffff'][Math.floor(Math.random() * 4)],
                size: (Math.random() * 25 + 5) * scale, gravity: 0.8 * scale
            });
        }
    }

    function project(p, cameraX, cameraY, cameraZ, fov) {
        let worldX = p.x - cameraX;
        let worldY = p.y - cameraY;
        let worldZ = p.z - cameraZ;
        if (worldZ <= 0) worldZ = 1;
        let scale = fov / (worldZ / ROAD_WIDTH);
        return { x: centerX + (scale * worldX), y: horizonY + (scale * worldY), w: scale * ROAD_WIDTH, scale: scale };
    }

    function update() {
        if (gameState !== 'playing') return;

        if (keys['ArrowLeft']) currTurn = Math.max(-1, currTurn - 0.08);
        else if (keys['ArrowRight']) currTurn = Math.min(1, currTurn + 0.08);
        else currTurn *= 0.85;

        player.x += currTurn * (player.speed * 0.40); 
        player.x = Math.max(-1800, Math.min(player.x, 1800));

        let topSpeed = maxSpeedSetting;
        let accel = (keys['Space'] && nitro > 0) ? 2.5 : 0.6;
        if (keys['Space'] && nitro > 0) { topSpeed += 60; nitro -= 0.5; }
        else if (nitro < 100) nitro += 0.15;
        
        nitroBar.style.width = nitro + "%";
        if (player.speed < topSpeed) player.speed += accel; else player.speed *= 0.99; 
        player.z += player.speed * 1.6;

        uiSpeed.innerText = Math.floor(player.speed);
        if (player.speed > 0) score += (player.speed * 0.005); 
        uiScore.innerText = Math.floor(score);

        currentFOV += ( (BASE_FOV + (player.speed / 500) * 0.5) - currentFOV) * 0.05;

        if (player.speed > 200) {
            let intensity = (player.speed - 200) / 100;
            shakeX = (Math.random() - 0.5) * intensity * 4;
            shakeY = (Math.random() - 0.5) * intensity * 3;
        } else { shakeX = 0; shakeY = 0; }
        
        if (invincibility > 0) invincibility -= 0.016;

        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life -= 0.025;
            if (p.life <= 0) particles.splice(i, 1);
        }

        if (Math.random() < 0.008 * difficultyMultiplier) {
            let spawnZ = player.z + 80000;
            let canSpawn = true;
            for (let e of enemies) if (Math.abs(e.z - spawnZ) < 6000) canSpawn = false;
            if (canSpawn) {
                let lane = (Math.random() > 0.5 ? 900 : -900) + (Math.random() - 0.5) * 500;
                enemies.push({ x: lane, z: spawnZ, speed: 100 + Math.random() * 100, hue: Math.floor(Math.random() * 360) });
            }
        }

        enemies.forEach((enemy, i) => {
            enemy.z += enemy.speed;
            if (enemy.z < player.z - 2000) enemies.splice(i, 1);

            let distZ = enemy.z - player.z;
            let distX = Math.abs(enemy.x - player.x);
            if (invincibility <= 0 && distZ > -250 && distZ < 650 && distX < 750) {
                lives--; score = Math.max(0, score - 250);
                uiLives.innerText = lives; uiScore.innerText = Math.floor(score);
                invincibility = 2.0; player.speed *= 0.4; 
                createExplosion(centerX, canvas.height - 150, 1.5); 
                if (lives <= 0) endGame();
            }
        });
    }

    function drawPseudo3DObject(ctx, p, n) {
        let type = (n % 7 === 0 || n % 11 === 0) ? 'building' : 'tree';
        let hS = type === 'building' ? 6000 : 3500;
        let objH = hS * p.scale; let objW = 800 * p.scale;
        let baseX = p.x + (p.w * (n % 2 !== 0 ? -1.8 : 1.8));

        ctx.save();
        ctx.translate(baseX, p.y);
        if (type === 'tree') {
            ctx.fillStyle = "#6d4c41"; ctx.fillRect(-objW*0.2, -objH*0.3, objW*0.4, objH*0.3);
            ctx.fillStyle = (n % 3 === 0) ? "#388e3c" : "#43a047"; 
            ctx.beginPath(); ctx.arc(0, -objH*0.5, objW*0.6, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = "#546e7a"; ctx.fillRect(-objW/2, -objH, objW, objH);
            ctx.fillStyle = "#b0bec5"; ctx.fillRect(-objW*0.3, -objH*0.8, objW*0.2, objH*0.1);
        }
        ctx.restore();
    }

    function drawSportsCar(ctx, x, y, scale, hue, isPlayer, nitroActive) {
        const w = 900 * scale; const h = 450 * scale; 
        ctx.save(); 
        ctx.translate(x, y);
        
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();

        if (isPlayer) ctx.rotate(currTurn * 0.12);

        let bodyColor = isPlayer ? "#d50000" : `hsl(${hue}, 80%, 55%)`;
        
        ctx.fillStyle = "#111";
        ctx.fillRect(-w*0.45, -h*0.4, w*0.15, h*0.4);
        ctx.fillRect(w*0.3, -h*0.4, w*0.15, h*0.4);

        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(-w*0.5, -h*0.2); ctx.lineTo(w*0.5, -h*0.2);
        ctx.lineTo(w*0.4, -h*0.6); ctx.lineTo(-w*0.4, -h*0.6);
        ctx.fill();

        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.moveTo(-w*0.3, -h*0.6); ctx.lineTo(w*0.3, -h*0.6);
        ctx.lineTo(w*0.2, -h*0.9); ctx.lineTo(-w*0.2, -h*0.9);
        ctx.fill();

        ctx.fillStyle = isPlayer && keys['Space'] ? "#00ffff" : "#ff4400";
        ctx.fillRect(-w*0.4, -h*0.4, w*0.1, h*0.1);
        ctx.fillRect(w*0.3, -h*0.4, w*0.1, h*0.1);

        ctx.restore();
    }

    function render() {
        ctx.save();
        ctx.fillStyle = COLORS.sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = COLORS.ground; 
        ctx.fillRect(0, horizonY + shakeY, canvas.width, canvas.height);

        let startPos = Math.floor(player.z / SEGMENT_LENGTH);
        let camX = player.x * 0.7 + currTurn * 1500;
        let camH = currentCamHeight + shakeY * 10;

        for (let n = DRAW_DISTANCE; n > 0; n--) {
            let p1 = project({ x: 0, y: camH, z: (startPos + n) * SEGMENT_LENGTH }, camX, shakeY, player.z, currentFOV);
            let p2 = project({ x: 0, y: camH, z: (startPos + n - 1) * SEGMENT_LENGTH }, camX, shakeY, player.z, currentFOV);
            
            if (p1.y <= horizonY + shakeY) continue;
            
            // 道路は荒く ( % 6 )
            let isStripe = (startPos + n) % 6 === 0;
            // 縁石は少し細かく ( % 3 )
            let isKerb = (startPos + n) % 3 === 0;
            
            let fog = Math.pow(n / DRAW_DISTANCE, 2.5);

            // 1. 道路本体
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = isStripe ? "#444" : "#333";
            ctx.beginPath(); ctx.moveTo(p1.x - p1.w, p1.y); ctx.lineTo(p1.x + p1.w, p1.y); ctx.lineTo(p2.x + p2.w, p2.y); ctx.lineTo(p2.x - p2.w, p2.y); ctx.fill();

            // 2. 縁石 (Kerb) の描画【復元】
            if (fog < 0.95) {
                let kerbW = p1.w * 0.12; 
                ctx.fillStyle = isKerb ? "#ff0000" : "#ffffff";
                
                // 左側の縁石
                ctx.beginPath(); 
                ctx.moveTo(p1.x - p1.w, p1.y); 
                ctx.lineTo(p1.x - p1.w - kerbW, p1.y); 
                ctx.lineTo(p2.x - p2.w - kerbW, p2.y); 
                ctx.lineTo(p2.x - p2.w, p2.y); 
                ctx.fill();

                // 右側の縁石
                ctx.beginPath(); 
                ctx.moveTo(p1.x + p1.w, p1.y); 
                ctx.lineTo(p1.x + p1.w + kerbW, p1.y); 
                ctx.lineTo(p2.x + p2.w + kerbW, p2.y); 
                ctx.lineTo(p2.x + p2.w, p2.y); 
                ctx.fill();
            }

            // 3. フォグ
            if (fog > 0.05) {
                ctx.globalAlpha = fog;
                ctx.fillStyle = COLORS.sky;
                ctx.beginPath(); ctx.moveTo(p1.x - p1.w * 1.2, p1.y); ctx.lineTo(p1.x + p1.w * 1.2, p1.y); ctx.lineTo(p2.x + p2.w * 1.2, p2.y); ctx.lineTo(p2.x - p2.w * 1.2, p2.y); ctx.fill();
            }
            ctx.globalAlpha = 1.0;

            if ((startPos + n) % 15 === 0) drawPseudo3DObject(ctx, p1, startPos + n);
        }

        // 【修正】敵車を描画順序（Z）でソートし、奥から描画する
        enemies.sort((a, b) => b.z - a.z);

        enemies.forEach(e => {
            let p = project({ x: e.x, y: camH, z: e.z }, camX, shakeY, player.z, currentFOV);
            if (p.scale > 0 && (e.z - player.z) < (DRAW_DISTANCE * SEGMENT_LENGTH) && p.y > horizonY) {
                drawSportsCar(ctx, p.x, p.y, p.scale, e.hue, false, false);
            }
        });

        particles.forEach(p => {
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x + shakeX, p.y + shakeY, p.size, 0, Math.PI * 2); ctx.fill();
        });

        ctx.globalAlpha = (invincibility > 0) ? (0.4 + Math.sin(Date.now() / 40) * 0.2) : 1.0;
        if (gameState !== 'start') {
            drawSportsCar(ctx, centerX + shakeX, canvas.height - 50 + shakeY, 0.26, 0, true, keys['Space'] && nitro > 0);
        }
        ctx.restore();
    }

    function endGame() {
        gameState = 'gameover';
        document.getElementById('final-score-val').innerText = Math.floor(score);
        gameOverScreen.style.display = 'flex';
        menuSelection = 0; updateMenuVisuals();
    }

    function gameLoop() {
        if (gameState === 'playing') update();
        render();
        requestAnimationFrame(gameLoop);
    }
    gameLoop();
});