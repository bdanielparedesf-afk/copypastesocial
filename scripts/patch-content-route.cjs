const fs = require('fs');
const p = 'src/app/api/content/route.ts';
let s = fs.readFileSync(p, 'utf8');
const oldS = [
  "    if (queryResult.error && /ai_generated/i.test(queryResult.error.message ?? '')) {",
  '      queryResult = await db',
  "        .from('media_items')",
  '        .select(`${baseColumns}, ${embed}`)',
  "        .eq('sources.user_id', userId)",
  "        .order('created_at', { ascending: false })",
  '        .limit(500);',
  '    }',
].join('\r\n');
const newS = [
  "    if (queryResult.error && /ai_generated/i.test(queryResult.error.message ?? '')) {",
  '      const fallback = await db',
  "        .from('media_items')",
  '        .select(`${baseColumns}, ${embed}`)',
  "        .eq('sources.user_id', userId)",
  "        .order('created_at', { ascending: false })",
  '        .limit(500);',
  '      queryResult = fallback as typeof queryResult;',
  '    }',
].join('\r\n');
if (s.includes(oldS)) {
  fs.writeFileSync(p, s.replace(oldS, newS));
  console.log('OK CRLF');
} else if (s.includes(oldS.replace(/\r\n/g, '\n'))) {
  fs.writeFileSync(p, s.replace(oldS.replace(/\r\n/g, '\n'), newS.replace(/\r\n/g, '\n')));
  console.log('OK LF');
} else {
  console.log('NO MATCH');
}