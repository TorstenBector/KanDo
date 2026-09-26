# KanDo — CLAUDE.md

Personligt planerings- och prioriteringssystem ("Capture first, organize later"). PWA, mobil först. Live på **app.kando.nu**. Produktvision och datamodell: [spec.md](spec.md). Svenska i hela UI:t.

## Stack & drift
- React 19 + Vite 8 + vite-plugin-pwa (`registerType: 'autoUpdate'`), ren JSX (ingen TypeScript), inline-styles med tokens från `src/theme.js`.
- Dexie (IndexedDB) = primär lagring, Zustand för app-state, Supabase för auth + synk.
- **Push till `main` = driftsättning** (Vercel). Inga tester — verifiera med `npx vite build` (och `npm run lint` = oxlint).
- Ingen router: flikar i `src/KandoApp.jsx` (`TABS`, `TAG_FILTER_TABS` styr var taggraden visas).

## Delat Supabase-projekt (`gulotdyrurkbozmbhhny`)
Samma projekt och auth-instans används av **TidKoll** (tidkoll.kando.nu, repo `forest-work-timer`), **KonsultKoll**, **RegattaKoll** m.fl. Därför:
- **Alla migrationer för alla dessa appar ligger i `supabase/migrations/` i DET HÄR repot** (CLI:t är länkat här). Tabeller med prefix/namn som `time_entries`, `companies`, `company_*`, `month_reports`, `driver_settings`, `konsultkoll_*`, `regatta*` tillhör de andra apparna — rör dem inte i KanDo-arbete.
- Kör `supabase migration list` för att se vad som är applicerat i prod; `supabase db push` för att köra nya. Checka alltid in migrationsfilen i git (flera låg tidigare bara lokalt).
- Auth-redirects för ALLA appar ligger i `supabase/config.toml` → `additional_redirect_urls`, pushas med `supabase config push` (inte `db push`). Saknas en domän där landar magic link-inloggningen i fel app.
- `supabase/functions/stripe-webhook` hör till KonsultKoll.
- Magic link-mejl kommer från Supabases delade avsändare. Plan: egen SMTP via HostUps e-post (`noreply@kando.nu`) — föreslå inte Resend.

## Offline-first & synk (`src/lib/sync.js`, `src/store/syncStore.js`)
- Allt skrivs först till Dexie. Rader i `items`, `tags`, `item_images`, `shopping_staples` får `_syncStatus: 'pending'` och pushas sen; `updated_at` + last-write-wins vid pull.
- Skriv items via `updateItem()`/`createItem()` i `src/hooks/useItems.js` (sätter updated_at, pending, triggar push) — inte direkt mot `db.items`.
- `item_tags` och `item_relations` saknar dirty-flagga och skickas i sin helhet varje synk → **måste gå som bulk** (item_tags i klumpar om 500, `ignoreDuplicates`). Rad-för-rad gav 1000+ förfrågningar per synk och fick mobilen att fastna i "Synkar…" (sep 2026). Per rad bara som reserv vid FK-fel `23503` (självläker genom att radera den lokala kopplingen).
- `supabaseClient.js` har 30 s timeout på varje förfrågan; `sync()` betraktar en synk äldre än 2 min som död.
- Utloggad är ett giltigt läge (lokal data finns kvar). **Logga ut rensar hela IndexedDB** efter att ha synkat och varnat för osynkade ändringar. `claimLocalData()` tar över rader med `user_id: null` vid inloggning.
- Vid synkproblem: kontrollera BÅDE att varje kolumn klienten skriver finns i prod (anon-REST `select=<kol>&limit=0` ger 42703 om den saknas) OCH förfrågningsvolymen.
- `short_id` (#1234) tilldelas av servern — skicka aldrig tillbaka det.

## Domänregler
- **Status**: `backlog` → `prioriterad` → `planerad` → `pagar` → `klar`.
- **Dagens Fokus = `scheduled_date === idag`**, inte status `planerad`. Schemaläggning går via `scheduleOn(id, datum)` (även `scheduleToday`/`scheduleTomorrow`), som sätter status `planerad` och sparar tidigare status i `pre_focus_status`; `unschedule()` återställer den.
- Datum: använd ALLTID `src/lib/date.js` (`todayISO`, `parseLocalDateISO`, `addDaysISO`, `formatShortDate`) — aldrig `toISOString().slice(0,10)` eller `new Date('YYYY-MM-DD')` (UTC-buggar).
- **Taggar**: `kind` = `category` (vanlig tagg) eller `context` (📍 plats). Tvånivåträd via `parent_tag_id`; `addItemTag()` lägger automatiskt även på föräldertaggen. Taggfilter = union.
- **Bilagor** ligger i `item_images` (base64 `data_url`) — även Markdown/Excel/textfiler (`filename`, `mime_type`). Rader utan filename och mime_type = gamla foton. Se `src/hooks/useAttachments.js`, `FileTile.jsx`.
- **Delade listor**: token-länk (`?dela=<token>`) per tagg, anon-RPC:er `get_shared_list`, `get_shared_item_detail`, `complete_shared_item` (SECURITY DEFINER).

## UI-mönster
- Snabbfånga (`QuickCapture.jsx`) och kortets editläge (`ItemDetailModal.jsx`) har **samma upplägg**: toppankrad panel, Titel + Spara fast överst, Taggar/Plats under, sedan scrollbar sektion (förslag, Beskrivning, Bilagor, Administrativt, Deluppgifter). Delade kontroller i `CaptureControls.jsx` — ändra där, inte i kopior. Editläget sparar löpande; "Spara" stänger bara.
- iOS-PWA: ankra modaler med inmatning i **toppen** (ett tangentbord kan annars dölja knappar oavsett höjdberäkning). Använd `overflow-x: clip`, inte `hidden`, på html/body/#root (hidden dödar `position: sticky` i WebKit).
- Datumväljare: genomskinlig `<input type="date">` över en knapp + `showPicker()` (se `PlannedDatePill`).
- Kommentarer i koden refererar ofta till Vibe-poster (`KanDo Vibe #6645`) — gör likadant när du fixar en.

## Vibe-listan (idéer/buggar om apparna)
Torsten samlar önskemål i KanDo under taggen **Vibe**. Hämta live utan inloggning:
```bash
curl -s -X POST 'https://gulotdyrurkbozmbhhny.supabase.co/rest/v1/rpc/get_shared_list' \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_token": "57b17c5c050b45208a716a5ac675834d"}'
```
Detaljer (beskrivning, taggar, bilder som base64) per post: `get_shared_item_detail` med `p_token` + `p_item_id`. Klarmarkera: `complete_shared_item` med `p_done: true`. Listan saknar `scheduled_date` — fråga vilka som ligger i Dagens Fokus i stället för att gissa. Sök ämnen i både titel OCH beskrivning. En hämtning är inte ett klartecken att bygga allt — gå igenom och prioritera med Torsten först, och verifiera "redan fixat" mot hans senaste skärmdump.

## Verifiera visuellt
`playwright` finns i `node_modules`. Starta `npx vite --port 5199`, och i ett Playwright-skript (i repot, inte i en temp-katalog) seedas testdata via `page.evaluate(async () => { const { db } = await import('/src/lib/db.js'); ... })`, t.ex. ett item med `scheduled_date` = idag för att det ska synas i Dagens Fokus. Ta bort skript och skärmdumpar efteråt.
