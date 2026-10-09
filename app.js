(function () {
  'use strict';

  const Tetris = window.Tetris;
  const DB = window.TetrisDB;
  const Sound = window.TetrisAudio;

  const STORAGE_BEST = 'tetris.best';
  const STORAGE_MUTED = 'tetris.muted';
  const LEADERBOARD_SIZE = 10;

  const $ = function (id) { return document.getElementById(id); };

  const el = {
    board: $('board'),
    next: $('next'),
    soundBtn: $('sound-btn'),
    soundLabelFull: $('sound-label-full'),
    soundLabelShort: $('sound-label-short'),
    session: $('session'),
    sessionName: $('session-name'),
    authBtn: $('auth-btn'),
    logoutBtn: $('logout-btn'),
    statScore: $('stat-score'),
    statLevel: $('stat-level'),
    statLines: $('stat-lines'),
    statBest: $('stat-best'),
    pauseBtn: $('pause-btn'),
    overlayStart: $('overlay-start'),
    overlayPause: $('overlay-pause'),
    overlayGameover: $('overlay-gameover'),
    startBtn: $('start-btn'),
    resumeBtn: $('resume-btn'),
    restartBtn: $('restart-btn'),
    goScore: $('go-score'),
    goStats: $('go-stats'),
    goMessage: $('go-message'),
    goGuest: $('go-guest'),
    goLoginBtn: $('go-login-btn'),
    lbBody: $('lb-body'),
    lbStatus: $('lb-status'),
    lbRefresh: $('lb-refresh'),
    modal: $('auth-modal'),
    authForm: $('auth-form'),
    authClose: $('auth-close'),
    authSkip: $('auth-skip'),
    tabLogin: $('tab-login'),
    tabRegister: $('tab-register'),
    fieldUsername: $('field-username'),
    inputUsername: $('auth-username'),
    inputEmail: $('auth-email'),
    inputPassword: $('auth-password'),
    authMessage: $('auth-message'),
    authSubmit: $('auth-submit')
  };

  const engine = new Tetris.TetrisEngine();
  const renderer = new Tetris.TetrisRenderer(el.board, el.next);

  let currentUser = null;
  let unsavedScore = null;
  let leaderboardRows = [];
  let authMode = 'login';

  const fmt = function (n) { return Number(n).toLocaleString('es'); };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {  }
  }

  let localBest = parseInt(storageGet(STORAGE_BEST), 10) || 0;

  function updateStats() {
    el.statScore.textContent = fmt(engine.score);
    el.statLevel.textContent = engine.level;
    el.statLines.textContent = engine.lines;
    el.statBest.textContent = fmt(Math.max(localBest, engine.score));
  }

  function syncOverlays() {
    const s = engine.state;
    el.overlayStart.hidden = s !== 'idle';
    el.overlayPause.hidden = s !== 'paused';
    el.overlayGameover.hidden = s !== 'gameover';
    el.pauseBtn.textContent = s === 'paused' ? 'Continuar (P)' : 'Pausa (P)';
  }

  engine.on('change', updateStats);
  engine.on('state', syncOverlays);

  function setGameOverMessage(text, kind) {
    el.goMessage.hidden = !text;
    el.goMessage.textContent = text || '';
    if (kind) el.goMessage.setAttribute('data-kind', kind);
    else el.goMessage.removeAttribute('data-kind');
  }

  async function saveAndReport(score) {
    setGameOverMessage('Guardando tu récord…');
    try {
      const result = await DB.saveScore(score);
      if (result.reason === 'guest') return;
      unsavedScore = null;
      if (result.improved) {
        setGameOverMessage('🏆 ¡Nuevo récord personal guardado: ' + fmt(score) + '!', 'success');
      } else {
        setGameOverMessage('Tu récord personal sigue siendo ' + fmt(result.best) + '.');
      }
      refreshLeaderboard();
    } catch (err) {
      setGameOverMessage('No se pudo guardar el récord: ' + err.message, 'error');
    }
  }

  engine.on('lock', function (info) {
    if (info.cleared === 0) Sound.play('lock');
  });
  engine.on('lines', function (count) { Sound.play('lines', count); });
  engine.on('levelup', function () { Sound.play('levelup'); });

  engine.on('gameover', function (summary) {
    Sound.play('gameover');
    el.goScore.textContent = fmt(summary.score);
    el.goStats.textContent = 'Nivel ' + summary.level + ' · ' + summary.lines +
      (summary.lines === 1 ? ' línea' : ' líneas');

    if (summary.score > localBest) {
      localBest = summary.score;
      storageSet(STORAGE_BEST, String(localBest));
      updateStats();
    }

    setGameOverMessage('');
    el.goGuest.hidden = true;
    unsavedScore = null;

    if (summary.score <= 0) return;

    if (currentUser) {
      saveAndReport(summary.score);
    } else {
      unsavedScore = summary.score;
      el.goGuest.hidden = false;
    }
  });

  function startGame() {
    unsavedScore = null;
    setGameOverMessage('');
    el.goGuest.hidden = true;
    engine.start();
    Sound.play('start');
  }

  function toggleMute() {
    Sound.setMuted(!Sound.isMuted());
    storageSet(STORAGE_MUTED, Sound.isMuted() ? '1' : '0');
    syncSoundButton();
    Sound.play('rotate');
  }

  function syncSoundButton() {
    const muted = Sound.isMuted();
    el.soundLabelFull.textContent = muted ? 'Sonido: No' : 'Sonido: Sí';
    el.soundLabelShort.textContent = muted ? '♪ No' : '♪ Sí';
    el.soundBtn.setAttribute('aria-pressed', String(!muted));
  }

  function perform(action) {
    if (action === 'mute') {
      toggleMute();
      return;
    }

    const state = engine.state;

    if (state === 'idle') {
      if (action !== 'pause') startGame();
      return;
    }
    if (state === 'gameover') {
      if (action === 'enter') startGame();
      return;
    }
    if (state === 'paused') {
      if (action === 'pause' || action === 'enter') {
        engine.resume();
        Sound.play('resume');
      }
      return;
    }

    switch (action) {
      case 'left':
        if (engine.moveLeft()) Sound.play('move');
        break;
      case 'right':
        if (engine.moveRight()) Sound.play('move');
        break;
      case 'down':
        if (engine.softDrop()) Sound.play('softDrop');
        break;
      case 'rotateCW':
        if (engine.rotateCW()) Sound.play('rotate');
        break;
      case 'rotateCCW':
        if (engine.rotateCCW()) Sound.play('rotate');
        break;
      case 'hardDrop':
        engine.hardDrop();
        Sound.play('hardDrop');
        break;
      case 'pause':
        engine.pause();
        Sound.play('pause');
        break;
      default:
        break;
    }
  }

  const KEY_MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'rotateCW', KeyW: 'rotateCW', KeyX: 'rotateCW',
    KeyZ: 'rotateCCW', KeyQ: 'rotateCCW',
    Space: 'hardDrop',
    KeyP: 'pause',
    KeyM: 'mute',
    Enter: 'enter'
  };
  const REPEATABLE = { left: true, right: true, down: true };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (el.modal.open) return;

    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (tag === 'BUTTON' && action === 'enter') return;

    e.preventDefault();
    if (tag === 'BUTTON') e.target.blur();
    if (e.repeat && !REPEATABLE[action]) return;

    perform(action);
  });

  el.startBtn.addEventListener('click', function () { startGame(); el.startBtn.blur(); });
  el.restartBtn.addEventListener('click', function () { startGame(); el.restartBtn.blur(); });
  el.resumeBtn.addEventListener('click', function () { perform('pause'); el.resumeBtn.blur(); });
  el.pauseBtn.addEventListener('click', function () { perform('pause'); el.pauseBtn.blur(); });
  el.soundBtn.addEventListener('click', function () { toggleMute(); el.soundBtn.blur(); });

  const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
  function unlockAudio() {
    Sound.unlock();
    if (Sound.isUnlocked()) {
      UNLOCK_EVENTS.forEach(function (type) {
        document.removeEventListener(type, unlockAudio, true);
      });
    }
  }
  UNLOCK_EVENTS.forEach(function (type) {
    document.addEventListener(type, unlockAudio, true);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.touch-controls [data-action]'), function (btn) {
    const action = btn.getAttribute('data-action');
    let delayId = null;
    let repeatId = null;

    function stop() {
      clearTimeout(delayId);
      clearInterval(repeatId);
      delayId = null;
      repeatId = null;
    }

    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      perform(action);
      if (REPEATABLE[action]) {
        stop();
        delayId = setTimeout(function () {
          repeatId = setInterval(function () { perform(action); }, 70);
        }, 220);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      btn.addEventListener(type, stop);
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  (function setupSwipeControls() {
    let gesture = null;

    function cellPixels() {
      return el.board.clientWidth / 10;
    }

    el.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    el.board.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || engine.state !== 'playing') return;
      el.board.setPointerCapture(e.pointerId);
      gesture = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        anchorX: e.clientX,
        anchorY: e.clientY,
        startTime: performance.now(),
        moved: false
      };
    });

    el.board.addEventListener('pointermove', function (e) {
      if (!gesture || e.pointerId !== gesture.id || engine.state !== 'playing') return;

      const size = cellPixels();
      const totalX = e.clientX - gesture.startX;
      const totalY = e.clientY - gesture.startY;
      if (Math.abs(totalX) > size * 0.4 || Math.abs(totalY) > size * 0.4) gesture.moved = true;

      let dx = e.clientX - gesture.anchorX;
      while (dx >= size) {
        perform('right');
        gesture.anchorX += size;
        dx -= size;
      }
      while (dx <= -size) {
        perform('left');
        gesture.anchorX -= size;
        dx += size;
      }

      const step = size * 0.8;
      if (totalY > 0 && totalY > Math.abs(totalX)) {
        let dy = e.clientY - gesture.anchorY;
        while (dy >= step) {
          perform('down');
          gesture.anchorY += step;
          dy -= step;
        }
      } else {
        gesture.anchorY = e.clientY;
      }
    });

    el.board.addEventListener('pointerup', function (e) {
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      if (engine.state !== 'playing') return;

      const elapsed = performance.now() - g.startTime;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const size = cellPixels();

      if (!g.moved && elapsed < 300) {
        perform('rotateCW');
        return;
      }
      if (dy > size * 3 && dy > Math.abs(dx) * 1.5 && elapsed < 350) perform('hardDrop');
    });

    el.board.addEventListener('pointercancel', function (e) {
      if (gesture && e.pointerId === gesture.id) gesture = null;
    });
  })();

  document.addEventListener('visibilitychange', function () { if (document.hidden) engine.pause(); });
  window.addEventListener('blur', function () { engine.pause(); });

  let lastTime = performance.now();
  function frame(now) {
    const dt = now - lastTime;
    lastTime = now;
    engine.tick(dt);
    renderer.render(engine.getSnapshot());
    requestAnimationFrame(frame);
  }

  function updateSessionUI() {
    if (currentUser) {
      el.session.setAttribute('data-state', 'user');
      el.sessionName.textContent = DB.getUsername(currentUser);
      el.authBtn.hidden = true;
      el.logoutBtn.hidden = false;
    } else {
      el.session.setAttribute('data-state', 'guest');
      el.sessionName.textContent = 'Invitado';
      el.authBtn.hidden = false;
      el.logoutBtn.hidden = true;
    }
  }

  function handleAuthChange(user) {
    currentUser = user;
    updateSessionUI();
    renderLeaderboard();

    if (user && unsavedScore !== null && engine.state === 'gameover') {
      el.goGuest.hidden = true;
      saveAndReport(unsavedScore);
    }
    if (!user) el.goGuest.hidden = engine.state !== 'gameover' || unsavedScore === null;
  }

  el.logoutBtn.addEventListener('click', async function () {
    el.logoutBtn.disabled = true;
    try {
      await DB.signOut();
    } catch (err) {
      console.error(err);
    } finally {
      el.logoutBtn.disabled = false;
    }
  });

  function renderLeaderboard() {
    const me = currentUser ? DB.getUsername(currentUser) : null;
    el.lbBody.textContent = '';

    leaderboardRows.forEach(function (row, i) {
      const tr = document.createElement('tr');
      tr.className = 'rank-' + (i + 1);
      if (me && row.username === me) tr.classList.add('is-me');

      const rank = document.createElement('td');
      rank.className = 'lb-rank';
      rank.textContent = String(i + 1);

      const name = document.createElement('td');
      name.className = 'lb-name';
      name.textContent = row.username;

      const score = document.createElement('td');
      score.className = 'lb-score';
      score.textContent = fmt(row.score);

      tr.appendChild(rank);
      tr.appendChild(name);
      tr.appendChild(score);
      el.lbBody.appendChild(tr);
    });
  }

  async function refreshLeaderboard() {
    if (!DB.isConfigured) {
      leaderboardRows = [];
      renderLeaderboard();
      el.lbStatus.textContent = 'El Top Global no está disponible: falta configurar Supabase en supabase-config.js.';
      return;
    }

    el.lbRefresh.classList.add('is-spinning');
    try {
      leaderboardRows = await DB.getLeaderboard(LEADERBOARD_SIZE);
      renderLeaderboard();
      el.lbStatus.textContent = leaderboardRows.length ? '' : 'Aún no hay puntuaciones. ¡Sé el primero!';
    } catch (err) {
      el.lbStatus.textContent = 'No se pudo cargar el Top Global: ' + err.message;
    } finally {
      el.lbRefresh.classList.remove('is-spinning');
    }
  }

  el.lbRefresh.addEventListener('click', refreshLeaderboard);

  function showAuthMessage(text, kind) {
    el.authMessage.hidden = !text;
    el.authMessage.textContent = text || '';
    if (kind) el.authMessage.setAttribute('data-kind', kind);
  }

  function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === 'register';
    el.tabLogin.setAttribute('aria-selected', String(!isRegister));
    el.tabRegister.setAttribute('aria-selected', String(isRegister));
    el.fieldUsername.hidden = !isRegister;
    el.inputUsername.required = isRegister;
    el.inputPassword.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    el.authSubmit.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
    showAuthMessage('');
  }

  function openAuthModal(mode) {
    engine.pause();
    setAuthMode(mode || 'login');
    if (!el.modal.open) el.modal.showModal();
    (authMode === 'register' ? el.inputUsername : el.inputEmail).focus();
  }

  function closeAuthModal() {
    if (el.modal.open) el.modal.close();
  }

  el.authBtn.addEventListener('click', function () { openAuthModal('login'); });
  el.goLoginBtn.addEventListener('click', function () { openAuthModal('login'); });
  el.authClose.addEventListener('click', closeAuthModal);
  el.authSkip.addEventListener('click', closeAuthModal);
  el.tabLogin.addEventListener('click', function () { setAuthMode('login'); });
  el.tabRegister.addEventListener('click', function () { setAuthMode('register'); });

  el.modal.addEventListener('click', function (e) {
    if (e.target === el.modal) closeAuthModal();
  });

  el.modal.addEventListener('close', function () {
    el.inputPassword.value = '';
    showAuthMessage('');
  });

  el.authForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    showAuthMessage('');

    if (!DB.isConfigured) {
      showAuthMessage('Las cuentas no están disponibles: falta configurar Supabase en supabase-config.js.', 'error');
      return;
    }
    if (!el.authForm.checkValidity()) {
      el.authForm.reportValidity();
      return;
    }

    const email = el.inputEmail.value.trim();
    const password = el.inputPassword.value;

    el.authSubmit.disabled = true;
    try {
      if (authMode === 'register') {
        const result = await DB.signUp({
          email: email,
          password: password,
          username: el.inputUsername.value.trim()
        });
        if (result.needsConfirmation) {
          setAuthMode('login');
          showAuthMessage('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', 'success');
        } else {
          closeAuthModal();
        }
      } else {
        await DB.signIn({ email: email, password: password });
        closeAuthModal();
      }
    } catch (err) {
      showAuthMessage(err.message, 'error');
    } finally {
      el.authSubmit.disabled = false;
    }
  });

  Sound.setMuted(storageGet(STORAGE_MUTED) === '1');
  syncSoundButton();
  updateSessionUI();
  updateStats();
  syncOverlays();
  refreshLeaderboard();
  DB.onAuthChange(handleAuthChange);
  requestAnimationFrame(frame);
})();
