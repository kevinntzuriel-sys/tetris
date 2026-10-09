(function (global) {
  'use strict';

  const COLS = 10;
  const ROWS = 20;

  const PIECES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };
  const TYPES = Object.keys(PIECES);

  const LINE_SCORES = [0, 40, 100, 300, 1200];
  const LINES_PER_LEVEL = 10;
  const MIN_DROP_INTERVAL = 50;
  const LOCK_DELAY = 500;
  const MAX_LOCK_RESETS = 15;
  const MAX_FRAME_DT = 250;

  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

  const PALETTE = {
    background: '#000000',
    grid: 'rgba(255, 255, 255, 0.07)',
    ghostAlpha: 0.55,
    pieces: {
      I: '#42fcff',
      J: '#2a3cff',
      L: '#ff7f27',
      O: '#ffff00',
      S: '#00c000',
      T: '#d535d9',
      Z: '#ff0000'
    }
  };

  function createBoard() {
    const board = [];
    for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(null));
    return board;
  }

  function cloneMatrix(m) {
    return m.map(function (row) { return row.slice(); });
  }

  function rotateMatrix(m, dir) {
    const n = m.length;
    const out = [];
    for (let r = 0; r < n; r++) {
      out.push(new Array(n).fill(0));
      for (let c = 0; c < n; c++) {
        out[r][c] = dir > 0 ? m[n - 1 - c][r] : m[c][n - 1 - r];
      }
    }
    return out;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  class TetrisEngine {
    constructor() {
      this.cols = COLS;
      this.rows = ROWS;
      this._listeners = {};
      this.reset();
    }

    on(event, handler) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
      const listeners = this._listeners[event];
      return function off() {
        const i = listeners.indexOf(handler);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    _emit(event, payload) {
      const list = this._listeners[event];
      if (!list) return;
      list.slice().forEach(function (fn) { fn(payload); });
    }

    _setState(state) {
      if (this.state === state) return;
      this.state = state;
      this._emit('state', state);
    }

    reset() {
      this.board = createBoard();
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.current = null;
      this._bag = [];
      this.nextType = this._drawFromBag();
      this._dropTimer = 0;
      this._lockTimer = 0;
      this._lockResets = 0;
      this.state = null;
      this._setState('idle');
      this._emit('change');
    }

    start() {
      this.reset();
      this._setState('playing');
      this._spawn();
      this._emit('change');
    }

    pause() {
      if (this.state === 'playing') this._setState('paused');
    }

    resume() {
      if (this.state === 'paused') this._setState('playing');
    }

    togglePause() {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    getDropInterval() {
      return Math.max(MIN_DROP_INTERVAL, 1000 * Math.pow(0.85, this.level - 1));
    }

    _drawFromBag() {
      if (this._bag.length === 0) this._bag = shuffle(TYPES.slice());
      return this._bag.pop();
    }

    _collides(matrix, x, y) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const bx = x + c;
          const by = y + r;
          if (bx < 0 || bx >= COLS || by >= ROWS) return true;
          if (by >= 0 && this.board[by][bx]) return true;
        }
      }
      return false;
    }

    _isGrounded() {
      const p = this.current;
      return !!p && this._collides(p.matrix, p.x, p.y + 1);
    }

    _spawn() {
      const type = this.nextType;
      this.nextType = this._drawFromBag();
      const matrix = cloneMatrix(PIECES[type]);
      let firstRow = 0;
      while (firstRow < matrix.length && !matrix[firstRow].some(Boolean)) firstRow++;

      this._dropTimer = 0;
      this._lockTimer = 0;
      this._lockResets = 0;

      const piece = {
        type: type,
        matrix: matrix,
        x: Math.floor((COLS - matrix.length) / 2),
        y: -firstRow
      };

      if (this._collides(piece.matrix, piece.x, piece.y)) {
        this.current = null;
        this._endGame();
        return false;
      }
      this.current = piece;
      return true;
    }

    _registerLockReset() {
      if (this._isGrounded() && this._lockResets < MAX_LOCK_RESETS) {
        this._lockTimer = 0;
        this._lockResets++;
      }
    }

    _tryMove(dx, dy) {
      const p = this.current;
      if (this.state !== 'playing' || !p) return false;
      if (this._collides(p.matrix, p.x + dx, p.y + dy)) return false;
      p.x += dx;
      p.y += dy;
      if (dy > 0) this._lockResets = 0;
      else this._registerLockReset();
      return true;
    }

    moveLeft() { return this._tryMove(-1, 0); }
    moveRight() { return this._tryMove(1, 0); }

    softDrop() {
      if (this.state !== 'playing' || !this.current) return false;
      if (this._tryMove(0, 1)) {
        this.score += 1;
        this._dropTimer = 0;
        this._emit('change');
        return true;
      }
      this._lock();
      return false;
    }

    hardDrop() {
      const p = this.current;
      if (this.state !== 'playing' || !p) return 0;
      let distance = 0;
      while (!this._collides(p.matrix, p.x, p.y + 1)) {
        p.y++;
        distance++;
      }
      this.score += distance * 2;
      this._lock();
      return distance;
    }

    _rotate(dir) {
      const p = this.current;
      if (this.state !== 'playing' || !p || p.type === 'O') return false;
      const rotated = rotateMatrix(p.matrix, dir);
      for (let i = 0; i < KICKS.length; i++) {
        const nx = p.x + KICKS[i][0];
        const ny = p.y + KICKS[i][1];
        if (!this._collides(rotated, nx, ny)) {
          p.matrix = rotated;
          p.x = nx;
          p.y = ny;
          this._registerLockReset();
          return true;
        }
      }
      return false;
    }

    rotateCW() { return this._rotate(1); }
    rotateCCW() { return this._rotate(-1); }

    _lock() {
      const p = this.current;
      if (!p) return;
      let overflow = false;

      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (!p.matrix[r][c]) continue;
          const by = p.y + r;
          const bx = p.x + c;
          if (by < 0) overflow = true;
          else this.board[by][bx] = p.type;
        }
      }
      this.current = null;

      const cleared = this._clearLines();
      if (cleared > 0) {
        this.score += LINE_SCORES[cleared] * this.level;
        this.lines += cleared;
        const newLevel = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
        this._emit('lines', cleared);
        if (newLevel > this.level) {
          this.level = newLevel;
          this._emit('levelup', newLevel);
        }
      }
      this._emit('lock', { cleared: cleared });

      if (overflow) {
        this._endGame();
        return;
      }
      this._spawn();
      this._emit('change');
    }

    _clearLines() {
      let cleared = 0;
      let r = ROWS - 1;
      while (r >= 0) {
        if (this.board[r].every(Boolean)) {
          this.board.splice(r, 1);
          this.board.unshift(new Array(COLS).fill(null));
          cleared++;
        } else {
          r--;
        }
      }
      return cleared;
    }

    _endGame() {
      this._setState('gameover');
      this._emit('change');
      this._emit('gameover', { score: this.score, lines: this.lines, level: this.level });
    }

    tick(dtMs) {
      if (this.state !== 'playing' || !this.current) return;
      const dt = Math.min(dtMs, MAX_FRAME_DT);

      if (this._isGrounded()) {
        this._dropTimer = 0;
        this._lockTimer += dt;
        if (this._lockTimer >= LOCK_DELAY) this._lock();
        return;
      }

      this._lockTimer = 0;
      this._dropTimer += dt;
      const interval = this.getDropInterval();
      const p = this.current;
      while (this._dropTimer >= interval) {
        this._dropTimer -= interval;
        if (this._collides(p.matrix, p.x, p.y + 1)) {
          this._dropTimer = 0;
          break;
        }
        p.y++;
        this._lockResets = 0;
      }
    }

    getGhostY() {
      const p = this.current;
      if (!p) return null;
      let y = p.y;
      while (!this._collides(p.matrix, p.x, y + 1)) y++;
      return y;
    }

    getSnapshot() {
      return {
        board: this.board,
        current: this.current,
        ghostY: this.getGhostY(),
        nextType: this.nextType,
        score: this.score,
        lines: this.lines,
        level: this.level,
        state: this.state
      };
    }
  }

  class TetrisRenderer {
    constructor(boardCanvas, nextCanvas) {
      this.cell = 30;
      this.nextCell = 24;
      this.board = this._setupCanvas(boardCanvas);
      this.next = this._setupCanvas(nextCanvas);
      this.palette = PALETTE;
      this._shadeCache = {};
    }

    _setupCanvas(canvas) {
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { canvas: canvas, ctx: ctx, w: w, h: h };
    }

    render(snapshot) {
      this._renderBoard(snapshot);
      this._renderNext(snapshot.nextType);
    }

    _renderBoard(s) {
      const ctx = this.board.ctx;
      const p = this.palette;
      const size = this.cell;

      ctx.clearRect(0, 0, this.board.w, this.board.h);
      ctx.fillStyle = p.background;
      ctx.fillRect(0, 0, this.board.w, this.board.h);

      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        ctx.moveTo(c * size + 0.5, 0);
        ctx.lineTo(c * size + 0.5, ROWS * size);
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.moveTo(0, r * size + 0.5);
        ctx.lineTo(COLS * size, r * size + 0.5);
      }
      ctx.stroke();

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const type = s.board[r][c];
          if (type) this._drawCell(ctx, c * size, r * size, size, p.pieces[type], false);
        }
      }

      const piece = s.current;
      if (piece) {
        if (s.ghostY !== null && s.ghostY !== piece.y) {
          this._drawMatrix(ctx, piece.matrix, piece.x, s.ghostY, size, p.pieces[piece.type], true);
        }
        this._drawMatrix(ctx, piece.matrix, piece.x, piece.y, size, p.pieces[piece.type], false);
      }
    }

    _renderNext(type) {
      const ctx = this.next.ctx;
      const p = this.palette;
      const size = this.nextCell;

      ctx.clearRect(0, 0, this.next.w, this.next.h);
      ctx.fillStyle = p.background;
      ctx.fillRect(0, 0, this.next.w, this.next.h);
      if (!type) return;

      const matrix = PIECES[type];
      let minR = matrix.length, maxR = -1, minC = matrix.length, maxC = -1;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
      const width = (maxC - minC + 1) * size;
      const height = (maxR - minR + 1) * size;
      const offX = (this.next.w - width) / 2 - minC * size;
      const offY = (this.next.h - height) / 2 - minR * size;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) this._drawCell(ctx, offX + c * size, offY + r * size, size, p.pieces[type], false);
        }
      }
    }

    _drawMatrix(ctx, matrix, gx, gy, size, color, ghost) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const row = gy + r;
          if (row < 0) continue;
          this._drawCell(ctx, (gx + c) * size, row * size, size, color, ghost);
        }
      }
    }

    _shade(hex, amount) {
      const key = hex + amount;
      if (this._shadeCache[key]) return this._shadeCache[key];
      const n = parseInt(hex.slice(1), 16);
      const target = amount >= 0 ? 255 : 0;
      const t = Math.abs(amount);
      const mix = function (channel) { return Math.round(channel + (target - channel) * t); };
      const r = mix((n >> 16) & 255);
      const g = mix((n >> 8) & 255);
      const b = mix(n & 255);
      const out = 'rgb(' + r + ',' + g + ',' + b + ')';
      this._shadeCache[key] = out;
      return out;
    }

    _drawCell(ctx, px, py, size, color, ghost) {
      const p = this.palette;
      const inset = 2;
      const x = px + inset;
      const y = py + inset;
      const s = size - inset * 2;

      if (ghost) {
        ctx.save();
        ctx.globalAlpha = p.ghostAlpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        ctx.restore();
        return;
      }

      const bevel = Math.max(2, Math.round(size / 8));

      ctx.fillStyle = '#000000';
      ctx.fillRect(px, py, size, size);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, s, s);

      ctx.fillStyle = this._shade(color, 0.45);
      ctx.fillRect(x, y, s, bevel);
      ctx.fillRect(x, y, bevel, s);

      ctx.fillStyle = this._shade(color, -0.45);
      ctx.fillRect(x, y + s - bevel, s, bevel);
      ctx.fillRect(x + s - bevel, y, bevel, s);

      ctx.fillStyle = this._shade(color, 0.7);
      ctx.fillRect(x + bevel + 2, y + bevel + 2, bevel, bevel);
    }
  }

  global.Tetris = {
    COLS: COLS,
    ROWS: ROWS,
    PIECES: PIECES,
    PALETTE: PALETTE,
    TetrisEngine: TetrisEngine,
    TetrisRenderer: TetrisRenderer
  };
})(window);
