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

// 該当のマスが「押せるブロック」かどうかを判定する関数
function isBlock(tileValue) {
    // 11〜19（数字）または 21〜25（記号）ならブロック
    return (tileValue >= 11 && tileValue <= 19) || (tileValue >= 21 && tileValue <= 25);
}

// ブロックのタイプに応じた見た目（色と文字）を取得する関数
function getBlockStyle(tileValue) {
    let color = "#333333";
    let text = "";

    // 数字ブロック (1-9): 青系統
    if (tileValue >= 11 && tileValue <= 19) {
        color = "#3399ff";
        text = String(tileValue - 10); // 11なら"1"、12なら"2"
    }
    // 記号ブロック: 黄系統
    else if (tileValue >= 21 && tileValue <= 25) {
        color = "#ffcc00";
        const signs = { 21: "＋", 22: "－", 23: "×", 24: "÷", 25: "＝" };
        text = signs[tileValue];
    }

    return { color, text };
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

    // 1. 移動先が床（0）の場合
    if (map[nextY][nextX] === 0) {
        player.x = nextX;
        player.y = nextY;
        player.isMoving = true;
        return;
    }

    // 2. 移動先が各種ブロックの場合
    if (isBlock(map[nextY][nextX])) {
        let checkX = nextX;
        let checkY = nextY;
        const blocksToMove = []; // 動かす対象のブロックたちの座標と種類を記録

        // 進行方向に並んでいるブロックをすべてリストアップする
        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[checkY].length &&
            isBlock(map[checkY][checkX])
        ) {
            blocksToMove.push({ x: checkX, y: checkY, value: map[checkY][checkX] });
            checkX += dx;
            checkY += dy;
        }

        // 連続したブロックの「さらにその先」の座標
        const finalX = checkX;
        const finalY = checkY;

        // ブロックの先の座標がマップ内かつ「床（0）」であれば、すべて押し出せる
        if (
            finalY >= 0 && finalY < map.length &&
            finalX >= 0 && finalX < map[finalY].length &&
            map[finalY][finalX] === 0
        ) {
            // 内部データ（配列）を先に更新。後ろのブロックから順番に1マスずつ先にずらす
            for (let i = blocksToMove.length - 1; i >= 0; i--) {
                const b = blocksToMove[i];
                map[b.y + dy][b.x + dx] = b.value;
                
                // アニメーション用に描画初期座標を持たせたオブジェクトを作る
                movingBlocks.push({
                    value: b.value,
                    px: b.x * TILE_SIZE,
                    py: b.y * TILE_SIZE,
                    tx: (b.x + dx) * TILE_SIZE,
                    ty: (b.y + dy) * TILE_SIZE
                });
            }
            // プレイヤーのすぐ目の前にあったブロックの場所を床（0）にする
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
    // プレイヤーの移動アニメーション計算
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

    // ブロックの移動アニメーション計算
    for (let i = 0; i < movingBlocks.length; i++) {
        const b = movingBlocks[i];
        
        if (b.px < b.tx) b.px = Math.min(b.px + MOVE_SPEED, b.tx);
        if (b.px > b.tx) b.px = Math.max(b.px - MOVE_SPEED, b.tx);
        if (b.py < b.ty) b.py = Math.min(b.py + MOVE_SPEED, b.ty);
        if (b.py > b.ty) b.py = Math.max(b.py - MOVE_SPEED, b.ty);
    }

    // アニメーションがすべて終わったブロックを配列から削除
    movingBlocks = movingBlocks.filter(b => b.px !== b.tx || b.py !== b.ty);
}

// ブロックの文字を描画する共通関数
function drawBlockText(text, px, py) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
}

// 描画関数
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マップの描画（床、壁、静止しているブロック）
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
                
                // 動いていない（固定されている）ブロックを描画
                if (isBlock(map[y][x])) {
                    // 動いているブロックのリストに存在しない場合のみ描画
                    const isMoving = movingBlocks.some(b => Math.floor(b.tx / TILE_SIZE) === x && Math.floor(b.ty / TILE_SIZE) === y);
                    if (!isMoving) {
                        const style = getBlockStyle(map[y][x]);
                        ctx.fillStyle = style.color;
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
                        drawBlockText(style.text, x * TILE_SIZE, y * TILE_SIZE);
                    }
                }
            }
        }
    }

    // アニメーション中のブロックを描画
    movingBlocks.forEach(b => {
        const style = getBlockStyle(b.value);
        ctx.fillStyle = style.color;
        ctx.fillRect(b.px, b.py, TILE_SIZE - 1, TILE_SIZE - 1);
        drawBlockText(style.text, b.px, b.py);
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
