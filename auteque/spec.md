# Meaning Timeline — Spec v1

**Status:** Draft v1
**Last updated:** 2026-04-26

---

## 1. The idea in one paragraph

Audio is linear. You start at 0:00 and crawl to the end with no idea where the meaning is. The Meaning Timeline turns an audio file into a visual map of meaning over time. A handful of lenses each become a smooth density curve along the audio's runtime. The curves overlap on a shared time axis. Where they peak, the audio is dense in that lens; where they trough, it isn't. Where two curves rise together, two ideas converge — the listener can see synergy as a shape on the page. They navigate by meaning, not by minute.

---

## 2. Cost model

**One LLM pass per asset, at upload. Nothing at runtime.**

Everything a visitor sees comes from a static JSON served alongside the audio. No per-visit calls. No per-listener calls. No model inference on the request path.

This is the load-bearing constraint for v1; every other decision in this spec defers to it.

---

## 3. Anatomy

```
HEADER       ─ track title · duration · play/pause · current time
MARKER STRIP ─ timestamp ▸ short label (5–7 markers)
PLOT         ─ overlapping smooth density curves on shared time axis
LENS CHIPS   ─ toggle each lens on/off
```

Four layers, top to bottom. The plot is the centerpiece.

---

## 4. Lenses

Five built-ins, all scored once at upload.

| Lens | What the curve represents |
|---|---|
| **Topics** | Density of the asset's discovered topics across time. Top 5–7 topics discovered at upload. The curve is `max` across topics per bin; tooltip breaks it out per topic. |
| **Emotion** | Affect intensity per segment, with a single dominant label per bin (curiosity, tension, joy, frustration, calm) used for tooltip color. |
| **Speaker** | Step function — one speaker active at a time. Hidden if diarization didn't run. |
| **Argument** | Density of rhetorical moves: claim, evidence, counter-argument, anecdote, summary. |
| **Depth** | Surface, intermediate, deep / expert. |

**Out of scope for v1:**
- *Custom-prompt lenses.* The expressivity is real but each prompt is a per-visit LLM call, which breaks the cost promise. Reconsider in v1.x.
- *Personal relevance.* Same reason. If it returns, it ships as cosine similarity over precomputed segment embeddings — zero runtime model calls.

---

## 5. Data shape

One record per asset, written at upload, served as a static JSON to the player.

```json
{
  "assetId": "...",
  "duration": 3215,
  "segments": [
    { "id": "s1", "start": 0, "end": 14.2, "speaker": "speaker_a" }
  ],
  "topics": [
    { "id": "topic_1", "label": { "en": "narrative", "es": "narrativa" } }
  ],
  "scores": {
    "s1": {
      "topics":   { "topic_1": 0.82, "topic_3": 0.10 },
      "emotion":  { "label": "curiosity", "intensity": 0.61 },
      "argument": "claim",
      "depth":    "intermediate"
    }
  },
  "markers": [
    { "time": 270, "label": { "en": "Opening framing", "es": "Marco de apertura" } }
  ]
}
```

- Topics keyed by stable `id`, never by name. Renaming in authoring doesn't invalidate scores.
- All locale-dependent text bundled in the file; the player picks the locale at render.
- Segment IDs come from the upstream transcription pipeline.

---

## 6. Rendering

### 6.1 Curves

- Smoothing: monotone cubic interpolation between binned points.
- Stroke: 1.5–2px, full color saturation.
- Area fill: same color at ~12% opacity. Synergy is the natural result of overlapping fills.
- Color: one hue per lens (purple, teal, amber, pink, coral).

### 6.2 Bins

Adaptive: target ≈8s per bin, clamped to [60, 360] bins per asset. A 5-min file → ~38 bins; a 4-hr file → 360. Smoothing kernel: 3-bin moving average. All client-side.

### 6.3 Interactions

- Hover plot at x → vertical guide on nearest bin + tooltip with time and per-lens values for visible series only.
- Hover a chip → that lens at full opacity; others dim to ~15% stroke and area hidden.
- Click a chip → toggle on/off.
- Click a marker → seek + play.
- Click on plot → seek to that timestamp.

### 6.4 Synergy halo

When 3+ lenses are above 0.5 in the same bin, the area fill receives +8% opacity. Color: alpha-weighted blend of contributing hues, computed per bin at render. Only decorative effect in the UI — earns its keep as the visual signature of meaning convergence.

---

## 7. Multilingual

- Plot is language-agnostic — numbers and shapes only.
- Lens names: static i18n strings.
- Topic labels and marker text: translated at upload. The same upload pass returns labels in each supported locale (or runs a small follow-up translation step). All locales bundled into the asset record.
- Locale resolution at render: `?lang=` → user pref → `Accept-Language` → org primary → `en`.

No per-visit translation. No locale-specific cache misses. Adding a new locale = re-run one upload pass per affected asset.

---

## 8. Failure modes

- **Upload scoring fails** → audio uploads, asset record marks `meaningReady: false`. Player shows transcript only with a "still analyzing" banner. Retry queued.
- **Diarization missing** → segments lack `speaker`; speaker chip hidden with a tooltip explaining why.
- **Asset shorter than 60s** → markers and chips collapse; one combined "intensity" curve (max across all lenses per bin).
- **Asset has no detectable topics** (silence, music) → plot hidden; transcript view only.

---

## 9. Lens defaults on first view

- Topics: on
- Argument: on
- Speaker: on if diarization succeeded, hidden otherwise
- Emotion: off (toggle to show)
- Depth: off (toggle to show)

Two on by default (three with diarization). Synergy halo at 3+ lenses → only fires when the listener has actively turned on extras, preserving its signal.

---

## 10. Decisions

- **Name.** *Meaning Timeline*. Tagline: *"Audio stops being linear. Navigate by meaning."*
- **Static-only delivery.** No backend on the visitor path. The asset record is a CDN-friendly JSON.
- **No custom prompts in v1.** Reconsider once usage data justifies the per-visit budget.
- **No personal relevance in v1.** When it returns, it's cosine similarity over precomputed segment embeddings.
- **Synergy halo ships in v1.** Rendering only — no runtime cost.

---

## 11. Open questions

- Segment source — Whisper exclusively, or pluggable? Decide before the scoring contract is locked.
- Halo color blend — hue-weighted vs. simple alpha stack. Pick after a prototype.
- Asset record max size — at 360 bins × 5 lenses, well under 100KB. No pagination needed.
