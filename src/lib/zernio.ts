import axios from 'axios';

// Zernio is API-first — no OAuth client credentials needed.
// How it works:
//   1. You have one ZERNIO_API_KEY (server-side, in .env.local)
//   2. Each user connects their Facebook Page inside Zernio's own dashboard
//      (app.zernio.com → Add Account → Facebook)
//   3. Zernio shows them an account_id for that page
//   4. The user pastes that account_id into Social Settings in this app
//   5. Our server uses ZERNIO_API_KEY + user's account_id to post

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY ?? '';
const ZERNIO_BASE    = 'https://api.zernio.com';

export interface ZernioPostOptions {
  accountId: string;    // user's Zernio account_id for their FB Page
  imageUrl: string;     // publicly accessible URL Zernio fetches at delivery time
  caption: string;
  firstComment: string;
  scheduledAt?: string; // ISO 8601; omit to post immediately
}

export interface ZernioPostResult {
  zernioPostId: string;
}

export async function createZernioPost(opts: ZernioPostOptions): Promise<ZernioPostResult> {
  if (!ZERNIO_API_KEY) {
    throw new Error('ZERNIO_API_KEY is not set in .env.local');
  }

  const payload: Record<string, unknown> = {
    account_id:    opts.accountId,
    content:       opts.caption,
    media:         [{ url: opts.imageUrl }],
    first_comment: opts.firstComment,
  };
  if (opts.scheduledAt) payload.scheduled_at = opts.scheduledAt;

  const res = await axios.post(`${ZERNIO_BASE}/posts`, payload, {
    headers: {
      Authorization: `Bearer ${ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  return { zernioPostId: res.data.id ?? res.data.post_id };
}

export async function cancelZernioPost(zernioPostId: string): Promise<void> {
  if (!ZERNIO_API_KEY) return;
  await axios
    .delete(`${ZERNIO_BASE}/posts/${zernioPostId}`, {
      headers: { Authorization: `Bearer ${ZERNIO_API_KEY}` },
      timeout: 15000,
    })
    .catch(() => {});
}
