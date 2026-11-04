/**
 * mainScript — HL · Bộ kịch bản Hiệp Nghĩa OL (侠义OL) — BẢN KHÁCH HÀNG
 * ------------------------------------------------------------------
 * Khách KHÔNG chạy file này trực tiếp: chạy HL.js -> HL.js tự tải bản mới nhất từ máy chủ
 * (lưu ở /sdcard/XiayiFB/app/main.js) rồi mở. Đường đi cũng tải từ máy chủ (app/routes/).
 * Chủ kịch bản vẫn chạy thẳng file này để thử (đường tự tạo bằng toolGetVT ở /sdcard/XiayiFB/routes/).
 *
 * TAB: ⚔ Boss · 🌾 Train · 📜 Nhiệm vụ · ⚙ Cài đặt (🧭 Cài nhanh · 🔍 Kiểm tra · ⟳ Cập nhật)
 * BOSS: Chạy -> chờ 1s -> (nếu bật) đánh quái cấp cao nhất -> từng bãi:
 *   [skill 2 -> đổi mục tiêu] x N (delay bước 0.1s) -> chờ không thấy máu quái X giây -> bãi sau. Lệch ±1 ô = đúng.
 * ĐANG CHẠY: nút tròn — chạm = tạm dừng/chạy tiếp · chạm đúp = dừng hẳn. Chạm avatar = thu nhỏ bảng.
 * LOG: /sdcard/XiayiFB/logs/YYYYMMDD.txt — khách gửi file này khi báo lỗi.
 */

auto.waitFor();

var ROOT = "/sdcard/XiayiFB/";
var CFG_PATH = ROOT + "config.json";
var REC_PATH = ROOT + "recorder.json";      // dữ liệu tự học vị trí (dùng chung với tool lấy tọa độ)
var BOT_PATH = ROOT + "fb.json";            // trạng thái riêng của kịch bản này
var ROUTE_DIR = ROOT + "routes/";            // đường tự tạo bằng toolGetVT (máy của chủ kịch bản)
var APP_DIR = ROOT + "app/";                 // bản tải từ máy chủ qua HL.js (máy khách hàng)
var APP_ROUTES = APP_DIR + "routes/";
var APP_VER = (function () { try { return JSON.parse(files.read(APP_DIR + "manifest.json")).version; } catch (e) { return "dev"; } })();
var TPL_DIR = ROOT + "tpl/";
files.ensureDir(ROUTE_DIR + "x.json");
files.ensureDir(TPL_DIR + "x.png");
var TPL_KEYS = ["mapTitle", "target", "revive", "done", "close"];
var LEVELS = [];
for (var lv = 15; lv <= 120; lv += 5) LEVELS.push(lv);

/* ============================ CÀI ĐẶT ============================ */
function readJson(p, def) {
    try { if (files.exists(p)) return JSON.parse(files.read(p)); } catch (e) { log("json " + p + ": " + e); }
    return def;
}
var cfg = readJson(CFG_PATH, {});
cfg.points = cfg.points || {};
cfg.rects = cfg.rects || {};
cfg.params = cfg.params || {};
var PDEF = {
    trackMove: 1, maxTravel: 40, threshold: 0.8, offX: 0, offY: 0,
    goHigh: 1,          // bấm Chạy: đi đánh quái cấp cao nhất (boss) trước
    clear: 6,           // không thấy thanh máu quái LIÊN TỤC N giây -> bãi sạch
    switchCount: 3,     // số vòng [skill AOE -> Đổi mục tiêu] mỗi bãi
    switchDelay: 600,   // nghỉ sau mỗi lần bấm (ms)
    minFight: 4, maxFight: 120, fightNoTpl: 15, recast: 0,
    loops: 1, maxDeaths: 10, doneWait: 60
};
for (var pk in PDEF) if (cfg.params[pk] == null) cfg.params[pk] = PDEF[pk];
function saveCfg() {            // ghi phần cài đặt, giữ nguyên dữ liệu khác trong file
    var cur = readJson(CFG_PATH, {});
    cur.points = cfg.points; cur.rects = cfg.rects; cur.screen = cfg.screen;
    cur.params = cfg.params; cur.targetColor = cfg.targetColor;
    files.write(CFG_PATH, JSON.stringify(cur, null, 2));
}

var bot = readJson(BOT_PATH, {});
bot.level = bot.level || 75;
bot.files = bot.files || {};                // cấp FB -> tên file đường đã chọn
function saveBot() { files.write(BOT_PATH, JSON.stringify(bot, null, 2)); }

var rec = readJson(REC_PATH, {});
rec.learn = rec.learn || {};
function saveRec() {            // chỉ ghi phần dữ liệu học, giữ nguyên đường đang ghi dở của tool
    var cur = readJson(REC_PATH, {});
    cur.learn = rec.learn;
    files.write(REC_PATH, JSON.stringify(cur, null, 2));
}

/* ============================ CÔNG THỨC TỌA ĐỘ (giống tool lấy tọa độ 1aa96) ============================ */
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
    var scale = (cfg.screen && SW) ? SW / cfg.screen[0] : 1;
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
    if (!M) { say("FB " + bot.level + " chưa có công thức tọa độ — dùng tool lấy tọa độ lấy ≥3 điểm (mở bản đồ lớn lúc bấm 📍)"); return null; }
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

/* ============================ FILE ĐƯỜNG ĐI (từ tool lấy tọa độ) ============================ */
var ROUTE = null;                                // { name, level, points:[{x,y,wait,action}] }
function routeFiles(level) {                     // [{name, level, n}] — đường từ máy chủ trước, rồi đường tự tạo
    var out = [];
    [APP_ROUTES, ROUTE_DIR].forEach(function (dir) {
        var part = [];
        (files.listDir(dir) || []).forEach(function (f) {
            if (!/\.json$/i.test(f)) return;
            var d = readJson(dir + f, null);
            if (!d || !d.points || !d.points.length) return;
            if (level != null && +d.level !== +level) return;
            part.push({ name: (dir === APP_ROUTES ? "app:" : "") + f, level: +d.level || 0, n: d.points.length });
        });
        out = out.concat(part.sort(function (x, y) { return x.level - y.level || (x.name < y.name ? -1 : 1); }));
    });
    return out;
}
function routePath(name) { return /^app:/.test(name) ? APP_ROUTES + name.slice(4) : ROUTE_DIR + name; }
function loadRoute(name) {
    var d = name ? readJson(routePath(name), null) : null;
    if (!d || !d.points || !d.points.length) { ROUTE = null; return false; }
    ROUTE = { name: name, level: +d.level || bot.level, points: d.points, title: d.title || "" };
    return true;
}
function autoRoute() {                           // file đã chọn cho cấp này, không có thì file mới nhất cùng cấp
    if (bot.files[String(bot.level)] && loadRoute(bot.files[String(bot.level)])) return;
    var l = routeFiles(bot.level);
    if (l.length && loadRoute(l[0].name)) { bot.files[String(bot.level)] = l[0].name; saveBot(); return; }
    ROUTE = null;
}

/* ============================ CHẠY ============================ */
function runMain() {
    nap(1000);                                   // chờ 1 giây sau khi bấm Chạy
    var P = cfg.params;
    if (+P.goHigh) {
        var e0 = goBoss();
        if (e0 === "done") { waitDone(); return finish(); }
    }
    if (!ROUTE) { say("Chưa có file đường đi cho FB " + bot.level + " — bấm 📂 để chọn"); return; }
    if (!coordModel()) { say("FB " + bot.level + " chưa có công thức tọa độ — dùng tool lấy tọa độ trước"); return; }
    var pts = ROUTE.points, loops = Math.max(1, Math.round(P.loops));
    for (var lp = 1; lp <= loops; lp++) {
        var i = 0;
        while (i < pts.length) {
            if (S.deaths > P.maxDeaths) { say("Chết quá " + P.maxDeaths + " lần — dừng"); return; }
            var p = pts[i], tag = "Bãi " + (i + 1) + "/" + pts.length + (loops > 1 ? " (vòng " + lp + ")" : "");
            say(tag + ": đi tới (" + p.x + "," + p.y + ")…");
            var h = goTo([p.x, p.y]);
            if (h && h.ev === "done") { waitDone(); return finish(); }
            if (h && h.ev === "dead") continue;                       // hồi sinh xong -> đi lại bãi này
            if (h && h.c && h.exact && !near(h.c, [p.x, p.y])) say(tag + ": đứng ở (" + h.c.join(",") + "), lệch điểm (" + p.x + "," + p.y + ") — vẫn đánh");
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
    var mins = ((Date.now() - S.start) / 60000).toFixed(1);
    say("✓ Xong FB " + bot.level + " — " + mins + " phút, chết " + S.deaths + " lần");
    toast("Xong FB " + bot.level);
    try { device.vibrate(400); } catch (e) { }
}

function startRun() {
    if (running) return;
    if (!capOK) { note("Chưa có quyền chụp màn hình"); return; }
    var miss = WIZ_ALL.filter(function (st) { return st[1] !== "targetHp" && st[1] !== "mapClose" && !isSet(st[1]); });
    if (miss.length) { note("Thiếu cài đặt — đang mở 🧭 Cài nhanh"); wizStart(false); return; }
    if (!ROUTE) { note("Chưa có đường đi — bấm 📂 (hoặc ⚙ → ⟳ Cập nhật)"); return; }
    startJob(runMain);
}
// Chạy 1 việc trong luồng riêng; bảng thu thành nút tròn ■ (chạm = tạm dừng, chạm đúp = dừng hẳn)
function startJob(fn) {
    if (running) return;
    if (aim) endAim();
    running = true; paused = false;
    S = { deaths: 0, start: Date.now() };
    showMini("run");
    logFile("RUN " + (ROUTE ? ROUTE.name : "-") + " · v" + APP_VER);
    threads.start(function () {
        try { grab(); loadTemplates(); fn(); }
        catch (e) { if (String(e).indexOf("STOP") < 0) { logFile("ERROR " + e + (e.stack ? "\n" + e.stack : "")); toast("Lỗi: " + e); } }
        finally { running = false; paused = false; phase(""); freeTemplates(); showPanel(); }
    });
}

/* ============================ CÀI NHANH (lần đầu) ============================
 * Lần lượt ngắm các nút còn thiếu; mỗi bước hiện 1 dòng ngắn "Bước i/n: …". ✕ = thoát cài nhanh. */
var WIZ_ALL = [
    ["point", "mapOpen", "Nút mở bản đồ nhỏ"],
    ["point", "mapClose", "Nút X đóng bản đồ lớn"],
    ["rect", "coordBox", "Chữ tọa độ (x,y) dưới bản đồ nhỏ"],
    ["point", "aoe", "Nút skill 2 (AOE)"],
    ["point", "switchTarget", "Nút đổi mục tiêu"],
    ["point", "targetHp", "Phần đỏ thanh máu quái (chọn 1 con quái trước)"]
];
var WIZ = null;
function isSet(key) {
    if (key === "coordBox") return hasCoordBox();
    if (key === "targetHp") return !!(cfg.points.targetHp && cfg.targetColor != null);
    return !!cfg.points[key];
}
function wizStart(all) {
    if (running || !capOK) return;
    var steps = WIZ_ALL.filter(function (s) { return all || !isSet(s[1]); });
    if (!steps.length) { note("✓ Đã cài đủ"); return; }
    WIZ = { steps: steps, i: 0 };
    wizNext();
}
function wizNext() {
    if (!WIZ) return;
    if (WIZ.i >= WIZ.steps.length) { WIZ = null; note("✓ Cài đặt xong — có thể bấm 🔍 Kiểm tra"); return; }
    var s = WIZ.steps[WIZ.i++], tag = "Bước " + WIZ.i + "/" + WIZ.steps.length + ": " + s[2];
    if (s[1] === "mapClose" && cfg.points.mapOpen) {          // tự mở bản đồ để ngắm nút đóng
        threads.start(function () {
            hidePanel(true); sleep(200); grab();
            tapKey("mapOpen"); sleep(1500);
            note(tag); startAim(s[0], s[1]);
        });
    } else { note(tag); startAim(s[0], s[1]); }
}

/* ============================ NHẬT KÝ (log) ============================
 * /sdcard/XiayiFB/logs/YYYYMMDD.txt — gửi file này khi cần báo lỗi */
var LOG_DIR = ROOT + "logs/";
files.ensureDir(LOG_DIR + "x.txt");
function logFile(s) {
    try {
        var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
        files.append(LOG_DIR + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + ".txt",
            z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds()) + "  " + s + "\n");
    } catch (e) { }
}

/* ============================ GIAO DIỆN NHIỀU TAB (màu HL: vàng · đen · xanh biển · đỏ) ============================
 * Hàng tab: ⚔ Boss · 🌾 Train · 📜 N.vụ · ⚙ Cài đặt   (thêm chức năng mới = thêm 1 tab)
 * Dưới cùng: ▶ CHẠY (chạy chức năng của tab đang mở) · ✕ thoát */
var HEAD_PATH = ROOT + "ui/hl_avatar_v4.png";
(function writeAvatar() {
    try {
        if (!files.exists(HEAD_PATH)) { files.ensureDir(HEAD_PATH); files.writeBytes(HEAD_PATH, android.util.Base64.decode(MEDAL_B64, 0)); }
    } catch (e) { log("avatar: " + e); }
})();
var DP = context.getResources().getDisplayMetrics().density;
var C = { gold: "#e0b84a", ink: "#ee100c08", sea: "#1565c0", red: "#b71c1c", dark: "#3a3226", green: "#2e7d32", soft: "#c9b98a" };
function B(id, txt, w, color, tc, h, ts) {
    return '<button id="' + id + '" text="' + txt + '" w="' + w + '" h="' + (h || 32) + '" textSize="' + (ts || 13) + 'sp" textColor="' + (tc || "#ffffff") +
        '" padding="0" margin="1" bg="' + (color || C.dark) + '"/>';
}
// 1 dòng chỉnh số: nhãn · − · giá trị (chạm để nhập) · +
function NUM(label, id) {
    return ' <horizontal gravity="center_vertical" margin="0 1">' +
        '  <text text="' + label + '" textColor="' + C.soft + '" textSize="12sp" w="128"/>' +
        B(id + "Dn", "−", "34") +
        '  <text id="' + id + 'Val" textColor="#ffffff" textSize="14sp" textStyle="bold" w="62" h="32" gravity="center" bg="#22e0b84a"/>' +
        B(id + "Up", "+", "34") +
        ' </horizontal>';
}
function SOON(id, icon, name) {
    return ' <vertical id="' + id + '" visibility="gone" padding="8 18">' +
        '  <text text="' + icon + ' ' + name + '" textColor="' + C.gold + '" textSize="15sp" textStyle="bold" gravity="center"/>' +
        '  <text text="Đang phát triển" textColor="' + C.soft + '" textSize="12sp" gravity="center" margin="0 6"/>' +
        ' </vertical>';
}
var win = floaty.window(
    '<vertical id="root" bg="' + C.ink + '" padding="4" w="276">' +
    // hàng tab
    ' <horizontal gravity="center_vertical">' +
    '  <img id="drag" src="file://' + HEAD_PATH + '" w="30" h="30" margin="1" scaleType="fitCenter"/>' +
    B("tabBoss", "⚔ Boss", "58") + B("tabTrain", "🌾 Train", "60") + B("tabQuest", "📜 N.vụ", "58") + B("tabSet", "⚙", "40") +
    ' </horizontal>' +
    ' <text w="*" h="1" bg="' + C.gold + '" margin="0 2"/>' +
    // ----- TAB BOSS -----
    ' <vertical id="pgBoss">' +
    '  <horizontal gravity="center_vertical">' +
    B("rtPrev", "◀", "30") +
    '   <text id="rtName" textColor="' + C.gold + '" textSize="15sp" textStyle="bold" w="160" h="32" gravity="center" maxLines="1" ellipsize="end"/>' +
    B("rtNext", "▶", "30") + B("rtList", "📂", "36", C.sea) +
    '  </horizontal>' +
    '  <text id="rtInfo" textColor="' + C.soft + '" textSize="10sp" gravity="center" margin="0 0 0 3"/>' +
    NUM("Số lần đổi mục tiêu", "sw") +
    NUM("Delay mỗi lần đổi", "dl") +
    NUM("Chờ bãi sạch", "cl") +
    '  <horizontal gravity="center_vertical" margin="0 1">' +
    '   <text text="Đánh boss trước" textColor="' + C.soft + '" textSize="12sp" w="128"/>' +
    B("bossTg", "BẬT", "130") +
    '  </horizontal>' +
    ' </vertical>' +
    SOON("pgTrain", "🌾", "Train") + SOON("pgQuest", "📜", "Làm nhiệm vụ") +
    // ----- TAB CÀI ĐẶT -----
    ' <vertical id="pgSet" visibility="gone">' +
    '  <horizontal>' + B("sAoe", "Skill 2", "130") + B("sSwitch", "Đổi mục tiêu", "130") + '</horizontal>' +
    '  <horizontal>' + B("sHp", "Máu quái", "130") + B("sRevive", "Nút hồi sinh", "130") + '</horizontal>' +
    '  <horizontal>' + B("sMapOpen", "Mở bản đồ", "130") + B("sMapClose", "Đóng bản đồ", "130") + '</horizontal>' +
    '  <horizontal>' + B("sCoord", "Vùng tọa độ", "130") + B("sCheck", "🔍 Kiểm tra", "130", C.sea) + '</horizontal>' +
    '  <horizontal>' + B("sWiz", "🧭 Cài nhanh", "130", "#8d6e00") + B("sUpd", "⟳ Cập nhật", "130", C.green) + '</horizontal>' +
    '  <text id="verText" textColor="' + C.soft + '" textSize="10sp" gravity="center" margin="0 2 0 0"/>' +
    NUM("Lặp lại cả đường", "lp") +
    ' </vertical>' +
    // nút chạy
    ' <horizontal margin="0 3 0 0">' +
    '  <button id="btnRun" text="▶ CHẠY" layout_weight="1" h="38" textSize="15sp" textStyle="bold" textColor="#ffffff" padding="0" margin="1" bg="' + C.green + '"/>' +
    B("btnExit", "✕", "44", C.red, null, 38, 15) +
    ' </horizontal>' +
    '</vertical>'
);
win.setPosition(10, 10);

var TABS = { boss: ["tabBoss", "pgBoss"], train: ["tabTrain", "pgTrain"], quest: ["tabQuest", "pgQuest"], set: ["tabSet", "pgSet"] };
var curTab = bot.tab && TABS[bot.tab] ? bot.tab : "boss";
function showTab(k) {
    curTab = k; bot.tab = k; saveBot();
    ui.run(function () {
        for (var t in TABS) {
            var on = t === k;
            win[TABS[t][1]].setVisibility(on ? 0 : 8);
            win[TABS[t][0]].setBackgroundColor(colors.parseColor(on ? C.gold : C.dark));
            win[TABS[t][0]].setTextColor(colors.parseColor(on ? "#1a1208" : "#ffffff"));
        }
        win.btnRun.setVisibility(k === "set" ? 8 : 0);
    });
    refresh();
}

// Dòng thông báo: cách trái 1/5 màn hình, ngay trên thanh kinh nghiệm; chữ vàng sáng trên nền đen mờ
var bar = floaty.rawWindow(
    '<text id="msg" text="" textSize="12sp" textColor="#ffe14d" bg="#a6000000" maxLines="1" ellipsize="end" padding="6 1"/>'
);
function setTouch(w, on) { try { w.setTouchable(on); } catch (e) { } }
setTouch(bar, false);
function placeBar() {
    var w = SW || Math.max(device.width, device.height), h = SH || Math.min(device.width, device.height);
    var bh = Math.round(18 * DP);
    bar.setSize(Math.round(w * 0.62), bh);
    bar.setPosition(Math.round(w / 5), Math.max(0, Math.round(h * 0.955) - bh));
}
ui.run(function () {
    try {
        bar.msg.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL));
        bar.msg.setShadowLayer(3, 0, 0, colors.parseColor("#000000"));
    } catch (e) { }
});
placeBar();
// Thanh thông báo chỉ báo 2 trạng thái: "Moving" / "Attacking" (trống = ẩn)
function phase(s) {
    if (s) logFile("[" + s + "]");
    ui.run(function () { try { bar.msg.setText(s || ""); bar.msg.setVisibility(s ? 0 : 4); } catch (e) { } });
}
phase("");
// Tin khác: ghi log; khi không chạy thì hiện thông báo nổi (toast) ngắn
function say(s) { log(s); logFile(s); if (!running) toast(String(s)); }
function note(s) { log(s); logFile(s); toast(String(s)); }
function hidePanel(h) { ui.run(function () { win.root.setVisibility(h ? 4 : 0); }); }

function routeLabel(r) {                // "Boss 75": tên đặt trong tool + cấp (nếu tên chưa có số cấp)
    var n = (r.title || r.name.replace(/^app:/, "").replace(/\.json$/i, "")).replace(/_/g, " ");
    return new RegExp("\\b" + r.level + "\\b").test(n) ? n : n + " " + r.level;
}
function refresh() {
    ui.run(function () {
        var P = cfg.params, ok = function (v) { return v ? "✓ " : "✗ "; };
        win.rtName.setText(ROUTE ? routeLabel(ROUTE) : "— chưa có đường —");
        win.rtInfo.setText(ROUTE ? "Lv " + ROUTE.level + " · " + ROUTE.points.length + " bãi" : "Chưa có đường — ⚙ → ⟳ Cập nhật");
        win.swVal.setText(String(P.switchCount));
        win.dlVal.setText((P.switchDelay / 1000).toFixed(1) + "s");
        win.clVal.setText(P.clear + "s");
        win.lpVal.setText(String(P.loops));
        win.bossTg.setText(+P.goHigh ? "BẬT" : "TẮT");
        win.bossTg.setBackgroundColor(colors.parseColor(+P.goHigh ? "#8d6e00" : C.dark));
        win.sAoe.setText(ok(cfg.points.aoe) + "Skill 2");
        win.sSwitch.setText(ok(cfg.points.switchTarget) + "Đổi mục tiêu");
        win.sHp.setText(ok(cfg.points.targetHp && cfg.targetColor != null) + "Máu quái");
        win.sRevive.setText(ok(files.exists(TPL_DIR + "revive.png")) + "Nút hồi sinh");
        win.sMapOpen.setText(ok(cfg.points.mapOpen) + "Mở bản đồ");
        win.sMapClose.setText(ok(cfg.points.mapClose) + "Đóng bản đồ");
        win.sCoord.setText(ok(hasCoordBox()) + "Vùng tọa độ");
        win.verText.setText("HL v" + APP_VER + " · log: XiayiFB/logs");
    });
}

/* ----- nút nhỏ tròn (kéo được):
 *   ■ đỏ  = đang chạy   -> chạm 1 lần: tạm dừng
 *   ▶ vàng = đang dừng  -> chạm 1 lần: chạy tiếp
 *   chạm NHANH 2 LẦN    -> dừng hẳn kịch bản
 *   avatar = bảng đang thu nhỏ -> chạm: mở lại bảng ----- */
var mini = floaty.rawWindow(
    '<frame id="box">' +
    ' <text id="btn" text="■" textSize="12sp" textColor="#e53935" gravity="center" w="*" h="*"/>' +
    ' <img id="mhead" src="file://' + HEAD_PATH + '" w="*" h="*" scaleType="fitCenter" visibility="gone"/>' +
    '</frame>'
);
var MINI = Math.round(34 * DP), miniState = "hidden";
mini.setSize(MINI, MINI);
function ring(fill, stroke) {                       // nền tròn + viền mảnh
    var g = new android.graphics.drawable.GradientDrawable();
    g.setShape(android.graphics.drawable.GradientDrawable.OVAL);
    g.setColor(colors.parseColor(fill));
    g.setStroke(Math.max(1, Math.round(1.5 * DP)), colors.parseColor(stroke));
    return g;
}
function setMini(state) {
    miniState = state;
    ui.run(function () {
        try {
            if (state === "hidden") { mini.box.setVisibility(8); return; }
            var idle = state === "idle";
            mini.btn.setVisibility(idle ? 8 : 0);
            mini.mhead.setVisibility(idle ? 0 : 8);
            if (!idle) {
                var run = state === "run";
                mini.btn.setText(run ? "■" : "▶");
                mini.btn.setTextSize(run ? 12 : 13);
                mini.btn.setTextColor(colors.parseColor(run ? "#e53935" : C.gold));
                mini.btn.setPadding(run ? 0 : Math.round(2 * DP), 0, 0, 0);       // ▶ lệch phải 1 chút cho cân
                mini.btn.setBackground(ring("#d9100c08", run ? "#b71c1c" : C.gold));
            }
            mini.box.setAlpha(0.95);
            mini.box.setVisibility(0);
        } catch (e) { log("mini: " + e); }
    });
    setTouch(mini, state !== "hidden");
}
function showMini(state, at) {
    if (at) mini.setPosition(Math.round(at[0]), Math.round(at[1]));
    else {
        var h = SH || Math.min(device.width, device.height), m = Math.round(8 * DP);
        mini.setPosition(m, Math.max(0, h - MINI - m));                  // góc dưới-trái
    }
    ui.run(function () { win.root.setVisibility(8); });
    setMini(state);
}
function showPanel() { setMini("hidden"); ui.run(function () { win.root.setVisibility(0); }); refresh(); }
function collapse() { if (!running && !aim) showMini("idle", [win.getX(), win.getY()]); }   // chạm avatar = thu nhỏ tại chỗ
ui.run(function () { mini.box.setVisibility(8); });
setTouch(mini, false);

// chạm / chạm đúp / kéo: dùng chung cho nút nhỏ và avatar trên bảng
function touchCtl(view, getXY, moveTo, onTap, onDouble) {
    var dx, dy, wx, wy, dragged = false, lastUp = 0, pend = null;
    view.setOnTouchListener(function (v, e) {
        var a = e.getAction();
        if (a === e.ACTION_DOWN) {
            dx = e.getRawX(); dy = e.getRawY(); var p = getXY(); wx = p[0]; wy = p[1];
            dragged = false;
            return true;
        }
        if (a === e.ACTION_MOVE) {
            var mx = e.getRawX() - dx, my = e.getRawY() - dy;
            if (!dragged && (Math.abs(mx) > 12 || Math.abs(my) > 12)) dragged = true;
            if (dragged) moveTo(wx + mx, wy + my);
            return true;
        }
        if (a === e.ACTION_UP && !dragged) {
            var now = Date.now();
            if (onDouble && now - lastUp < 350) {               // chạm lần 2 đủ nhanh = chạm đúp
                if (pend) { clearTimeout(pend); pend = null; }
                lastUp = 0;
                onDouble();
            } else if (onDouble && onDouble.active && onDouble.active()) {
                lastUp = now;                                    // chờ xem có chạm lần 2 không
                pend = setTimeout(function () { pend = null; onTap(); }, 350);
            } else { lastUp = now; onTap(); }
        }
        return true;
    });
}
function stopDouble() {
    if (!running) return;
    running = false; paused = false;
    try { device.vibrate(120); } catch (e2) { }
}
stopDouble.active = function () { return running; };
touchCtl(mini.box, function () { return [mini.getX(), mini.getY()]; }, function (x, y) { mini.setPosition(x, y); },
    function () {
        if (miniState === "idle") { showPanel(); return; }
        if (!running) return;
        paused = !paused;
        setMini(paused ? "pause" : "run");
    }, stopDouble);
touchCtl(win.drag, function () { return [win.getX(), win.getY()]; }, function (x, y) { win.setPosition(x, y); }, collapse, null);

/* ----- khung ngắm: kéo khung đi đâu thì nút ✔ ✕ đi theo đó (tự né mép màn hình) ----- */
var cross = floaty.rawWindow(
    '<frame id="box" bg="#33ff1744">' +
    ' <text w="*" h="1" bg="#ffff1744" layout_gravity="center"/><text w="1" h="*" bg="#ffff1744" layout_gravity="center"/>' +
    '</frame>'
);
var aimBar = floaty.rawWindow(
    '<horizontal id="bar2">' +
    B("aimOk", "✔", "40", C.green) + B("aimSize", "⊞", "34", C.sea) + B("aimCancel", "✕", "34", C.red) +
    '</horizontal>'
);
var AIM_BW = Math.round(114 * DP), AIM_BH = Math.round(38 * DP);
aimBar.setSize(AIM_BW, AIM_BH);
var aim = null;
var AIM_SIZES = { point: [[44, 44]], rect: [[120, 36], [90, 28], [160, 44], [220, 56]], tpl: [[110, 50], [70, 34], [160, 70], [240, 100]] };
ui.run(function () { cross.box.setVisibility(8); aimBar.bar2.setVisibility(8); });
setTouch(cross, false); setTouch(aimBar, false);

function scrW() { return SW || Math.max(device.width, device.height); }
function scrH() { return SH || Math.min(device.width, device.height); }
// đặt nút theo khung: ưu tiên bên dưới, hết chỗ thì lên trên; canh trái theo khung, không tràn mép
function followAim() {
    if (!aim) return;
    var x = cross.getX(), y = cross.getY(), s = aim.size, g = Math.round(4 * DP);
    var by = y + s[1] + g + AIM_BH <= scrH() ? y + s[1] + g : Math.max(0, y - AIM_BH - g);
    var bx = Math.max(0, Math.min(scrW() - AIM_BW, x + s[0] / 2 - AIM_BW / 2));
    aimBar.setPosition(Math.round(bx), Math.round(by));
}
(function () {
    var dx, dy, wx, wy;
    cross.box.setOnTouchListener(function (v, e) {
        var act = e.getAction();
        if (act === e.ACTION_DOWN) { dx = e.getRawX(); dy = e.getRawY(); wx = cross.getX(); wy = cross.getY(); return true; }
        if (act === e.ACTION_MOVE) {
            var s = aim ? aim.size : [0, 0];
            var nx = Math.max(-s[0] / 2, Math.min(scrW() - s[0] / 2, wx + e.getRawX() - dx));
            var ny = Math.max(-s[1] / 2, Math.min(scrH() - s[1] / 2, wy + e.getRawY() - dy));
            cross.setPosition(Math.round(nx), Math.round(ny));
            followAim();
            return true;
        }
        return true;
    });
})();
function setAimSize(i, keepCenter) {
    var list = AIM_SIZES[aim.kind], f = scrW() / 1280, wh = list[i % list.length];
    var s = [Math.round(wh[0] * f), Math.round(wh[1] * f)];
    var cx = keepCenter ? cross.getX() + aim.size[0] / 2 : null, cy = keepCenter ? cross.getY() + aim.size[1] / 2 : null;
    aim.si = i % list.length; aim.size = s;
    cross.setSize(s[0], s[1]);
    if (keepCenter) cross.setPosition(Math.round(cx - s[0] / 2), Math.round(cy - s[1] / 2));
}

// kind: "point" = 1 điểm · "rect" = vùng tọa độ · "tpl" = chụp mẫu ảnh
function startAim(kind, key) {
    aim = { kind: kind, key: key, si: 0, size: [0, 0] };
    ui.run(function () {
        var w = scrW(), h = scrH();
        setAimSize(0, false);
        var s = aim.size, old = kind === "rect" ? cfg.rects[key] : kind === "point" ? cfg.points[key] : null;
        if (old && kind === "rect") { s = aim.size = [Math.round(old[2] * w), Math.round(old[3] * h)]; cross.setSize(s[0], s[1]); }
        if (old) cross.setPosition(Math.round(old[0] * w - (kind === "rect" ? 0 : s[0] / 2)), Math.round(old[1] * h - (kind === "rect" ? 0 : s[1] / 2)));
        else cross.setPosition(Math.round(w / 2 - s[0] / 2), Math.round(h / 2 - s[1] / 2));
        aimBar.aimSize.setVisibility(kind === "point" ? 8 : 0);
        AIM_BW = Math.round((kind === "point" ? 78 : 114) * DP);
        aimBar.setSize(AIM_BW, AIM_BH);
        win.root.setVisibility(8);
        cross.box.setVisibility(0); aimBar.bar2.setVisibility(0);
        setTimeout(followAim, 50);
    });
    setTouch(cross, true); setTouch(aimBar, true);
}
function endAim() {
    aim = null;
    setTouch(cross, false); setTouch(aimBar, false);
    ui.run(function () { cross.box.setVisibility(8); aimBar.bar2.setVisibility(8); win.root.setVisibility(0); });
    refresh();
}
aimBar.aimCancel.click(function () { endAim(); if (WIZ) threads.start(wizNext); });   // cài nhanh: ✕ = bỏ qua bước này
aimBar.aimSize.click(function () { if (!aim) return; setAimSize(aim.si + 1, true); followAim(); });
aimBar.aimOk.click(function () {
    if (!aim) return;
    var a = aim;
    threads.start(function () {
        try {
            var x = cross.getX() + (+cfg.params.offX), y = cross.getY() + (+cfg.params.offY), s = a.size;
            ui.run(function () { cross.box.setVisibility(4); aimBar.bar2.setVisibility(4); });
            sleep(350);
            var img = grab();
            if (a.kind === "rect") {
                cfg.rects[a.key] = [Math.max(0, x) / SW, Math.max(0, y) / SH, s[0] / SW, s[1] / SH];
                var c = readCoord(img, true);
                say(c ? "✓ Đã lưu vùng tọa độ — đọc được (" + c.join(",") + ")" : "Đã lưu vùng — chưa đọc được chữ, kéo khung ôm sát chữ (x,y) hơn");
            } else if (a.kind === "tpl") {
                var cx = Math.max(0, Math.round(x)), cy = Math.max(0, Math.round(y));
                var clip = images.clip(img, cx, cy, Math.min(s[0], SW - cx), Math.min(s[1], SH - cy));
                images.save(clip, TPL_DIR + a.key + ".png", "png");
                clip.recycle();
                say("✓ Đã chụp mẫu");
            } else {
                var px = Math.max(0, Math.min(SW - 1, Math.round(x + s[0] / 2))), py = Math.max(0, Math.min(SH - 1, Math.round(y + s[1] / 2)));
                cfg.points[a.key] = [px / SW, py / SH];
                if (a.key === "targetHp") cfg.targetColor = images.pixel(img, px, py);
                say("✓ Đã lưu");
            }
            cfg.screen = [SW, SH];
            saveCfg();
            try { device.vibrate(60); } catch (e) { }
            if (a.key === "mapClose" && WIZ) { sleep(200); tapKey("mapClose"); sleep(600); }   // cài nhanh: đóng bản đồ để sang bước sau
        } catch (e) { say("Lỗi: " + e); }
        endAim();
        if (WIZ) wizNext();
    });
});

/* ============================ NÚT TRÊN BẢNG ============================ */
function pickRoute(name) {
    if (!loadRoute(name)) { say("File không hợp lệ: " + name); return; }
    bot.route = name; bot.level = ROUTE.level; saveBot();
    say("📂 " + routeLabel(ROUTE) + " — " + ROUTE.points.length + " bãi");
    refresh();
}
function stepRoute(d) {
    if (running) return;
    threads.start(function () {
        var l = routeFiles(null);
        if (!l.length) { say("Chưa có file nào trong " + ROUTE_DIR + " — dùng tool lấy tọa độ để tạo"); return; }
        var i = -1;
        for (var k = 0; k < l.length; k++) if (ROUTE && l[k].name === ROUTE.name) i = k;
        pickRoute(l[(i + d + l.length) % l.length].name);
    });
}
function listRoutes() {
    if (running) return;
    threads.start(function () {
        var l = routeFiles(null);
        if (!l.length) { say("Chưa có file nào trong " + ROUTE_DIR + " — dùng tool lấy tọa độ để tạo"); return; }
        var i = dialogs.select("Chọn đường đi", l.map(function (f) { return routeLabel(f) + "  ·  " + f.n + " bãi"; }));
        if (i >= 0) pickRoute(l[i].name);
    });
}

// số chỉnh được: − / + và chạm vào số để gõ
var NUMS = {
    sw: { key: "switchCount", step: 1, min: 1, max: 20, ask: "Số lần đổi mục tiêu" },
    dl: { key: "switchDelay", step: 100, min: 100, max: 5000, ask: "Delay mỗi lần đổi (giây, VD 0.6)", scale: 1000 },
    cl: { key: "clear", step: 1, min: 1, max: 60, ask: "Chờ bãi sạch (giây)" },
    lp: { key: "loops", step: 1, min: 1, max: 50, ask: "Lặp lại cả đường (lần)" }
};
function setNum(id, v) {
    var n = NUMS[id];
    v = Math.max(n.min, Math.min(n.max, Math.round(v / n.step) * n.step));
    cfg.params[n.key] = v; saveCfg(); refresh();
}
Object.keys(NUMS).forEach(function (id) {
    var n = NUMS[id];
    win[id + "Dn"].click(function () { setNum(id, +cfg.params[n.key] - n.step); });
    win[id + "Up"].click(function () { setNum(id, +cfg.params[n.key] + n.step); });
    win[id + "Val"].click(function () {
        if (running) return;
        threads.start(function () {
            var cur = n.scale ? (cfg.params[n.key] / n.scale).toFixed(1) : String(cfg.params[n.key]);
            var t = dialogs.rawInput(n.ask, cur);
            if (t == null) return;
            var v = parseFloat(String(t).replace(",", "."));
            if (!isNaN(v)) setNum(id, n.scale ? v * n.scale : v);
        });
    });
});

function checkNow() {
    if (running || !capOK) return;
    threads.start(function () {
        hidePanel(true); sleep(300);
        var img = grab(); loadTemplates();
        var hp = hasTargetDetector() ? (targetVisible(img) ? "THẤY máu quái" : "không thấy máu quái") : "chưa cài máu quái";
        var c = hasCoordBox() ? readCoord(img) : null;
        freeTemplates(); hidePanel(false);
        say("Máu quái: " + hp + " · tọa độ: " + (c ? "(" + c.join(",") + ")" : "✗ [" + (lastCoordText || "∅") + "]") + " · màn " + SW + "x" + SH);
    });
}

function runTab() {
    if (curTab === "boss") return startRun();
    say((curTab === "train" ? "Train" : "Làm nhiệm vụ") + " đang phát triển");
}

win.tabBoss.click(function () { if (!running) showTab("boss"); });
win.tabTrain.click(function () { if (!running) showTab("train"); });
win.tabQuest.click(function () { if (!running) showTab("quest"); });
win.tabSet.click(function () { if (!running) showTab("set"); });
win.rtPrev.click(function () { stepRoute(1); });            // danh sách xếp mới -> cũ
win.rtNext.click(function () { stepRoute(-1); });
win.rtList.click(listRoutes);
win.rtName.click(listRoutes);
win.bossTg.click(function () { cfg.params.goHigh = +cfg.params.goHigh ? 0 : 1; saveCfg(); refresh(); });
win.sAoe.click(function () { startAim("point", "aoe"); });
win.sSwitch.click(function () { startAim("point", "switchTarget"); });
win.sHp.click(function () { startAim("point", "targetHp"); });
win.sRevive.click(function () { startAim("tpl", "revive"); });
win.sMapOpen.click(function () { startAim("point", "mapOpen"); });
win.sMapClose.click(function () { startAim("point", "mapClose"); });
win.sCoord.click(function () { startAim("rect", "coordBox"); });
win.sCheck.click(checkNow);
win.sWiz.click(function () { wizStart(true); });
win.sUpd.click(function () {
    if (running) return;
    var loader = null;
    try { loader = String(files.read(APP_DIR + "loader.txt")).trim(); } catch (e) { }
    if (!loader || !files.exists(loader)) { note("Hãy mở lại file HL.js để cập nhật"); return; }
    note("Đang cập nhật…");
    engines.execScriptFile(loader);
    floaty.closeAll(); exit();
});
win.btnRun.click(runTab);
win.btnExit.click(function () { running = false; floaty.closeAll(); exit(); });

/* ============================ KHỞI ĐỘNG ============================ */
(function () {                                   // mở lại đường đã chọn lần trước, không có thì file mới nhất
    if (bot.route && loadRoute(bot.route)) { bot.level = ROUTE.level; return; }
    var l = routeFiles(null);
    if (l.length && loadRoute(l[0].name)) { bot.route = l[0].name; bot.level = ROUTE.level; saveBot(); }
})();
showTab(curTab);
say("Đang xin quyền chụp màn hình…");
threads.start(function () {
    if (!requestScreenCapture(true)) { toast("Không có quyền chụp màn hình"); floaty.closeAll(); exit(); }
    capOK = true;
    grab();
    placeBar();
    var miss = [];
    if (!cfg.points.aoe) miss.push("skill 2");
    if (!cfg.points.switchTarget) miss.push("đổi mục tiêu");
    if (!(cfg.points.targetHp && cfg.targetColor != null)) miss.push("máu quái");
    if (!cfg.points.mapOpen) miss.push("mở bản đồ");
    if (!hasCoordBox()) miss.push("vùng tọa độ");
    logFile("=== HL v" + APP_VER + " · màn " + SW + "x" + SH + " · OCR: " + (ocrEngines().join("+") || "không có"));
    if (miss.length && dialogs.confirm("HL v" + APP_VER, "Cần cài " + miss.length + " mục (" + miss.join(", ") + ").\nCài nhanh từng bước ngay bây giờ?")) wizStart(false);
    else say(miss.length ? "Cần cài ở tab ⚙: " + miss.join(", ") : "Sẵn sàng — vào phó bản rồi bấm ▶ CHẠY");
});
setInterval(function () { }, 1000);
