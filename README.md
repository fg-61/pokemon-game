# Evo Clash — Pokémon FireRed Battle Arena

3D Pokémon savaş oyunu (Three.js). 3 Pokémon seç, gerçek FireRed hareketleriyle gerçek zamanlı (ATB) savaş,
zamanlama halkalarıyla ekstra hasar / savunma yap ve **savaşın ortasında evrimleş**.

*A 3D Pokémon battle game (Three.js): pick 3, fight on a real-time ATB timeline with real FireRed moves, hit timing
rings for bonus damage or to brace, and evolve mid-battle.*

## Başlat / Run
```bash
yarn install
yarn dev        # http://localhost:5173  (VFX Lab: /lab.html)
yarn build      # production build in dist/
```

## Nasıl oynanır / How to play
- Her Pokémon'un **ATB** göstergesi Hızına göre dolar; dolunca hareket seç (1-4), değiştir (S) ya da evrimleş (E).
- Saldırırken küçülen halka iç halkaya değince **SPACE** → MÜKEMMEL: +%20 hasar, daha çok kritik.
- Rakip saldırırken kırmızı halkada **SPACE** → hasarı %35'e kadar azalt.
- Hasar vermek/almak altın **EVO** göstergesini doldurur → **EVRİM**: yeni statlar, yeni hareketler, biraz can.
- 3. nesil kuralları: fiziksel/özel ayrımı hareketin TİPİNE göre (FireRed'deki gibi).

## Neler var / What's inside
- **Veri**: pret/pokefirered decompile'ından çıkarılan 386 tür + 354 hareket + tip tablosu (`yarn data:extract`).
- **Kadro**: FireRed'deki 386 türün tamamı (215 hat: 19 elle, 196 otomatik), FireRed'de yasal moveset'ler (`yarn roster:validate`).
- **Denge**: AI-vs-AI simülatör + otomatik seviye ayarı; 215 hattın sapması ~%1.7 (`yarn sim`, `yarn levels:tune`).
- **Görsel**: 4 arena, animasyonlu sprite'lar, kadrodaki 179 hareketin her birine özel VFX, evrim sineması, bloom + ekran efektleri.
- **Ses**: orijinal prosedürel chiptune müzik, tipe özel efektler, gerçek Pokémon çığlıkları.
- **Claude skill & agent'ları** (`.claude/`): add-pokemon, move-vfx, balance-sim, firered-data, playtest;
  vfx-artist, balance-analyst, asset-pipeline, firered-researcher, qa-playtester.

**Terminalden devam etmek için:** [docs/HANDOFF.md](docs/HANDOFF.md)

Docs: [Game design](docs/GAME_DESIGN.md) · [Research](docs/RESEARCH.md) · [Roadmap](docs/ROADMAP.md) · [CLAUDE.md](CLAUDE.md)

## Yasal / Legal
Ticari olmayan hayran projesi. Pokémon ve ilgili tüm varlıklar © Nintendo / Creatures / GAME FREAK.
Sprite ve sesler PokeAPI depolarından; müzik, VFX ve arayüz orijinaldir. ROM kullanılmaz ve dağıtılmaz.
