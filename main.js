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
    if (nextY < 0 || nextY >= map.length || nextX < 0 || nextX >= map[0].length) {
        return;
    }

    // 移動先が床（0）の場合、そのまま移動
    if (map[nextY][nextX] === 0) {
        player.x = nextX;
        player.y = nextY;
        return;
    }

    // 移動先がブロック（2）の場合、連続するブロックの数を調べる
    if (map[nextY][nextX] === 2) {
        let blockCount = 0;
        let checkX = nextX;
        let checkY = nextY;

        // 進行方向にブロックがいくつ並んでいるか数える
        while (
            checkY >= 0 && checkY < map.length &&
            checkX >= 0 && checkX < map[0].length &&
            map[checkY][checkX] === 2
        ) {
            blockCount++;
            checkX += dx;
            checkY += dy;
        }

        // 連続したブロックの「さらにその先」の座標
        const finalX = checkX;
        const finalY = checkY;

        // ブロックの先の座標がマップの範囲内であり、かつ床（0）であるかチェック
        if (
            finalY >= 0 && finalY < map.length &&
            finalX >= 0 && finalX < map[0].length &&
            map[finalY][finalX] === 0
        ) {
            // 後ろのブロックから順番に1マスずつ先にずらしていく
            for (let i = blockCount; i > 0; i--) {
                const currentBlockX = nextX + dx * (i - 1);
                const currentBlockY = nextY + dy * (i - 1);
                
                map[currentBlockY + dy][currentBlockX + dx] = 2; // 先のマスをブロックにする
            }

            //
