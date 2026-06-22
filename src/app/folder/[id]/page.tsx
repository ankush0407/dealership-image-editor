'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import JSZip from 'jszip';

interface Image {
  id: number;
  original_filename: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  created_at: string;
  processed_at?: string;
  error_message?: string;
}

interface SocialPost {
  id: number;
  platform: string;
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  scheduled_at: string | null;
  posted_at: string | null;
  platform_post_url: string | null;
  error_message: string | null;
  hero_image_id: number | null;
  caption: string;
  first_comment: string;
}

interface Listing {
  vin_name: string;
  price: number | null;
  condition: string | null;
  description: string | null;
  vin_details: Record<string, string>;
  complete: boolean;
}

interface SocialStatus {
  addon_enabled: boolean;
  fb_connected: boolean;
  caption_template: string;
  vin_search_url_template: string;
}

type View = 'folders' | 'raw' | 'edited';

function ImagePreview({ imageId, type }: { imageId: number; type: 'raw' | 'edited' }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setSrc(null);
    setError(false);
    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    fetch(`/api/images/${imageId}/preview-url?type=${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.url) setSrc(data.url);
        else if (!cancelled) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [imageId, type]);

  if (error) {
    return (
      <div className="w-full h-48 bg-gray-100 flex items-center justify-center rounded-lg text-gray-400 text-sm">
        Preview unavailable
      </div>
    );
  }
  if (!src) return <div className="w-full h-48 bg-gray-100 animate-pulse rounded-lg" />;
  return <img src={src} alt={type} className="w-full h-48 object-contain rounded-lg bg-gray-100" />;
}

export default function FolderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const folderId = params.id as string;

  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('folders');
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Listing details
  const [listing, setListing] = useState<Listing | null>(null);
  const [showListingPanel, setShowListingPanel] = useState(false);
  const [listingDraft, setListingDraft] = useState<Partial<Listing>>({});
  const [vinDetails, setVinDetails] = useState<Record<string, string>>({});
  const [savingListing, setSavingListing] = useState(false);
  const [decodingVin, setDecodingVin] = useState(false);
  const [listingMsg, setListingMsg] = useState('');

  // Social
  const [socialStatus, setSocialStatus] = useState<SocialStatus | null>(null);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [showPostBuilder, setShowPostBuilder] = useState(false);
  const [heroImageId, setHeroImageId] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [firstCommentPreview, setFirstCommentPreview] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [retryingId, setRetryingId] = useState<number | null>(null);

  useEffect(() => {
    loadImages();
    loadListing();
    loadSocialStatus();
    const interval = setInterval(loadImages, 3000);
    return () => clearInterval(interval);
  }, [folderId]);

  // Rebuild first-comment preview when listing or social status changes
  useEffect(() => {
    if (socialStatus?.vin_search_url_template && listing?.vin_name) {
      setFirstCommentPreview(
        socialStatus.vin_search_url_template.replace('{VIN}', listing.vin_name)
      );
    }
  }, [socialStatus, listing]);

  const loadImages = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }
      const response = await axios.get(`/api/vin-folders/${folderId}/images`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) setImages(response.data.images);
    } catch {
      console.error('Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const loadListing = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`/api/vin-folders/${folderId}/listing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setListing(res.data.listing);
        setListingDraft({
          price: res.data.listing.price,
          condition: res.data.listing.condition,
          description: res.data.listing.description,
        });
        setVinDetails(res.data.listing.vin_details ?? {});
      }
    } catch { /* ignore */ }
  };

  const loadSocialStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const [statusRes, postsRes] = await Promise.all([
        axios.get('/api/social/status', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/vin-folders/${folderId}/social-posts`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { posts: [] } })),
      ]);
      if (statusRes.data.success) setSocialStatus(statusRes.data);
      setSocialPosts(postsRes.data.posts ?? []);
    } catch { /* social add-on not enabled */ }
  };

  const handleDecodeVin = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setDecodingVin(true);
    setListingMsg('');
    try {
      const res = await axios.get(`/api/vin-folders/${folderId}/vin-decode`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const decoded = res.data.vin_details ?? {};
      setVinDetails((prev) => ({ ...decoded, ...prev }));
      if (res.data.warning) setListingMsg(res.data.warning);
    } catch (err: any) {
      setListingMsg(err.response?.data?.error || 'VIN decode failed');
    } finally {
      setDecodingVin(false);
    }
  };

  const handleSaveListing = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setSavingListing(true);
    setListingMsg('');
    try {
      const res = await axios.put(
        `/api/vin-folders/${folderId}/listing`,
        { ...listingDraft, vin_details: vinDetails },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setListing(res.data.listing);
      setListingMsg(res.data.listing.complete ? 'Listing saved. Ready to post.' : 'Saved. Fill in all fields to enable posting.');
    } catch (err: any) {
      setListingMsg(err.response?.data?.error || 'Save failed');
    } finally {
      setSavingListing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) return;

    const total = Array.from(files).filter(f => ['image/jpeg', 'image/png'].includes(f.type)).length;
    if (total === 0) return;

    setError('');
    setUploading(true);
    setUploadProgress({ current: 0, total });
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      let done = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!['image/jpeg', 'image/png'].includes(file.type)) continue;

        let signedUrl: string;
        let imageId: number;
        try {
          const urlRes = await axios.post(
            '/api/images/upload-url',
            { vin_folder_id: folderId, filename: file.name, content_type: file.type },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          signedUrl = urlRes.data.signedUrl;
          imageId = urlRes.data.imageId;
        } catch (err: any) {
          const msg = err.response?.data?.error;
          throw new Error(`Step 1 (get upload URL): ${typeof msg === 'string' ? msg : err.message}`);
        }

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.text().catch(() => '');
          throw new Error(`Step 2 (Supabase upload) HTTP ${uploadRes.status}: ${body}`);
        }

        try {
          await axios.post(
            '/api/images/process',
            { image_id: imageId },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (err: any) {
          const msg = err.response?.data?.error;
          throw new Error(`Step 3 (start processing): ${typeof msg === 'string' ? msg : err.message}`);
        }

        done++;
        setUploadProgress({ current: done, total });
      }

      input.value = '';
      await loadImages();
    } catch (err: any) {
      const msg = err.response?.data?.error ?? err.message;
      setError(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDownloadAll = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setDownloadingAll(true);
    try {
      const res = await axios.get(`/api/vin-folders/${folderId}/download-urls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { vinName, items } = res.data as { vinName: string; items: { id: number; filename: string; url: string }[] };
      if (items.length === 0) return;

      const zip = new JSZip();
      await Promise.all(
        items.map(async (item) => {
          const blob = await fetch(item.url).then((r) => r.blob());
          zip.file(item.filename, blob);
        })
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${vinName}-edited.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Download failed');
    } finally {
      setDownloadingAll(false);
    }
  };

  const downloadImage = async (imageId: number, filename: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get(`/api/images/${imageId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `edited_${filename}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      console.error('Download failed');
    }
  };

  const openPostBuilder = (post?: SocialPost) => {
    const editedImages = images.filter((img) => img.status === 'done');
    setHeroImageId(post?.hero_image_id ?? editedImages[0]?.id ?? null);
    setCaptionDraft(post?.caption ?? socialStatus?.caption_template ?? '');
    setScheduledAt('');
    setPostMsg('');
    setShowPostBuilder(true);
  };

  const handleSubmitPost = async () => {
    const token = localStorage.getItem('token');
    if (!token || !heroImageId) return;
    setPosting(true);
    setPostMsg('');
    try {
      await axios.post(
        '/api/social/post',
        {
          vin_folder_id: Number(folderId),
          hero_image_id: heroImageId,
          caption: captionDraft,
          scheduled_at: scheduledAt || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowPostBuilder(false);
      setPostMsg('Post scheduled successfully.');
      await loadSocialStatus();
    } catch (err: any) {
      setPostMsg(err.response?.data?.error || 'Post failed');
    } finally {
      setPosting(false);
    }
  };

  const handleRetry = async (postId: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setRetryingId(postId);
    try {
      await axios.post(`/api/social/posts/${postId}/retry`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadSocialStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const editedImages = images.filter((img) => img.status === 'done');
  const processingCount = images.filter((img) => img.status === 'queued' || img.status === 'processing').length;
  const draftPosts = socialPosts.filter((p) => p.status === 'draft');

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <button onClick={() => router.push('/dashboard')} className="hover:text-blue-600">
              Dashboard
            </button>
            <span>/</span>
            <button
              onClick={() => setView('folders')}
              className={view === 'folders' ? 'text-gray-900 font-semibold' : 'hover:text-blue-600'}
            >
              VIN Folder
            </button>
            {view !== 'folders' && (
              <>
                <span>/</span>
                <span className="text-gray-900 font-semibold">{view}</span>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              {view === 'folders' ? (listing?.vin_name ?? 'VIN Folder') : view === 'raw' ? 'Raw Images' : 'Edited Images'}
            </h1>
            {/* Review & Post badge */}
            {draftPosts.length > 0 && view !== 'raw' && (
              <button
                onClick={() => { setView('edited'); openPostBuilder(draftPosts[0]); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition animate-pulse"
              >
                Review & Post ({draftPosts.length})
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}

        {/* ── Folders view ──────────────────────────────────────────────── */}
        {view === 'folders' && (
          <>
            {/* Upload */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Images</h2>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png"
                onChange={handleFileUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                  file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              {uploading && (
                <p className="text-sm text-blue-600 mt-2">
                  {uploadProgress
                    ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                    : 'Uploading…'}
                </p>
              )}
              {processingCount > 0 && (
                <p className="text-sm text-amber-600 mt-2">
                  {processingCount} image{processingCount > 1 ? 's' : ''} processing…
                </p>
              )}
            </div>

            {/* Listing details panel */}
            <div className="bg-white rounded-lg shadow mb-6">
              <button
                onClick={() => setShowListingPanel((v) => !v)}
                className="w-full flex items-center justify-between p-6 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Listing Details</p>
                    <p className="text-sm text-gray-500">
                      {listing?.complete
                        ? '✓ Complete — posting enabled'
                        : 'Fill in price, condition, and VIN info to enable social posting'}
                    </p>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">{showListingPanel ? '▲' : '▼'}</span>
              </button>

              {showListingPanel && (
                <div className="border-t border-gray-100 p-6">
                  {listingMsg && (
                    <div className={`p-3 rounded-lg mb-4 text-sm ${listingMsg.includes('failed') || listingMsg.includes('error') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {listingMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                      <input
                        type="number"
                        value={listingDraft.price ?? ''}
                        onChange={(e) => setListingDraft((d) => ({ ...d, price: e.target.value ? Number(e.target.value) : null }))}
                        placeholder="8500"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                      <select
                        value={listingDraft.condition ?? ''}
                        onChange={(e) => setListingDraft((d) => ({ ...d, condition: e.target.value || null }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select…</option>
                        <option value="new">New</option>
                        <option value="used">Used</option>
                        <option value="certified">Certified Pre-Owned</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={listingDraft.description ?? ''}
                      onChange={(e) => setListingDraft((d) => ({ ...d, description: e.target.value || null }))}
                      rows={3}
                      placeholder="Low miles, well maintained, one owner…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* VIN details — auto-filled + editable */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Vehicle Info (from VIN)</label>
                      <button
                        onClick={handleDecodeVin}
                        disabled={decodingVin}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        {decodingVin ? 'Decoding…' : '↻ Decode VIN'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {(['year', 'make', 'model', 'engine', 'fuel_type'] as const).map((field) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-500 mb-1 capitalize">{field.replace('_', ' ')}</label>
                          <input
                            type="text"
                            value={vinDetails[field] ?? ''}
                            onChange={(e) => setVinDetails((d) => ({ ...d, [field]: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveListing}
                    disabled={savingListing}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    {savingListing ? 'Saving…' : 'Save Listing Details'}
                  </button>
                </div>
              )}
            </div>

            {/* Subfolders */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Folders</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setView('raw')}
                className="bg-white rounded-lg shadow p-6 text-left hover:shadow-lg transition flex items-center gap-4"
              >
                <div className="text-4xl">📁</div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">raw</p>
                  <p className="text-sm text-gray-500">{images.length} image{images.length !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400 mt-1">Original uploaded files</p>
                </div>
              </button>

              <button
                onClick={() => setView('edited')}
                className="bg-white rounded-lg shadow p-6 text-left hover:shadow-lg transition flex items-center gap-4"
              >
                <div className="text-4xl">📁</div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">edited</p>
                  <p className="text-sm text-gray-500">{editedImages.length} image{editedImages.length !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400 mt-1">Background-replaced with logo</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Raw folder ────────────────────────────────────────────────── */}
        {view === 'raw' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">{images.length} file{images.length !== 1 ? 's' : ''}</p>
            {images.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">No images uploaded yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map((image) => (
                  <div key={image.id} className="bg-white rounded-lg shadow overflow-hidden">
                    <ImagePreview imageId={image.id} type="raw" />
                    <div className="p-4">
                      <p className="font-mono text-sm text-gray-700 truncate mb-1">{image.original_filename}</p>
                      <p className="text-xs text-gray-400 mb-2">
                        Uploaded: {new Date(image.created_at).toLocaleDateString()}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        image.status === 'done' ? 'bg-green-50 text-green-700' :
                        image.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                        image.status === 'failed' ? 'bg-red-50 text-red-700' :
                        'bg-gray-50 text-gray-700'
                      }`}>
                        {image.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Edited folder ─────────────────────────────────────────────── */}
        {view === 'edited' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{editedImages.length} file{editedImages.length !== 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                {socialStatus?.addon_enabled && listing?.complete && (
                  <button
                    onClick={() => openPostBuilder()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Create Post
                  </button>
                )}
                {editedImages.length > 1 && (
                  <button
                    onClick={handleDownloadAll}
                    disabled={downloadingAll}
                    className="bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    {downloadingAll ? 'Preparing ZIP…' : `Download All (${editedImages.length})`}
                  </button>
                )}
              </div>
            </div>

            {editedImages.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                No edited images yet. Upload images and wait for processing to complete.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {editedImages.map((image) => (
                  <div key={image.id} className="bg-white rounded-lg shadow overflow-hidden">
                    <ImagePreview imageId={image.id} type="edited" />
                    <div className="p-4">
                      <p className="font-mono text-sm text-gray-700 truncate mb-1">edited_{image.original_filename}</p>
                      <p className="text-xs text-gray-400 mb-3">
                        Processed: {image.processed_at ? new Date(image.processed_at).toLocaleDateString() : '—'}
                      </p>
                      <button
                        onClick={() => downloadImage(image.id, image.original_filename)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Post history */}
            {socialStatus?.addon_enabled && socialPosts.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Post History</h3>
                {postMsg && <p className="text-sm text-green-700 bg-green-50 p-2 rounded mb-3">{postMsg}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-2 pr-4">Platform</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Scheduled / Posted</th>
                        <th className="pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {socialPosts.map((post) => (
                        <tr key={post.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-4">
                            <span className="text-lg">📘</span> {post.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              post.status === 'posted'    ? 'bg-green-50 text-green-700' :
                              post.status === 'scheduled' ? 'bg-blue-50 text-blue-700' :
                              post.status === 'draft'     ? 'bg-gray-100 text-gray-600' :
                              'bg-red-50 text-red-700'
                            }`}>
                              {post.status === 'draft' ? 'Draft' :
                               post.status === 'scheduled' ? 'Scheduled' :
                               post.status === 'posted' ? 'Posted' : 'Failed'}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-500 text-xs">
                            {post.posted_at
                              ? new Date(post.posted_at).toLocaleString()
                              : post.scheduled_at
                              ? new Date(post.scheduled_at).toLocaleString()
                              : '—'}
                          </td>
                          <td className="py-2">
                            {post.status === 'posted' && post.platform_post_url && (
                              <a href={post.platform_post_url} target="_blank" rel="noreferrer"
                                className="text-blue-600 hover:underline text-xs">View post</a>
                            )}
                            {post.status === 'draft' && (
                              <button
                                onClick={() => openPostBuilder(post)}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                Review & Post
                              </button>
                            )}
                            {post.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(post.id)}
                                disabled={retryingId === post.id}
                                className="text-orange-600 hover:underline text-xs disabled:opacity-50"
                              >
                                {retryingId === post.id ? 'Retrying…' : 'Retry'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Post Builder modal ─────────────────────────────────────────── */}
      {showPostBuilder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Post to Facebook — {listing?.vin_name}
              </h2>
              <button onClick={() => setShowPostBuilder(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {postMsg && (
                <div className={`p-3 rounded-lg text-sm ${postMsg.includes('failed') || postMsg.includes('error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {postMsg}
                </div>
              )}

              {/* Hero image selection */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Hero Image</p>
                <div className="grid grid-cols-4 gap-2">
                  {editedImages.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setHeroImageId(img.id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition ${
                        heroImageId === img.id ? 'border-blue-500' : 'border-transparent'
                      }`}
                    >
                      <ImagePreview imageId={img.id} type="edited" />
                      {heroImageId === img.id && (
                        <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Caption</label>
                  <span className="text-xs text-gray-400">{captionDraft.length} / 2,200</span>
                </div>
                <textarea
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  rows={7}
                  maxLength={2200}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* First comment */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">First Comment (listing URL)</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono break-all">
                  {firstCommentPreview || <span className="text-gray-400 italic">No VIN search URL template set (configure in Social Settings)</span>}
                </div>
              </div>

              {/* Schedule */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Schedule (optional)</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank to post immediately.</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100">
              {!socialStatus?.fb_connected && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  Facebook Page not connected. Go to <a href="/dashboard" className="underline font-medium">Social Settings in Dashboard</a> to connect before posting.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPostBuilder(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPost}
                  disabled={posting || !heroImageId || !socialStatus?.fb_connected}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-semibold transition"
                >
                  {posting ? 'Posting…' : scheduledAt ? 'Schedule Post' : 'Post Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
