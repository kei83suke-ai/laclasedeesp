// Convert an extracted new-format workbook into the existing static app schema.
// No translation or conjugation is generated here; values come from the workbook.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const [input, baseline, output, releaseDate = '2026-10-13'] = process.argv.slice(2);
if (!input || !baseline || !output) throw new Error('Usage: node tools/build_dictionary.mjs workbook.json baseline-data.js-or-app-folder output-folder [YYYY-MM-DD]');
const workbook = JSON.parse(fs.readFileSync(input, 'utf8'));
const originalContext = {};
if (fs.statSync(baseline).isDirectory()) {
  const html = fs.readFileSync(path.join(baseline, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(js\/(?:data\.js|dictionary\/[^"/]+\.js))"><\/script>/g)].map(m => m[1]);
  if (!scripts.length) throw new Error('No dictionary scripts in baseline');
  for (const file of scripts) vm.runInNewContext(fs.readFileSync(path.join(baseline, file), 'utf8'), originalContext, { timeout: 10000 });
} else vm.runInNewContext(fs.readFileSync(baseline, 'utf8'), originalContext, { timeout: 10000 });
vm.runInNewContext('globalThis.result = { db, genresInfo, auditManifest };', originalContext);
const original = JSON.parse(JSON.stringify(originalContext.result));
const originalWords = Object.values(original.db).flat();
const byId = new Map(originalWords.map(w => [w.id, w]));
const sheets = workbook.sheets;
const expectedHeaders = {
  '単語マスター': ['品詞', 'スペイン語', '英語訳', '日本語訳', 'ジャンル', 'CEFR', 'ID'],
  '動詞': ['品詞', 'スペイン語', '英語訳', '日本語訳', 'ジャンル', 'CEFR', 'ID'],
  '活用表': ['動詞ID', '動詞', '日本語', '動詞タイプ', 'カテゴリ', '時制・法／非人称形', '人称・形の種類', '活用形', '監査状態', '手動確認']
};
for (const [name, headers] of Object.entries(expectedHeaders)) {
  if (!sheets[name] || headers.some((h, i) => h !== sheets[name].headers[i])) throw new Error(`Unexpected headers: ${name}`);
}
const text = value => value == null ? '' : String(value);
const lines = value => text(value).split(/\n/).map(s => s.trim()).filter(Boolean);
const unique = values => [...new Set(values.filter(Boolean))];
const js = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const db = { nouns: [], verbs: [], adjectives: [], adverbs: [], prepositions: [] };
const words = new Map();
const spellings = new Set();
const statusCounts = {};
const translateStatus = (state, review) => {
  if (state === '英語語義から機械翻訳（要確認）') return 'machine_unreviewed';
  if (review.includes('要確認:')) return 'translation_review_required';
  if (state === '英語語義に基づく日本語訳（AI照合）') return 'ai_reviewed';
  if (state === '辞書訳参照・語義対照未完了') return 'dictionary_reference';
  if (state === '既存訳参照・未照合') return 'existing_unreviewed';
  if (['主要語義の英日訳を部分照合', '主要語義を部分照合'].includes(state)) return 'reviewed_core_senses';
  throw new Error(`Unmapped translation status: ${state}`);
};
const genreFor = parts => parts.includes('動詞') ? 'verbs' : parts.includes('名詞') ? 'nouns' : parts.includes('形容詞') ? 'adjectives' : parts.includes('副詞') ? 'adverbs' : 'prepositions';
for (const r of sheets['単語マスター'].rows) {
  const [pos, es, en, ja, category, cefr, id] = r.map(text);
  if (!id || !es || !en.trim() || !ja.trim()) throw new Error(`Missing required word field: ${id || es}`);
  if (words.has(id) || spellings.has(es.normalize('NFC').toLowerCase())) throw new Error(`Duplicate word: ${id} ${es}`);
  if (/\s/.test(es)) throw new Error(`Multiword expression requires review: ${es}`);
  const parts = pos.split('／').map(p => p.trim()).filter(Boolean);
  if (!parts.length || parts.some(p => ['フレーズ', '表現'].includes(p))) throw new Error(`Unsupported part of speech: ${es}`);
  const prior = byId.get(id);
  if (prior && prior.es !== es) throw new Error(`Headword changed under existing ID: ${id}`);
  const genre = genreFor(parts);
  const categories = category ? category.split(' ／ ').filter(Boolean) : ['未分類'];
  const legacyIds = unique([...(prior?.legacyIds || []), ...lines(r[7]), ...lines(r[8]),
    prior && `legacy:${prior.genre}::${prior.category || 'その他'}::${prior.es}::${prior.ja}`,
    `legacy:${genre}::${categories.join(' ／ ')}::${es}::${ja}`]);
  const status = translateStatus(text(r[10]), text(r[11]));
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  const word = {
    ...(prior || {}), id, legacyIds, es, canonicalEs: es, en, ja, genre,
    partOfSpeech: { nouns: 'noun', verbs: 'verb', adjectives: 'adjective', adverbs: 'adverb', prepositions: 'other' }[genre],
    partsOfSpeech: parts, category: categories.join(' ／ '), categories,
    cefrLevel: cefr || null, cefrStatus: cefr ? (prior?.cefrStatus || 'source_reference') : 'unmatched',
    translationStatus: status, translationSourceStatus: text(r[10]), reviewStatus: text(r[11]),
    frequency: r[13], sourceIds: lines(r[7]), sourceUrls: lines(r[9]), license: text(r[14]),
    displayEnglish: prior?.en === en ? (prior.displayEnglish || en) : en,
    translatedPartsOfSpeech: prior?.ja === ja && prior.translatedPartsOfSpeech
      ? prior.translatedPartsOfSpeech
      : unique([...ja.matchAll(/\[([^\]]+)\]/g)].flatMap(m => m[1].split(/[・／/]/)).filter(p => parts.includes(p)))
  };
  delete word.examples;
  if (genre === 'verbs') {
    Object.assign(word, { verbType: 'single', baseVerb: prior?.baseVerb || es.replace(/se$/, ''), isReflexive: es.endsWith('se'), conjugations: {}, conjugationStatus: 'not_added', conjugationSources: [], conjugationNotes: [] });
    delete word.conjugationAudit;
  }
  db[genre].push(word); words.set(id, word); spellings.add(es.normalize('NFC').toLowerCase());
}
const absentIds = originalWords.filter(w => !words.has(w.id)).map(w => w.id);
if (absentIds.length) throw new Error(`Existing IDs missing (${absentIds.length}); resolve history migration before importing`);
const verbRows = sheets['動詞'].rows;
if (verbRows.length !== db.verbs.length || new Set(verbRows.map(r => r[6])).size !== verbRows.length) throw new Error('Verb index count mismatch');
for (const row of verbRows) {
  if (words.get(row[6])?.genre !== 'verbs' || words.get(row[6]).es !== row[1]) throw new Error(`Verb ID mismatch: ${row[6]}`);
}
const personKeys = { yo: 'yo', 'tú': 'tu', 'él/ella/usted': 'el/ella', 'nosotros/nosotras': 'nosotros', 'ellos/ellas/ustedes': 'ellos', usted: 'usted', ustedes: 'ustedes', 'tú（否定命令）': 'negativoTu', '過去分詞（participio）': 'yo', '動名詞（gerundio）': 'tu' };
const tenseNames = ['現在形 (Presente)', '点過去 (Indefinido)', '線過去 (Imperfecto)', '未来形 (Futuro)', '条件法 (Condicional)', '接続法現在 (Subjuntivo)', '命令形 (Imperativo)', '非人称形 (Formas no personales)'];
const formsBySlot = new Map();
for (const row of sheets['活用表'].rows) {
  const [id, lemma, , type, , tense, person, form, state] = row.map(text);
  const verb = words.get(id);
  if (!verb || verb.genre !== 'verbs' || verb.es !== lemma) throw new Error(`Orphan/mismatched conjugation: ${id}`);
  if (!['single', 'reflexive'].includes(type) || !tenseNames.includes(tense) || !personKeys[person]) throw new Error(`Unknown conjugation slot: ${lemma} ${tense} ${person}`);
  if (!form || /^[-—]$/.test(form) || /[<>"'\r\n]/.test(form)) throw new Error(`Invalid conjugation: ${lemma} ${form}`);
  const slot = `${id}\t${tense}\t${person}`;
  if (formsBySlot.has(slot)) throw new Error(`Duplicate conjugation slot: ${slot}`);
  formsBySlot.set(slot, form);
  const targetTense = tense === '非人称形 (Formas no personales)' ? '現在・過去分詞' : tense;
  verb.conjugations[targetTense] ||= {};
  if (verb.conjugations[targetTense][personKeys[person]]) throw new Error(`Colliding conjugation field: ${slot}`);
  verb.conjugations[targetTense][personKeys[person]] = form;
  if (type === 'reflexive') verb.isReflexive = true;
  verb.conjugationNotes = unique([...verb.conjugationNotes, state]);
  verb.conjugationStatus = 'workbook_registered_not_fully_rae_audited';
}
for (const row of sheets['活用照合']?.rows || []) {
  const verb = words.get(row[0]);
  if (verb?.genre !== 'verbs') continue;
  verb.conjugationSources = unique([...verb.conjugationSources, ...lines(row[8])]);
  verb.conjugationNotes = unique([...verb.conjugationNotes, text(row[7])]);
}
const formCount = db.verbs.reduce((sum, v) => sum + Object.values(v.conjugations).reduce((n, f) => n + Object.keys(f).length, 0), 0);
if (formCount !== sheets['活用表'].rows.length) throw new Error('Conjugation count mismatch');
const manifest = {
  ...original.auditManifest, schemaVersion: 3, updatedAt: releaseDate,
  importSource: { filename: workbook.sourceName, sha256: workbook.sha256, originalWorkbookModified: false },
  headwordCount: words.size,
  verbCounts: { total: db.verbs.length, withConjugations: db.verbs.filter(v => Object.keys(v.conjugations).length).length, withoutConjugations: db.verbs.filter(v => !Object.keys(v.conjugations).length).length, orphanActiveConjugationRows: 0 },
  translationAudit: { withJapanese: words.size, missingJapanese: 0, statuses: statusCounts, allSensesAudited: false },
  conjugationAudit: { total: formCount, allRaeAudited: false, generatedForms: 0, source: 'Excel 活用表; ID and tense/person exact mapping', unregistered: db.verbs.filter(v => !Object.keys(v.conjugations).length).map(v => v.es), partialUnverified: [{ word: 'culiar', withheldSlots: 12 }] }
};
// Historical cleanup counts in the old manifest remain historical, not current totals.
const index = { single: db.verbs.map(v => v.id), phrase: [] };
const directory = path.join(output, 'js/dictionary');
fs.mkdirSync(directory, { recursive: true });
fs.mkdirSync(path.join(output, 'data'), { recursive: true });
const chunks = [];
for (const [genre, entries] of Object.entries(db)) {
  for (let offset = 0; offset < entries.length; offset += 1000) {
    const relative = `js/dictionary/${genre}-${String(Math.floor(offset / 1000) + 1).padStart(3, '0')}.js`;
    const content = '// Generated from the new-format workbook. Do not edit individual entries here.\n' + `db.${genre}.push(...` + js(entries.slice(offset, offset + 1000)) + ');\n';
    if (Buffer.byteLength(content) > 5 * 1024 * 1024) throw new Error(`Dictionary chunk too large: ${relative}`);
    fs.writeFileSync(path.join(output, relative), content);
    chunks.push({ path: relative, bytes: Buffer.byteLength(content), sha256: crypto.createHash('sha256').update(content).digest('hex') });
  }
}
manifest.dictionaryFiles = chunks;
const data = '// Generated from the cleaned Google Sheet snapshot exported as Excel. Do not regenerate from the original Excel.\n'
  + `const db = ${js(Object.fromEntries(Object.keys(db).map(g => [g, []])))};\n`
  + `const verbIndex = ${js(index)};\nconst auditManifest = ${js(manifest)};\nconst genresInfo = ${js(original.genresInfo)};\n`;
fs.writeFileSync(path.join(output, 'js/data.js'), data);
fs.writeFileSync(path.join(output, 'data/audit_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
let html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
html = html.replace(/\s*<script src="js\/dictionary\/[^"/]+\.js"><\/script>/g, '');
if (!html.includes('<script src="js/data.js"></script>')) throw new Error('Missing dictionary script anchor');
html = html.replace('<script src="js/data.js"></script>', '<script src="js/data.js"></script>\n' + chunks.map(c => `  <script src="${c.path}"></script>`).join('\n'));
fs.writeFileSync(path.join(output, 'index.html'), html);
let sw = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
const releaseHash = crypto.createHash('sha256').update(data).update(html);
for (const file of ['js/app.js', 'js/learning.js', 'css/style.css']) releaseHash.update(fs.readFileSync(path.join(output, file)));
const version = releaseHash.digest('hex').slice(0, 12);
sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'spanish-classroom-${releaseDate}-${version}';`);
sw = sw.replace(/const APP_ASSETS = \[[\s\S]*?\];/, `const APP_ASSETS = ${JSON.stringify(['./', './index.html', './css/style.css', './js/data.js', ...chunks.map(c => './' + c.path), './js/learning.js', './js/app.js'], null, 2)};`);
fs.writeFileSync(path.join(output, 'sw.js'), sw);
const report = { date: releaseDate, source: manifest.importSource, headwords: words.size, translated: words.size, verbs: manifest.verbCounts, forms: formCount, translationStatuses: statusCounts, generatedForms: 0, stableIdsPreserved: originalWords.length, retainedAliases: originalWords.every(w => (w.legacyIds || []).every(id => words.get(w.id).legacyIds.includes(id))), chunks: chunks.length, largestFileBytes: Math.max(Buffer.byteLength(data), ...chunks.map(c => c.bytes)), fullLinguisticAudit: false, githubUploaded: false };
fs.writeFileSync(path.join(output, 'data/import-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
