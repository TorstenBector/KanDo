# KanDo.nu

Version: 2 (uppdaterad efter planeringsdiskussion 2026-08-25)

## Vision

KanDo är ett personligt planerings- och prioriteringssystem för människor som får många idéer och behöver ett enkelt sätt att fånga, strukturera och genomföra dem.

KanDo bygger på principen:

> Capture First. Organize Later.

Användaren ska kunna fånga idéer, uppgifter och projekt på några sekunder, utan att först behöva fundera på kategorier, prioritet eller struktur.

AI används som ett stöd när användaren väljer det, aldrig som en automatisk beslutsfattare.

---

# Grundprinciper

## Global Life Backlog

Allt sparas i samma backlog. Det finns ingen uppdelning mellan Jobb / Privat / Fritid / Projekt / Idéer på datanivå — alla objekt hamnar i användarens globala backlog. Filtrering, kategorisering och vyer används för att visa relevanta delar av innehållet.

## Offline First

KanDo ska fungera direkt vid installation, utan konto och utan uppkoppling. Primär lagring sker lokalt (IndexedDB). Inloggning krävs **bara** för synk/backup — se avsnittet "Auth & Synk" nedan för det fullständiga flödet.

## AI On Demand

AI används endast när användaren aktivt väljer det. Exempel: kategorisera, förtydliga, generera specifikation, sammanfatta, prioritera.

AI får aldrig automatiskt: flytta Tasks, ändra status, omprioritera, planera kalender.

---

# Plattform

Progressive Web App (PWA). Mobil först, men fungerar även i webbläsare på dator.

Marknadssida `kando.nu` (motsvarande jaktkoll.nu) presenterar appen och erbjuder inloggning/synk-uppsättning. Appen `app.kando.nu` går att öppna och använda direkt, utan att först besöka marknadssidan eller logga in.

---

# Datalagring

## Lokal lagring

Primär lagring: IndexedDB via Dexie.js.

## Auth & Synk

Inloggning är **frikopplad** från lokal användning — den krävs bara för synk.

**Flöde:**
1. Appen (`app.kando.nu`) fungerar fullt ut utan inloggning: skapa/redigera/organisera allt lokalt.
2. Användaren väljer att synka (knapp i appen, eller via `kando.nu`) → magic-link-inloggning mot Supabase (samma mönster som Jaktkoll: `?email=` pre-fill).
3. Efter inloggning skapas/kopplas profilen på servern. Sessionen sparas lokalt så att appen inte kräver ny inloggning vid varje öppning.
4. Användaren lägger till PWA:n på hemskärmen. Den öppnas därefter lokalt utan ny autentisering.

**Synk-mekanik:**
- **Skriv-igenom vid varje ändring**: varje lokal ändring sparas direkt i IndexedDB (optimistiskt, instant UI) och försöker samtidigt pushas till Supabase i bakgrunden om online och inloggad.
- Misslyckas pushen (offline, ej inloggad): ändringen flaggas som "väntar på synk" i en lokal outbox och försöker igen automatiskt nästa gång appen är i förgrunden eller nätet återkommer.
- **Full synk (pull + push av väntande ändringar)** körs varje gång appen öppnas, om online.
- Ingen bakgrundspolling med fast intervall — stöds inte pålitligt på iOS (Periodic Background Sync saknas i Safari).
- UI visar en diskret indikator vid ej synkade ändringar + manuell "synka nu"-knapp som säkerhetsnät.
- Konflikthantering: single-user data, senaste skrivning vinner (`updated_at`-baserat) — ingen avancerad merge-logik behövs i MVP.

**Känd risk:** iOS/Safari kan i sällsynta fall rensa IndexedDB-data om appen inte används på länge och enhetens lagring är fylld. Ingen mildring i MVP utöver frekvent synk när inloggad — bör omvärderas om det visar sig vara ett verkligt problem i praktiken.

---

# Datamodell

Idea, Project och Task delar samma underliggande tabell (`items`) med en typkolumn, eftersom en Idea ska kunna utvecklas till en Task eller ett Project utan att byta identitet, och relationer behöver kunna peka mellan alla typer.

## items

| Fält | Typ | Beskrivning |
|---|---|---|
| id | uuid | |
| user_id | uuid | ägare |
| type | enum | `idea` \| `project` \| `task` |
| title | text | |
| original_text | text | rå fångst (röst-transkript eller inklistrad text) |
| ai_interpretation | text | AI-tolkning, om AI Capture använts |
| description | text | fritext/anteckningar |
| status | enum | `backlog` \| `prioriterad` \| `planerad` \| `pagar` \| `klar` |
| backlog_priority | enum | `hog` \| `medel` \| `lag` — attribut 1, statisk tagg |
| priority_rank | int | attribut 2 — relativ ordning, satt bara i status `prioriterad` |
| scheduled_date | date | för Dagens Fokus |
| completed_at | timestamptz | |
| created_at / updated_at | timestamptz | |

**Prioritet är två oberoende attribut:**
- `backlog_priority` (Hög/Medel/Låg) sätts fritt, när som helst.
- `priority_rank` är den manuella drag-and-drop-ordningen, relevant bara bland objekt i kolumnen "Prioriterad".

## item_relations

Riktade kanter mellan `items` — täcker både Parent/Child och Dependencies.

| Fält | Typ |
|---|---|
| id | uuid |
| from_item_id | uuid |
| to_item_id | uuid |
| relation_type | enum: `parent_child` \| `depends_on` |

## tags

Kategorier och geografiska/kontextuella taggar delar samma struktur — särskiljs bara av `kind`. Anledning: en tagg som "Mamma" ("saker som behöver fixas hos Morsan") är ett sammanhang, inte en GPS-koordinat. Ingen platslogik i MVP.

| Fält | Typ |
|---|---|
| id | uuid |
| user_id | uuid |
| name | text |
| kind | enum: `category` \| `context` |

Unik per `(user_id, lower(name), kind)` — AI ska återanvända befintliga taggar istället för att skapa dubbletter.

## item_tags

Many-to-many mellan `items` och `tags`.

## spec_versions

Se avsnittet "Specgenerator — versionshantering" nedan.

| Fält | Typ |
|---|---|
| id | uuid |
| item_id | uuid |
| content | text (markdown) |
| version_date | date |
| created_at | timestamptz |

Unik per `(item_id, version_date)`.

## RLS

Radägarskap: `user_id = auth.uid()` på samtliga tabeller. Ingen rollhierarki behövs (till skillnad från Jaktkoll) — KanDo är per-användare, inte klubb-baserat.

---

# Relationer

Se `item_relations` ovan. Stödjer:
- **Parent/Child** — t.ex. Projekt "KanDo.nu" → Task "Bygg PWA" → children "Skapa datamodell", "Skapa användargränssnitt".
- **Dependencies** — t.ex. "Skapa användargränssnitt" måste vara klar innan "Implementera mobilvy".

---

# Kategorisering

AI får föreslå kategorier och kontext-taggar. Användaren bestämmer alltid slutresultatet. Befintliga taggar ska prioriteras framför att AI skapar nya.

Ett objekt kan ha flera taggar av båda `kind`.

---

# Prioriteringsmodell

Se `backlog_priority` och `priority_rank` i Datamodell ovan.

---

# Kanban

```text
Backlog → Prioriterad → Planerad → Pågår → Klar
```

Status ändras automatiskt när ett kort flyttas. Alltid möjligt att flytta både framåt och bakåt.

**Rättelse (2026-08-27):** Ursprungsspecen hade en egen "Idé"-kolumn först i flödet. Det visade sig i praktiken vara fel modell — Idé/Projekt/Task är en **typ** (vilken sorts objekt det är, en oberoende egenskap som visas som badge på varje kort), inte ett **arbetsflödessteg**. Att ha "idea" som både typ-värde och statusvärde skapade förvirring (går det att flytta *typen* Idé, eller *statusen* Idé?). Alla objekt startar nu direkt i Backlog oavsett typ.

---

# Swimlanes

Kanban-boarden stödjer Swimlanes baserat på `category`-taggar (t.ex. Jobb, Privat, KanDo.nu, Sommarstugan). Visa alla eller filtrera på en.

---

# Dagens Fokus

Visar:
1. **Schemalagt idag** — objekt med `scheduled_date` = idag.
2. **Om inget är schemalagt**: de fem högst prioriterade (enligt `priority_rank`).

---

# Kalender

**Pausad för MVP.** Om priolistorna i appen ger tillräckligt värde ensamma kan kalendersynk visa sig vara onödig — utvärderas efter att Kanban/Prioriterad-flödet är i bruk. Ingen kod skrivs för detta just nu.

---

# Capture

Den viktigaste funktionen i KanDo.

## Röst

Ingen egen taligenkänning byggs (Web Speech API har begränsat stöd i Safari). Istället, i prioritetsordning:

1. **OS-tangentbordets diktering** (MVP) — Snabbfånga öppnar ett textfält, användaren använder telefonens inbyggda mikrofonknapp i tangentbordet. Noll kod, fungerar identiskt på iOS/Android.
2. **Genvägar/Shortcuts** (v1.1) — en Siri Shortcut / Android App Action som öppnar appen med `?capture=text` förifyllt, eller POSTar direkt till en Supabase Edge Function, för handsfree-fångst utan att öppna UI:t.
3. **PWA som Share Target** (v1.1, Android först) — registrera KanDo i telefonens dela-meny via Web Share Target API, så text kan delas dit från vilken app som helst (t.ex. efter att ha pratat med en AI-assistent-app). Stöds inte i Safari/iOS PWA ännu — Shortcuts (punkt 2) täcker det gapet där.

Cloud-AI (Claude m.fl.) används för **efterbearbetning** av redan-dikterad text (städa, strukturera, extrahera en task) — inte för själva transkriberingen.

## Text

Användaren skriver direkt.

## Klistra in

Användaren kan klistra in större textmassor (mötesanteckningar, specifikationer, idéutkast).

---

# AI Capture

När användaren väljer AI-stöd får AI: föreslå kategori, föreslå projekt, föreslå taggar (återanvänder befintliga där möjligt).

Både `original_text` och `ai_interpretation` sparas alltid.

AI anropas via en molnmodell (t.ex. Claude API) bakom en Supabase Edge Function — API-nyckeln exponeras aldrig i klienten.

---

# Specgenerator

Används främst för idéer och projekt.

## Steg 1
Idén sparas. Ingen analys krävs.

## Steg 2
Användaren väljer "Förtydliga Spec".

## Steg 3
AI ställer en fråga åt gången, i prioriterad ordning. Exempel: Vad är problemet du vill lösa? Vilka användare riktar sig lösningen till? Vilka funktioner måste finnas i en första version?

## Resultat

En levande markdownspecifikation:

```markdown
# Vision
# Problem
# Målgrupp
# Användarflöden
# Funktioner
# MVP
# Teknisk Lösning
# Öppna Frågor
```

## Versionshantering

**Max tre rullande versioner**, inte fri versionshistorik — AI-drivna specar överspecas lätt om varje justering sparas som en egen version.

- **Nuvarande** / **Tidigare** / **Ännu tidigare**
- En version per dag (flera sparningar samma dag skriver över samma version — ingen idé att spara flera från samma dag).
- Vid en fjärde dag: den äldsta versionen försvinner automatiskt.
- Syftet är att kunna backa till gårdagens (eller förrgårdagens) version om man klantat till dagens ändringar — inte att bygga en fullständig historik.

---

# Startsida

- **Dagens Fokus** — schemalagt idag, annars fem högst prioriterade.
- **Global Backlog** — stor knapp.
- **Senaste Idéer** — stor knapp.
- **Mina Projekt** — stor knapp.
- **Snabbfånga** — alltid tillgänglig, med Tala / Skriv / Klistra in.

---

# UX-principer

1. Användaren ska aldrig behöva leta — allt nås via Sök, Filter, Kategorier, Swimlanes.
2. Det ska alltid gå snabbare att spara en idé än att tappa bort den.
3. AI är ett verktyg, inte huvudfunktionen.

---

# Teknisk arkitektur

## Stack

- React (funktionella komponenter, hooks) + Vite
- Dexie.js för IndexedDB
- Supabase (Postgres + Auth + Edge Functions) för synk och AI-proxy
- Zustand för globalt state (synk-status/outbox m.m.)
- dnd-kit för drag-and-drop (Kanban, Prioriterad-ordning)
- vite-plugin-pwa för manifest + service worker

## Styling

Samma mönster som Jaktkoll: ett delat `theme.js`-objekt (färger, skuggor, radius) importerat och använt i inline `style={{}}`-props — inget CSS-ramverk.

Färgschemat återanvänds initialt rakt av från Jaktkoll (`primary #2D6A2D`, `accent #F0C040`, m.fl.) — kan bytas ut senare om den gröna/guld-känslan känns fel för ett personligt planeringsverktyg snarare än en jaktklubb.

## Backend

Supabase-projekt: **KanDo** (ref `gulotdyrurkbozmbhhny`), samma organisation som Jaktkoll, tidigare ett tomt oanvänt projekt, återanvänt och omdöpt.

---

# MVP-Mål

MVP:n är klar när användaren kan:

- Fånga idéer (text, klistra in, OS-diktering)
- Skapa Tasks och Projekt
- Organisera i Kanban med Swimlanes
- Prioritera (Hög/Medel/Låg + drag-and-drop-ordning i Prioriterad)
- Filtrera på kategorier och kontext-taggar
- Se Dagens Fokus
- Generera och förtydliga specifikationer med AI, med 3-versions historik
- Arbeta helt utan konto lokalt
- Logga in för att synka/säkerhetskopiera mot Supabase

---

# Öppna frågor / Pausat

- **Kalender-integration** — pausad, se avsnittet ovan.
- **Pushnotiser** — diskuteras senare, användaren har egna idéer.
- **Share Target på iOS** — beroende av Apple/Safari-stöd, ingen tidsplan.
- **Färgschema** — bekräfta om Jaktkolls gröna/guld-palett ska behållas eller bytas ut när appen börjar ta form visuellt.
