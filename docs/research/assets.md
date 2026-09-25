# Pokémon asset sources and spritesheet format

Notes for `tools/fetch-assets.mjs` (`npm run assets:fetch`). All sources are the
[PokeAPI sprites](https://github.com/PokeAPI/sprites) and [PokeAPI cries](https://github.com/PokeAPI/cries)
repositories, fetched from `raw.githubusercontent.com`. Attribution: `public/assets/ATTRIBUTION.md`.

Base `B = https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon`.

## What exists for gen 1-3 species

| Source | Path | Format / size | Coverage | Used for |
|---|---|---|---|---|
| Showdown animated | `B/other/showdown/{dex}.gif`, `.../back/{dex}.gif` (also `shiny/`) | GIF, 20-120 frames, 30-40 ms/frame. Canvas is tight around the animation and differs per species (Pidgey 36x49, Pikachu 60x60, Charizard 133x140, Charizard back 172x166) | Gen 1-9, front and back. A few of the newest species (e.g. #1008, #1010+) were missing at the time of writing | Main battle billboard (`front.png` / `back.png`) |
| Black/White animated | `B/versions/generation-v/black-white/animated/{dex}.gif`, `.../back/` | GIF, 40-100 frames, 100-300 ms/frame, also tightly cropped (Charizard 87x89) | Gen 1-5 (#1-649) | First fallback |
| Default static | `B/{dex}.png`, `B/back/{dex}.png` | PNG 96x96 | All species | Last fallback (1 frame) |
| FireRed/LeafGreen | `B/versions/generation-iii/firered-leafgreen/{dex}.png`, `.../back/` | PNG 64x64, indexed colour | #1-386 only (Emerald / Ruby-Sapphire folders have the same size) | `frlg-front.png` / `frlg-back.png` (retro mode, UI) |
| Menu icon | `B/versions/generation-viii/icons/{dex}.png` (fallback `generation-vii/icons`) | PNG 68x56 (gen 8), 40x30 (gen 7) | All species | `icon.png` (party / roster UI) |
| Official artwork | `B/other/official-artwork/{dex}.png` | PNG 475x475, ~150 KB | All species | `artwork.png`, downscaled to 256 px wide (~55 KB) |
| HOME renders | `B/other/home/{dex}.png` | PNG 512x512 3D renders | All species | Not used |
| Cries | `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/{dex}.ogg` (fallback `latest/`) | Ogg Vorbis, ~6 KB | `legacy` (older-game cries) covers #1-649; `latest` covers every species | `cry.ogg` |

The Showdown set goes all the way to gen 9, so the pipeline covers all 386 FireRed species and
beyond without changes. Only the FRLG sprites stop at #386. For species outside it, those files
are just missing from `files` in the manifest.

## Pipeline

`node tools/fetch-assets.mjs [--ids 1-9,16,25-26] [--force] [--out dir]`. By default it fetches every
dex number in `src/data/roster-dex.json`. Existing outputs are skipped unless `--force` is passed.
It uses 4 concurrent downloads and retries 3 times with backoff; a 404 counts as "not available" and
the next source is tried. Behind an HTTPS proxy the script re-runs itself with
`NODE_USE_ENV_PROXY=1` so that Node's `fetch` uses `HTTPS_PROXY`. The proxy CA comes from
`NODE_EXTRA_CA_CERTS`.

Frame decoding uses `sharp(buf, { animated: true })`. That gives a vertical strip of `pages`
frames, each `pageHeight` tall, plus `delay[]`. libvips composites GIF frames with correct
disposal handling. For Showdown and BW GIFs (#6, #25, #94, #149) the output was checked to be
pixel-identical to Pillow's compositing, and the sheets were also inspected by eye.

For the default 35-species roster the output is about 5.2 MB. Of that, sheets take ~2.9 MB,
artwork ~1.9 MB and cries ~0.2 MB.

## Spritesheet format

Each species gets `public/assets/pokemon/{dex}/sprite.json`:

```jsonc
{
  "dex": 6,
  "front": {
    "file": "front.png",
    "frameW": 137, "frameH": 144,   // cropped frame size in source pixels
    "cols": 7, "rows": 7,           // grid, row-major, cols = ceil(sqrt(frames))
    "frames": 47,
    "durations": [40, 40, ...],     // ms per frame (GIF delay <= 10 -> 100, then min 20)
    "source": "showdown",           // "showdown" | "bw" | "static"
    "bboxBottomPad": 2              // transparent rows below the lowest opaque pixel
  },
  "back": { ... }
}
```

- **Stable crop.** The pipeline takes the union bounding box of non-transparent pixels over all
  frames and adds 2 px of padding. Every frame is cropped to that same box, so the sprite does
  not jitter. Showdown GIFs are already cropped to their union box, so their frame size is just
  the GIF canvas plus 4 px.
- **Feet / ground line.** `bboxBottomPad` (normally 2) is the gap between the lowest opaque pixel
  in any frame and the frame's bottom edge. To stand a billboard on the ground, offset it down
  by `bboxBottomPad` source pixels. Flying species have no feet, so their lowest pixel is a wing
  or tail tip. Hover height is a gameplay decision.
- **Size limit.** No sheet side exceeds 2048 px. If a sheet would, every other frame is dropped
  and its duration is added to the kept frame, until the sheet fits. The loop length stays the
  same. No roster species needs this. Large sprites do: in testing, Wailord back went from 123 to
  62 frames, Kyogre from 75 to 38 and Eternatus back from 100 to 50.
- **No resampling.** Frames are copied pixel for pixel. Render them with `NearestFilter` and no
  mipmaps.
- **PNG encoding.** A sheet is written as an indexed-palette PNG only when the palette version
  decodes back identical to the original pixels. Otherwise it stays full-colour RGBA. A few GIFs
  use local palettes and have more than 256 colours across frames, e.g. #65 front and #123 back.

`manifest.json` in the same folder lists every species: its `files`, plus `frameW` / `frameH` /
`frames` / `source` for the front and back sheets. It also has the source URL templates and
`generatedAt`. New runs merge into the existing entries.

## Relative size matters

Canvas sizes differ per species because the Showdown artists drew each Pokémon at a consistent
pixel scale. Pidgey is about 36x49, Charizard 133x140 and Wailord about 146x81.
So **keep a constant world-units-per-source-pixel** when you build billboards (e.g.
`height = frameH * k`). Do not normalise every sprite to the same height, or the size
differences between species are lost. Back sprites have their own canvas sizes, but they use the same pixel scale as the
front sprites.
