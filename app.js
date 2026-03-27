/* =============================================
   Smart Marker Transcript Sync — app.js
   Word Peak Detection Engine
   ============================================= */

// ─── State ────────────────────────────────────────────────────────────────────
let words       = [];
let audioEl     = document.getElementById('audioEl');
let seekBar     = document.getElementById('seekBar');
let rafId       = null;
let audioNumber = null;
let scriptRaw   = '';
let totalDur    = 0;
let audioFile   = null;

// ─── File upload handlers ─────────────────────────────────────────────────────
document.getElementById('audioIn').onchange = function (e) {
  const f = e.target.files[0];
  if (!f) return;
  audioFile = f;
  document.getElementById('audioName').textContent = f.name;
  document.getElementById('audioBox').classList.add('ready');

  // Extract number from filename: "1.mp3"→1, "track2.wav"→2, "ep03.m4a"→3
  const m = f.name.match(/(\d+)/);
  audioNumber = m ? parseInt(m[1]) : null;

  audioEl.src = URL.createObjectURL(f);
  document.getElementById('playerCard').classList.add('show');
  audioEl.onloadedmetadata = () => checkReady();
};

document.getElementById('scriptIn').onchange = function (e) {
  const f = e.target.files[0];
  if (!f) return;
  document.getElementById('scriptName').textContent = f.name;
  document.getElementById('scriptBox').classList.add('ready');
  const reader = new FileReader();
  reader.onload = ev => { scriptRaw = ev.target.result; checkReady(); };
  reader.readAsText(f);
};

// ─── Ready check ──────────────────────────────────────────────────────────────
function checkReady() {
  const aOk = audioFile && audioEl.duration > 0;
  const sOk = scriptRaw.length > 0;
  document.getElementById('startBtn').disabled = !(aOk && sOk);
  if (aOk && sOk)   setStatus('Ready — "Start Transcription" dabao', 'ok');
  else if (sOk)      setStatus('Audio load ho raha hai...', '');
  else               setStatus('Audio aur script dono upload karo', '');
}

// ─── Extract [N]...[N] section from script ────────────────────────────────────
function extractSection(text, num) {
  const re = new RegExp('\\[' + num + '\\]([\\s\\S]*?)\\[' + num + '\\]', 'i');
  const m  = text.match(re);
  return m ? m[1].trim() : null;
}

// ─── STEP 1: Decode audio → mono Float32Array ─────────────────────────────────
async function decodeAudio(file) {
  const arrayBuf = await file.arrayBuffer();
  const actx     = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await actx.decodeAudioData(arrayBuf);
  actx.close();

  // Mix all channels down to mono
  const mono = new Float32Array(audioBuf.length);
  for (let c = 0; c < audioBuf.numberOfChannels; c++) {
    const ch = audioBuf.getChannelData(c);
    for (let i = 0; i < audioBuf.length; i++) mono[i] += ch[i] / audioBuf.numberOfChannels;
  }
  return { samples: mono, sampleRate: audioBuf.sampleRate, duration: audioBuf.duration };
}

// ─── STEP 2: Compute RMS energy per 15ms frame ───────────────────────────────
// Same 15ms window approach as the silence remover tool
function computeRMS(samples, sampleRate, frameSec = 0.015) {
  const frameSize = Math.floor(sampleRate * frameSec);
  const frames    = [];
  for (let i = 0; i < samples.length; i += frameSize) {
    let sum = 0;
    const count = Math.min(frameSize, samples.length - i);
    for (let j = 0; j < count; j++) sum += samples[i + j] * samples[i + j];
    frames.push(Math.sqrt(sum / count));
  }
  return frames; // each entry = frameSec seconds
}

// ─── STEP 3: Detect word onset peaks ─────────────────────────────────────────
// Strategy:
//   1. Find speech "islands" — contiguous RMS runs above silence threshold
//   2. Each island's peak = one word onset
//   3. If too few islands → subdivide largest ones
//   4. If too many islands → merge closest neighbors
function detectWordOnsets(rmsFrames, sampleRate, frameSec, numWords) {
  const n = rmsFrames.length;

  // Adaptive threshold from energy distribution (p25 + offset)
  const sorted  = [...rmsFrames].sort((a, b) => a - b);
  const p25     = sorted[Math.floor(n * 0.25)];
  const p75     = sorted[Math.floor(n * 0.75)];
  const silThresh = p25 + (p75 - p25) * 0.15;   // below this = silence

  const minIslandFrames = Math.ceil(0.04 / frameSec); // 40ms minimum island

  // Find all speech islands
  let islands = [];
  let inIsland = false, iStart = 0;
  for (let i = 0; i < n; i++) {
    if (!inIsland && rmsFrames[i] > silThresh) {
      inIsland = true; iStart = i;
    } else if (inIsland && rmsFrames[i] <= silThresh) {
      if (i - iStart >= minIslandFrames) islands.push({ start: iStart, end: i });
      inIsland = false;
    }
  }
  if (inIsland) islands.push({ start: iStart, end: n });

  // Peak = max RMS frame inside each island
  const getPeaks = (islandList) => islandList.map(isl => {
    let maxVal = 0, maxIdx = isl.start;
    for (let i = isl.start; i < isl.end; i++) {
      if (rmsFrames[i] > maxVal) { maxVal = rmsFrames[i]; maxIdx = i; }
    }
    return {
      frame: maxIdx,
      time:  maxIdx * frameSec,
      energy: maxVal,
      start: isl.start * frameSec,
      end:   isl.end   * frameSec,
    };
  });

  let peaks = getPeaks(islands);

  // Too few peaks → subdivide the longest islands
  while (peaks.length < numWords) {
    let bigLen = 0, bigIdx = -1;
    islands.forEach((isl, i) => {
      if (isl.end - isl.start > bigLen) { bigLen = isl.end - isl.start; bigIdx = i; }
    });
    if (bigIdx === -1) break;
    const isl = islands[bigIdx];
    const mid = Math.floor((isl.start + isl.end) / 2);
    islands.splice(bigIdx, 1, { start: isl.start, end: mid }, { start: mid, end: isl.end });
    peaks = getPeaks(islands);
  }

  // Too many peaks → merge closest-in-time neighbors
  while (peaks.length > numWords && peaks.length > 1) {
    let minGap = Infinity, minIdx = 0;
    for (let i = 0; i < peaks.length - 1; i++) {
      const gap = peaks[i + 1].start - peaks[i].start;
      if (gap < minGap) { minGap = gap; minIdx = i; }
    }
    const a = peaks[minIdx], b = peaks[minIdx + 1];
    peaks.splice(minIdx, 2, {
      frame:  a.energy >= b.energy ? a.frame : b.frame,
      time:   Math.min(a.time, b.time),
      energy: Math.max(a.energy, b.energy),
      start:  a.start,
      end:    b.end,
    });
  }

  return peaks;
}

// ─── STEP 4: Assign start/end times to each word token ───────────────────────
function assignTimings(wordTokens, peaks, totalDur) {
  const realWords = wordTokens.filter(w => w.isWord);
  const n         = realWords.length;

  for (let i = 0; i < n; i++) {
    const pk     = peaks[Math.min(i, peaks.length - 1)];
    const nextPk = peaks[Math.min(i + 1, peaks.length - 1)];
    realWords[i].start = pk.start;
    realWords[i].end   = (i < n - 1) ? nextPk.start : totalDur;
    // Safety clamp
    if (realWords[i].end <= realWords[i].start) realWords[i].end = realWords[i].start + 0.08;
  }
}

// ─── STEP 5: Draw waveform + mark detected peaks ─────────────────────────────
function drawWaveform(rmsFrames, peaks, dur) {
  const wrap   = document.getElementById('waveWrap');
  wrap.classList.add('show');
  const canvas = document.getElementById('waveCanvas');
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.parentElement.offsetWidth || 700;
  canvas.width  = W * dpr;
  canvas.height = 70 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const H = 70;
  const max = Math.max(...rmsFrames, 0.001);

  // Blue waveform bars
  ctx.fillStyle = '#185FA5';
  ctx.globalAlpha = 0.45;
  const step = rmsFrames.length / W;
  for (let x = 0; x < W; x++) {
    const idx = Math.floor(x * step);
    const h   = (rmsFrames[idx] / max) * (H * 0.88);
    ctx.fillRect(x, H / 2 - h / 2, 1, h);
  }
  ctx.globalAlpha = 1;

  // Red peak / word onset markers
  ctx.strokeStyle = '#E24B4A';
  ctx.lineWidth   = 1.5;
  peaks.forEach(pk => {
    const x = (pk.time / dur) * W;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, H - 6);
    ctx.stroke();
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────
async function startProcess() {
  if (audioNumber === null) {
    setStatus('Audio filename mein number hona chahiye (jaise 1.mp3)', 'err');
    return;
  }
  const section = extractSection(scriptRaw, audioNumber);
  if (!section) {
    setStatus('[' + audioNumber + '] marker script mein nahi mila — format check karo', 'err');
    return;
  }
  if (!audioEl.duration) { setStatus('Audio load nahi hua', 'err'); return; }
  totalDur = audioEl.duration;

  document.getElementById('startBtn').disabled = true;
  setStatus('Audio decode ho raha hai...', 'info');

  // Tokenize script section into word/space tokens
  const rawParts = section.split(/(\s+)/);
  const tokens   = [];
  rawParts.forEach(tok => {
    if (/\S/.test(tok)) tokens.push({ text: tok, isWord: true });
    else                tokens.push({ text: tok, isWord: false });
  });
  const numWords = tokens.filter(w => w.isWord).length;

  try {
    const { samples, sampleRate, duration } = await decodeAudio(audioFile);

    setStatus('RMS energy calculate ho rahi hai...', 'info');
    const frameSec  = 0.015; // 15ms frames — same as silence remover
    const rmsFrames = computeRMS(samples, sampleRate, frameSec);

    setStatus('Word onset peaks detect ho rahe hain (' + numWords + ' words)...', 'info');
    const peaks = detectWordOnsets(rmsFrames, sampleRate, frameSec, numWords);

    assignTimings(tokens, peaks, totalDur);
    drawWaveform(rmsFrames, peaks, totalDur);

    setStatus(
      '[' + audioNumber + '] synced — ' + numWords + ' words mapped to ' +
      peaks.length + ' detected peaks', 'ok'
    );
  } catch (err) {
    // Fallback: equal distribution
    let wi = 0;
    const tpw = totalDur / Math.max(numWords, 1);
    tokens.forEach(t => { if (t.isWord) { t.start = wi * tpw; t.end = (wi + 1) * tpw; wi++; } });
    setStatus('Peak detection failed — equal distribution fallback: ' + err.message, '');
  }

  words = tokens;
  renderWords();
  document.getElementById('mainPanel').classList.add('show');
  audioEl.currentTime = 0;
  audioEl.play();
  document.getElementById('playIcon').innerHTML =
    '<rect x="0" y="0" width="4" height="14"/><rect x="7" y="0" width="4" height="14"/>';
  startRAF();
  document.getElementById('startBtn').textContent = 'Restart';
  document.getElementById('startBtn').disabled    = false;
}

// ─── Render word spans ────────────────────────────────────────────────────────
function renderWords() {
  document.getElementById('transcriptText').innerHTML = words.map((w, i) => {
    if (!w.isWord) return w.text.replace(/\n/g, '<br>');
    return `<span class="word" id="w${i}">${w.text}</span>`;
  }).join('');
}

// ─── requestAnimationFrame loop ──────────────────────────────────────────────
function startRAF() {
  if (rafId) cancelAnimationFrame(rafId);
  let lastActive = -1;

  function tick() {
    const t   = audioEl.currentTime;
    const dur = audioEl.duration || 1;

    // Seekbar + duration display
    seekBar.value = (t / dur) * 100;
    document.getElementById('durDisplay').textContent = fmtShort(t) + ' / ' + fmtShort(dur);

    // Timestamp panel
    updateTimer(t);

    // Find active word
    let activeIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].isWord && t >= words[i].start && t < words[i].end) {
        activeIdx = i; break;
      }
    }
    // Edge case: keep last word highlighted at end
    if (activeIdx === -1 && t >= totalDur - 0.15 && words.length > 0) {
      for (let i = words.length - 1; i >= 0; i--) {
        if (words[i].isWord) { activeIdx = i; break; }
      }
    }

    // Only update DOM when active word changes
    if (activeIdx !== lastActive) {
      words.forEach((w, i) => {
        if (!w.isWord) return;
        const el = document.getElementById('w' + i);
        if (!el) return;
        if      (i < activeIdx)  el.className = 'word done';
        else if (i === activeIdx){ el.className = 'word active'; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        else                      el.className = 'word';
      });
      lastActive = activeIdx;
    }

    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

// ─── Timer column updater ─────────────────────────────────────────────────────
function updateTimer(s) {
  s = Math.max(0, s || 0);
  document.getElementById('tH').textContent  = pad2(Math.floor(s / 3600));
  document.getElementById('tM').textContent  = pad2(Math.floor((s % 3600) / 60));
  document.getElementById('tS').textContent  = pad2(Math.floor(s % 60));
  document.getElementById('tMS').textContent = pad2(Math.floor((s % 1) * 100));
}

// ─── Audio events ─────────────────────────────────────────────────────────────
audioEl.onended = function () {
  document.getElementById('playIcon').innerHTML = '<polygon points="0,0 12,7 0,14"/>';
  if (rafId) cancelAnimationFrame(rafId);
  words.forEach((w, i) => {
    if (!w.isWord) return;
    const el = document.getElementById('w' + i);
    if (el) el.className = 'word done';
  });
};

seekBar.oninput = function () {
  if (audioEl.duration) audioEl.currentTime = (seekBar.value / 100) * audioEl.duration;
};

// ─── Play / Pause ─────────────────────────────────────────────────────────────
function togglePlay() {
  if (audioEl.paused) {
    audioEl.play();
    document.getElementById('playIcon').innerHTML =
      '<rect x="0" y="0" width="4" height="14"/><rect x="7" y="0" width="4" height="14"/>';
    startRAF();
  } else {
    audioEl.pause();
    document.getElementById('playIcon').innerHTML = '<polygon points="0,0 12,7 0,14"/>';
    if (rafId) cancelAnimationFrame(rafId);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtShort(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.innerHTML  = msg;
  el.className  = 'status' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : type === 'info' ? ' info' : '');
}
