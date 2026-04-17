# E-book Generator — Razvojni Zadaci (50)

> Označite zadatke koje želite da se realizuju. Svaki zadatak ima složenost (🟢 Lakše, 🟡 Srednje, 🔴 Kompleksno) i kategoriju.

---

## 🏗️ Arhitektura & Infrastruktura

- [ ] **T1** 🔴 Zameniti in-memory job queue sa BullMQ + Redis za持久nost i skalabilnost — trenutno se gube poslovi pri restartu servera
- [ ] **T2** 🟡 Dodati WebSocket (Socket.io) real-time notifikacije umesto polling-a — frontend trenutno polla svakih 3s što je neefikasno
- [ ] **T3** 🟡 Migrirati sa SQLite na PostgreSQL za produkciju — dodati docker-compose.yml sa Postgres servisom
- [ ] **T4** 🔴 Implementirati distributed locking za job queue — sprečiti da dva workera istovremeno obrađuju istu knjigu
- [ ] **T5** 🟡 Dodati Dockerfile i docker-compose.yml za ceo stack (app + redis + postgres) sa health check-ovima
- [ ] **T6** 🟢 Kreirati CI/CD pipeline konfiguraciju (GitHub Actions) — lint, type-check, test, build

## 🤖 LLM & AI Poboljšanja

- [ ] **T7** 🔴 Implementirati "Self-Reflection" Editor pass — Editor ocenjuje kvalitet svakog poglavlja (1-10) i ponavlja generisanje ako je ocena < 7
- [ ] **T8** 🟡 Dodati streaming LLM odgovore — korisnik vidi tekst kako se generiše u real-time (SSE ili WebSocket)
- [ ] **T9** 🔴 Implementirati RAG (Retrieval-Augmented Generation) — korisnik uploaduje reference dokumente (PDF/URL) koji se koriste kao kontekst za pisanje
- [ ] **T10** 🟡 Dodati podršku za fiction žanr — drugačiji sistem promptovi za fiction vs non-fiction, sa karakterima, dijalozima i zapletom
- [ ] **T11** 🟡 Implementirati adaptivni chapter length kontroler — LLM često generiše prekratka ili preduga poglavlja; dodati validaciju dužine i re-generisanje ako je van opsega
- [ ] **T12** 🔴 Dodati multi-model pipeline — koristiti jeftiniji model za planiranje, jači model za pisanje, i brži model za sumarizaciju
- [ ] **T13** 🟡 Implementirati "anti-hallucination" check — nakon svakog poglavlja, proveriti da li su tvrdnje konzistentne sa outline-om i prethodnim poglavljima
- [ ] **T14** 🔴 Dodati AI-generisane ilustracije po poglavlju — koristiti image-generation skill da kreira ilustracije za svako poglavlje i ugradi ih u EPUB/PDF

## 📝 Sadržaj & Kvalitet

- [ ] **T15** 🟡 Dodati "Plagiarism/Similarity" detekciju — uporediti generisani tekst sa poznatim izvorima i upozoriti na sličnosti
- [ ] **T16** 🔴 Implementirati višejezičnu podršku — korisnik bira jezik knjige (en, sr, de, fr, itd.) i svi promptovi se adaptiraju
- [ ] **T17** 🟡 Dodati korisnički rečnik termina — korisnik definiše termine/definicije koje LLM mora koristiti konzistentno kroz celu knjigu
- [ ] **T18** 🟡 Implementirati "Style Reference" — korisnik uploaduje sample tekst i LLM imitira njegov stil pisanja
- [ ] **T19** 🟢 Dodati automatsko generisanje metapodataka — keywords, abstract, ISBN placeholder, copyright stranica
- [ ] **T20** 🔴 Implementirati "Fact-Checking" modul — za svako poglavlje, LLM proverava faktografske tvrdnje i flaguje sumnjive

## 📤 Eksport & Formatiranje

- [ ] **T21** 🟡 Dodati MOBI format eksport (za Amazon Kindle) — koristiti Calibre ebook-convert ili Kindlegen
- [ ] **T22** 🔴 Implementirati自定义 PDF templete — korisnik bira između više stilova (akademski, poslovni, kreativni, minimalistički)
- [ ] **T23** 🟡 Dodati generisanje korica knjige (cover page) — AI-generisana slika + naslov + autor u visokom rezolucijom
- [ ] **T24** 🟡 Implementirati DOCX eksport — koristiti Pandoc markdown→docx sa prilagođenim šablonom
- [ ] **T25** 🔴 Dodati interaktivni HTML eksport — single-page web verzija knjige sa navigacijom, pretragom i bookmark-ovima
- [ ] **T26** 🟡 Implementirati prilagodljivi ToC format — korisnik bira dubinu ToC-a (samo poglavlja vs poglavlja + podnaslovi)
- [ ] **T27** 🟢 Dodati metadata embed u EPUB — subject/category, description, author, publisher, language, rights

## 🖥️ Frontend & UX

- [ ] **T28** 🔴 Implementirati inline Markdown editor za poglavlja — korisnik može ručno editovati generisani tekst pre eksporta
- [ ] **T29** 🟡 Dodati "History" stranicu — lista svih prethodno generisanih knjiga sa statusom, datumom i brzim pristupom
- [ ] **T30** 🟡 Implementirati dark mode — koristiti next-themes za automatsko/prekidačko prebacivanje teme
- [ ] **T31** 🔴 Dodati drag-and-drop redosled poglavlja — korisnik reorganizuje ToC pre generisanja koristeći @dnd-kit
- [ ] **T32** 🟡 Implementirati "Step-by-Step" wizard — umesto jednog velikog formulara, voditi korisnika kroz 3 koraka (Tema → Struktura → Generisanje)
- [ ] **T33** 🟡 Dodati poglavlja preview sidebar — dok čita jedno poglavlje, vidi listu svih poglavlja sa statusom u bočnom panelu
- [ ] **T34** 🔴 Implementirati collaborative editing — više korisnika istovremeno radi na istoj knjizi (WebSocket + conflict resolution)
- [ ] **T35** 🟡 Dodati keyboard shortcuts — Ctrl+Enter za generisanje, Ctrl+S za čuvanje drafta, itd.
- [ ] **T36** 🟢 Implementirati responsive mobile-first redesign — optimizovati za telefone sa bottom-sheet navigacijom

## 🔐 Auth & Korisnici

- [ ] **T37** 🔴 Implementirati NextAuth.js autentifikaciju — Google/GitHub OAuth + email/password login
- [ ] **T38** 🟡 Dodati korisnički profil — ime, avatar, preferencije (default tone, audience, jezik)
- [ ] **T39** 🔴 Implementirati role-based access control — Admin (svi pristup), User (svoje knjige), Guest (samo čitanje)
- [ ] **T40** 🟡 Dodati API key menadžment — korisnici sa OpenRouter ključevima mogu koristiti svoje ključeve umesto zajedničkog

## 📊 Monitoring & Analitika

- [ ] **T41** 🟡 Dodati dashboard sa statistikama — broj generisanih knjiga, prosečno vreme, token usage, uspešnost
- [ ] **T42** 🔴 Implementirati detailed token/cost tracking — pratiti potrošnju po knjizi, poglavlju i API pozivu; prikazati procenu troškova
- [ ] **T43** 🟡 Dodati structured logging (Pino/Winston) — zamena console.log sa JSON logovima i log level-ima
- [ ] **T44** 🟢 Implementirati health check endpoint — GET /api/health sa statusom DB, Redis, LLM providera

## ⚡ Performanse & Optimizacija

- [ ] **T45** 🔴 Implementirati parallel chapter generation — generiši više poglavlja istovremeno (concurrency limit = 3) umesto sekvencijalno
- [ ] **T46** 🟡 Dodati response caching za identične promptove — ako korisnik ponovo pošalje isti prompt, ponudi keširani rezultat
- [ ] **T47** 🟡 Implementirati progressive loading — prikazati poglavlja čim su gotova, ne čekati celu knjigu za preview
- [ ] **T48** 🔴 Dodati incremental EPUB/PDF generation — dodaj poglavlje po poglavlje u finalni fajl umesto regenerisanja celog dokumenta

## 🧪 Pouzdanost & Testiranje

- [ ] **T49** 🔴 Implementirati comprehensive error recovery — automatski retry sa exponential backoff, circuit breaker za LLM provider, graceful degradation
- [ ] **T50** 🟡 Dodati E2E testove (Playwright) — testirati kompletni flow: unos prompta → generisanje → preview → download

---

## Legenda

| Simbol | Značenje |
|--------|----------|
| 🟢 | Lakše — 1-3 sata rada |
| 🟡 | Srednje — 3-8 sati rada |
| 🔴 | Kompleksno — 8+ sati rada |

## Predloženi redosled realizacije (preporučeni prioritet)

1. **T2** (WebSocket) + **T47** (Progressive loading) — drastično bolji UX
2. **T30** (Dark mode) + **T29** (History) — brze poboljšanje
3. **T8** (Streaming LLM) — game-changer za korisničko iskustvo
4. **T28** (Inline editor) — korisnik može popraviti AI output
5. **T1** (BullMQ) + **T45** (Parallel generation) — skalabilnost
6. **T14** (Ilustracije) + **T23** (Korice) — vizuelni kvalitet
7. **T37** (Auth) + **T40** (API keys) — produkcija
