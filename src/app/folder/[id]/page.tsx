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

interface Logo {
  url: string;
  path: string;
}

type View = 'folders' | 'raw' | 'edited' | 'logo';

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

  // Logo state
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    loadImages();
    loadLogo();
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

      if (response.data.success) {
        setImages(response.data.images);
      }
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogo = async () => {
    try {
      setLogoLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get('/api/user/logo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLogo(response.data.logo);
    } catch (err) {
      console.error('Failed to load logo:', err);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    setError('');
    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      const formData = new FormData();
      formData.append('vin_folder_id', folderId);
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const response = await axios.post('/api/images/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        e.currentTarget.value = '';
        await loadImages();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setLogoError('');
    setLogoUploading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const formData = new FormData();
      formData.append('logo', file);

      const response = await axios.post('/api/user/logo', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setLogo(response.data.logo);
        e.currentTarget.value = '';
      }
    } catch (err: any) {
      setLogoError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Remove the logo? Future processed images will not have a logo.')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      await axios.delete('/api/user/logo', { headers: { Authorization: `Bearer ${token}` } });
      setLogo(null);
    } catch (err) {
      console.error('Failed to delete logo:', err);
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
            {view === 'folders' ? 'VIN Folder' :
             view === 'raw' ? 'Raw Images' :
             view === 'edited' ? 'Edited Images' :
             'Logo'}
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Folder list view */}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <button
                onClick={() => setView('logo')}
                className="bg-white rounded-lg shadow p-6 text-left hover:shadow-lg transition flex items-center gap-4"
              >
                <div className="text-4xl">🏷️</div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">logo</p>
                  <p className="text-sm text-gray-500">{logo ? '1 logo set' : 'No logo'}</p>
                  <p className="text-xs text-gray-400 mt-1">Overlaid on edited images</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Raw folder view */}
        {view === 'raw' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {images.length} file{images.length !== 1 ? 's' : ''}
            </p>
            {images.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                No images uploaded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map((image) => (
                  <div key={image.id} className="bg-white rounded-lg shadow overflow-hidden">
                    <ImagePreview imageId={image.id} type="raw" />
                    <div className="p-4">
                      <p className="font-mono text-sm text-gray-700 truncate mb-1">
                        {image.original_filename}
                      </p>
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

        {/* Edited folder view */}
        {view === 'edited' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {editedImages.length} file{editedImages.length !== 1 ? 's' : ''}
            </p>
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
                      <p className="font-mono text-sm text-gray-700 truncate mb-1">
                        edited_{image.original_filename}
                      </p>
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

        {/* Logo folder view */}
        {view === 'logo' && (
          <div className="max-w-lg">
            {logoError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{logoError}</div>
            )}

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Dealership Logo</h2>
              <p className="text-sm text-gray-500 mb-6">
                This logo is placed in the top-left corner of every edited image. Uploading a new logo replaces the existing one. Only images processed after uploading the logo will have it applied.
              </p>

              {logoLoading ? (
                <div className="w-full h-40 bg-gray-100 animate-pulse rounded-lg mb-6" />
              ) : logo ? (
                <div className="mb-6">
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-3 flex items-center justify-center" style={{ minHeight: '10rem' }}>
                    <img
                      src={logo.url}
                      alt="Current logo"
                      className="max-h-36 max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center mb-3">Current logo</p>
                  <button
                    onClick={handleLogoDelete}
                    className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Remove Logo
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex items-center justify-center text-gray-400 text-sm mb-6">
                  No logo uploaded yet
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {logo ? 'Replace Logo' : 'Upload Logo'}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                    file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                {logoUploading && <p className="text-sm text-blue-600 mt-2">Uploading logo…</p>}
                <p className="text-xs text-gray-400 mt-2">Accepted: JPEG, PNG, WebP, SVG. PNG with transparency works best.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
