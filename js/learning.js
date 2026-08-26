/*
 * Learning OS foundation.
 * Keeps the current localStorage-based architecture while adding stable word
 * identities, spaced repetition, learning events, analytics, and scenarios.
 */
(function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STORAGE_KEYS = {
    states: 'es_learning_states_v1',
    events: 'es_learning_events_v1'
  };

  function safeGetJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`保存データを読み込めませんでした: ${key}`, error);
      return fallback;
    }
  }

  function safeSetJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`保存データを書き込めませんでした: ${key}`, error);
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`保存データを削除できませんでした: ${key}`, error);
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[¿¡?!.,;:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rawText(value) {
    return String(value || '').trim();
  }

  window.AppStorage = {
    getJSON: safeGetJSON,
    setJSON: safeSetJSON,
    remove: safeRemove
  };

  window.WordIdentity = {
    key(word, genreId = null) {
      if (!word) return 'unknown';
      if (word.id) return String(word.id);
      if (word.wordId) return String(word.wordId);
      const genre = genreId || word.genre || 'unknown';
      const category = word.category || 'その他';
      const es = word.es || '';
      const ja = word.ja || '';
      return `legacy:${genre}::${category}::${es}::${ja}`;
    },
    aliases(word, genreId = null) {
      if (!word) return [];
      const genre = genreId || word.genre || 'unknown';
      const category = word.category || 'その他';
      const es = word.es || '';
      const ja = word.ja || '';
      return [...new Set([
        word.id,
        ...(Array.isArray(word.legacyIds) ? word.legacyIds : []),
        word.wordId,
        `legacy:${genre}::${category}::${es}::${ja}`,
        `${genre}:${word.sourceRow}:${es}`,
        `legacy:${genre}::${es}`
      ].filter(Boolean).map(String))];
    },
    same(first, second, genreId = null) {
      const left = new Set(this.aliases(first, genreId || first?.genre));
      return this.aliases(second, genreId || second?.genre).some(alias => left.has(alias));
    },
    normalizeText,
    matchesAnswer(answer, expected) {
      const normalizedAnswer = normalizeText(answer);
      return String(expected || '')
        .split('/')
        .map(value => normalizeText(value))
        .some(variant => variant === normalizedAnswer);
    }
  };
  const WordIdentity = window.WordIdentity;

  function buildStableAliasMap() {
    const source = typeof db !== 'undefined' ? db : {};
    const aliases = new Map();
    Object.entries(source).forEach(([genre, words]) => {
      if (!Array.isArray(words)) return;
      words.forEach(word => {
        if (!word || !word.id) return;
        WordIdentity.aliases({ ...word, genre }, genre).forEach(alias => {
          if (!aliases.has(alias)) aliases.set(alias, word.id);
        });
      });
    });
    return aliases;
  }

  function migrateLegacyWordIds() {
    const aliases = buildStableAliasMap();
    if (!aliases.size) return;

    const states = safeGetJSON(STORAGE_KEYS.states, {});
    if (states && typeof states === 'object' && !Array.isArray(states)) {
      let changed = false;
      Object.entries(states).forEach(([key, value]) => {
        const stableId = aliases.get(key) || aliases.get(value?.wordId);
        if (!stableId || stableId === key) return;
        const existing = states[stableId];
        states[stableId] = existing
          ? { ...value, ...existing, wordId: stableId }
          : { ...value, wordId: stableId };
        delete states[key];
        changed = true;
      });
      if (changed) safeSetJSON(STORAGE_KEYS.states, states);
    }

    ['es_quiz_history', 'es_weak_words', 'es_review_later', 'es_memorized_words'].forEach(storageKey => {
      const records = safeGetJSON(storageKey, []);
      if (!Array.isArray(records)) return;
      let changed = false;
      const migrated = records.map(record => {
        if (!record || typeof record !== 'object') return record;
        const stableId = aliases.get(record.wordId) || aliases.get(record.id)
          || aliases.get(`legacy:${record.genre || 'unknown'}::${record.category || 'その他'}::${record.es || ''}::${record.ja || ''}`);
        if (!stableId || record.wordId === stableId) return record;
        changed = true;
        return { ...record, wordId: stableId };
      });
      if (changed) safeSetJSON(storageKey, migrated);
    });
  }

  function defaultState(wordId) {
    return {
      wordId,
      repetitions: 0,
      interval: 0,
      ease: 2.5,
      dueAt: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      seenCount: 0,
      lastResult: null,
      lastAnsweredAt: null,
      updatedAt: null
    };
  }

  window.LearningEvents = {
    get() {
      return safeGetJSON(STORAGE_KEYS.events, []);
    },
    log(type, payload = {}) {
      const events = this.get();
      events.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        timestamp: Date.now(),
        ...payload
      });
      if (events.length > 10000) events.splice(0, events.length - 10000);
      safeSetJSON(STORAGE_KEYS.events, events);
    },
    startSession() {
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.log('session_start', { sessionId });
      return { sessionId, startedAt: Date.now() };
    },
    endSession(session) {
      if (!session || !session.startedAt) return;
      const durationMs = Math.min(Date.now() - session.startedAt, 2 * 60 * 60 * 1000);
      if (durationMs < 1000) return;
      this.log('session_end', {
        sessionId: session.sessionId,
        durationMs
      });
    },
    clear() {
      safeRemove(STORAGE_KEYS.events);
    }
  };
  const LearningEvents = window.LearningEvents;

  window.LearningStore = {
    getAll() {
      return safeGetJSON(STORAGE_KEYS.states, {});
    },
    saveAll(states) {
      safeSetJSON(STORAGE_KEYS.states, states);
    },
    get(word, genreId = null) {
      const wordId = WordIdentity.key(word, genreId);
      const states = this.getAll();
      if (states[wordId]) return states[wordId];
      const legacyId = WordIdentity.aliases(word, genreId).find(alias => states[alias]);
      if (!legacyId) return defaultState(wordId);
      const migrated = { ...states[legacyId], wordId };
      delete states[legacyId];
      states[wordId] = migrated;
      this.saveAll(states);
      return migrated;
    },
    isDue(word, genreId = null, now = Date.now()) {
      const state = this.get(word, genreId);
      return state.dueAt <= now;
    },
    markViewed(word, genreId = null) {
      const wordId = WordIdentity.key(word, genreId);
      const state = this.get(word, genreId);
      const states = this.getAll();
      state.seenCount += 1;
      state.updatedAt = Date.now();
      states[wordId] = state;
      this.saveAll(states);
      LearningEvents.log('word_view', {
        wordId,
        genre: genreId || word.genre || null,
        category: word.category || 'その他'
      });
      return state;
    },
    recordAnswer(word, genreId, isCorrect, mode = 'study') {
      const now = Date.now();
      const wordId = WordIdentity.key(word, genreId);
      const state = this.get(word, genreId);
      const states = this.getAll();
      state.seenCount += 1;
      state.lastResult = Boolean(isCorrect);
      state.lastAnsweredAt = now;
      state.updatedAt = now;

      if (isCorrect) {
        state.correctCount += 1;
        state.streak += 1;
        state.repetitions += 1;
        state.interval = [1, 3, 7, 30, 60][Math.min(state.repetitions - 1, 4)];
        state.ease = Math.min(3.0, state.ease + 0.05);
        state.dueAt = now + state.interval * DAY_MS;
      } else {
        state.wrongCount += 1;
        state.streak = 0;
        state.repetitions = 0;
        state.interval = 0;
        state.ease = Math.max(1.3, state.ease - 0.2);
        state.dueAt = now + 10 * 60 * 1000;
      }

      states[wordId] = state;
      this.saveAll(states);
      LearningEvents.log('answer', {
        wordId,
        genre: genreId || word.genre || null,
        category: word.category || 'その他',
        mode,
        isCorrect: Boolean(isCorrect)
      });
      return state;
    },
    getDueWords(words, limit = 20, now = Date.now()) {
      return words
        .map(word => ({
          ...word,
          genre: word.genre || null,
          learningState: this.get(word, word.genre || null)
        }))
        .filter(word => word.learningState.dueAt <= now)
        .sort((a, b) => {
          const dueOrder = a.learningState.dueAt - b.learningState.dueAt;
          if (dueOrder !== 0) return dueOrder;
          return b.learningState.wrongCount - a.learningState.wrongCount;
        })
        .slice(0, limit);
    },
    getMasteredCount(words) {
      return words.filter(word => {
        const state = this.get(word, word.genre || null);
        return state.interval >= 30 || state.streak >= 3;
      }).length;
    },
    clear() {
      safeRemove(STORAGE_KEYS.states);
    }
  };
  const LearningStore = window.LearningStore;

  migrateLegacyWordIds();

  window.StudyContent = {
    getExample(word) {
      if (Array.isArray(word.examples) && word.examples.length > 0) {
        const example = word.examples[0];
        if (typeof example === 'string') return { es: example, ja: '' };
        return { es: example.es || '', ja: example.ja || example.translation || '' };
      }
      if (word.partOfSpeech === 'phrase' || word.genre === 'phrases') {
        return { es: word.es, ja: word.ja, source: 'phrase' };
      }
      return null;
    },
    getUsage(word) {
      if (Array.isArray(word.usageScenes) && word.usageScenes.length > 0) {
        return word.usageScenes;
      }
      return word.category ? [word.category] : [];
    },
    getPracticePrompt(word) {
      if (word.partOfSpeech === 'verb' || word.genre === 'verbs') {
        return `この動詞「${word.es}」を使って、あなた自身の短い文を作ってみましょう。`;
      }
      return `「${word.es}」を使って、あなた自身の短い文を作ってみましょう。`;
    },
    formatDueAt(state) {
      if (!state || !state.dueAt) return '今日から学習';
      const date = new Date(state.dueAt);
      if (state.dueAt <= Date.now()) return '今日の復習対象';
      return `次回復習: ${date.toLocaleDateString('ja-JP')}`;
    }
  };

  window.StudyAnalytics = {
    getSummary(days = 30) {
      const since = Date.now() - days * DAY_MS;
      const events = LearningEvents.get().filter(event => event.timestamp >= since);
      const eventAnswers = events.filter(event => event.type === 'answer' || event.type === 'scenario_answer');
      const legacyHistory = safeGetJSON('es_quiz_history', []);
      const migratedAnswers = Array.isArray(legacyHistory)
        ? legacyHistory
          .filter(history => history.timestamp >= since)
          .filter(history => !eventAnswers.some(event =>
            event.type === 'answer'
            && event.wordId === history.wordId
            && event.mode === history.mode
            && event.isCorrect === history.isCorrect
            && Math.abs(event.timestamp - history.timestamp) < 2000
          ))
          .map(history => ({
            type: 'answer',
            timestamp: history.timestamp,
            wordId: history.wordId,
            genre: history.genre,
            category: history.category,
            mode: history.mode,
            isCorrect: history.isCorrect
          }))
        : [];
      const answers = [...eventAnswers, ...migratedAnswers];
      const sessions = events.filter(event => event.type === 'session_end');
      const activeDays = new Set(events.map(event => new Date(event.timestamp).toLocaleDateString('en-CA')));
      const totalMinutes = sessions.reduce((sum, event) => sum + (event.durationMs || 0), 0) / 60000;
      const correct = answers.filter(event => event.isCorrect).length;
      const accuracy = answers.length ? Math.round((correct / answers.length) * 100) : 0;
      const byGenre = {};
      const byCategory = {};
      answers.forEach(event => {
        const genre = event.genre || 'その他';
        const category = event.category || 'その他';
        if (!byGenre[genre]) byGenre[genre] = { total: 0, correct: 0 };
        if (!byCategory[category]) byCategory[category] = { total: 0, correct: 0 };
        byGenre[genre].total += 1;
        byCategory[category].total += 1;
        if (event.isCorrect) {
          byGenre[genre].correct += 1;
          byCategory[category].correct += 1;
        }
      });

      const dataSource = typeof db !== 'undefined' ? db : {};
      const allWords = Object.entries(dataSource).flatMap(([genre, words]) =>
        words.map(word => ({ ...word, genre }))
      );
      const mastered = window.LearningStore ? LearningStore.getMasteredCount(allWords) : 0;
      const totalWords = allWords.length;
      let estimatedLevel = 'A1';
      if (mastered >= 1200) estimatedLevel = 'C1相当';
      else if (mastered >= 700) estimatedLevel = 'B2相当';
      else if (mastered >= 350) estimatedLevel = 'B1相当';
      else if (mastered >= 150) estimatedLevel = 'A2相当';

      return {
        days,
        answers: answers.length,
        correct,
        accuracy,
        activeDays: activeDays.size,
        totalMinutes: Math.round(totalMinutes),
        mastered,
        totalWords,
        estimatedLevel,
        byGenre,
        byCategory
      };
    }
  };

  window.ConversationScenarios = [
    {
      id: 'restaurant-order',
      title: 'レストランで注文する',
      context: '店員におすすめを聞き、料理を注文します。',
      prompt: '「おすすめを教えてください」と言ってみましょう。',
      answer: '¿Me puede recomendar algo?',
      alternatives: ['¿Qué me recomienda?']
    },
    {
      id: 'make-plans',
      title: '友達と予定を決める',
      context: '友達に土曜日の午後に会おうと提案します。',
      prompt: '「土曜日の午後に会いませんか」と言ってみましょう。',
      answer: '¿Nos vemos el sábado por la tarde?',
      alternatives: ['¿Quedamos el sábado por la tarde?']
    },
    {
      id: 'work-update',
      title: '仕事で進捗を説明する',
      context: '同僚に、明日までに資料を送ると伝えます。',
      prompt: '「明日までに資料を送ります」と言ってみましょう。',
      answer: 'Te enviaré el documento mañana.',
      alternatives: ['Le enviaré el documento mañana.']
    },
    {
      id: 'shopping',
      title: '買い物をする',
      context: '店で服を試着したいと伝えます。',
      prompt: '「これを試着してもいいですか」と言ってみましょう。',
      answer: '¿Me puedo probar esto?',
      alternatives: ['¿Puedo probarme esto?']
    },
    {
      id: 'follow-up',
      title: '問題を確認して連絡する',
      context: '仕事や生活上の問題を確認し、後で連絡すると伝えます。',
      prompt: '「この問題を確認して、後で連絡します」と言ってみましょう。',
      answer: 'Voy a revisar este problema y te aviso después.',
      alternatives: ['Revisaré este problema y te avisaré después.']
    }
  ];
})();
