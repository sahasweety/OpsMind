import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  RefreshCw, 
  Filter, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Server,
  Layers,
  Clock,
  Terminal
} from 'lucide-react';
import api from '../api/client';
import { getSocket } from '../api/socket';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

const LOG_LEVELS = ['', 'info', 'warn', 'error', 'fatal', 'debug'];

export default function LogsExplorer() {
  const { activeOrg, activeOrgId } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();

  const serviceIdParam = searchParams.get('serviceId') || '';

  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceIdParam);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtering & Pagination
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 50 });
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load available services for dropdown selection
  const fetchServices = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const projRes = await api.get(`/projects?organizationId=${activeOrgId}`);
      const projects = projRes.data.projects || [];
      const servicePromises = projects.map(p => 
        api.get(`/services?projectId=${p._id}`)
          .then(r => (r.data.services || []).map(s => ({ ...s, projectName: p.name })))
          .catch(() => [])
      );
      const results = await Promise.all(servicePromises);
      const allServices = results.flat();
      setServices(allServices);

      if (!selectedServiceId && allServices.length > 0) {
        setSelectedServiceId(allServices[0]._id);
      }
    } catch (err) {
      console.error('Failed to load services for logs view:', err);
    }
  }, [activeOrgId, selectedServiceId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Sync state with URL parameter if it changes
  useEffect(() => {
    if (serviceIdParam && serviceIdParam !== selectedServiceId) {
      setSelectedServiceId(serviceIdParam);
    }
  }, [serviceIdParam, selectedServiceId]);

  const fetchLogs = useCallback(async (targetPage = page) => {
    if (!selectedServiceId) {
      setLogs([]);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const query = `/services/${selectedServiceId}/logs?page=${targetPage}&limit=50${level ? `&level=${level}` : ''}`;
      const res = await api.get(query);
      setLogs(res.data.logs || []);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [selectedServiceId, page, level]);

  useEffect(() => {
    fetchLogs(page);
  }, [fetchLogs, page]);

  // Socket.IO live ingestion streaming
  useEffect(() => {
    const socket = getSocket();
    if (socket && autoRefresh) {
      const onNewLog = (logEntry) => {
        if (logEntry.service === selectedServiceId || logEntry.service?._id === selectedServiceId) {
          if (!level || logEntry.level === level) {
            setLogs(prev => [logEntry, ...prev.slice(0, 99)]);
            setPagination(prev => ({ ...prev, total: prev.total + 1 }));
          }
        }
      };
      socket.on('new_log', onNewLog);
      return () => {
        socket.off('new_log', onNewLog);
      };
    }
  }, [selectedServiceId, autoRefresh, level]);

  const levelBadge = (lvl) => {
    switch (lvl) {
      case 'fatal':
        return 'bg-red-500/20 text-red-300 border-red-500/40 font-bold';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'warn':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'info':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'debug':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const selectedService = services.find(s => s._id === selectedServiceId);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>Organization:</span>
              <span className="font-semibold text-sky-400">{activeOrg?.name}</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Logs Explorer</h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time ingestion telemetry and historical service log records
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition ${
                autoRefresh 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>{autoRefresh ? 'Live Streaming' : 'Stream Paused'}</span>
            </button>

            <button
              onClick={() => fetchLogs(page)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-400" />
              <select
                value={selectedServiceId}
                onChange={e => {
                  setSelectedServiceId(e.target.value);
                  setSearchParams({ serviceId: e.target.value });
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
              >
                <option value="">Select Service</option>
                {services.map(s => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.projectName} · {s.environment})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={level}
                onChange={e => {
                  setLevel(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
              >
                <option value="">All Log Levels</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
                <option value="fatal">FATAL</option>
                <option value="debug">DEBUG</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            {selectedService ? (
              <span>Target: <strong className="text-slate-200">{selectedService.name}</strong> ({selectedService.environment})</span>
            ) : (
              <span>Select a service to stream logs</span>
            )}
          </div>
        </div>

        {/* Terminal Log Console */}
        <div className="bg-[#0D1117] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
          <div className="bg-[#161B22] px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 font-mono">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>console.out · {selectedService ? selectedService.name : 'no service'}</span>
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              Showing {logs.length} of {pagination.total} records
            </div>
          </div>

          <div className="p-4 font-mono text-xs overflow-x-auto min-h-[380px] max-h-[560px] overflow-y-auto space-y-1.5">
            {loading && logs.length === 0 ? (
              <div className="text-center py-20 text-slate-500">Loading log records...</div>
            ) : error ? (
              <div className="text-center py-20 text-red-400">{error}</div>
            ) : !selectedServiceId ? (
              <div className="text-center py-20 text-slate-600">Please choose a service from the dropdown above.</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-20 text-slate-600">
                <p>No log records match the current filters.</p>
                <p className="text-[11px] mt-1 text-slate-700">Use the simulator on port 5001 or push logs to /api/ingest/:serviceId/logs.</p>
              </div>
            ) : (
              logs.map(log => (
                <div key={log._id} className="flex items-start gap-3 py-1 px-2 rounded hover:bg-slate-800/40 transition">
                  <span className="text-slate-500 text-[11px] shrink-0 select-none">
                    {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 border ${levelBadge(log.level)}`}>
                    {log.level}
                  </span>
                  <span className="text-slate-200 break-all flex-1">
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls Footer */}
          {pagination.pages > 1 && (
            <div className="bg-[#161B22] px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Page <strong className="text-white">{pagination.page}</strong> of <strong className="text-white">{pagination.pages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 transition flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 transition flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
