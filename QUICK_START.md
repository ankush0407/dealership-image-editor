# Quick Start Guide

## 1. Setup & Install

```bash
cd /Users/ankushkhandelwal/claude_cowork/dealership-image-editor

# Install all dependencies
npm install

# This installs:
# - Next.js, React, Tailwind CSS
# - PostgreSQL client, bcryptjs, JWT, axios
# - TypeScript & dev tools
```

## 2. Database Setup

### If PostgreSQL is running locally:

```bash
# Create database
createdb dealership_editor

# Initialize schema
psql -U postgres -d dealership_editor -f db/schema.sql

# Verify tables created
psql -U postgres -d dealership_editor -c "\dt"
```

### Or use Docker:

```bash
# Start PostgreSQL in Docker
docker run --name pg-editor -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Create database inside container
docker exec -it pg-editor psql -U postgres -c "CREATE DATABASE dealership_editor"

# Run schema
docker exec -it pg-editor psql -U postgres -d dealership_editor -f /dev/stdin < db/schema.sql
```

## 3. Environment Variables

Edit `.env.local`:

```env
# Get from: https://aistudio.google.com/app/apikeys
GEMINI_API_KEY=your_actual_key_here

# PostgreSQL connection
DATABASE_URL=postgresql://postgres:password@localhost:5432/dealership_editor

# Generate any random string for JWT
AUTH_SECRET=your-random-secret-key-here

# For operator dashboard access
OPERATOR_SECRET=your-operator-secret-here

# Other settings
STORAGE_BASE_PATH=./storage
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## 4. Run Development Server

```bash
npm run dev
```

Output:
```
> ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

## 5. Test the App

### Signup Flow
1. Open http://localhost:3000
2. Redirects to `/login`
3. Click "Sign up"
4. Fill form:
   - Email: `dealer1@test.com`
   - Password: `Test123!`
   - Plan: `Standard (250 credits)`
5. Account created → redirect to dashboard

### Upload Images
1. Dashboard shows "0 credits" (if free plan) or "250 credits" (if standard)
2. Create VIN folder: `2024FORD001`
3. Click folder → image gallery
4. Upload test images (JPG/PNG)
5. Watch status: Queued → Processing → Done
6. Download edited image

### Check Database

```bash
# List users
psql -U postgres -d dealership_editor -c "SELECT id, email, plan, credits_remaining FROM users;"

# Check images processed
psql -U postgres -d dealership_editor -c "SELECT id, status, original_filename FROM images;"

# View credit transactions
psql -U postgres -d dealership_editor -c "SELECT * FROM credit_transactions LIMIT 5;"
```

## 6. Operator Dashboard

```bash
# Get all users and platform stats
curl -H "Authorization: Bearer your-operator-secret-here" \
  http://localhost:3000/api/operator/dashboard

# Response includes:
# - stats: total_users, total_images, successful_images, error_rate
# - users: array of all dealers with credit usage
```

## 7. Build for Production

```bash
npm run build
npm start
```

## Troubleshooting

### "Cannot find module 'next'" or similar
- Run `npm install` again
- Delete `node_modules` and `npm install`

### "ECONNREFUSED" on database connection
- Verify PostgreSQL is running: `psql -U postgres -l`
- Check `DATABASE_URL` in `.env.local` is correct
- Start PostgreSQL or Docker container

### Gemini API errors
- Verify `GEMINI_API_KEY` is valid and has quota
- Check internet connection
- Review error in server logs

### Images stuck in "Processing"
- Likely Gemini API timeout (check logs)
- Database connection issue
- Image processing background task crashed

### Storage directory issues
- Ensure `./storage` directory is writable
- Check disk space
- Verify permissions: `chmod 755 ./storage`

## File Structure Reference

```
src/
├── app/                           # Next.js pages and API routes
│   ├── layout.tsx                # Root layout
│   ├── (auth pages)              # login, signup
│   ├── dashboard/page.tsx        # Main dashboard
│   ├── folder/[id]/              # Folder detail
│   ├── api/auth/                 # Auth endpoints
│   ├── api/vin-folders/          # VIN management
│   ├── api/images/               # Image upload/download
│   └── api/operator/             # Admin endpoints
└── lib/                          # Utilities
    ├── db.ts                     # DB connection
    ├── auth.ts                   # JWT & crypto
    └── gemini.ts                 # Gemini API client
```

## Development Tips

### Hot Reload
- Edit any `.tsx` or `.ts` file
- Changes auto-refresh in browser (no restart needed)

### Debug Logs
- Server logs appear in terminal where you ran `npm run dev`
- Check browser console for client errors (F12)

### Database Inspection
```bash
# Quick query
psql -U postgres -d dealership_editor -c "SELECT * FROM users LIMIT 5;"

# Full psql session
psql -U postgres -d dealership_editor
```

### Reset Everything
```bash
# Drop and recreate database
dropdb dealership_editor
createdb dealership_editor
psql -U postgres -d dealership_editor -f db/schema.sql

# Clear storage
rm -rf ./storage/*

# Restart server
npm run dev
```

## Next: Test with Real Dealers

Once local testing passes:
1. Deploy to production server (Vercel/Heroku/AWS)
2. Set `NEXT_PUBLIC_API_URL` to production domain
3. Configure PostgreSQL (managed database)
4. Update `GEMINI_API_KEY` with production quota
5. Onboard first dealer → monitor processing

---

**Ready to go?** Run `npm install && npm run dev` and visit http://localhost:3000
