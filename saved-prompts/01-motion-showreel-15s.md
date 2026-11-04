# Saved prompt 01: 15-second motion showreel

Saved: 2026-11-04. Status: **saved only, not built.** Do not run it until the user explicitly asks.

## Prompt (verbatim)

> make a dynamic 15-second motion graphics video that shows what an incredible motion designer you are, like it's your showreel for a résumé. go all out.

## Notes from the first look

- 1920x1080 at 60fps. 128 BPM puts 8 bars at exactly 15.0 s.
- Synthesized soundtrack synced to the cuts.
- Fonts already in the container: Inter, Inter Display and JetBrains Mono.
- Pipeline: canvas animation driven by `seek(t)`, frames captured with Playwright, encoded with ffmpeg.
