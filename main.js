const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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
        
        // 初期位置の設定を反映
        player.px = player.x * TILE_SIZE;
        player.py = player.y * TILE_SIZE;
        
        // ゲームループを開始
        gameLoop();
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}

// 該当のマスが「押して動かせるブロック」かどうかを判定する関数
function isMovableBlock(tileValue) {
    // 11〜19（動く数字）または 21〜25（動く記号）なら動かせるブロック
    return (tileValue >= 11 && tileValue <= 19) || (tileValue >= 21 && tileValue <= 25);
}

// 該当のマスが「絶対に動かない固定ブロック」かどうかを判定する関数
function isImmovableBlock(tileValue) {
    // 31〜39（動かない数字）または 41〜45（動かない記号）なら固定ブロック
    return (tileValue >= 31 && tileValue <= 39) || (tileValue >= 41 && tileValue <= 45);
}

// ブロックのタイプに応じた見た目（色、文字、赤枠フラグ）を取得する関数
function getBlockStyle(tileValue) {
    let color = "#333333";
    let text = "";
    let isImmovable = false;

    // --- 動くブロック ---
    if (tileValue >= 11 && tileValue <= 19) {
        color = "#3399ff"; // 青
        text = String(tileValue - 10);
    } else if (tileValue >= 21 && tileValue <= 25) {
        color = "#ffcc00"; // 黄
        const signs = { 21: "＋", 22: "－", 23: "×", 24: "÷", 25: "＝" };
        text = signs[tileValue];
    }
    // --- 動かないブロック (赤枠) ---
    else if (tileValue >= 31 && tileValue <= 39) {
        color = "#3399ff"; // 青
        text = String(tileValue - 30);
        isImmovable = true;
    } else if (tileValue >= 41 && tileValue <= 45) {
        color = "#ffcc00"; // 黄
        const signs = { 41: "＋", 42: "－", 43: "×", 44: "÷", 45: "＝" };
        text = signs[tileValue];
        isImmovable = true;
    }

    return { color, text, isImmovable };
}

// 移動処理（アニメーションの開始トリガー）
function movePlayer(dx, dy) {
    if (map.length === 0 || player.isMoving) return;

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    // プレイヤーの移動先がマップの範囲外なら何もしない
    if (nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[nextY].length) {
        return;
    }

    // 1. 移動先が床（0）の場合、そのまま前進
    if (map[nextY][nextX] === 0) {
        player.x = nextX;
        player.y = nextY;
        player.isMoving = true;
        return;
    }

    // 2. 移動先が動くブロック（11〜25）の場合
    if (isMovableBlock(map[nextY][nextX])) {
        let checkX = nextX;
        let checkY = nextY;
        const blocksToMove = [];

        // 進行方向に並んでいる「動くブロック」をすべてリストアップ
        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[checkY].length &&
            isMovableBlock(map[checkY][checkX])
        ) {
            blocksToMove.push({ x: checkX, y: checkY, value: map[checkY][checkX] });
            checkX += dx;
            checkY += dy;
        }

        // 連続した動くブロックの「さらにその先にあるマス」
        const finalX = checkX;
        const finalY = checkY;

        // そのマスがマップ内であり、かつ「床（0）」であれば、すべて押し出せる
        // (先が壁(1)や、動かないブロック(31〜45)だった場合は、条件を満たさないので動かない)
        if (
            finalY >= 0 && finalY < map.length &&
            finalX >= 0 && finalX < map[finalY].length &&
            map[finalY][finalX] === 0
        ) {
            // 内部配列データを後ろから順に1マスずつ先にずらす
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
            // プレイヤーの目の前にあったブロックの場所を床（0）にする
            map[nextY][nextX] = 0;

            // プレイヤーを移動状態にする
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
}

// ブロックの装飾と文字を描画する関数
function drawBlock(style, px, py) {
    // ベースとなるブロックの塗りつぶし
    ctx.fillStyle = style.color;
    ctx.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);

    // 動かないブロック（赤枠）の処理
    if (style.isImmovable) {
        ctx.strokeStyle = "#ff4d4d"; // 赤い枠線
        ctx.lineWidth = 3;           // 枠線の太さ
        // 内側に綺麗な枠線を引くために、座標を1ピクセル内側にずらす
        ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    // 文字の描画
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.text, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
}

// 描画関数
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マップの描画
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            if (map[y][x] === 1) {
                // 壁（赤色）
                ctx.fillStyle = "#ff4d4d";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
            } else {
                // 床（暗いグレー）
                ctx.fillStyle = "#333333";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
                
                // 静止しているブロックの描画（動くもの、動かないもの両方）
                const tileValue = map[y][x];
                if (isMovableBlock(tileValue) || isImmovableBlock(tileValue)) {
                    // アニメーション移動中のブロックはここでは描画しない
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

    if (player.isMoving) return;

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
            if (!player.isMoving) movePlayer(btn.dx, btn.dy);
        });
        element.addEventListener("click", function(event) {
            if (!player.isMoving) movePlayer(btn.dx, btn.dy);
        });
    }
});

// 最初に map1.csv を読み込む
loadMapCSV("./map/map1.csv");
