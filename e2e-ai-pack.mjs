/**
 * E2E — IA pack (título + descripción + hashtags) subiendo videos reales.
 *
 *   0. Video de prueba (descarga una vez, reusa) + imagen JPEG de contenido
 *      conocido (Wikipedia REST summary de "Pizza") para simular los frames
 *      que el navegador capturará del video.
 *   1. upload-url → PUT binario al bucket raw (video REAL).
 *   2. finalize-upload provider='local' con nombre POCO informativo
 *      (VID_20260915_142030.mp4) — como un video grabado con el celular.
 *   3. POST /api/ai/generate action='pack' SIN frames (comportamiento actual).
 *   4. POST /api/ai/generate action='pack' CON frames (fix multimodal).
 *   5. Cleanup: storage raw + media_items + publication_jobs + publications + source.
 *
 * Ejecutar: node e2e-ai-pack.mjs  (requiere dev server en :3100 y .env)
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
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';

// 0) Video de prueba (real, reproducible)
const VIDEO = 'e2e-video.mp4';
if (!fs.existsSync(VIDEO) || fs.statSync(VIDEO).size < 10000) {
  const urls = [
    'https://www.w3schools.com/html/mov_bbb.mp4',
    'https://download.samplelib.com/mp4/sample-5s.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
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

// 0b) Imagen JPEG de contenido CONOCIDO (pizza) — simula frames del video
async function fetchKnownJpeg() {
  const topics = ['Pizza', 'Sushi', 'Cat'];
  for (const t of topics) {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${t}`);
      if (!r.ok) continue;
      const j = await r.json();
      const src = j?.originalimage?.source ?? j?.thumbnail?.source;
      if (!src) continue;
      const img = await fetch(src, { headers: { 'User-Agent': 'e2e-ai-pack/1.0' } });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 3000) continue;
      const type = img.headers.get('content-type') ?? 'image/jpeg';
      const mime = type.startsWith('image/') ? type.split(';')[0] : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      // siguiente topic
    }
  }
  return null;
}
const knownFrame = await fetchKnownJpeg();
console.log('0b) Frame conocido (Wikipedia):', knownFrame ? `OK (${Math.round((knownFrame.length * 3) / 4 / 1024)} KB)` : 'NO disponible');

async function cleanup(sourceId, publicationId, mediaIds, storagePath) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (storagePath) await admin.storage.from('raw').remove([storagePath]);
    if (mediaIds.length > 0) {
      await admin.from('publication_jobs').delete().in('media_id', mediaIds);
      await admin.from('media_items').delete().in('id', mediaIds);
    }
    if (publicationId) await admin.from('publications').delete().eq('id', publicationId);
    if (sourceId) await admin.from('sources').delete().eq('id', sourceId);
    console.log('cleanup) filas de prueba eliminadas');
  } catch (e) {
    console.log('cleanup) aviso:', String(e).slice(0, 120));
  }
}

// 1) upload-url (nombre de celular, sin info del contenido)
const NAME = 'VID_20260915_142030.mp4';
const upRes = await fetch(BASE + '/api/media/upload-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: [{ name: NAME, size: bytes.length, type: 'video/mp4' }] }),
});
const up = await upRes.json();
console.log('1) upload-url status=' + upRes.status, up?.targets?.[0] ? 'OK' : JSON.stringify(up).slice(0, 300));
if (!up?.targets?.[0]?.signedUrl) process.exit(1);
const target = up.targets[0];

// 2) PUT del video REAL al bucket raw
const put = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes });
console.log('2) PUT storage status=' + put.status);
if (!put.ok) process.exit(1);

// 3) finalize-upload
const finRes = await fetch(BASE + '/api/media/finalize-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    files: [{ path: target.path, name: NAME, size: bytes.length, type: 'video/mp4' }],
    createJobs: false,
  }),
});
const fin = await finRes.json();
console.log('3) finalize status=' + finRes.status,
  fin?.mediaItems?.[0]?.id ? 'OK media=' + fin.mediaItems[0].id : JSON.stringify(fin).slice(0, 300));
if (!fin?.mediaItems?.[0]?.id) {
  await cleanup(null, null, [], target.path);
  process.exit(1);
}
const mediaId = fin.mediaItems[0].id;

async function pack(label, frames) {
  const res = await fetch(BASE + '/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaItemIds: [mediaId],
      action: 'pack',
      platform: 'instagram',
      context: NAME.replace(/\.[^.]+$/, '').replace(/[_\-\d]+/g, ' ').trim(),
      ...(frames ? { frames } : {}),
    }),
  });
  const body = await res.json();
  const p = body?.results?.[0]?.pack;
  console.log(`\n=== ${label} (status=${res.status}) ===`);
  if (!p) {
    console.log('   ERROR:', JSON.stringify(body).slice(0, 300));
    return null;
  }
  console.log('   title      :', p.title);
  console.log('   description:', p.description);
  console.log('   hashtags   :', Array.isArray(p.hashtags) ? p.hashtags.join(' ') : p.hashtags);
  return p;
}

// 4) Pack SIN frames — solo ve el nombre del archivo (comportamiento actual)
await pack('TEST A — SIN frames (solo nombre del archivo)');

// 5) Pack CON frames (multimodal) — lo que verá la IA tras el fix
const p2 = knownFrame
  ? await pack('TEST B — CON frames (visión del video)', [knownFrame, knownFrame, knownFrame])
  : null;

// 6) Verificación de coherencia (keywords del contenido conocido)
if (p2) {
  const hay = [p2.title, p2.description, ...(p2.hashtags ?? [])].join(' ').toLowerCase();
  const words = ['pizza', 'pizzer', 'italian', 'italia', 'comida', 'food', 'queso', 'mozzarella', 'slice', 'cocina', 'gastr'];
  const hit = words.some((w) => hay.includes(w));
  console.log('\nVERIFICACIÓN DE COHERENCIA (frames pizza):', hit ? 'COHERENTE OK' : 'NO COHERENTE FALLO');
} else {
  console.log('\nVERIFICACIÓN DE COHERENCIA: no se pudo probar (sin frames)');
}

// 7) Cleanup
await cleanup(fin.sourceId, fin.publicationId, [mediaId], target.path);


