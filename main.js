const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 1タイルのサイズ（ピクセル）
const TILE_SIZE = 32;
// アニメーションの移動速度
const MOVE_SPEED = 4;

// マップデータを保持する配列
let map = [];

// プレイヤーのデータ
const player = {
    x: 1,
    y: 1,
    px: 32,
    py: 32,
    isMoving: false
};

// 動いているブロックの情報を管理する配列
let movingBlocks = [];

// 過去のマップとプレイヤーの状態を記録する履歴スタック（1手戻す機能用）
const historyStack = [];

// ステージクリアを管理するフラグ
let isStageCleared = false;

// CSVファイルを読み込んで2次元配列に変換する関数
async function loadMapCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status}`);
        }
        const text = await response.text();
        
        const rows = text.trim().split(/\r?\n/);
        map = rows.map(row => row.split(",").map(Number));
        
        // --- マップ全体のループ処理 ---
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
                    map[y][x] = 0; // プレイヤーの初期位置は床（0）に置き換える
                }
            }
        }

        // マップデータの大きさに合わせて、Canvasの解像度をぴったりリサイズ
        canvas.width = mapCols * TILE_SIZE;
        canvas.height = mapRows * TILE_SIZE;

        // プレイヤーの初期ピクセル座標を、検出したタイル位置に同期
        player.px = player.x * TILE_SIZE;
        player.py = player.y * TILE_SIZE;
        
        // 各種状態の初期化
        historyStack.length = 0;
        isStageCleared = false;

        // ゲームループを開始
        gameLoop();
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}

// 現在の状態（マップとプレイヤー位置）を履歴に保存する関数
function saveToHistory() {
    const mapCopy = map.map(row => [...row]);
    
    historyStack.push({
        map: mapCopy,
        playerX: player.x,
        playerY: player.y
    });
}

// 1手前の状態に戻す関数
function undo() {
    if (isStageCleared || player.isMoving || movingBlocks.length > 0 || historyStack.length === 0) return;

    const prevState = historyStack.pop();

    map = prevState.map;
    player.x = prevState.playerX;
    player.y = prevState.playerY;

    player.px = player.x * TILE_SIZE;
    player.py = player.y * TILE_SIZE;
}

// 該当のマスが「押して動かせるブロック」かどうかを判定する関数
function isMovableBlock(tileValue) {
    return (tileValue >= 11 && tileValue <= 19) || (tileValue >= 21 && tileValue <= 26);
}

// 該当のマスが「絶対に動かない固定ブロック」かどうかを判定する関数
function isImmovableBlock(tileValue) {
    return (tileValue >= 31 && tileValue <= 39) || (tileValue >= 41 && tileValue <= 46);
}

// 該当のマスが「何らかのブロック」かどうかを判定する関数
function isAnyBlock(tileValue) {
    return isMovableBlock(tileValue) || isImmovableBlock(tileValue);
}

// ブロックのタイプに応じた見た目と情報を取得する関数
function getBlockStyle(tileValue) {
    let color = "#333333";
    let text = "";
    let isImmovable = false;
    let isVerticalSign = false;

    if (tileValue >= 11 && tileValue <= 19) {
        color = "#3399ff";
        text = String(tileValue - 10);
    } else if (tileValue >= 21 && tileValue <= 26) {
        color = "#ffcc00";
        const signs = { 21: "＋", 22: "－", 23: "×", 24: "÷", 25: "＝", 26: "＝" };
        text = signs[tileValue];
        if (tileValue === 26) isVerticalSign = true;
    } else if (tileValue >= 31 && tileValue <= 39) {
        color = "#3399ff";
        text = String(tileValue - 30);
        isImmovable = true;
    } else if (tileValue >= 41 && tileValue <= 46) {
        color = "#ffcc00";
        const signs = { 41: "＋", 42: "－", 43: "×", 44: "÷", 45: "＝", 46: "＝" };
        text = signs[tileValue];
        isImmovable = true;
        if (tileValue === 46) isVerticalSign = true;
    }

    return { color, text, isImmovable, isVerticalSign };
}

// マスの中身を eval() で計算できる文字列用のパーツ（トークン）に変換する関数
function parseTileToFormulaString(tileValue) {
    if (tileValue >= 11 && tileValue <= 19) return String(tileValue - 10);
    if (tileValue >= 31 && tileValue <= 39) return String(tileValue - 30);
    const signs = {
        21: "+", 22: "-", 23: "*", 24: "/", 25: "=", 26: "=",
        41: "+", 42: "-", 43: "*", 44: "/", 45: "=", 46: "="
    };
    return signs[tileValue] || "";
}

// 組み立てた数式の文字列が、正しい等式になっているか eval() を使って判別する関数
function isValidEquation(formulaTokens) {
    // 式の中に「=」がちょうど1つだけ含まれているか確認
    const eqCount = formulaTokens.filter(t => t === "=").length;
    if (eqCount !== 1) return false;

    // 「=」の場所で左辺と右辺の文字列に分解する
    const eqIndex = formulaTokens.indexOf("=");
    const leftExpression = formulaTokens.slice(0, eqIndex).join("");
    const rightExpression = formulaTokens.slice(eqIndex + 1).join("");

    // 左辺・右辺のどちらかが空っぽなら不正
    if (!leftExpression || !rightExpression) return false;

    try {
        // eval() を使って左辺と右辺をそれぞれ JavaScript 標準の計算機で実行
        const leftVal = eval(leftExpression);
        const rightVal = eval(rightExpression);

        if (leftVal === undefined || rightVal === undefined) return false;

        // コンピュータ特有の小数の計算誤差（例: 0.300000004）を丸めて安全に比較する
        // 差が 0.00001 未満なら「同じ数値」とみなす
        return Math.abs(leftVal - rightVal) < 0.00001;
    } catch (e) {
        // 万が一、数式の並び順が不正で eval がエラーを出した場合は不成立（False）とする
        return false;
    }
}

// 特定の「＝」から繋がる式を、指定された方向（縦か横か）だけで抽出して判定する関数
function checkEquationAt(eqX, eqY, isVertical) {
    const formulaTokens = [];
    const dx = isVertical ? 0 : 1;
    const dy = isVertical ? 1 : 0;

    // 1. 式の「開始地点（左端または上端）」を求めて逆方向に遡る
    let startX = eqX;
    let startY = eqY;
    while (true) {
        const prevX = startX - dx;
        const prevY = startY - dy;
        if (prevY < 0 || prevY >= map.length || prevX < 0 || prevX >= map[prevY].length) break;
        if (!isAnyBlock(map[prevY][prevX])) break;
        startX = prevX;
        startY = prevY;
    }

    // 2. 開始地点から正方向に進みながら、ブロックが連続する限り文字を回収する
    let currentX = startX;
    let currentY = startY;
    while (
        currentY >= 0 && currentY < map.length &&
        currentX >= 0 && currentX < map[currentY].length &&
        isAnyBlock(map[currentY][currentX])
    ) {
        formulaTokens.push(parseTileToFormulaString(map[currentY][currentX]));
        currentX += dx;
        currentY += dy;
    }

    // 3. 判定関数へ丸ごと引き渡す
    return isValidEquation(formulaTokens);
}

// マップ全体のクリア条件を判定する関数
function checkAllClearConditions() {
    if (map.length === 0 || isStageCleared) return;

    let totalEqualsCount = 0;
    let satisfiedEqualsCount = 0;

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            const tile = map[y][x];
            
            // 横向きの＝ (25 または 45) -> 左右方向だけをチェック
            if (tile === 25 || tile === 45) {
                totalEqualsCount++;
                if (checkEquationAt(x, y, false)) {
                    satisfiedEqualsCount++;
                }
            }
            // 縦向きの＝ (26 または 46) -> 上下方向だけをチェック
            else if (tile === 26 || tile === 46) {
                totalEqualsCount++;
                if (checkEquationAt(x, y, true)) {
                    satisfiedEqualsCount++;
                }
            }
        }
    }

    // マップ上のすべての「＝」ブロックの数式が成立していればステージクリア！
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

    // プレイヤーとブロックのすべての動きが止まっているときにのみクリアチェック
    if (!player.isMoving && movingBlocks.length === 0) {
        checkAllClearConditions();
    }
}

// ブロックの装飾と文字を描画する関数
function drawBlock(style, px, py) {
    ctx.fillStyle = style.color;
    ctx.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);

    if (style.isImmovable) {
        ctx.strokeStyle = "#ff4d4d";
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
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

// 描画関数
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マップの描画
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

    // アニメーション中のブロックを描画
    movingBlocks.forEach(b => {
        const style = getBlockStyle(b.value);
        drawBlock(style, b.px, b.py);
    });

    // プレイヤーの描画（緑色）
    ctx.fillStyle = "#4dff4d";
    ctx.fillRect(player.px, player.py, TILE_SIZE - 1, TILE_SIZE - 1);

    // ステージクリア時のオーバーレイUI表示
    if (isStageCleared) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#4dff4d";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("STAGE CLEAR!", canvas.width / 2, canvas.height / 2);
    }
}

// メインのゲームループ
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// キーボード入力のイベントリスナー
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

// スマホ用バーチャルボタンのイベント設定
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

// 「戻る」ボタン（ID: btn-undo）の処理
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

// 最初に map1.csv を読み込む
loadMapCSV("./map/map1.csv");
