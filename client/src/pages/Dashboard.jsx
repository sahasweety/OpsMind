import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/client';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/dashboard/summary');
      setSummary(res.data.summary);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      } else {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-700">OpsMind Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
          </div>
          <div className="flex gap-4 items-center">
            <button onClick={() => navigate('/organizations')} className="text-blue-600 hover:underline">
              Manage Organizations
            </button>
            <button onClick={() => navigate('/github')} className="text-blue-600 hover:underline">
              GitHub CI/CD
            </button>
            <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">
              Logout
            </button>
          </div>
        </div>

        {loading && <div className="text-gray-500">Loading dashboard...</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded mb-6">
            {error}
            <button onClick={fetchSummary} className="ml-4 underline">Retry</button>
          </div>
        )}

        {!loading && !error && summary && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-4 rounded shadow text-center">
                <div className="text-sm text-gray-500 mb-1">Total Services</div>
                <div className="text-3xl font-bold">{summary.totalServices}</div>
              </div>
              <div className="bg-white p-4 rounded shadow text-center">
                <div className="text-sm text-gray-500 mb-1">Production</div>
                <div className="text-3xl font-bold text-orange-600">{summary.environmentCounts?.production || 0}</div>
              </div>
              <div className="bg-white p-4 rounded shadow text-center">
                <div className="text-sm text-gray-500 mb-1">Healthy</div>
                <div className="text-3xl font-bold text-green-600">{summary.statusCounts?.healthy || 0}</div>
              </div>
              <div className="bg-white p-4 rounded shadow text-center">
                <div className="text-sm text-gray-500 mb-1">Down</div>
                <div className="text-3xl font-bold text-red-600">{summary.statusCounts?.down || 0}</div>
              </div>
            </div>

            {/* Attention Required */}
            <div className="bg-white rounded shadow p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4 text-red-700 border-b pb-2">Attention Required</h2>
              {summary.attentionRequired.length === 0 ? (
                <div className="text-gray-500 text-center py-4">No services currently reporting degraded or down status.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {summary.attentionRequired.map(svc => (
                    <div key={svc._id} className="border border-red-200 bg-red-50 p-4 rounded flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-lg">{svc.name}</div>
                        <div className="text-sm text-gray-600">
                          {svc.organization?.name} / {svc.project?.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Last heartbeat: {svc.lastHeartbeatAt ? new Date(svc.lastHeartbeatAt).toLocaleString() : 'Never'}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${svc.status === 'down' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
                          {svc.status.toUpperCase()}
                        </span>
                        <div className="text-sm">
                          <button onClick={() => navigate('/organizations')} className="text-blue-600 hover:underline">
                            Investigate →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {summary.totalServices === 0 && (
              <div className="text-center bg-blue-50 p-6 rounded border border-blue-100">
                <p className="mb-4">You don't have any services registered yet.</p>
                <button onClick={() => navigate('/organizations')} className="bg-blue-600 text-white px-4 py-2 rounded">
                  Go to Organizations to get started
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
