// Optional source-level audit: node tools/verify_import.cjs extracted-workbook.json baseline-data.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const html = fs.readFileSync('index.html', 'utf8');
const files = [...html.matchAll(/<script src="(js\/(?:data\.js|dictionary\/[^"/]+\.js))"><\/script>/g)].map(m => m[1]);
const ctx = vm.createContext({});
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
const { db, auditManifest } = vm.runInContext('({db,auditManifest})', ctx);
const all = Object.values(db).flat();
const byId = new Map(all.map(w => [w.id, w]));
assert.equal(byId.size, 29813);
for (const chunk of auditManifest.dictionaryFiles) {
  const bytes = fs.readFileSync(chunk.path);
  assert.equal(bytes.length, chunk.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), chunk.sha256);
  assert.ok(bytes.length < 5 * 1024 * 1024);
}
const sw = fs.readFileSync('sw.js', 'utf8');
const assets = JSON.parse(sw.match(/const APP_ASSETS = (\[[\s\S]*?\]);/)[1]);
for (const file of files) assert.ok(assets.includes('./' + file), `Not cached: ${file}`);
for (const asset of assets.filter(s => s !== './')) assert.ok(fs.existsSync(asset));
const verbs = Object.fromEntries(db.verbs.map(v => [v.es, v]));
const nforms = v => Object.values(v.conjugations).reduce((n, f) => n + Object.keys(f).length, 0);
assert.equal(nforms(verbs.tar), 0);
assert.equal(nforms(verbs.culiar), 25);
assert.equal(verbs.culiar.conjugations['現在形 (Presente)'].yo, undefined);
assert.equal(nforms(verbs.munir), 1);
assert.equal(verbs.munir.conjugations['現在・過去分詞'].yo, 'munido');
assert.equal(nforms(verbs.acontecer), 14);
assert.equal(nforms(verbs.cilampear), 8);
assert.equal(verbs.arrepentir.conjugations['現在形 (Presente)'].yo, 'me arrepiento');
assert.equal(auditManifest.conjugationAudit.generatedForms, 0);
assert.equal(auditManifest.conjugationAudit.allRaeAudited, false);
if (process.argv[2]) {
  const wb = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(wb.sha256, auditManifest.importSource.sha256);
  for (const r of wb.sheets['単語マスター'].rows) {
    const w = byId.get(r[6]);
    assert.ok(w);
    assert.equal(w.es, r[1]); assert.equal(w.en, r[2]); assert.equal(w.ja, r[3]);
    assert.equal(w.cefrLevel, r[5] || null);
    assert.equal(w.partsOfSpeech.join('／'), r[0]);
    assert.equal(w.category, r[4] || '未分類');
    assert.equal(w.translationSourceStatus, r[10]);
    assert.equal(w.reviewStatus, r[11]);
  }
  const person = {yo:'yo','tú':'tu','él/ella/usted':'el/ella','nosotros/nosotras':'nosotros','ellos/ellas/ustedes':'ellos',usted:'usted',ustedes:'ustedes','tú（否定命令）':'negativoTu','過去分詞（participio）':'yo','動名詞（gerundio）':'tu'};
  let matched = 0;
  for (const r of wb.sheets['活用表'].rows) {
    const tense = r[5] === '非人称形 (Formas no personales)' ? '現在・過去分詞' : r[5];
    assert.equal(byId.get(r[0]).conjugations[tense][person[r[6]]], r[7], r.slice(0, 8).join(' | '));
    matched++;
  }
  assert.equal(db.verbs.reduce((n,v) => n + nforms(v), 0), matched);
  console.log(`Excel exact match: ${all.length} headwords, ${matched} conjugations`);
}
if (process.argv[3]) {
  const old = vm.runInNewContext(fs.readFileSync(process.argv[3], 'utf8') + ';Object.values(db).flat()');
  let retained = 0;
  for (const previous of old) {
    const current = byId.get(previous.id);
    assert.ok(current);
    for (const alias of previous.legacyIds || []) assert.ok(current.legacyIds.includes(alias));
    for (const [tense, forms] of Object.entries(previous.conjugations || {})) {
      for (const [person, form] of Object.entries(forms)) {
        assert.equal(current.conjugations[tense]?.[person], form);
        retained++;
      }
    }
  }
  console.log(`Preserved: ${old.length} stable IDs and all aliases; ${retained} existing conjugations`);
}
console.log('Import, partial conjugations, hashes and offline asset list: passed.');
