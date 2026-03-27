/* =============================================
   Smart Marker Transcript Sync — app.js
   ============================================= */

let words = [];
let audioEl = document.getElementById('audioEl');
let seekBar = document.getElementById('seekBar');
let rafId = null;
let audioNumber = null;
let scriptRaw = '';
let totalDur = 0;

/* ---- File upload handlers ---- */

document.getElementById('audioIn').onchange = function (e) {
  let f = e.target.files[0];
  if (!f) return;
  document.getElementById('audioName').textContent = f.name;
  document.getElementById('audioBox').classList.add('ready');
  // Extract number from filename: "1.mp3" -> 1, "track2.wav" -> 2
  let m = f.name.match(/(\d+)/);
  audioNumber = m ? parseInt(m[1]) : null;
  audioEl.src = URL.createObjectURL(f);
  document.getElementById('playerCard').classList.add('show');
  audioEl.onloadedmetadata = function () { checkReady(); };
};

document.getElementById('scriptIn').onchange = function (e) {
  let f = e.target.files[0];
  if (!f) return;
  document.getElementById('scriptName').textContent = f.name;
  document.getElementById('scriptBox').classList.add('ready');
  let reader = new FileReader();
  reader.onload = function (ev) { scriptRaw = ev.target.result; checkReady(); };
  reader.readAsText(f);
};

/* ---- Ready check ---- */

function checkReady() {
  let aOk = document.getElementById('audioIn').files[0] && audioEl.duration > 0;
  let sOk = scriptRaw.length > 0;
  document.getElementById('startBtn').disabled = !(aOk && sOk);
  if (aOk && sOk) setStatus('Ready! "Start Transcription" dabao', 'ok');
  else if (sOk) setStatus('Audio load ho raha hai...', '');
  else setStatus('Audio aur script dono upload karo', '');
}

/* ---- Extract [N]...[N] section from script ---- */

function extractSection(text, num) {
  let re = new RegExp('\\[' + num + '\\]([\\s\\S]*?)\\[' + num + '\\]', 'i');
  let m = text.match(re);
  return m ? m[1].trim() : null;
}

/* ---- Build word tokens with timestamps & play ---- */

function buildAndPlay() {
  let num = audioNumber;
  if (num === null) {
    setStatus('Audio filename mein number hona chahiye (jaise 1.mp3)', 'err');
    return;
  }
  let section = extractSection(scriptRaw, num);
  if (!section) {
    setStatus('[' + num + '] marker script mein nahi mila — format check karo', 'err');
    return;
  }
  let dur = audioEl.duration;
  if (!dur || dur <= 0) { setStatus('Audio duration detect nahi hua', 'err'); return; }
  totalDur = dur;

  // Split into word tokens (preserving whitespace/newlines for display)
  let rawParts = section.split(/(\s+)/);
  let tokens = [];
  rawParts.forEach(tok => {
    if (/\S/.test(tok)) tokens.push({ text: tok, isWord: true });
    else tokens.push({ text: tok, isWord: false });
  });

  // Assign proportional timestamps based on word index
  let realWords = tokens.filter(w => w.isWord);
  let tpw = dur / Math.max(realWords.length, 1);
  let wi = 0;
  tokens.forEach(tok => {
    if (tok.isWord) { tok.start = wi * tpw; tok.end = (wi + 1) * tpw; wi++; }
  });

  words = tokens;
  renderWords();
  document.getElementById('mainPanel').classList.add('show');

  audioEl.currentTime = 0;
  audioEl.play();
  document.getElementById('playIcon').innerHTML =
    '<rect x="0" y="0" width="4" height="14"/><rect x="7" y="0" width="4" height="14"/>';
  startRAF();

  setStatus('[' + num + '] loaded — ' + realWords.length + ' words synced', 'ok');
  document.getElementById('startBtn').textContent = 'Restart';
}

/* ---- Render word spans ---- */

function renderWords() {
  let c = document.getElementById('transcriptText');
  c.innerHTML = words.map((w, i) => {
    if (!w.isWord) return w.text.replace(/\n/g, '<br>');
    return `<span class="word" id="w${i}">${w.text}</span>`;
  }).join('');
}

/* ---- requestAnimationFrame loop ---- */

function startRAF() {
  if (rafId) cancelAnimationFrame(rafId);
  let lastActive = -1;

  function tick() {
    let t = audioEl.currentTime;
    let dur = audioEl.duration || 1;

    // Update seekbar
    seekBar.value = (t / dur) * 100;
    document.getElementById('durDisplay').textContent = fmtShort(t) + ' / ' + fmtShort(dur);

    // Update split timer columns
    updateTimerCols(t);

    // Find active word
    let activeIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].isWord && t >= words[i].start && t < words[i].end) {
        activeIdx = i; break;
      }
    }
    // Edge: at end, keep last word highlighted
    if (activeIdx === -1 && t >= totalDur - 0.1 && words.length > 0) {
      for (let i = words.length - 1; i >= 0; i--) {
        if (words[i].isWord) { activeIdx = i; break; }
      }
    }

    if (activeIdx !== lastActive) {
      words.forEach((w, i) => {
        if (!w.isWord) return;
        let el = document.getElementById('w' + i);
        if (!el) return;
        if (i < activeIdx) el.className = 'word done';
        else if (i === activeIdx) {
          el.className = 'word active';
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else el.className = 'word';
      });
      lastActive = activeIdx;
    }

    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

/* ---- Timer column updater (00h 00m 00s 00ms) ---- */

function updateTimerCols(s) {
  s = Math.max(0, s || 0);
  let h = Math.floor(s / 3600);
  let m = Math.floor((s % 3600) / 60);
  let sec = Math.floor(s % 60);
  let ms = Math.floor((s % 1) * 100);
  document.getElementById('tH').textContent = pad2(h);
  document.getElementById('tM').textContent = pad2(m);
  document.getElementById('tS').textContent = pad2(sec);
  document.getElementById('tMS').textContent = pad2(ms);
}

/* ---- Audio events ---- */

audioEl.onended = function () {
  document.getElementById('playIcon').innerHTML = '<polygon points="0,0 12,7 0,14"/>';
  if (rafId) cancelAnimationFrame(rafId);
  words.forEach((w, i) => {
    if (!w.isWord) return;
    let el = document.getElementById('w' + i);
    if (el) el.className = 'word done';
  });
};

seekBar.oninput = function () {
  if (audioEl.duration) audioEl.currentTime = (seekBar.value / 100) * audioEl.duration;
};

/* ---- Play / Pause toggle ---- */

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

/* ---- Helpers ---- */

function fmtShort(s) {
  s = Math.max(0, s || 0);
  let m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

function setStatus(msg, type) {
  let el = document.getElementById('status');
  el.innerHTML = msg;
  el.className = 'status' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
}
