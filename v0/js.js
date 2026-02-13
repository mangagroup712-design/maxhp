document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // UI要素
    const uiScore = document.getElementById('score');
    const uiLives = document.getElementById('lives-val'); 
    const uiSpeed = document.getElementById('speed-val');
    const nitroBar = document.getElementById('nitro-bar');
    
    const startMenu = document.getElementById('start-menu');
    const pauseMenu = document.getElementById('pause-overlay');
    const gameOverScreen = document.getElementById('game-over');
    const diffDisplay = document.getElementById('diff-display');
    const transitionLayer = document.getElementById('transition-layer');

    // ゲーム定数
    const ROAD_WIDTH = 2000;
    const SEGMENT_LENGTH = 200;
    const DRAW_DISTANCE = 300; 
    const BASE_FOV = 0.8;

    let horizonY = 0;
    let centerX = 0;
    
    const CAM_HEIGHT_TPS = 600;   
    const CAM_HEIGHT_BUMPER = 250; 
    let currentCamHeight = CAM_HEIGHT_TPS;
    let cameraMode = 0; 

    // ゲーム状態
    let player = { x: 0, z: 0, speed: 0 };
    let enemies = [];
    let particles = []; // 爆発エフェクト用配列
    let lives = 3;
    let score = 0; 
    let isGameOver = false; 
    let isPlaying = false;  
    let isPaused = false;
    let keys = {};
    
    let invincibility = 0;
    let nitro = 100;
    
    let shakeX = 0;
    let shakeY = 0;
    let currentFOV = BASE_FOV;
    let currTurn = 0;

    const difficulties = [
        { label: "EASY", val: 1.0, max: 200 },
        { label: "NORMAL", val: 1.5, max: 280 },
        { label: "HARD", val: 2.0, max: 400 }
    ];
    let diffIndex = 1; 
    let difficultyMultiplier = 1.5;
    let maxSpeedSetting = 280;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        centerX = canvas.width / 2;
        horizonY = canvas.height / 2.3;
    }
    window.addEventListener('resize', resize);
    resize();

    // --- キーボード操作 ---
    window.addEventListener('keydown', e => {
        keys[e.code] = true;

        if (!isPlaying && startMenu.style.display !== 'none') {
            if (e.code === 'ArrowLeft') changeDifficulty(-1);
            else if (e.code === 'ArrowRight') changeDifficulty(1);
            else if (e.code === 'Enter' || e.code === 'Space') startSequence();
        }
        else if (isGameOver && gameOverScreen.style.display !== 'none') {
            if (e.code === 'Enter' || e.code === 'Space') location.reload();
        }
        else if (isPlaying) {
            if (e.code === 'KeyP') togglePause();
            if (!isPaused && e.code === 'KeyC') {
                cameraMode = (cameraMode + 1) % 2;
                currentCamHeight = cameraMode === 0 ? CAM_HEIGHT_TPS : CAM_HEIGHT_BUMPER;
            }
        }
    });
    window.addEventListener('keyup', e => keys[e.code] = false);

    // --- メニュー操作 ---
    function changeDifficulty(dir) {
        diffIndex += dir;
        if (diffIndex < 0) diffIndex = difficulties.length - 1;
        if (diffIndex >= difficulties.length) diffIndex = 0;
        diffDisplay.innerText = difficulties[diffIndex].label;
    }

    document.getElementById('difficulty-selector').addEventListener('click', () => changeDifficulty(1));
    document.getElementById('start-button').addEventListener('click', startSequence);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    document.getElementById('btn-quit').addEventListener('click', () => location.reload());

    // --- スタート演出シーケンス ---
    function startSequence() {
        if (isPlaying) return; // 連打防止
        
        // 1. アニメーション開始
        transitionLayer.style.visibility = 'visible';
        transitionLayer.classList.add('animating');

        // 2. 画面が隠れたタイミング(0.4秒後)でゲームリセットと開始
        setTimeout(() => {
            startGameLogic();
        }, 400);

        // 3. アニメーション終了後、クラス削除
        setTimeout(() => {
            transitionLayer.classList.remove('animating');
            transitionLayer.style.visibility = 'hidden';
        }, 1000);
    }

    function startGameLogic() {
        const setting = difficulties[diffIndex];
        difficultyMultiplier = setting.val;
        maxSpeedSetting = setting.max;

        startMenu.style.display = 'none';
        isPlaying = true;
        isGameOver = false;
        resetGame();
    }

    function togglePause() {
        if (!isPlaying) return;
        isPaused = !isPaused;
        pauseMenu.style.display = isPaused ? 'flex' : 'none';
        if (!isPaused) requestAnimationFrame(gameLoop);
    }

    function resetGame() {
        player.x = 0; player.z = 0; player.speed = 0;
        enemies = []; particles = [];
        lives = 3; score = 0; nitro = 100;
        currTurn = 0;
        invincibility = 0;
        uiLives.innerText = lives; 
        uiScore.innerText = "0";
        uiSpeed.innerText = "0";
        requestAnimationFrame(gameLoop);
    }

    // --- 爆発エフェクト ---
    function createExplosion(x, y, scale) {
        // 破片を多数生成
        const count = 30;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 15 * scale; // 速度
            const life = 1.0; // 寿命
            const size = (Math.random() * 20 + 10) * scale;
            
            // 色をランダムに (黄、オレンジ、赤)
            const colors = ['#ff0000', '#ff8800', '#ffff00', '#ffffff'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (Math.random() * 10 * scale), // 上に跳ね上げる
                life: life,
                color: color,
                size: size,
                gravity: 0.5 * scale
            });
        }
    }

    // --- 3D投影計算 ---
    function project(p, cameraX, cameraY, cameraZ, fov) {
        let worldX = p.x - cameraX;
        let worldY = p.y - cameraY;
        let worldZ = p.z - cameraZ;
        if (worldZ <= 0) worldZ = 1;
        let scale = fov / (worldZ / ROAD_WIDTH);
        return {
            x: centerX + (scale * worldX),
            y: horizonY + (scale * worldY),
            w: scale * ROAD_WIDTH,
            scale: scale
        };
    }

    function update() {
        if (!isPlaying || isPaused || isGameOver) return;

        // ハンドル
        if (keys['ArrowLeft']) currTurn = Math.max(-1, currTurn - 0.1);
        else if (keys['ArrowRight']) currTurn = Math.min(1, currTurn + 0.1);
        else currTurn *= 0.8;

        player.x += currTurn * (player.speed * 0.35); 
        player.x = Math.max(-1800, Math.min(player.x, 1800));

        // 加速
        let topSpeed = maxSpeedSetting;
        let accel = 0;
        if (keys['Space'] && nitro > 0) {
            topSpeed += 50; nitro -= 0.6; accel = 2.0;
        } else {
            accel = 0.5; if (nitro < 100) nitro += 0.1;
        }
        nitroBar.style.width = nitro + "%";

        if (player.speed < topSpeed) player.speed += accel;
        else player.speed *= 0.99; 

        player.z += player.speed * 1.5;

        // UI
        uiSpeed.innerText = Math.floor(player.speed);
        if (player.speed > 0) score += (player.speed * 0.004); 
        uiScore.innerText = Math.floor(score);

        // カメラ・演出
        let targetFOV = BASE_FOV + (player.speed / 400) * 0.6;
        currentFOV += (targetFOV - currentFOV) * 0.05;

        if (player.speed > 200) {
            let intensity = (player.speed - 200) / 100;
            shakeX = (Math.random() - 0.5) * intensity * 3;
            shakeY = (Math.random() - 0.5) * intensity * 2;
        } else {
            shakeX = 0; shakeY = 0;
        }
        
        if (invincibility > 0) invincibility -= 0.016;

        // パーティクル更新
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity; // 重力
            p.life -= 0.02; // 寿命減少
            if (p.life <= 0) particles.splice(i, 1);
        }

        // 敵生成
        if (Math.random() < 0.005 * difficultyMultiplier) {
            let spawnZ = player.z + 80000;
            let canSpawn = true;
            for (let e of enemies) {
                if (Math.abs(e.z - spawnZ) < 5000) { canSpawn = false; break; }
            }
            if (canSpawn) {
                let lane = Math.random() > 0.5 ? 800 : -800;
                lane += (Math.random() - 0.5) * 400;
                enemies.push({ 
                    x: lane, z: spawnZ, speed: 100 + Math.random() * 80, 
                    color: `hsl(${Math.random() * 360}, 70%, 40%)` 
                });
            }
        }

        // 衝突判定
        enemies.forEach((enemy, i) => {
            enemy.z += enemy.speed;
            if (enemy.z < player.z - 2000) enemies.splice(i, 1);

            let distZ = enemy.z - player.z;
            let distX = Math.abs(enemy.x - player.x);
            
            if (invincibility <= 0 && distZ > -200 && distZ < 600 && distX < 700) {
                // 事故発生！
                lives--;
                uiLives.innerText = lives;
                invincibility = 2.0;
                player.speed *= 0.3; // 減速
                shakeX = 50; shakeY = 50; // 激しい揺れ
                
                // ★爆発エフェクト生成（自車の位置、画面中央下付近）
                createExplosion(centerX, canvas.height - 100, 1.0); 

                if (lives <= 0) endGame();
            }
        });
    }

    function drawPlayerCar(x, y, scale) {
        // 点滅：周期を遅くする ( / 100 ではなく / 200 )
        if (invincibility > 0 && Math.floor(Date.now() / 200) % 2 === 0) return;

        const w = 850 * scale; const h = 500 * scale;
        ctx.save();
        ctx.translate(x + shakeX, y + shakeY);

        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath(); ctx.ellipse(-w * 0.4, h * 0.1, w * 0.8, h * 0.2, 0, 0, Math.PI*2); ctx.fill();

        let bankAngle = currTurn * 0.15; 
        ctx.rotate(bankAngle);

        ctx.fillStyle = "#0044cc";
        if (player.speed > 300) ctx.translate((Math.random()-0.5)*2, (Math.random()-0.5)*2);
        
        ctx.beginPath(); ctx.roundRect(-w/2, -h, w, h, 10 * scale); ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath(); ctx.roundRect(-w * 0.4, -h * 0.9, w * 0.8, h * 0.45, 5 * scale); ctx.fill();
        
        let lightColor = keys['Space'] ? "#00ffff" : "#ff0000";
        ctx.fillStyle = lightColor;
        ctx.shadowBlur = keys['Space'] ? 25 : 10; ctx.shadowColor = lightColor;
        ctx.fillRect(-w * 0.4, -h * 0.4, w * 0.25, h * 0.15);
        ctx.fillRect(w * 0.15, -h * 0.4, w * 0.25, h * 0.15);
        
        if (keys['Space'] && nitro > 0) {
            ctx.shadowBlur = 30; ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(-w * 0.25, -h * 0.1, w * 0.1, 0, Math.PI*2);
            ctx.arc(w * 0.25, -h * 0.1, w * 0.1, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawEnemyCar(x, y, scale, color, alpha) {
        if (alpha <= 0) return;
        let w = 700 * scale; let h = 350 * scale;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath(); ctx.ellipse(-w*0.3, 0, w*0.7, h*0.2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.roundRect(-w/2, -h, w, h, 20 * scale); ctx.fill();
        ctx.fillStyle = "#222"; ctx.fillRect(-w*0.35, -h*0.8, w*0.7, h*0.3);
        ctx.fillStyle = "#ffcc00"; ctx.shadowBlur = 5; ctx.shadowColor = "#ffcc00";
        ctx.fillRect(-w*0.4, -h*0.4, w*0.2, h*0.15); ctx.fillRect(w*0.2, -h*0.4, w*0.2, h*0.15);
        ctx.restore();
    }

    function drawSideObject(p, widthScale, n) {
        if (p.y <= horizonY) return;
        let h = 2000 * p.scale; let w = 150 * p.scale;
        ctx.save();
        let fog = Math.pow(n / DRAW_DISTANCE, 1.5);
        ctx.globalAlpha = Math.max(0, 1 - fog);
        ctx.fillStyle = (Math.floor(player.z / SEGMENT_LENGTH) + n) % 8 === 0 ? "#00ffff" : "#333";
        let x = p.x + (p.w * widthScale);
        ctx.fillRect(x - w/2, p.y - h, w, h);
        ctx.restore();
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let skyY = shakeY; 
        ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, canvas.width, horizonY + skyY);
        ctx.fillStyle = "#228b22"; ctx.fillRect(0, horizonY + skyY, canvas.width, canvas.height);

        let startPos = Math.floor(player.z / SEGMENT_LENGTH);
        
        for (let n = DRAW_DISTANCE; n > 0; n--) {
            let camH = currentCamHeight + shakeY * 10;
            let camX = player.x * 0.8 + currTurn * 1000;
            let p1 = project({ x: 0, y: camH, z: (startPos + n) * SEGMENT_LENGTH }, camX, shakeY, player.z, currentFOV);
            let p2 = project({ x: 0, y: camH, z: (startPos + n - 1) * SEGMENT_LENGTH }, camX, shakeY, player.z, currentFOV);
            
            if (p1.y <= horizonY + shakeY && p2.y <= horizonY + shakeY) continue;
            
            let fog = Math.pow(n / DRAW_DISTANCE, 2);
            let isStripe = (startPos + n) % 2;
            let roadBase = isStripe ? 40 : 50;
            let r = roadBase + (34 - roadBase) * fog;
            let g = roadBase + (139 - roadBase) * fog;
            let b = roadBase + (34 - roadBase) * fog;
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath(); ctx.moveTo(p1.x - p1.w, p1.y); ctx.lineTo(p1.x + p1.w, p1.y); ctx.lineTo(p2.x + p2.w, p2.y); ctx.lineTo(p2.x - p2.w, p2.y); ctx.fill();

            if (fog < 0.9) {
                let kerbW1 = p1.w * 0.15; let kerbW2 = p2.w * 0.15;
                let kr = isStripe ? 200 : 255; let kgb = isStripe ? 0 : 255;
                let kr_fog = kr + (34 - kr) * fog; let kgb_fog = kgb + (139 - kgb) * fog;
                ctx.fillStyle = `rgb(${kr_fog}, ${kgb_fog}, ${kgb_fog})`;
                ctx.beginPath(); ctx.moveTo(p1.x - p1.w, p1.y); ctx.lineTo(p1.x - p1.w - kerbW1, p1.y); ctx.lineTo(p2.x - p2.w - kerbW2, p2.y); ctx.lineTo(p2.x - p2.w, p2.y); ctx.fill();
                ctx.beginPath(); ctx.moveTo(p1.x + p1.w, p1.y); ctx.lineTo(p1.x + p1.w + kerbW1, p1.y); ctx.lineTo(p2.x + p2.w + kerbW2, p2.y); ctx.lineTo(p2.x + p2.w, p2.y); ctx.fill();
            }
            if ((startPos + n) % 15 === 0) {
                drawSideObject(p1, -2.0, n); drawSideObject(p1, 2.0, n);
            }
        }

        enemies.forEach(e => {
            let camH = currentCamHeight + shakeY * 10;
            let camX = player.x * 0.8 + currTurn * 1000;
            let p = project({ x: e.x, y: camH, z: e.z }, camX, shakeY, player.z, currentFOV);
            let visibleDist = DRAW_DISTANCE * SEGMENT_LENGTH;
            let dist = e.z - player.z;
            let alpha = 1 - Math.pow(dist / visibleDist, 4);
            if (p.scale > 0 && dist < visibleDist && p.y > horizonY) {
                drawEnemyCar(p.x, p.y, p.scale, e.color, Math.max(0, alpha));
            }
        });

        // パーティクル描画 (最前面)
        particles.forEach(p => {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x + shakeX, p.y + shakeY, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        if (cameraMode === 0) drawPlayerCar(centerX, canvas.height - 30, 0.24);
    }

    function endGame() {
        isPlaying = false;
        isGameOver = true;
        document.getElementById('final-score-val').innerText = Math.floor(score);
        document.getElementById('game-over').style.display = 'flex';
    }

    function gameLoop() {
        update();
        render();
        if (isPlaying && !isPaused) requestAnimationFrame(gameLoop);
    }
});