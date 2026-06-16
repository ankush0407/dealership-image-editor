'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';

interface Image {
  id: number;
  original_filename: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  created_at: string;
  processed_at?: string;
  error_message?: string;
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
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('folders');

  useEffect(() => {
    loadImages();
    const interval = setInterval(loadImages, 3000);
    return () => clearInterval(interval);
  }, [folderId]);

  const loadImages = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      const response = await axios.get(`/api/vin-folders/${folderId}/images`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) setImages(response.data.images);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Grab input reference immediately — React nullifies currentTarget after the handler yields
    const input = e.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) return;

    setError('');
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!['image/jpeg', 'image/png'].includes(file.type)) continue;

        // Step 1: get a Supabase signed upload URL (tiny JSON — no file sent to Vercel)
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

        // Step 2: PUT the file directly to Supabase (bypasses Vercel — no size limit)
        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.text().catch(() => '');
          throw new Error(`Step 2 (Supabase upload) HTTP ${uploadRes.status}: ${body}`);
        }

        // Step 3: tell our API to kick off Gemini processing
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
      }

      input.value = '';
      await loadImages();
    } catch (err: any) {
      const msg = err.response?.data?.error ?? err.message;
      setError(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setUploading(false);
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
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const editedImages = images.filter((img) => img.status === 'done');
  const processingCount = images.filter((img) => img.status === 'queued' || img.status === 'processing').length;

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
          <h1 className="text-2xl font-bold text-gray-900">
            {view === 'folders' ? 'VIN Folder' : view === 'raw' ? 'Raw Images' : 'Edited Images'}
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Folder list */}
        {view === 'folders' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-8">
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
              {uploading && <p className="text-sm text-blue-600 mt-2">Uploading...</p>}
              {processingCount > 0 && (
                <p className="text-sm text-amber-600 mt-2">
                  {processingCount} image{processingCount > 1 ? 's' : ''} processing…
                </p>
              )}
            </div>

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

        {/* Raw folder */}
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

        {/* Edited folder */}
        {view === 'edited' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">{editedImages.length} file{editedImages.length !== 1 ? 's' : ''}</p>
            {editedImages.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                No edited images yet. Upload images and wait for processing to complete.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          </div>
        )}
      </main>
    </div>
  );
}
