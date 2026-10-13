const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const dictionaryFiles = [...indexHtml.matchAll(/<script src="(js\/(?:data\.js|dictionary\/[^"/]+\.js))"><\/script>/g)].map(m => m[1]);
assert.ok(dictionaryFiles.length > 1, '分割した辞書をHTMLから読み込む');
const scriptFiles = [...dictionaryFiles, 'js/learning.js', 'js/app.js'];
scriptFiles.forEach(file => {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
});

const dataContext = {};
vm.runInNewContext(
  `${dictionaryFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')};globalThis.__result = { db, genresInfo, verbIndex, auditManifest };`,
  dataContext
);
const { db, genresInfo, verbIndex, auditManifest } = dataContext.__result;
const allWords = Object.values(db).flat();

assert.strictEqual(allWords.length, 29813, '整理後の全見出し語を収録');
assert.strictEqual(db.phrases, undefined, 'フレーズを登録から除外');
assert.strictEqual(db.verbs.length, 2972, '単独動詞を収録');
assert.strictEqual(new Set(allWords.map(word => word.es.normalize('NFC').toLowerCase())).size, allWords.length, '見出し語の重複なし');
assert.ok(allWords.every(word => !/\s/.test(word.es) && word.en), '複数語表現なし・英語訳あり');
assert.strictEqual(allWords.filter(word => word.ja).length, 29813, '全見出しに日本語訳');
assert.ok(allWords.find(word => word.es === 'producto').ja.includes('積'), 'productoの数学語義は積');
assert.ok(!allWords.find(word => word.es === 'producto').en.includes('remainder'), '元資料の余りという誤訳を使わない');
assert.ok(allWords.find(word => word.es === 'régimen').ja.includes('食事'), 'régimenの食事関連語義');
assert.ok(allWords.find(word => word.es === 'señora').en.includes('Ms/Mrs'), '敬称を既婚女性だけに限定しない');
assert.ok(allWords.find(word => word.es === 'oposición').ja.includes('通常は複数形'), '複数形専用とはしない');
assert.ok(allWords.every(word => !word.partsOfSpeech.some(p => ['フレーズ','表現'].includes(p))), '1語の定型表現も除外');
assert.ok(!allWords.some(word => ['Entiendo','Cuídate','Perdone','Perdona','veremos','sepa'].includes(word.es)), '活用済みの定型表現は登録しない');
assert.ok(allWords.some(word => word.es === 'ano') && allWords.some(word => word.es === 'año'), 'アクセント・ñを区別');
assert.strictEqual(new Set(allWords.map(word => word.id)).size, allWords.length, '安定IDが全件一意');
assert.strictEqual(verbIndex.single.length, 2972, '活用インデックスが単独動詞を網羅');
assert.strictEqual(verbIndex.phrase.length, 0, '動詞フレーズの登録なし');
const verbById = new Map(db.verbs.map(verb => [verb.id, verb]));
assert.ok([...verbIndex.single, ...verbIndex.phrase].every(id => verbById.has(id)), '活用表インデックスが全動詞レコードを参照');
assert.strictEqual(db.verbs.filter(verb => verb.verbType === 'single').length, 2972, '単独動詞の件数');
assert.strictEqual(db.verbs.filter(verb => verb.verbType === 'phrase').length, 0, '動詞フレーズの件数');
const requestedTenses = [
  '現在形 (Presente)', '点過去 (Indefinido)', '線過去 (Imperfecto)',
  '未来形 (Futuro)', '条件法 (Condicional)', '接続法現在 (Subjuntivo)',
  '命令形 (Imperativo)', '現在・過去分詞'
];
const conjugated = db.verbs.filter(verb => Object.keys(verb.conjugations).length);
assert.strictEqual(conjugated.length, 2971, 'Excelに登録された活用を収録');
assert.ok(conjugated.every(verb => ['soler', 'acontecer', 'cilampear', 'munir'].includes(verb.es) || requestedTenses.every(tense => verb.conjugations[tense])), '欠如・非人称・部分登録を除く必要時制');
assert.strictEqual(db.verbs.find(v => v.es === 'soler').conjugations['未来形 (Futuro)'], undefined, '未使用の形を推測で追加しない');
assert.strictEqual(auditManifest.verbCounts.orphanActiveConjugationRows, 0, '孤立した活用なし');
assert.strictEqual(conjugated.flatMap(v => Object.values(v.conjugations).flatMap(Object.values)).length, 109812, '実際の活用形数');
assert.ok(db.verbs.every(v => /(ar|er|ir|ír)(se)?$/.test(v.es)), '動詞一覧には原形のみを登録');
assert.ok(!allWords.some(w => w.es === 'había'), '活用済み表記を別単語として登録しない');
assert.ok(allWords.find(w => w.es === 'persona').partsOfSpeech.includes('名詞'), '独立した名詞は保持');
assert.ok(!allWords.find(w => w.es === 'persona').partsOfSpeech.includes('動詞'), '名詞と同形の活用形は動詞から除外');
assert.ok(allWords.find(w => w.es === 'mi').ja.includes('私の'), '基本語の主要語義を復元');
assert.strictEqual(db.verbs.find(v => v.es === 'abandonar').conjugations['条件法 (Condicional)'].yo, 'abandonaría');
assert.strictEqual(db.verbs.find(v => v.es === 'abolir').conjugations['現在形 (Presente)'].yo, 'abolo', 'Excelで照合したabolirの活用');
assert.strictEqual(
  db.verbs.filter(verb => verb.conjugations['現在完了 (Pretérito Perfecto)']).length,
  0,
  '現在完了は表示用データから削除されている'
);
assert.strictEqual(
  db.verbs.filter(verb => verb.conjugations['条件法 (Condicional)']).length,
  2969,
  'soler・munir・tarを除く動詞の条件法'
);
const conditional = Object.fromEntries(
  db.verbs.map(verb => [verb.es, verb.conjugations['条件法 (Condicional)']])
);
assert.strictEqual(conditional.comer.yo, 'comería', '規則動詞の条件法');
assert.strictEqual(conditional.tener.yo, 'tendría', '不規則動詞の条件法');
assert.strictEqual(conditional['hacer ejercicio'], undefined, '動詞フレーズは非登録');
assert.strictEqual(db.verbs.find(v => v.es === 'caerse').conjugations['命令形 (Imperativo)'].usted, 'cáigase');
assert.strictEqual(db.verbs.find(v => v.es === 'freír').conjugations['点過去 (Indefinido)']['el/ella'], 'frio');
assert.strictEqual(db.verbs.find(v => v.es === 'despertarse').conjugations['現在形 (Presente)'].yo, 'me despierto');
assert.strictEqual(genresInfo.length, 5, 'フレーズ以外の品詞グループ');
assert.ok(allWords.every(word => word.id && !('examples' in word) && word.partsOfSpeech.length), '例文なし・品詞あり');

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
assert.ok(localStore.has('es_dictionary_migration_backup_v2'), 'ID移行前のバックアップ');

const appContext = { ...learningContext, ...learningContext.window, document: { addEventListener() {} } };
vm.runInNewContext(fs.readFileSync('js/app.js', 'utf8'), appContext);
assert.strictEqual(appContext.getAllLearningWords().length, 29813);
assert.ok(appContext.getQuizWords('All').length > 2271, '照合した日本語訳をクイズに追加');
assert.ok(appContext.getQuizWords('All').every(w => !['machine_unreviewed', 'translation_review_required', 'dictionary_reference'].includes(w.translationStatus)), '未監査・要確認の新規訳を出題しない');
assert.ok(appContext.getQuizWords('verbs').some(word => word.es === 'realizar'), '訳語を補完した動詞を出題できる');
for (const genre of genresInfo) {
  const list = appContext.getWordsForGenre(genre.id);
  assert.strictEqual(new Set(list.map(w => w.id)).size, list.length);
  assert.ok(appContext.getQuizWords(genre.id).every(w => w.ja && w.translationStatus !== 'dictionary_reference'));
}
assert.ok(!appContext.getQuizWords('nouns').some(w => w.es === 'ser'), '動詞の訳を名詞クイズに流用しない');
assert.strictEqual(appContext.resolveStoredWords([{ id: 'verbs:hablar', es: 'hablar', genre: 'verbs' }])[0].id, migrationTarget.id);
assert.strictEqual(appContext.resolveStoredWords([{ id: 'removed-phrase', es: 'hacer ejercicio', genre: 'verbs' }]).length, 0);

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
