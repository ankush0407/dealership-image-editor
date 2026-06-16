'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface User {
  id: number;
  email: string;
  plan: string;
  credits_remaining: number;
}

interface VINFolder {
  id: number;
  vin_name: string;
  total_images: number;
  processed_images: number;
  created_at: string;
}

interface Logo {
  url: string;
  path: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<VINFolder[]>([]);
  const [newVIN, setNewVIN] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Logo state
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [showLogoPanel, setShowLogoPanel] = useState(false);
  const [applyingLogo, setApplyingLogo] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    axios
      .get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data.success) {
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
      })
      .catch(() => router.push('/login'));

    loadFolders(token);
    loadLogo(token);
  }, [router]);

  const loadFolders = async (token: string) => {
    try {
      const response = await axios.get('/api/vin-folders/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) setFolders(response.data.folders);
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  const loadLogo = async (token: string) => {
    try {
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

  const handleCreateVIN = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      const response = await axios.post(
        '/api/vin-folders/create',
        { vin_name: newVIN },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setNewVIN('');
        await loadFolders(token);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create VIN folder');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
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
        input.value = '';
      }
    } catch (err: any) {
      setLogoError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleApplyToExisting = async () => {
    setApplyMessage('');
    setApplyingLogo(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.post('/api/user/logo/apply-existing', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApplyMessage(response.data.message);
    } catch (err: any) {
      setApplyMessage(err.response?.data?.error || 'Failed to apply logo');
    } finally {
      setApplyingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Remove the logo? Future processed images will not have a logo.')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      await axios.delete('/api/user/logo', { headers: { Authorization: `Bearer ${token}` } });
      setLogo(null);
    } catch {
      console.error('Failed to delete logo');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Dealership Image Editor</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <p className="text-gray-700 font-semibold">{user.email}</p>
              <p className="text-blue-600">
                Credits: <span className="font-bold">{user.credits_remaining}</span>
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create VIN */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Create New VIN Folder</h2>
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
          <form onSubmit={handleCreateVIN} className="flex gap-4">
            <input
              type="text"
              value={newVIN}
              onChange={(e) => setNewVIN(e.target.value)}
              placeholder="Enter VIN number"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              {loading ? 'Creating...' : 'Create VIN'}
            </button>
          </form>
        </div>

        {/* Folders + Logo grid */}
        <h2 className="text-xl font-bold text-gray-900 mb-4">Folders</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Logo folder card — always first */}
          <div
            onClick={() => setShowLogoPanel((v) => !v)}
            className={`bg-white rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition flex items-center gap-4 ${
              showLogoPanel ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="text-4xl">
              {logoLoading ? '⏳' : logo ? '🏷️' : '🏷️'}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900">logo</p>
              <p className="text-sm text-gray-500 truncate">
                {logoLoading ? 'Loading…' : logo ? 'Logo set — click to manage' : 'No logo — click to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Applied to all edited images</p>
            </div>
          </div>

          {/* VIN folder cards */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer flex items-center gap-4"
              onClick={() => router.push(`/folder/${folder.id}`)}
            >
              <div className="text-4xl">📁</div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">{folder.vin_name}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {folder.total_images} image{folder.total_images !== 1 ? 's' : ''} · {folder.processed_images} processed
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Created: {new Date(folder.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}

          {folders.length === 0 && !showLogoPanel && (
            <div className="md:col-span-2 lg:col-span-2 bg-white rounded-lg shadow p-6 text-center text-gray-500">
              No VIN folders yet. Create one to get started!
            </div>
          )}
        </div>

        {/* Logo management panel — inline below the grid */}
        {showLogoPanel && (
          <div className="bg-white rounded-lg shadow p-6 max-w-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Dealership Logo</h3>
            <p className="text-sm text-gray-500 mb-5">
              This logo is placed in the top-left corner of every edited image across all VIN folders.
              Only images processed after uploading the logo will have it applied.
            </p>

            {logoError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{logoError}</div>
            )}

            {logo ? (
              <div className="mb-5">
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-center mb-3" style={{ minHeight: '10rem' }}>
                  <img src={logo.url} alt="Current logo" className="max-h-36 max-w-full object-contain" />
                </div>
                <p className="text-xs text-gray-400 text-center mb-3">Current logo</p>
                <button
                  onClick={handleApplyToExisting}
                  disabled={applyingLogo}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-semibold transition mb-2"
                >
                  {applyingLogo ? 'Applying…' : 'Apply logo to existing edited images'}
                </button>
                {applyMessage && (
                  <p className="text-sm text-gray-600 mb-2">{applyMessage}</p>
                )}
                <button
                  onClick={handleLogoDelete}
                  className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm font-semibold transition"
                >
                  Remove Logo
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex items-center justify-center text-gray-400 text-sm mb-5">
                No logo uploaded yet
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-2">
              {logo ? 'Replace Logo' : 'Upload Logo'}
            </label>
            <input
              ref={logoInputRef}
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
        )}
      </main>
    </div>
  );
}
