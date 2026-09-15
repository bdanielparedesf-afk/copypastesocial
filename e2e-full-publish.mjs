/**
 * E2E completo: subir video → finalizar → publicar (YouTube real + mocks) → cron.
 */
import fs from 'node:fs';
function env() {
  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  const o = {};
  for (const l of lines) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].trim();
  }
  return o;
}
const E = env();
const BASE = 'http://127.0.0.1:3100';

// 0) Video de prueba (descarga una vez, reusa)
const VIDEO = 'e2e-video.mp4';
if (!fs.existsSync(VIDEO) || fs.statSync(VIDEO).size < 10000) {
  const urls = [
    'https://www.w3schools.com/html/mov_bbb.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'https://download.samplelib.com/mp4/sample-5s.mp4',
  ];
  let ok = false;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 10000) continue;
      fs.writeFileSync(VIDEO, b);
      console.log('0) Video de prueba descargado:', u, b.length, 'bytes');
      ok = true;
      break;
    } catch (e) {
      console.log('   fallo', u, String(e).slice(0, 80));
    }
  }
  if (!ok) {
    console.log('0) ERROR: no se pudo descargar video de prueba');
    process.exit(1);
  }
} else {
  console.log('0) Video de prueba existente:', fs.statSync(VIDEO).size, 'bytes');
}
const bytes = fs.readFileSync(VIDEO);

// 1) upload-url
const upRes = await fetch(BASE + '/api/media/upload-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: [{ name: 'e2e-publish-test.mp4', size: bytes.length, type: 'video/mp4' }] }),
});
const upTxt = await upRes.text();
let up;
try { up = JSON.parse(upTxt); } catch { up = null; }
console.log('1) upload-url status=' + upRes.status, up?.targets?.[0] ? 'OK' : upTxt.slice(0, 300));
if (!up?.targets?.[0]?.signedUrl) process.exit(1);
const target = up.targets[0];

// 2) PUT bytes a la URL firmada
const put = await fetch(target.signedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'video/mp4' },
  body: bytes,
});
console.log('2) PUT storage status=' + put.status);
if (!put.ok) process.exit(1);

// 3) finalize-upload
const finRes = await fetch(BASE + '/api/media/finalize-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    files: [{ path: target.path, name: 'e2e-publish-test.mp4', size: bytes.length, type: 'video/mp4' }],
    createJobs: true,
  }),
});
const finTxt = await finRes.text();
let fin;
try { fin = JSON.parse(finTxt); } catch { fin = null; }
console.log('3) finalize status=' + finRes.status,
  fin?.mediaItems?.[0]?.id
    ? 'OK media=' + fin.mediaItems[0].id + ' jobs=' + fin.jobsCreated
    : finTxt.slice(0, 300));
if (!fin?.mediaItems?.[0]?.id) process.exit(1);
const mediaId = fin.mediaItems[0].id;

// 3b) content (antes fallaba 500)
const cRes = await fetch(BASE + '/api/content');
console.log('3b) content status=' + cRes.status, cRes.ok ? 'OK' : 'FALLO');

// 4) publicar con la cuenta de YouTube REAL
const accRes = await fetch(BASE + '/api/accounts');
const accTxt = await accRes.text();
let accounts = [];
try { const ab = JSON.parse(accTxt); accounts = Array.isArray(ab) ? ab : ab.accounts ?? []; } catch {}
console.log('4) accounts status=' + accRes.status, 'n=' + accounts.length,
  accounts.map((a) => a.provider + ':' + (a.username ?? '')).join(', '));
const yt = accounts.find((a) => a.provider === 'youtube');
if (!yt) { console.log('   sin cuenta youtube — abort'); process.exit(1); }

const pubRes = await fetch(BASE + '/api/publications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ media_ids: [mediaId], account_ids: [yt.id] }),
});
const pubTxt = await pubRes.text();
console.log('4b) POST publications status=' + pubRes.status, pubTxt.slice(0, 300));
let pub;
try { pub = JSON.parse(pubTxt); } catch {}
if (!pub?.publication_id) process.exit(1);

// 5) cron processQueue
const cronRes = await fetch(BASE + '/api/cron/processQueue', { method: 'POST' });
const cronTxt = await cronRes.text();
console.log('5) cron status=' + cronRes.status, cronTxt.slice(0, 300));

// 6) jobs de la publicación
const jobsRes = await fetch(BASE + '/api/publications/' + pub.publication_id + '/jobs');
const jobsTxt = await jobsRes.text();
console.log('6) jobs status=' + jobsRes.status, jobsTxt.slice(0, 500));

// 7) historial publications (antes 401)
const hRes = await fetch(BASE + '/api/publications');
console.log('7) GET publications status=' + hRes.status, hRes.ok ? 'OK' : 'FALLO');
