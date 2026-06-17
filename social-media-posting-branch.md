# Social Media Posting — Feature Planning

Branch: `feature/social-media-posting`  
Status: Pre-development planning  
Last updated: 2026-06-17

---

## Feature Overview

Allow dealership users to select a Hero image from a VIN Edited folder and publish it as a single post to their Facebook Page or Facebook Group — with bike details auto-populated from VIN decode, a user-supplied price and condition, and a website listing URL posted as the first comment. Instagram support follows in a later phase.

This feature is offered as a **paid add-on** to the core image editing subscription, but is also designed as a **standalone offering** — users can upload edited images directly to a VIN Edited folder and post to social media without needing to go through the Gemini background-removal pipeline.

---

## Technology Roadmap

The integration layer evolves in three phases based on user count:

### Phase 1 — Now (0–2 users): Zernio Free Plan
[Zernio](https://zernio.com/pricing) is an API-first social media management platform supporting 25+ platforms including Facebook and Instagram. It has built-in scheduling and real-time webhooks.

- **Free tier:** First 2 social accounts are free — covers 1 Facebook Page per user for 2 test users
- **Why Zernio over Make/Zapier:** API-first (no user scenario setup), scheduling built-in, per-account pricing scales naturally, no Meta App Review needed (Zernio is already an approved partner)
- **Integration:** Our API calls Zernio's REST API to create and schedule posts. No webhook setup required on the user's side.
- **Cost to us:** $0 during Phase 1

### Phase 2 — Medium term (3–40 users): Zernio Paid
- Accounts 3–10: **$6/account/month**
- Accounts 11–100: **$3/account/month**
- Each user with Facebook + Instagram = 2 Zernio accounts = $6–12/user/month (our cost)
- Factor this into the add-on pricing charged to users

### Phase 3 — Long term (40–50+ users): Direct Meta Graph API
- Build directly against Meta Graph API to eliminate per-account Zernio cost
- Requires Meta App Review (~2–4 weeks) and Business Verification — start process at ~30 users
- At this scale the engineering investment pays off vs. Zernio per-account fees
- The Zernio integration is swappable — our internal API routes abstract the posting layer so switching providers is a config change, not a rewrite

---

## How Zernio Integration Works

```
User connects Facebook Page → Zernio OAuth (handled by Zernio, not us)
        ↓
Zernio returns social_account_id for that page
        ↓
Our app stores social_account_id in users table
        ↓
User clicks "Post to Facebook" in our app
        ↓
Our API calls Zernio REST API:
POST https://api.zernio.com/posts
{
  "account_id": "zernio_account_xyz",
  "content": "🏍️ 2022 Kawasaki ZX-6R\n💰 $8,500 | Used\n#motorcycle",
  "media": [{ "url": "https://supabase.co/.../hero.jpg" }],
  "scheduled_at": "2026-06-18T09:00:00Z",   // or null for immediate
  "first_comment": "View full listing: https://dealership.com/listing/123"
}
        ↓
Zernio delivers to Facebook Page / FB Group
Zernio webhook notifies us of delivery status → we update social_posts table
```

No user-side configuration required. No Make scenarios. No manual webhook URL pasting.

---

## Standalone Offering

Social media posting works independently of the image editing pipeline:

- Users can upload already-edited images directly to a **VIN Edited folder** in the app
- These images bypass the Gemini background-removal step entirely
- The user selects a Hero image and fills in listing details (price, condition, VIN info)
- Posts to Facebook from there

This means two paths feed the same posting feature:
1. **Integrated path:** Raw image uploaded → Gemini processes → edited image appears in VIN Edited folder → user posts
2. **Standalone path:** User uploads their own edited image directly to VIN Edited folder → user posts

The social posting UI is the same for both paths.

---

## Add-On Gating Model

Social media posting is a **paid add-on** — users without it see a locked/upgrade state rather than hidden UI.

- New column: `users.social_media_addon BOOLEAN DEFAULT false`
- Toggled by the operator in the operator dashboard (no self-serve billing yet)
- All `/api/social/*` routes return 403 if the flag is false
- Zernio account connection is blocked server-side until addon is enabled

---

## Platform Scope

| Platform | Phase | Notes |
|---|---|---|
| Facebook Pages | Phase 1 | Primary target |
| Facebook Groups | Phase 1 | Same Zernio API call, different account type |
| Instagram | Phase 2 | After FB is stable; requires Business Account linked to FB Page |
| Twitter/LinkedIn/etc. | Not planned | Zernio supports them but out of scope |

---

## Post Format

**Single Hero image** — no carousel.

- One image posted to the Facebook Page/Group feed
- Website listing URL posted as the **first comment** (not in the caption — keeps caption clean and avoids link penalties in FB algorithm)
- Caption auto-filled from VIN data + listing details, fully editable before posting

### Caption template (per user, editable)

Default template with placeholders auto-filled from VIN decode + listing fields:

```
🏍️ {year} {make} {model}
💰 ${price} | {condition}
Engine: {engine} | {fuel_type}

{description}

#motorcycle #{make_lower} #dealership #forsale
```

Users can save their own default template. Placeholders that NHTSA cannot fill (price, condition, description) come from the listing details form.

---

## Image Aspect Ratio Handling

Images must be resized/cropped before posting to match platform requirements. This happens server-side before the Zernio API call.

| Platform | Optimal ratio | Target resolution | Notes |
|---|---|---|---|
| Facebook feed | 1:1 or 1.91:1 | 1200×1200 or 1200×628 | Both work; square gets more feed real estate |
| Facebook Groups | 1:1 or 1.91:1 | Same as above | |
| Instagram (Phase 2) | 4:5 portrait | 1080×1350 | Best engagement on mobile |

**Implementation:** Use `sharp` to resize/pad to target dimensions before passing the URL to Zernio. Store the resized version temporarily (or generate a Supabase signed URL of the resized buffer uploaded to a `social/` subfolder).

---

## Automation Level

### Phase 1: Semi-auto (build now)
When Gemini finishes processing an image → automatically create a **draft post** in the `social_posts` table with status `draft`. User sees a "Review & Post" notification in the folder view, reviews the pre-filled caption and scheduled time, then approves.

Flow:
```
Gemini done → create social_posts row (status: draft) → user notified
        ↓
User opens "Review & Post" → edits caption/time if needed → clicks Approve
        ↓
Our API calls Zernio → status updated to scheduled/posted
```

### Phase 2: Fully auto (later)
Add a per-folder toggle: "Auto-post when editing completes." When enabled, approved draft → scheduled post fires without user review step. User can still cancel before the scheduled time.

---

## Scheduling

Zernio has native scheduling support. The Post Builder includes a date/time picker.

- Default: post immediately (no scheduled time)
- Option: pick any future date/time
- Zernio delivers at the scheduled time and sends a webhook on delivery
- Our `social_posts` table stores `scheduled_at` and updates `status` to `posted` on webhook receipt

---

## VIN Decode — Primary + Fallback

### Primary: NHTSA free API
```
GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{VIN}?format=json
```
Returns: Make, Model, Year, Engine, Body Type, Fuel Type.  
Cache result in `vin_folders.vin_details` (JSONB) after first call.

**Known gap:** NHTSA has incomplete data for some motorcycle brands, especially smaller or imported manufacturers.

### Fallback: Listing page manual fields
If NHTSA returns incomplete data (missing Make, Model, or Year), the listing details form shows all fields as editable text inputs pre-filled with whatever NHTSA did return. User fills in what's missing and saves — that saved data is used for the caption and overwrites the NHTSA partial data in `vin_details`.

No hard dependency on NHTSA being complete. The listing form is always the source of truth for caption generation; NHTSA just pre-fills it.

---

## Post History

Each VIN folder shows a post history section below the image grid. For every post attempt:

- Platform icon (Facebook/Instagram)
- Status badge: Scheduled / Posted / Failed
- Scheduled time or posted timestamp
- "View post" link (if Zernio returns a post URL)
- "Retry" button for failed posts

---

## Database Schema

```sql
-- Add-on gating
ALTER TABLE users ADD COLUMN social_media_addon BOOLEAN DEFAULT false;

-- Zernio connection (per user)
ALTER TABLE users ADD COLUMN zernio_fb_account_id VARCHAR(200);   -- Zernio's ID for the FB Page
ALTER TABLE users ADD COLUMN zernio_ig_account_id VARCHAR(200);   -- Phase 2
ALTER TABLE users ADD COLUMN fb_page_name VARCHAR(200);           -- display only
ALTER TABLE users ADD COLUMN website_listing_url TEXT;            -- appended as first comment

-- Caption template (per user)
ALTER TABLE users ADD COLUMN caption_template TEXT;

-- Listing details (per VIN folder)
ALTER TABLE vin_folders ADD COLUMN price NUMERIC(10,2);
ALTER TABLE vin_folders ADD COLUMN condition VARCHAR(50);          -- 'new' | 'used' | 'certified'
ALTER TABLE vin_folders ADD COLUMN description TEXT;
ALTER TABLE vin_folders ADD COLUMN vin_details JSONB;             -- merged NHTSA + manual overrides
ALTER TABLE vin_folders ADD COLUMN website_listing_url TEXT;      -- per-listing URL override

-- Post tracking
CREATE TABLE social_posts (
  id                SERIAL PRIMARY KEY,
  vin_folder_id     INTEGER REFERENCES vin_folders(id),
  user_id           INTEGER REFERENCES users(id),
  platform          VARCHAR(20) NOT NULL,                -- 'facebook' | 'instagram'
  zernio_post_id    VARCHAR(200),                        -- Zernio's post ID
  platform_post_id  VARCHAR(200),                        -- Meta's post ID (from Zernio webhook)
  platform_post_url TEXT,                                -- link to live post
  hero_image_id     INTEGER REFERENCES images(id),
  caption           TEXT,
  first_comment     TEXT,                                -- website listing URL
  scheduled_at      TIMESTAMP,
  status            VARCHAR(20) DEFAULT 'draft',         -- draft | scheduled | posted | failed
  error_message     TEXT,
  posted_at         TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/vin-folders/[id]/vin-decode` | GET | NHTSA lookup → merge into `vin_details`, return editable fields |
| `/api/vin-folders/[id]/listing` | PUT | Save price, condition, description, listing URL |
| `/api/social/connect` | GET | Redirect to Zernio OAuth to connect FB Page |
| `/api/social/callback` | GET | Zernio returns account ID → store in users table |
| `/api/social/disconnect` | DELETE | Remove Zernio account IDs |
| `/api/social/status` | GET | `{ addon_enabled, fb_connected, page_name, ig_connected }` |
| `/api/social/caption-template` | PUT | Save user's default caption template |
| `/api/social/post` | POST | Resize hero image → call Zernio API → log to social_posts |
| `/api/social/posts/[id]/retry` | POST | Retry a failed post |

All `/api/social/*` routes return 403 if `social_media_addon = false`.

---

## UI Changes Summary

### Dashboard
- Social add-on status card (Connect Facebook / Connected to "{Page Name}")
- "Manage" link opens settings panel: caption template editor, website URL, disconnect button

### VIN Folder — Listing Details panel (new)
- Price (numeric, required for caption)
- Condition dropdown: New / Used / Certified Pre-Owned
- Listing URL (overrides user-level default)
- Description (free text)
- VIN decoded fields (auto-filled, all editable as fallback)

### VIN Edited Folder — direct upload (standalone path)
- Upload button accepting JPEG/PNG (no Gemini processing)
- Uploaded images appear alongside Gemini-processed ones — same grid

### VIN Edited Folder — Post Builder
Triggered by "Review & Post" badge on draft posts or "Create Post" button:

```
┌─────────────────────────────────────────────────────┐
│  Post to Facebook — JKBZXVT15RA000075              │
├─────────────────────────────────────────────────────┤
│  HERO IMAGE                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │  ⭐  │ │      │ │      │ │      │              │
│  │img 1 │ │img 2 │ │img 3 │ │img 4 │              │
│  └──────┘ └──────┘ └──────┘ └──────┘              │
│  Click to select Hero image                         │
├─────────────────────────────────────────────────────┤
│  CAPTION                           1,840 / 2,200    │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🏍️ 2022 Kawasaki Ninja ZX-6R               │   │
│  │ 💰 $8,500 | Used                            │   │
│  │ Engine: 636cc | Petrol                      │   │
│  │ Low miles, well maintained                  │   │
│  │ #motorcycle #kawasaki #dealership           │   │
│  └─────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  FIRST COMMENT (listing URL)                        │
│  https://dealership.com/listing/zx6r-2022          │
├─────────────────────────────────────────────────────┤
│  SCHEDULE                                           │
│  ○ Post now   ● Schedule: [Jun 18, 2026] [9:00 AM] │
├─────────────────────────────────────────────────────┤
│  POST TO:  [✓ Facebook Page]  [ Facebook Group ]   │
│  [Cancel]                            [Schedule →]   │
└─────────────────────────────────────────────────────┘
```

### VIN Edited Folder — Post History (below image grid)
| Platform | Status | Scheduled | Actions |
|---|---|---|---|
| 📘 Facebook | ✅ Posted | Jun 15, 9:00am | View post |
| 📘 Facebook | ⏱ Scheduled | Jun 18, 9:00am | Cancel |
| 📘 Facebook | ❌ Failed | Jun 14 | Retry |

---

## Build Order

1. **DB migrations** — all columns and `social_posts` table
2. **Listing details UI + VIN decode** — price/condition/description form, NHTSA call with fallback editing
3. **Direct image upload to VIN Edited folder** — standalone path (no Gemini)
4. **Operator addon toggle** — flip `social_media_addon` in operator dashboard
5. **Zernio OAuth connect/disconnect** — user connects Facebook Page through Zernio
6. **Caption template editor** — per-user default template in dashboard settings
7. **Post Builder UI** — hero selection, caption editor, schedule picker, first-comment field
8. **Image resize before posting** — `sharp` resize to Facebook target ratio server-side
9. **Post endpoint** — resize → call Zernio API → log draft/scheduled post
10. **Semi-auto draft creation** — when Gemini completes → create draft `social_posts` row → show "Review & Post" in folder view
11. **Post history UI** — status table in VIN Edited folder view
12. **Zernio webhook handler** — receive delivery confirmation → update `social_posts.status` to `posted`
13. **Retry endpoint** — re-fire failed posts
14. *(Phase 2)* **Instagram** — add Zernio IG account, resize to 4:5 for IG
15. *(Phase 3)* **Migrate to Meta Graph API** — swap Zernio calls for direct Meta API at 40–50 users

---

## Decisions Made

| Topic | Decision |
|---|---|
| Middleware | Zernio (API-first, free 2 accounts, built-in scheduling) |
| Meta App Review | Deferred — Zernio handles it until 40–50 users |
| Post format | Single Hero image + listing URL as first comment (no carousel) |
| Platforms | Facebook Pages + Groups first; Instagram Phase 2 |
| Automation | Semi-auto now (draft on edit complete → user approves); fully auto later |
| Image ratios | Resize server-side with sharp before Zernio API call |
| Scheduling | Built into Post Builder via Zernio's native scheduled_at field |
| VIN decode | NHTSA primary; listing form as editable fallback |
| Post history | Shown per VIN folder below image grid |
| Caption | Auto-filled template, editable per post, saveable per user |
| Standalone | Direct upload to VIN Edited folder (no Gemini required) |

---

## Cost Model (Zernio)

| Phase | Users | Zernio accounts | Our monthly cost |
|---|---|---|---|
| Phase 1 | 1–2 | 2 (1 FB Page each) | $0 (free tier) |
| Phase 2 | 3–10 | 6–20 accounts | ~$36–120/month |
| Phase 2 | 11–40 | 22–80 accounts | ~$66–240/month |
| Phase 3 | 40–50+ | Switch to Meta API | $0 (API cost, own infra) |

Factor Zernio cost into the social media add-on price charged to users.

---

## Remaining Open Questions

| Question | Notes |
|---|---|
| Fully auto trigger: when to fire? | On edit complete? Or only when listing details are filled in? Need both to generate a valid caption. |
| Facebook Groups vs Pages: different Zernio flow? | Check Zernio docs — Groups may require additional permissions |
| What URL to use for "View listing"? | User-level default or per-VIN override? Both are in schema. Confirm UI behaviour. |
| How long to keep resized images in Supabase? | Delete after successful post, or keep indefinitely in `social/` folder? |
| Webhook security from Zernio? | Verify Zernio signs webhook payloads — validate signature in handler |

---

## Out of Scope

- Carousel / multi-image posts (decided: Hero image only)
- Twitter, LinkedIn, TikTok, Pinterest (Zernio supports them but not planned)
- Self-serve billing for add-on (operator toggles manually for now)
- Post analytics / engagement tracking (likes, reach, comments)
- AI-generated captions using Gemini (possible Phase 3 addition)
- Bulk scheduling (post all VINs on a drip schedule)
