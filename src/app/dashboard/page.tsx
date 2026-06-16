'use client';

import { useEffect, useState } from 'react';
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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<VINFolder[]>([]);
  const [newVIN, setNewVIN] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Fetch live user data so credits are always up to date
    axios
      .get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data.success) {
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        router.push('/login');
      });

    loadFolders(token);
  }, [router]);

  const loadFolders = async (token: string) => {
    try {
      const response = await axios.get('/api/vin-folders/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setFolders(response.data.folders);
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  const handleCreateVIN = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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
        {/* Create VIN Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Create New VIN Folder</h2>
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">
              {error}
            </div>
          )}
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

        {/* VIN Folders List */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your VIN Folders</h2>
          {folders.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600">No VIN folders yet. Create one to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer"
                  onClick={() => router.push(`/folder/${folder.id}`)}
                >
                  <h3 className="text-lg font-semibold text-gray-900">{folder.vin_name}</h3>
                  <p className="text-sm text-gray-600 mt-2">
                    Images: {folder.total_images} | Processed: {folder.processed_images}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Created: {new Date(folder.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
