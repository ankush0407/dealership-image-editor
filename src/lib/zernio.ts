import axios from 'axios';

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY ?? '';
const BASE = 'https://zernio.com/api/v1';

function headers() {
  return { Authorization: `Bearer ${ZERNIO_API_KEY}` };
}

function assertKey() {
  if (!ZERNIO_API_KEY) throw new Error('ZERNIO_API_KEY is not set in .env.local');
}

// ─── Profiles ────────────────────────────────────────────────────────────────
// Each user gets one Zernio profile — a container that groups their social accounts.

export async function createZernioProfile(name: string): Promise<string> {
  assertKey();
  const res = await axios.post(
    `${BASE}/profiles`,
    { name },
    { headers: headers(), timeout: 15000 }
  );
  // API returns { profile: { _id, ... } } or { _id, ... }
  return res.data.profile?._id ?? res.data._id;
}

// ─── Connect (OAuth) ─────────────────────────────────────────────────────────
// Returns an authUrl the user must open in their browser to connect their FB Page.

export async function getZernioConnectUrl(
  platform: 'facebook' | 'instagram',
  profileId: string
): Promise<string> {
  assertKey();
  const res = await axios.get(`${BASE}/connect/${platform}`, {
    params: { profileId },
    headers: headers(),
    timeout: 15000,
  });
  return res.data.authUrl;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface ZernioAccount {
  _id: string;      // acc_* format — use this when posting
  platform: string; // 'facebook', 'instagram', etc.
  name?: string;    // page/account name
}

export async function listZernioAccounts(profileId?: string): Promise<ZernioAccount[]> {
  assertKey();
  const res = await axios.get(`${BASE}/accounts`, {
    params: profileId ? { profileId } : {},
    headers: headers(),
    timeout: 15000,
  });
  // API returns array or { accounts: [...] }
  return Array.isArray(res.data) ? res.data : (res.data.accounts ?? []);
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export interface ZernioPostOptions {
  accountId: string;    // Zernio account _id of the user's connected FB Page
  imageUrl: string;     // publicly accessible URL Zernio fetches at delivery time
  caption: string;
  firstComment: string; // appended to caption footer (Zernio has no native firstComment API)
  scheduledAt?: string; // ISO 8601; omit to post immediately (publishNow: true)
}

export async function createZernioPost(opts: ZernioPostOptions): Promise<string> {
  assertKey();

  // Append listing URL as a footer line in the caption (Zernio has no firstComment API)
  const content = opts.firstComment
    ? `${opts.caption}\n\n${opts.firstComment}`
    : opts.caption;

  const payload: Record<string, unknown> = {
    platforms:  [{ platform: 'facebook', accountId: opts.accountId }],
    content,
    mediaItems: [{ url: opts.imageUrl, type: 'image' }],
  };

  if (opts.scheduledAt) {
    payload.scheduledFor = opts.scheduledAt;
    payload.timezone = 'UTC';
  } else {
    payload.publishNow = true;
  }

  const res = await axios.post(`${BASE}/posts`, payload, {
    headers: { ...headers(), 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  // Response shape: { post: { _id: "..." } }
  return res.data.post?._id ?? res.data._id ?? res.data.id;
}

export async function cancelZernioPost(zernioPostId: string): Promise<void> {
  if (!ZERNIO_API_KEY) return;
  await axios
    .delete(`${BASE}/posts/${zernioPostId}`, { headers: headers(), timeout: 15000 })
    .catch(() => {});
}
