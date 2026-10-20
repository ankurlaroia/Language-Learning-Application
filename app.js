(() => {
  'use strict';

  const vocab = window.KLARWEG_VOCAB || [];
  const categories = window.KLARWEG_CATEGORIES || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    view: 'dashboard',
    category: 'all',
    article: 'all',
    unit: 'all',
    search: '',
    visibleWords: 32,
    sprint: [],
    sprintIndex: 0,
    sprintScore: 0,
    commandIndex: 0,
    commandItems: [],
    recording: false,
    recordingTimer: null,
    recordingSeconds: 0,
    mediaStream: null,
  };

  const categoryCount = vocab.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const examples = {
    'der Auslöser': 'Was war der Auslöser für den Konflikt?',
    'das Zeugnis': 'Mein Zeugnis war besser als erwartet.',
    'die Sprechstunde': 'Die Sprechstunde beginnt um zehn Uhr.',
    'der Bildungsweg': 'Jeder Mensch hat einen anderen Bildungsweg.',
    'die Geduld': 'Beim Deutschlernen braucht man Geduld.',
    'aufrichtig': 'Sie hat sich aufrichtig entschuldigt.',
    'das Missverständnis': 'Das war nur ein Missverständnis.',
    'überzeugen': 'Kannst du mich davon überzeugen?',
    'die Einwanderung': 'Wir sprechen über Einwanderung und Integration.',
    'die Vielfalt': 'Sprachliche Vielfalt ist eine Stärke.',
    'abschmecken': 'Zum Schluss musst du die Suppe abschmecken.',
    'die Rezension': 'Ich habe eine kurze Rezension geschrieben.',
    'der Einsendeschluss': 'Der Einsendeschluss ist nächsten Freitag.',
    'aufbewahren': 'Bitte bewahren Sie die Quittung auf.',
    'die Vergangenheit': 'Die Vergangenheit kann man nicht ändern.',
    'das Temperament': 'Er hat ein ruhiges Temperament.',
  };

  function showToast(message, icon = '✓') {
    const toast = $('#toast');
    toast.querySelector('span').textContent = icon;
    toast.querySelector('p').textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setView(view, { updateHash = true } = {}) {
    if (!$(`[data-view-panel="${view}"]`)) return;
    state.view = view;
    $$('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
    $$('[data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (button.classList.contains('nav-item')) {
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    });
    if (updateHash) history.replaceState(null, '', `#${view}`);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (view === 'vocabulary') setTimeout(() => $('#vocab-search')?.focus({ preventScroll: true }), 350);
  }

  function titleCaseCategory(category) {
    return category.replace(' & ', ' & ');
  }

  function renderDashboardTopics() {
    const container = $('#dashboard-topics');
    container.innerHTML = Object.entries(categories).slice(0, 6).map(([name, meta]) => `
      <button class="topic-card" data-topic="${escapeAttr(name)}" style="--topic-color:${topicColor(meta.color)}">
        <span class="topic-icon">${meta.icon}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${categoryCount[name] || 0} words</small><i></i>
      </button>
    `).join('');
  }

  function renderCategoryStrip() {
    const strip = $('#category-strip');
    const chips = [`<button class="category-chip active" data-category="all"><span>✦</span>All themes <small>${vocab.length}</small></button>`];
    Object.entries(categories).forEach(([name, meta]) => {
      chips.push(`<button class="category-chip" data-category="${escapeAttr(name)}"><span>${meta.icon}</span>${escapeHtml(name)} <small>${categoryCount[name] || 0}</small></button>`);
    });
    strip.innerHTML = chips.join('');
  }

  function topicColor(color) {
    const map = {
      blue: '#4586ee', violet: '#7c5de8', amber: '#e7a63d', slate: '#718096', rose: '#ec5e8e',
      cyan: '#37b9d0', fuchsia: '#d45fce', indigo: '#6674df', emerald: '#27b47e', orange: '#f27b43',
      sky: '#4da7dd', purple: '#8b5ce4', lime: '#7aad4a', brown: '#a9713d', red: '#e5484d', teal: '#14b8a6'
    };
    return map[color] || '#6747e8';
  }

  function filteredVocab() {
    const query = normalize(state.search);
    return vocab.filter(item => {
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (state.article !== 'all' && item.article !== state.article) return false;
      if (state.unit !== 'all' && item.unit !== state.unit) return false;
      if (query && !normalize(`${item.term} ${item.meaning} ${item.category}`).includes(query)) return false;
      return true;
    });
  }

  function articleColor(article) {
    return { der: 'var(--der)', die: 'var(--die)', das: 'var(--das)', other: '#8c91a2' }[article] || '#8c91a2';
  }

  function renderVocab() {
    const results = filteredVocab();
    const visible = results.slice(0, state.visibleWords);
    $('#vocab-count').textContent = `Showing ${visible.length === results.length ? results.length : `${visible.length} of ${results.length}`} word${results.length === 1 ? '' : 's'}`;
    $('#word-grid').innerHTML = visible.map((item, index) => {
      const meta = categories[item.category] || { icon: 'Aa' };
      const articleLabel = item.article === 'other' ? 'word' : item.article;
      return `
        <article class="word-card" data-word-index="${vocab.indexOf(item)}" tabindex="0" role="button" aria-label="Study ${escapeAttr(item.headword)}" style="--article-color:${articleColor(item.article)}">
          <div class="word-top"><span class="article-chip ${item.article}">${articleLabel}</span><span class="word-unit">${item.unit}</span><button class="word-sound" data-speak="${escapeAttr(item.speak)}" aria-label="Hear ${escapeAttr(item.headword)}">▶</button></div>
          <h3>${escapeHtml(item.headword)}</h3>
          <div class="word-form">${escapeHtml(item.form || 'Verb · adjective · expression')}</div>
          <p class="word-meaning">${escapeHtml(item.meaning)}</p>
          <span class="word-category" title="${escapeAttr(item.category)}">${meta.icon}</span>
        </article>
      `;
    }).join('');
    $('#vocab-empty').hidden = results.length > 0;
    $('#word-grid').hidden = results.length === 0;
    $('#load-more').hidden = visible.length >= results.length || results.length === 0;
  }

  function resetVisibleWords() {
    state.visibleWords = 32;
    renderVocab();
  }

  function clearFilters() {
    state.category = 'all';
    state.article = 'all';
    state.unit = 'all';
    state.search = '';
    $('#vocab-search').value = '';
    $('#unit-filter').value = 'all';
    $$('#article-filter button').forEach(btn => btn.classList.toggle('active', btn.dataset.article === 'all'));
    $$('.category-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.category === 'all'));
    resetVisibleWords();
  }

  function randomWord() {
    return vocab[Math.floor(Math.random() * vocab.length)];
  }

  function setQuickWord(item = randomWord()) {
    const root = $('#quick-word');
    root.querySelector('.article-chip').className = `article-chip ${item.article}`;
    root.querySelector('.article-chip').textContent = item.article === 'other' ? 'Wort' : item.article;
    root.querySelector('strong').textContent = item.headword.replace(/^(der|die|das)\s+/i, '');
    root.querySelector('small').textContent = item.meaning;
    const sound = root.querySelector('.sound-button');
    sound.dataset.speak = item.speak;
    sound.setAttribute('aria-label', `Hear ${item.headword}`);
    root.animate([{ opacity: .2, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  }

  function createSprint(startItem = null) {
    const pool = filteredVocab().length >= 5 ? filteredVocab() : vocab;
    const shuffled = [...pool].sort(() => Math.random() - .5).slice(0, 5);
    if (startItem) {
      const duplicate = shuffled.findIndex(item => item === startItem);
      if (duplicate >= 0) shuffled.splice(duplicate, 1);
      shuffled.unshift(startItem);
      shuffled.splice(5);
    }
    state.sprint = shuffled;
    state.sprintIndex = 0;
    state.sprintScore = 0;
    updateSprintCard();
    const dialog = $('#flashcard-modal');
    if (!dialog.open) dialog.showModal();
  }

  function updateSprintCard() {
    const item = state.sprint[state.sprintIndex] || vocab[0];
    const card = $('#flashcard');
    card.classList.remove('flipped');
    const article = $('#flash-article');
    article.className = `flash-article ${item.article}`;
    article.style.background = articleColor(item.article);
    article.textContent = item.article === 'other' ? 'Wort' : item.article;
    $('#flash-word').textContent = item.headword.replace(/^(der|die|das)\s+/i, '');
    $('#flash-form').textContent = item.form || `${item.unit} · ${item.category}`;
    $('#flash-category').textContent = `${categories[item.category]?.icon || 'Aa'} ${item.category}`;
    $('#flash-meaning').textContent = item.meaning;
    $('#flash-example').textContent = examples[item.headword] || genericExample(item);
    $('#flash-speak').dataset.speak = item.speak;
    $('#sprint-label').textContent = `${state.sprintIndex + 1} of ${state.sprint.length}`;
    $('#sprint-progress').style.width = `${((state.sprintIndex + 1) / state.sprint.length) * 100}%`;
    $('#sprint-score').textContent = `${state.sprintScore} remembered`;
  }

  function genericExample(item) {
    const bare = item.headword.replace(/^(der|die|das)\s+/i, '');
    if (item.article !== 'other') return `Heute sprechen wir über „${item.headword}“.`;
    if (/^(sich\s+)?[a-zäöüß]+en\b/i.test(item.headword)) return `Kannst du „${bare}“ in einem Satz benutzen?`;
    return `„${bare}“ ist ein nützliches Wort auf B1-Niveau.`;
  }

  function recall(result) {
    if (result === 'good') state.sprintScore += 1;
    if (state.sprintIndex < state.sprint.length - 1) {
      state.sprintIndex += 1;
      updateSprintCard();
    } else {
      $('#flashcard-modal').close();
      showToast(`Sprint complete · ${state.sprintScore}/5 remembered`, '✦');
      setQuickWord();
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      showToast('Speech is not supported in this browser', '!');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = .88;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.lang?.toLowerCase().startsWith('de')) || null;
    speechSynthesis.speak(utterance);
  }

  function setupBuilder() {
    const bank = $('#word-bank');
    const zone = $('#answer-zone');
    const check = $('#check-builder');
    const feedback = $('#builder-feedback');

    function update() {
      const count = zone.querySelectorAll('button').length;
      zone.querySelector('.answer-placeholder')?.remove();
      if (!count) zone.insertAdjacentHTML('afterbegin', '<span class="answer-placeholder">Tap the words in the correct order</span>');
      check.disabled = count !== 8;
      check.classList.toggle('disabled', count !== 8);
      feedback.hidden = true;
    }

    bank.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      zone.appendChild(button);
      update();
    });
    zone.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      bank.appendChild(button);
      update();
    });
    $('#reset-builder').addEventListener('click', () => {
      [...zone.querySelectorAll('button')].forEach(button => bank.appendChild(button));
      feedback.hidden = true;
      update();
    });
    check.addEventListener('click', () => {
      const answer = [...zone.querySelectorAll('button')].map(button => button.textContent.trim().toLowerCase()).join(' ');
      const correct = 'obwohl ich müde bin lerne ich weiter deutsch';
      feedback.hidden = false;
      if (answer === correct) {
        feedback.className = 'feedback correct';
        feedback.innerHTML = '<strong>Perfekt!</strong> “Obwohl” sends <em>bin</em> to the end of its clause. In the main clause, <em>lerne</em> takes position two.';
        showToast('+15 XP · Sentence built', '✦');
      } else {
        feedback.className = 'feedback wrong';
        feedback.innerHTML = '<strong>Almost.</strong> Try: <em>Obwohl ich müde bin, lerne ich weiter Deutsch.</em> The first verb travels to the clause ending.';
      }
    });
    update();
  }

  function setupTheme() {
    let saved = null;
    try { saved = localStorage.getItem('klarweg-theme'); } catch (_) {}
    const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = saved || preferred;
    document.documentElement.dataset.theme = theme;
    updateThemeButton(theme);
    $('#theme-toggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('klarweg-theme', next); } catch (_) {}
      updateThemeButton(next);
    });
  }

  function updateThemeButton(theme) {
    const button = $('#theme-toggle');
    button.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0f1119' : '#6548e8';
  }

  function setupChallenge() {
    $('#daily-challenge').addEventListener('click', () => $('#challenge-modal').showModal());
    $$('.challenge-options button').forEach(button => button.addEventListener('click', () => {
      const correct = button.dataset.correct === 'true';
      $$('.challenge-options button').forEach(option => option.disabled = true);
      button.classList.add(correct ? 'correct' : 'wrong');
      if (!correct) $('.challenge-options button[data-correct="true"]').classList.add('correct');
      const feedback = $('#challenge-feedback');
      feedback.hidden = false;
      feedback.style.background = correct ? 'var(--green-soft)' : 'color-mix(in srgb,var(--rose) 11%,var(--surface-solid))';
      feedback.style.color = correct ? 'var(--green)' : 'var(--rose)';
      feedback.innerHTML = correct
        ? '<strong>Genau!</strong> After <em>weil</em>, the conjugated verb goes to the end: <em>müde bin</em>.'
        : '<strong>Not quite.</strong> <em>Weil</em> is a verb magnet: <em>weil ich müde bin</em>.';
      if (correct) showToast('+40 XP · Daily challenge complete', '✦');
    }));
  }

  function renderActivity() {
    const values = [8,0,14,22,0,12,18,28,16,0,34,20,9,26,42,0,18,24,31,12,0,38,46,26,0,34,41,18,29,48];
    $('.activity-bars').innerHTML = values.map((value, index) => `<span class="${index === values.length - 1 ? 'current' : ''}" style="height:${Math.max(4, value * 3.3)}px" title="${value} minutes"></span>`).join('');
  }

  function setupTutor() {
    const messages = $('#chat-messages');
    const form = $('#chat-form');
    const input = $('#chat-input');

    const responses = [
      {
        match: /dativ|dative|mit\b/i,
        html: '<p><strong>Mit</strong> always takes the dative. Think of it as a fixed partnership: <em>mit + dem/der/den</em>.</p><div class="mini-rule"><span class="rule-prep">mit</span><span>＋</span><span class="rule-article">dem Fahrrad</span></div><p>Mini practice: <strong>mit der Freundin</strong>, <strong>mit dem Kind</strong>, <strong>mit den Kollegen</strong>.</p>'
      },
      {
        match: /weil|obwohl|verb|word order/i,
        html: '<p><strong>Weil</strong> and <strong>obwohl</strong> send the conjugated verb to the end of their clause.</p><div class="mini-rule"><span class="rule-prep">weil</span><span>ich heute</span><span class="rule-article">arbeite →</span></div><p>Compare: <strong>Ich bleibe zu Hause, weil ich arbeiten muss.</strong></p>'
      },
      {
        match: /email|schreib|writing|correct/i,
        html: '<p>Paste your German email here. I will correct it in three layers: <strong>must fix</strong>, <strong>more natural</strong>, and <strong>one reusable phrase</strong>.</p><p>A good B1 opening is: <em>Ich schreibe Ihnen, weil …</em></p>'
      },
      {
        match: /sprechen|speak|roleplay|conversation/i,
        html: '<p>Sehr gern! Let’s do a B1 roleplay.</p><p><strong>Situation:</strong> You are at a hotel reception and your room is too noisy.</p><p><em>Guten Abend. Wie kann ich Ihnen helfen?</em></p>'
      }
    ];

    function appendMessage(role, html) {
      const wrapper = document.createElement('div');
      wrapper.className = `message ${role}`;
      wrapper.innerHTML = role === 'assistant' ? `<div class="message-avatar">K</div><div class="message-body">${html}</div>` : `<p>${html}</p>`;
      messages.appendChild(wrapper);
      messages.scrollTop = messages.scrollHeight;
      return wrapper;
    }

    function submit(text) {
      const clean = text.trim();
      if (!clean) return;
      appendMessage('user', escapeHtml(clean));
      input.value = '';
      autoSizeTextarea(input);
      const typing = appendMessage('assistant', '<div class="typing"><i></i><i></i><i></i></div>');
      setTimeout(() => {
        const response = responses.find(item => item.match.test(clean))?.html || '<p>Good question. Here is the simplest useful version:</p><p>German becomes easier when you learn a <strong>small pattern</strong> and use it immediately. Give me one sentence you want to say, and I will help you build it naturally.</p>';
        typing.querySelector('.message-body').innerHTML = response;
        messages.scrollTop = messages.scrollHeight;
      }, 700 + Math.random() * 450);
    }

    form.addEventListener('submit', event => { event.preventDefault(); submit(input.value); });
    input.addEventListener('input', () => autoSizeTextarea(input));
    $$('.suggestion-row button').forEach(button => button.addEventListener('click', () => submit(button.textContent)));
    $('#new-chat').addEventListener('click', () => {
      messages.innerHTML = '<div class="message assistant"><div class="message-avatar">K</div><div class="message-body"><p>Hallo! What would you like to say or understand in German today?</p></div></div>';
      input.focus();
    });
    messages.addEventListener('click', event => {
      const button = event.target.closest('[data-answer]');
      if (!button) return;
      const correct = button.dataset.answer === 'correct';
      button.classList.add(correct ? 'correct' : 'wrong');
      if (!correct) button.parentElement.querySelector('[data-answer="correct"]').classList.add('correct');
      showToast(correct ? 'Richtig · mit dem Kind' : 'Try the dative: dem', correct ? '✓' : '↺');
    });
  }

  function autoSizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }

  function setupRecording() {
    const button = $('#record-button');
    const recorder = $('#recorder');
    const label = $('#record-label');
    button.addEventListener('click', async () => {
      if (!state.recording) {
        try {
          if (navigator.mediaDevices?.getUserMedia) state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
          showToast('Microphone permission was not granted', '!');
        }
        state.recording = true;
        state.recordingSeconds = 0;
        recorder.classList.add('recording');
        label.textContent = 'Listening · 0:00';
        button.setAttribute('aria-label', 'Stop recording');
        state.recordingTimer = setInterval(() => {
          state.recordingSeconds += 1;
          label.textContent = `Listening · ${formatTime(state.recordingSeconds)}`;
        }, 1000);
      } else {
        stopRecording();
        label.textContent = 'Great! Your speech sample is ready.';
        showToast('Speech captured · feedback ready', '◉');
        setTimeout(() => { label.textContent = 'Tap to start speaking'; }, 3200);
      }
    });
    $$('.prompt-chips button').forEach(prompt => prompt.addEventListener('click', () => {
      label.textContent = prompt.dataset.prompt;
      recorder.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    $$('.scenario-card').forEach(card => card.addEventListener('click', () => {
      const scenario = card.dataset.scenario;
      recorder.scrollIntoView({ behavior: 'smooth', block: 'center' });
      label.textContent = `${scenario} roleplay loaded · tap to begin`;
      showToast(`${scenario} roleplay is ready`, '◉');
    }));
  }

  function stopRecording() {
    state.recording = false;
    clearInterval(state.recordingTimer);
    $('#recorder').classList.remove('recording');
    $('#record-button').setAttribute('aria-label', 'Start recording');
    state.mediaStream?.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }

  function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function setupCommandPalette() {
    const dialog = $('#command-modal');
    const input = $('#command-input');
    const results = $('#command-results');

    function buildItems(query = '') {
      const q = normalize(query);
      const actions = [
        { icon: '⌂', title: 'Go to Today', subtitle: 'Dashboard and daily plan', type: 'action', view: 'dashboard' },
        { icon: '✦', title: 'Continue connector lesson', subtitle: 'weil, obwohl & trotzdem', type: 'lesson', view: 'lesson' },
        { icon: '◉', title: 'Open Speaking Lab', subtitle: 'Real-life roleplays', type: 'action', view: 'speaking' },
        { icon: '✧', title: 'Ask Klara', subtitle: 'AI German tutor', type: 'action', view: 'tutor' },
      ].filter(item => !q || normalize(`${item.title} ${item.subtitle}`).includes(q));
      const words = vocab.filter(item => !q || normalize(`${item.term} ${item.meaning} ${item.category}`).includes(q)).slice(0, q ? 8 : 4).map(item => ({
        icon: categories[item.category]?.icon || 'Aa', title: item.headword, subtitle: item.meaning, type: 'word', item
      }));
      state.commandItems = [...actions, ...words];
      state.commandIndex = 0;
      results.innerHTML = `${actions.length ? '<div class="command-group-label">QUICK ACTIONS</div>' : ''}${actions.map(commandResult).join('')}${words.length ? '<div class="command-group-label">VOCABULARY</div>' : ''}${words.map(commandResult).join('')}${!state.commandItems.length ? '<div class="empty-state"><span>⌕</span><h3>No results</h3><p>Try a German word, English meaning or section.</p></div>' : ''}`;
      highlightCommand();
    }

    function commandResult(item, index) {
      const trueIndex = state.commandItems.indexOf(item);
      return `<button class="command-result" data-command-index="${trueIndex}"><span>${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></div><small>${item.type === 'word' ? item.item.unit : 'Open →'}</small></button>`;
    }

    function highlightCommand() {
      $$('.command-result', results).forEach((item, index) => item.classList.toggle('selected', index === state.commandIndex));
      $$('.command-result', results)[state.commandIndex]?.scrollIntoView({ block: 'nearest' });
    }

    function execute(index = state.commandIndex) {
      const item = state.commandItems[index];
      if (!item) return;
      dialog.close();
      if (item.type === 'word') {
        setView('vocabulary');
        state.search = item.item.headword;
        $('#vocab-search').value = item.item.headword;
        resetVisibleWords();
        setTimeout(() => $('.word-card')?.focus(), 350);
      } else setView(item.view);
    }

    function open() {
      buildItems('');
      dialog.showModal();
      setTimeout(() => input.focus(), 20);
    }

    $('#open-command').addEventListener('click', open);
    input.addEventListener('input', () => buildItems(input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); state.commandIndex = Math.min(state.commandIndex + 1, state.commandItems.length - 1); highlightCommand(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); state.commandIndex = Math.max(state.commandIndex - 1, 0); highlightCommand(); }
      if (event.key === 'Enter') { event.preventDefault(); execute(); }
    });
    results.addEventListener('click', event => {
      const item = event.target.closest('[data-command-index]');
      if (item) execute(Number(item.dataset.commandIndex));
    });

    document.addEventListener('keydown', event => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dialog.open ? dialog.close() : open(); }
      if (event.key === '/' && !typing && !dialog.open) { event.preventDefault(); setView('vocabulary'); setTimeout(() => $('#vocab-search').focus(), 350); }
      if (!typing && !event.metaKey && !event.ctrlKey && ['1','2','3','4','5'].includes(event.key)) {
        const views = { '1':'dashboard','2':'lesson','3':'vocabulary','4':'speaking','5':'progress' };
        setView(views[event.key]);
      }
    });
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function escapeAttr(value = '') { return escapeHtml(value); }
  function normalize(value = '') { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

  function bindGlobalEvents() {
    document.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) setView(viewButton.dataset.view);

      const link = event.target.closest('[data-view-link]');
      if (link) { event.preventDefault(); setView(link.dataset.viewLink); }

      const close = event.target.closest('[data-close]');
      if (close) $(`#${close.dataset.close}`)?.close();

      const sound = event.target.closest('[data-speak]');
      if (sound) { event.stopPropagation(); speak(sound.dataset.speak); }
    });

    $$('.modal').forEach(dialog => dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }));

    $('#shuffle-word').addEventListener('click', () => setQuickWord());
    $('#start-flashcards').addEventListener('click', () => createSprint());
    $('#start-flashcards-top').addEventListener('click', () => createSprint());
    $('#flashcard').addEventListener('click', event => {
      if (event.target.closest('[data-speak]')) return;
      $('#flashcard').classList.toggle('flipped');
    });
    $$('.recall').forEach(button => button.addEventListener('click', () => recall(button.dataset.recall)));

    $('#dashboard-topics').addEventListener('click', event => {
      const topic = event.target.closest('[data-topic]');
      if (!topic) return;
      state.category = topic.dataset.topic;
      setView('vocabulary');
      $$('.category-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.category === state.category));
      resetVisibleWords();
    });

    $('#category-strip').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      $$('.category-chip').forEach(btn => btn.classList.toggle('active', btn === button));
      resetVisibleWords();
    });
    $('#article-filter').addEventListener('click', event => {
      const button = event.target.closest('[data-article]');
      if (!button) return;
      state.article = button.dataset.article;
      $$('#article-filter button').forEach(btn => btn.classList.toggle('active', btn === button));
      resetVisibleWords();
    });
    $('#unit-filter').addEventListener('change', event => { state.unit = event.target.value; resetVisibleWords(); });
    $('#vocab-search').addEventListener('input', event => { state.search = event.target.value; resetVisibleWords(); });
    $('#load-more').addEventListener('click', () => { state.visibleWords += 32; renderVocab(); });
    $('#clear-filters').addEventListener('click', clearFilters);

    $('#word-grid').addEventListener('click', event => {
      if (event.target.closest('[data-speak]')) return;
      const card = event.target.closest('[data-word-index]');
      if (card) createSprint(vocab[Number(card.dataset.wordIndex)]);
    });
    $('#word-grid').addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-word-index]')) {
        event.preventDefault();
        createSprint(vocab[Number(event.target.dataset.wordIndex)]);
      }
    });
  }

  function init() {
    renderDashboardTopics();
    renderCategoryStrip();
    renderVocab();
    renderActivity();
    setQuickWord(vocab.find(item => item.headword === 'der Auslöser') || randomWord());
    setupTheme();
    setupBuilder();
    setupChallenge();
    setupTutor();
    setupRecording();
    setupCommandPalette();
    bindGlobalEvents();

    const initial = location.hash.replace('#', '');
    setView($(`[data-view-panel="${initial}"]`) ? initial : 'dashboard', { updateHash: false });
    window.addEventListener('hashchange', () => setView(location.hash.replace('#', '') || 'dashboard', { updateHash: false }));

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
