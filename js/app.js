// State management
const appState = {
  currentView: 'home',
  currentGenre: null,
  currentCategory: 'All',
  verbType: 'all',
  verbCardType: 'all',
  quizMode: null,
  currentPage: 1,
  itemsPerPage: 50,
  searchQuery: null,
  weakOnly: false,
  verbReturnPage: 1,
  verbReturnCat: 'All',
  
  navigate(view, genreId = null, quizMode = null, searchQuery = null, extraParams = {}) {
    let hash = `#${view}`;
    if (genreId) {
      hash += `/${genreId}`;
      if (quizMode) {
        hash += `/${quizMode}`;
      }
    }
    
    const queryParts = [];
    const cat = extraParams.cat !== undefined ? extraParams.cat : (view === 'flashcards' && this.currentGenre === genreId ? this.currentCategory : 'All');
    if (cat && cat !== 'All') {
      queryParts.push(`cat=${encodeURIComponent(cat)}`);
    }
    
    const page = extraParams.page !== undefined ? extraParams.page : (view === 'flashcards' && this.currentGenre === genreId ? this.currentPage : 1);
    if (page && page > 1) {
      queryParts.push(`page=${page}`);
    }
    
    if (searchQuery) {
      queryParts.push(`q=${encodeURIComponent(searchQuery)}`);
    }
    
    if (extraParams.weakOnly || (view === 'quiz' && genreId === 'weak')) {
      queryParts.push(`weak=1`);
    }
    
    if (queryParts.length > 0) {
      hash += `?${queryParts.join('&')}`;
    }
    
    if (location.hash === hash) {
      handleRouting();
    } else {
      location.hash = hash;
    }
  }
};

// Quiz History & LocalStorage Management
const QuizHistory = {
  get() {
    const history = AppStorage.getJSON('es_quiz_history', []);
    return Array.isArray(history) ? history : [];
  },
  save(history) {
    AppStorage.setJSON('es_quiz_history', history);
  },
  logAttempt(word, isCorrect, mode, genreOverride = null) {
    const genre = appState.currentGenre === 'weak'
      ? (word.genre || 'unknown')
      : (genreOverride || appState.currentGenre);
    const wordRecord = { ...word, genre };
    const wordId = WordIdentity.key(wordRecord, genre);
    const history = this.get();
    history.push({
      wordId,
      es: word.es,
      ja: word.ja,
      en: word.en,
      genre,
      category: word.category || 'その他',
      mode: mode,
      isCorrect: isCorrect,
      timestamp: Date.now()
    });
    if (history.length > 1000) history.shift();
    this.save(history);
    
    let weakWords = this.getWeakWords();
    if (isCorrect) {
      weakWords = weakWords.filter(w => !WordIdentity.same(w, wordRecord, genre));
    } else {
      if (!weakWords.some(w => WordIdentity.same(w, wordRecord, genre))) {
        weakWords.push({
          wordId,
          es: word.es,
          ja: word.ja,
          en: word.en,
          genre,
          category: word.category || 'その他'
        });
      }
    }
    this.saveWeakWords(weakWords);
    return LearningStore.recordAnswer(wordRecord, genre, isCorrect, mode);
  },
  getWeakWords() {
    const weakWords = AppStorage.getJSON('es_weak_words', []);
    return Array.isArray(weakWords) ? weakWords : [];
  },
  saveWeakWords(words) {
    AppStorage.setJSON('es_weak_words', words);
  },
  clear() {
    AppStorage.remove('es_quiz_history');
    AppStorage.remove('es_weak_words');
    LearningStore.clear();
    LearningEvents.clear();
  }
};

// Swipe Data Manager
const SwipeManager = {
  getMemorized() {
    const list = AppStorage.getJSON('es_memorized_words', []);
    return Array.isArray(list) ? list : [];
  },
  addMemorized(word) {
    const list = this.getMemorized();
    const wordId = WordIdentity.key(word, word.genre);
    if (!list.find(w => WordIdentity.same(w, word, word.genre))) {
      list.push({ ...word, wordId });
      AppStorage.setJSON('es_memorized_words', list);
    }
  },
  getReviewLater() {
    const list = AppStorage.getJSON('es_review_later', []);
    return Array.isArray(list) ? list : [];
  },
  addReviewLater(word) {
    const list = this.getReviewLater();
    const wordId = WordIdentity.key(word, word.genre);
    if (!list.find(w => WordIdentity.same(w, word, word.genre))) {
      list.push({ ...word, wordId });
      AppStorage.setJSON('es_review_later', list);
    }
  },
  removeReviewLater(wordOrId) {
    const list = this.getReviewLater();
    const targetId = typeof wordOrId === 'object'
      ? WordIdentity.key(wordOrId, wordOrId.genre)
      : String(wordOrId);
    const filtered = list.filter(word => {
      const currentId = WordIdentity.key(word, word.genre);
      return currentId !== targetId && word.es !== wordOrId
        && !(typeof wordOrId === 'object' && WordIdentity.same(word, wordOrId, wordOrId.genre));
    });
    AppStorage.setJSON('es_review_later', filtered);
  }
};

// Utilities
function createPaginationDOM(currentPage, totalPages, renderCallback) {
  const pageNav = document.createElement('div');
  pageNav.className = 'pagination';
  pageNav.innerHTML = `
    <button class="btn btn-sm btn-outline" ${currentPage === 1 ? 'disabled' : ''}>← 前</button>
    <span>ページ ${currentPage} / ${totalPages}</span>
    <button class="btn btn-sm btn-outline" ${currentPage === totalPages ? 'disabled' : ''}>次 →</button>
  `;
  const buttons = pageNav.querySelectorAll('button');
  buttons[0].onclick = () => {
    if (renderCallback) {
      appState.currentPage = currentPage - 1;
      renderCallback();
    } else {
      appState.navigate(appState.currentView, appState.currentGenre, appState.quizMode, appState.searchQuery, {
        cat: appState.currentCategory,
        page: currentPage - 1,
        weakOnly: appState.weakOnly
      });
    }
  };
  buttons[1].onclick = () => {
    if (renderCallback) {
      appState.currentPage = currentPage + 1;
      renderCallback();
    } else {
      appState.navigate(appState.currentView, appState.currentGenre, appState.quizMode, appState.searchQuery, {
        cat: appState.currentCategory,
        page: currentPage + 1,
        weakOnly: appState.weakOnly
      });
    }
  };
  return pageNav;
}

function formatSpanishAudioText(text) {
  let clean = text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
  if (!clean.includes('/')) return clean;

  // Space cleanup around slashes
  clean = clean.replace(/\s*\/\s*/g, '/');

  const words = clean.split(' ');
  let sentenceM = [];
  let sentenceF = [];

  for (let w of words) {
    if (w.includes('/')) {
      const parts = w.split('/');
      const first = parts[0];
      const second = parts[1] || '';

      if (first === 'el' && second === 'la') {
        sentenceM.push('el');
        sentenceF.push('la');
      } else if (first === 'un' && second === 'una') {
        sentenceM.push('un');
        sentenceF.push('una');
      } else if (first === 'los' && second === 'las') {
        sentenceM.push('los');
        sentenceF.push('las');
      } else if (second.length === 1) {
        if (first.endsWith('o')) {
          sentenceM.push(first);
          sentenceF.push(first.slice(0, -1) + second);
        } else if (first.endsWith('os')) {
          sentenceM.push(first);
          sentenceF.push(first.slice(0, -2) + second);
        } else {
          sentenceM.push(first);
          sentenceF.push(first);
        }
      } else {
        sentenceM.push(first);
        sentenceF.push(second);
      }
    } else {
      sentenceM.push(w);
      sentenceF.push(w);
    }
  }

  const mStr = sentenceM.join(' ');
  const fStr = sentenceF.join(' ');

  if (mStr === fStr) return mStr;
  return `${mStr} ${fStr}`;
}

// ブラウザ標準の音声合成を使う。外部TTSへの依存を増やさず、ラテンアメリカ向け音声を優先する。
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.lang = 'es-419';
  window.speechSynthesis.speak(utterance);
  audioUnlocked = true;
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('click', unlockAudio);
}
document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
document.addEventListener('click', unlockAudio, { once: true, passive: true });

window.playAudio = function(text) {
  if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  const cleanText = formatSpanishAudioText(text);
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'es-419';
  utterance.rate = 0.88;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  const esVoices = voices.filter(voice => /^es(-|_)/i.test(voice.lang));
  const preferredVoice = esVoices.find(voice => /419|MX|CR|PA|CO|LATAM/i.test(voice.lang))
    || esVoices.find(voice => /premium|enhanced|google/i.test(voice.name))
    || esVoices.find(voice => /ES/i.test(voice.lang))
    || esVoices[0];
  if (preferredVoice) utterance.voice = preferredVoice;
  window.speechSynthesis.speak(utterance);
};

window.playEffect = function(type) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  if (type === 'correct') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1); // C#6
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else if (type === 'wrong') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }
};

// UI Renderers
function render() {
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (appState.currentView === 'home') {
    content.appendChild(renderHome());
  } else if (appState.currentView === 'flashcards') {
    content.appendChild(renderFlashcards(appState.currentGenre));
  } else if (appState.currentView === 'quiz') {
    appState.currentView = 'study';
    content.appendChild(appState.quizMode
      ? renderQuizLearningSession(appState.currentGenre, appState.quizMode)
      : renderQuizLearningSetup());
  } else if (appState.currentView === 'conjugations') {
    content.appendChild(renderConjugations());
  } else if (appState.currentView === 'verbquiz') {
    content.appendChild(renderVerbQuiz());
  } else if (appState.currentView === 'study') {
    content.appendChild(appState.quizMode
      ? renderQuizLearningSession(appState.currentGenre, appState.quizMode)
      : renderQuizLearningSetup());
  } else if (appState.currentView === 'scorecard') {
    content.appendChild(renderScorecard());
  } else if (appState.currentView === 'reviewlater') {
    content.appendChild(renderReviewLater());
  }
}

function updateMenuHighlight() {
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
  
  let activeId = null;
  if (appState.currentView === 'flashcards' || appState.currentView === 'quiz') {
    activeId = 'menu-flashcards';
  } else if (appState.currentView === 'conjugations' || appState.currentView === 'verbquiz') {
    activeId = 'menu-conjugations';
  } else if (appState.currentView === 'study') {
    activeId = 'menu-study';
  } else if (appState.currentView === 'scorecard') {
    activeId = 'menu-scorecard';
  } else if (appState.currentView === 'reviewlater') {
    activeId = 'menu-reviewlater';
  }
  
  if (activeId) {
    const activeEl = document.getElementById(activeId);
    if (activeEl) {
      activeEl.classList.add('active');
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
}

// 1. Home Screen
function renderHome() {
  const div = document.createElement('div');
  div.className = 'home-container';
  return div;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getWordCategories(word) {
  const categories = Array.isArray(word?.categories) ? word.categories : [word?.category || 'その他'];
  return [...new Set(categories.filter(Boolean))];
}

function hasWordCategory(word, category) {
  return category === 'All' || getWordCategories(word).includes(category);
}

function getAllLearningWords() {
  return Object.entries(db).flatMap(([genre, words]) =>
    words.map(word => ({ ...word, genre }))
  );
}

const QUIZ_MODE_LABELS = {
  mix: 'ミックス',
  '4choice-es-ja': '4択（スペイン語 → 日本語）',
  '4choice-ja-es': '4択（日本語 → スペイン語）',
  listening: '音声',
  spelling: 'スペル'
};

const QUIZ_FIXED_MODES = ['4choice-es-ja', '4choice-ja-es', 'listening', 'spelling'];

function getQuizWords(genreId, category = 'All') {
  const source = genreId && genreId !== 'All' && db[genreId]
    ? db[genreId].map(word => ({ ...word, genre: genreId }))
    : getAllLearningWords();
  return category === 'All' ? source : source.filter(word => hasWordCategory(word, category));
}

function getQuizCategories(genreId) {
  return [...new Set(getQuizWords(genreId, 'All').flatMap(getWordCategories))]
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function renderQuizLearningSetup() {
  const div = document.createElement('div');
  div.className = 'quiz-learning-container';
  const selectedGenre = appState.currentGenre && (appState.currentGenre === 'All' || db[appState.currentGenre])
    ? appState.currentGenre
    : 'All';
  const selectedCategory = appState.currentCategory || 'All';
  const genreOptions = ['<option value="All">すべての品詞</option>']
    .concat(genresInfo.map(genre => `<option value="${genre.id}" ${selectedGenre === genre.id ? 'selected' : ''}>${genre.icon} ${genre.label}</option>`)).join('');

  div.innerHTML = `
    <div class="view-header quiz-learning-header">
      <p class="daily-eyebrow">PRACTICAL SPANISH</p>
      <h2>🎯 クイズ学習</h2>
      <p>クイズ形式・品詞・ジャンルを選んで学習を始めます。</p>
    </div>
    <section class="quiz-setup-card">
      <div class="quiz-setup-block">
        <span class="setup-label">クイズ形式</span>
        <div class="quiz-format-grid">
          ${Object.entries(QUIZ_MODE_LABELS).map(([mode, label]) => `<label class="quiz-format-option"><input type="radio" name="quiz-format" value="${mode}" ${mode === 'mix' ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>
      </div>
      <div class="quiz-filter-row">
        <label class="quiz-filter-field"><span class="setup-label">品詞</span><select id="quiz-genre-select" class="category-select">${genreOptions}</select></label>
        <label class="quiz-filter-field"><span class="setup-label">ジャンル</span><select id="quiz-category-select" class="category-select"></select></label>
      </div>
      <div class="quiz-start-row">
        <button id="start-quiz-learning" class="btn btn-primary">クイズをスタート</button>
        <button id="start-verb-quiz" class="btn btn-secondary">🧠 動詞の活用クイズ</button>
      </div>
    </section>
  `;

  const genreSelect = div.querySelector('#quiz-genre-select');
  const categorySelect = div.querySelector('#quiz-category-select');
  const syncCategories = () => {
    const categories = getQuizCategories(genreSelect.value);
    categorySelect.innerHTML = ['<option value="All">すべてのジャンル</option>']
      .concat(categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)).join('');
    if (categories.includes(selectedCategory) && genreSelect.value === selectedGenre) categorySelect.value = selectedCategory;
  };
  genreSelect.onchange = syncCategories;
  syncCategories();
  div.querySelector('#start-quiz-learning').onclick = () => {
    const mode = div.querySelector('input[name="quiz-format"]:checked')?.value || 'mix';
    appState.navigate('study', genreSelect.value, mode, null, { cat: categorySelect.value });
  };
  div.querySelector('#start-verb-quiz').onclick = () => appState.navigate('verbquiz');
  return div;
}

function renderQuizLearningSession(genreId, selectedMode) {
  const div = document.createElement('div');
  div.className = 'quiz-learning-container';
  const words = getQuizWords(genreId, appState.currentCategory || 'All');
  let currentIndex = 0;
  let currentMode = selectedMode === 'mix' ? null : selectedMode;
  let answered = false;

  const nextQuestion = () => {
    answered = false;
    currentMode = selectedMode === 'mix'
      ? QUIZ_FIXED_MODES[Math.floor(Math.random() * QUIZ_FIXED_MODES.length)]
      : selectedMode;
    const target = words[Math.floor(Math.random() * words.length)];
    if (!target) return;
    const needChoices = currentMode !== 'spelling';
    const choices = [target];
    const pool = words.length >= 4 ? words : getQuizWords(genreId, 'All');
    while (needChoices && choices.length < 4 && pool.length) {
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      if (!choices.some(choice => choice.es === candidate.es)) choices.push(candidate);
      if (choices.length === pool.length) break;
    }
    choices.sort(() => Math.random() - 0.5);
    const questionLabel = currentMode === 'listening'
      ? '音声を聞いて、日本語の意味を選んでください。'
      : currentMode === '4choice-es-ja'
        ? 'スペイン語に合う日本語を選んでください。'
        : currentMode === '4choice-ja-es'
          ? '日本語に合うスペイン語を選んでください。'
          : '日本語を見て、スペイン語を入力してください。';
    const prompt = currentMode === 'listening' ? '<button id="quiz-audio" class="btn btn-primary btn-pulse quiz-audio-button">🔊 音声を再生</button>' : `<div class="quiz-learning-prompt">${escapeHtml(currentMode === '4choice-es-ja' ? target.es : target.ja)}</div>`;
    div.innerHTML = `
      <div class="view-header quiz-learning-header"><p class="daily-eyebrow">QUIZ LEARNING</p><h2>🎯 クイズ学習 <span class="study-progress">${currentIndex + 1}</span></h2><p>${escapeHtml(QUIZ_MODE_LABELS[currentMode] || currentMode)} · ${escapeHtml(questionLabel)}</p></div>
      <section class="quiz-question quiz-learning-question">${prompt}</section>
      ${currentMode === 'spelling' ? '<div class="quiz-spelling-row"><input id="quiz-spelling-input" class="spelling-input" placeholder="スペイン語を入力" autocomplete="off" autocapitalize="off" spellcheck="false"><button id="quiz-spelling-submit" class="btn btn-primary">判定</button></div>' : `<div class="quiz-choices">${choices.map(choice => `<button class="quiz-btn" data-es="${escapeHtml(choice.es)}">${escapeHtml(currentMode === '4choice-ja-es' ? choice.es : choice.ja)}</button>`).join('')}</div>`}
      <div id="quiz-learning-feedback" class="study-feedback" hidden></div>
      <button id="quiz-learning-next" class="btn btn-primary" hidden>次の問題へ →</button>
    `;
    const feedback = div.querySelector('#quiz-learning-feedback');
    const next = div.querySelector('#quiz-learning-next');
    const finishAnswer = (answer, answerButton = null) => {
      if (answered) return;
      answered = true;
      const isCorrect = WordIdentity.matchesAnswer(answer, target.es);
      const state = QuizHistory.logAttempt(target, isCorrect, currentMode, target.genre);
      if (answerButton) answerButton.classList.add(isCorrect ? 'correct' : 'wrong');
      if (currentMode !== 'spelling') {
        div.querySelectorAll('.quiz-btn').forEach(button => {
          button.disabled = true;
          if (button.dataset.es === target.es) button.classList.add('correct');
        });
      }
      const english = target.en ? `<br><small class="answer-english">英語: ${escapeHtml(target.en)}</small>` : '';
      feedback.hidden = false;
      feedback.className = `study-feedback ${isCorrect ? 'correct' : 'wrong'}`;
      feedback.innerHTML = isCorrect ? `🎉 正解です。${english}<br><small>${escapeHtml(StudyContent.formatDueAt(state))}</small>` : `正解は <strong>${escapeHtml(target.es)}</strong> です。${english}`;
      next.hidden = false;
      playAudio(target.es);
      playEffect(isCorrect ? 'correct' : 'wrong');
    };
    if (currentMode === 'listening') {
      div.querySelector('#quiz-audio').onclick = () => playAudio(target.es);
      playAudio(target.es);
    }
    div.querySelectorAll('.quiz-btn').forEach(button => button.onclick = () => finishAnswer(button.dataset.es, button));
    if (currentMode === 'spelling') {
      const input = div.querySelector('#quiz-spelling-input');
      const submit = div.querySelector('#quiz-spelling-submit');
      const submitAnswer = () => { input.disabled = true; submit.disabled = true; finishAnswer(input.value); };
      submit.onclick = submitAnswer;
      input.onkeydown = event => { if (event.key === 'Enter') submitAnswer(); };
      input.focus();
    }
    next.onclick = () => { currentIndex += 1; nextQuestion(); };
  };
  if (words.length < 1 || (selectedMode !== 'spelling' && words.length < 2)) {
    div.innerHTML = '<div class="view-header"><h2>🎯 クイズ学習</h2><p>この条件では学習できる単語が不足しています。品詞またはジャンルを変更してください。</p><button class="btn btn-outline" onclick="appState.navigate(\'study\')">設定へ戻る</button></div>';
  } else {
    nextQuestion();
  }
  return div;
}

function renderStudySession() {
  const div = document.createElement('div');
  div.className = 'study-container';
  const allWords = getAllLearningWords();
  const queue = LearningStore.getDueWords(allWords, 20);
  const session = LearningEvents.startSession();
  let currentIndex = 0;

  const finish = () => {
    LearningEvents.endSession(session);
    appState.navigate('home');
  };

  if (queue.length === 0) {
    div.innerHTML = `
      <div class="view-header">
        <h2>🎯 クイズ学習</h2>
        <p>今すぐ復習する単語はありません。素晴らしい状態です。</p>
        <button class="btn btn-outline mt-2" id="study-home-btn">← ホームへ戻る</button>
      </div>
    `;
    div.querySelector('#study-home-btn').onclick = finish;
    return div;
  }

  const renderQuestion = () => {
    const word = queue[currentIndex];
    const example = StudyContent.getExample(word);
    const usage = StudyContent.getUsage(word);
    const state = LearningStore.get(word, word.genre);
    const exampleHtml = example
      ? `<div class="study-example"><span class="study-label">例文</span><strong>${escapeHtml(example.es)}</strong>${example.ja ? `<span>${escapeHtml(example.ja)}</span>` : ''}</div>`
      : `<div class="study-example study-example-empty"><span class="study-label">例文</span><span>例文はまだ登録されていません。下の練習欄で自分の文を作りましょう。</span></div>`;
    const usageHtml = usage.length
      ? usage.map(scene => `<span class="usage-chip">${escapeHtml(scene)}</span>`).join('')
      : '<span class="text-mute">場面情報は準備中です。</span>';

    div.innerHTML = `
      <div class="view-header study-header">
        <p class="daily-eyebrow">TODAY'S REVIEW</p>
        <h2>🎯 クイズ学習 <span class="study-progress">${currentIndex + 1} / ${queue.length}</span></h2>
        <p>${escapeHtml(StudyContent.formatDueAt(state))}</p>
        <button class="btn btn-outline mt-2" id="study-exit-btn">← ホームへ戻る</button>
      </div>
      <section class="study-card">
        <div class="prompt-ja">${escapeHtml(word.ja)}</div>
        <div class="prompt-en">${escapeHtml(word.en)}</div>
        <button class="btn btn-primary" id="study-reveal-btn">スペイン語を思い出して表示</button>
        <div id="study-answer-area" class="study-answer-area" hidden>
          <div class="study-spanish">${escapeHtml(word.es)} <button class="btn-audio-icon" id="study-audio-btn" aria-label="音声を再生">🔊</button></div>
          ${exampleHtml}
          <div class="study-usage"><span class="study-label">使用場面</span><div class="usage-chip-list">${usageHtml}</div></div>
          <div class="study-practice-prompt">${escapeHtml(StudyContent.getPracticePrompt(word))}</div>
          <input id="study-input" class="spelling-input" placeholder="スペイン語で入力" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn btn-secondary" id="study-submit-btn">回答を確認</button>
          <div id="study-feedback" class="study-feedback" hidden></div>
          <button class="btn btn-primary" id="study-next-btn" hidden>次の単語へ →</button>
        </div>
      </section>
    `;

    div.querySelector('#study-exit-btn').onclick = finish;
    const revealBtn = div.querySelector('#study-reveal-btn');
    const answerArea = div.querySelector('#study-answer-area');
    const input = div.querySelector('#study-input');
    const submitBtn = div.querySelector('#study-submit-btn');
    const feedback = div.querySelector('#study-feedback');
    const nextBtn = div.querySelector('#study-next-btn');
    revealBtn.onclick = () => {
      LearningStore.markViewed(word, word.genre);
      revealBtn.hidden = true;
      answerArea.hidden = false;
      input.focus();
    };
    div.querySelector('#study-audio-btn').onclick = () => playAudio(word.es);

    const submit = () => {
      if (submitBtn.disabled) return;
      const isCorrect = WordIdentity.matchesAnswer(input.value, word.es);
      const stateAfterAnswer = QuizHistory.logAttempt(word, isCorrect, 'study', word.genre);
      input.disabled = true;
      submitBtn.disabled = true;
      const dueLabel = StudyContent.formatDueAt(stateAfterAnswer);
      feedback.hidden = false;
      feedback.className = `study-feedback ${isCorrect ? 'correct' : 'wrong'}`;
      feedback.innerHTML = isCorrect
        ? `🎉 正解です。<br><small>${escapeHtml(dueLabel)}</small>`
        : `正解は <strong>${escapeHtml(word.es)}</strong> です。<br><small>${escapeHtml(dueLabel)}</small>`;
      nextBtn.hidden = false;
      playAudio(word.es);
      if (isCorrect) playEffect('correct');
      else playEffect('wrong');
    };
    submitBtn.onclick = submit;
    input.onkeydown = event => {
      if (event.key === 'Enter') submit();
    };
    nextBtn.onclick = () => {
      currentIndex += 1;
      if (currentIndex >= queue.length) finish();
      else renderQuestion();
    };
  };

  renderQuestion();
  return div;
}

function renderConversationPractice() {
  const div = document.createElement('div');
  div.className = 'practice-container';
  let currentIndex = Math.floor(Math.random() * ConversationScenarios.length);

  const renderScenario = () => {
    const scenario = ConversationScenarios[currentIndex];
    div.innerHTML = `
      <div class="view-header">
        <p class="daily-eyebrow">REAL-LIFE SPANISH</p>
        <h2>💬 ${escapeHtml(scenario.title)}</h2>
        <p>${escapeHtml(scenario.context)}</p>
        <button class="btn btn-outline mt-2" id="practice-home-btn">← ホームへ戻る</button>
      </div>
      <section class="scenario-card">
        <div class="scenario-prompt">${escapeHtml(scenario.prompt)}</div>
        <textarea id="scenario-input" class="scenario-input" rows="3" placeholder="スペイン語で答えてみましょう"></textarea>
        <button class="btn btn-primary" id="scenario-submit-btn">回答を確認</button>
        <div id="scenario-feedback" class="scenario-feedback" hidden></div>
        <button class="btn btn-secondary" id="scenario-next-btn" hidden>別の場面へ →</button>
      </section>
    `;

    const input = div.querySelector('#scenario-input');
    const submitBtn = div.querySelector('#scenario-submit-btn');
    const feedback = div.querySelector('#scenario-feedback');
    const nextBtn = div.querySelector('#scenario-next-btn');
    div.querySelector('#practice-home-btn').onclick = () => appState.navigate('home');
    input.focus();
    submitBtn.onclick = () => {
      if (submitBtn.disabled) return;
      const alternatives = [scenario.answer, ...(scenario.alternatives || [])];
      const isCorrect = alternatives.some(answer => WordIdentity.matchesAnswer(input.value, answer));
      input.disabled = true;
      submitBtn.disabled = true;
      feedback.hidden = false;
      feedback.className = `scenario-feedback ${isCorrect ? 'correct' : 'wrong'}`;
      feedback.innerHTML = `${isCorrect ? '🎉 とても良いです。' : '参考解答と比べてみましょう。'}<br><strong>${escapeHtml(scenario.answer)}</strong>${scenario.alternatives?.length ? `<br><small>別解: ${escapeHtml(scenario.alternatives.join(' / '))}</small>` : ''}`;
      LearningEvents.log('scenario_answer', {
        scenarioId: scenario.id,
        mode: 'scenario',
        isCorrect
      });
      nextBtn.hidden = false;
    };
    input.onkeydown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitBtn.click();
    };
    nextBtn.onclick = () => {
      currentIndex = (currentIndex + 1) % ConversationScenarios.length;
      renderScenario();
    };
  };

  renderScenario();
  return div;
}

// 2. Flashcards Screen
function renderFlashcardsGenrePicker() {
  const div = document.createElement('div');
  div.className = 'flashcards-container';
  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = '<h2>📖 単語カード</h2><p>品詞を選んで単語カードを開きます。</p>';
  div.appendChild(header);
  const grid = document.createElement('div');
  grid.className = 'genre-picker-grid';
  genresInfo.forEach(genre => {
    const button = document.createElement('button');
    button.className = 'genre-picker-card';
    button.style.borderTopColor = genre.color;
    button.innerHTML = `<span class="genre-icon">${genre.icon}</span><strong>${genre.label}</strong><small>${genre.enLabel} · ${db[genre.id].length}語</small>`;
    button.onclick = () => appState.navigate('flashcards', genre.id);
    grid.appendChild(button);
  });
  div.appendChild(grid);
  return div;
}

function renderFlashcards(genreId) {
  if (!genreId || !db[genreId]) return renderFlashcardsGenrePicker();

  const div = document.createElement('div');
  div.className = 'flashcards-container';
  const genreInfo = genresInfo.find(g => g.id === genreId);
  const allWords = db[genreId] || [];
  const categories = [...new Set(allWords.flatMap(getWordCategories))].sort((a, b) => a.localeCompare(b, 'ja'));
  const query = String(appState.searchQuery || '').trim().toLowerCase();
  const normalizedQuery = WordIdentity.normalizeText(query);
  const verbTypeFilter = genreId === 'verbs' ? appState.verbCardType : 'all';
  const words = allWords.filter(word => {
    const matchesCategory = hasWordCategory(word, appState.currentCategory);
    const matchesVerbType = verbTypeFilter === 'all' || word.verbType === verbTypeFilter;
    const searchFields = [word.ja, word.es, word.en].map(value => WordIdentity.normalizeText(value));
    return matchesCategory && matchesVerbType && (!normalizedQuery || searchFields.some(value => value.includes(normalizedQuery)));
  });

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h2>${genreInfo.icon} ${genreInfo.label}</h2><p>タッチで裏返す</p>`;
  div.appendChild(header);

  const controls = document.createElement('div');
  controls.className = 'flashcard-controls';
  const categoryOptions = ['<option value="All">📂 すべてのジャンル</option>']
    .concat(categories.map(cat => `<option value="${escapeHtml(cat)}" ${appState.currentCategory === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`)).join('');
  const verbTypeOptions = genreId === 'verbs' ? `
    <select id="flashcard-verb-type" class="category-select">
      <option value="all" ${verbTypeFilter === 'all' ? 'selected' : ''}>🔤 すべての動詞</option>
      <option value="single" ${verbTypeFilter === 'single' ? 'selected' : ''}>単独動詞</option>
      <option value="phrase" ${verbTypeFilter === 'phrase' ? 'selected' : ''}>動詞フレーズ</option>
    </select>` : '';
  controls.innerHTML = `${verbTypeOptions}<select id="flashcard-category" class="category-select">${categoryOptions}</select><input id="flashcard-search" class="search-input flashcard-search" type="search" placeholder="日本語・スペイン語・英語で検索" value="${escapeHtml(appState.searchQuery || '')}" autocomplete="off">`;
  div.appendChild(controls);

  const paginationContainer = document.createElement('div');
  paginationContainer.className = 'flashcard-pagination';
  div.appendChild(paginationContainer);

  const renderGrid = () => {
    const totalPages = Math.max(1, Math.ceil(words.length / appState.itemsPerPage));
    const page = Math.min(Math.max(appState.currentPage, 1), totalPages);
    const currentWords = words.slice((page - 1) * appState.itemsPerPage, page * appState.itemsPerPage);
    paginationContainer.innerHTML = '';
    if (totalPages > 1) paginationContainer.appendChild(createPaginationDOM(page, totalPages, () => renderGrid()));
    grid.innerHTML = '';
    if (!currentWords.length) {
      grid.innerHTML = '<p class="empty-msg">該当する単語がありません。</p>';
      return;
    }
    currentWords.forEach(word => {
      let genderMarker = '';
      let backColorClass = '';
      if (genreId === 'nouns') {
        const esLower = word.es.toLowerCase();
        if (esLower.includes('el/la') || esLower.includes('los/las') || esLower.includes(' un/una ')) {
          genderMarker = '<span class="gender-mark both">m/f</span>';
          backColorClass = 'bg-white';
        } else if (/^(el|los|un|unos) /.test(esLower)) {
          genderMarker = '<span class="gender-mark masculine">m</span>';
          backColorClass = 'bg-blue';
        } else if (/^(la|las|una|unas) /.test(esLower)) {
          genderMarker = '<span class="gender-mark feminine">f</span>';
          backColorClass = 'bg-pink';
        } else backColorClass = 'bg-white';
      }
      const wordWithGenre = { ...word, genre: genreId };
      const wordId = WordIdentity.key(wordWithGenre, genreId);
      const isInReview = SwipeManager.getReviewLater().some(item => WordIdentity.same(item, wordWithGenre, genreId));
      const card = document.createElement('div');
      card.className = 'flashcard';
      card.dataset.wordId = wordId;
      card.innerHTML = `
        <div class="flashcard-inner">
          <div class="card-face front"><div class="word-ja">${escapeHtml(word.ja)}</div></div>
          <div class="card-face back ${backColorClass}">${genderMarker}<div class="word-es ${backColorClass === 'bg-white' ? 'text-dark' : ''}">${escapeHtml(word.es)}</div><div class="word-en card-back-en">${escapeHtml(word.en)}</div>${genreId === 'verbs' ? '<button class="conj-link" type="button">Conjugación ↗</button>' : ''}</div>
        </div>
        <button class="card-review-btn ${isInReview ? 'in-review' : ''}" type="button">${isInReview ? '📝 復習中' : '+ 後で復習'}</button>`;
      card.onclick = () => {
        card.classList.toggle('flipped');
        if (card.classList.contains('flipped')) {
          LearningStore.markViewed(wordWithGenre, genreId);
          playAudio(word.es);
        }
      };
      card.querySelector('.card-review-btn').onclick = event => {
        event.stopPropagation();
        const button = event.currentTarget;
        if (SwipeManager.getReviewLater().some(item => WordIdentity.same(item, wordWithGenre, genreId))) {
          SwipeManager.removeReviewLater(wordId);
          button.textContent = '+ 後で復習';
          button.classList.remove('in-review');
        } else {
          SwipeManager.addReviewLater(wordWithGenre);
          button.textContent = '📝 復習中';
          button.classList.add('in-review');
        }
      };
      const conjugationButton = card.querySelector('.conj-link');
      if (conjugationButton) conjugationButton.onclick = event => {
        event.stopPropagation();
        appState.verbReturnPage = page;
        appState.verbReturnCat = appState.currentCategory;
        appState.navigate('conjugations', null, null, word.es);
      };
      grid.appendChild(card);
    });
  };

  const grid = document.createElement('div');
  grid.className = 'flashcard-grid';
  div.appendChild(grid);
  controls.querySelector('#flashcard-category').onchange = event => appState.navigate('flashcards', genreId, null, appState.searchQuery, { cat: event.target.value, page: 1 });
  const verbTypeSelect = controls.querySelector('#flashcard-verb-type');
  if (verbTypeSelect) {
    verbTypeSelect.onchange = event => {
      appState.verbCardType = event.target.value;
      appState.navigate('flashcards', genreId, null, appState.searchQuery, { cat: appState.currentCategory, page: 1 });
    };
  }
  controls.querySelector('#flashcard-search').oninput = event => {
    appState.currentPage = 1;
    appState.searchQuery = event.target.value;
    render();
  };
  renderGrid();
  return div;
}

// 3. Quiz Screen
function renderQuiz(genreId, mode) {
  const div = document.createElement('div');
  div.className = 'quiz-container';
  
  // Weak word or genre retrieval
  let words = [];
  if (genreId === 'weak' || appState.weakOnly) {
    const weakList = QuizHistory.getWeakWords();
    if (genreId !== 'weak') {
      words = weakList.filter(w => w.genre === genreId);
    } else {
      words = weakList;
    }
  } else {
    words = db[genreId];
  }
  
  const categories = [...new Set(words.flatMap(getWordCategories))];
  const hasCategories = categories.length > 1 || (categories.length === 1 && categories[0] !== 'その他');

  if (appState.currentCategory !== 'All') {
    words = words.filter(w => hasWordCategory(w, appState.currentCategory));
  }

  const header = document.createElement('div');
  header.className = 'view-header';
  
  let headerText = '';
  if (mode === '4choice') headerText = '🤔 4択クイズ: 以下の意味を表すスペイン語は何でしょう？';
  if (mode === 'listening') headerText = '🎧 リスニング: 音声を聞いて、正しい意味を選んでください。';
  if (mode === 'spelling') headerText = '✍️ スペル記入クイズ: 以下の意味を表すスペイン語を入力してください。';
  
  let headerHTML = `<h2>${headerText}</h2>`;
  
  if (hasCategories) {
    let options = `<option value="All">すべてのカテゴリー (All)</option>`;
    categories.forEach(cat => {
      options += `<option value="${cat}" ${appState.currentCategory === cat ? 'selected' : ''}>${cat}</option>`;
    });
    headerHTML += `<select id="category-select" class="category-select">${options}</select>`;
  }

  header.innerHTML = headerHTML;
  div.appendChild(header);

  if (hasCategories) {
    setTimeout(() => {
      const select = document.getElementById('category-select');
      if(select) {
        select.onchange = (e) => {
          appState.navigate('quiz', genreId, mode, appState.searchQuery, {
            cat: e.target.value,
            page: 1,
            weakOnly: appState.weakOnly
          });
        };
      }
    }, 0);
  }

  if (words.length < 1 || (mode !== 'spelling' && words.length < 4)) {
    div.innerHTML += '<p style="margin-top:2rem; background:white; padding:2rem; border-radius:12px;">このカテゴリーにはクイズを行うための単語が不足しています。他のカテゴリーを選ぶか、学習を進めてください。</p>';
    return div;
  }

  const targetIndex = Math.floor(Math.random() * words.length);
  const targetWord = words[targetIndex];
  
  let choices = [];
  if (mode !== 'spelling') {
    choices = [targetWord];
    // For 4 choices, get distractors from db[genreId]
    const distractorSource = db[genreId] && db[genreId].length >= 4 ? db[genreId] : words;
    while(choices.length < 4) {
      const randItem = distractorSource[Math.floor(Math.random() * distractorSource.length)];
      if (!choices.some(c => c.es === randItem.es)) {
        choices.push(randItem);
      }
    }
    choices.sort(() => Math.random() - 0.5);
  }

  // Question Area
  const questionCard = document.createElement('div');
  questionCard.className = 'quiz-question';
  
  if (mode === 'listening') {
    questionCard.innerHTML = `
      <p style="margin-bottom: 1.5rem; color: var(--primary); font-weight: 800; font-size: 1.2rem;">
        ※ボタンを押して音声を再生してください
      </p>
      <button id="play-audio-btn" class="btn btn-primary btn-pulse" style="font-size: 2rem; padding: 1.5rem 3rem; border-radius: 20px;">
        🔊 音声を再生 (Play)
      </button>
    `;
  } else {
    questionCard.innerHTML = `
      <div class="prompt-ja">${targetWord.ja}</div>
      <div class="prompt-en">${targetWord.en}</div>
    `;
  }
  div.appendChild(questionCard);

  let answered = false;
  
  if (mode === '4choice') {
    const choicesGrid = document.createElement('div');
    choicesGrid.className = 'quiz-choices';
    
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'quiz-btn';
      btn.innerHTML = `<strong>${choice.es}</strong>
        <div class="choice-meaning" style="display:none; font-size:1rem; opacity:0.9; margin-top:0.5rem; line-height:1.2;">${choice.ja} / ${choice.en}</div>`;
      btn.onclick = () => {
        if (answered) {
          playAudio(choice.es);
          return;
        }
        answered = true;
        
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        const isCorrect = choice.es === targetWord.es;
        QuizHistory.logAttempt(targetWord, isCorrect, mode);
        
        if (isCorrect) {
          btn.classList.add('correct');
          playEffect('correct');
          playAudio(choice.es);
        } else {
          btn.classList.add('wrong');
          playEffect('wrong');
          Array.from(choicesGrid.children).forEach(childBtn => {
            if (childBtn.innerHTML.includes(targetWord.es)) {
              childBtn.classList.add('correct');
            }
          });
        }
      };
      choicesGrid.appendChild(btn);
    });
    div.appendChild(choicesGrid);
  } 
  else if (mode === 'listening') {
    const choicesGrid = document.createElement('div');
    choicesGrid.className = 'quiz-choices';
    
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'quiz-btn';
      btn.innerHTML = `<strong>${choice.ja}</strong><br><small>${choice.en}</small>
        <div class="choice-meaning" style="display:none; font-size:1.3rem; margin-top:0.5rem; font-weight:800; color:inherit;">${choice.es}</div>`;
      btn.onclick = () => {
        if (answered) {
          playAudio(choice.es);
          return;
        }
        answered = true;
        
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        const isCorrect = choice.es === targetWord.es;
        QuizHistory.logAttempt(targetWord, isCorrect, mode);
        
        if (isCorrect) {
          btn.classList.add('correct');
          playEffect('correct');
          playAudio(choice.es);
        } else {
          btn.classList.add('wrong');
          playEffect('wrong');
          Array.from(choicesGrid.children).forEach(childBtn => {
            if (childBtn.innerHTML.includes(targetWord.es)) {
              childBtn.classList.add('correct');
            }
          });
        }
      };
      choicesGrid.appendChild(btn);
    });
    div.appendChild(choicesGrid);

    setTimeout(() => {
      const pBtn = document.getElementById('play-audio-btn');
      if (pBtn) {
        pBtn.onclick = () => {
          pBtn.classList.remove('btn-pulse');
          playAudio(targetWord.es);
        };
        playAudio(targetWord.es);
      }
    }, 0);
  }
  else if (mode === 'spelling') {
    const spellingBox = document.createElement('div');
    spellingBox.className = 'spelling-quiz-box';
    
    spellingBox.innerHTML = `
      <div style="display: flex; gap: 10px; margin-bottom: 1.5rem; justify-content: center; width: 100%; max-width: 500px; margin-left: auto; margin-right: auto;">
        <input type="text" id="spelling-input" class="spelling-input" placeholder="スペイン語を入力してください" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button id="spelling-submit" class="btn btn-primary" style="padding: 0.8rem 2rem; font-size: 1.1rem; border-radius: 12px;">判定</button>
      </div>
      <div class="accent-keyboard">
        <button class="accent-btn">á</button>
        <button class="accent-btn">é</button>
        <button class="accent-btn">í</button>
        <button class="accent-btn">ó</button>
        <button class="accent-btn">ú</button>
        <button class="accent-btn">ñ</button>
        <button class="accent-btn">ü</button>
        <button class="accent-btn">¿</button>
        <button class="accent-btn">¡</button>
      </div>
      <div id="spelling-feedback" class="spelling-feedback" style="display: none;"></div>
    `;
    div.appendChild(spellingBox);

    setTimeout(() => {
      const input = document.getElementById('spelling-input');
      const submit = document.getElementById('spelling-submit');
      const feedback = document.getElementById('spelling-feedback');
      const nextBtn = document.getElementById('next-quiz-btn');
      
      input.focus();
      
      const insertAtCursor = (char) => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + char + text.substring(end);
        input.selectionStart = input.selectionEnd = start + char.length;
        input.focus();
      };

      spellingBox.querySelectorAll('.accent-btn').forEach(btn => {
        btn.onclick = () => insertAtCursor(btn.textContent);
      });

      const cleanString = (str) => {
        return str.toLowerCase().replace(/[¿¡?!.,]/g, '').trim();
      };
      
      const removeAccents = (str) => {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      };

      const checkAnswer = () => {
        if (answered) return;
        
        const userVal = input.value;
        const cleanUser = cleanString(userVal);
        const cleanTarget = cleanString(targetWord.es);
        const targetVariants = cleanTarget.split('/').map(v => v.trim());
        
        let isCorrect = false;
        let isAccentWarning = false;
        
        if (targetVariants.includes(cleanUser)) {
          isCorrect = true;
        } else {
          const userNoAccent = removeAccents(cleanUser);
          for (let variant of targetVariants) {
            if (removeAccents(variant) === userNoAccent) {
              isCorrect = true;
              isAccentWarning = true;
              break;
            }
          }
        }
        
        answered = true;
        input.disabled = true;
        submit.disabled = true;
        if (nextBtn) nextBtn.style.display = 'block';
        
        QuizHistory.logAttempt(targetWord, isCorrect, mode);
        playAudio(targetWord.es);
        
        feedback.style.display = 'block';
        if (isCorrect) {
          playEffect('correct');
          if (isAccentWarning) {
            feedback.className = 'spelling-feedback warning';
            feedback.innerHTML = `⚠️ ほぼ正解！アクセントの位置に注意してください。<br><strong>正解: ${targetWord.es}</strong>`;
          } else {
            feedback.className = 'spelling-feedback correct';
            feedback.innerHTML = `🎉 正解です！<br><strong>${targetWord.es}</strong>`;
          }
        } else {
          playEffect('wrong');
          feedback.className = 'spelling-feedback wrong';
          feedback.innerHTML = `❌ 残念！<br>正解は <strong>${targetWord.es}</strong> です。`;
        }
      };

      submit.onclick = checkAnswer;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          checkAnswer();
        }
      };
    }, 0);
  }

  // Next Button Container
  const nextBtnContainer = document.createElement('div');
  nextBtnContainer.innerHTML = `<button id="next-quiz-btn" class="btn btn-primary" style="display:none; margin: 2.5rem auto 0; font-size: 1.5rem; padding: 1.2rem 4rem; border-radius: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">Siguiente ➡️</button>`;
  div.appendChild(nextBtnContainer);
  
  setTimeout(() => {
    const nextBtn = document.getElementById('next-quiz-btn');
    if (nextBtn) {
      nextBtn.onclick = () => appState.navigate('quiz', genreId, mode, appState.searchQuery, {
        cat: appState.currentCategory,
        page: 1,
        weakOnly: appState.weakOnly
      });
    }
  }, 0);

  return div;
}

// 4. Verbs Conjugation Screen
function renderConjugations() {
  const div = document.createElement('div');
  div.className = 'conjugations-container';
  
  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h2>🏃 動詞の活用表 (Conjugaciones)</h2>`;

  const categories = [...new Set(db.verbs.flatMap(getWordCategories))]
    .sort((a, b) => a.localeCompare(b, 'ja'));
  const categorySelect = document.createElement('select');
  categorySelect.id = 'verb-category-select';
  categorySelect.className = 'category-select verb-category-select';
  categorySelect.innerHTML = ['<option value="All">📂 すべてのジャンル</option>']
    .concat(categories.map(category => `<option value="${escapeHtml(category)}" ${appState.currentCategory === category ? 'selected' : ''}>${escapeHtml(category)}</option>`)).join('');
  header.appendChild(categorySelect);

  const typeSelect = document.createElement('select');
  typeSelect.id = 'verb-type-select';
  typeSelect.className = 'category-select verb-type-select';
  typeSelect.innerHTML = `
    <option value="all" ${appState.verbType === 'all' ? 'selected' : ''}>🔤 すべての動詞</option>
    <option value="single" ${appState.verbType === 'single' ? 'selected' : ''}>単独動詞</option>
    <option value="phrase" ${appState.verbType === 'phrase' ? 'selected' : ''}>動詞フレーズ</option>
  `;
  header.appendChild(typeSelect);

  // Back to verbs list button (restore page & category)
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-outline conj-back-btn';
  backBtn.innerHTML = '← 動詞一覧に戻る';
  backBtn.onclick = () => appState.navigate('flashcards', 'verbs', null, null, {
    page: appState.verbReturnPage || 1,
    cat: appState.verbReturnCat || 'All'
  });
  header.appendChild(backBtn);

  const verbQuizBtn = document.createElement('button');
  verbQuizBtn.className = 'btn btn-secondary conj-back-btn';
  verbQuizBtn.textContent = '🧠 活用クイズ';
  verbQuizBtn.onclick = () => appState.navigate('verbquiz');
  header.appendChild(verbQuizBtn);
  
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-container';
  searchContainer.innerHTML = `<input type="text" id="verb-search" placeholder="動詞を検索 (例: comer, 食べる)..." class="search-input">`;
  header.appendChild(searchContainer);
  div.appendChild(header);

  const topPageNavContainer = document.createElement('div');
  div.appendChild(topPageNavContainer);

  const cardsContainer = document.createElement('div');
  cardsContainer.id = 'conj-cards-container';
  div.appendChild(cardsContainer);

  const bottomPageNavContainer = document.createElement('div');
  div.appendChild(bottomPageNavContainer);

  const verbs = db.verbs;
  const tenseOrder = [
    '現在・過去分詞',
    '現在形 (Presente)',
    '点過去 (Indefinido)',
    '線過去 (Imperfecto)',
    '未来形 (Futuro)',
    '条件法 (Condicional)',
    '接続法現在 (Subjuntivo)',
    '命令形 (Imperativo)'
  ];
  
  const renderCards = (filterText) => {
    cardsContainer.innerHTML = '';
    topPageNavContainer.innerHTML = '';
    bottomPageNavContainer.innerHTML = '';
    
    const normalizedFilter = WordIdentity.normalizeText(filterText);
    const filteredVerbs = verbs.filter(v => {
      const matchesCategory = hasWordCategory(v, appState.currentCategory);
      const matchesType = appState.verbType === 'all' || v.verbType === appState.verbType;
      const matchesSearch = !normalizedFilter || [v.es, v.ja, v.en].some(value => WordIdentity.normalizeText(value).includes(normalizedFilter));
      return matchesCategory && matchesType && matchesSearch;
    });

    const totalPages = Math.ceil(filteredVerbs.length / appState.itemsPerPage);
    if (totalPages > 1) {
      topPageNavContainer.appendChild(createPaginationDOM(appState.currentPage, totalPages, () => renderCards(filterText)));
    }

    if (filteredVerbs.length === 0) {
      cardsContainer.innerHTML = '<p style="text-align:center;">見つかりませんでした。</p>';
      return;
    }

    const startIndex = (appState.currentPage - 1) * appState.itemsPerPage;
    const currentVerbs = filteredVerbs.slice(startIndex, startIndex + appState.itemsPerPage);

    currentVerbs.forEach(verb => {
      const card = document.createElement('div');
      card.className = 'conj-card';
      
      let html = `
        <div class="conj-header accordion-header" onclick="this.nextElementSibling.classList.toggle('expanded'); this.querySelector('.arrow').classList.toggle('up');">
          <div>
            <h3>${verb.es}</h3>
            <p>${verb.verbType === 'phrase' ? '動詞フレーズ' : '単独動詞'} · ${verb.ja} / ${verb.en}</p>
          </div>
          <div class="arrow">▼</div>
        </div>
        <div class="conj-tables accordion-content">
          <div class="conjugation-container">
      `;
      
      const orderedConjugations = Object.entries(verb.conjugations)
        .filter(([tense]) => !tense.includes('現在完了'))
        .sort(([firstTense], [secondTense]) => {
          const firstIndex = tenseOrder.indexOf(firstTense);
          const secondIndex = tenseOrder.indexOf(secondTense);
          return (firstIndex === -1 ? 999 : firstIndex) - (secondIndex === -1 ? 999 : secondIndex);
        });
      for (const [tense, forms] of orderedConjugations) {
        // nullやundefined対策
        const safeYo = forms.yo || '-';
        const safeTu = forms.tu || '-';
        const safeEl = forms['el/ella'] || '-';
        const safeNosotros = forms.nosotros || '-';
        const safeEllos = forms.ellos || '-';

        if (tense.includes('分詞')) {
          html += `
            <div class="conjugation-table-wrapper">
              <h4>${tense}</h4>
              <table class="conj-table">
                <tr><td>過去分詞 (Participio)</td><td class="es-text" onclick="playAudio('${safeYo}')">${safeYo}</td></tr>
                <tr><td>現在分詞 (Gerundio)</td><td class="es-text" onclick="playAudio('${safeTu}')">${safeTu}</td></tr>
              </table>
            </div>
          `;
        } else if (tense.includes('命令')) {
          const safeTuVal = forms.tu || '-';
          const safeUstedVal = forms.usted || '-';
          const safeNosotrosVal = forms.nosotros || '-';
          const safeUstedesVal = forms.ustedes || '-';
          // data.js のキー名が negativo_tu でも negativoTu でもうまく読み込めるように設定
          const safeNegativoTuVal = forms.negativoTu || forms.negativo_tu || '-'; 
          
          html += `
            <div class="conjugation-table-wrapper">
              <h4>${tense}</h4>
              <table class="conj-table imperative-table">
                <tr><th>原形</th><td>${verb.es}</td></tr>
                <tr><th>tú (肯定)</th><td class="es-text" onclick="playAudio('${safeTuVal}')">${safeTuVal}</td></tr>
                <tr><th>usted</th><td class="es-text" onclick="playAudio('${safeUstedVal}')">${safeUstedVal}</td></tr>
                <tr><th>nosotros</th><td class="es-text" onclick="playAudio('${safeNosotrosVal}')">${safeNosotrosVal}</td></tr>
                <tr><th>ustedes</th><td class="es-text" onclick="playAudio('${safeUstedesVal}')">${safeUstedesVal}</td></tr>
                <tr class="negativo"><th>tú (否定)</th><td class="es-text" onclick="playAudio('${safeNegativoTuVal}')">${safeNegativoTuVal}</td></tr>
              </table>
            </div>
          `;
        } else {
          html += `
            <div class="conjugation-table-wrapper">
              <h4>${tense}</h4>
              <table class="conj-table">
                <tr><td>yo</td><td class="es-text" onclick="playAudio('${safeYo}')">${safeYo}</td></tr>
                <tr><td>tú</td><td class="es-text" onclick="playAudio('${safeTu}')">${safeTu}</td></tr>
                <tr><td>él/ella/Ud.</td><td class="es-text" onclick="playAudio('${safeEl}')">${safeEl}</td></tr>
                <tr><td>nosotros</td><td class="es-text" onclick="playAudio('${safeNosotros}')">${safeNosotros}</td></tr>
                <tr><td>ellos/ellas/Uds.</td><td class="es-text" onclick="playAudio('${safeEllos}')">${safeEllos}</td></tr>
              </table>
            </div>
          `;
        }
      }
      
      html += `
          </div> </div>`;
      card.innerHTML = html;
      cardsContainer.appendChild(card);
    });

    if (totalPages > 1) {
      bottomPageNavContainer.appendChild(createPaginationDOM(appState.currentPage, totalPages, () => renderCards(filterText)));
    }
  };

  setTimeout(() => {
    categorySelect.onchange = event => {
      appState.currentCategory = event.target.value;
      appState.currentPage = 1;
      renderCards(document.getElementById('verb-search')?.value || '');
    };
    typeSelect.onchange = event => {
      appState.verbType = event.target.value;
      appState.currentPage = 1;
      renderCards(document.getElementById('verb-search')?.value || '');
    };
    const searchInput = document.getElementById('verb-search');
    if(searchInput) {
      searchInput.addEventListener('input', (e) => {
        appState.currentPage = 1;
        renderCards(e.target.value);
      });
      
      // Auto-fill from appState.searchQuery if present
      if (appState.searchQuery) {
        searchInput.value = appState.searchQuery;
        appState.searchQuery = null; // Consume the query
        renderCards(searchInput.value);
      } else {
        renderCards('');
      }
      
      searchInput.focus();
    }
  }, 0);

  return div;
}

function renderVerbQuiz() {
  const div = document.createElement('div');
  div.className = 'verb-quiz-container';
  const tenseCandidates = [
    '現在形 (Presente)',
    '点過去 (Indefinido)',
    '線過去 (Imperfecto)',
    '未来形 (Futuro)',
    '条件法 (Condicional)'
  ];
  const persons = [
    { key: 'yo', label: 'yo' },
    { key: 'tu', label: 'tú' },
    { key: 'el/ella', label: 'él / ella / usted' },
    { key: 'nosotros', label: 'nosotros' },
    { key: 'ellos', label: 'ellos / ustedes' }
  ];
  const verbs = db.verbs.filter(verb => tenseCandidates.some(tense => verb.conjugations?.[tense]));
  let current = null;

  const nextQuestion = () => {
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    const availableTenses = tenseCandidates.filter(tense => verb.conjugations?.[tense]);
    const tense = availableTenses[Math.floor(Math.random() * availableTenses.length)];
    const person = persons[Math.floor(Math.random() * persons.length)];
    current = { verb, tense, person, answer: verb.conjugations[tense][person.key] || '-' };
    div.innerHTML = `
      <div class="view-header">
        <p class="daily-eyebrow">VERB AUTOMATION</p>
        <h2>🧠 活用クイズ</h2>
        <p>動詞・時制・人称を見て、活用形を入力します。</p>
        <button class="btn btn-outline mt-2" id="verb-quiz-home-btn">← ホームへ戻る</button>
      </div>
      <section class="verb-quiz-card">
        <div class="verb-quiz-verb">${escapeHtml(current.verb.es)}</div>
        <div class="verb-quiz-meaning">${escapeHtml(current.verb.ja)}</div>
        <div class="verb-quiz-prompt">${escapeHtml(current.tense)} ・ ${escapeHtml(current.person.label)}</div>
        <input id="verb-quiz-input" class="spelling-input" placeholder="活用形を入力" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button id="verb-quiz-submit" class="btn btn-primary">判定</button>
        <div id="verb-quiz-feedback" class="study-feedback" hidden></div>
        <button id="verb-quiz-next" class="btn btn-secondary" hidden>次の問題へ →</button>
      </section>
    `;
    const input = div.querySelector('#verb-quiz-input');
    const submit = div.querySelector('#verb-quiz-submit');
    const feedback = div.querySelector('#verb-quiz-feedback');
    div.querySelector('#verb-quiz-home-btn').onclick = () => appState.navigate('home');
    input.focus();
    const check = () => {
      if (submit.disabled) return;
      const isCorrect = WordIdentity.matchesAnswer(input.value, current.answer);
      const state = QuizHistory.logAttempt(current.verb, isCorrect, 'verb', 'verbs');
      input.disabled = true;
      submit.disabled = true;
      feedback.hidden = false;
      feedback.className = `study-feedback ${isCorrect ? 'correct' : 'wrong'}`;
      feedback.innerHTML = isCorrect
        ? `🎉 正解です。<br><small>${escapeHtml(current.verb.en || '')}</small><br><small>${escapeHtml(StudyContent.formatDueAt(state))}</small>`
        : `正解は <strong>${escapeHtml(current.answer)}</strong> です。<br><small>${escapeHtml(current.verb.en || '')}</small>`;
      div.querySelector('#verb-quiz-next').hidden = false;
      if (isCorrect) playEffect('correct');
      else playEffect('wrong');
    };
    submit.onclick = check;
    input.onkeydown = event => {
      if (event.key === 'Enter') check();
    };
    div.querySelector('#verb-quiz-next').onclick = nextQuestion;
  };

  if (verbs.length === 0) {
    div.innerHTML = '<p class="empty-msg">活用クイズ用のデータがありません。</p>';
  } else {
    nextQuestion();
  }
  return div;
}

window.openFeedbackModal = function() {
  window.open('https://forms.gle/zzKM4A79kHne13bF7', '_blank');
};

window.submitFeedback = function() {
  const name = document.getElementById('fb-name').value.trim();
  const message = document.getElementById('fb-message').value.trim();
  if (!message) {
    alert('内容を入力してください。');
    return;
  }
  const subject = encodeURIComponent('🇪🇸 スペイン語教室: フィードバック');
  const body = encodeURIComponent(`お名前: ${name || '匿名'}

内容:
${message}`);
  window.open(`mailto:kei83suke@gmail.com?subject=${subject}&body=${body}`, '_blank');
  document.querySelector('.modal-overlay').remove();
};

// 5. Scorecard View Dashboard
function renderScorecard() {
  const div = document.createElement('div');
  div.className = 'scorecard-container';
  
  const history = QuizHistory.get();
  const weakWords = QuizHistory.getWeakWords();
  const analytics = StudyAnalytics.getSummary(30);
  const totalAttempts = analytics.answers || history.length;
  const accuracy = analytics.answers ? analytics.accuracy : (history.length ? Math.round((history.filter(h => h.isCorrect).length / history.length) * 100) : 0);
  
  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h2>📈 クイズ学習成績表 (Dashboard)</h2>
    <p>直近30日間の学習状況と、次に伸ばすべき分野を確認できます。</p>`;
  div.appendChild(header);
  
  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';
  statsGrid.innerHTML = `
    <div class="stats-card card-total">
      <div class="stats-num">${totalAttempts}</div>
      <div class="stats-label">総解答数</div>
    </div>
    <div class="stats-card card-accuracy">
      <div class="stats-num">${accuracy}%</div>
      <div class="stats-label">正解率</div>
    </div>
    <div class="stats-card card-weak">
      <div class="stats-num">${weakWords.length}</div>
      <div class="stats-label">要復習単語</div>
    </div>
    <div class="stats-card card-time">
      <div class="stats-num">${analytics.totalMinutes}<small>分</small></div>
      <div class="stats-label">学習時間</div>
    </div>
    <div class="stats-card card-streak">
      <div class="stats-num">${analytics.activeDays}<small>日</small></div>
      <div class="stats-label">継続日数</div>
    </div>
    <div class="stats-card card-level">
      <div class="stats-num">${escapeHtml(analytics.estimatedLevel)}</div>
      <div class="stats-label">アプリ内推定段階</div>
    </div>
  `;
  div.appendChild(statsGrid);

  const categoryEntries = Object.entries(analytics.byCategory)
    .filter(([, value]) => value.total >= 2)
    .map(([category, value]) => ({
      category,
      accuracy: Math.round((value.correct / value.total) * 100),
      total: value.total
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const weakestCategory = categoryEntries[0];
  const analysisSection = document.createElement('div');
  analysisSection.className = 'dashboard-section insight-section';
  analysisSection.innerHTML = `
    <h3>🔎 学習分析</h3>
    <p>${weakestCategory
      ? `「${escapeHtml(weakestCategory.category)}」の正答率が${weakestCategory.accuracy}%です。次回の復習で重点的に扱います。`
      : 'まだ十分な解答データがありません。今日の学習を1セット試してみましょう。'}</p>
    <p class="progress-note">習得目安: ${analytics.mastered} / ${analytics.totalWords}語（30日間の学習データから算出）</p>
  `;
  div.appendChild(analysisSection);
  
  const weakSection = document.createElement('div');
  weakSection.className = 'dashboard-section';
  
  let weakListHTML = '';
  if (weakWords.length === 0) {
    weakListHTML = `<p class="empty-msg">現在、苦手な単語はありません。素晴らしいですね！</p>`;
  } else {
    weakListHTML = `
      <div style="display: flex; gap: 10px; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="appState.navigate('quiz', 'weak', '4choice')">🤔 苦手な単語で4択</button>
        <button class="btn btn-primary" onclick="appState.navigate('quiz', 'weak', 'spelling')">✍️ 苦手な単語でスペル</button>
        <button class="btn btn-outline" id="clear-history-btn">🗑️ 全データをクリア</button>
      </div>
      <div class="weak-words-list">
    `;
    weakWords.forEach((word, idx) => {
      const gInfo = genresInfo.find(g => g.id === word.genre) || { label: 'その他', color: 'var(--primary)' };
      weakListHTML += `
        <div class="weak-word-row">
          <div class="word-info">
            <span class="genre-badge badge-sm" style="background-color: ${gInfo.color}">${gInfo.label}</span>
            <span class="weak-es-text" onclick="playAudio('${word.es.replace(/'/g, "\\'")}')">${word.es}</span>
            <span class="weak-meaning">${word.ja} <span class="text-mute">/ ${word.en}</span></span>
          </div>
          <button class="btn btn-sm btn-outline remove-weak-btn" data-idx="${idx}">克服! ✨</button>
        </div>
      `;
    });
    weakListHTML += `</div>`;
  }
  
  weakSection.innerHTML = `<h3>⚠️ 克服すべき苦手な単語 (${weakWords.length})</h3>` + weakListHTML;
  div.appendChild(weakSection);
  
  const historySection = document.createElement('div');
  historySection.className = 'dashboard-section';
  
  let historyHTML = '';
  if (history.length === 0) {
    historyHTML = `<p class="empty-msg">まだクイズの解答データがありません。クイズを解いてみましょう！</p>`;
  } else {
    historyHTML = `<div class="history-list">`;
    const recent = [...history].reverse().slice(0, 15);
    recent.forEach(h => {
      const gInfo = genresInfo.find(g => g.id === h.genre) || { label: 'その他', color: 'var(--primary)' };
      const statusBadge = h.isCorrect 
        ? `<span class="status-badge correct">正解</span>`
        : `<span class="status-badge wrong">不正解</span>`;
      const timeStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      historyHTML += `
        <div class="history-row">
          <div class="history-left">
            <span class="history-time">${timeStr}</span>
            <span class="genre-badge badge-sm" style="background-color: ${gInfo.color}">${gInfo.label}</span>
            <span class="history-word" onclick="playAudio('${h.es.replace(/'/g, "\\'")}')">${h.es}</span>
            <span class="history-meaning">${h.ja}</span>
          </div>
          ${statusBadge}
        </div>
      `;
    });
    historyHTML += `</div>`;
  }
  
  historySection.innerHTML = `<h3>🕒 最近のクイズ解答履歴</h3>` + historyHTML;
  div.appendChild(historySection);
  
  setTimeout(() => {
    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('すべてのクイズ解答履歴と苦手な単語リストをリセットしますか？')) {
          QuizHistory.clear();
          render();
        }
      };
    }
    
    div.querySelectorAll('.remove-weak-btn').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        let list = QuizHistory.getWeakWords();
        list.splice(idx, 1);
        QuizHistory.saveWeakWords(list);
        render();
      };
    });
  }, 0);
  
  return div;
}

// Hash-change Router Dispatcher
function handleRouting() {
  const hash = location.hash || '#home';
  const queryIndex = hash.indexOf('?');
  const pathPart = queryIndex !== -1 ? hash.substring(0, queryIndex) : hash;
  const queryPart = queryIndex !== -1 ? hash.substring(queryIndex + 1) : '';
  
  const params = {};
  if (queryPart) {
    queryPart.split('&').forEach(pair => {
      const [key, val] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    });
  }
  
  const segments = pathPart.substring(1).split('/');
  const view = segments[0] || 'home';
  const genreId = segments[1] || null;
  const quizMode = segments[2] || null;
  
  appState.currentView = view;
  if (view === 'quiz') {
    appState.currentView = 'study';
  }
  appState.currentGenre = genreId;
  appState.quizMode = quizMode;
  appState.currentCategory = params.cat || 'All';
  appState.currentPage = params.page ? parseInt(params.page, 10) : 1;
  appState.searchQuery = params.q || null;
  appState.weakOnly = params.weak === '1';
  
  render();
  updateMenuHighlight();
}

// --- Review Later Page ---
function renderReviewLater() {
  const div = document.createElement('div');
  const queue = SwipeManager.getReviewLater();

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h2>📝 後で復習 (Review Later)</h2>
    <p>単語カードで「後で復習」に振り分けた単語のリストです。</p>
    <button class="btn btn-outline mt-2" onclick="appState.navigate('home')">← ホームに戻る</button>`;
  div.appendChild(header);

  if (queue.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.innerHTML = '復習リストは空です。<br>単語カードで「後で復習」に振り分けた単語がここに表示されます。';
    div.appendChild(msg);
    return div;
  }

  // Inject genre property if not present
  queue.forEach(word => {
    if (!word.genre) {
      const g = genresInfo.find(g => db[g.id] && db[g.id].some(w => w.es === word.es));
      word.genre = g ? g.id : 'prepositions';
    }
  });

  const availableGenres = [...new Set(queue.map(w => w.genre))];
  const currentGenreFilter = appState.currentGenre || 'All';
  
  let filteredQueue = currentGenreFilter === 'All' ? queue : queue.filter(w => w.genre === currentGenreFilter);
  
  const availableCategories = [...new Set(filteredQueue.flatMap(getWordCategories))];
  const currentCategoryFilter = appState.currentCategory || 'All';

  if (currentCategoryFilter !== 'All') {
    filteredQueue = filteredQueue.filter(w => hasWordCategory(w, currentCategoryFilter));
  }

  const filterContainer = document.createElement('div');
  filterContainer.style.display = 'flex';
  filterContainer.style.gap = '10px';
  filterContainer.style.justifyContent = 'center';
  filterContainer.style.flexWrap = 'wrap';
  filterContainer.style.marginBottom = '1.5rem';

  let genreOptions = `<option value="All">すべての品詞 (All)</option>`;
  availableGenres.forEach(gId => {
    const gInfo = genresInfo.find(g => g.id === gId);
    if(gInfo) {
      genreOptions += `<option value="${gId}" ${currentGenreFilter === gId ? 'selected' : ''}>${gInfo.label}</option>`;
    }
  });

  let catOptions = `<option value="All">すべてのカテゴリー (All)</option>`;
  availableCategories.forEach(cat => {
    catOptions += `<option value="${cat}" ${currentCategoryFilter === cat ? 'selected' : ''}>${cat}</option>`;
  });

  filterContainer.innerHTML = `
    <select id="review-genre-select" class="category-select" style="min-width: 200px; margin-top: 0; padding: 0.6rem 1.5rem; font-size: 1rem;">${genreOptions}</select>
    <select id="review-cat-select" class="category-select" style="min-width: 200px; margin-top: 0; padding: 0.6rem 1.5rem; font-size: 1rem;">${catOptions}</select>
  `;

  const actions = document.createElement('div');
  actions.className = 'dashboard-section';
  actions.appendChild(filterContainer);
  
  const grid = document.createElement('div');
  grid.className = 'flashcard-grid';
  actions.appendChild(grid);
  
  div.appendChild(actions);

  setTimeout(() => {
    const genreSelect = document.getElementById('review-genre-select');
    const catSelect = document.getElementById('review-cat-select');
    
    if(genreSelect) {
      genreSelect.onchange = (e) => {
        appState.navigate('reviewlater', e.target.value === 'All' ? null : e.target.value, null, null, { cat: 'All' });
      };
    }
    if(catSelect) {
      catSelect.onchange = (e) => {
        appState.navigate('reviewlater', currentGenreFilter === 'All' ? null : currentGenreFilter, null, null, { cat: e.target.value });
      };
    }
  }, 0);

  if (filteredQueue.length === 0) {
    grid.innerHTML = '<p class="empty-msg" style="width: 100%; grid-column: 1 / -1;">該当する単語がありません。</p>';
    return div;
  }

  filteredQueue.forEach(word => {
    const genreId = word.genre;
    let genderMarker = '';
    let backColorClass = '';
    
    if (genreId === 'nouns') {
      const esLower = word.es.toLowerCase();
      if (esLower.includes('el/la') || esLower.includes('los/las') || esLower.includes(' un/una ')) {
        genderMarker = '<span class="gender-mark both">m/f</span>';
        backColorClass = 'bg-white';
      } else if (esLower.startsWith('el ') || esLower.startsWith('los ') || esLower.startsWith('un ') || esLower.startsWith('unos ')) {
        genderMarker = '<span class="gender-mark masculine">m</span>';
        backColorClass = 'bg-blue';
      } else if (esLower.startsWith('la ') || esLower.startsWith('las ') || esLower.startsWith('una ') || esLower.startsWith('unas ')) {
        genderMarker = '<span class="gender-mark feminine">f</span>';
        backColorClass = 'bg-pink';
      } else {
        backColorClass = 'bg-white';
      }
    }

    const card = document.createElement('div');
    card.className = 'flashcard';
    card.innerHTML = `
      <div class="flashcard-inner">
        <div class="card-face front">
          <div class="word-ja">${word.ja}</div>
          <div class="word-en">${word.en}</div>
          <button class="card-review-btn in-review">覚えた! ✨</button>
        </div>
        <div class="card-face back ${backColorClass}">
          ${genderMarker}
          <div class="word-es ${backColorClass === 'bg-white' ? 'text-dark' : ''}">${word.es}</div>
        </div>
      </div>
    `;
    
    card.onclick = () => {
      card.classList.toggle('flipped');
      if (card.classList.contains('flipped')) {
        LearningStore.markViewed(word, genreId);
        playAudio(word.es);
      }
    };
    
    card.querySelector('.card-review-btn').onclick = (e) => {
      e.stopPropagation();
      SwipeManager.removeReviewLater(WordIdentity.key(word, genreId));
      SwipeManager.addMemorized(word);
      appState.navigate('reviewlater', appState.currentGenre, null, null, { cat: appState.currentCategory });
    };

    grid.appendChild(card);
  });

  return div;
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', handleRouting);
  handleRouting();
});
