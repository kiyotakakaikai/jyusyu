"use strict";
/* =========================================================
   樹木診断カルテ（試作） — 現場スマホ記録 ＋ PC閲覧・編集 ＋ 報告書
   ========================================================= */

/* ---------- 基本 ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const pad = n => String(n).padStart(2, "0");
const fmt = ts => { if (!ts) return ""; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtD = ts => fmt(ts).slice(0, 10);
const toLocalInput = ts => fmt(ts).replace(" ", "T");
const noStr = n => "No." + String(n).padStart(3, "0");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const JA_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;
const ORGAN_JA = { auto: "自動", leaf: "葉", bark: "樹皮", flower: "花", fruit: "実", whole: "全景", damage: "被害部", root: "根元", trunk: "幹", branch: "大枝" };
function msg(t) { $("msg").textContent = t || ""; }
let toastT = null;
function toast(t, ms = 2200) { const e = $("toast"); e.textContent = t; e.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(() => e.style.display = "none", ms); }

const r1 = x => Math.round(x * 10) / 10;
/* 複数回測位して、精度の良い半分を重み付き平均（外部の高精度GNSS受信機を使う場合は自動で高精度になる） */
function getPosAvg(sec) {
  sec = sec == null ? +(store.get("pos_sec") || 10) : sec;
  if (!sec) return getPos();
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    const pts = []; let id = null, done = false;
    const fin = () => {
      if (done) return; done = true; navigator.geolocation.clearWatch(id); clearTimeout(tm);
      if (!pts.length) return res(null);
      pts.sort((a, b) => a.acc - b.acc);
      const use = pts.slice(0, Math.max(1, Math.ceil(pts.length / 2)));
      let w = 0, la = 0, ln = 0;
      use.forEach(p => { const k = 1 / Math.max(p.acc, .05) ** 2; w += k; la += p.lat * k; ln += p.lng * k; });
      res({ lat: la / w, lng: ln / w, acc: r1(use[0].acc), n: pts.length });
    };
    const tm = setTimeout(fin, sec * 1000);
    id = navigator.geolocation.watchPosition(p => {
      pts.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      toast(`測位中… ${pts.length}回　現在±${r1(p.coords.accuracy)}m`, 1500);
      if (pts.length >= 3 && p.coords.accuracy <= .5) fin();
    }, () => { if (!pts.length) fin(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: sec * 1000 });
  });
}
function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: r1(p.coords.accuracy) }),
      () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
  });
}
function dist(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const posText = (lat, lng, acc) => lat == null ? "位置なし" : `${(+lat).toFixed(6)}, ${(+lng).toFixed(6)}` + (acc === "手動" ? "（地図で補正）" : acc === "台帳" ? "（台帳の位置）" : `（誤差±${acc ?? "?"}m）`);

/* ---------- 診断の定義（東京都 街路樹診断の健全度に準拠） ---------- */
const JUDGE = {
  A: { t: "健全か健全に近い", next: "5〜10年後に再診断" },
  B1: { t: "注意すべき被害が見られる", next: "5〜10年後に再診断（経過観察）" },
  B2: { t: "著しい被害が見られる", next: "処置のうえ1〜3年後に再診断" },
  C: { t: "不健全", next: "更新（撤去・植替え）" }
};
const PARTS = [["root", "根元"], ["trunk", "幹"], ["branch", "大枝"]];
const ITEMS = [["bark", "樹皮欠損・傷"], ["decay", "腐朽"], ["cavity", "開口空洞"], ["fungi", "キノコ"], ["crack", "亀裂・割れ"], ["sway", "揺らぎ"]];
const ROOTS = [["exposed", "露出根の被害"], ["girdle", "巻き根"], ["collar", "ルートカラー見えない"], ["lean", "不自然な傾斜"], ["pave", "舗装の持ち上がり"], ["wire", "支柱・結束の食い込み"]];
const VITAL = [["tip", "梢端の枯損"], ["shoot", "枝の伸長量"], ["dens", "葉の密度"], ["leaf", "葉の大きさ・色"], ["form", "樹形"]];
const VLV = ["正常", "やや劣る", "劣る", "著しく劣る"];
const OBST = [["gauge", "建築限界の支障"], ["sign", "標識・信号の視認阻害"], ["light", "街灯の遮蔽"], ["wire", "架線への接触"], ["bldg", "建物・塀への接触"], ["walk", "歩行者通行の支障"]];
const ACTS = ["経過観察", "枯枝除去", "剪定", "機器診断", "支柱・保護", "伐採・更新", "その他"];

/* ---------- 端末内保存（IndexedDB） ---------- */
let dbP = null;
function openDB() {
  return dbP || (dbP = new Promise((res, rej) => {
    const r = indexedDB.open("jumoku-karte", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("projects", { keyPath: "uid" });
      d.createObjectStore("trees", { keyPath: "uid" });
      d.createObjectStore("photos", { keyPath: "uid" }).createIndex("treeUid", "treeUid");
      d.createObjectStore("meta");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function os(n, m = "readonly") { return (await openDB()).transaction(n, m).objectStore(n); }
const db = {
  all: async n => rq((await os(n)).getAll()),
  get: async (n, k) => k == null ? undefined : rq((await os(n)).get(k)),
  put: async (n, v) => rq((await os(n, "readwrite")).put(v)),
  del: async (n, k) => rq((await os(n, "readwrite")).delete(k)),
  photosOf: async t => rq((await os("photos")).index("treeUid").getAll(t)),
  getMeta: async k => rq((await os("meta")).get(k)),
  setMeta: async (k, v) => rq((await os("meta", "readwrite")).put(v, k)),
  async clearAll() {
    const t = (await openDB()).transaction(["projects", "trees", "photos", "meta"], "readwrite");
    ["projects", "trees", "photos", "meta"].forEach(n => t.objectStore(n).clear());
    return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  }
};
/* 変更は必ずここを通す（同期対象の印を付ける） */
async function save(n, v) {
  v.updatedAt = Date.now(); v._dirty = true;
  const c = { ...v }; delete c._proj;
  await db.put(n, c); scheduleSync(); return v;
}
const alive = a => a.filter(x => !x.deleted);
let persisted = false;
function persistOnce() { if (persisted) return; persisted = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }

/* ---------- 案件 ---------- */
let curProj = null;
async function projects() { return alive(await db.all("projects")).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
async function ensureProject() {
  let ps = await projects();
  if (!ps.length) { const p = await save("projects", { uid: uid(), name: "未分類の案件", createdAt: Date.now(), auto: true }); ps = [p]; }
  if (ps.length > 1) {   // 自動で作った空の案件は、他の案件があれば片付ける（PC初回同期など）
    const ts = alive(await db.all("trees"));
    const empty = ps.filter(p => p.auto && !ts.some(t => t.project === p.uid));
    if (empty.length && empty.length < ps.length) { for (const p of empty) { p.deleted = true; await save("projects", p); } ps = await projects(); }
  }
  const id = store.get("cur_proj");
  curProj = ps.find(p => p.uid === id) || ps.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  store.set("cur_proj", curProj.uid);
  $("projBadge").textContent = "案件：" + curProj.name;
  return curProj;
}
async function drawProjSel() {
  const ps = await projects();
  $("projSel").innerHTML = ps.map(p => `<option value="${p.uid}" ${curProj && p.uid === curProj.uid ? "selected" : ""}>${esc(p.name)}</option>`).join("") + `<option value="__all" ${store.get("list_all") === "1" ? "selected" : ""}>（すべての案件）</option>`;
  if (store.get("list_all") === "1") $("projSel").value = "__all";
}
function shareUrl(p) {
  if (!p.public || !p.shareKey || !store.get("gas_url")) return "";
  return new URL("map.html", location.href).href.split("?")[0] + "?api=" + encodeURIComponent(store.get("gas_url")) + "&k=" + p.shareKey;
}
function drawShare(p) {
  const u = shareUrl(p);
  $("pShare").textContent = p.public ? (u || "同期（設定→PCと同期）を設定すると、リンクを発行できます") : "公開していません";
  $("pCopy").disabled = !u;
}
function openProj(p) {
  $("pName").value = p.name || ""; $("pTitle").value = p.title || ""; $("pClient").value = p.client || "";
  $("pContractor").value = p.contractor || ""; $("pInspector").value = p.inspector || ""; $("pLicense").value = p.license || "";
  $("pPeriod").value = p.period || ""; $("pIntro").value = p.intro || "";
  $("pPublic").checked = !!p.public; drawShare(p);
  $("proj").classList.add("on");
}

/* ---------- 辞書 ---------- */
const norm = s => String(s || "").replace(/×/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const bin = n => n.split(" ").slice(0, 2).join(" ");
const BDICT = {}; for (const k in BUILTIN_DICT) BDICT[norm(k)] = BUILTIN_DICT[k];
function userDict() { try { return JSON.parse(store.get("user_dict") || "{}"); } catch (e) { return {}; } }
function setUserDict(d) { store.set("user_dict", JSON.stringify(d)); }
function dictLookup(sci) {
  const n = norm(sci), b = bin(n), U = {}, u = userDict();
  for (const k in u) U[norm(k)] = u[k];
  return U[n] || U[b] || BDICT[n] || BDICT[b] || null;
}
function genusName(sci) { const g = String(sci).split(" ")[0]; return GENUS_DICT[g] ? GENUS_DICT[g] + "の一種" : null; }
async function toJa(sci) {
  if (!sci) return null;
  const d = dictLookup(sci); if (d) return d;
  let cache = {}; try { cache = JSON.parse(store.get("wd_cache") || "{}"); } catch (e) {}
  const key = norm(sci);
  if (key in cache) return cache[key] || genusName(sci);
  let ja = null;
  try {
    const q = 'SELECT ?l WHERE{?t wdt:P225 "' + sci.replace(/["\\]/g, "") + '";rdfs:label ?l.FILTER(lang(?l)="ja")}LIMIT 1';
    const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
    if (r.ok) { const b = (await r.json()).results.bindings[0]; ja = b ? b.l.value : null; }
    cache[key] = ja; store.set("wd_cache", JSON.stringify(cache));
  } catch (e) {}
  return ja || genusName(sci);
}
const dispName = x => x.ja || (x.names || []).find(n => JA_RE.test(n)) || (x.names || [])[0] || x.sci;

/* ---------- 画像 ---------- */
function canvasOf(src, w, h, max) {
  const s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c;
}
const toBlob = (c, q = .85) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("画像変換に失敗")), "image/jpeg", q));
function loadImg(blob) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("画像を読めません")); }; i.src = u; });
}
async function resizeBlob(blob, max, q = .85) { const i = await loadImg(blob); return toBlob(canvasOf(i, i.naturalWidth, i.naturalHeight, max), q); }
const blobToData = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const dataToBlob = async d => (await fetch(d)).blob();

/* ---------- 写真のラベル貼り（焼き込み） ---------- */
function labelLines(t, p) {
  const l1 = `${noStr(t.no)}${t.mgmtNo ? "（" + t.mgmtNo + "）" : ""}  ${t.name || "樹種未確定"}` + (p.score != null ? `  AI${Math.round(p.score * 100)}%` : "");
  const l2 = `${fmt(p.at)}   ${posText(p.lat, p.lng, p.acc)}`;
  const l3 = `部位：${ORGAN_JA[p.organ] || p.organ || "-"}` + (t.place ? `   ${t.place}` : "");
  return [l1, l2, l3];
}
async function makeLabeled(orig, lines) {
  const i = await loadImg(orig), c = canvasOf(i, i.naturalWidth, i.naturalHeight, 1600), g = c.getContext("2d");
  const fs = Math.max(14, Math.round(c.width / 36)), lh = fs * 1.4, h = lh * lines.length + fs * .9;
  g.fillStyle = "rgba(0,0,0,.62)"; g.fillRect(0, c.height - h, c.width, h);
  g.fillStyle = "#fff"; g.textBaseline = "top";
  lines.forEach((s, k) => { g.font = (k === 0 ? "bold " + Math.round(fs * 1.15) : fs) + 'px -apple-system,"Hiragino Sans","Yu Gothic",sans-serif'; g.fillText(s, fs * .6, c.height - h + fs * .4 + lh * k, c.width - fs * 1.2); });
  return toBlob(c, .85);
}
async function thumbOf(b) { const i = await loadImg(b); return canvasOf(i, i.naturalWidth, i.naturalHeight, 200).toDataURL("image/jpeg", .65); }
async function addPhotoTo(t, blob, p) {
  const orig = await resizeBlob(blob, 2048, .9);
  const ph = { uid: uid(), treeUid: t.uid, at: p.at, lat: p.pos ? p.pos.lat : null, lng: p.pos ? p.pos.lng : null, acc: p.pos ? p.pos.acc : null, organ: p.organ, score: p.score ?? null, orig };
  ph.lab = await makeLabeled(orig, labelLines(t, ph));
  await save("photos", ph);
  if (!t.thumb) { t.thumb = await thumbOf(orig); await save("trees", t); }
}
async function relabelAll(t) {
  for (const p of alive(await db.photosOf(t.uid))) {
    if (!p.orig) continue;   // 元画像が端末に無い写真（PCで同期取得したもの等）は貼り直さない
    p.lab = await makeLabeled(p.orig, labelLines(t, p)); p.labId = null; await save("photos", p);
  }
}

/* ---------- カメラ・AI判定 ---------- */
let busy = false, camOK = false, last = null;
function noCam(t) {
  msg(t);
  $("hintText").innerHTML = "<b>ライブ映像は使えません</b>　「写真」で撮影して判定";
  $("reticle").style.display = "none"; $("pick").classList.add("primary");
}
async function startCam() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { noCam("この開き方ではライブカメラ不可（HTTPS必須）"); return; }
  try { $("v").srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false }); camOK = true; }
  catch (e) { noCam("カメラを開けません（PCや許可設定を確認）"); }
}
async function frameBlob() { const v = $("v"); if (!v.videoWidth) throw new Error("映像の準備中です"); return toBlob(canvasOf(v, v.videoWidth, v.videoHeight, 2048), .9); }
async function identify(blob) {
  const key = store.get("pn_key");
  if (!key) {
    if (store.get("pn_demo") === "1") { await new Promise(r => setTimeout(r, 400)); return [{ score: .62, names: ["Yoshino cherry"], sci: "Prunus × yedoensis", fam: "Rosaceae" }, { score: .18, names: [], sci: "Prunus jamasakura", fam: "Rosaceae" }, { score: .07, names: [], sci: "Prunus mume", fam: "Rosaceae" }]; }
    throw new Error("NOKEY");
  }
  const fd = new FormData();
  fd.append("images", await resizeBlob(blob, 1280), "photo.jpg");
  fd.append("organs", $("organ").value);
  const r = await fetch("https://my-api.plantnet.org/v2/identify/all?include-related-images=false&nb-results=5&lang=ja&api-key=" + encodeURIComponent(key), { method: "POST", body: fd });
  if (!r.ok) {
    if (r.status === 401) throw new Error("キーが無効です（private keyか確認）");
    if (r.status === 403) throw new Error("ドメイン未許可：PlantNetの許可ドメイン設定を確認");
    if (r.status === 404) throw new Error("植物として認識できませんでした");
    if (r.status === 429) throw new Error("本日の無料枠を使い切りました");
    throw new Error("サーバーエラー(" + r.status + ")");
  }
  return ((await r.json()).results || []).map(x => ({ score: x.score, names: x.species.commonNames || [], sci: x.species.scientificNameWithoutAuthor, fam: (x.species.family || {}).scientificNameWithoutAuthor || "" }));
}
function renderCands() {
  if (!last) return;
  const t = last.list[last.sel], pct = Math.round(t.score * 100);
  $("ln").textContent = dispName(t); $("ls").textContent = t.sci + (t.fam ? "（" + t.fam + "）" : "");
  $("lp").textContent = "確信度 " + pct + "%" + (pct < 50 ? "（要確認）" : ""); $("label").style.display = "block";
  $("cands").innerHTML = last.list.map((x, i) => `<div data-i="${i}" class="${i === last.sel ? "sel" : ""}"><span>${esc(dispName(x))}<small style="opacity:.6"> ${esc(x.sci)}</small></span><b>${Math.round(x.score * 100)}%</b></div>`).join("");
}
async function run(getBlob) {
  if (busy) return; busy = true; $("shot").disabled = true; $("shot").textContent = "判定中…";
  try {
    const blob = await getBlob(), list = await identify(blob);
    if (!list.length) msg("候補なし。葉か樹皮にもっと寄ってください。");
    else {
      last = { blob, at: Date.now(), organ: $("organ").value, list, sel: 0 };
      renderCands(); $("reg").disabled = false; $("reg").classList.add("primary");
      msg(list[0].score < .4 ? "確信度が低め。葉を正面から/樹皮をアップで撮り直すと改善します。" : "候補をタップで選び直し → 「カルテに登録」");
      const L = last;
      await Promise.all(list.map(async x => { const jp = (x.names || []).find(n => JA_RE.test(n)); x.ja = jp || await toJa(x.sci); }));
      if (L === last) renderCands();
    }
  } catch (e) {
    if (e.message === "NOKEY") { msg("APIキー未設定。「設定」で入力するか「樹種不明で登録」"); }
    else msg(/fetch|Load failed/i.test(e.message) ? "通信に失敗しました（電波を確認）" : e.message);
  }
  busy = false; $("shot").disabled = false; $("shot").textContent = "判定する";
}

/* ---------- カルテ登録 ---------- */
async function nextNo(projUid) {
  const ts = alive(await db.all("trees")).filter(t => t.project === projUid);
  return Math.max(0, ...ts.map(t => +t.no || 0)) + 1;
}
async function register(blob, info) {
  $("reg").disabled = true; $("manual").disabled = true; msg("位置を取得中…");
  try {
    await ensureProject();
    const pos = await getPosAvg();
    if (!pos) toast("位置が取れませんでした（後で「地図で補正」可）");
    else if (pos.acc > 3) setTimeout(() => toast(`位置の誤差±${pos.acc}m：「地図で補正」を推奨`, 3500), 2500);
    if (pos) {
      const lim = Math.min(40, Math.max(20, (pos.acc || 0) * 2));
      const cands = alive(await db.all("trees")).filter(t => t.lat != null && t.project === curProj.uid).map(t => ({ t, d: dist(pos, t) })).filter(x => x.d <= lim).sort((a, b) => a.d - b.d).slice(0, 6);
      if (cands.length) {
        msg("");
        const pick = await chooseNear(cands, !!blob);
        if (pick === "cancel") return;
        if (pick) {
          if (!pick.name && info.name) { pick.name = info.name; pick.sci = info.sci; pick.fam = info.fam; pick.ai = info.ai; await save("trees", pick); }
          if (blob) await addPhotoTo(pick, blob, { at: info.at, pos, organ: info.organ, score: info.score });
          toast(`${noStr(pick.no)}${pick.mgmtNo ? "（" + pick.mgmtNo + "）" : ""} に記録します`); openDetail(pick.uid); return;
        }
      }
    }
    const t = {
      uid: uid(), project: curProj.uid, no: await nextNo(curProj.uid), mgmtNo: "", place: "",
      name: info.name || "", sci: info.sci || "", fam: info.fam || "", ai: info.ai || null,
      lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, acc: pos ? pos.acc : null,
      createdAt: info.at, diags: [], memo: "", thumb: null
    };
    await save("trees", t);
    if (blob) await addPhotoTo(t, blob, { at: info.at, pos, organ: info.organ, score: info.score });
    persistOnce(); msg(""); toast(`${noStr(t.no)} で登録しました`);
    openDetail(t.uid);
  } catch (e) { msg("登録に失敗：" + e.message); }
  finally { $("reg").disabled = !last; $("manual").disabled = false; }
}
function chooseNear(cands, hasPhoto) {
  return new Promise(res => {
    $("nearList").innerHTML = cands.map((x, i) => { const d = latest(x.t); return `<button data-i="${i}" class="card" style="width:100%;text-align:left"><div><b>${noStr(x.t.no)}${x.t.mgmtNo ? "　" + esc(x.t.mgmtNo) : ""}　${esc(x.t.name || "樹種未確定")}</b><small>約${Math.round(x.d)}m　${esc(x.t.place || "")}</small></div><span class="badge ${tcls(x.t)}">${tlab(x.t)}</span></button>`; }).join("");
    $("nearHint").textContent = hasPhoto ? "この写真をどの木に記録しますか？" : "どの木を記録しますか？";
    $("near").classList.add("on");
    const done = v => { $("near").classList.remove("on"); $("nearList").onclick = $("nearNew").onclick = $("nearCancel").onclick = null; res(v); };
    $("nearList").onclick = e => { const b = e.target.closest("[data-i]"); if (b) done(cands[+b.dataset.i].t); };
    $("nearNew").onclick = () => done(null);
    $("nearCancel").onclick = () => done("cancel");
  });
}
function registerFromAI() {
  if (!last) return;
  const c = last.list[last.sel];
  register(last.blob, { at: last.at, organ: last.organ, score: c.score, name: dispName(c), sci: c.sci, fam: c.fam, ai: { score: c.score, cands: last.list.slice(0, 5).map(x => ({ n: dispName(x), sci: x.sci, s: x.score })) } });
}

/* ---------- カルテ詳細 ---------- */
let cur = null, urls = [], editingId = null, judgeSel = "";
const latest = t => alive(t.diags || []).slice().sort((a, b) => b.at - a.at)[0] || null;
const jcls = d => "j-" + (d && d.judge ? d.judge : "none");
const STATUS = { live: "現存", cut: "伐採済", empty: "空き桝・欠損" };
const tcls = t => t.status === "cut" ? "j-cut" : t.status === "empty" ? "j-empty" : jcls(latest(t));
const tlab = t => t.status === "cut" ? "伐" : t.status === "empty" ? "空" : (latest(t) && latest(t).judge) || "未";
function freeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
function buildForm() {
  $("gMx").innerHTML = `<tr><th></th>${PARTS.map(p => `<th>${p[1]}</th>`).join("")}</tr>` +
    ITEMS.map(i => `<tr><td>${i[1]}</td>${PARTS.map(p => `<td><input type="checkbox" id="m_${i[0]}_${p[0]}"></td>`).join("")}</tr>`).join("");
  $("gRoots").innerHTML = ROOTS.map(r => `<label><input type="checkbox" id="r_${r[0]}">${r[1]}</label>`).join("");
  $("gVital").innerHTML = VITAL.map(v => `<div><label>${v[1]}</label><select id="v_${v[0]}">${VLV.map(x => `<option>${x}</option>`).join("")}</select></div>`).join("");
  $("gObst").innerHTML = OBST.map(o => `<label><input type="checkbox" id="o_${o[0]}">${o[1]}</label>`).join("");
  $("gAct").innerHTML = ACTS.map((a, k) => `<label><input type="checkbox" id="a_${k}" data-a="${a}">${a}</label>`).join("");
}
function setJudge(j) {
  judgeSel = j;
  document.querySelectorAll("#gJudge button").forEach(b => b.classList.toggle("on", b.dataset.j === j));
  $("gJudgeTxt").textContent = j ? `${j}：${JUDGE[j].t}` : "未選択";
}
function fillForm(d) {
  const prev = latest(cur);
  d = d || {};
  $("gAt").value = toLocalInput(d.at || Date.now());
  $("gBy").value = d.by ?? (prev && prev.by) ?? (curProjOf(cur) || {}).inspector ?? "";
  const lg = cur.ledger || {};
  $("gH").value = d.h ?? (prev ? prev.h : lg.h) ?? ""; $("gG").value = d.g ?? (prev ? prev.g : lg.g) ?? ""; $("gS").value = d.s ?? (prev ? prev.s : "") ?? "";
  $("gVig").value = d.vig || "良好"; $("gDead").value = d.dead || "なし";
  ITEMS.forEach(i => PARTS.forEach(p => $(`m_${i[0]}_${p[0]}`).checked = !!(d.mx && d.mx[i[0]] && d.mx[i[0]].includes(p[0]))));
  ROOTS.forEach(r => $("r_" + r[0]).checked = !!(d.roots && d.roots.includes(r[0])));
  VITAL.forEach(v => $("v_" + v[0]).value = (d.vital && d.vital[v[0]]) || "正常");
  OBST.forEach(o => $("o_" + o[0]).checked = !!(d.obst && d.obst.includes(o[0])));
  $("gPest").value = d.pest || "なし"; $("gPestN").value = d.pestN || "";
  $("gDevP").value = (d.dev && d.dev.p) || ""; $("gDevR").value = (d.dev && d.dev.r) || ""; $("gDevT").value = (d.dev && d.dev.t) || "";
  setJudge(d.judge || ""); $("gReason").value = d.reason || ""; $("gNext").value = d.next || ""; $("gNote").value = d.note || "";
  ACTS.forEach((a, k) => $("a_" + k).checked = !!(d.acts && d.acts.includes(a)));
  editingId = d.id || null;
  $("editing").style.display = editingId ? "block" : "none";
  $("editing").textContent = editingId ? `${fmt(d.at)} の診断を編集中` : "";
  $("gSave").textContent = editingId ? "この診断を上書き保存" : "診断を保存";
}
function readForm() {
  const mx = {};
  ITEMS.forEach(i => { const ps = PARTS.filter(p => $(`m_${i[0]}_${p[0]}`).checked).map(p => p[0]); if (ps.length) mx[i[0]] = ps; });
  return {
    id: editingId || uid(), at: $("gAt").value ? new Date($("gAt").value).getTime() : Date.now(), by: $("gBy").value.trim(),
    h: $("gH").value, g: $("gG").value, s: $("gS").value, vig: $("gVig").value, dead: $("gDead").value, mx,
    roots: ROOTS.filter(r => $("r_" + r[0]).checked).map(r => r[0]),
    vital: Object.fromEntries(VITAL.map(v => [v[0], $("v_" + v[0]).value])), obst: OBST.filter(o => $("o_" + o[0]).checked).map(o => o[0]), pest: $("gPest").value, pestN: $("gPestN").value.trim(),
    dev: { p: $("gDevP").value.trim(), r: $("gDevR").value, t: $("gDevT").value },
    judge: judgeSel, reason: $("gReason").value.trim(), acts: ACTS.filter((a, k) => $("a_" + k).checked), next: $("gNext").value.trim(), note: $("gNote").value.trim()
  };
}
function findingsText(d) {
  const out = [];
  ITEMS.forEach(i => { if (d.mx && d.mx[i[0]]) out.push(`${i[1]}（${d.mx[i[0]].map(p => PARTS.find(x => x[0] === p)[1]).join("・")}）`); });
  ROOTS.forEach(r => { if (d.roots && d.roots.includes(r[0])) out.push(r[1]); });
  if (d.dead && d.dead !== "なし") out.push("枯枝" + (d.dead === "多い" ? "多" : "少"));
  if (d.vig && d.vig !== "良好") out.push("樹勢" + d.vig);
  VITAL.forEach(v => { const x = d.vital && d.vital[v[0]]; if (x && x !== "正常") out.push(v[1] + "が" + x); });
  OBST.forEach(o => { if (d.obst && d.obst.includes(o[0])) out.push(o[1]); });
  if (d.pest === "あり") out.push("病害虫" + (d.pestN ? "（" + d.pestN + "）" : ""));
  if (d.dev && d.dev.r) out.push(`腐朽空洞率${d.dev.r}%` + (d.dev.p ? `（${d.dev.p}）` : ""));
  return out.join("・");
}
const curProjOf = t => t && t._proj;
async function openDetail(id) {
  const t = await db.get("trees", id); if (!t || t.deleted) return;
  cur = t; cur._proj = await db.get("projects", t.project);
  $("dNo").textContent = noStr(t.no) + (cur._proj ? "　" + cur._proj.name : "");
  $("dNum").value = t.no; $("dMg").value = t.mgmtNo || ""; $("dName").value = t.name || ""; $("dPlace").value = t.place || "";
  $("dSci").textContent = (t.sci ? t.sci + (t.fam ? "（" + t.fam + "）" : "") : "学名なし") + "　登録 " + fmt(t.createdAt) + (t.ai && t.ai.cands ? "　AI候補：" + t.ai.cands.map(x => `${x.n} ${Math.round(x.s * 100)}%`).join(" / ") : "");
  $("dPos").textContent = posText(t.lat, t.lng, t.acc);
  $("dMemo").value = t.memo || "";
  $("dStatus").value = t.status || "live"; $("dStatusAt").value = t.statusAt || "";
  fillForm(null); drawHist(); await drawPhotos(); drawCompare();
  $("detail").classList.add("on"); $("detail").scrollTop = 0;
  if (map) map.closePopup();
}
async function photoBlob(p, kind) {
  if (p[kind]) return p[kind];
  const id = kind === "lab" ? p.labId : p.origId;
  if (!id || !syncOn()) return null;
  const r = await api("getPhoto", { id });
  const b = await dataToBlob("data:image/jpeg;base64," + r.data);
  const fresh = await db.get("photos", p.uid); if (fresh) { fresh[kind] = b; await db.put("photos", fresh); }
  p[kind] = b; return b;
}
async function drawPhotos() {
  const t = cur; if (!t) return;
  const ps = alive(await db.photosOf(t.uid)).sort((a, b) => a.at - b.at);
  freeUrls(); $("dPhotos").innerHTML = ps.length ? "" : '<div class="sub">写真なし</div>';
  for (const p of ps) {
    const im = new Image(); im.alt = "読込中"; im.onclick = () => openViewer(p.uid); $("dPhotos").appendChild(im);
    photoBlob(p, "lab").then(b => { if (b && cur === t) { const u = URL.createObjectURL(b); urls.push(u); im.src = u; } }).catch(() => { im.alt = "取得失敗"; });
  }
}
function drawHist() {
  const h = alive(cur.diags || []).sort((a, b) => b.at - a.at);
  $("dHist").innerHTML = h.length ? h.map(d => `<div class="hist"><span class="ops"><button data-ed="${d.id}">編集</button><button data-rm="${d.id}">削除</button></span>
    <b>${fmt(d.at)}</b> <span class="badge ${jcls(d)}">${d.judge || "判定なし"}</span> ${esc(d.by || "")}<br>
    ${d.h ? "樹高" + esc(d.h) + "m " : ""}${d.g ? "幹周" + esc(d.g) + "cm " : ""}${d.s ? "枝張" + esc(d.s) + "m" : ""}<br>
    ${esc(d.reason || findingsText(d) || "異常なし")}${d.acts && d.acts.length ? "<br>処置：" + esc(d.acts.join("・")) : ""}${d.next ? "／" + esc(d.next) : ""}${d.note ? "<br>所見：" + esc(d.note) : ""}</div>`).join("")
    : '<div class="sub">まだ診断記録がありません</div>';
}
/* 経年比較：年ごとの全景写真と診断値の推移 */
const yr = ts => new Date(ts).getFullYear();
async function wholeByYear(t) {
  const ps = alive(await db.photosOf(t.uid)).filter(p => p.organ === "whole").sort((a, b) => a.at - b.at), by = {};
  ps.forEach(p => by[yr(p.at)] = p);
  return Object.keys(by).sort().map(y => by[y]);
}
function trendRows(t) {
  const ds = alive(t.diags || []).sort((a, b) => a.at - b.at);
  return ds.map((d, i) => { const p = ds[i - 1]; return { d, gDiff: p && d.g && p.g ? +d.g - +p.g : null }; });
}
async function drawCompare() {
  const t = cur; if (!t) return;
  const rows = trendRows(t), ws = await wholeByYear(t);
  let html = rows.length > 1 ? `<table class="mx"><tr><th>診断日</th><th>判定</th><th>幹周</th><th>樹高</th><th>樹勢</th></tr>${rows.map(r => `<tr><td>${fmtD(r.d.at)}</td><td><span class="badge ${jcls(r.d)}">${r.d.judge || "-"}</span></td><td>${esc(r.d.g || "-")}${r.gDiff != null ? `<small>（${r.gDiff >= 0 ? "+" : ""}${r1(r.gDiff)}）</small>` : ""}</td><td>${esc(r.d.h || "-")}</td><td>${esc(r.d.vig || "")}</td></tr>`).join("")}</table>` : '<div class="sub">診断が2回以上になると、判定・幹周・樹高の推移を表示します。</div>';
  html += ws.length > 1 ? `<div class="gal" style="margin-top:8px" id="cmpGal"></div>` : `<div class="sub">年の違う「全景」写真が2枚以上で、写真を並べて比較します。${ws.length ? "翌年は「前回と同じ構図で全景を撮る」を使ってください。" : ""}</div>`;
  $("dCmp").innerHTML = html;
  if (ws.length > 1) for (const p of ws.slice(-3)) {
    const b = await photoBlob(p, "lab").catch(() => null); if (!b || cur !== t) continue;
    const u = URL.createObjectURL(b); urls.push(u);
    $("cmpGal").insertAdjacentHTML("beforeend", `<div style="text-align:center;font-size:12px"><img src="${u}" style="height:150px;border-radius:8px"><br>${yr(p.at)}年 ${fmtD(p.at).slice(5)}</div>`);
  }
}
let ghostStream = null;
async function openGhost() {
  if (!cur) return;
  const ws = alive(await db.photosOf(cur.uid)).filter(p => p.organ === "whole").sort((a, b) => b.at - a.at);
  const prev = ws.find(p => Date.now() - p.at > 30 * 864e5) || ws[0];
  if (!prev) { toast("前回の全景写真がありません。まず全景を撮ってください"); return; }
  const b = await photoBlob(prev, "orig").catch(() => null) || await photoBlob(prev, "lab").catch(() => null);
  if (!b) { toast("前回写真を読み込めません"); return; }
  $("ghImg").src = URL.createObjectURL(b); $("ghInfo").textContent = `前回 ${fmtD(prev.at)} の全景を重ねています`;
  try { ghostStream = camOK ? $("v").srcObject : await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false }); }
  catch (e) { toast("カメラを開けません"); return; }
  $("ghV").srcObject = ghostStream; $("ghost").classList.add("on");
}
function closeGhost() { $("ghost").classList.remove("on"); if (ghostStream && ghostStream !== $("v").srcObject) ghostStream.getTracks().forEach(t => t.stop()); ghostStream = null; URL.revokeObjectURL($("ghImg").src); }
async function closeDetail() { $("detail").classList.remove("on"); freeUrls(); cur = null; refreshViews(); }
async function saveCur() { await save("trees", cur); }

/* 写真ビューア */
let vPhoto = null, vOrig = false, vUrl = null;
async function openViewer(id) { vPhoto = await db.get("photos", id); vOrig = false; $("viewer").classList.add("on"); showViewer(); }
async function showViewer() {
  if (vUrl) URL.revokeObjectURL(vUrl); vUrl = null; $("vImg").removeAttribute("src");
  $("vToggle").textContent = vOrig ? "ラベル付きを表示" : "元画像を表示";
  $("vInfo").textContent = `${fmt(vPhoto.at)}　${posText(vPhoto.lat, vPhoto.lng, vPhoto.acc)}　部位：${ORGAN_JA[vPhoto.organ] || "-"}`;
  try { const b = await photoBlob(vPhoto, vOrig ? "orig" : "lab"); if (!b) { toast(vOrig ? "元画像はこの端末にありません" : "画像がありません"); return; } vUrl = URL.createObjectURL(b); $("vImg").src = vUrl; }
  catch (e) { toast("画像の取得に失敗：" + e.message); }
}
function closeViewer() { $("viewer").classList.remove("on"); if (vUrl) URL.revokeObjectURL(vUrl); vUrl = null; vPhoto = null; }

/* ---------- 地図 ---------- */
const LEGEND_HTML = `<div class="legend"><span class="j-A">A 健全</span><span class="j-B1">B1 注意</span><span class="j-B2">B2 要処置</span><span class="j-C">C 伐採推奨</span><span class="j-cut">伐採済</span><span class="j-none">未診断</span><span class="j-empty">空き桝</span></div>`;
let map = null, layer = null, meMarker = null, fitted = false;
function initMap() {
  if (map || !window.L) return;
  map = L.map("map").setView([35.681, 139.767], 12);
  const att = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>';
  const std = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", { maxNativeZoom: 18, maxZoom: 22, attribution: att }).addTo(map);
  const photo = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", { maxNativeZoom: 18, maxZoom: 22, attribution: att });
  L.control.layers({ "地図": std, "航空写真": photo }).addTo(map);
  layer = L.layerGroup().addTo(map);
  const lg = L.control({ position: "bottomleft" }); lg.onAdd = () => { const d = L.DomUtil.create("div"); d.innerHTML = LEGEND_HTML; return d; }; lg.addTo(map);
}
async function listTrees() {
  const all = alive(await db.all("trees"));
  return store.get("list_all") === "1" ? all : all.filter(t => curProj && t.project === curProj.uid);
}
async function drawMap(fit) {
  initMap();
  if (!map) { $("mapmsg").textContent = "地図を読み込めませんでした（電波を確認して再読み込み）"; return; }
  map.invalidateSize(); layer.clearLayers(); mk = {};
  const ts = (await listTrees()).filter(t => t.lat != null);
  ts.forEach(t => {
    const d = latest(t);
    mk[t.uid] = L.marker([t.lat, t.lng], { icon: L.divIcon({ className: "", html: `<div class="pin-b ${tcls(t)}">${t.no}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
      .bindPopup(`<b>${noStr(t.no)} ${esc(t.name || "樹種未確定")}</b><br>${d ? "判定 " + esc(d.judge || "-") + "（" + fmtD(d.at) + "）" : "未診断"}<br><button class="primary" onclick="openDetail('${t.uid}')">カルテを開く</button> <button onclick="startMove('${t.uid}')">位置を修正</button>`)
      .addTo(layer);
  });
  if ((fit || !fitted) && ts.length) { map.fitBounds(L.latLngBounds(ts.map(t => [t.lat, t.lng])), { padding: [40, 40], maxZoom: 19 }); fitted = true; }
  $("mapmsg").textContent = ts.length ? "" : "位置付きのカルテがまだありません";
}
let mk = {}, moving = null;
async function startMove(id) {
  const t = await db.get("trees", id); if (!t || !map) return;
  map.closePopup();
  let m = mk[id];
  if (!m) { const c = map.getCenter(); m = mk[id] = L.marker(c, { icon: L.divIcon({ className: "", html: `<div class="pin-b j-none">${t.no}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(layer); }
  else map.setView(m.getLatLng(), Math.max(map.getZoom(), 19));
  m.dragging.enable(); m.setZIndexOffset(1000);
  moving = { t, m, orig: m.getLatLng() };
  $("moveTxt").textContent = `${noStr(t.no)} のピンを正しい位置へドラッグ（航空写真に切替えると合わせやすい）`;
  $("moveBar").style.display = "flex";
}
function endMove() { if (!moving) return; moving.m.dragging.disable(); moving = null; $("moveBar").style.display = "none"; }
async function locate() {
  const p = await getPos(); if (!p) { toast("現在地を取得できません"); return; }
  if (!map) return;
  if (meMarker) meMarker.remove();
  meMarker = L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", fillColor: "#2b7bff", fillOpacity: 1, weight: 2 }).addTo(map);
  map.setView([p.lat, p.lng], 18);
}

/* ---------- 一覧 ---------- */
async function drawList() {
  await ensureProject(); await drawProjSel();
  const q = $("q").value.trim().toLowerCase();
  let ts = (await listTrees()).sort((a, b) => a.no - b.no);
  const cnt = { A: 0, B1: 0, B2: 0, C: 0, none: 0, cut: 0, empty: 0 };
  ts.forEach(t => { const d = latest(t); cnt[t.status === "cut" || t.status === "empty" ? t.status : d && d.judge ? d.judge : "none"]++; });
  $("sum").innerHTML = `<span style="background:#333">計 ${ts.length}本</span>` + ["A", "B1", "B2", "C"].map(j => `<span class="j-${j}">${j} ${cnt[j]}</span>`).join("") + `<span class="j-none">未診断 ${cnt.none}</span><span class="j-cut">伐採済 ${cnt.cut}</span>` + (cnt.empty ? `<span class="j-empty">空き桝 ${cnt.empty}</span>` : "");
  const dup = {}; ts.forEach(t => { const k = t.project + "_" + t.no; dup[k] = (dup[k] || 0) + 1; });
  if (q) ts = ts.filter(t => { const d = latest(t); return [noStr(t.no), t.no, t.mgmtNo, t.name, t.sci, t.place, t.memo, d && d.judge].join(" ").toLowerCase().includes(q); });
  $("list").innerHTML = ts.map(t => {
    const d = latest(t), dp = dup[t.project + "_" + t.no] > 1;
    return `<div class="card" data-id="${t.uid}"><img src="${t.thumb || ""}" alt=""><div><b>${noStr(t.no)}${dp ? " ⚠番号重複" : ""}　${esc(t.name || "樹種未確定")}</b><small>${esc([t.mgmtNo, t.place].filter(Boolean).join("　") || t.sci || "")}</small><small>${d ? fmtD(d.at) + "　" + esc(d.reason || findingsText(d) || "異常なし") : "未診断"}${t.lat == null ? "・位置なし" : ""}</small></div><span class="badge ${tcls(t)}">${tlab(t)}</span></div>`;
  }).join("") || '<p class="empty">まだカルテがありません。<br>「判定」タブで樹種を出して「＋ カルテに登録」。</p>';
}
function refreshViews() { if ($("v-list").classList.contains("on")) drawList(); if ($("v-map").classList.contains("on")) drawMap(false); }

/* ---------- 報告書（印刷→PDF保存） ---------- */
function lonlat2px(lng, lat, z) {
  const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180);
  return { x: (lng + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
function staticMap(pts, w, h, zmax = 18) {
  if (!pts.length) return '<div class="note">位置情報のある樹木がありません</div>';
  let z = zmax;
  for (; z > 5; z--) {
    const ps = pts.map(p => lonlat2px(p.lng, p.lat, z));
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= w - 60 && Math.max(...ys) - Math.min(...ys) <= h - 60) break;
  }
  const ps = pts.map(p => ({ ...lonlat2px(p.lng, p.lat, z), label: p.label, cls: p.cls || "j-C" }));
  const cx = (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x))) / 2, cy = (Math.min(...ps.map(p => p.y)) + Math.max(...ps.map(p => p.y))) / 2;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  let html = `<div class="smap" style="width:${w}px;height:${h}px">`;
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++)
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++)
      html += `<img src="https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${tx}/${ty}.png" style="left:${Math.round(tx * 256 - x0)}px;top:${Math.round(ty * 256 - y0)}px" alt="">`;
  ps.forEach(p => html += `<div class="pin ${p.cls}" style="left:${Math.round(p.x - x0)}px;top:${Math.round(p.y - y0)}px">${esc(p.label)}</div>`);
  return html + `</div><div class="note">出典：地理院タイル（標準地図）</div>`;
}
function diagTable(d) {
  if (!d) return "<p>診断記録なし</p>";
  const mxRows = ITEMS.map(i => `<tr><td>${i[1]}</td>${PARTS.map(p => `<td style="text-align:center">${d.mx && d.mx[i[0]] && d.mx[i[0]].includes(p[0]) ? "●" : ""}</td>`).join("")}</tr>`).join("");
  return `<table><tr><th>診断日</th><td>${fmtD(d.at)}</td><th>診断者</th><td>${esc(d.by || "")}</td></tr>
  <tr><th>樹高／幹周／枝張</th><td colspan="3">${esc(d.h || "-")} m ／ ${esc(d.g || "-")} cm ／ ${esc(d.s || "-")} m</td></tr>
  <tr><th>樹勢</th><td>${esc(d.vig || "")}</td><th>枯枝</th><td>${esc(d.dead || "")}</td></tr>
  <tr><th>根系・その他</th><td colspan="3">${esc(ROOTS.filter(r => d.roots && d.roots.includes(r[0])).map(r => r[1]).join("・") || "異常なし")}</td></tr>
  <tr><th>活力</th><td colspan="3">${esc(VITAL.map(v => v[1] + "：" + ((d.vital && d.vital[v[0]]) || "-")).join("／"))}</td></tr>
  <tr><th>支障</th><td colspan="3">${esc(OBST.filter(o => d.obst && d.obst.includes(o[0])).map(o => o[1]).join("・") || "なし")}</td></tr>
  <tr><th>病害虫</th><td colspan="3">${esc(d.pest || "")}${d.pestN ? "（" + esc(d.pestN) + "）" : ""}</td></tr>
  <tr><th>機器診断</th><td colspan="3">${d.dev && (d.dev.r || d.dev.t) ? `部位：${esc(d.dev.p || "-")}　腐朽空洞率：${esc(d.dev.r || "-")}%　t/R：${esc(d.dev.t || "-")}` : "実施なし"}</td></tr></table>
  <table><tr><th style="width:40%">部位別の異常</th>${PARTS.map(p => `<th style="text-align:center">${p[1]}</th>`).join("")}</tr>${mxRows}</table>
  <table><tr><th>総合判定</th><td><span class="pj">${esc(d.judge || "-")}</span> ${d.judge ? esc(JUDGE[d.judge].t) : ""}</td></tr>
  <tr><th>判定理由</th><td>${esc(d.reason || findingsText(d) || "")}</td></tr>
  <tr><th>処置</th><td>${esc((d.acts || []).join("・"))}</td></tr>
  <tr><th>次回診断・対応</th><td>${esc(d.next || "")}</td></tr>
  <tr><th>所見</th><td>${esc(d.note || "")}</td></tr></table>`;
}
async function photosHTML(t, max) {
  const ps = alive(await db.photosOf(t.uid)).sort((a, b) => a.at - b.at);
  const pick = [...ps.filter(p => p.organ === "whole"), ...ps.filter(p => p.organ !== "whole")].slice(0, max);
  const out = [];
  for (const p of pick) { try { const b = await photoBlob(p, "lab"); if (b) out.push(`<div class="ph"><img src="${await blobToData(b)}"></div>`); } catch (e) {} }
  return out.join("") || '<p class="note">写真なし</p>';
}
async function compareHTML(t) {
  const ds = alive(t.diags || []).sort((a, b) => a.at - b.at);
  const ws = await wholeByYear(t);
  if (ds.length < 2 && ws.length < 2) return "";
  let h = "<h3>前回との比較</h3>";
  if (ds.length >= 2) {
    const a = ds[ds.length - 2], b = ds[ds.length - 1];
    const row = (k, x, y) => `<tr><th>${k}</th><td>${esc(x ?? "")}</td><td>${esc(y ?? "")}</td></tr>`;
    h += `<table><tr><th>項目</th><th>前回 ${fmtD(a.at)}</th><th>今回 ${fmtD(b.at)}</th></tr>${row("総合判定", a.judge, b.judge)}${row("幹周(cm)", a.g, (b.g || "") + (a.g && b.g ? `（${+b.g - +a.g >= 0 ? "+" : ""}${r1(+b.g - +a.g)}）` : ""))}${row("樹高(m)", a.h, b.h)}${row("樹勢", a.vig, b.vig)}${row("判定理由", a.reason || findingsText(a), b.reason || findingsText(b))}</table>`;
  }
  if (ws.length >= 2) {
    const out = [];
    for (const p of ws.slice(-2)) { const b = await photoBlob(p, "lab").catch(() => null); if (b) out.push(`<div class="ph" style="width:49%"><img src="${await blobToData(b)}"><div class="note">${fmtD(p.at)}</div></div>`); }
    h += out.join("");
  }
  return h;
}
async function sheetHTML(t, proj) {
  return `<div class="pg"><h2>樹木カルテ（個票）　${noStr(t.no)}${t.mgmtNo ? "　管理番号 " + esc(t.mgmtNo) : ""}</h2>
  <table><tr><th>樹種</th><td>${esc(t.name || "")}${t.sci ? "（" + esc(t.sci) + "）" : ""}</td><th>案件</th><td>${esc(proj ? proj.name : "")}</td></tr>
  <tr><th>所在</th><td colspan="3">${esc(t.place || "")}</td></tr>
  <tr><th>位置</th><td colspan="3">${posText(t.lat, t.lng, t.acc)}</td></tr></table>
  ${t.status && t.status !== "live" ? `<p><b>状態：${STATUS[t.status]}</b>${t.statusAt ? "（" + esc(t.statusAt) + "）" : ""}</p>` : ""}
  ${diagTable(latest(t))}
  ${await compareHTML(t)}
  <h3>写真</h3>${await photosHTML(t, 3)}
  ${t.lat != null ? "<h3>位置図</h3>" + staticMap([{ lat: t.lat, lng: t.lng, label: t.no, cls: tcls(t) }], 480, 170) : ""}
  ${t.memo ? `<h3>メモ</h3><p>${esc(t.memo)}</p>` : ""}</div>`;
}
async function doPrint(html) {
  $("printArea").innerHTML = html;
  const imgs = [...$("printArea").querySelectorAll("img")];
  toast("画像を読み込み中…", 4000);
  await Promise.race([Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 8000))]);
  $("toast").style.display = "none";
  $("printReady").classList.add("on");
}
async function checkIssues() {
  await ensureProject();
  const ts = alive(await db.all("trees")).filter(t => t.project === curProj.uid).sort((a, b) => a.no - b.no);
  const nos = {}; ts.forEach(t => nos[t.no] = (nos[t.no] || 0) + 1);
  const hasLedger = ts.some(t => t.ledger);
  const out = [];
  for (const t of ts) {
    const d = latest(t), ps = alive(await db.photosOf(t.uid)), is = [];
    if (!d) is.push("未診断"); else {
      if (!d.judge) is.push("総合判定なし");
      if (!d.g) is.push("幹周なし");
      if (!d.h) is.push("樹高なし");
      if ((d.judge === "B2" || d.judge === "C") && !(d.acts || []).length) is.push("処置なし");
    }
    if (!ps.some(p => p.organ === "whole")) is.push("全景写真なし");
    if (d && d.judge && d.judge !== "A" && !ps.some(p => p.organ !== "whole")) is.push("被害部写真なし");
    if (t.lat == null) is.push("位置なし");
    else if (typeof t.acc === "number" && t.acc > 3) is.push(`位置の誤差±${t.acc}m（地図で補正）`);
    if (!t.name) is.push("樹種未確定");
    if (hasLedger && !t.mgmtNo) is.push("管理番号なし");
    if (nos[t.no] > 1) is.push("番号重複");
    if (is.length) out.push({ t, is });
  }
  return { ts, out };
}
async function showCheck() {
  const { ts, out } = await checkIssues();
  $("chkSum").textContent = `${curProj.name}：${ts.length}本中 ${out.length}本に要確認項目`;
  $("chkList").innerHTML = out.length ? out.map(x => `<div class="card" data-id="${x.t.uid}"><div><b>${noStr(x.t.no)}${x.t.mgmtNo ? "　" + esc(x.t.mgmtNo) : ""}　${esc(x.t.name || "樹種未確定")}</b><small style="color:#ffb35c;white-space:normal">${x.is.join("・")}</small></div></div>`).join("") : '<p class="empty">漏れはありません。報告書を作成できます。</p>';
  $("check").classList.add("on");
}
async function printReport() {
  { const { out } = await checkIssues(); if (out.length && !confirm(`${out.length}本に要確認項目があります（未診断・写真なし等）。\n\nこのまま報告書を作る→OK\n一覧で確認する→キャンセル`)) { showCheck(); return; } }
  await ensureProject();
  const proj = curProj, ts = alive(await db.all("trees")).filter(t => t.project === proj.uid).sort((a, b) => a.no - b.no);
  if (!ts.length) { toast("この案件にカルテがありません"); return; }
  toast("報告書を作成中…", 6000);
  const cnt = { A: 0, B1: 0, B2: 0, C: 0, none: 0, cut: 0, empty: 0 }, sp = {};
  ts.forEach(t => { const d = latest(t); cnt[t.status === "cut" || t.status === "empty" ? t.status : d && d.judge ? d.judge : "none"]++; const k = t.name || "樹種未確定"; sp[k] = (sp[k] || 0) + 1; });
  const dates = ts.map(t => latest(t)).filter(Boolean).map(d => d.at);
  const period = proj.period || (dates.length ? `${fmtD(Math.min(...dates))} 〜 ${fmtD(Math.max(...dates))}` : "");
  const row = t => { const d = latest(t); return `<tr><td>${noStr(t.no)}</td><td>${esc(t.mgmtNo || "")}</td><td>${esc(t.name || "")}</td><td>${esc(t.place || "")}</td><td>${esc(d ? d.g || "" : "")}</td><td>${esc(d ? d.h || "" : "")}</td><td style="text-align:center"><b>${esc(d ? d.judge || "-" : "未")}</b></td><td>${esc(d ? d.reason || findingsText(d) : "")}</td><td>${esc(d ? (d.acts || []).join("・") : "")}</td></tr>`; };
  const head = `<tr><th>番号</th><th>管理番号</th><th>樹種</th><th>所在</th><th>幹周cm</th><th>樹高m</th><th>判定</th><th>判定理由</th><th>処置</th></tr>`;
  const bad = ts.filter(t => { const d = latest(t); return d && (d.judge === "C" || d.judge === "B2"); });
  let html = `<div class="pg"><h1>${esc(proj.title || proj.name)}<br><span style="font-size:14pt">樹木診断報告書</span></h1>
  <table class="cover" style="width:80%;margin:0 auto"><tr><th>発注者</th><td>${esc(proj.client || "")}</td></tr><tr><th>受注者</th><td>${esc(proj.contractor || "")}</td></tr>
  <tr><th>診断者</th><td>${esc(proj.inspector || "")}${proj.license ? "（樹木医 登録番号 " + esc(proj.license) + "）" : ""}</td></tr>
  <tr><th>調査期間</th><td>${esc(period)}</td></tr><tr><th>対象本数</th><td>${ts.length}本</td></tr><tr><th>作成日</th><td>${fmtD(Date.now())}</td></tr></table></div>`;
  html += `<div class="pg"><h2>1. 診断結果の総括</h2>${proj.intro ? `<p style="margin-bottom:8px">${esc(proj.intro)}</p>` : ""}
  <table><tr><th>総合判定</th><th>内容</th><th>本数</th><th>対応の目安</th></tr>${["A", "B1", "B2", "C"].map(j => `<tr><td><b>${j}</b></td><td>${JUDGE[j].t}</td><td>${cnt[j]}</td><td>${JUDGE[j].next}</td></tr>`).join("")}<tr><td>-</td><td>未診断</td><td>${cnt.none}</td><td></td></tr>${cnt.cut ? `<tr><td>-</td><td>伐採済</td><td>${cnt.cut}</td><td></td></tr>` : ""}${cnt.empty ? `<tr><td>-</td><td>空き桝・欠損</td><td>${cnt.empty}</td><td></td></tr>` : ""}<tr><th colspan="2">合計</th><th>${ts.length}</th><th></th></tr></table>
  <p class="note">判定区分は東京都建設局「街路樹診断」の健全度区分（A・B1・B2・C）に準拠。発注者の様式に合わせて調整してください。</p>
  <h3>樹種別本数</h3><table><tr><th>樹種</th><th>本数</th></tr>${Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</table>
  <h3>処置が必要な樹木（B2・C）</h3>${bad.length ? `<table>${head}${bad.map(row).join("")}</table>` : "<p>該当なし</p>"}</div>`;
  html += `<div class="pg"><h2>2. 位置図</h2>${staticMap(ts.filter(t => t.lat != null).map(t => ({ lat: t.lat, lng: t.lng, label: t.no, cls: tcls(t) })), 680, 820)}${LEGEND_HTML}</div>`;
  html += `<div class="pg"><h2>3. 診断結果一覧表</h2><table style="font-size:8.5pt">${head}${ts.map(row).join("")}</table></div>`;
  for (const t of ts) html += await sheetHTML(t, proj);
  await doPrint(html);
}

/* ---------- 台帳の取り込み ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
async function importLedger(file) {
  const buf = await file.arrayBuffer();
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder("shift_jis").decode(buf); }
  const rows = parseCSV(text.replace(/^\ufeff/, ""));
  if (rows.length < 2) { toast("データ行がありません"); return; }
  const h = rows[0].map(x => x.trim());
  const col = (...res) => { for (const re of res) { const i = h.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
  const C = { mg: col(/管理番号|樹木番号|樹木ID/i, /番号|ID|No/i), name: col(/樹種/), place: col(/所在|住所|路線|場所|公園|位置/), lat: col(/緯度|^lat/i), lng: col(/経度|^lo?ng|^lon/i), g: col(/幹周/), h: col(/樹高/) };
  if (C.mg < 0) { toast("「管理番号」または「樹木番号」の列が見つかりません", 4000); return; }
  await ensureProject();
  const exist = new Set(alive(await db.all("trees")).filter(t => t.project === curProj.uid && t.mgmtNo).map(t => t.mgmtNo));
  const data = rows.slice(1).filter(r => (r[C.mg] || "").trim() && !exist.has(r[C.mg].trim()));
  const skip = rows.length - 1 - data.length;
  const found = Object.entries({ 樹種: C.name, 所在: C.place, 緯度経度: C.lat >= 0 && C.lng >= 0 ? 1 : -1, 幹周: C.g, 樹高: C.h }).filter(([, v]) => v >= 0).map(([k]) => k).join("・") || "なし";
  if (!data.length) { toast(`取り込む行がありません（既存と重複 ${skip}行）`, 4000); return; }
  if (!confirm(`案件「${curProj.name}」に ${data.length}本を取り込みます。\n読み取った列：管理番号・${found}${skip ? `\n（既存と重複・空行 ${skip}行は除外）` : ""}`)) return;
  let no = await nextNo(curProj.uid);
  const num = v => { const n = parseFloat(String(v || "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? null : n; };
  for (const r of data) {
    const g = k => C[k] >= 0 ? (r[C[k]] || "").trim() : "";
    const lat = num(g("lat")), lng = num(g("lng")), ok = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    await save("trees", { uid: uid(), project: curProj.uid, no: no++, mgmtNo: g("mg"), place: g("place"), name: g("name"), sci: "", fam: "", ai: null,
      lat: ok ? lat : null, lng: ok ? lng : null, acc: ok ? "台帳" : null, ledger: { g: g("g"), h: g("h") }, createdAt: Date.now(), diags: [], memo: "", thumb: null });
  }
  persistOnce(); toast(`${data.length}本を取り込みました`); fitted = false; refreshViews();
}

/* ---------- CSV・バックアップ ---------- */
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
async function exportCSV() {
  const ps = {}; (await db.all("projects")).forEach(p => ps[p.uid] = p);
  const ts = (await listTrees()).sort((a, b) => a.no - b.no);
  const head = ["案件", "番号", "管理番号", "樹種名", "学名", "所在", "緯度", "経度", "診断日", "診断者", "樹高m", "幹周cm", "枝張m", "樹勢", "枯枝", "活力", "支障", "異常（部位）", "病害虫", "腐朽空洞率%", "t/R", "総合判定", "判定理由", "処置", "次回診断・対応", "所見", "メモ"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = ts.map(t => { const d = latest(t) || {}; return [ps[t.project] ? ps[t.project].name : "", t.no, t.mgmtNo, t.name, t.sci, t.place, t.lat, t.lng, d.at ? fmtD(d.at) : "", d.by, d.h, d.g, d.s, d.vig, d.dead, VITAL.map(v => (d.vital && d.vital[v[0]] && d.vital[v[0]] !== "正常") ? v[1] + d.vital[v[0]] : "").filter(Boolean).join("・"), OBST.filter(o => d.obst && d.obst.includes(o[0])).map(o => o[1]).join("・"), d.at ? findingsText({ mx: d.mx, roots: d.roots }) : "", d.pest, d.dev && d.dev.r, d.dev && d.dev.t, d.judge, d.reason, (d.acts || []).join("・"), d.next, d.note, t.memo].map(q).join(","); });
  download(new Blob(["\ufeff" + [head.map(q).join(","), ...rows].join("\r\n")], { type: "text/csv" }), `樹木診断_${stamp()}.csv`);
}
async function backup() {
  toast("バックアップを作成中…");
  const out = { app: "jumoku-karte", version: 1, at: Date.now(), userDict: userDict(), projects: await db.all("projects"), trees: await db.all("trees"), photos: [] };
  for (const p of await db.all("photos")) out.photos.push({ ...p, orig: p.orig ? await blobToData(p.orig) : null, lab: p.lab ? await blobToData(p.lab) : null });
  download(new Blob([JSON.stringify(out)], { type: "application/json" }), `樹木診断_バックアップ_${stamp()}.json`);
}
async function restore(file) {
  let j; try { j = JSON.parse(await file.text()); } catch (e) { toast("ファイルを読めません"); return; }
  if (j.app !== "jumoku-karte") { toast("このアプリのバックアップではありません"); return; }
  if (!confirm(`バックアップ（${j.trees.length}本・写真${j.photos.length}枚）で端末内データを置き換えます。よろしいですか？`)) return;
  await db.clearAll();
  for (const p of j.projects) await db.put("projects", p);
  for (const t of j.trees) await db.put("trees", t);
  for (const p of j.photos) await db.put("photos", { ...p, orig: p.orig ? await dataToBlob(p.orig) : null, lab: p.lab ? await dataToBlob(p.lab) : null });
  if (j.userDict) setUserDict({ ...j.userDict, ...userDict() });
  toast("復元しました"); await ensureProject(); refreshViews();
}

/* ---------- PCと同期（Google Apps Script） ---------- */
const syncOn = () => !!store.get("gas_url");
async function api(action, payload = {}) {
  const r = await fetch(store.get("gas_url"), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: store.get("gas_token"), action, ...payload }) });
  let j; try { j = await r.json(); } catch (e) { throw new Error("応答が不正です（URL・公開設定を確認）"); }
  if (!j.ok) throw new Error(j.error === "token" ? "合言葉が違います" : j.error);
  return j;
}
const strip = o => { const c = { ...o }; delete c._dirty; delete c._proj; delete c.lab; delete c.orig; return c; };
let syncing = false, syncTimer = null;
function scheduleSync() { if (!syncOn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(true), 4000); }
function setSyncState(t) { $("syncState").textContent = t; $("sSyncInfo").textContent = t; }
async function sync(quiet) {
  if (!syncOn()) { if (!quiet) toast("同期先が未設定です（設定→PCと同期）"); return; }
  if (syncing) { scheduleSync(); return; }
  if (!navigator.onLine) { setSyncState("オフライン：電波が戻ったら同期します"); return; }
  syncing = true; setSyncState("同期中…");
  try {
    // 1) 写真本体をドライブへ
    const sendOrig = store.get("send_orig") === "1";
    for (const p of await db.all("photos")) {
      if (p.deleted) continue;
      let ch = false;
      if (p.lab && !p.labId) { p.labId = (await api("putPhoto", { name: `${p.uid}_label.jpg`, data: (await blobToData(p.lab)).split(",")[1] })).id; ch = true; }
      if (sendOrig && p.orig && !p.origId) { p.origId = (await api("putPhoto", { name: `${p.uid}_orig.jpg`, data: (await blobToData(p.orig)).split(",")[1] })).id; ch = true; }
      if (ch) await save("photos", p);
    }
    clearTimeout(syncTimer);
    // 2) 変更をスプレッドシートへ
    const dirty = {};
    for (const n of ["projects", "trees", "photos"]) dirty[n] = (await db.all(n)).filter(x => x._dirty);
    if (dirty.projects.length + dirty.trees.length + dirty.photos.length) {
      await api("push", { projects: dirty.projects.map(strip), trees: dirty.trees.map(strip), photos: dirty.photos.map(strip) });
      for (const n of ["projects", "trees", "photos"]) for (const x of dirty[n]) { const f = await db.get(n, x.uid); if (f && f.updatedAt === x.updatedAt) { f._dirty = false; await db.put(n, f); } }
    }
    // 3) 他の端末の変更を取り込む
    const since = (+store.get("last_sync") || 0) - 120000, started = Date.now();
    const r = await api("pull", { since });
    let got = 0;
    for (const n of ["projects", "trees", "photos"]) for (const x of r[n] || []) {
      const l = await db.get(n, x.uid);
      if (l && (l._dirty || l.updatedAt >= x.updatedAt)) continue;
      const v = { ...x, _dirty: false };
      if (n === "photos" && l) { v.lab = x.labId === l.labId ? l.lab : null; v.orig = l.orig || null; }
      if (v.deleted && n === "photos") { v.lab = null; v.orig = null; }
      await db.put(n, v); got++;
    }
    store.set("last_sync", String(started));
    setSyncState(`最終同期 ${fmt(Date.now())}${got ? `（${got}件取込）` : ""}`);
    if (!quiet) toast("同期しました");
    if (got) { await ensureProject(); refreshViews(); if (cur && !$("detail").classList.contains("on")) cur = null; }
  } catch (e) {
    setSyncState("同期失敗：" + e.message); if (!quiet) toast("同期失敗：" + e.message, 4000);
  } finally { syncing = false; }
}

/* ---------- 設定 ---------- */
async function openSettings() {
  $("key").value = store.get("pn_key"); $("demo").checked = store.get("pn_demo") === "1";
  $("posSec").value = store.get("pos_sec") || "10"; $("gasUrl").value = store.get("gas_url"); $("gasToken").value = store.get("gas_token"); $("sendOrig").checked = store.get("send_orig") === "1";
  const u = userDict(); $("udict").value = Object.keys(u).map(k => `${k},${u[k]}`).join("\n");
  const ts = alive(await db.all("trees")), ps = alive(await db.all("photos"));
  let est = ""; try { const e = await navigator.storage.estimate(); est = `／端末使用量 約${(e.usage / 1048576).toFixed(1)}MB`; } catch (e) {}
  $("sInfo").textContent = `カルテ ${ts.length}本・写真 ${ps.length}枚${est}`;
  $("dlg").classList.add("on");
}
function saveSettings() {
  store.set("pn_key", $("key").value.trim()); store.set("pn_demo", $("demo").checked ? "1" : "0");
  store.set("pos_sec", $("posSec").value); store.set("gas_url", $("gasUrl").value.trim()); store.set("gas_token", $("gasToken").value.trim()); store.set("send_orig", $("sendOrig").checked ? "1" : "0");
  const d = {};
  $("udict").value.split(/\r?\n/).forEach(l => { const m = l.split(/[,，\t]/); if (m.length >= 2 && m[0].trim() && m[1].trim()) d[m[0].trim()] = m[1].trim(); });
  setUserDict(d); $("dlg").classList.remove("on"); toast("保存しました");
  if (syncOn()) sync(true);
}

/* ---------- 画面切替・イベント ---------- */
function tab(v) {
  document.querySelectorAll(".view").forEach(e => e.classList.toggle("on", e.id === "v-" + v));
  document.querySelectorAll("#tabs button[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (v === "map") drawMap(false);
  if (v === "list") drawList();
}
document.querySelectorAll("#tabs button[data-v]").forEach(b => b.onclick = () => tab(b.dataset.v));
$("gear").onclick = openSettings;
$("sClose").onclick = () => $("dlg").classList.remove("on");
$("sSave").onclick = saveSettings;
$("sTest").onclick = async () => { store.set("gas_url", $("gasUrl").value.trim()); store.set("gas_token", $("gasToken").value.trim()); try { await api("ping"); toast("接続OK"); } catch (e) { toast("接続失敗：" + e.message, 4000); } };
$("sSync").onclick = () => { saveSettings(); sync(false); };

$("shot").onclick = () => { if (!camOK) { $("file").click(); return; } run(frameBlob); };
$("pick").onclick = () => $("file").click();
$("file").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) run(async () => f); };
$("cands").onclick = e => { const d = e.target.closest("[data-i]"); if (!d || !last) return; last.sel = +d.dataset.i; renderCands(); };
$("reg").onclick = registerFromAI;
$("manual").onclick = async () => {
  let blob = null;
  if (camOK) { try { blob = await frameBlob(); } catch (e) {} }
  register(blob, { at: Date.now(), organ: "whole", score: null, name: "", sci: "", fam: "" });
};

/* 案件 */
$("projSel").onchange = async () => {
  const v = $("projSel").value;
  if (v === "__all") store.set("list_all", "1"); else { store.set("list_all", "0"); store.set("cur_proj", v); }
  fitted = false; await ensureProject(); drawList();
};
$("projEdit").onclick = async () => { await ensureProject(); openProj(curProj); };
$("pClose").onclick = () => $("proj").classList.remove("on");
$("pSave").onclick = async () => {
  const wasPub = curProj.public;
  Object.assign(curProj, { name: $("pName").value.trim() || "無題の案件", title: $("pTitle").value.trim(), client: $("pClient").value.trim(), contractor: $("pContractor").value.trim(), inspector: $("pInspector").value.trim(), license: $("pLicense").value.trim(), period: $("pPeriod").value.trim(), intro: $("pIntro").value.trim(), public: $("pPublic").checked });
  if (curProj.public && !curProj.shareKey) curProj.shareKey = uid().replace(/-/g, "");
  delete curProj.auto; await save("projects", curProj); toast("案件を保存しました");
  if (curProj.public && !wasPub) { drawShare(curProj); sync(true); return; }
  $("proj").classList.remove("on"); await ensureProject(); drawList();
};
$("pNew").onclick = async () => {
  const name = prompt("新しい案件名", "");
  if (!name) return;
  const p = await save("projects", { uid: uid(), name, createdAt: Date.now(), contractor: curProj ? curProj.contractor : "", inspector: curProj ? curProj.inspector : "", license: curProj ? curProj.license : "" });
  store.set("cur_proj", p.uid); store.set("list_all", "0"); await ensureProject(); openProj(curProj); toast("案件を作りました");
};

/* 詳細 */
$("dClose").onclick = closeDetail;
async function treeField(k, v, relabel) {
  if (!cur || cur[k] === v) return;
  cur[k] = v; await saveCur();
  if (relabel) { toast("写真のラベルを貼り直し中…"); await relabelAll(cur); await drawPhotos(); }
  toast("保存しました");
}
$("dNum").onchange = async () => { const n = parseInt($("dNum").value, 10); if (!n) return; await treeField("no", n, true); $("dNo").textContent = noStr(n); };
$("dMg").onchange = () => treeField("mgmtNo", $("dMg").value.trim(), true);
$("dName").onchange = () => treeField("name", $("dName").value.trim(), true);
$("dPlace").onchange = () => treeField("place", $("dPlace").value.trim(), true);
$("dMemo").onchange = () => treeField("memo", $("dMemo").value, false);
$("dDict").onclick = () => {
  const v = $("dName").value.trim();
  if (!cur || !cur.sci) { toast("学名がありません"); return; }
  if (!JA_RE.test(v)) { toast("樹種名を和名にしてから登録してください"); return; }
  const d = userDict(); d[cur.sci] = v; setUserDict(d); toast(`辞書に登録：${cur.sci} → ${v}`);
};
$("dAddPhoto").onclick = () => $("addFile").click();
$("dGhost").onclick = openGhost;
$("ghClose").onclick = closeGhost;
$("ghOp").oninput = () => $("ghImg").style.opacity = $("ghOp").value;
$("ghShot").onclick = async () => {
  const v = $("ghV"); if (!v.videoWidth || !cur) return;
  const blob = await toBlob(canvasOf(v, v.videoWidth, v.videoHeight, 2048), .9);
  closeGhost(); toast("保存中…");
  const pos = await getPos();
  await addPhotoTo(cur, blob, { at: Date.now(), pos, organ: "whole", score: null });
  await drawPhotos(); drawCompare(); toast("全景写真を追加しました");
};
$("dStatus").onchange = async () => {
  const v = $("dStatus").value;
  if (v !== "live" && !$("dStatusAt").value) $("dStatusAt").value = fmtD(Date.now());
  cur.statusAt = $("dStatusAt").value; await treeField("status", v, false);
};
$("dStatusAt").onchange = () => treeField("statusAt", $("dStatusAt").value, false);
$("pPublic").onchange = () => { if ($("pPublic").checked && !confirm("この案件の地図（番号・樹種・判定・所在・位置・サムネイル写真）を、リンクを知っている人が見られるようにします。発注者の了承を得ていますか？")) $("pPublic").checked = false; };
$("pCopy").onclick = async () => { const u = shareUrl(curProj); if (!u) return; try { await navigator.clipboard.writeText(u); toast("リンクをコピーしました"); } catch (e) { prompt("このリンクをコピーしてください", u); } };
$("addFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !cur) return;
  toast("保存中…");
  const pos = await getPos();
  await addPhotoTo(cur, f, { at: Date.now(), pos, organ: $("dOrgan").value, score: null });
  await drawPhotos(); toast("写真を追加しました");
};
$("dPosUpd").onclick = async () => {
  if (!cur) return; toast("現在地を取得中…");
  const p = await getPosAvg(Math.max(10, +(store.get("pos_sec") || 10))); if (!p) { toast("現在地を取得できません"); return; }
  if (!confirm(`位置を現在地（誤差±${p.acc}m・${p.n || 1}回測位）に更新しますか？${p.acc > 3 ? "\n\n誤差が大きいため、更新後に「地図で補正」を推奨します。" : ""}`)) return;
  cur.lat = p.lat; cur.lng = p.lng; cur.acc = p.acc; await saveCur();
  $("dPos").textContent = posText(cur.lat, cur.lng, cur.acc); toast("位置を更新しました");
};
$("dMove").onclick = async () => {
  if (!cur) return;
  const id = cur.uid, has = cur.lat != null; await closeDetail(); tab("map");
  setTimeout(async () => { if (!map) { toast("地図を読み込めません"); return; } if (!has) { const p = await getPos(); if (p) map.setView([p.lat, p.lng], 19); } startMove(id); }, 200);
};
$("moveOk").onclick = async () => {
  if (!moving) return;
  const t = await db.get("trees", moving.t.uid), ll = moving.m.getLatLng();
  t.lat = ll.lat; t.lng = ll.lng; t.acc = "手動"; await save("trees", t);
  endMove(); toast(`${noStr(t.no)} の位置を補正しました`); drawMap(false);
};
$("moveNg").onclick = () => { if (!moving) return; if (moving.t.lat != null) moving.m.setLatLng(moving.orig); endMove(); drawMap(false); };
$("dMap").onclick = async () => {
  if (!cur || cur.lat == null) { toast("位置が記録されていません"); return; }
  const t = cur; await closeDetail(); tab("map");
  setTimeout(() => { if (map) map.setView([t.lat, t.lng], 19); }, 50);
};
$("gJudge").onclick = e => {
  const b = e.target.closest("button[data-j]"); if (!b) return;
  setJudge(b.dataset.j);
  if (!$("gNext").value || Object.values(JUDGE).some(j => j.next === $("gNext").value)) $("gNext").value = JUDGE[b.dataset.j].next;
};
$("gAutoReason").onclick = () => { $("gReason").value = findingsText(readForm()) || "異常は認められない"; };
$("gNew").onclick = () => fillForm(null);
$("gSave").onclick = async () => {
  if (!cur) return;
  const d = readForm();
  if (!d.judge && !confirm("総合判定が未選択です。このまま保存しますか？")) return;
  if (!d.reason) d.reason = findingsText(d);
  cur.diags = (cur.diags || []).filter(x => x.id !== d.id).concat(d);
  await saveCur(); fillForm(null); drawHist(); drawCompare(); toast("診断を保存しました");
};
$("dHist").onclick = async e => {
  const ed = e.target.closest("button[data-ed]"), rm = e.target.closest("button[data-rm]");
  if (ed) { fillForm(cur.diags.find(x => x.id === ed.dataset.ed)); $("gAt").scrollIntoView({ behavior: "smooth", block: "center" }); }
  if (rm && confirm("この診断記録を削除しますか？")) { const x = cur.diags.find(x => x.id === rm.dataset.rm); x.deleted = true; await saveCur(); drawHist(); drawCompare(); if (editingId === x.id) fillForm(null); }
};
$("dDel").onclick = async () => {
  if (!cur || !confirm(`${noStr(cur.no)}（${cur.name || "樹種未確定"}）のカルテと写真を削除します。よろしいですか？`)) return;
  for (const p of await db.photosOf(cur.uid)) { p.deleted = true; p.lab = null; p.orig = null; await save("photos", p); }
  cur.deleted = true; await saveCur(); toast("削除しました"); closeDetail();
};
$("dPrint").onclick = async () => { if (!cur) return; toast("個票を作成中…"); await doPrint(await sheetHTML(cur, cur._proj)); };

/* ビューア */
$("vToggle").onclick = () => { vOrig = !vOrig; showViewer(); };
$("vClose").onclick = closeViewer;
$("vShare").onclick = async () => {
  const b = await photoBlob(vPhoto, vOrig ? "orig" : "lab"); if (!b) return;
  const t = cur, name = `${t ? noStr(t.no) : "photo"}_${stamp()}${vOrig ? "_元" : ""}.jpg`, f = new File([b], name, { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch (e) {} } else download(b, name);
};
$("vDel").onclick = async () => {
  if (!vPhoto || !confirm("この写真を削除しますか？")) return;
  vPhoto.deleted = true; vPhoto.lab = null; vPhoto.orig = null; await save("photos", vPhoto);
  closeViewer(); await drawPhotos(); toast("写真を削除しました");
};

/* 一覧 */
$("list").onclick = e => { const c = e.target.closest(".card"); if (c) openDetail(c.dataset.id); };
$("q").oninput = drawList;
$("report").onclick = printReport;
$("chkBtn").onclick = showCheck;
$("chkClose").onclick = () => $("check").classList.remove("on");
$("chkList").onclick = e => { const c = e.target.closest(".card"); if (c) { $("check").classList.remove("on"); openDetail(c.dataset.id); } };
$("ledgerBtn").onclick = () => $("ledgerFile").click();
$("ledgerFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importLedger(f).catch(err => toast("取り込み失敗：" + err.message, 4000)); };
$("csv").onclick = exportCSV;
$("syncNow").onclick = () => sync(false);
$("backup").onclick = backup;
$("restoreBtn").onclick = () => $("restoreFile").click();
$("restoreFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) restore(f); };
$("locate").onclick = locate;
window.addEventListener("online", () => scheduleSync());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && syncOn()) sync(true); });

/* ---------- 起動 ---------- */
buildForm();
(async () => {
  await ensureProject();
  // PCなど横長画面はカルテ一覧から始める
  if (window.matchMedia("(min-width:900px)").matches) tab("list");
  startCam();
  if (syncOn()) sync(true);
})();
$("printGo").onclick = () => { $("printReady").classList.remove("on"); window.print(); };
$("printCancel").onclick = () => $("printReady").classList.remove("on");
