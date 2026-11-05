/**
 * scrtKH — HL · Hiệp Nghĩa OL (侠义OL) · BẢN KHÁCH HÀNG
 * ------------------------------------------------------------------
 * KHÔNG đóng file này vào APK. APK chỉ chứa loaderKH; loaderKH tải file này từ máy chủ rồi chạy.
 * Sửa file này xong: chép vào /sdcard/XiayiFB/kh/scrtKH.js trên máy HL -> devTool ☁ Đẩy lên.
 *
 * Khách chỉ cần: mở ứng dụng -> chọn Boss LV -> chỉnh Delay (nếu muốn) -> gạt RUN.
 * TAB: ⚔ Boss · 🌾 Train · 📜 Nhiệm vụ  (Train / Nhiệm vụ: phát triển sau)
 *   Boss [LV] · Delay [s] (chờ sau khi thanh máu quái biến mất) · RUN (công tắc)
 *   🐞 trên đầu bảng: gửi báo lỗi (ảnh màn hình + nhật ký) về Telegram của HL
 * ĐANG CHẠY: bảng thu thành logo tròn góc dưới-trái.
 *   chạm logo = tạm dừng + mở bảng · chạm logo trên bảng = chạy tiếp · chạm đúp / gạt RUN tắt = dừng hẳn.
 *
 * MÁY CHỦ (GitHub Hp9984/hl-xiayi — nhánh main, khách beta dùng nhánh beta) — devTool tạo tự động:
 *   index.json   { ver, note, notice, stop, stopMsg, minLoader, code:{file,sha256}, report:{tg,chat},
 *                  files:{ "config.json":sha256, "tpl/x.png":sha256, ... }, boss:[{level,file,tested}] }
 *   keys.json    (chỉ nhánh main) danh sách khách đã băm: { sha256("HLK|"+mãMáy): {name,exp,beta,off} }
 *   config.json  vị trí nút đã NEO theo góc màn hình (#3) -> đúng trên mọi cỡ màn
 */

auto.waitFor();

var ENV = (typeof HL_ENV !== "undefined" && HL_ENV) || null;
if (!ENV) { toast("Hãy mở bằng ứng dụng Hải Long"); exit(); }
var REPO = ENV.repo || "Hp9984/hl-xiayi", BRANCH = ENV.branch || "main";
var ROOT = "/sdcard/HLKhach/";
var CACHE = ROOT + "server/";                // bản sao dữ liệu máy chủ (đã kiểm tra sha256)
var CFG_PATH = CACHE + "config.json";
var TPL_DIR = CACHE + "tpl/";
var REC_PATH = ROOT + "learn.json";          // dữ liệu tự học riêng máy khách
var BOT_PATH = ROOT + "user.json";           // lựa chọn của khách (LV, Delay, bản đã xem ghi chú)
var STAT_PATH = ROOT + "stats.json";         // thống kê các lượt chạy (#8)
files.ensureDir(TPL_DIR + "x.png");
var TPL_KEYS = ["mapTitle", "target", "revive", "done", "close"];

function readJson(p, def) {
    try { if (files.exists(p)) return JSON.parse(files.read(p)); } catch (e) { log("json " + p + ": " + e); }
    return def;
}
function sha256(x) {
    var b = typeof x === "string" ? new java.lang.String(x).getBytes("UTF-8") : x;
    var d = java.security.MessageDigest.getInstance("SHA-256").digest(b), s = "";
    for (var i = 0; i < d.length; i++) { var v = (d[i] & 0xff).toString(16); s += v.length < 2 ? "0" + v : v; }
    return s;
}
function z2(n) { return (n < 10 ? "0" : "") + n; }
function today() { var d = new Date(); return d.getFullYear() + "-" + z2(d.getMonth() + 1) + "-" + z2(d.getDate()); }
function hhmm() { var d = new Date(); return z2(d.getHours()) + ":" + z2(d.getMinutes()) + ":" + z2(d.getSeconds()); }

/* ============================ NHẬT KÝ NGẮN (gửi kèm báo lỗi #4) ============================ */
var LOGBUF = [];
function logx(s) { s = hhmm() + " " + s; log(s); LOGBUF.push(s); if (LOGBUF.length > 60) LOGBUF.shift(); }

/* ============================ ĐỒNG BỘ MÁY CHỦ ============================ */
var SYNC = { ready: false, ok: false, msg: "Đang tải dữ liệu…" }, IDX = null;
function gh(path) {                          // API GitHub (luôn mới) -> quá giới hạn thì raw
    var H = { "User-Agent": "HL-KH", "Accept": "application/vnd.github.raw" };
    try {
        var r = http.get("https://api.github.com/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH, { headers: H });
        if (r.statusCode === 200) return r.body.bytes();
    } catch (e) { }
    var r2 = http.get("https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + path + "?t=" + Date.now());
    if (r2.statusCode !== 200) throw new Error(path + ": HTTP " + r2.statusCode);
    return r2.body.bytes();
}
function syncServer() {
    var local = readJson(CACHE + "index.json", null);
    try {
        var raw = gh("index.json");
        var idx = JSON.parse(String(new java.lang.String(raw, "UTF-8")));
        var list = Object.keys(idx.files || {});
        var same = local && local.ver === idx.ver && local._branch === BRANCH &&
            list.every(function (p) { return files.exists(CACHE + p); });
        if (!same) {
            var got = {};
            list.forEach(function (p) {                       // tải hết vào bộ nhớ, sai sha256 -> bỏ cả lượt
                var b = gh(p);
                if (sha256(b) !== idx.files[p]) throw new Error(p + " sai mã kiểm tra");
                got[p] = b;
            });
            list.forEach(function (p) { files.ensureDir(CACHE + p); files.writeBytes(CACHE + p, got[p]); });
        }
        idx._branch = BRANCH;
        files.write(CACHE + "index.json", JSON.stringify(idx));   // luôn ghi bản mới (notice/stop mới nhất)
        IDX = idx;
        SYNC = { ready: true, ok: true, msg: (same ? "Dữ liệu mới nhất" : "Đã cập nhật dữ liệu") + " · v" + idx.ver + (BRANCH === "beta" ? " β" : "") };
    } catch (e) {
        logx("sync: " + e);
        IDX = local;
        SYNC = local
            ? { ready: true, ok: true, msg: "Ngoại tuyến — dùng dữ liệu đã lưu · v" + local.ver }
            : { ready: true, ok: false, msg: "Không tải được dữ liệu — kiểm tra mạng rồi mở lại" };
    }
}
// gạt RUN: hỏi nhanh máy chủ có đang tạm khóa không (#5). Mất mạng thì cho chạy.
function serverStopped() {
    try {
        var i = JSON.parse(String(new java.lang.String(gh("index.json"), "UTF-8")));
        return i.stop ? (i.stopMsg || "Kịch bản đang tạm ngưng") : null;
    } catch (e) { return null; }
}

/* ============================ CÀI ĐẶT (từ máy chủ) ============================ */
var PDEF = {
    trackMove: 1, maxTravel: 40, threshold: 0.8, offX: 0, offY: 0,
    goHigh: 1, clear: 6, switchCount: 3, switchDelay: 600,
    minFight: 4, maxFight: 120, fightNoTpl: 15, recast: 0,
    loops: 1, maxDeaths: 10, doneWait: 60
};
var bot = readJson(BOT_PATH, {});
function saveBot() { files.write(BOT_PATH, JSON.stringify(bot, null, 2)); }

var cfg = {};
function loadCfg() {
    cfg = readJson(CFG_PATH, {});
    cfg.points = cfg.points || {};
    cfg.rects = cfg.rects || {};
    cfg.params = cfg.params || {};
    for (var pk in PDEF) if (cfg.params[pk] == null) cfg.params[pk] = PDEF[pk];
    if (bot.clear != null) cfg.params.clear = bot.clear;    // Delay khách tự chỉnh
    applyAnchors();
}
/* ----- #3 NEO NÚT THEO GÓC MÀN HÌNH -----
 * devTool lưu mỗi nút: a = "l" (neo trái) | "r" (neo phải) | "c" (giữa), dx/dy/w/h tính theo CHIỀU CAO màn hình.
 * Game giữ giao diện theo chiều cao và căn 2 bên -> đổi lại ra pixel theo màn của khách là khớp. */
function anchorX(p) { return p.a === "l" ? p.dx * SH : p.a === "r" ? SW - p.dx * SH : SW / 2 + p.dx * SH; }
function applyAnchors() {
    var A = cfg.anchors;
    if (!A || !SW || !SH) return;
    for (var k in A.points || {}) { var p = A.points[k]; cfg.points[k] = [anchorX(p) / SW, p.dy]; }
    for (var r in A.rects || {}) {
        var q = A.rects[r], cx = anchorX(q), w = q.w * SH, h = q.h * SH;
        cfg.rects[r] = [(cx - w / 2) / SW, q.dy - q.h / 2, w / SW, q.h];
    }
}
loadCfg();

var rec = readJson(REC_PATH, {});
rec.learn = rec.learn || {};
function seedLearn() {                                      // dùng dữ liệu học của HL cho FB khách chưa có
    var s = readJson(CACHE + "learn.json", null);
    if (!s || !s.learn) return;
    for (var k in s.learn) if (!rec.learn[k]) rec.learn[k] = s.learn[k];
}
seedLearn();
function saveRec() { files.write(REC_PATH, JSON.stringify({ learn: rec.learn }, null, 2)); }

/* ============================ CÔNG THỨC TỌA ĐỘ (giống mainScript) ============================ */
// Tính theo TÂM màn hình + CHIỀU CAO màn hình -> đúng cho cả màn 1920x1080 lẫn 2340x1080
// (game giữ tỉ lệ theo chiều cao, giao diện căn giữa). 18 điểm đứng yên từ 4 video, 2 kiểu màn, sai số ~1px:
//   px = SW/2 + SH*(xc + k*(gx-gy))      py = SH*(y0 + m*(gx+gy))
var COORD_PRESETS = {
    "75": { xc: -320.45 / 1080, k: 5.059 / 1080, y0: 330.64 / 1080, m: 2.612 / 1080 }
};
// Đầu đường kẻ đỏ (game vẽ khi đã nhận lệnh đi) nằm dưới tâm ô vàng ~7px
var LINE_OFF = [1.0 / 1080, 6.8 / 1080];
// Chạm ở đâu thì ô vàng dừng ở đâu: chạm thấp hơn điểm đích ~12px (đo từ video). Tự học thêm khi chạy.
var TAP_OFF0 = { dx: 1.5 / 1080, dy: 12.2 / 1080, n: 2 };

function lvKey() { return String(bot.level); }
// dữ liệu học riêng từng FB: res = sai lệch đo được (đơn vị SH) chỉ khi CHẮC CHẮN (bản đồ mở + đứng yên + chữ đọc 2 lần giống nhau)
function learnStore() { var k = lvKey(); return rec.learn[k] || (rec.learn[k] = { res: [], tap: null, pts: [] }); }
function median(a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[s.length >> 1] : 0; }

function coordModel() {                     // trả về công thức theo PIXEL của màn hình hiện tại
    var pre = COORD_PRESETS[lvKey()], st = learnStore();
    if (pre) {
        var dx = 0, dy = 0;
        if (st.res.length >= 3) {
            dx = median(st.res.map(function (r) { return r[0]; }));
            dy = median(st.res.map(function (r) { return r[1]; }));
            if (Math.abs(dx) > 0.03 || Math.abs(dy) > 0.03) { dx = 0; dy = 0; }
        }
        return { x0: SW / 2 + SH * (pre.xc + dx), k: SH * pre.k, y0: SH * (pre.y0 + dy), m: SH * pre.m };
    }
    // FB chưa có công thức: tự tính từ các điểm chắc chắn (cần >= 3 điểm trải rộng)
    var P = st.pts;
    if (P.length < 3) return null;
    var us = P.map(function (p) { return p[0] - p[1]; }), vs = P.map(function (p) { return p[0] + p[1]; });
    if (Math.max.apply(null, us) - Math.min.apply(null, us) < 8 || Math.max.apply(null, vs) - Math.min.apply(null, vs) < 8) return null;
    var X = lin1(us, P.map(function (p) { return SW / 2 + p[2] * SH; })), Y = lin1(vs, P.map(function (p) { return p[3] * SH; }));
    return (X && Y && X[1] > 0 && Y[1] > 0) ? { x0: X[0], k: X[1], y0: Y[0], m: Y[1] } : null;
}
function pxOf(M, g) { return [M.x0 + M.k * (g[0] - g[1]), M.y0 + M.m * (g[0] + g[1])]; }
function coordOfPx(M, p) {
    var u = (p[0] - M.x0) / M.k, v = (p[1] - M.y0) / M.m;
    return [Math.round((u + v) / 2), Math.round((v - u) / 2)];
}
function coordFromDot(me) { var M = me ? coordModel() : null; return M ? coordOfPx(M, me) : null; }

// ghi 1 cặp CHẮC CHẮN (tọa độ chữ + ô vàng) để hiệu chỉnh nhẹ công thức
function addSure(g, me) {
    var st = learnStore(), pre = COORD_PRESETS[lvKey()];
    st.pts.push([g[0], g[1], (me[0] - SW / 2) / SH, me[1] / SH]);
    if (st.pts.length > 40) st.pts.shift();
    if (pre) {
        var ex = SW / 2 + SH * (pre.xc + pre.k * (g[0] - g[1])), ey = SH * (pre.y0 + pre.m * (g[0] + g[1]));
        var rx = (me[0] - ex) / SH, ry = (me[1] - ey) / SH;
        if (Math.abs(rx) < 0.03 && Math.abs(ry) < 0.03) { st.res.push([rx, ry]); if (st.res.length > 15) st.res.shift(); }
    }
    saveRec();
}
function tapOff() { var t = learnStore().tap || TAP_OFF0; return [t.dx * SH, t.dy * SH]; }
function learnTap(tap, dest) {             // tap: chỗ đã chạm; dest: tâm ô vàng nơi game sẽ dừng (từ đường đỏ)
    var dx = (tap[0] - dest[0]) / SH, dy = (tap[1] - dest[1]) / SH;
    if (Math.abs(dx) > 0.025 || Math.abs(dy) > 0.025) return;     // chạm vào chỗ không đi được -> game chọn ô khác, không học
    var st = learnStore(), t = st.tap || { dx: TAP_OFF0.dx, dy: TAP_OFF0.dy, n: TAP_OFF0.n }, n = Math.min(t.n, 9);
    st.tap = { dx: (t.dx * n + dx) / (n + 1), dy: (t.dy * n + dy) / (n + 1), n: t.n + 1 };
    saveRec();
}


/* ============================ HÀM DÙNG CHUNG (lấy từ bot chính) ============================ */
var SW = 0, SH = 0, capOK = false, TPL = {}, lastCoordText = "";
function grab() {
    var img = captureScreen();
    SW = img.getWidth();
    SH = img.getHeight();
    return img;
}

function toPx(f) { return [Math.round(f[0] * SW), Math.round(f[1] * SH)]; }

function sq(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }

function tapAt(p, exact) {
    // nhấn giữ ~80ms: một số game bỏ qua cú chạm quá nhanh.
    // exact = chạm đúng pixel (dùng cho điểm trên bản đồ: lệch 2px đã gần nửa ô)
    var j = exact ? 0 : 2;
    press(Math.round(p[0]) + random(-j, j), Math.round(p[1]) + random(-j, j), 80);
}

function tapKey(k) {
    var f = cfg.points[k];
    if (!f) return false;
    tapAt(toPx(f));
    return true;
}

function loadTemplates() {
    freeTemplates();
    var scale = (cfg.screen && SH) ? SH / cfg.screen[1] : 1;     // game co giãn theo CHIỀU CAO (#3)
    TPL_KEYS.forEach(function (k) {
        var path = TPL_DIR + k + ".png";
        if (!files.exists(path)) return;
        var im = images.read(path);
        if (!im) return;
        if (Math.abs(scale - 1) > 0.02) {
            var r = images.resize(im, [Math.max(4, Math.round(im.getWidth() * scale)),
                Math.max(4, Math.round(im.getHeight() * scale))]);
            im.recycle();
            im = r;
        }
        TPL[k] = im;
    });
}

function freeTemplates() {
    for (var k in TPL) { try { TPL[k].recycle(); } catch (e) { } }
    TPL = {};
}

function find(img, k) {
    var tp = TPL[k];
    if (!tp) return null;
    var p = images.findImage(img, tp, { threshold: cfg.params.threshold });
    return p ? [p.x + tp.getWidth() / 2, p.y + tp.getHeight() / 2] : null;
}

function toArr(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    var a = [];
    if (typeof x.size === "function") { for (var i = 0; i < x.size(); i++) a.push(x.get(i)); return a; }
    if (x.length != null) { for (var j = 0; j < x.length; j++) a.push(x[j]); }
    return a;
}

function isTerrain(c) {
    var r = colors.red(c), g = colors.green(c), b = colors.blue(c);
    return (g > r + 15 && g > b + 25 && g > 60) || (r > 150 && g > 140 && b < 110 && r - b > 70);
}

function findMarker(img, color, thr) {
    var rect = mapRect();                       // chỉ tìm trong khung bản đồ lớn
    var pts;
    try { pts = toArr(images.findAllPointsForColor(img, color, { region: rect, threshold: thr })); }
    catch (e) { return null; }
    if (!pts.length || pts.length > 20000) return null;
    var set = {}, seen = {};
    pts.forEach(function (p) { set[p.x * 65536 + p.y] = 1; });
    var sc = SW / 1280, minS = Math.max(3, 3 * sc), maxS = 10 * sc;
    var best = null, bestScore = -1;
    pts.forEach(function (p0) {
        var k0 = p0.x * 65536 + p0.y;
        if (seen[k0]) return;
        seen[k0] = 1;
        var st = [[p0.x, p0.y]], n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, sx = 0, sy = 0;
        while (st.length) {
            var q = st.pop();
            n++; sx += q[0]; sy += q[1];
            if (q[0] < x0) x0 = q[0];
            if (q[0] > x1) x1 = q[0];
            if (q[1] < y0) y0 = q[1];
            if (q[1] > y1) y1 = q[1];
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
                var k = (q[0] + dx) * 65536 + (q[1] + dy);
                if (set[k] && !seen[k]) { seen[k] = 1; st.push([q[0] + dx, q[1] + dy]); }
            }
        }
        var w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (w < minS || h < minS || w > maxS || h > maxS) return;
        if (w / h < 0.6 || w / h > 1.7) return;
        if (n / (w * h) < 0.7) return;
        var cx = sx / n, cy = sy / n, rr = Math.max(w, h) + 4, score = 0;
        for (var a = 0; a < 12; a++) {
            var ang = a * Math.PI / 6;
            var x = Math.round(cx + rr * Math.cos(ang)), y = Math.round(cy + rr * Math.sin(ang));
            if (x >= 0 && y >= 0 && x < SW && y < SH && isTerrain(images.pixel(img, x, y))) score++;
        }
        if (score > bestScore) { bestScore = score; best = [cx, cy]; }
    });
    return best;
}

function findSelf(img) { return findMarker(img, "#fff000", 28); }

function hasCoordBox() { return !!(cfg.rects && cfg.rects.coordBox); }

function ocrEngines() {
    var e = [];
    if (typeof paddle !== "undefined" && paddle) { if (paddle.ocr) e.push("paddle"); if (paddle.ocrText) e.push("paddle.ocrText"); }
    if (typeof gmlkit !== "undefined" && gmlkit && gmlkit.ocr) e.push("gmlkit");
    return e;
}

function ocrRaw(img) {
    var errs = [];
    if (typeof paddle !== "undefined" && paddle && paddle.ocr) {
        try {
            var r = toArr(paddle.ocr(img));
            if (r.length) return r.map(function (x) { return { text: String(x.text || ""), b: x.bounds }; });
        } catch (e) { errs.push("paddle: " + e); }
    }
    if (typeof gmlkit !== "undefined" && gmlkit && gmlkit.ocr) {
        try {
            var g = gmlkit.ocr(img, "zh");
            var arr = g && g.toArray ? toArr(g.toArray(3)) : [];
            if (arr.length) return arr.map(function (x) { return { text: String(x.text || x.label || ""), b: x.bounds }; });
            if (g && g.text) return [{ text: String(g.text), b: null }];
        } catch (e) { errs.push("gmlkit: " + e); }
    }
    if (typeof paddle !== "undefined" && paddle && paddle.ocrText) {
        try {
            var tx = toArr(paddle.ocrText(img));
            if (tx.length) return tx.map(function (s) { return { text: String(s), b: null }; });
        } catch (e) { errs.push("ocrText: " + e); }
    }
    if (!ocrEngines().length) throw new Error("no OCR");
    if (errs.length) log("ocr: " + errs.join(" | "));
    return [];
}

function coordRect() {
    var r = cfg.rects.coordBox;
    var x = Math.max(0, Math.round(r[0] * SW)), y = Math.max(0, Math.round(r[1] * SH));
    return [x, y, Math.max(8, Math.min(SW - x, Math.round(r[2] * SW))), Math.max(8, Math.min(SH - y, Math.round(r[3] * SH)))];
}

function parseCoord(txt) {
    var t2 = String(txt).replace(/[oO]/g, "0").replace(/[lI|]/g, "1").replace(/b/g, "6").replace(/[sS]/g, "5").replace(/[zZ]/g, "2").replace(/B/g, "8").replace(/[gq]/g, "9").replace(/（/g, "(").replace(/）/g, ")");
    var m = t2.match(/(\d{1,3})\s*[,，.。:;]\s*(\d{1,3})/) || t2.match(/\(\s*(\d{1,3})\s+(\d{1,3})\s*\)/);
    if (!m) return null;
    // tọa độ game luôn < 100: "137" = "(" đọc nhầm thành "1" -> 37 ; "231" = ")" đọc nhầm ở cuối -> 23
    var a = m[1], b = m[2];
    if (+a > 99) a = a.slice(1);
    if (+b > 99) b = b.slice(0, -1);
    return [+a, +b];
}

function readCoord(img, saveDebug) {
    if (!hasCoordBox()) return null;
    var rc = coordRect(), clip = images.clip(img, rc[0], rc[1], rc[2], rc[3]), variants = [];
    try {
        var big = images.scale(clip, 3, 3);
        variants.push(big);
        try {
            var gray = images.grayscale(big);
            variants.push(images.threshold(gray, 165, 255, "BINARY_INV"));   // chữ trắng -> chữ đen trên nền trắng
            variants.push(images.threshold(gray, 165, 255, "BINARY"));
            gray.recycle();
        } catch (e1) { log("coord prep: " + e1); }
        if (saveDebug) { try { images.save(big, ROOT + "coord_crop.png", "png"); } catch (e2) { } }
        for (var i = 0; i < variants.length; i++) {
            var txt;
            try { txt = ocrRaw(variants[i]).map(function (r) { return r.text; }).join(" "); }
            catch (e3) { lastCoordText = String(e3); return null; }
            lastCoordText = txt;
            var c = parseCoord(txt);
            if (c) return c;
        }
        return null;
    } finally {
        clip.recycle();
        variants.forEach(function (v) { try { v.recycle(); } catch (e4) { } });
    }
}

function lin1(us, vs) {
    var n = us.length, su = 0, sv = 0, suu = 0, suv = 0;
    for (var i = 0; i < n; i++) { su += us[i]; sv += vs[i]; suu += us[i] * us[i]; suv += us[i] * vs[i]; }
    var d = n * suu - su * su;
    if (n < 2 || Math.abs(d) < 1e-6) return null;
    var b = (n * suv - su * sv) / d;
    return [(sv - b * su) / n, b];
}

function fracToCoord(M, f) {
    var u = (f[0] - M.x0) / M.k, v = (f[1] - M.y0) / M.m;
    return [Math.round((u + v) / 2), Math.round((v - u) / 2)];
}

function coordToFrac(M, g) { return [M.x0 + M.k * (g[0] - g[1]), M.y0 + M.m * (g[0] + g[1])]; }
// Bản đồ lớn đang mở? Kiểm tra NỀN GIẤY của bản đồ (không dựa vào ô vàng nữa —
// lúc đóng bản đồ, cảnh game có nhiều đốm vàng làm nhận nhầm, đó là lỗi của bản 97)
function parchment(img) {
    var cx = SW / 2, n = 0, t = 0;
    for (var j = 0; j < 9; j++) for (var i = 0; i < 13; i++) {
        var x = Math.round(cx + (-0.70 + 0.42 * i / 12) * SH), y = Math.round((0.17 + 0.56 * j / 8) * SH);
        if (x < 0 || x >= SW) continue;
        t++;
        var c = images.pixel(img, x, y), r = colors.red(c), g = colors.green(c), b = colors.blue(c);
        if (r >= 140 && r <= 225 && g >= 130 && g <= 215 && b >= 100 && b <= 190 && r - b >= 12 && r - b <= 70 && Math.abs(r - g) < 25) n++;
    }
    return t ? n / t : 0;
}
function mapIsOpen(img) {
    if (TPL.mapTitle && find(img, "mapTitle")) return true;
    return parchment(img) >= 0.10;
}

function openMap() {
    for (var i = 0; i < 3; i++) {
        if (mapIsOpen(grab())) return true;
        if (!tapKey("mapOpen")) return false;
        nap(1500);
    }
    return mapIsOpen(grab());
}

function closeMapIfOpen(knownOpen) {
    if (!cfg.points.mapClose) return;
    if (mapIsOpen(grab())) { tapKey("mapClose"); nap(500); }
}

function tolSq() { var tol = Math.max(3, 4 * SW / 1280); return tol * tol; }

function trackMove(target, start) {
    var P = cfg.params, t0 = Date.now(), last = start, moved = false, lastMove = Date.now(), miss = 0;
    while (Date.now() - t0 < P.maxTravel * 1000) {
        var img = grab();
        var ev = handleEvents(img, true);
        if (ev) return ev;
        var s = findSelf(img);
        if (!s) {
            if (++miss >= 3) return "lost";
        } else {
            miss = 0;
            if (sq(s, target) <= tolSq()) return "arrived";
            if (!last || sq(s, last) > 4) {
                if (last) moved = true;
                lastMove = Date.now();
            }
            last = s;
            if (!moved && Date.now() - t0 > 3500) return "nomove";
            if (moved && Date.now() - lastMove > 3000) return "arrived";
        }
        nap(400);
    }
    return "arrived";
}

function intArr(list) {
    var a = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, list.length);
    for (var i = 0; i < list.length; i++) a[i] = colors.parseColor(list[i]);
    return a;
}

function makeDraggable(view, w) {
    var dx, dy, wx, wy;
    view.setOnTouchListener(function (v, e) {
        switch (e.getAction()) {
            case e.ACTION_DOWN:
                dx = e.getRawX(); dy = e.getRawY(); wx = w.getX(); wy = w.getY();
                return true;
            case e.ACTION_MOVE:
                w.setPosition(wx + (e.getRawX() - dx), wy + (e.getRawY() - dy));
                return true;
        }
        return true;
    });
}


/* ============================ ĐỘNG CƠ ============================ */
var running = false, paused = false;
var S = { deaths: 0, start: 0 };
function checkRun() { if (!running) throw new Error("STOP"); }
function nap(ms) {
    checkRun();
    sleep(ms);
    while (paused && running) sleep(300);       // tạm dừng: đứng chờ tại đây
    checkRun();
}

// Sự kiện chung: "done" | "dead" | null (chỉ chạy khi đã chụp mẫu nút tương ứng ở ⚙)
function handleEvents(img, mapOpen) {
    var p;
    if (find(img, "done")) return "done";
    if ((p = find(img, "revive"))) {
        S.deaths++;
        say("☠ Nhân vật chết (" + S.deaths + ") — hồi sinh…");
        tapAt(p);
        nap(3500);
        return "dead";
    }
    if (!mapOpen && (p = find(img, "close"))) { tapAt(p); nap(600); }
    return null;
}
function watch(sec) {
    var t0 = Date.now();
    while (Date.now() - t0 < sec * 1000) {
        var ev = handleEvents(grab(), false);
        if (ev) return ev;
        nap(500);
    }
    return null;
}

/* ============================ ĐÁNH 1 BÃI ============================ */
function hasTargetDetector() { return !!TPL.target || (!!cfg.points.targetHp && cfg.targetColor != null); }
function targetVisible(img) {
    if (TPL.target && find(img, "target")) return true;
    if (cfg.points.targetHp && cfg.targetColor != null) {
        var p = toPx(cfg.points.targetHp);
        if (colors.isSimilar(images.pixel(img, p[0], p[1]), cfg.targetColor, 40)) return true;
    }
    return false;
}

// [skill AOE -> Đổi mục tiêu] x switchCount (bấm skill 1 lần mỗi vòng, không spam),
// rồi ở lại tới khi KHÔNG thấy thanh máu quái liên tục `clear` giây.
// (1 con chết thì thanh máu biến mất 1 lúc rồi chuyển sang con khác -> phải chờ đủ lâu mới coi là sạch)
function fight(name) {
    phase("Attacking");
    var P = cfg.params;
    nap(300);
    var n = Math.max(1, Math.round(P.switchCount));
    for (var c = 0; c < n; c++) {
        say("⚔ " + name + ": skill " + (c + 1) + "/" + n);
        tapKey("aoe");
        nap(P.switchDelay);
        if (tapKey("switchTarget")) nap(P.switchDelay);
        var ev0 = handleEvents(grab(), false);
        if (ev0) return ev0;
    }
    if (!hasTargetDetector()) { say("⚔ " + name + ": đánh " + P.fightNoTpl + "s (chưa cài thanh máu quái ở ⚙)"); return watch(P.fightNoTpl); }
    var t0 = Date.now(), lastCast = t0, lastSeen = t0, wasSeen = false;
    while (Date.now() - t0 < P.maxFight * 1000) {
        var img = grab();
        var ev = handleEvents(img, false);
        if (ev) return ev;
        var now = Date.now();
        if (targetVisible(img)) {
            lastSeen = now;
            if (!wasSeen) say("⚔ " + name + ": còn quái — đang đánh");
            wasSeen = true;
            if (P.recast > 0 && now - lastCast >= P.recast * 1000) { tapKey("aoe"); lastCast = now; }
        } else {
            if (wasSeen) wasSeen = false;
            var left = Math.max(0, Math.ceil(P.clear - (now - lastSeen) / 1000));
            say("⚔ " + name + ": không thấy máu quái — chờ " + left + "s cho chắc sạch");
        }
        if (now - t0 >= P.minFight * 1000 && now - lastSeen >= P.clear * 1000) return null;   // bãi sạch
        nap(300);
    }
    return null;
}

function waitDone() {
    if (!TPL.done) return;
    say("Chờ bảng kết thúc phó bản…");
    var t0 = Date.now();
    while (Date.now() - t0 < cfg.params.doneWait * 1000) {
        var img = grab(), p = find(img, "done");
        if (p) { tapAt(p); nap(1000); return; }
        handleEvents(img, false);
        nap(1000);
    }
}

/* ============================ ĐỌC VỊ TRÍ (làm lại, 1aa96) ============================ */
// Đọc chữ tọa độ trên bản đồ nhỏ, chỉ tin khi 2 lần đọc liên tiếp giống nhau
function readOcrStable(tries) {
    if (!hasCoordBox()) return null;
    var last = null;
    for (var i = 0; i < (tries || 4); i++) {
        var c = readCoord(grab());
        if (c && last && c[0] === last[0] && c[1] === last[1]) return c;
        last = c;
        nap(250);
    }
    return null;
}

// Trạng thái hiện tại. dot chỉ có khi bản đồ lớn ĐANG MỞ (đã kiểm tra bằng nền giấy của bản đồ)
function readHere(stopped) {
    var img = grab(), open = mapIsOpen(img), me = open ? findSelf(img) : null;
    var c = readOcrStable(4), est = coordFromDot(me);
    if (c && me && stopped) addSure(c, me);
    return { c: c, est: est, me: me, open: open };
}


/* ----- đường kẻ đỏ trên bản đồ lớn = đường game sẽ đi; đầu xa nhất = nơi sẽ dừng ----- */
function mapRect() {
    var x0 = Math.max(0, Math.round(SW / 2 - 0.70 * SH)), x1 = Math.min(SW, Math.round(SW / 2 + 0.12 * SH));
    return [x0, Math.round(0.15 * SH), x1 - x0, Math.round(0.58 * SH)];
}
function pathEnd(img, from) {
    if (!mapIsOpen(img)) return null;
    var pts;
    try { pts = toArr(images.findAllPointsForColor(img, "#ff0000", { region: mapRect(), threshold: 60 })); }
    catch (e) { return null; }
    if (pts.length < 6 || pts.length > 6000) return null;
    var set = {}, key = function (x, y) { return x * 65536 + y; };
    pts.forEach(function (p) { set[key(p.x, p.y)] = 1; });
    function solid(p) {                                   // bỏ chấm đỏ lẻ (nhiễu): cần >= 3 điểm đỏ quanh nó
        var n = 0;
        for (var dx = -3; dx <= 3; dx++) for (var dy = -3; dy <= 3; dy++) if (set[key(p.x + dx, p.y + dy)]) n++;
        return n >= 4;
    }
    // đường đỏ nối từ nhân vật tới đích -> điểm đỏ XA ô vàng nhất = đích
    var o = from || [SW / 2 - 0.29 * SH, 0.44 * SH], far = null, bd = -1;
    pts.forEach(function (p) { var d = sq([p.x, p.y], o); if (d > bd && solid(p)) { bd = d; far = [p.x, p.y]; } });
    if (!far) return null;
    return [far[0] - LINE_OFF[0] * SH, far[1] - LINE_OFF[1] * SH];      // đổi về vị trí tâm ô vàng khi dừng
}

/* ----- chờ ô vàng đứng yên hẳn (bản đồ vẫn mở) ----- */
function waitStop(start, maxSec) {
    var t0 = Date.now(), last = start, moved = false, still = Date.now(), miss = 0;
    while (Date.now() - t0 < maxSec * 1000) {
        nap(300);
        var img = grab();
        if (!mapIsOpen(img)) return "closed";
        var ev = handleEvents(img, true);
        if (ev) return ev;
        var s = findSelf(img);
        if (!s) { if (++miss >= 4) return "lost"; continue; }
        miss = 0;
        if (last && sq(s, last) > 2) { moved = true; still = Date.now(); }
        last = s;
        if (!moved && Date.now() - t0 > 3000) return "nomove";
        if (moved && Date.now() - still > 1200) return "stopped";
    }
    return "timeout";
}

/* ----- ĐI TỚI 1 TỌA ĐỘ -----
 * 1) mở bản đồ lớn, tính điểm đích theo công thức mới, chạm (bù độ lệch chạm)
 * 2) ngay sau khi chạm: đọc ĐƯỜNG ĐỎ game vẽ -> biết game sẽ dừng ở đâu.
 *    Lệch thì chạm lại ngay (game nhận lệnh mới cả khi đang chạy), không cần đợi đi hết.
 * 3) chờ đứng yên, đọc CHỮ tọa độ 2 lần giống nhau -> kết quả THẬT.
 *    Chỉ báo "Đúng" khi chữ tọa độ khớp; không đọc được chữ thì báo "chưa kiểm tra được". */
// Thuật toán đi đã chính xác cao: lệch x hoặc y ±1 ô coi như đã tới, không chỉnh thêm
function near(c, g) { return Math.abs(c[0] - g[0]) <= 1 && Math.abs(c[1] - g[1]) <= 1; }
function goTo(goal) {
    phase("Moving");
    var M = coordModel();
    if (!M) { say("Boss LV " + bot.level + " chưa có dữ liệu tọa độ — liên hệ HL"); return null; }
    var res = null;
    for (var round = 0; round < 3; round++) {
        if (!openMap()) { say("Không mở được bản đồ — kiểm tra nút Mở BĐ ở ⚙"); return null; }
        nap(300);
        var st = readHere(true);
        if (st.c && near(st.c, goal)) { res = st; break; }
        if (!st.me) { say("Không thấy ô vàng trên bản đồ lớn"); return st.c ? { c: st.c, exact: true } : null; }
        var want = pxOf(coordModel(), goal), off = tapOff(), tap = [want[0] + off[0], want[1] + off[1]], fixed = false;
        if (sq(want, st.me) < Math.pow(M.k * 1.2, 2)) {        // đích sát bên -> game hay bỏ qua: chạm xa hơn chút
            var vx = want[0] - st.me[0], vy = want[1] - st.me[1], l = Math.sqrt(vx * vx + vy * vy) || 1;
            tap = [st.me[0] + vx / l * M.k * 1.5 + off[0], st.me[1] + vy / l * M.k * 1.5 + off[1]];
        }
        for (var t = 0; t < 4; t++) {                            // chạm + sửa theo đường đỏ
            say((round || t ? "Chỉnh → (" : "Đi tới (") + goal.join(",") + ")…");
            tapAt(tap, true);
            nap(450);
            var me = findSelf(grab()) || st.me, dest = pathEnd(grab(), me);
            if (!dest) { nap(300); dest = pathEnd(grab(), me); }
            if (!dest) break;                                    // không có đường đỏ: đã ở sát đích hoặc chạm bị bỏ qua
            learnTap(tap, dest);
            var ex = want[0] - dest[0], ey = want[1] - dest[1];
            if (Math.abs(ex) / M.k + Math.abs(ey) / M.m <= 0.9) { fixed = true; break; }   // trong nửa ô = đúng ô đích
            tap = [tap[0] + ex, tap[1] + ey];                    // đích game chọn bị lệch -> dời chỗ chạm đúng bằng độ lệch
        }
        var r = waitStop(st.me, cfg.params.maxTravel || 40);
        if (r === "dead" || r === "done") { closeMapIfOpen(true); return { ev: r }; }
        res = readHere(r === "stopped");
        if (!res.c) break;                                        // không đọc được chữ -> không sửa mù
        if (near(res.c, goal)) break;                             // lệch ±1 ô là đủ, không chỉnh nữa
        say("Đang ở (" + res.c.join(",") + "), đích (" + goal.join(",") + ") — chỉnh lại…");
    }
    closeMapIfOpen(true);
    if (!res) return null;
    return res.c ? { c: res.c, exact: true } : (res.est ? { c: res.est, exact: false } : null);
}


var MEDAL_B64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAADAFBMVEUAAAAEAw/mt0kBByb4+/sIFzArR2kQJ0kzVXSLZx0YNVOQbCInOVM0W4T/86tKWHNPaIgQJDgpFgmvFh3+55hUdY3ryG6XcSOxxtCRprQtRFpPOA9qeZBwhpZ1la61GSD324qJmK1OZXhuiKgaEw4GGkcpJi+qucnT5e3SrFDn6evP1tcCAABpSxV0VRmrhTInO2UrBwYAAADIyc8LBgDN2eY3YYpHXIU1JQtdRBSjfCm7kTTrwVrz03yOqMcWOWiutbjT9/eoqrGWtck7Y3o3IgGLFRjFmjpKRVQmKkgUCgBVVQCHiJFMSmopGCpWg5ZpaHJoaoq2k0Oz1dj/7aRCLQqMlJYqFwA/PwB1pLRNOUpnWm04BwNMMwdxXS+qVQC21+rMoT3/fwD//wBudXqoq8kaQ2tqeqaVxNCwyumu9vQRDAAMKmMaQlwhDAYlEwA4IgBDLANKJzSGi6tGNjW15u7ItrvLucY1NDVFEwxrR1HR4d0ADEQkEgQsR4ZbiKR/fwCPZ3CVsrqvDhfesUfbvWviv2nyt6vw2NL///9WeqtuVVdzkpmKnMRSVVhTkaSTeoewh5DPW1c8Z6mPc3eT2uarmaPm4dkQDQAfEQAAPwAlEgZVAABILk9zqcNzt8a0Iiejl5vceG/Cwr7/AABGOmpZcXxpSWZnXIZ1ouaMX2qS5OimZHmkeHy0eYa2uenViI3SrLnljYDm1+EVPYEcTYk2co9BGyJLRT9Raal4xtCHZpKWjcyP19apiKu0reKvwb3AJSvVbGXNl5rGzOzsusH8zc8vUV9EXqBOfchYkJtdpbhnY19qbaRoidNxkdhwsLSDT2OJoZySquCQtvSfw+m9NzmhnsOkopzBPj/DQ0PDf4XhfnTwno8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABak3xZAAABAHRSTlMA/v/////////+//7///z////+/v3//v/////8/////v7//////////////0n8/v///i//cP/////9///////////////R/v///48D///////////89v+tBP///wvV/QP//wIB/////////6X//yeRvdf//////////v///2z//wL///7//v7//wH//////////////////8qUBCkD/////////wH///////////////////////////////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+r50AwAAF+5JREFUeNrtW4lb21a2R9WKuCDZIJCEJJBkW8IOYGKMQxKMY5MGKAQoCS0wzdBO1jbpkn2SNnlJ15cmXabbzJtpO5193/f1zfr2fd/+l3fulQw2GEKm6Zt+75v79TOEyvf87tnPuUd1dX9Yf1i/07r3rgeq//DAXff+X9H+wF3Lv27dQtbW5T/c9YH3/OQh4f5HHr2vu/1AA1kH2rvve/SR/hDIe8gJcvSt/ffc191wd1frUEtnSxNZ8MtQa9fdDd333dO/dfnB277+CFN/5LGe3q4hTHhfS2fnUCtZQ52dLfswkKGu3p7HHtkaPnzb19bxx+rvbm3BJ25tvWPNam3FHGlpvbv+sfGt7wH5Lfd0Y+r7OmvQrkDRuQ9j6L5ny+2k/aG6uv7dDV2V1Lvu39G7fXtboIRt27f37ri/qxJDV8PufvLF26N6QB4O3xJS79qxva2erIZwBf9q274jBEEeJhBuizpuebThmaamzp1466f29GLiQLKnu32wfRtZ8Et3D/ljfVvvnqfwczs7m5qeaXh0y+1Q/fFuYH5A/v7eBkynZ3B/NEatWrHo/sEeDKKh9/4QQktX9/i7Nogt+3vL5HfA2dvqe9qjhF4ikUCmLWmaqTvmaCxGEEXbu+vxUzvKEHr3vxsmgF8d72kNZb+jAUQeUD99npXkEYGz/HnrjGLNnrFEUVS1ROx8DGPoAaVo2BHqQmvPONnoFtfH+/v7HwbL3w3HHwrJt9UPbsPUzUJW4UyB42RNHdGsKeZqhBd5iTF5O2uwCcyHQXg4gDAETNgNXuFh2PDjmz/5Q1T0w1HqoSfau5paMPf3wH71+PDbImbWn521TH1kRHCtKccpnVEi4gmRNn3RyloyZ0gvRDEb4Atte7AcWpq62p8IN9wkJz7w0eidTzZ33NkXe7qpE5vddtCsQdj2B0Vf4FRNVS0lL3CyLCtTpmqJ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";

/* ============================ ĐI BOSS (quái cấp cao nhất trong danh sách bản đồ) ============================ */
function ocrItems(img, rect) {
    var clip = images.clip(img, rect[0], rect[1], rect[2], rect[3]), out = [];
    try {
        ocrRaw(clip).forEach(function (r) {
            if (!r.text) return;
            var b = r.b;
            out.push({ text: r.text, cx: b ? rect[0] + (b.left + b.right) / 2 : rect[0] + rect[2] / 2, cy: b ? rect[1] + (b.top + b.bottom) / 2 : rect[1] + rect[3] / 2 });
        });
    } finally { clip.recycle(); }
    return out;
}
function norm(s) { return String(s).replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",").replace(/\s+/g, ""); }
function coordIn(s) {
    var m = norm(s).replace(/[oO]/g, "0").match(/\((\d{1,2})[,.](\d{1,2})\)/);
    return m ? [+m[1], +m[2]] : null;
}
// Danh sách quái bên phải bản đồ lớn, VD "左路元帅(76)  (65,9)" -> cấp 76, tọa độ (65,9)
function findBoss(items) {
    var best = null;
    items.forEach(function (it) {
        var s = norm(it.text), re = /\((\d{1,3})\)/g, m;
        while ((m = re.exec(s))) {
            var lv = +m[1];
            if (lv > 0 && lv < 200 && (!best || lv > best.lv)) best = { lv: lv, name: s.replace(/\(.*$/, ""), cx: it.cx, cy: it.cy, c: coordIn(s.slice(m.index + m[0].length)) };
        }
    });
    if (best && !best.c) {                       // tọa độ nằm ở ô chữ riêng cùng hàng
        var row = SH * 0.03, bd = 1e9;
        items.forEach(function (it) {
            var c = coordIn(it.text), d = Math.abs(it.cy - best.cy);
            if (c && d < row && d < bd && !/\(\d{1,3}\)/.test(norm(it.text).replace(/\(\d{1,2}[,.]\d{1,2}\)/, ""))) { bd = d; best.c = c; }
        });
    }
    return best;
}
function goBoss() {
    say("Mở bản đồ — tìm quái cấp cao nhất…");
    if (!openMap()) { say("Không mở được bản đồ — kiểm tra nút mở bản đồ ở ⚙"); return null; }
    nap(700);
    var x = Math.round(SW / 2 + 0.12 * SH), rect = [x, Math.round(0.10 * SH), Math.min(SW - x, Math.round(0.58 * SH)), Math.round(0.80 * SH)];
    var best;
    try { best = findBoss(ocrItems(grab(), rect)); }
    catch (e) { log(e); say("Không có bộ đọc chữ (OCR) — bỏ qua bước đi boss"); closeMapIfOpen(true); return null; }
    if (!best) { say("Không đọc được danh sách quái — bỏ qua bước đi boss"); closeMapIfOpen(true); return null; }
    if (best.c) {
        say("👑 Đi tới " + best.name + " (" + best.lv + ") tại (" + best.c.join(",") + ")…");
        var h = goTo(best.c);
        if (h && h.ev) return h.ev;
    } else {                                      // không đọc được tọa độ: chạm vào tên trong danh sách
        say("👑 Đi tới " + best.name + " (" + best.lv + ")…");
        var me = findSelf(grab());
        phase("Moving");
        tapAt([best.cx, best.cy], true);
        nap(800);
        var r = waitStop(me, 60);
        closeMapIfOpen(true);
        if (r === "dead" || r === "done") return r;
    }
    return fight("Boss " + best.name);
}


/* ============================ DANH SÁCH BOSS (từ máy chủ) ============================ */
var BOSS = [], ROUTE = null;                     // BOSS: [{level, file}] · ROUTE: {level, points}
function loadBossList() {
    var idx = readJson(CACHE + "index.json", null);
    BOSS = ((idx && idx.boss) || []).filter(function (b) { return b.file && files.exists(CACHE + b.file); })
        .sort(function (a, b) { return a.level - b.level; });
}
function loadRoute() {
    var b = null;
    BOSS.forEach(function (x) { if (+x.level === +bot.level) b = x; });
    if (!b) b = BOSS[0];
    if (!b) { ROUTE = null; return; }
    bot.level = +b.level;
    var d = readJson(CACHE + b.file, null);
    ROUTE = d && d.points && d.points.length ? { level: +b.level, points: d.points } : null;
}
function stepBoss(d) {
    if (running || !BOSS.length) return;
    var i = 0;
    BOSS.forEach(function (x, k) { if (+x.level === +bot.level) i = k; });
    bot.level = +BOSS[(i + d + BOSS.length) % BOSS.length].level;
    saveBot(); loadRoute(); refresh();
}

/* ============================ THỐNG KÊ (#8) ============================ */
var stats = readJson(STAT_PATH, { runs: [], sentDay: "" });
function saveStats() { files.write(STAT_PATH, JSON.stringify(stats)); }
function addStat(r) {
    stats.runs.push(r);
    if (stats.runs.length > 300) stats.runs.shift();
    saveStats();
}
function todayLine() {
    var t = today(), rs = stats.runs.filter(function (r) { return r.day === t && r.done; });
    if (!rs.length) return "";
    var avg = rs.reduce(function (s, r) { return s + r.mins; }, 0) / rs.length;
    return "Hôm nay: " + rs.length + " lượt · TB " + avg.toFixed(1) + " phút";
}
function summary(rs) {                            // tóm tắt theo cấp FB: lượt xong / dừng, thời gian TB, số lần chết, bãi lệch
    var by = {};
    rs.forEach(function (r) {
        var b = by[r.lv] || (by[r.lv] = { n: 0, done: 0, mins: 0, deaths: 0, miss: {} });
        b.n++; if (r.done) { b.done++; b.mins += r.mins; } b.deaths += r.deaths;
        (r.miss || []).forEach(function (i) { b.miss[i] = (b.miss[i] || 0) + 1; });
    });
    return Object.keys(by).map(function (lv) {
        var b = by[lv], m = Object.keys(b.miss).sort(function (x, y) { return b.miss[y] - b.miss[x]; }).slice(0, 3);
        return "LV" + lv + ": " + b.done + "/" + b.n + " xong · TB " + (b.done ? (b.mins / b.done).toFixed(1) : "-") + "′ · chết " + b.deaths +
            (m.length ? " · bãi hay lệch: " + m.map(function (i) { return "#" + i + "(" + b.miss[i] + ")"; }).join(" ") : "");
    }).join("\n");
}

/* ============================ BÁO LỖI về Telegram của HL (#4) ============================ */
function tgCfg() { return IDX && IDX.report && IDX.report.tg && IDX.report.chat ? IDX.report : null; }
function who() { return (ENV.name || "?") + " · " + ENV.mid + " · v" + (IDX ? IDX.ver : "?") + (BRANCH === "beta" ? "β" : "") + " · " + SW + "x" + SH; }
function tgSend(text) {
    var T = tgCfg();
    if (!T) return false;
    var r = http.post("https://api.telegram.org/bot" + T.tg + "/sendMessage", { chat_id: String(T.chat), text: String(text).slice(0, 4000) });
    return r.statusCode === 200;
}
function sendReport(reason) {
    var T = tgCfg();
    if (!T) { toast("HL chưa bật nhận báo lỗi"); return; }
    threads.start(function () {
        try {
            var shot = ROOT + "report.jpg", has = false;
            if (capOK) {
                hidePanel(true); setMini("hide"); sleep(400);
                var img = captureScreen();
                images.save(img, shot, "jpg", 70); has = true;
                hidePanel(false);
            }
            var head = "🐞 " + who() + "\nBoss LV " + bot.level + " · Delay " + cfg.params.clear + "s\nLý do: " + reason;
            var log30 = LOGBUF.slice(-30).join("\n");
            if (has) http.postMultipart("https://api.telegram.org/bot" + T.tg + "/sendPhoto",
                { chat_id: String(T.chat), caption: head.slice(0, 1000), photo: open(shot) });
            tgSend((has ? "" : head + "\n") + "— Nhật ký —\n" + log30);
            toast("✓ Đã gửi báo lỗi cho HL");
        } catch (e) { toast("Gửi lỗi thất bại: " + e); }
    });
}
function sendDailySummary() {                     // mỗi ngày 1 lần: gửi các lượt chưa gửi
    var rs = stats.runs.filter(function (r) { return !r.sent; });
    if (!rs.length || stats.sentDay === today() || !tgCfg()) return;
    if (tgSend("📊 " + who() + "\n" + rs.length + " lượt từ " + rs[0].day + "\n" + summary(rs))) {
        rs.forEach(function (r) { r.sent = 1; });
        stats.sentDay = today(); saveStats();
    }
}

/* ============================ CHẠY ============================ */
function runMain() {
    nap(1000);                                   // chờ 1 giây sau khi bật RUN
    var P = cfg.params;
    if (+P.goHigh) {
        var e0 = goBoss();
        if (e0 === "done") { waitDone(); return finish(); }
    }
    if (!ROUTE) { say("Chưa có dữ liệu Boss LV " + bot.level); return; }
    if (!coordModel()) { say("Boss LV " + bot.level + " chưa có dữ liệu tọa độ — liên hệ HL"); return; }
    var pts = ROUTE.points, loops = Math.max(1, Math.round(P.loops));
    for (var lp = 1; lp <= loops; lp++) {
        var i = 0;
        while (i < pts.length) {
            if (S.deaths > P.maxDeaths) { say("Chết quá " + P.maxDeaths + " lần — dừng"); return; }
            var p = pts[i], tag = "Bãi " + (i + 1) + "/" + pts.length;
            var h = goTo([p.x, p.y]);
            if (h && h.ev === "done") { waitDone(); return finish(); }
            if (h && h.ev === "dead") { logx(tag + ": chết, đi lại"); continue; }
            var ok = !!(h && h.c && h.exact && near(h.c, [p.x, p.y]));
            logx(tag + " (" + p.x + "," + p.y + ") → " + (h && h.c ? "(" + h.c.join(",") + ")" + (ok ? " ✓" : " lệch") : "?"));
            if (!ok && S.miss.indexOf(i + 1) < 0) S.miss.push(i + 1);
            var ev = fight(tag);
            if (ev === "done") { waitDone(); return finish(); }
            if (ev === "dead") continue;
            i++;
        }
    }
    waitDone();
    finish();
}
function finish() {
    S.done = true;
    var mins = ((Date.now() - S.start) / 60000).toFixed(1);
    logx("✓ Xong Boss LV " + bot.level + " — " + mins + " phút, chết " + S.deaths);
    toast("✓ Xong Boss LV " + bot.level + " — " + mins + " phút");
    try { device.vibrate(400); } catch (e) { }
}

function startRun() {
    if (running) return;
    if (!SYNC.ready) { say("Đang tải dữ liệu, chờ chút…"); return; }
    if (!capOK) { say("Chưa có quyền chụp màn hình"); return; }
    if (!cfg.points.mapOpen || !cfg.points.aoe || !hasCoordBox()) { say("Dữ liệu cài đặt chưa đủ — liên hệ HL"); return; }
    if (!ROUTE) { say("Chưa có dữ liệu Boss LV " + bot.level); return; }
    running = true; paused = false;
    S = { deaths: 0, start: Date.now(), miss: [], done: false };
    refresh();
    threads.start(function () {
        var err = null;
        try {
            var st = serverStopped();
            if (st) { S.start = 0; toast("⛔ " + st); return; }
            showMini("run");
            grab(); applyAnchors(); loadTemplates();
            logx("▶ RUN Boss LV " + bot.level + " · " + who());
            runMain();
        }
        catch (e) { if (String(e).indexOf("STOP") < 0) { err = String(e); logx("✗ Lỗi: " + e); } else logx("■ Dừng"); }
        finally {
            if (S.start) addStat({ day: today(), at: Date.now(), lv: bot.level, mins: +((Date.now() - S.start) / 60000).toFixed(1),
                deaths: S.deaths, done: S.done, miss: S.miss, err: err });
            running = false; paused = false; phase(""); freeTemplates(); showPanel();
            if (err && tgCfg()) threads.start(function () {
                if (dialogs.confirm("HL · Kịch bản gặp lỗi", err + "\n\nGửi báo lỗi cho Hải Long?")) sendReport("Tự động: " + err);
            });
        }
    });
}
function stopRun() {
    if (!running) return;
    running = false; paused = false;
    try { device.vibrate(120); } catch (e) { }
}

/* ============================ GIAO DIỆN (trắng · xanh biển) ============================ */
var HEAD_PATH = ROOT + "ui/hl_avatar_v4.png";
(function writeAvatar() {
    try {
        if (!files.exists(HEAD_PATH)) { files.ensureDir(HEAD_PATH); files.writeBytes(HEAD_PATH, android.util.Base64.decode(MEDAL_B64, 0)); }
    } catch (e) { log("avatar: " + e); }
})();
var DP = context.getResources().getDisplayMetrics().density;
var C = { white: "#ffffff", sea: "#1565c0", seaDk: "#0d47a1", light: "#e8f1fb", line: "#bcd4ee", ink: "#0b2545", soft: "#5f7b99", off: "#cfd8e3", warn: "#c62828" };
function round(fill, rad, stroke) {
    var g = new android.graphics.drawable.GradientDrawable();
    g.setColor(colors.parseColor(fill));
    g.setCornerRadius(rad * DP);
    if (stroke) g.setStroke(Math.max(1, Math.round(1 * DP)), colors.parseColor(stroke));
    return g;
}
function BTN(id, txt, w) {
    return '<text id="' + id + '" text="' + txt + '" w="' + w + '" h="32" textSize="15sp" textStyle="bold" textColor="' + C.sea + '" gravity="center" margin="2 0"/>';
}
function ROW(label, inner) {
    return '<horizontal gravity="center_vertical" margin="0 4">' +
        '<text text="' + label + '" textColor="' + C.ink + '" textSize="14sp" textStyle="bold" w="62"/>' + inner + '</horizontal>';
}
function SOON(id, icon, name) {
    return '<vertical id="' + id + '" visibility="gone" padding="8 22">' +
        '<text text="' + icon + ' ' + name + '" textColor="' + C.sea + '" textSize="15sp" textStyle="bold" gravity="center"/>' +
        '<text text="Đang phát triển" textColor="' + C.soft + '" textSize="12sp" gravity="center" margin="0 6"/>' +
        '</vertical>';
}
var win = floaty.window(
    '<vertical id="root" w="250" padding="8 6 8 8">' +
    ' <horizontal gravity="center_vertical">' +
    '  <img id="drag" src="file://' + HEAD_PATH + '" w="30" h="30" scaleType="fitCenter"/>' +
    '  <text text="Hải Long" textColor="' + C.sea + '" textSize="14sp" textStyle="bold" layout_weight="1" margin="6 0"/>' +
    '  <text id="btnBug" text="🐞" textSize="15sp" w="30" h="30" gravity="center"/>' +
    '  <text id="btnExit" text="✕" textColor="' + C.soft + '" textSize="16sp" w="30" h="30" gravity="center"/>' +
    ' </horizontal>' +
    ' <horizontal id="tabs" margin="0 6 0 6" padding="2">' +
    '  <text id="tabBoss" text="⚔ Boss" layout_weight="1" h="30" textSize="12sp" textStyle="bold" gravity="center"/>' +
    '  <text id="tabTrain" text="🌾 Train" layout_weight="1" h="30" textSize="12sp" textStyle="bold" gravity="center"/>' +
    '  <text id="tabQuest" text="📜 Nhiệm vụ" layout_weight="1" h="30" textSize="12sp" textStyle="bold" gravity="center"/>' +
    ' </horizontal>' +
    ' <vertical id="pgBoss">' +
    ROW("Boss", BTN("lvDn", "◀", "34") + '<text id="lvVal" layout_weight="1" h="32" textColor="' + C.ink + '" textSize="15sp" textStyle="bold" gravity="center"/>' + BTN("lvUp", "▶", "34")) +
    ROW("Delay", BTN("dlDn", "−", "34") + '<text id="dlVal" layout_weight="1" h="32" textColor="' + C.ink + '" textSize="15sp" textStyle="bold" gravity="center"/>' + BTN("dlUp", "+", "34")) +
    '  <horizontal id="runRow" gravity="center_vertical" margin="0 8 0 0" padding="12 0 6 0" h="44">' +
    '   <vertical layout_weight="1">' +
    '    <text id="runLbl" text="RUN" textColor="' + C.ink + '" textSize="16sp" textStyle="bold"/>' +
    '    <text id="runSub" textColor="' + C.soft + '" textSize="10sp"/>' +
    '   </vertical>' +
    '   <frame id="swTrack" w="52" h="28"><text id="swKnob" w="22" h="22" margin="3" layout_gravity="left|center_vertical"/></frame>' +
    '  </horizontal>' +
    ' </vertical>' +
    SOON("pgTrain", "🌾", "Train") + SOON("pgQuest", "📜", "Nhiệm vụ") +
    ' <text id="info" textColor="' + C.soft + '" textSize="10sp" gravity="center" margin="0 6 0 0" maxLines="3"/>' +
    '</vertical>'
);
win.setPosition(10, 10);
ui.run(function () {
    win.root.setBackground(round(C.white, 14, C.line));
    win.tabs.setBackground(round(C.light, 9));
    ["lvDn", "lvUp", "dlDn", "dlUp"].forEach(function (k) { win[k].setBackground(round(C.light, 8)); });
    win.lvVal.setBackground(round(C.white, 8, C.line));
    win.dlVal.setBackground(round(C.white, 8, C.line));
});

var TABS = { boss: ["tabBoss", "pgBoss"], train: ["tabTrain", "pgTrain"], quest: ["tabQuest", "pgQuest"] };
var curTab = bot.tab && TABS[bot.tab] ? bot.tab : "boss";
function showTab(k) {
    curTab = k; bot.tab = k; saveBot();
    ui.run(function () {
        for (var t in TABS) {
            var on = t === k;
            win[TABS[t][1]].setVisibility(on ? 0 : 8);
            win[TABS[t][0]].setBackground(on ? round(C.sea, 8) : null);
            win[TABS[t][0]].setTextColor(colors.parseColor(on ? C.white : C.sea));
        }
    });
    refresh();
}

// Thanh trạng thái khi chạy: "Moving" / "Attacking"
var bar = floaty.rawWindow(
    '<text id="msg" text="" textSize="12sp" textColor="#ffffff" bg="#cc1565c0" maxLines="1" ellipsize="end" padding="8 1"/>'
);
function setTouch(w, on) { try { w.setTouchable(on); } catch (e) { } }
setTouch(bar, false);
function placeBar() {
    var w = SW || Math.max(device.width, device.height), h = SH || Math.min(device.width, device.height);
    var bh = Math.round(18 * DP);
    bar.setSize(Math.round(w * 0.30), bh);
    bar.setPosition(Math.round(w / 5), Math.max(0, Math.round(h * 0.955) - bh));
}
placeBar();
var lastPhase = "";
function phase(s) {
    if (s && s !== lastPhase) logx("· " + s);
    lastPhase = s || "";
    ui.run(function () { try { bar.msg.setText(s || ""); bar.msg.setVisibility(s ? 0 : 4); } catch (e) { } });
}
phase("");
function say(s) { logx(s); if (!running) toast(String(s)); }
function hidePanel(h) { ui.run(function () { win.root.setVisibility(h ? 4 : 0); }); }

function setSwitch(on) {
    var lp = win.swKnob.getLayoutParams();
    lp.gravity = (on ? android.view.Gravity.RIGHT : android.view.Gravity.LEFT) | android.view.Gravity.CENTER_VERTICAL;
    win.swKnob.setLayoutParams(lp);
    win.swTrack.setBackground(round(on ? C.sea : C.off, 14));
    win.swKnob.setBackground(round(C.white, 11));
    win.runRow.setBackground(round(on ? C.light : C.white, 10, on ? C.sea : C.line));
}
function refresh() {
    ui.run(function () {
        var P = cfg.params, dl = ENV.daysLeft, lines = [];
        win.lvVal.setText(BOSS.length ? "LV " + bot.level : "—");
        win.dlVal.setText((+P.clear).toFixed(+P.clear % 1 ? 1 : 0) + " s");
        setSwitch(running);
        win.runSub.setText(running ? (paused ? "Tạm dừng · chạm logo để chạy tiếp" : "Đang chạy") : "Gạt để chạy");
        var tl = todayLine();
        if (tl) lines.push(tl);
        lines.push(SYNC.msg + (dl != null ? " · còn " + dl + " ngày" : ""));
        win.info.setText(lines.join("\n"));
        win.info.setTextColor(colors.parseColor(dl != null && dl <= 3 ? C.warn : C.soft));   // sắp hết hạn -> chữ đỏ
    });
}

/* ----- logo tròn khi đang chạy (kéo được) ----- */
var mini = floaty.rawWindow(
    '<frame id="box"><img id="mhead" src="file://' + HEAD_PATH + '" w="*" h="*" scaleType="fitCenter" padding="3"/></frame>'
);
var MINI = Math.round(38 * DP), miniOn = false;
mini.setSize(MINI, MINI);
function showMini(state) {
    var h = SH || Math.min(device.width, device.height), m = Math.round(8 * DP);
    mini.setPosition(m, Math.max(0, h - MINI - m));                  // góc dưới-trái
    ui.run(function () {
        win.root.setVisibility(8);
        var g = round(C.white, 19, C.sea);
        g.setStroke(Math.round(2 * DP), colors.parseColor(state === "idle" ? C.line : C.sea));
        mini.box.setBackground(g);
        mini.box.setVisibility(0);
    });
    miniOn = state;
    setTouch(mini, true);
}
function setMini(s) { if (s === "hide") ui.run(function () { mini.box.setVisibility(8); }); }
function showPanel() {
    miniOn = false; setTouch(mini, false);
    ui.run(function () { mini.box.setVisibility(8); win.root.setVisibility(0); });
    refresh();
}
ui.run(function () { mini.box.setVisibility(8); });
setTouch(mini, false);

// chạm / chạm đúp / kéo
function touchCtl(view, getXY, moveTo, onTap, onDouble) {
    var dx, dy, wx, wy, dragged = false, lastUp = 0, pend = null;
    view.setOnTouchListener(function (v, e) {
        var a = e.getAction();
        if (a === e.ACTION_DOWN) { dx = e.getRawX(); dy = e.getRawY(); var p = getXY(); wx = p[0]; wy = p[1]; dragged = false; return true; }
        if (a === e.ACTION_MOVE) {
            var mx = e.getRawX() - dx, my = e.getRawY() - dy;
            if (!dragged && (Math.abs(mx) > 12 || Math.abs(my) > 12)) dragged = true;
            if (dragged) moveTo(wx + mx, wy + my);
            return true;
        }
        if (a === e.ACTION_UP && !dragged) {
            var now = Date.now();
            if (onDouble && now - lastUp < 350) { if (pend) { clearTimeout(pend); pend = null; } lastUp = 0; onDouble(); }
            else if (onDouble && running) { lastUp = now; pend = setTimeout(function () { pend = null; onTap(); }, 350); }
            else { lastUp = now; onTap(); }
        }
        return true;
    });
}
// logo nhỏ: đang chạy -> tạm dừng + mở bảng; đang thu nhỏ -> mở bảng; chạm đúp -> dừng hẳn
touchCtl(mini.box, function () { return [mini.getX(), mini.getY()]; }, function (x, y) { mini.setPosition(x, y); },
    function () { if (running) paused = true; showPanel(); }, stopRun);
// logo trên bảng: đang tạm dừng -> chạy tiếp; không chạy -> thu nhỏ bảng
touchCtl(win.drag, function () { return [win.getX(), win.getY()]; }, function (x, y) { win.setPosition(x, y); },
    function () {
        if (running) { paused = false; refresh(); showMini("run"); }
        else showMini("idle");
    }, null);

/* ============================ NÚT ============================ */
function setDelay(v) {
    v = Math.max(1, Math.min(60, Math.round(v * 10) / 10));
    cfg.params.clear = v; bot.clear = v; saveBot(); refresh();
}
win.tabBoss.click(function () { if (!running) showTab("boss"); });
win.tabTrain.click(function () { if (!running) showTab("train"); });
win.tabQuest.click(function () { if (!running) showTab("quest"); });
win.lvDn.click(function () { stepBoss(-1); });
win.lvUp.click(function () { stepBoss(1); });
win.dlDn.click(function () { setDelay(+cfg.params.clear - 1); });
win.dlUp.click(function () { setDelay(+cfg.params.clear + 1); });
win.dlVal.click(function () {
    if (running) return;
    threads.start(function () {
        var t = dialogs.rawInput("Delay sau khi hết máu quái (giây)", String(cfg.params.clear));
        if (t == null) return;
        var v = parseFloat(String(t).replace(",", "."));
        if (!isNaN(v)) setDelay(v);
    });
});
win.runRow.click(function () { if (running) stopRun(); else startRun(); });
win.btnBug.click(function () {
    threads.start(function () {
        var t = dialogs.rawInput("Mô tả lỗi (không bắt buộc)", "");
        if (t != null) sendReport("Khách báo: " + (t || "(không ghi)"));
    });
});
win.btnExit.click(function () { running = false; floaty.closeAll(); exit(); });

/* ============================ KHỞI ĐỘNG ============================ */
loadBossList(); loadRoute();
showTab(curTab);
threads.start(function () {
    syncServer();                                // tải dữ liệu từ máy chủ HL
    loadCfg(); seedLearn(); loadBossList(); loadRoute();
    refresh();
    if (!SYNC.ok) { toast(SYNC.msg); return; }
    if (IDX && IDX.note && bot.seenVer !== IDX.ver) {               // ghi chú cập nhật: hiện 1 lần mỗi bản (#5)
        bot.seenVer = IDX.ver; saveBot();
        dialogs.alert("HL · Có gì mới (v" + IDX.ver + ")", String(IDX.note));
    }
    if (!requestScreenCapture(true)) { toast("Không có quyền chụp màn hình"); floaty.closeAll(); exit(); }
    capOK = true;
    grab(); applyAnchors();
    placeBar();
    logx("Mở · " + who());
    try { sendDailySummary(); } catch (e) { log("stat: " + e); }
    toast("Sẵn sàng — vào phó bản rồi gạt RUN");
});
setInterval(function () { }, 1000);
