# Smart Marker Transcript Sync

A free, zero-permission browser tool that syncs a script file with an audio file — word-by-word, in real time.

No API keys. No microphone permission. No server needed. Just open `index.html` in Chrome or Edge.

---

## How It Works

1. **Upload an audio file** — name it with a number: `1.mp3`, `2.wav`, `track3.m4a`, etc.
2. **Upload a script file** (.txt) — wrap the matching section with `[N]...[N]` markers.
3. Hit **Start Transcription** — audio plays and each word lights up blue as it's spoken.

The tool reads the number from the audio filename, finds the matching `[N]...[N]` block in the script, distributes words proportionally across the audio duration, and highlights them in real time using `requestAnimationFrame`.

---

## Script File Format

```
[1] Number one thing for YouTube especially in business is system.
Can you show your screen so people can see the proof? [1]

[2] Yeah so you have like two videos more than one million on a new channel.
See I just started long form two or three months ago. [2]

[3] Honestly at the start I thought I could manage everything myself.
Understand what they are doing wrong because you already did it. [3]
```

Match your audio filenames to these numbers:
- `1.mp3` → uses `[1]...[1]` block
- `2.wav` → uses `[2]...[2]` block
- `track3.mp3` → uses `[3]...[3]` block (any name, just needs the number)

---

## Features

- **Left panel** — live timestamp counter: `00h : 00m : 00s : 00`
- **Right panel** — full script section with word-by-word blue highlight
- **Done words** turn grey as audio progresses
- **Seekbar** — scrub audio, transcript follows
- **Dark mode** supported automatically
- **Responsive** — works on mobile too

---

## Files

```
smart-transcript-sync/
├── index.html   — markup & layout
├── style.css    — all styling + dark mode
├── app.js       — all logic (audio sync, word timing, RAF loop)
└── README.md    — this file
```

---

## Browser Support

| Browser | Works? |
|---------|--------|
| Chrome  | ✅ Yes |
| Edge    | ✅ Yes |
| Firefox | ✅ Yes |
| Safari  | ✅ Yes |

No external dependencies. Pure HTML + CSS + JS.

---

## Usage

Just open `index.html` directly in any browser — no build step, no server required.

```bash
git clone https://github.com/yourusername/smart-transcript-sync
cd smart-transcript-sync
open index.html   # macOS
# or double-click index.html on Windows/Linux
```

---

## License

MIT — free to use, modify, and distribute.
