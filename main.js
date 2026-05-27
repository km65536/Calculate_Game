const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 32;

// マップデータを保持する配列（CSVから読み込むため最初は空）
let map = [];

// プレイヤーの初期位置（タイル座標）
const player = {
    x: 1,
    y: 1
};

// CSVファイルを読み込んで2次元配列に変換する関数
async function loadMapCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status}`);
        }
        const text = await response.text();
        
        // 改行で区切り、各行をカンマで分割して数値の配列にする
        const rows = text.trim().split(/\r?\n/);
        map = rows.map(row => row.split(",").map(Number));
        
        // 読み込みが完了したら描画する
        draw();
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}

// 描画関数
function draw() {
    // マップデータがまだ読み込まれていない場合は何もしない
    if (map.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マップの描画
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            if (map[y][x] === 1) {
                // 壁（赤色）
                ctx.fillStyle = "#ff4d4d";
            } else if (map[y][x] === 2) {
                // 押せるブロック（黄色）
                ctx.fillStyle = "#ffcc00";
            } else {
                // 床（暗いグレー）
                ctx.fillStyle = "#333333";
            }
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
        }
    }

    // プレイヤーの描画（緑色）
    ctx.fillStyle = "#4dff4d";
    ctx.fillRect(player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
}

// 移動と複数ブロックの押し出し処理（衝突判定つき）
function movePlayer(dx, dy) {
    if (map.length === 0) return;

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    // プレイヤーの移動先がマップの範囲外なら何もしない
    if (nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[nextY].length) {
        return;
    }

    // 移動先が床（0）の場合、そのまま移動
    if (map[nextY][nextX] === 0) {
        player.x = nextX;
        player.y = nextY;
        return;
    }

    // 移動先がブロック（2）の場合
    if (map[nextY][nextX] === 2) {
        let checkX = nextX;
        let checkY = nextY;

        // 進行方向に並んでいるブロックをスキップして、その「先にあるマス」を探索する
        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[checkY].length &&
            map[checkY][checkX] === 2
        ) {
            checkX += dx;
            checkY += dy;
        }

        // 探索した「先にあるマス」がマップの範囲内かチェック
        if (checkY >= 0 && checkY < map.length && checkX >= 0 && checkX < map[checkY].length) {
            // そのマスが「床（0）」であれば、並んでいるブロックすべてを押し出せる
            if (map[checkY][checkX] === 0) {
                
                // ブロックの並びの終点（checkX, checkY）からプレイヤーの目の前（nextX, nextY）まで、
                // 逆方向にたどりながらブロック（2）を1マスずつ後ろにずらしていく
                let shiftX = checkX;
                let shiftY = checkY;

                while (shiftX !== nextX || shiftY !== nextY) {
                    const prevX = shiftX - dx;
                    const prevY = shiftY - dy;
                    map[shiftY][shiftX] = map[prevY][prevX];
                    shiftX = prevX;
                    shiftY = prevY;
                }

                // プレイヤーが元々いたマス（または直前のブロックがあったマス）を床（0）にする
                map[nextY][nextX] = 0;

                // プレイヤーを1マス前進させる
                player.x = nextX;
                player.y = nextY;
            }
        }
    }
}

// 移動と再描画を一括で行う関数
function handleMove(dx, dy) {
    movePlayer(dx, dy);
    draw();
}

// キーボード入力のイベントリスナー
window.addEventListener("keydown", function(event) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
    }

    switch(event.key) {
        case "ArrowUp":
            handleMove(0, -1);
            break;
        case "ArrowDown":
            handleMove(0, 1);
            break;
        case "ArrowLeft":
            handleMove(-1, 0);
            break;
        case "ArrowRight":
            handleMove(1, 0);
            break;
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
            handleMove(btn.dx, btn.dy);
        });
        element.addEventListener("click", function(event) {
            handleMove(btn.dx, btn.dy);
        });
    }
});

// 最初に map1.csv を読み込む
loadMapCSV("./map/map1.csv");
