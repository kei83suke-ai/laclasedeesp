// State management
const appState = {
  currentView: 'home',
  currentGenre: null,
  currentCategory: 'All',// State management
const appState = {
  currentView: 'home',
  currentGenre: null,
  currentCategory: 'All',
  quizMode: null,
  currentPage: 1,
  itemsPerPage: 50,
  searchQuery: null,
  
  navigate(view, genreId = null, quizMode = null, searchQuery = null) {
    this.currentView = view;
    if (genreId && this.currentGenre !== genreId) {
      this.currentGenre = genreId;
      this.currentCategory = 'All'; // ジャンルが変わったらカテゴリリセット
    }
    this.quizMode = quizMode;
    this.currentPage = 1;
    this.searchQuery = searchQuery;
    render();
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
  buttons[0].onclick = () => { appState.currentPage--; renderCallback(); };
  buttons[1].onclick = () => { appState.currentPage++; renderCallback(); };
  return pageNav;
}

function formatSpanishAudioText(text) {
  // カッコ内を除去
  let clean = text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
  if (!clean.includes('/')) return clean;

  // スラッシュ前後のスペースを統一
  clean = clean.replace(/\s*\/\s*/g, '/');

  // 各単語をスラッシュで展開してバリアントリストにする
  const tokens = clean.split(' ');

  // 各トークンについて、展開されたバリアント配列を作る
  const expanded = tokens.map(token => {
    if (!token.includes('/')) return [token];

    const parts = token.split('/');
    const first = parts[0];
    const variants = [first];

    for (let i = 1; i < parts.length; i++) {
      const suf = parts[i];
      // 冠詞・独立した単語（2文字以上かつ母音を含む）はそのまま使う
      const isStandaloneWord = suf.length >= 2 && /[aeiouáéíóú]/i.test(suf) &&
        ['la', 'las', 'los', 'una', 'unos', 'unas', 'un'].includes(suf.toLowerCase());
      
      if (isStandaloneWord || ['el','la','los','las','un','una','unos','unas'].includes(suf.toLowerCase())) {
        variants.push(suf);
      } else {
        // 語尾変化: "o/a" → "o", "a"; "os/as" → etc.
        let stem = first;
        if (suf === 'a' && first.endsWith('o')) stem = first.slice(0, -1);
        else if (suf === 'as' && first.endsWith('os')) stem = first.slice(0, -2);
        else if (suf === 'as' && first.endsWith('o')) stem = first.slice(0, -1);
        else if (suf === 'os' && first.endsWith('o')) stem = first.slice(0, -1);
        else if (suf.length === 1) stem = first; // 1文字の語尾はそのまま付ける
        variants.push(stem + suf);
      }
    }
    return variants;
  });

  // 最大バリアント数を求める
  const maxVariants = Math.max(...expanded.map(v => v.length));

  // 各バリアントインデックスで1フレーズを作る（位置ごとに対応させる）
  const phrases = [];
  for (let i = 0; i < maxVariants; i++) {
    const phrase = expanded.map(v => v[Math.min(i, v.length - 1)]).join(' ');
    phrases.push(phrase);
  }

  // 重複を除いて連結
  const unique = [...new Set(phrases)];
  return unique.join(', ');
}

window.playAudio = function(text) {
  if (!text) return;
  const cleanText = formatSpanishAudioText(text);
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('google'))
                 || voices.find(v => v.lang === 'es-ES')
                 || voices.find(v => v.lang.startsWith('es'));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length > 0) {
    speak();
  } else {
    window.speechSynthesis.onvoiceschanged = speak;
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
  const navActions = document.getElementById('nav-actions');
  content.innerHTML = '';
  navActions.innerHTML = '';

  if (appState.currentView === 'home') {
    content.appendChild(renderHome());
  } else if (appState.currentView === 'flashcards') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderFlashcards(appState.currentGenre));
  } else if (appState.currentView === 'quiz') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderQuiz(appState.currentGenre, appState.quizMode));
  } else if (appState.currentView === 'conjugations') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderConjugations());
  }
}

// 1. Home Screen
function renderHome() {
  const div = document.createElement('div');
  div.className = 'home-container';
  
  const title = document.createElement('h1');
  title.innerHTML = '学習するジャンルを選んでください<br><span class="subtitle">Select a genre to study</span>';
  div.appendChild(title);

  // 活用表ボタンを一番上に配置
  const topActions = document.createElement('div');
  topActions.className = 'top-actions';
  const btnConjTop = document.createElement('button');
  btnConjTop.className = 'btn btn-primary';
  btnConjTop.style.fontSize = '1.8rem';
  btnConjTop.style.padding = '1.5rem 4rem';
  btnConjTop.style.borderRadius = '20px';
  btnConjTop.style.boxShadow = '0 10px 20px rgba(78, 205, 196, 0.2)';
  btnConjTop.style.background = 'linear-gradient(135deg, #4ECDC4, #2ecc71)';
  btnConjTop.style.color = 'white';
  btnConjTop.style.border = 'none';
  btnConjTop.innerHTML = '✨ 動詞の活用表 ✨';
  btnConjTop.onclick = () => appState.navigate('conjugations');
  topActions.appendChild(btnConjTop);
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
    btnLearn.className = 'btn btn-primary w-full';
    btnLearn.innerHTML = '📖 単語一覧・暗記カード';
    btnLearn.onclick = (e) => { e.stopPropagation(); appState.navigate('flashcards', genre.id); };
    actions.appendChild(btnLearn);

    const quizLabel = document.createElement('p');
    quizLabel.className = 'quiz-label';
    quizLabel.textContent = '▼ テスト形式を選ぶ ▼';
    actions.appendChild(quizLabel);

    const quizModes = document.createElement('div');
    quizModes.className = 'quiz-modes';
    quizModes.style.gridTemplateColumns = '1fr 1fr';
    
    const btn4Choice = document.createElement('button');
    btn4Choice.className = 'btn btn-secondary btn-sm';
    btn4Choice.textContent = '4択クイズ';
    btn4Choice.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, '4choice'); };
    
    const btnListening = document.createElement('button');
    btnListening.className = 'btn btn-secondary btn-sm';
    btnListening.textContent = 'リスニング';
    btnListening.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, 'listening'); };

    quizModes.appendChild(btn4Choice);
    quizModes.appendChild(btnListening);
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
          appState.currentCategory = e.target.value;
          appState.currentPage = 1;
          render();
        };
      }
    }, 0);
  }

  // Top Pagination
  const totalPages = Math.ceil(words.length / appState.itemsPerPage);
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages, render));
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
      // "un/una" or "el/la" or "los/las" -> both
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
        </div>
        <div class="card-face back ${backColorClass}">
          ${genderMarker}
          <div class="word-es ${backColorClass === 'bg-white' ? 'text-dark' : ''}">${word.es}</div>
          ${genreId === 'verbs' ? `<div class="conj-link" onclick="event.stopPropagation(); appState.navigate('conjugations', null, null, '${word.es.replace(/'/g, "\\'")}')">Conjugación ↗</div>` : ''}
        </div>
      </div>
    `;
    
    card.onclick = () => {
      card.classList.toggle('flipped');
      if (card.classList.contains('flipped')) {
        playAudio(word.es);
      }
    };
    
    grid.appendChild(card);
  });

  div.appendChild(grid);

  // Bottom Pagination
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages, render));
  }

  return div;
}

// 3. Quiz Screen
function renderQuiz(genreId, mode) {
  const div = document.createElement('div');
  div.className = 'quiz-container';
  
  const allWords = db[genreId];
  const categories = [...new Set(allWords.map(w => w.category || 'その他'))];
  const hasCategories = categories.length > 1 || (categories.length === 1 && categories[0] !== 'その他');

  const words = appState.currentCategory === 'All' 
    ? allWords 
    : allWords.filter(w => (w.category || 'その他') === appState.currentCategory);

  const header = document.createElement('div');
  header.className = 'view-header';
  
  let headerText = '';
  if (mode === '4choice') headerText = '🤔 4択クイズ: 以下の意味を表すスペイン語は何でしょう？';
  if (mode === 'listening') headerText = '🎧 リスニング: 音声を聞いて、正しい意味を選んでください。';
  
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
          appState.currentCategory = e.target.value;
          render();
        };
      }
    }, 0);
  }

  if (words.length < 4) {
    div.innerHTML += '<p style="margin-top:2rem; background:white; padding:2rem; border-radius:12px;">このカテゴリーにはクイズを行うための単語（最低4つ）が不足しています。別のカテゴリーを選択してください。</p>';
    return div;
  }

  const targetIndex = Math.floor(Math.random() * words.length);
  const targetWord = words[targetIndex];
  
  let choices = [targetWord];
  while(choices.length < 4) {
    const randItem = words[Math.floor(Math.random() * words.length)];
    if (!choices.includes(randItem)) {
      choices.push(randItem);
    }
  }
  choices.sort(() => Math.random() - 0.5);

  // Question Area
  const questionCard = document.createElement('div');
  questionCard.className = 'quiz-question';
  
  if (mode === 'listening') {
    // ブラウザの自動再生ブロックを防ぐため、ユーザーのアクションを強制する
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
          playAudio(choice.es); // 回答後はクリックで発音を聞ける
          return;
        }
        answered = true;
        
        // Show Next Button
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        // Show meanings
        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        if (choice.es === targetWord.es) {
          btn.classList.add('correct');
          playEffect('correct');
          playAudio(choice.es); // 正解の発音を再生
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
          playAudio(choice.es); // 回答後はクリックで発音を聞ける
          return;
        }
        answered = true;
        
        // Show Next Button
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        // Show meanings
        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        if (choice.es === targetWord.es) {
          btn.classList.add('correct');
          playEffect('correct');
          setTimeout(() => playAudio(choice.es), 300); // 効果音の直後に正解音声
        } else {
          btn.classList.add('wrong');
          playEffect('wrong');
          Array.from(choicesGrid.children).forEach(childBtn => {
            if (childBtn.innerHTML.includes(targetWord.ja)) {
              childBtn.classList.add('correct');
            }
          });
        }
      };
      choicesGrid.appendChild(btn);
    });
    div.appendChild(choicesGrid);
    
    setTimeout(() => {
      document.getElementById('play-audio-btn').onclick = () => {
        document.getElementById('play-audio-btn').classList.remove('btn-pulse');
        playAudio(targetWord.es);
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
      nextBtn.onclick = () => appState.navigate('quiz', genreId, mode);
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

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  render();
});

  quizMode: null,
  currentPage: 1,
  itemsPerPage: 50,
  searchQuery: null,
  
  navigate(view, genreId = null, quizMode = null, searchQuery = null) {
    this.currentView = view;
    if (genreId && this.currentGenre !== genreId) {
      this.currentGenre = genreId;
      this.currentCategory = 'All'; // ジャンルが変わったらカテゴリリセット
    }
    this.quizMode = quizMode;
    this.currentPage = 1;
    this.searchQuery = searchQuery;
    render();
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
  buttons[0].onclick = () => { appState.currentPage--; renderCallback(); };
  buttons[1].onclick = () => { appState.currentPage++; renderCallback(); };
  return pageNav;
}

function formatSpanishAudioText(text) {
  let clean = text.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').trim();
  if (!clean.includes('/')) return clean;

  // Space cleanup around slashes
  clean = clean.replace(/\s*\/\s*/g, '/');

  const words = clean.split(' ');
  let expandedWords = [];
  let maxVariants = 1;
  
  for (let w of words) {
    if (w.includes('/')) {
      let parts = w.split('/');
      let first = parts[0];
      let variants = [first];
      
      for (let i = 1; i < parts.length; i++) {
        let suf = parts[i];
        
        if (first === 'el' && (suf === 'la' || suf === 'los' || suf === 'las')) {
          variants.push(suf);
        } else if (first === 'un' && (suf === 'una' || suf === 'unos' || suf === 'unas')) {
          variants.push(suf);
        } else if (first === 'los' && suf === 'las') {
          variants.push(suf);
        } else {
          // Suffix logic
          let stem = first;
          if (first.endsWith('o') && (suf === 'a' || suf === 'os' || suf === 'as')) {
             stem = first.slice(0, -1);
          } else if (first.endsWith('os') && suf === 'as') {
             stem = first.slice(0, -2);
          }
          variants.push(stem + suf);
        }
      }
      expandedWords.push(variants);
      maxVariants = Math.max(maxVariants, variants.length);
    } else {
      expandedWords.push([w]);
    }
  }
  
  let results = [];
  for (let i = 0; i < maxVariants; i++) {
    let sentence = [];
    for (let ew of expandedWords) {
      let idx = i < ew.length ? i : ew.length - 1;
      sentence.push(ew[idx]);
    }
    results.push(sentence.join(' '));
  }
  
  return results.join(', ');
}

window.playAudio = function(text) {
  if (!text) return;
  const cleanText = formatSpanishAudioText(text);
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('google'))
                 || voices.find(v => v.lang === 'es-ES')
                 || voices.find(v => v.lang.startsWith('es'));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length > 0) {
    speak();
  } else {
    window.speechSynthesis.onvoiceschanged = speak;
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
  const navActions = document.getElementById('nav-actions');
  content.innerHTML = '';
  navActions.innerHTML = '';

  if (appState.currentView === 'home') {
    content.appendChild(renderHome());
  } else if (appState.currentView === 'flashcards') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderFlashcards(appState.currentGenre));
  } else if (appState.currentView === 'quiz') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderQuiz(appState.currentGenre, appState.quizMode));
  } else if (appState.currentView === 'conjugations') {
    navActions.innerHTML = `<button class="btn btn-outline" onclick="appState.navigate('home')">🏠 ホームへ</button>`;
    content.appendChild(renderConjugations());
  }
}

// 1. Home Screen
function renderHome() {
  const div = document.createElement('div');
  div.className = 'home-container';
  
  const title = document.createElement('h1');
  title.innerHTML = '学習するジャンルを選んでください<br><span class="subtitle">Select a genre to study</span>';
  div.appendChild(title);

  // 活用表ボタンを一番上に配置
  const topActions = document.createElement('div');
  topActions.className = 'top-actions';
  const btnConjTop = document.createElement('button');
  btnConjTop.className = 'btn btn-primary';
  btnConjTop.style.fontSize = '1.8rem';
  btnConjTop.style.padding = '1.5rem 4rem';
  btnConjTop.style.borderRadius = '20px';
  btnConjTop.style.boxShadow = '0 10px 20px rgba(78, 205, 196, 0.2)';
  btnConjTop.style.background = 'linear-gradient(135deg, #4ECDC4, #2ecc71)';
  btnConjTop.style.color = 'white';
  btnConjTop.style.border = 'none';
  btnConjTop.innerHTML = '✨ 動詞の活用表 ✨';
  btnConjTop.onclick = () => appState.navigate('conjugations');
  topActions.appendChild(btnConjTop);
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
    btnLearn.className = 'btn btn-primary w-full';
    btnLearn.innerHTML = '📖 単語一覧・暗記カード';
    btnLearn.onclick = (e) => { e.stopPropagation(); appState.navigate('flashcards', genre.id); };
    actions.appendChild(btnLearn);

    const quizLabel = document.createElement('p');
    quizLabel.className = 'quiz-label';
    quizLabel.textContent = '▼ テスト形式を選ぶ ▼';
    actions.appendChild(quizLabel);

    const quizModes = document.createElement('div');
    quizModes.className = 'quiz-modes';
    quizModes.style.gridTemplateColumns = '1fr 1fr';
    
    const btn4Choice = document.createElement('button');
    btn4Choice.className = 'btn btn-secondary btn-sm';
    btn4Choice.textContent = '4択クイズ';
    btn4Choice.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, '4choice'); };
    
    const btnListening = document.createElement('button');
    btnListening.className = 'btn btn-secondary btn-sm';
    btnListening.textContent = 'リスニング';
    btnListening.onclick = (e) => { e.stopPropagation(); appState.navigate('quiz', genre.id, 'listening'); };

    quizModes.appendChild(btn4Choice);
    quizModes.appendChild(btnListening);
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
          appState.currentCategory = e.target.value;
          appState.currentPage = 1;
          render();
        };
      }
    }, 0);
  }

  // Top Pagination
  const totalPages = Math.ceil(words.length / appState.itemsPerPage);
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages, render));
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
      // "un/una" or "el/la" or "los/las" -> both
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
        </div>
        <div class="card-face back ${backColorClass}">
          ${genderMarker}
          <div class="word-es ${backColorClass === 'bg-white' ? 'text-dark' : ''}">${word.es}</div>
          ${genreId === 'verbs' ? `<div class="conj-link" onclick="event.stopPropagation(); appState.navigate('conjugations', null, null, '${word.es.replace(/'/g, "\\'")}')">Conjugación ↗</div>` : ''}
        </div>
      </div>
    `;
    
    card.onclick = () => {
      card.classList.toggle('flipped');
      if (card.classList.contains('flipped')) {
        playAudio(word.es);
      }
    };
    
    grid.appendChild(card);
  });

  div.appendChild(grid);

  // Bottom Pagination
  if (totalPages > 1) {
    div.appendChild(createPaginationDOM(appState.currentPage, totalPages, render));
  }

  return div;
}

// 3. Quiz Screen
function renderQuiz(genreId, mode) {
  const div = document.createElement('div');
  div.className = 'quiz-container';
  
  const allWords = db[genreId];
  const categories = [...new Set(allWords.map(w => w.category || 'その他'))];
  const hasCategories = categories.length > 1 || (categories.length === 1 && categories[0] !== 'その他');

  const words = appState.currentCategory === 'All' 
    ? allWords 
    : allWords.filter(w => (w.category || 'その他') === appState.currentCategory);

  const header = document.createElement('div');
  header.className = 'view-header';
  
  let headerText = '';
  if (mode === '4choice') headerText = '🤔 4択クイズ: 以下の意味を表すスペイン語は何でしょう？';
  if (mode === 'listening') headerText = '🎧 リスニング: 音声を聞いて、正しい意味を選んでください。';
  
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
          appState.currentCategory = e.target.value;
          render();
        };
      }
    }, 0);
  }

  if (words.length < 4) {
    div.innerHTML += '<p style="margin-top:2rem; background:white; padding:2rem; border-radius:12px;">このカテゴリーにはクイズを行うための単語（最低4つ）が不足しています。別のカテゴリーを選択してください。</p>';
    return div;
  }

  const targetIndex = Math.floor(Math.random() * words.length);
  const targetWord = words[targetIndex];
  
  let choices = [targetWord];
  while(choices.length < 4) {
    const randItem = words[Math.floor(Math.random() * words.length)];
    if (!choices.includes(randItem)) {
      choices.push(randItem);
    }
  }
  choices.sort(() => Math.random() - 0.5);

  // Question Area
  const questionCard = document.createElement('div');
  questionCard.className = 'quiz-question';
  
  if (mode === 'listening') {
    // ブラウザの自動再生ブロックを防ぐため、ユーザーのアクションを強制する
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
          playAudio(choice.es); // 回答後はクリックで発音を聞ける
          return;
        }
        answered = true;
        
        // Show Next Button
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        // Show meanings
        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        if (choice.es === targetWord.es) {
          btn.classList.add('correct');
          playEffect('correct');
          playAudio(choice.es); // 正解の発音を再生
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
          playAudio(choice.es); // 回答後はクリックで発音を聞ける
          return;
        }
        answered = true;
        
        // Show Next Button
        const nextBtn = document.getElementById('next-quiz-btn');
        if (nextBtn) nextBtn.style.display = 'block';

        // Show meanings
        document.querySelectorAll('.choice-meaning').forEach(el => el.style.display = 'block');
        
        if (choice.es === targetWord.es) {
          btn.classList.add('correct');
          playEffect('correct');
          setTimeout(() => playAudio(choice.es), 300); // 効果音の直後に正解音声
        } else {
          btn.classList.add('wrong');
          playEffect('wrong');
          Array.from(choicesGrid.children).forEach(childBtn => {
            if (childBtn.innerHTML.includes(targetWord.ja)) {
              childBtn.classList.add('correct');
            }
          });
        }
      };
      choicesGrid.appendChild(btn);
    });
    div.appendChild(choicesGrid);
    
    setTimeout(() => {
      document.getElementById('play-audio-btn').onclick = () => {
        document.getElementById('play-audio-btn').classList.remove('btn-pulse');
        playAudio(targetWord.es);
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
      nextBtn.onclick = () => appState.navigate('quiz', genreId, mode);
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

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  render();
});
