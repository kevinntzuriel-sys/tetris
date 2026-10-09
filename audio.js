(function (global) {
  'use strict';

  const MASTER_VOLUME = 0.22;

  const NOTE = {
    G3: 196.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, B5: 987.77,
    C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98
  };

  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setMuted(value) {
    muted = !!value;
    if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  function isMuted() {
    return muted;
  }

  function isUnlocked() {
    return !!ctx && ctx.state === 'running';
  }

  function tone(o) {
    const c = ensure();
    if (!c || muted) return;
    const duration = o.duration || 0.08;
    const t0 = c.currentTime + (o.start || 0);
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t0 + duration);
    const peak = o.gain === undefined ? 1 : o.gain;
    amp.gain.setValueAtTime(peak, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function noise(o) {
    const c = ensure();
    if (!c || muted) return;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const duration = o.duration || 0.08;
    const t0 = c.currentTime + (o.start || 0);
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const amp = c.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = o.cutoff || 800;
    amp.gain.setValueAtTime(o.gain === undefined ? 1 : o.gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.03);
  }

  function arpeggio(notes, step, type, gain, length) {
    notes.forEach(function (freq, i) {
      tone({ freq: freq, start: i * step, duration: length || step * 1.6, type: type, gain: gain });
    });
  }

  const SOUNDS = {
    move: function () {
      tone({ freq: 190, endFreq: 150, duration: 0.04, type: 'square', gain: 0.45 });
    },

    rotate: function () {
      tone({ freq: 420, endFreq: 560, duration: 0.06, type: 'square', gain: 0.5 });
    },

    softDrop: function () {
      tone({ freq: 120, duration: 0.03, type: 'triangle', gain: 0.5 });
    },

    hardDrop: function () {
      tone({ freq: 700, endFreq: 70, duration: 0.12, type: 'square', gain: 0.45 });
    },

    lock: function () {
      tone({ freq: 140, endFreq: 55, duration: 0.09, type: 'triangle', gain: 0.9 });
      noise({ duration: 0.06, cutoff: 500, gain: 0.5 });
    },

    lines: function (count) {
      const sets = {
        1: [NOTE.C5, NOTE.E5],
        2: [NOTE.C5, NOTE.E5, NOTE.G5],
        3: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6],
        4: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6]
      };
      const notes = sets[Math.min(4, Math.max(1, count))];
      arpeggio(notes, 0.07, 'square', 0.5);
      arpeggio(notes.map(function (f) { return f / 2; }), 0.07, 'triangle', 0.6);
    },

    levelup: function () {
      arpeggio([NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G5, NOTE.B5, NOTE.D6], 0.06, 'square', 0.4, 0.12);
      tone({ freq: NOTE.G6, start: 0.4, duration: 0.3, type: 'square', gain: 0.4 });
    },

    start: function () {
      arpeggio([NOTE.C5, NOTE.G5, NOTE.C6], 0.07, 'square', 0.45);
    },

    pause: function () {
      tone({ freq: 330, endFreq: 200, duration: 0.1, type: 'square', gain: 0.45 });
    },

    resume: function () {
      tone({ freq: 200, endFreq: 330, duration: 0.1, type: 'square', gain: 0.45 });
    },

    gameover: function () {
      arpeggio([NOTE.E4, NOTE.D4, NOTE.C4, NOTE.G3], 0.24, 'triangle', 0.8, 0.32);
      tone({ freq: 130, endFreq: 45, start: 1.0, duration: 0.9, type: 'sawtooth', gain: 0.35 });
    }
  };

  function play(name, arg) {
    const fn = SOUNDS[name];
    if (fn) fn(arg);
  }

  global.TetrisAudio = {
    unlock: unlock,
    play: play,
    setMuted: setMuted,
    isMuted: isMuted,
    isUnlocked: isUnlocked
  };
})(window);

