const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const scriptFiles = ['js/data.js', 'js/learning.js', 'js/app.js'];
scriptFiles.forEach(file => {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
});

const dataContext = {};
vm.runInNewContext(
  `${fs.readFileSync('js/data.js', 'utf8')};globalThis.__result = { db, genresInfo, verbIndex, auditManifest };`,
  dataContext
);
const { db, genresInfo, verbIndex, auditManifest } = dataContext.__result;
const allWords = Object.values(db).flat();

assert.strictEqual(db.nouns.length, 1170, '完全重複した名詞2件が統合されている');
assert.strictEqual(db.prepositions.length, 155, 'アクセント違いの語（cuando/cuándo等）は別語として保持されている');
assert.strictEqual(db.phrases.length, 400, 'フレーズ400件が取り込まれている');
assert.strictEqual(db.verbs.length, 438, '動詞438件が保持されている');
assert.strictEqual(new Set(allWords.map(word => word.id)).size, allWords.length, '安定IDが全件一意');
assert.strictEqual(verbIndex.single.length + verbIndex.phrase.length, 438, '単独動詞と動詞フレーズで438件を網羅');
const verbById = new Map(db.verbs.map(verb => [verb.id, verb]));
assert.ok([...verbIndex.single, ...verbIndex.phrase].every(id => verbById.has(id)), '活用表インデックスが全動詞レコードを参照');
assert.strictEqual(db.verbs.filter(verb => verb.verbType === 'single').length, 334, '単独動詞の件数');
assert.strictEqual(db.verbs.filter(verb => verb.verbType === 'phrase').length, 104, '動詞フレーズの件数');
const requestedTenses = [
  '現在形 (Presente)', '点過去 (Indefinido)', '線過去 (Imperfecto)',
  '未来形 (Futuro)', '条件法 (Condicional)', '接続法現在 (Subjuntivo)',
  '命令形 (Imperativo)', '現在・過去分詞'
];
assert.ok(db.verbs.every(verb => requestedTenses.every(tense => verb.conjugations[tense])), '全438動詞に必要時制がある');
assert.strictEqual(auditManifest.verbCounts.orphanActiveConjugationRows, 5, '活用表の孤立行を監査できている');
assert.strictEqual(auditManifest.duplicateGroups.length, 2, '重複統合の監査記録がある');
assert.strictEqual(
  db.verbs.filter(verb => verb.conjugations['現在完了 (Pretérito Perfecto)']).length,
  0,
  '現在完了は表示用データから削除されている'
);
assert.strictEqual(
  db.verbs.filter(verb => verb.conjugations['条件法 (Condicional)']).length,
  438,
  '全動詞に条件法がある'
);
const conditional = Object.fromEntries(
  db.verbs.map(verb => [verb.es, verb.conjugations['条件法 (Condicional)']])
);
assert.strictEqual(conditional.comer.yo, 'comería', '規則動詞の条件法');
assert.strictEqual(conditional.tener.yo, 'tendría', '不規則動詞の条件法');
assert.strictEqual(conditional['hacer ejercicio'].yo, 'haría ejercicio', '動詞フレーズの条件法');
assert.strictEqual(conditional['sentirse bien'].yo, 'me sentiría bien', '再帰動詞フレーズの条件法');
assert.strictEqual(genresInfo.length, 6, '6ジャンルが定義されている');
assert.ok(allWords.every(word => word.id && word.examples && word.usageScenes), '共通データ項目がある');

const localStore = new Map();
const migrationTarget = db.verbs.find(verb => verb.canonicalEs === 'hablar');
const legacyStateKey = `legacy:verbs::${migrationTarget.category}::${migrationTarget.es}::${migrationTarget.ja}`;
localStore.set('es_learning_states_v1', JSON.stringify({
  [legacyStateKey]: { wordId: legacyStateKey, repetitions: 2, interval: 7, ease: 2.5 }
}));
const learningContext = {
  window: {},
  db,
  localStorage: {
    getItem: key => localStore.get(key) || null,
    setItem: (key, value) => localStore.set(key, value),
    removeItem: key => localStore.delete(key)
  },
  console,
  Date,
  Math
};
vm.runInNewContext(fs.readFileSync('js/learning.js', 'utf8'), learningContext);

const migrated = learningContext.window.LearningStore.get(migrationTarget, 'verbs');
assert.strictEqual(migrated.wordId, migrationTarget.id, '旧形式の学習状態が安定IDへ移行される');
assert.strictEqual(migrated.interval, 7, '旧形式の復習間隔を保持');

const indexHtml = fs.readFileSync('index.html', 'utf8');
assert.ok(!indexHtml.includes('fonts.googleapis.com'), '外部フォントに依存しない');
assert.ok(fs.existsSync('sw.js'), 'オフラインキャッシュ用Service Workerがある');

const word = {
  id: 'verbs:test:hablar',
  genre: 'verbs',
  category: '会話・コミュニケーション',
  es: 'hablar',
  ja: '話す',
  en: 'to speak'
};
const failed = learningContext.window.LearningStore.recordAnswer(word, 'verbs', false, 'test');
const firstCorrect = learningContext.window.LearningStore.recordAnswer(word, 'verbs', true, 'test');
const secondCorrect = learningContext.window.LearningStore.recordAnswer(word, 'verbs', true, 'test');

assert.strictEqual(Math.round((failed.dueAt - Date.now()) / 60000), 10, '不正解は10分後に再出題');
assert.strictEqual(firstCorrect.interval, 1, '初回正解は1日後');
assert.strictEqual(secondCorrect.interval, 3, '2回連続正解は3日後');
assert.strictEqual(learningContext.window.WordIdentity.matchesAnswer('Hablár', 'hablar'), true, 'アクセント差を許容');

console.log('All tests passed.');
