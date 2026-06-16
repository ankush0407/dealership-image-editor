# Complete File Inventory

## Project Root Files

### Configuration Files
- **package.json** - Dependencies (Next.js, React, Tailwind, PostgreSQL, JWT, bcrypt)
- **tsconfig.json** - TypeScript compiler options
- **tsconfig.node.json** - TypeScript config for Next config file
- **next.config.ts** - Next.js app configuration
- **tailwind.config.ts** - Tailwind CSS theme configuration
- **postcss.config.js** - PostCSS plugins (Tailwind, Autoprefixer)
- **.env.local** - Environment variables template (GEMINI_API_KEY, DATABASE_URL, etc.)
- **.gitignore** - Git ignore patterns (node_modules, .next, storage, etc.)

### Documentation Files
- **README.md** - Complete feature overview, setup instructions, API reference, troubleshooting
- **QUICK_START.md** - 5-minute local development setup guide
- **BUILD_SUMMARY.md** - Technical implementation details, feature checklist, architecture notes
- **DEPLOYMENT_GUIDE.md** - Production deployment checklist, success metrics, v2 roadmap

### Database
- **db/schema.sql** - Complete PostgreSQL schema with 4 tables and indexes

---

## Source Code: `/src/`

### Pages & Layouts

#### Root Layout
- **src/app/layout.tsx** - Root layout wrapper, Tailwind CSS integration, metadata
- **src/app/globals.css** - Global styles and Tailwind imports
- **src/app/page.tsx** - Root page redirects to login/dashboard based on auth

#### Authentication Pages
- **src/app/login/page.tsx** - Login form with email/password fields
- **src/app/signup/page.tsx** - Signup form with plan selection (Free/Standard/Pro)

#### Application Pages
- **src/app/dashboard/page.tsx** - Main dealer dashboard
  - Create VIN folders
  - Display all folders with image counts
  - Show remaining credits
  - Logout button
  - Real-time data fetching

- **src/app/folder/[id]/page.tsx** - VIN folder detail page
  - Multi-file upload interface
  - Image gallery with status indicators
  - Real-time polling (3s intervals)
  - Individual image download
  - Status colors (queued, processing, done, failed)

### API Routes

#### Authentication (`/api/auth/`)
- **signup/route.ts** - Register new dealer
  - Email + password + plan selection
  - Bcrypt password hashing
  - Allocate credits based on plan
  - Return JWT token

- **login/route.ts** - Authenticate existing user
  - Email + password validation
  - JWT token generation
  - Return user info + token

#### VIN Folder Management (`/api/vin-folders/`)
- **create/route.ts** - Create new VIN folder
  - Require authenticated user
  - Store folder name and association
  - Return folder ID

- **list/route.ts** - List all user's VIN folders
  - Query folders for logged-in user
  - Include image count per folder
  - Include processed image count
  - Return in created_at DESC order

- **[id]/images/route.ts** - List images in a specific VIN folder
  - Verify user owns the folder
  - Return all images with status and paths
  - Include error messages for failed images
  - Order by created_at DESC

#### Image Processing (`/api/images/`)
- **upload/route.ts** - Upload raw images and trigger processing
  - Multi-file upload handling
  - Validate file types (jpg, jpeg, png)
  - Check user credit balance
  - Create image records
  - Deduct 1 credit per image
  - Save raw images to `/storage/{userId}/{vin}/raw/`
  - Trigger async Gemini processing
  - Implement retry logic (3x with backoff)
  - Auto-refund credits on permanent failure

- **[id]/download/route.ts** - Download edited image
  - Verify user owns image
  - Check image status is "done"
  - Read from edited_path
  - Return with proper MIME type
  - Set attachment headers for browser download

#### Admin (`/api/operator/`)
- **dashboard/route.ts** - Operator admin dashboard
  - Require OPERATOR_SECRET header
  - List all users with stats:
    - Credits remaining
    - Total images processed
    - Failed image count
    - Usage trends
  - Platform statistics:
    - Total users
    - Total images
    - Success/failure rates

### Utilities (`/src/lib/`)

- **db.ts** - Database connection management
  - PostgreSQL connection pool
  - Query execution wrapper
  - Error handling
  - Reusable query function

- **auth.ts** - JWT and authentication utilities
  - signToken(payload) - Create JWT
  - verifyToken(token) - Parse & validate JWT
  - getTokenFromRequest(req) - Extract token from Authorization header
  - Payload type with userId and email

- **gemini.ts** - Google Gemini API integration
  - uploadToGeminiFileAPI(filePath) - Step 1: Upload to File API
  - generateEditedImage(fileUri, mimeType) - Step 2: Generate edited image
  - processImageWithGemini(inputPath, outputPath) - Full 2-step process
  - ensureStorageDir(userId, vin) - Create directory structure
  - getStoragePath(userId, vin, type, filename) - Path formatting
  - Error handling and retry logic

---

## Directory Tree

```
dealership-image-editor/
├── src/
│   ├── app/
│   │   ├── layout.tsx              (Root layout)
│   │   ├── globals.css             (Global styles)
│   │   ├── page.tsx                (Root redirect)
│   │   ├── login/
│   │   │   └── page.tsx            (Login page)
│   │   ├── signup/
│   │   │   └── page.tsx            (Signup page)
│   │   ├── dashboard/
│   │   │   └── page.tsx            (Main dashboard)
│   │   ├── folder/
│   │   │   └── [id]/
│   │   │       └── page.tsx        (Image gallery)
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── signup/
│   │       │   │   └── route.ts
│   │       │   └── login/
│   │       │       └── route.ts
│   │       ├── vin-folders/
│   │       │   ├── create/
│   │       │   │   └── route.ts
│   │       │   ├── list/
│   │       │   │   └── route.ts
│   │       │   └── [id]/
│   │       │       └── images/
│   │       │           └── route.ts
│   │       ├── images/
│   │       │   ├── upload/
│   │       │   │   └── route.ts
│   │       │   └── [id]/
│   │       │       └── download/
│   │       │           └── route.ts
│   │       └── operator/
│   │           └── dashboard/
│   │               └── route.ts
│   └── lib/
│       ├── db.ts                   (Database utilities)
│       ├── auth.ts                 (JWT & crypto)
│       └── gemini.ts               (Gemini API client)
├── db/
│   └── schema.sql                  (PostgreSQL schema)
├── .env.local                      (Environment template)
├── .gitignore                      (Git ignore)
├── package.json                    (Dependencies)
├── tsconfig.json                   (TypeScript config)
├── tsconfig.node.json              (Next.js TS config)
├── next.config.ts                  (Next.js config)
├── tailwind.config.ts              (Tailwind config)
├── postcss.config.js               (PostCSS config)
├── README.md                       (Full documentation)
├── QUICK_START.md                  (Quick setup)
├── BUILD_SUMMARY.md                (Build details)
└── DEPLOYMENT_GUIDE.md             (Deployment info)
```

---

## File Purpose Summary

| File | Purpose | Key Exports/Configs |
|------|---------|-------------------|
| package.json | Dependencies & scripts | next, react, tailwindcss, bcryptjs, pg, jsonwebtoken, axios |
| tsconfig.json | TypeScript compiler settings | module: ESNext, lib: ES2020/DOM, strict: true |
| next.config.ts | Next.js app configuration | API routes, image optimization, environment |
| tailwind.config.ts | Tailwind CSS theming | Default Tailwind (can extend colors/spacing) |
| db/schema.sql | Database tables & indexes | users, vin_folders, images, credit_transactions |
| src/app/layout.tsx | Root wrapper for all pages | metadata, Tailwind CSS import |
| src/app/login/page.tsx | Dealer authentication | Email/password login, JWT token handling |
| src/app/signup/page.tsx | Dealer registration | Plan selection, account creation, auto-redirect |
| src/app/dashboard/page.tsx | Main interface | VIN management, credit display, folder listing |
| src/app/folder/[id]/page.tsx | Image management | Upload, gallery, real-time status polling |
| src/lib/db.ts | Database connection | query() function, connection pool |
| src/lib/auth.ts | JWT authentication | signToken(), verifyToken(), getTokenFromRequest() |
| src/lib/gemini.ts | AI image processing | processImageWithGemini(), ensureStorageDir() |
| src/app/api/auth/signup/route.ts | Registration endpoint | POST, creates user + allocates credits |
| src/app/api/auth/login/route.ts | Login endpoint | POST, returns JWT token |
| src/app/api/vin-folders/create/route.ts | Folder creation | POST, creates VIN folder |
| src/app/api/vin-folders/list/route.ts | Folder listing | GET, returns user's folders |
| src/app/api/vin-folders/[id]/images/route.ts | Image listing | GET, returns images in folder |
| src/app/api/images/upload/route.ts | Image processing | POST, uploads + triggers Gemini |
| src/app/api/images/[id]/download/route.ts | Image delivery | GET, downloads edited image |
| src/app/api/operator/dashboard/route.ts | Admin view | GET, platform statistics |

---

## Total Line Count

```
Frontend Pages:              ~500 lines (login, signup, dashboard, folder)
API Routes:                  ~800 lines (8 endpoints, auth, processing, admin)
Utilities:                   ~200 lines (db, auth, gemini)
Database Schema:             ~50 lines (4 tables, 7 indexes)
Config Files:                ~100 lines (next, tailwind, tsconfig)
Documentation:              ~2000 lines (README, guides, deployment)
---
Total Source Code:          ~1650 lines
Total Documentation:        ~2000 lines
```

---

## Dependencies Overview

### Core Framework
- `next@15` - React framework
- `react@19` - UI library
- `typescript@5` - Type safety

### Styling
- `tailwindcss@3` - Utility CSS framework
- `postcss@8` - CSS processing
- `autoprefixer@10` - CSS vendor prefixes

### Backend/Database
- `pg@8` - PostgreSQL client
- `axios@1` - HTTP client

### Security
- `bcryptjs@2` - Password hashing
- `jsonwebtoken@9` - JWT signing/verification

### File Handling
- `multer@1` - File upload middleware
- `sharp@0` - Image processing

### Development
- `@types/node@20` - Node.js type definitions
- `@types/react@18` - React type definitions

---

## Ready to Deploy

✅ All P0 features implemented  
✅ Production-ready code structure  
✅ Complete documentation  
✅ Database schema optimized  
✅ Error handling implemented  
✅ Security best practices followed  

**Next Step**: `npm install && npm run dev` to start local development
