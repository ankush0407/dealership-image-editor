# Social Media Posting — Feature Planning

Branch: `feature/social-media-posting`  
Status: Pre-development planning  
Last updated: 2026-06-17

---

## Feature Overview

Allow dealership users to select edited bike images from a VIN folder, designate a Hero image, and publish a multi-image post (carousel) to their Facebook Page and Instagram Business account — with bike details auto-populated from VIN decode and a user-supplied price and condition.

This feature is offered as a **paid add-on**, separate from the core image editing subscription.

---

## Key Architectural Decision: Make (not direct Meta API)

### Why not build directly against Meta Graph API

Building directly against Meta requires:
- Creating a Meta Developer App
- Requesting `pages_manage_posts` and `instagram_content_publish` permissions
- Passing Meta's manual App Review (2–4 week wait, plus Business Verification)
- Storing and refreshing Page Access Tokens (expire every 60 days)
- Managing Meta OAuth flow per user

### Why Make is better for this use case

Make (formerly Integromat) is an approved Meta Partner. When users connect their Facebook Page inside Make, they authorise **Make's** Meta app — not ours. We never touch Meta's API directly, so Meta's review process does not apply.

**Our app only fires a webhook. Make handles everything else.**

```
User clicks "Post to Social"
        ↓
Our API POSTs webhook payload to user's Make webhook URL:
{
  "caption": "🏍️ 2022 Kawasaki ZX-6R\n💰 $8,500 | Used\nEngine: 636cc",
  "images": [
    { "url": "https://supabase.co/.../signed-1.jpg", "hero": true },
    { "url": "https://supabase.co/.../signed-2.jpg" }
  ]
}
        ↓
Make scenario: posts carousel to Facebook Page + Instagram
```

### Make vs Zapier vs n8n comparison

| | Make | Zapier | n8n |
|---|---|---|---|
| Facebook Pages integration | ✓ | ✓ | ✓ |
| Instagram carousel (multi-image) | ✓ | ✗ single image only | ✗ single image only |
| Cost to user | ~$9/month | ~$20/month | Free (self-hosted) |
| Already integrated in project | ✓ | ✗ | ✓ |

**Make is the correct choice** — only Make supports Instagram carousel posts natively, which is a hard requirement.

### User onboarding for Make

1. User subscribes to the social media add-on
2. They receive a link to clone our Make scenario template (one click)
3. Inside Make, they connect their Facebook Page (Make handles OAuth)
4. They copy their Make webhook URL and paste it into our app settings
5. All future posts flow through that webhook automatically

One-time setup, approximately 5 minutes. No ongoing token management on our side.

---

## Add-On Gating Model

Social media posting is a **paid add-on** — users who have not purchased it cannot access any social posting features.

- New column: `users.social_media_addon BOOLEAN DEFAULT false`
- Toggled manually by the operator in the operator dashboard (no self-serve billing yet)
- All social API routes check this flag server-side and return 403 if not enabled
- UI shows a locked/upgrade state for non-subscribers rather than hiding the feature entirely

---

## Hero Image + Carousel Selection

Rather than a per-image "Post" button, the edited folder view has a **"Create Post"** button that opens a Post Builder panel.

### Post Builder UI (wireframe)

```
┌─────────────────────────────────────────────────────┐
│  Create Social Post — JKBZXVT15RA000075             │
├─────────────────────────────────────────────────────┤
│  SELECT IMAGES (tap to add, drag to reorder)        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │  ⭐  │ │  ✓   │ │      │ │      │              │
│  │img 1 │ │img 2 │ │img 3 │ │img 4 │              │
│  │ HERO │ │      │ │      │ │      │              │
│  └──────┘ └──────┘ └──────┘ └──────┘              │
│  First selected = Hero (shown first in carousel)    │
├─────────────────────────────────────────────────────┤
│  CAPTION (auto-filled, editable)                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🏍️ 2022 Kawasaki Ninja ZX-6R               │   │
│  │ 💰 $8,500 | Condition: Used                 │   │
│  │ Engine: 636cc | Low miles, well maintained  │   │
│  │ #motorcycle #dealership #kawasaki           │   │
│  │                               1,824 / 2,200 │   │
│  └─────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  POST TO:  [✓ Facebook]   [✓ Instagram]            │
│  [Cancel]                        [Post Now →]       │
└─────────────────────────────────────────────────────┘
```

### Image selection rules

- Click an image to toggle it in/out of the post
- First selected image = Hero (marked ⭐, always position 0 in payload)
- Instagram carousel minimum: 2 images; maximum: 10
- At least 1 image required to enable "Post Now"
- Single image selected → regular photo post (not carousel)

---

## VIN Decode

Use NHTSA's free public API — no API key required:

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{VIN}?format=json
```

Returns: Make, Model, Year, Engine, Body Type, Fuel Type, etc.

**Known limitation:** NHTSA has gaps for some motorcycle brands, especially smaller or imported manufacturers. If the decode returns incomplete data, surface editable fields so the user can fill them in manually. Cache the result in `vin_folders.vin_details` (JSONB) after first decode.

---

## Database Schema

### New columns and tables

```sql
-- Add-on flag (per user)
ALTER TABLE users ADD COLUMN social_media_addon BOOLEAN DEFAULT false;

-- Make webhook URL (per user, replaces all Meta OAuth columns)
ALTER TABLE users ADD COLUMN make_webhook_url TEXT;

-- Listing details (per VIN folder)
ALTER TABLE vin_folders ADD COLUMN price NUMERIC(10,2);
ALTER TABLE vin_folders ADD COLUMN condition VARCHAR(50);   -- 'new' | 'used' | 'certified'
ALTER TABLE vin_folders ADD COLUMN description TEXT;
ALTER TABLE vin_folders ADD COLUMN vin_details JSONB;      -- cached NHTSA response

-- Post history
CREATE TABLE social_posts (
  id                SERIAL PRIMARY KEY,
  vin_folder_id     INTEGER REFERENCES vin_folders(id),
  user_id           INTEGER REFERENCES users(id),
  platform          VARCHAR(20) NOT NULL,       -- 'facebook' | 'instagram'
  post_id           VARCHAR(200),               -- ID returned by Make/Meta
  hero_image_id     INTEGER REFERENCES images(id),
  image_ids         INTEGER[],                  -- all images in post order
  caption           TEXT,
  status            VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'posted' | 'failed'
  error_message     TEXT,
  posted_at         TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW()
);
```

> **Note:** `social_posts` has one row per platform per post event so Facebook and Instagram results are tracked independently. If Facebook succeeds and Instagram fails, each has its own status row and can be retried individually.

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/vin-folders/[id]/vin-decode` | GET | NHTSA lookup, cache in `vin_details` |
| `/api/vin-folders/[id]/listing` | PUT | Save price, condition, description |
| `/api/social/status` | GET | `{ addon_enabled, webhook_configured }` |
| `/api/social/webhook-url` | PUT | Save/update user's Make webhook URL |
| `/api/social/post` | POST | Fire webhook with images + caption, log to social_posts |

All `/api/social/*` routes return 403 if `social_media_addon = false`.

---

## UI Changes Summary

### Dashboard
- Show social media add-on status in user header
- "Connect Make" button (opens instructions + webhook URL field) when addon is enabled
- Locked/upgrade prompt when addon is disabled

### VIN Folder page — new "Listing Details" panel
- Price field (numeric)
- Condition dropdown (New / Used / Certified Pre-Owned)
- Description text area
- VIN decoded details shown (auto-populated, editable if NHTSA data is incomplete)

### Edited folder view
- "Create Post" button (only visible when addon is enabled + webhook configured)
- Post Builder panel (image selection, caption editor, platform toggles)
- Post history section below images: "Posted to Facebook on June 15 · Instagram on June 15"

### Operator dashboard
- Toggle `social_media_addon` per user

---

## Build Order

1. **DB migrations** — run all SQL above
2. **Listing details** — price/condition/description UI + VIN decode endpoint (zero Make dependency, delivers immediate value)
3. **Operator addon toggle** — flip `social_media_addon` in operator dashboard
4. **Make webhook setup** — webhook URL field in user settings + `/api/social/status`
5. **Post Builder UI** — hero selection, image ordering, caption editor with character counter
6. **Post endpoint** — `POST /api/social/post` fires webhook, logs to `social_posts`
7. **Post history UI** — show past posts in folder view with platform + status
8. **Create and publish Make scenario template** — shareable link users clone

---

## Open Questions — Decide Before Building

| Question | Why it matters | Options |
|---|---|---|
| What does "automated" mean? | Changes entire UX | A) Manual: user selects + clicks Post Now · B) Semi-auto: draft created when editing completes, user approves · C) Fully auto: posts immediately when editing done |
| Post scheduling? | High dealer value, low effort to add | Add date/time picker to Post Builder (Facebook supports `scheduled_publish_time`) |
| Caption templates per user? | Dealerships have different house styles | Save default template with `{year}`, `{make}`, `{price}` placeholders |
| Image resizing for platform ratios? | IG prefers 4:5 or 1:1; FB prefers landscape | Accept original ratio (works, not optimal) OR add crop step |
| Multi-page support? | Dealership groups with multiple locations | One webhook per user (current plan) OR `social_connections` table |

---

## Issues Identified and Resolved During Planning

| Issue | Resolution |
|---|---|
| Meta App Review (2–4 week blocker) | Use Make as middleware — their app is already approved |
| Page Access Token expiry every 60 days | Eliminated — Make manages tokens, not us |
| Instagram requires Business Account | User education in onboarding: "Convert IG to Business → connect to FB Page → connect in Make" |
| Signed URL TTL too short for Meta fetch | Use longer-lived signed URLs (10–15 min minimum) in the `/api/social/post` route |
| Carousel not supported by Zapier/n8n | Chose Make (only platform with native IG carousel support) |
| Duplicate ZIP filenames in bulk download | Fixed: append `(N)` suffix when filenames collide (already shipped) |

---

## What Is NOT in Scope (Phase 2)

- Analytics / engagement tracking (likes, reach, comments)
- Self-serve billing for the add-on (manual operator toggle for now)
- Twitter / TikTok / LinkedIn
- AI-generated captions (Gemini could generate from VIN + listing data — future)
- Bulk scheduling (post all VINs on a schedule)
