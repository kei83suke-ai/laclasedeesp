const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const scriptFiles = ['js/data.js', 'js/learning.js', 'js/app.js'];
scriptFiles.forEach(file => {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
});

const dataContext = {};
vm.runInNewContext(
  `${fs.readFileSync('js/data.js', 'utf8')};globalThis.__result = { db, genresInfo };`,
  dataContext
);
const { db, genresInfo } = dataContext.__result;
const allWords = Object.values(db).flat();

assert.strictEqual(db.phrases.length, 400, 'フレーズ400件が取り込まれている');
assert.strictEqual(db.verbs.length, 438, '動詞438件が保持されている');
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
const learningContext = {
  window: {},
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
