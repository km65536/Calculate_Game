const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 32;
// アニメーションの移動速度（1フレームに移動するピクセル数。32の約数「2, 4, 8」などにするとぴったり止まります）
const MOVE_SPEED = 4;

// マップデータを保持する配列
let map = [];

// プレイヤーのデータ
const player = {
    x: 1,  // タイル座標X
    y: 1,  // タイル座標Y
    px: 32, // 描画用ピクセル座標X (初期値: 1 * 32)
    py: 32, // 描画用ピクセル座標Y (初期値: 1 * 32)
    isMoving: false // 移動アニメーション中かどうかのフラグ
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

    // 2. 移動先がブロック（2）の場合
    if (map[nextY][nextX] === 2) {
        let checkX = nextX;
        let checkY = nextY;
        const blocksToMove = []; // 動かす対象のブロックたちのタイル座標を記録

        // 進行方向に並んでいるブロックをすべてリストアップする
        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[checkY].length &&
            map[checkY][checkX] === 2
        ) {
            blocksToMove.push({ x: checkX, y: checkY });
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
            // 内部データ（配列）を先に更新する。
            // 後ろのブロックから順番に1マスずつ先にずらしていく
            for (let i = blocksToMove.length - 1; i >= 0; i--) {
                const b = blocksToMove[i];
                map[b.y + dy][b.x + dx] = 2;
                
                // アニメーション用に描画初期座標を持たせたオブジェクトを作る
                movingBlocks.push({
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

        // X座標を目標に近づける
        if (player.px < targetPx) player.px = Math.min(player.px + MOVE_SPEED, targetPx);
        if (player.px > targetPx) player.px = Math.max(player.px - MOVE_SPEED, targetPx);

        // Y座標を目標に近づける
        if (player.py < targetPy) player.py = Math.min(player.py + MOVE_SPEED, targetPy);
        if (player.py > targetPy) player.py = Math.max(player.py - MOVE_SPEED, targetPy);

        // 目標に完全に到達したかチェック
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

// 描画関数
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マップの描画（床と壁だけを描画。ブロックはアニメーションがあるのでここでは除外するか、静止しているものだけを描画する）
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            if (map[y][x] === 1) {
                // 壁（赤色）
                ctx.fillStyle = "#ff4d4d";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
            } else {
                // 床（暗いグレー、動いているブロックの下にも床を描画するため一律で塗る）
                ctx.fillStyle = "#333333";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
                
                // 動いていない（固定されている）ブロックを描画
                if (map[y][x] === 2) {
                    // 動いているブロックのリストに存在しない場合のみ描画
                    const isMoving = movingBlocks.some(b => Math.floor(b.tx / TILE_SIZE) === x && Math.floor(b.ty / TILE_SIZE) === y);
                    if (!isMoving) {
                        ctx.fillStyle = "#ffcc00";
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
                    }
                }
            }
        }
    }

    // アニメーション中のブロックを描画（黄色）
    ctx.fillStyle = "#ffcc00";
    movingBlocks.forEach(b => {
        ctx.fillRect(b.px, b.py, TILE_SIZE - 1, TILE_SIZE - 1);
    });

    // プレイヤーの描画（緑色、計算されたピクセル座標を使用）
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

    // 移動中は入力を無視
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
