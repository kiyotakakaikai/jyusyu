/**
 * 樹木診断カルテ — 同期用 Google Apps Script
 * スプレッドシートに貼り付け → ウェブアプリとしてデプロイして使います。
 * データ：このスプレッドシート（案件・樹木・写真の各シート）
 * 写真　：マイドライブの「樹木カルテ_写真」フォルダ
 */
const TOKEN = 'ここを自分だけの合言葉に変更';   // アプリの「合言葉」と同じにする
const FOLDER_NAME = '樹木カルテ_写真';

const COLS = {
  projects: ['uid', 'updatedAt', 'deleted', '案件名', '業務名', '発注者', '診断者', 'json'],
  trees: ['uid', 'updatedAt', 'deleted', '案件uid', '番号', '管理番号', '樹種名', '学名', '所在', '緯度', '経度', '最新診断日', '総合判定', '判定理由', '処置', 'json'],
  photos: ['uid', 'updatedAt', 'deleted', '樹木uid', '撮影日時', '部位', '緯度', '経度', 'ラベル付き写真', '元画像', 'json']
};

function doGet() { return ContentService.createTextOutput('樹木診断カルテ 同期API：稼働中'); }

function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.token !== TOKEN) return out({ ok: false, error: 'token' });
    if (b.action === 'ping') return out({ ok: true });
    if (b.action === 'putPhoto') return out({ ok: true, id: putPhoto(b) });
    if (b.action === 'getPhoto') return out({ ok: true, data: Utilities.base64Encode(DriveApp.getFileById(b.id).getBlob().getBytes()) });
    const lock = LockService.getScriptLock(); lock.waitLock(25000);
    try {
      if (b.action === 'push') return out({ ok: true, n: push(b) });
      if (b.action === 'pull') return out(Object.assign({ ok: true }, pull(Number(b.since) || 0)));
    } finally { lock.releaseLock(); }
    return out({ ok: false, error: 'unknown action' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

function sheet(name) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(COLS[name]); s.setFrozenRows(1); s.hideColumns(1); }
  return s;
}
const ymd = ts => ts ? Utilities.formatDate(new Date(Number(ts)), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : '';
const latestDiag = t => (t.diags || []).filter(d => !d.deleted).sort((a, b) => b.at - a.at)[0] || {};
const fileUrl = id => id ? 'https://drive.google.com/file/d/' + id + '/view' : '';

function rowOf(name, x) {
  const base = [x.uid, x.updatedAt, x.deleted ? 1 : ''];
  let rest;
  if (name === 'projects') rest = [x.name, x.title, x.client, x.inspector];
  if (name === 'trees') { const d = latestDiag(x); rest = [x.project, x.no, x.mgmtNo, x.name, x.sci, x.place, x.lat, x.lng, ymd(d.at), d.judge || '', d.reason || '', (d.acts || []).join('・')]; }
  if (name === 'photos') rest = [x.treeUid, ymd(x.at), x.organ, x.lat, x.lng, fileUrl(x.labId), fileUrl(x.origId)];
  return base.concat(rest.map(v => v == null ? '' : v), [JSON.stringify(x)]);
}

function push(b) {
  let n = 0;
  ['projects', 'trees', 'photos'].forEach(name => {
    const items = b[name] || []; if (!items.length) return;
    const s = sheet(name), last = s.getLastRow();
    const idx = {};
    if (last > 1) s.getRange(2, 1, last - 1, 2).getValues().forEach((r, i) => idx[r[0]] = { row: i + 2, upd: Number(r[1]) });
    const appends = [];
    items.forEach(x => {
      const row = rowOf(name, x), ex = idx[x.uid];
      if (ex) { if (Number(x.updatedAt) >= ex.upd) { s.getRange(ex.row, 1, 1, row.length).setValues([row]); n++; } }
      else { appends.push(row); idx[x.uid] = { row: -1, upd: x.updatedAt }; n++; }
    });
    if (appends.length) s.getRange(s.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  });
  return n;
}

function pull(since) {
  const res = {};
  ['projects', 'trees', 'photos'].forEach(name => {
    const s = sheet(name), last = s.getLastRow(), w = COLS[name].length;
    res[name] = last > 1 ? s.getRange(2, 1, last - 1, w).getValues().filter(r => Number(r[1]) > since).map(r => JSON.parse(r[w - 1])) : [];
  });
  return res;
}

function putPhoto(b) {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const blob = Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', b.name);
  return folder.createFile(blob).getId();
}
