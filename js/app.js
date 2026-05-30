// State management
const appState = {
  currentView: 'home',
  currentGenre: null,
  currentCategory: 'All',
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
    return JSON.parse(localStorage.getItem('es_quiz_history')) || [];
  },
  save(history) {
    localStorage.setItem('es_quiz_history', JSON.stringify(history));
  },
  logAttempt(word, isCorrect, mode) {
    const history = this.get();
    history.push({
      es: word.es,
      ja: word.ja,
      en: word.en,
      genre: appState.currentGenre,
      category: word.category || 'その他',
      mode: mode,
      isCorrect: isCorrect,
      timestamp: Date.now()
    });
    if (history.length > 1000) history.shift();
    this.save(history);
    
    let weakWords = this.getWeakWords();
    const key = word.es;
    if (isCorrect) {
      weakWords = weakWords.filter(w => w.es !== key);
    } else {
      if (!weakWords.some(w => w.es === key)) {
        weakWords.push({
          es: word.es,
          ja: word.ja,
          en: word.en,
          genre: appState.currentGenre,
          category: word.category || 'その他'
        });
      }
    }
    this.saveWeakWords(weakWords);
  },
  getWeakWords() {
    return JSON.parse(localStorage.getItem('es_weak_words')) || [];
  },
  saveWeakWords(words) {
    localStorage.setItem('es_weak_words', JSON.stringify(words));
  },
  clear() {
    localStorage.removeItem('es_quiz_history');
    localStorage.removeItem('es_weak_words');
  }
};

// Swipe Data Manager
const SwipeManager = {
  getMemorized() {
    return JSON.parse(localStorage.getItem('es_memorized_words') || '[]');
  },
  addMemorized(word) {
    const list = this.getMemorized();
    if (!list.find(w => w.es === word.es)) {
      list.push(word);
      localStorage.setItem('es_memorized_words', JSON.stringify(list));
    }
  },
  getReviewLater() {
    return JSON.parse(localStorage.getItem('es_review_later') || '[]');
  },
  addReviewLater(word) {
    const list = this.getReviewLater();
    if (!list.find(w => w.es === word.es)) {
      list.push(word);
      localStorage.setItem('es_review_later', JSON.stringify(list));
    }
  },
  removeReviewLater(wordEs) {
    const list = this.getReviewLater();
    const filtered = list.filter(w => w.es !== wordEs);
    localStorage.setItem('es_review_later', JSON.stringify(filtered));
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

window.playAudio = function(text) {
  if (!text) return;
  
  const cleanText = formatSpanishAudioText(text);

  // iOSやスマホの仕様で、非同期（Promiseの中など）で音声を鳴らそうとするとブロックされるため、
  // 必ず同期的に動作する Web Speech API (speechSynthesis) を優先して実行します。
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const esVoices = voices.filter(v => v.lang.startsWith('es'));
    let esVoice = esVoices.find(v => v.name.toLowerCase().includes('premium'))
               || esVoices.find(v => v.name.toLowerCase().includes('enhanced'))
               || esVoices.find(v => v.name.toLowerCase().includes('google'))
               || esVoices.find(v => v.lang === 'es-ES')
               || esVoices[0];
               
    if (esVoice) utterance.voice = esVoice;
    
    // エラー時のフォールバックとしてGoogle TTSを利用
    utterance.onerror = (e) => {
      console.log('SpeechSynthesis failed, falling back to Google TTS');
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=es&client=tw-ob`;
      const audio = new Audio(url);
      audio.play().catch(err => console.error(err));
    };
    
    window.speechSynthesis.speak(utterance);
  } else {
    // speechSynthesis非対応ブラウザ用
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=es&client=tw-ob`;
    const audio = new Audio(url);
    audio.play().catch(e => console.error(e));
  }
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
    content.appendChild(renderQuiz(appState.currentGenre, appState.quizMode));
  } else if (appState.currentView === 'conjugations') {
    content.appendChild(renderConjugations());
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
    activeId = `menu-${appState.currentGenre}`;
  } else if (appState.currentView === 'conjugations') {
    activeId = 'menu-conjugations';
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
  
  const title = document.createElement('h1');
  title.innerHTML = '学習するジャンルを選んでください';
  div.appendChild(title);

  // 活用表と成績表ボタンを配置
  const topActions = document.createElement('div');
  topActions.className = 'top-actions';
  topActions.style.display = 'flex';
  topActions.style.justifyContent = 'space-between';
  topActions.style.alignItems = 'center';
  topActions.style.marginBottom = '4rem';
  topActions.style.position = 'relative';

  const btnScoreTop = document.createElement('button');
  btnScoreTop.className = 'btn btn-primary';
  btnScoreTop.style.fontSize = '0.9rem';
  btnScoreTop.style.padding = '0.6rem 1.2rem';
  btnScoreTop.style.borderRadius = '12px';
  btnScoreTop.style.background = 'linear-gradient(135deg, #FF6B6B, #FF8E8B)';
  btnScoreTop.style.color = 'white';
  btnScoreTop.style.border = 'none';
  btnScoreTop.innerHTML = '📈 クイズ成績表';
  btnScoreTop.onclick = () => appState.navigate('scorecard');

  const btnConjTop = document.createElement('button');
  btnConjTop.className = 'btn btn-primary';
  btnConjTop.style.fontSize = '1.8rem';
  btnConjTop.style.padding = '1.5rem 4rem';
  btnConjTop.style.borderRadius = '30px';
  btnConjTop.style.boxShadow = '0 15px 30px rgba(78, 205, 196, 0.3)';
  btnConjTop.style.background = 'linear-gradient(135deg, #4ECDC4, #2ecc71)';
  btnConjTop.style.color = 'white';
  btnConjTop.style.border = 'none';
  btnConjTop.style.position = 'absolute';
  btnConjTop.style.left = '50%';
  btnConjTop.style.transform = 'translateX(-50%)';
  btnConjTop.innerHTML = '✨ 動詞の活用表';
  btnConjTop.onclick = () => appState.navigate('conjugations');

  const btnReviewLater = document.createElement('button');
  btnReviewLater.className = 'btn btn-outline';
  btnReviewLater.style.fontSize = '0.9rem';
  btnReviewLater.style.padding = '0.6rem 1.2rem';
  btnReviewLater.style.borderRadius = '12px';
  btnReviewLater.innerHTML = '📝 後で復習';
  btnReviewLater.onclick = () => appState.navigate('reviewlater');

  topActions.appendChild(btnScoreTop);
  topActions.appendChild(btnConjTop);
  topActions.appendChild(btnReviewLater);
  div.appendChild(topActions);

  const grid = document.createElement('div');
  grid.className = 'genre-grid';

  genresInfo.forEach(genre => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.style.borderTop = `6px solid ${genre.color}`;
    
    card.innerHTML = `
      <div class="genre-icon">${genre.icon}</div>
      <h2>${genre.label}</h2>
      <p>${genre.enLabel} (${db[genre.id].length}語)</p>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'genre-actions';
    
    const btnLearn = document.createElement('button');
    btnLearn.className = 'btn btn-outline w-full';
    btnLearn.innerHTML = '📖 単語一覧';
    btnLearn.onclick = (e) => { e.stopPropagation(); appState.navigate('flashcards', genre.id); };
    actions.appendChild(btnLearn);



    const quizLabel = document.createElement('p');
    quizLabel.className = 'quiz-label';
    quizLabel.textContent = '▼ テスト形式を選ぶ ▼';
    actions.appendChild(quizLabel);

    const quizModes = document.createElement('div');
    quizModes.className = 'quiz-modes';
    
    const btn4Choice = document.createElement('button');
    btn4Choice.className = 'btn btn-secondary btn-sm';
    btn4Choice.textContent = '4択';
    btn4Choice.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, '4choice'); };
    
    const btnListening = document.createElement('button');
    btnListening.className = 'btn btn-secondary btn-sm';
    btnListening.textContent = '音声';
    btnListening.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, 'listening'); };

    const btnSpelling = document.createElement('button');
    btnSpelling.className = 'btn btn-secondary btn-sm';
    btnSpelling.textContent = 'スペル';
    btnSpelling.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, 'spelling'); };

    quizModes.appendChild(btn4Choice);
    quizModes.appendChild(btnListening);
    quizModes.appendChild(btnSpelling);
    actions.appendChild(quizModes);
    
    card.appendChild(actions);
    grid.appendChild(card);
  });

  div.appendChild(grid);
  return div;
}

// 2. Flashcards Screen
function renderFlashcards(genreId) {
  const div = document.createElement('div');
  div.className = 'flashcards-container';
  
  const genreInfo = genresInfo.find(g => g.id === genreId);
  const allWords = db[genreId];
  
  // Categories
  const categories = [...new Set(allWords.map(w => w.category || 'その他'))];
  const hasCategories = categories.length > 1 || (categories.length === 1 && categories[0] !== 'その他');

  const words = appState.currentCategory === 'All' 
    ? allWords 
    : allWords.filter(w => (w.category || 'その他') === appState.currentCategory);

  const header = document.createElement('div');
  header.className = 'view-header';
  
  let headerHTML = `<h2>${genreInfo.icon} ${genreInfo.label} (${genreInfo.enLabel})</h2>
    <p>日本語・英語をタップすると、裏返ってスペイン語が発音されます。</p>`;
  
  header.innerHTML = headerHTML;
  div.appendChild(header);

  // --- Sticky Quick-Nav Bar ---
  const quickNav = document.createElement('div');
  quickNav.className = 'quick-nav-bar';
  quickNav.id = 'quick-nav-bar';

  let catSelectHTML = '';
  if (hasCategories) {
    let options = `<option value="All">📂 すべて</option>`;
    categories.forEach(cat => {
      options += `<option value="${cat}" ${appState.currentCategory === cat ? 'selected' : ''}>${cat}</option>`;
    });
    catSelectHTML = `<select id="category-select" class="quick-nav-select">${options}</select>`;
  }

  quickNav.innerHTML = `
    ${catSelectHTML}
    <button class="quick-nav-btn quiz-nav" onclick="appState.navigate('quiz', '${genreId}', '4choice')">🤔 4択クイズ</button>
    <button class="quick-nav-btn listen-nav" onclick="appState.navigate('quiz', '${genreId}', 'listening')">🎧 音声クイズ</button>
    <button class="quick-nav-btn spell-nav" onclick="appState.navigate('quiz', '${genreId}', 'spelling')">✍️ スペルクイズ</button>
  `;
  div.appendChild(quickNav);

  // Set sticky top offset dynamically based on header height
  setTimeout(() => {
    const headerEl = document.querySelector('.header-wrapper');
    if (headerEl) {
      const navBar = document.getElementById('quick-nav-bar');
      if (navBar) navBar.style.top = `${headerEl.offsetHeight}px`;
    }
  }, 0);

  if (hasCategories) {
    setTimeout(() => {
      const select = document.getElementById('category-select');
      if(select) {
        select.onchange = (e) => {
          appState.navigate('flashcards', genreId, null, appState.searchQuery, {
            cat: e.target.value,
            page: 1,
            weakOnly: appState.weakOnly
          });
        };
      }
    }, 0);
  }

  // Top Pagination
  const totalPages = Math.ceil(words.length / appState.itemsPerPage);
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages));
  }

  const grid = document.createElement('div');
  grid.className = 'flashcard-grid';

  const startIndex = (appState.currentPage - 1) * appState.itemsPerPage;
  const currentWords = words.slice(startIndex, startIndex + appState.itemsPerPage);

  currentWords.forEach(word => {
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

    const isInReview = SwipeManager.getReviewLater().some(w => w.es === word.es);
    const reviewBtnLabel = isInReview ? '📝 復習中' : '+ 後で復習';
    const reviewBtnClass = isInReview ? 'card-review-btn in-review' : 'card-review-btn';

    const conjLinkHTML = genreId === 'verbs'
      ? `<div class="conj-link" onclick="event.stopPropagation(); appState.verbReturnPage=${appState.currentPage}; appState.verbReturnCat='${(appState.currentCategory||'All').replace(/'/g,"\\'")}'; appState.navigate('conjugations', null, null, '${word.es.replace(/'/g, "\\'")}')">Conjugación ↗</div>`
      : '';

    const card = document.createElement('div');
    card.className = 'flashcard';
    card.innerHTML = `
      <div class="flashcard-inner">
        <div class="card-face front">
          <div class="word-ja">${word.ja}</div>
          <div class="word-en">${word.en}</div>
          <button class="${reviewBtnClass}">${reviewBtnLabel}</button>
        </div>
        <div class="card-face back ${backColorClass}">
          ${genderMarker}
          <div class="word-es ${backColorClass === 'bg-white' ? 'text-dark' : ''}">${word.es}</div>
          ${conjLinkHTML}
        </div>
      </div>
    `;

    card.onclick = () => {
      card.classList.toggle('flipped');
      if (card.classList.contains('flipped')) playAudio(word.es);
    };

    card.querySelector('.card-review-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      if (SwipeManager.getReviewLater().some(w => w.es === word.es)) {
        SwipeManager.removeReviewLater(word.es);
        btn.textContent = '+ 後で復習';
        btn.classList.remove('in-review');
      } else {
        SwipeManager.addReviewLater({ ...word, genre: genreId });
        btn.textContent = '📝 復習中';
        btn.classList.add('in-review');
      }
    });

    grid.appendChild(card);
  });

  div.appendChild(grid);

  // Bottom Pagination
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages));
  }

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
  
  const categories = [...new Set(words.map(w => w.category || 'その他'))];
  const hasCategories = categories.length > 1 || (categories.length === 1 && categories[0] !== 'その他');

  if (appState.currentCategory !== 'All') {
    words = words.filter(w => (w.category || 'その他') === appState.currentCategory);
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

  // Back to verbs list button (restore page & category)
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-outline conj-back-btn';
  backBtn.innerHTML = '← 動詞一覧に戻る';
  backBtn.onclick = () => appState.navigate('flashcards', 'verbs', null, null, {
    page: appState.verbReturnPage || 1,
    cat: appState.verbReturnCat || 'All'
  });
  header.appendChild(backBtn);
  
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
  
  const renderCards = (filterText) => {
    cardsContainer.innerHTML = '';
    topPageNavContainer.innerHTML = '';
    bottomPageNavContainer.innerHTML = '';
    
    const filteredVerbs = verbs.filter(v => 
      v.es.toLowerCase().includes(filterText.toLowerCase()) || 
      v.ja.includes(filterText) ||
      v.en.toLowerCase().includes(filterText.toLowerCase())
    );

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
            <p>${verb.ja} / ${verb.en}</p>
          </div>
          <div class="arrow">▼</div>
        </div>
        <div class="conj-tables accordion-content">
      `;
      
      for (const [tense, forms] of Object.entries(verb.conjugations)) {
        if (tense.includes('分詞')) {
          html += `
            <div class="conj-table-wrap">
              <h4>${tense}</h4>
              <table class="conj-table">
                <tr><td>過去分詞 (Participio)</td><td class="es-text" onclick="playAudio('${forms.yo}')">${forms.yo}</td></tr>
                <tr><td>現在分詞 (Gerundio)</td><td class="es-text" onclick="playAudio('${forms.tu}')">${forms.tu}</td></tr>
              </table>
            </div>
          `;
        } else {
          html += `
            <div class="conj-table-wrap">
              <h4>${tense}</h4>
              <table class="conj-table">
                <tr><td>yo</td><td class="es-text" onclick="playAudio('${forms.yo}')">${forms.yo}</td></tr>
                <tr><td>tú</td><td class="es-text" onclick="playAudio('${forms.tu}')">${forms.tu}</td></tr>
                <tr><td>él/ella/Ud.</td><td class="es-text" onclick="playAudio('${forms['el/ella']}')">${forms['el/ella']}</td></tr>
                <tr><td>nosotros</td><td class="es-text" onclick="playAudio('${forms.nosotros}')">${forms.nosotros}</td></tr>
                <tr><td>ellos/ellas/Uds.</td><td class="es-text" onclick="playAudio('${forms.ellos}')">${forms.ellos}</td></tr>
              </table>
            </div>
          `;
        }
      }
      
      html += `</div>`;
      card.innerHTML = html;
      cardsContainer.appendChild(card);
    });

    if (totalPages > 1) {
      bottomPageNavContainer.appendChild(createPaginationDOM(appState.currentPage, totalPages, () => renderCards(filterText)));
    }
  };

  setTimeout(() => {
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
  
  const totalAttempts = history.length;
  const correctAttempts = history.filter(h => h.isCorrect).length;
  const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
  
  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h2>📈 クイズ学習成績表 (Dashboard)</h2>
    <p>あなたの学習履歴と苦手な単語の確認・再テストが行えます。</p>`;
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
  `;
  div.appendChild(statsGrid);
  
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
    <p>スワイプ暗記で「後で復習」に振り分けた単語のリストです。</p>
    <button class="btn btn-outline mt-2" onclick="appState.navigate('home')">← ホームに戻る</button>`;
  div.appendChild(header);

  if (queue.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg';
    msg.innerHTML = '復習リストは空です。<br>スワイプ暗記カードで「後で復習」に振り分けた単語がここに表示されます。';
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
  
  const availableCategories = [...new Set(filteredQueue.map(w => w.category || 'その他'))];
  const currentCategoryFilter = appState.currentCategory || 'All';

  if (currentCategoryFilter !== 'All') {
    filteredQueue = filteredQueue.filter(w => (w.category || 'その他') === currentCategoryFilter);
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
        playAudio(word.es);
      }
    };
    
    card.querySelector('.card-review-btn').onclick = (e) => {
      e.stopPropagation();
      SwipeManager.removeReviewLater(word.es);
      SwipeManager.addMemorized(word);
      appState.navigate('reviewlater', appState.currentGenre, null, null, { cat: appState.currentCategory });
    };

    grid.appendChild(card);
  });

  return div;
}

let audioUnlocked = false;
function unlockAudio() {
  if (!audioUnlocked) {
    const dummy = new Audio();
    dummy.play().catch(() => {});
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(u);
    }
    audioUnlocked = true;
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
  }
}
document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
document.addEventListener('click', unlockAudio, { once: true, passive: true });

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', handleRouting);
  handleRouting();
});

// AI Chat removed per user request

