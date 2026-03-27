# Smart Marker Transcript Sync
### Word Peak Detection Edition

A free, zero-permission browser tool that syncs a script with an audio file — word by word, in real time — using **energy peak detection** on the raw waveform.

No API keys. No microphone. No server. Just open `index.html` in any modern browser.

---

## How It Works

```
Audio file → Decode to mono PCM
          → Compute RMS energy (15ms frames)
          → Find speech "islands" (runs above silence threshold)
          → Detect peak frame inside each island = word onset
          → Map script words to those peaks
          → Play audio + highlight current word via requestAnimationFrame
```

- **Fast speaker** → peaks are close together → tight word timing ✓  
- **Slow speaker** → peaks are spread out → wider word timing ✓  
- **Pauses** → silence between islands → natural break points ✓  

The waveform canvas shows **blue bars** (energy) and **red lines** (detected word onset peaks) so you can visually verify detection quality.

---

## Script File Format

Wrap each audio's script section in `[N]...[N]` markers:

```
[1] Number one thing for YouTube especially in business is system.
Can you show your screen so people can see the proof? [1]

[2] Yeah so you have like two videos more than one million on a new channel.
See I just started long form two or three months ago. [2]

[3] Honestly at the start I thought I could manage everything myself.
Understand what they are doing wrong because you already did it. [3]
```

Name your audio files to match:

| Audio file | Script block used |
|------------|-------------------|
| `1.mp3`    | `[1]...[1]`       |
| `2.wav`    | `[2]...[2]`       |
| `track3.m4a` | `[3]...[3]`    |
| `ep03.ogg` | `[3]...[3]`      |

Any filename works — tool extracts the **first number** it finds in the name.

---

## Features

| Feature | Detail |
|---------|--------|
| Left panel timer | Live `00h : 00m : 00s : 00ms` timestamp |
| Word highlighting | Blue = current word, Grey = spoken, White = upcoming |
| Waveform + peaks | Visual verification of detection accuracy |
| Seekbar | Scrub audio — transcript follows |
| Auto-scroll | Active word always visible in transcript panel |
| Dark mode | Automatic via `prefers-color-scheme` |
| Fallback | Equal distribution if peak detection fails |
| Responsive | Works on mobile |

---

## File Structure

```
smart-transcript-sync/
├── index.html   — layout & markup
├── style.css    — all styling, dark mode, responsive
├── app.js       — full logic (decode, RMS, peak detection, RAF sync)
└── README.md    — this file
```

---

## Browser Support

Works in all modern browsers — no dependencies, no build step.

| Browser | Status |
|---------|--------|
| Chrome 80+ | ✅ |
| Edge 80+   | ✅ |
| Firefox 75+ | ✅ |
| Safari 14+ | ✅ |

---

## Usage

```bash
git clone https://github.com/yourusername/smart-transcript-sync
cd smart-transcript-sync
# open index.html directly — no server needed
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

---

## Accuracy Note

This tool uses **audio signal analysis** — not ASR (speech recognition). Accuracy depends on:

- Recording clarity (studio > phone > noisy)
- Speaker pace (consistent pace → better peaks)
- Silence between words (clear pauses → sharper boundaries)

For **true 100% word-level accuracy**, the only real option is running **OpenAI Whisper locally** (free, offline, Python) which does actual forced alignment. This tool is the best possible approach without any external service.

---

## License

MIT — free to use, modify, distribute.
