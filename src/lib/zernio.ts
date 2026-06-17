import axios from 'axios';

// ─── Env vars (set in .env.local after signing up at zernio.com) ─────────────
const ZERNIO_API_KEY      = process.env.ZERNIO_API_KEY ?? '';
const ZERNIO_CLIENT_ID    = process.env.ZERNIO_CLIENT_ID ?? '';
const ZERNIO_CLIENT_SECRET = process.env.ZERNIO_CLIENT_SECRET ?? '';
const APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const ZERNIO_BASE = 'https://api.zernio.com';
const REDIRECT_URI = `${APP_URL}/api/social/callback`;

// ─── OAuth ───────────────────────────────────────────────────────────────────

// Returns the URL to redirect the user to so they can connect their Facebook Page
export function getZernioOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: ZERNIO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'publish schedule',
  });
  return `https://app.zernio.com/oauth/authorize?${params}`;
}

// Exchange OAuth code for an account ID. Call from the /api/social/callback route.
// TODO: verify exact Zernio token endpoint path + response shape once you have docs
export async function exchangeZernioCode(
  code: string
): Promise<{ accountId: string; pageName: string }> {
  assertConfigured();
  const res = await axios.post(
    `${ZERNIO_BASE}/oauth/token`,
    {
      client_id: ZERNIO_CLIENT_ID,
      client_secret: ZERNIO_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
    },
    { timeout: 15000 }
  );
  return {
    accountId: res.data.account_id,
    pageName: res.data.page_name ?? res.data.account_name ?? '',
  };
}

// ─── Post creation ───────────────────────────────────────────────────────────

export interface ZernioPostOptions {
  accountId: string;
  imageUrl: string;       // publicly accessible URL Zernio fetches at delivery time
  caption: string;
  firstComment: string;
  scheduledAt?: string;   // ISO 8601 timestamp; omit to post immediately
}

export interface ZernioPostResult {
  zernioPostId: string;
}

// TODO: verify exact Zernio posts endpoint path + request/response shape
export async function createZernioPost(opts: ZernioPostOptions): Promise<ZernioPostResult> {
  assertConfigured();
  const payload: Record<string, unknown> = {
    account_id: opts.accountId,
    content: opts.caption,
    media: [{ url: opts.imageUrl }],
    first_comment: opts.firstComment,
  };
  if (opts.scheduledAt) {
    payload.scheduled_at = opts.scheduledAt;
  }

  const res = await axios.post(`${ZERNIO_BASE}/posts`, payload, {
    headers: {
      Authorization: `Bearer ${ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  return { zernioPostId: res.data.id ?? res.data.post_id };
}

// Best-effort: cancel a scheduled post before delivery
export async function cancelZernioPost(zernioPostId: string): Promise<void> {
  if (!ZERNIO_API_KEY) return;
  await axios
    .delete(`${ZERNIO_BASE}/posts/${zernioPostId}`, {
      headers: { Authorization: `Bearer ${ZERNIO_API_KEY}` },
      timeout: 15000,
    })
    .catch(() => {});
}

// ─── Private ─────────────────────────────────────────────────────────────────

function assertConfigured() {
  if (!ZERNIO_API_KEY || !ZERNIO_CLIENT_ID) {
    throw new Error(
      'Zernio is not configured. Add ZERNIO_API_KEY, ZERNIO_CLIENT_ID, and ' +
      'ZERNIO_CLIENT_SECRET to .env.local (sign up at zernio.com).'
    );
  }
}
