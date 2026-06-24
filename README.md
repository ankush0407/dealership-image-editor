# Dealership Image Background Editor

A SaaS web application that automates vehicle photo background editing for car dealerships using Google Gemini's AI.

## Features

- **User Authentication**: Email/password signup and login with plan selection
- **Credit System**: 3 pricing tiers (Free/25 credits, Standard/250 credits, Pro/500 credits)
- **VIN Organization**: Create folders organized by vehicle VIN numbers
- **Batch Upload**: Upload multiple raw photos at once
- **AI Background Editing**: Automatic background replacement to a premium studio aesthetic (gradient grey backdrop + polished reflective white floor) using Google Gemini 3.1 Flash. The motorcycle is kept pixel-perfect; only the background changes.
- **Image Download**: Download individual edited images or batch as ZIP
- **Credit Tracking**: Real-time credit balance and usage history
- **Status Monitoring**: Track image processing status (Queued → Processing → Done/Failed)
- **Social Media Posting**: Post edited hero images to Facebook Pages via Zernio, with auto-filled captions from VIN data, scheduling support, and listing URL as first comment

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Auth**: JWT with bcrypt password hashing
- **Image Processing**: Google Gemini 3.1 Flash API
- **Storage**: Supabase (S3-compatible, with local disk fallback)
- **Social Posting**: Zernio API (Facebook Pages; Instagram Phase 2)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Google Gemini API key
- npm or yarn

## Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Set up environment variables** (`.env.local`):
```
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://user:password@localhost:5432/dealership_editor
AUTH_SECRET=your_secret_key_here
STORAGE_BASE_PATH=./storage
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

3. **Initialize database**:
```bash
npm run db:init
```

This creates:
- `users` table with plan and credit tracking
- `vin_folders` table for organizing images
- `images` table with status tracking
- `credit_transactions` table for audit trail

4. **Start development server**:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Signup
1. Go to `/signup`
2. Enter email and password
3. Select a credit plan (Free, Standard, or Pro)
4. Account is created with initial credits

### Upload Photos
1. Log in to dashboard
2. Create a VIN folder
3. Click the folder to enter it
4. Upload raw images (jpg/png)
5. Each upload deducts 1 credit and triggers Gemini processing

### Download
- Download individual edited images
- Download entire VIN folder as ZIP

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new dealer
- `POST /api/auth/login` - Login to existing account

### VIN Folders
- `POST /api/vin-folders/create` - Create new VIN folder
- `GET /api/vin-folders/list` - List all folders for user
- `GET /api/vin-folders/[id]/images` - List images in folder

### Images
- `POST /api/images/upload` - Upload raw images (triggers processing)
- `POST /api/images/process` - Reprocess a single image
- `GET /api/images/[id]/download` - Download edited image
- `GET /api/images/[id]/preview-url` - Get signed preview URL
- `GET /api/vin-folders/[id]/download-urls` - Get signed download URLs for folder
- `GET /api/vin-folders/[id]/zip` - Download folder as ZIP

### VIN & Listing
- `GET /api/vin-folders/[id]/vin-decode` - NHTSA VIN decode (cached in DB)
- `PUT /api/vin-folders/[id]/listing` - Save price, condition, description

### Social Media
- `GET /api/social/status` - Check addon status + Facebook connection
- `GET /api/social/connect` - Redirect to Zernio OAuth for Facebook
- `DELETE /api/social/disconnect` - Remove Facebook connection
- `PUT /api/social/caption-template` - Save user's default caption template
- `POST /api/social/post` - Resize hero image → post via Zernio
- `POST /api/social/posts/[id]/retry` - Retry a failed post
- `GET /api/social/sync` - Sync post status from Zernio
- `POST /api/social/webhook` - Receive Zernio delivery webhooks
- `GET /api/vin-folders/[id]/social-posts` - List posts for a VIN folder

### User Settings
- `GET /api/auth/me` - Get current user info
- `POST /api/user/logo` - Upload dealership logo
- `POST /api/user/logo/apply-existing` - Re-apply logo to all processed images

### Operator (Admin)
- `GET /api/operator/dashboard` - View all accounts and usage

## Credit System

### Pricing
- **Free**: 25 credits
- **Standard**: 250 credits
- **Pro**: 500 credits

### Credit Deduction
- 1 credit = 1 image processed
- Deducted **before** processing starts
- Failed images automatically refund credit after 3 retries
- User cannot upload if credits = 0

### Usage Tracking
All transactions logged in `credit_transactions` table with:
- User ID
- Delta (positive or negative)
- Reason (image_processing, processing_failed)
- Image ID reference
- Timestamp

## Image Processing

### Gemini 2-Step Process

**Step 1**: Upload image to Gemini File API
```
POST https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media
```

**Step 2**: Generate edited image
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent
```

### Processing Parameters
- **Model**: `gemini-3.1-flash-image`
- **Background**: Premium studio aesthetic — gradient grey backdrop (#787878 → #363636 vignette) with polished reflective white floor (~#F0F0F0). Motorcycle kept pixel-perfect; only background changes.
- **Output Resolution**: 2K
- **Temperature**: 0.2 (low variance)
- **Retries**: 3 with exponential backoff
- **Timeout**: 90 seconds per image

### Success Criteria
- Processing completes in under 60 seconds
- Background matches premium studio reference
- Image quality: 2K resolution
- Error rate: < 5%

## Storage Structure

Local disk storage mirrors S3 conventions for easy migration:

```
/storage/
  {userId}/
    {VIN}/
      raw/
        {original_filename}
      edited/
        edited_{original_filename}
```

To migrate to S3, swap storage driver with minimal code changes.

## Database Schema

### Users
- `id` (PK)
- `email` (unique)
- `password_hash` (bcrypt)
- `plan` (free|standard|pro)
- `credits_remaining` (int)
- `created_at`, `updated_at` (timestamps)

### VIN Folders
- `id` (PK)
- `user_id` (FK to users)
- `vin_name` (varchar)
- `created_at` (timestamp)

### Images
- `id` (PK)
- `vin_folder_id` (FK)
- `user_id` (FK)
- `original_filename`, `raw_path`, `edited_path`
- `status` (queued|processing|done|failed)
- `error_message`, `retry_count`
- `created_at`, `processed_at` (timestamps)

### Credit Transactions
- `id` (PK)
- `user_id` (FK)
- `delta` (int: -1 for deduction, +1 for refund)
- `reason` (image_processing|processing_failed)
- `image_id` (FK, nullable)
- `created_at` (timestamp)

## Development Roadmap

### v1 (Current - Shipped)
- ✅ Auth with credit system
- ✅ VIN folder management
- ✅ Batch upload and Gemini processing
- ✅ Download single and ZIP
- ✅ Dashboard with status tracking
- ✅ Operator admin view
- ✅ Dealership logo overlay on edited images
- ✅ Premium studio background (gradient grey + reflective white floor)
- ✅ Social media posting to Facebook Pages via Zernio
- ✅ VIN decode via NHTSA with editable fallback
- ✅ Listing details (price, condition, description) per VIN folder
- ✅ Auto-filled captions with user-editable templates
- ✅ Scheduled posting and post history per folder

### v2 (Post-Pilot)
- Stripe integration for self-serve credit purchases
- Instagram posting (Zernio Phase 2)
- Multi-user accounts per dealership
- Email notifications on job completion
- Fully automated posting (skip review step)
- NHTSA VIN decoding improvements for imported/specialty brands

## Troubleshooting

### Images stuck in "Processing" state
- Check Gemini API key in `.env.local`
- Verify network connectivity
- Check server logs for error messages

### "Insufficient credits" error
- User has exceeded their plan limit
- Contact operator to assign additional credits via database

### Images failing consistently
- Verify image format (jpg/png only)
- Check file size (large images may timeout)
- Confirm Gemini API quota not exceeded

## Support

For issues or questions:
1. Check server logs: `npm run dev`
2. Verify environment variables
3. Test database connection
4. Review Gemini API documentation

## License

Proprietary - Dealership Image Editor Pilot Program
