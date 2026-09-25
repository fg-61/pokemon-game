# Evo Clash — geliştirme sohbeti (Claude Code web + yerel oturumlar)

Bu dosya, oyunun geliştirildiği Claude Code oturumunun okunabilir dökümüdür: kullanıcı mesajları **aynen**,
asistan cevapları **özet** halinde (araç çağrıları ve ara çıktılar hariç), ardından alınan kararlar ve
local Claude Code'da devam etmek için hazır talimat.

- Repo: https://github.com/fg-61/pokemon-game — dal: `claude/pokemon-fire-red-game-pzxo98`
- Devam için önce: `CLAUDE.md` → `docs/HANDOFF.md` → `docs/ROADMAP.md`

---

## 1. Kullanıcı — ilk istek
> Bir oyun yapmak istiyorum. Tüm süreci sen yöneteceksin o yüzden gereken skill ve agentları oluşturmayı sana
> bırakıyorum. Önce oyun için gerekli alt yapıyı araştırıp ondan sonra başlamanı istiyorum. Oyun için öncelikle
> pokemon gameboy oyunu olan fire and red araştır. Tüm pokemonlar için gereken assetleri bul. Skillerinin olduğu
> bir repoda olması gerekiyordu. Hatta gerekirse önce oyunu indir sonra onu tamamı ile analiz et. Oyun
> başlangıcında 3 pokemon seçtiğin ve seçtiğin pokemonların skillerini kullanabildiğin hatta savaş esnasında
> evrim geçirebildiğin. Dengeli ve zevkli bir savaş oyunu istiyorum. Strateji ve aksiyon oyunu olacak. Görsel
> olarak göz doyurmalı. Önce belirli pokemonlarla başla sonra diğerleri için genişlet ileriki fazlarda. Three js
> yapabilirsin veya godotda kullanabilirsin veya unreal enginede kullanabilirsin. İlgili vfx effektlerini felan
> üretebilirsin savaşlar için sana kalmış. https://www.youtube.com/watch?v=Qt4KOrRSQ3I&t=42s burada savaş vfx
> efekleri olan bir video var buna bakabilrsin örnek olması amacıyla önce araştırmanı ve assetleri oluştur sonra
> oyunu üretmeye başla. Gerekirse dediğim gibi ihtiyacına göre agents ve skillsleri oluşturabilirsin.

### Asistan — yapılanlar (özet)
**Araştırma**
- ROM indirilmedi (korsan olur). Bunun yerine FireRed'in topluluk decompile'ı **pret/pokefirered** analiz edildi:
  oyunun kendi C kaynak kodu ve veri tabloları. `tools/extract-firered.mjs` ile 386 tür (stat, tip, yetenek,
  evrim, level-up/TM/tutor/egg learnset, Pokédex metni), 354 hareket ve tip tablosu JSON'a çıkarıldı.
- Asset'ler: PokeAPI sprites/cries repoları — animasyonlu savaş sprite'ları (spritesheet'e çevrildi), orijinal
  FRLG sprite'ları, ikonlar, artwork, cry sesleri (`tools/fetch-assets.mjs`).
- YouTube videosu bu ortamdan açılamadı (youtube.com ağ politikasıyla engelli); efektler Stadium / Gen 6+ 3D
  savaş stiline göre tasarlandı.
- Motor: **Three.js** (tarayıcıda çalışır, headless test edilebilir, shader kontrolü tam).

**Oyun (Evo Clash)**
- Hibrit ATB savaş: Hıza göre dolan zaman göstergesi, Gen 3 hasar formülü, tip bazlı fiziksel/özel ayrımı,
  durum etkileri, yetenekler, değiştirme.
- Aksiyon: saldırı zamanlama halkası (MÜKEMMEL = +%20 hasar), savunma halkası (-%35'e kadar hasar).
- Savaşta evrim: EVO göstergesi dolunca evrimleş → yeni statlar, yeni hareketler, evrim sineması.
- Denge: AI-vs-AI simülatörü (`yarn sim`), hat başına seviye ile dengeleme.
- Görsel: 4 arena teması, bloom + renk/flash/chroma post-process, kamera yönetmeni, hareket başına VFX tarifleri,
  VFX Lab (`lab.html`).
- Ses: orijinal prosedürel chiptune müzik, tipe özel SFX, gerçek cry'lar.
- Modlar: Meydan Okuma (5 eğitmen + Şampiyon), Hızlı Savaş. TR/EN arayüz.

**Skill ve agent'lar** (`.claude/`)
- Skills: `add-pokemon`, `move-vfx`, `balance-sim`, `firered-data`, `playtest`
- Agents: `vfx-artist`, `balance-analyst`, `asset-pipeline`, `firered-researcher`, `qa-playtester`

---

## 2. Kullanıcı
> github erişimi verebilirim bana link ver

### Asistan
GitHub hesabı bağlama (https://claude.ai/connect-github) ve Claude GitHub App kurulumu
(https://github.com/apps/claude/installations/select_target) linkleri verildi.

## 3. Kullanıcı
> tamam

### Asistan
Push hâlâ 403 verdi; App'in `pokemon-game` reposuna erişiminin kontrol edilmesi istendi
(https://github.com/settings/installations → Claude → Repository access).

## 4. Kullanıcı
> tekrar bak

### Asistan
Push başarılı oldu; tüm commit'ler `claude/pokemon-fire-red-game-pzxo98` dalına gönderildi.

---

## 5. Kullanıcı
> Kaldığın yerden devam et. Kendi paketimden devam edebilir misin 250 dolarlık paket gidince? Yoksa duruyor mu bitince

### Asistan
- Devam edildi: 85 hareketin hepsinin VFX'i tamamlandı.
- Fatura hakkında: hesap/fatura ayarları oturumdan görülemiyor. Genel olarak limit dolunca oturum durur; planda
  ekstra kullanım (usage-based billing) açıksa devam edebilir. Kesin bilgi: claude.ai → Settings → Usage/Billing.
  İş GitHub'da durduğu için yeni oturumda kaldığı yerden devam edilebilir.

---

## 6. Kullanıcı
> Devam et. Bir de daha sonra terminalden devam edebilmem için ilgili md dosyalarınıda oluşturmayı unutma.

### Asistan
- `docs/HANDOFF.md` oluşturuldu (terminalden devam adımları, durum listesi, bilinen sorunlar); `CLAUDE.md` ve
  README bu dosyaya yönlendiriyor.
- Faz 2a: Magikarp→Gyarados, Nidoran♂→Nidoking, Oddish→Vileplume, Poliwag→Poliwrath, Onix→Steelix,
  Larvitar→Tyranitar eklendi (19 hat / 51 tür); Splash, Belly Drum, Water/Volt Absorb, Poison Point, hat başına
  evrim hızı eklendi; 5000 savaşta tüm hatlar %47–53.

---

## 7. Kullanıcı
> çok hoş olmuş bu arada tebrikler. kalan tüm pokemonlarıda ekle ayrıca her değişiklikte ilgili dökümanları
> güncelle. Her seferinde ilgili değişiklikler için commit atabilirsin yönetim sende. Charmender rengi biraz soluk
> kalmış sadece biraz. Bir de pokemon harici kartları daha güzel yapabilirsin. Bir de oynarken bazen ekran
> anlamsız bir dönme yapıyor. Böyle devam kendinde geliştirilmesi gereken şeyleri bulup geliştirebilirsin.

### Asistan
- **Ekran dönmesi**: başlık ekranının gösteri döngüsü sahne kapandıktan sonra kamera yörüngesini tekrar açıyordu →
  düzeltildi, savaş başında yörünge sıfırlanıyor.
- **Soluk renk**: ACES tonemapping pixel-art'ı soldukluyordu → Neutral tonemapping + sprite doygunluğu.
- **Kartlar**: HUD bilgi kartları (portre, tip şeridi, parlak bölmeli HP barı), butonlar, modallar, sonuç ekranı,
  mesaj kutusu yenilendi.
- **Tüm Pokémon'lar**: 386 türün tamamı — 19 elle + 196 otomatik hat (`tools/gen-roster.ts`), seviyeler
  `tools/tune-levels.ts` ile 60.000 savaşlık simülasyonla dengelendi (sapma %1.7). Transform, Counter/Mirror Coat,
  Hidden Power, Wonder Guard, Roar vb. eklendi. Takım seçimine arama + tip/bölge filtresi.
- **VFX**: kadrodaki 179 hareketin her birine özel efekt (agent'larla paralel üretildi).
- **Kendi iyileştirmeleri**: kayıtlar (şampiyonluk / galibiyet / en iyi seri), tip temalı eğitmenler, çeviri düzeltmesi.

## 8. Kullanıcı
> bitince söyle localden devam edeyim. Tüm sohbet mesajını da indirebileceğim bir formatta hazırlar mısın? local claudum için

### Asistan
Bu dosya (`docs/CONVERSATION.md`) hazırlandı.

---

# Yerel oturum 1 — terminal (macOS), 2026-09-25

## 9. Kullanıcı
> dosyaları oku

### Asistan
CLAUDE.md, HANDOFF, ROADMAP, CONVERSATION okundu; yerel dal 2 doküman commit'i gerideydi, kökte `docs/`'un
birebir kopyası olan HANDOFF.md / CONVERSATION.md vardı; typecheck + 34 test + roster doğrulaması temiz.

## 10. Kullanıcı
> bu dosyalar ihtiyaç varsa güncel bir şekilde devam ettirebilirsin. Bağlamı korumak anlamında ihtiyaç yoksa sil. git pull yaptım şu an

### Asistan
Kökteki kopyalar silindi (asıl dosyalar `docs/` altında, her oturumda güncelleniyor).

## 11. Kullanıcı
> yarna çektim yarndan devam edelim ona göre güncelle

### Asistan
yarn 1'e geçildi: `yarn.lock` commit'lendi, `package-lock.json` silinip gitignore'a eklendi, `packageManager` sabitlendi;
tüm dokümanlar / skill'ler / agent'lar / araç açıklamaları `yarn <script>` (bayraklar `--` olmadan) kullanıyor.

## 12. Kullanıcı
> zayıf efektler mi, popüler Pokémon hatlarını elle iyileştirmek mi, yoksa Faz 3 mü? sırayla başla zayıf efektlerden

### Asistan
- **Surf**: gölgeli, kıvrılan dalga + dolu gövde kesiti, dalgayı yandan gösteren kamera, kullanıcı dalganın tepesinde.
- **Aurora Beam**: `prim.aurora` — boyunca akan gökkuşağı gövde + ışınlı aurora perdeleri + ışın boyunca koşan halkalar.
- **Psycho Boost**: `prim.psyOrb` plazma küresi, iki tarafta da kadrajda; pembe sis yerine keskin patlama.
- **Shock Wave**: ekran düzleminde sönümlü sinüs (önceden kavis kameraya doğru bükülüyordu).
- **Magnitude**: motorun attığı güç (`HitResult.power`) VFX'e geçiyor; 4–10 büyüklüğe göre ölçekleniyor,
  FireRed'deki gibi "Magnitude N!" mesajı.
- Bulunan hata: AI tahmini Magnitude/Present için en düşük zarı varsayıyordu (AI hiç seçmiyordu) → medyan;
  etkilenen hatlar sim ile kontrol edildi (%47.8–52.4), numel/pichu seviyeleri ayarlandı.
- Araçlar: `tools/shoot.mjs` yerelde Chrome + GPU kullanıyor; oyun saati her karede tutuluyor (kesin zamanlama).

## 13. Kullanıcı
> her pokemon için ayrı agent çalıştırsan daha hızlı olur mu?

### Asistan
Bağımsız işlerde evet: popüler hatların elle iyileştirilmesi paralel agent'larla hızlanır — ama Pokémon başına değil
grup başına (Johto/Hoenn başlangıçları, pseudo-efsaneviler, efsaneviler; 4–5 agent), her agent kendi tarif dosyasına
yazar; `roster.ts` birleştirmesi ve denge (levels:tune + sim) en sonda tek seferde yapılır.

## 14. Kullanıcı
> otomatik commit atabilirsin iznin var. Devam et. Kendine görevler bul ve onları uyarla. red and fire oyununa bakabilirsin. Güzel bir oyun yapalım seninle

### Asistan
- **Kanto Ligi**: rastgele "Meydan Okuma" yerine FireRed'in 8 Salon Lideri + Elit Dörtlü + Şampiyon'u; takımlar
  pret'ten (`trainers.json`), özgün FRLG eğitmen sprite'ları, rozetler, Şöhretler Salonu, 4 yeni arena; zorluk eğrisi
  `yarn sim --league` ile ayarlandı. Salon Lideri ve Şampiyon için özgün müzikler.
- **Kamera**: rakip, oyuncunun tam arkasında kalıyordu → BW tarzı kadraj; dev arka sprite'lara boyut sınırı.
- **Hava durumu** (Faz 3): tüm Gen 3 kuralları, yetenekler, AI, HUD, arena efektleri.
- **31 popüler hat** elle düzenlendi (araştırma agent'ı FireRed yasallığını kontrol etti), hava takımları; seviyeler
  yeniden dengelendi. Paralel agent'lar: hava VFX'i, imza hareketi VFX'leri, moveset araştırması.

---

## Önemli kararlar (neden böyle?)
| Karar | Gerekçe |
|---|---|
| ROM yerine pret/pokefirered | Yasal, okunabilir, oyunun kendi veri tabloları |
| Three.js | Tarayıcıda anında çalışır, headless test, shader kontrolü |
| Pixel sprite + 3D arena (billboard) | En iyi görsel/emek oranı, orijinal sprite'lar korunur |
| Turn yerine ATB + zamanlama halkaları | "Strateji + aksiyon" isteği |
| Savaşta evrim göstergesi | "Savaş esnasında evrim" isteği; taktik bir karar noktası |
| Gen 3 fiziksel/özel ayrımı (tipe göre) | FireRed'e sadık kalmak |
| HP ×1.6, kritik ×1.5, uyku 1–3 aksiyon | Gerçek zamanlı akışta denge |
| Hat başına seviye ile denge | FireRed'in de eğitmen seviyeleriyle dengelemesi |
| Otomatik roster + otomatik seviye ayarı | 386 türü elle dengelemek pratik değil; popüler hatlar elle iyileştirilebilir |
| Orijinal prosedürel müzik | Telifli müzik kullanılmadı |
| yarn 1 (classic) | Kullanıcının tercihi (yerel oturum 1) |
| VFX kontrolü iki taraftan (side 0/1) ekran görüntüsüyle | Kadraj sorunları çoğunlukla tek tarafta çıkıyor |
| Paralel agent'lar grup başına, denge en sonda tek seferde | Ortak dosya çakışmaları ve kadro çapında denge |
| Kanto Ligi gerçek FireRed takımlarıyla, zorluk = AI profili + seviye farkı | FireRed ruhu; eğri simülatörle ölçülebilir |
| Hava süresi: hareket 20 sn, yetenek 45 sn | Gen 3'ün 5 turu / kalıcı yetenek havası gerçek zamanlı akışa uyarlandı |

## Local Claude Code'da devam
```bash
git clone -b claude/pokemon-fire-red-game-pzxo98 https://github.com/fg-61/pokemon-game
cd pokemon-game
yarn install
yarn typecheck && yarn test && yarn roster:validate
yarn dev          # http://localhost:5173  (VFX Lab: /lab.html)
claude
```
İlk mesaj olarak şunu yazabilirsin:
> docs/CONVERSATION.md ve docs/HANDOFF.md dosyalarını oku. Bu projeyi birlikte geliştiriyoruz; HANDOFF'taki
> bilinen sorunlardan ve yol haritasından devam et. Her değişiklikte ilgili dokümanları güncelle ve commit at.

Sıradaki öneriler (HANDOFF'ta da var):
- Zayıf VFX'ler: Surf, Aurora Beam, Psycho Boost (rakip tarafı), Shock Wave.
- Popüler otomatik hatları elle iyileştirme (Johto/Hoenn başlangıçları, efsaneviler) — `add-pokemon` skill'i.
- Gerçek tarayıcıda tam bir savaş oynayıp zamanlama halkasını kontrol etme (headless testte yakalanamadı).
- Faz 3: hava durumu, eşyalar, 2 oyunculu mod (`docs/ROADMAP.md`).
