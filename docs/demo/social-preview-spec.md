# Social preview image spec

A placeholder spec — not a finished image. This describes what to design, by hand, in whatever tool is convenient (Figma, Canva, even an annotated screenshot). GitHub uses this for link unfurls (Slack, Twitter/X, LinkedIn, Discord); it's the same image worth reusing for a portfolio site's project card if that site doesn't generate its own.

## Dimensions

**1280×640px** (2:1 ratio) — GitHub's documented social preview size (Settings → General → Social preview). Keep the center ~1200×600px free of anything critical; some surfaces crop the outer edge slightly.

## Content

- **Background**: the dashboard screenshot (`docs/demo/screenshots/dashboard.png`), cropped/scaled to fill the frame, very slightly dimmed or blurred (~10-20%) so text laid on top stays readable — not the raw screenshot at full contrast.
- **Title, top-left or centered**: "AI CMS Assistant" — large, bold, high contrast against the dimmed background.
- **Subtitle, directly below**: "AI-powered content assistant for Sanity & WordPress" (short — this is read at thumbnail size, not full size).
- **Optional small badges/row, bottom**: "Next.js · Sanity · WordPress · OpenAI · Claude · Groq" in a small monospace or pill-style row — only if it doesn't crowd the title.
- **No screenshot UI chrome text should be legible at thumbnail size** — the background screenshot is texture/color, not something a viewer is meant to read; all the actually-readable text is the overlaid title/subtitle.

## File

Export as PNG, under 1MB (GitHub's social preview upload limit is 1MB). Save to `docs/demo/social-preview.png` once made, and upload the same file at the repo's Settings → General → Social preview.

## Why this is a spec and not a finished image

Generating a polished composited image (background + typography + layout) isn't something this pass produces directly — it's a 10-minute manual task in a design tool, using the screenshot and copy already captured in this repo. This file exists so that 10 minutes doesn't also require re-deriving the title/subtitle wording or dimensions from scratch.
