import React, { useState, useEffect } from 'react';
import api from '../api/client';

function LogPanel({ service, onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [level, setLevel] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');
      const query = `/services/${service._id}/logs?page=${page}&limit=50${level ? `&level=${level}` : ''}`;
      const res = await api.get(query);
      setLogs(res.data.logs);
      setTotalPages(res.data.pagination.pages);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [service._id, page, level]);

  const levelColors = {
    info: 'text-blue-600',
    debug: 'text-gray-500',
    warn: 'text-yellow-600',
    error: 'text-red-600',
    fatal: 'text-red-800 font-bold'
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline text-sm">
        ← Back to {service.name}
      </button>
      <h2 className="text-xl font-semibold mb-1">Logs: {service.name}</h2>

      <div className="flex gap-2 mb-4">
        <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} className="border p-1 text-sm rounded">
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="fatal">Fatal</option>
        </select>
        <button onClick={() => fetchLogs()} className="border px-3 py-1 rounded text-sm hover:bg-gray-100">Refresh</button>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading logs...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="bg-gray-900 text-gray-100 rounded p-4 text-xs font-mono overflow-auto h-96">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-10">No logs found.</div>
          ) : (
            logs.map(log => (
              <div key={log._id} className="border-b border-gray-800 py-1">
                <span className="text-gray-500 mr-3">{new Date(log.timestamp).toISOString()}</span>
                <span className={`mr-3 uppercase w-12 inline-block ${levelColors[log.level] || 'text-gray-400'}`}>[{log.level}]</span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-4">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Previous</button>
        <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

export default LogPanel;
