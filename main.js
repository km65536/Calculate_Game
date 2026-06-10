// 【バージョン更新】ver 1.1.2
const GAME_VERSION = "ver 1.1.2";

const versionElement = document.getElementById("version-display");
if (versionElement) {
    versionElement.innerText = GAME_VERSION;
}

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let TILE_SIZE = 32;
let MOVE_SPEED = 4;
let map = [];

const player = {
    x: 1,
    y: 1,
    px: 32,
    py: 32,
    isMoving: false
};

let movingBlocks = [];
const historyStack = [];
let isStageCleared = false;
let satisfiedLineRects = [];

async function loadMapCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${status}`);
        }
        const text = await response.text();
        
        const rows = text.trim().split(/\r?\n/);
        map = rows.map(row => row.split(",").map(Number));
        
        const mapRows = map.length;
        let mapCols = 0;

        for (let y = 0; y < map.length; y++) {
            if (map[y].length > mapCols) {
                mapCols = map[y].length;
            }
            for (let x = 0; x < map[y].length; x++) {
                if (map[y][x] === 99) {
                    player.x = x;
                    player.y = y;
                    map[y][x] = 0;
                }
            }
        }

        // 【修正】スマホ端末ごとの物理的な画面の横幅をリアルタイムに取得
        const windowWidth = window.innerWidth;
        
        // 画面幅（最大480px、スマホなら端末幅）から、外側の左右パディング(計24px分)を安全マージンとして差し引く
        const availableWidth = Math.min(480, windowWidth) - 24;
        
        // 割り出された安全な表示可能幅を、マップの横マス数で割り算して、絶対にはみ出さないTILE_SIZEを決定
        TILE_SIZE = Math.min(48, Math.floor(availableWidth / mapCols));
        
        // 速度が極端に遅くならないよう、2以上の整数として再計算
        MOVE_SPEED = Math.max(2, TILE_SIZE / 8);

        canvas.width = mapCols * TILE_SIZE;
        canvas.height = mapRows * TILE_SIZE;

        player.px = player.x * TILE_SIZE;
        player.py = player.y * TILE_SIZE;
        
        historyStack.length = 0;
        isStageCleared = false;
        satisfiedLineRects = [];

        gameLoop();
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}

function saveToHistory() {
    const mapCopy = map.map(row => [...row]);
    historyStack.push({
        map: mapCopy,
        playerX: player.x,
        playerY: player.y
    });
}

function undo() {
    if (isStageCleared || player.isMoving || movingBlocks.length > 0 || historyStack.length === 0) return;

    const prevState = historyStack.pop();
    map = prevState.map;
    player.x = prevState.playerX;
    player.y = prevState.playerY;
    player.px = player.x * TILE_SIZE;
    player.py = player.y * TILE_SIZE;
}

function isMovableBlock(tileValue) {
    return (tileValue >= 11 && tileValue <= 19) || (tileValue >= 21 && tileValue <= 28);
}

// 該当のマスが「絶対に動かない固定ブロック」かどうかを判定する関数
function isImmovableBlock(tileValue) {
    return (tileValue >= 31 && tileValue <= 39) || (tileValue >= 41 && tileValue <= 48);
}

// 該当のマスが「何らかのブロック」かどうかを判定する関数
function isAnyBlock(tileValue) {
    return isMovableBlock(tileValue) || isImmovableBlock(tileValue);
}

// 指定した方向（縦か横か）の式構成パーツとして有効なブロックか判定する関数
function isValidPartForDirection(tileValue, isVertical) {
    if (!isAnyBlock(tileValue)) return false;

    if (tileValue === 26 || tileValue === 46) {
        return isVertical;
    }
    if (tileValue === 25 || tileValue === 45) {
        return !isVertical;
    }

    return true;
}

// ブロックのタイプに応じた見た目と情報を取得する関数
function getBlockStyle(tileValue) {
    if (tileValue >= 11 && tileValue <= 19) {
        return { color: "#3399ff", text: String(tileValue - 10), isImmovable: false, isVerticalSign: false };
    } 
    if (tileValue >= 21 && tileValue <= 28) {
        const signs = { 21: "＋", 22: "－", 23: "×", 24: "÷", 25: "＝", 26: "＝", 27: "（", 28: "）" };
        return { color: "#b77eff", text: signs[tileValue], isImmovable: false, isVerticalSign: (tileValue === 26) };
    } 
    if (tileValue >= 31 && tileValue <= 39) {
        return { color: "#3399ff", text: String(tileValue - 30), isImmovable: true, isVerticalSign: false };
    } 
    if (tileValue >= 41 && tileValue <= 48) {
        const signs = { 41: "＋", 42: "－", 43: "×", 44: "÷", 45: "＝", 46: "＝", 47: "（", 48: "）" };
        return { color: "#b77eff", text: signs[tileValue], isImmovable: true, isVerticalSign: (tileValue === 46) };
    }

    return { color: "#333333", text: "", isImmovable: false, isVerticalSign: false };
}

// マスの中身を eval() で計算できる文字列用のパーツ（トークン）に変換する関数
function parseTileToFormulaString(tileValue) {
    if (tileValue >= 11 && tileValue <= 19) return String(tileValue - 10);
    if (tileValue >= 31 && tileValue <= 39) return String(tileValue - 30);
    const signs = {
        21: "+", 22: "-", 23: "*", 24: "/", 25: "=", 26: "=", 27: "(", 28: ")",
        41: "+", 42: "-", 43: "*", 44: "/", 45: "=", 46: "=", 47: "(", 48: ")"
    };
    return signs[tileValue] || "";
}

// 組み立てた数式の文字列が、正しい等式になっているか eval() を使って判別する関数
function isValidEquation(formulaTokens) {
    const eqCount = formulaTokens.filter(t => t === "=").length;
    if (eqCount !== 1) return false;

    const eqIndex = formulaTokens.indexOf("=");
    const leftExpression = formulaTokens.slice(0, eqIndex).join("");
    const rightExpression = formulaTokens.slice(eqIndex + 1).join("");

    if (!leftExpression || !rightExpression) return false;

    try {
        const leftVal = eval(leftExpression);
        const rightVal = eval(rightExpression);

        if (leftVal === undefined || rightVal === undefined) return false;

        return Math.abs(leftVal - rightVal) < 0.00001;
    } catch (e) {
        return false;
    }
}

// 特定の「＝」から繋がる式を、指定された方向（縦か横か）だけで抽出し、成否を判定する関数
function checkEquationAt(eqX, eqY, isVertical) {
    const formulaTokens = [];
    const dx = isVertical ? 0 : 1;
    const dy = isVertical ? 1 : 0;

    let startX = eqX;
    let startY = eqY;
    while (true) {
        const prevX = startX - dx;
        const prevY = startY - dy;
        if (prevY < 0 || prevY >= map.length || prevX < 0 || prevX >= map[prevY].length) break;
        if (!isValidPartForDirection(map[prevY][prevX], isVertical)) break;
        startX = prevX;
        startY = prevY;
    }

    let endX = startX;
    let endY = startY;

    let currentX = startX;
    let currentY = startY;
    while (
        currentY >= 0 && currentY < map.length &&
        currentX >= 0 && currentX < map[currentY].length &&
        isValidPartForDirection(map[currentY][currentX], isVertical)
    ) {
        formulaTokens.push(parseTileToFormulaString(map[currentY][currentX]));
        endX = currentX;
        endY = currentY;
        currentX += dx;
        currentY += dy;
    }

    const isSuccess = isValidEquation(formulaTokens);
    
    if (isSuccess) {
        satisfiedLineRects.push({ startX, startY, endX, endY, isVertical });
    }

    return isSuccess;
}

// マップ全体のクリア条件を判定する関数
function checkAllClearConditions() {
    if (map.length === 0 || isStageCleared) return;

    satisfiedLineRects = [];

    let totalEqualsCount = 0;
    let satisfiedEqualsCount = 0;

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            const tile = map[y][x];
            
            if (tile === 25 || tile === 45) {
                totalEqualsCount++;
                if (checkEquationAt(x, y, false)) {
                    satisfiedEqualsCount++;
                }
            }
            else if (tile === 26 || tile === 46) {
                totalEqualsCount++;
                if (checkEquationAt(x, y, true)) {
                    satisfiedEqualsCount++;
                }
            }
        }
    }

    if (totalEqualsCount > 0 && satisfiedEqualsCount === totalEqualsCount) {
        isStageCleared = true;
    }
}

// 移動処理（アニメーションの開始トリガー）
function movePlayer(dx, dy) {
    if (map.length === 0 || player.isMoving || isStageCleared) return;

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    if (nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[nextY].length) {
        return;
    }

    if (map[nextY][nextX] === 0) {
        saveToHistory();
        player.x = nextX;
        player.y = nextY;
        player.isMoving = true;
        return;
    }

    if (isMovableBlock(map[nextY][nextX])) {
        let checkX = nextX;
        let checkY = nextY;
        const blocksToMove = [];

        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[checkY].length &&
            isMovableBlock(map[checkY][checkX])
        ) {
            blocksToMove.push({ x: checkX, y: checkY, value: map[checkY][checkX] });
            checkX += dx;
            checkY += dy;
        }

        const finalX = checkX;
        const finalY = checkY;

        if (
            finalY >= 0 && finalY < map.length &&
            finalX >= 0 && finalX < map[finalY].length &&
            map[finalY][finalX] === 0
        ) {
            saveToHistory();

            for (let i = blocksToMove.length - 1; i >= 0; i--) {
                const b = blocksToMove[i];
                map[b.y + dy][b.x + dx] = b.value;
                
                movingBlocks.push({
                    value: b.value,
                    px: b.x * TILE_SIZE,
                    py: b.y * TILE_SIZE,
                    tx: (b.x + dx) * TILE_SIZE,
                    ty: (b.y + dy) * TILE_SIZE
                });
            }
            map[nextY][nextX] = 0;

            player.x = nextX;
            player.y = nextY;
            player.isMoving = true;
        }
    }
}

// 座標の更新（アニメーション計算）
function update() {
    if (player.isMoving) {
        const targetPx = player.x * TILE_SIZE;
        const targetPy = player.y * TILE_SIZE;

        if (player.px < targetPx) player.px = Math.min(player.px + MOVE_SPEED, targetPx);
        if (player.px > targetPx) player.px = Math.max(player.px - MOVE_SPEED, targetPx);
        if (player.py < targetPy) player.py = Math.min(player.py + MOVE_SPEED, targetPy);
        if (player.py > targetPy) player.py = Math.max(player.py - MOVE_SPEED, targetPy);

        if (player.px === targetPx && player.py === targetPy) {
            player.isMoving = false;
        }
    }

    for (let i = 0; i < movingBlocks.length; i++) {
        const b = movingBlocks[i];
        
        if (b.px < b.tx) b.px = Math.min(b.px + MOVE_SPEED, b.tx);
        if (b.px > b.tx) b.px = Math.max(b.px - MOVE_SPEED, b.tx);
        if (b.py < b.ty) b.py = Math.min(b.py + MOVE_SPEED, b.ty);
        if (b.py > b.ty) b.py = Math.max(b.py - MOVE_SPEED, b.ty);
    }

    movingBlocks = movingBlocks.filter(b => b.px !== b.tx || b.py !== b.ty);

    if (!player.isMoving && movingBlocks.length === 0) {
        checkAllClearConditions();
    }
}

function drawBlock(style, px, py) {
    ctx.fillStyle = style.color;
    ctx.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);

    if (style.isImmovable) {
        ctx.strokeStyle = "#ff4d4d";
        ctx.lineWidth = Math.max(2, TILE_SIZE / 10);
        ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    ctx.fillStyle = style.textColor || "#ffffff";
    
    const fontSize = Math.floor(TILE_SIZE * 0.5);
    ctx.font = `bold ${fontSize}px sans-serif`;
    
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (style.isVerticalSign) {
        ctx.save();
        ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.fillText(style.text, 0, 0);
        ctx.restore();
    } else {
        ctx.fillText(style.text, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
    }
}

function drawSatisfiedLineGlow(rect) {
    const startPxX = rect.startX * TILE_SIZE;
    const startPxY = rect.startY * TILE_SIZE;
    const endPxX = rect.endX * TILE_SIZE;
    const endPxY = rect.endY * TILE_SIZE;

    const rectWidth = (endPxX - startPxX) + TILE_SIZE;
    const rectHeight = (endPxY - startPxY) + TILE_SIZE;

    ctx.save();
    ctx.strokeStyle = "#4dff4d";
    ctx.lineWidth = Math.max(3, TILE_SIZE / 8);
    
    ctx.shadowColor = "#4dff4d";
    ctx.shadowBlur = Math.max(8, TILE_SIZE / 3);
    
    ctx.strokeRect(startPxX + 1.5, startPxY + 1.5, rectWidth - 3, rectHeight - 3);
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            if (map[y][x] === 1) {
                ctx.fillStyle = "#ff4d4d";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
            } else {
                ctx.fillStyle = "#333333";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
                
                const tileValue = map[y][x];
                if (isMovableBlock(tileValue) || isImmovableBlock(tileValue)) {
                    const isMoving = movingBlocks.some(b => Math.floor(b.tx / TILE_SIZE) === x && Math.floor(b.ty / TILE_SIZE) === y);
                    if (!isMoving) {
                        const style = getBlockStyle(tileValue);
                        drawBlock(style, x * TILE_SIZE, y * TILE_SIZE);
                    }
                }
            }
        }
    }

    movingBlocks.forEach(b => {
        const style = getBlockStyle(b.value);
        drawBlock(style, b.px, b.py);
    });

    satisfiedLineRects.forEach(rect => {
        drawSatisfiedLineGlow(rect);
    });

    ctx.fillStyle = "#4dff4d";
    ctx.fillRect(player.px, player.py, TILE_SIZE - 1, TILE_SIZE - 1);

    if (isStageCleared) {
        ctx.fillStyle = "#4dff4d";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 6;
        ctx.strokeText("STAGE CLEAR!", canvas.width / 2, canvas.height / 2);
        ctx.fillText("STAGE CLEAR!", canvas.width / 2, canvas.height / 2);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", function(event) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
    }

    if (event.key === "z" || event.key === "Z") {
        undo();
        return;
    }

    if (player.isMoving || isStageCleared) return;

    switch(event.key) {
        case "ArrowUp":    movePlayer(0, -1); break;
        case "ArrowDown":  movePlayer(0, 1);  break;
        case "ArrowLeft":  movePlayer(-1, 0); break;
        case "ArrowRight": movePlayer(1, 0);  break;
    }
});

const btns = [
    { id: "btn-up", dx: 0, dy: -1 },
    { id: "btn-down", dx: 0, dy: 1 },
    { id: "btn-left", dx: -1, dy: 0 },
    { id: "btn-right", dx: 1, dy: 0 }
];

btns.forEach(btn => {
    const element = document.getElementById(btn.id);
    if (element) {
        element.addEventListener("touchstart", function(event) {
            event.preventDefault();
            if (!player.isMoving && !isStageCleared) movePlayer(btn.dx, btn.dy);
        });
        element.addEventListener("click", function(event) {
            if (!player.isMoving && !isStageCleared) movePlayer(btn.dx, btn.dy);
        });
    }
});

const undoBtn = document.getElementById("btn-undo");
if (undoBtn) {
    undoBtn.addEventListener("touchstart", function(event) {
        event.preventDefault();
        undo();
    });
    undoBtn.addEventListener("click", function(event) {
        undo();
    });
}

loadMapCSV("./map/map1.csv");
