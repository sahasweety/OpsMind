import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Server, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Layers, 
  RefreshCw
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import api from '../api/client';
import { getSocket } from '../api/socket';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

export default function Dashboard() {
  const { activeOrg, activeOrgId, organizations } = useOrg();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentIncidents, setRecentIncidents] = useState([]);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [sumRes, incRes] = await Promise.all([
        api.get('/dashboard/summary'),
        activeOrgId 
          ? api.get(`/incidents?organizationId=${activeOrgId}&page=1&limit=5`).catch(() => ({ data: { incidents: [] } }))
          : Promise.resolve({ data: { incidents: [] } })
      ]);
      setSummary(sumRes.data.summary);
      setRecentIncidents(incRes.data.incidents || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load telemetry summary');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Real-time incident updates
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const onNewInc = (inc) => {
        setRecentIncidents(prev => [inc, ...prev.slice(0, 4)]);
      };
      socket.on('new_incident', onNewInc);
      return () => {
        socket.off('new_incident', onNewInc);
      };
    }
  }, []);

  const envData = summary?.environmentCounts ? [
    { name: 'Production', count: summary.environmentCounts.production || 0, color: '#f97316' },
    { name: 'Staging', count: summary.environmentCounts.staging || 0, color: '#a855f7' },
    { name: 'Development', count: summary.environmentCounts.development || 0, color: '#38bdf8' }
  ] : [];

  const statusData = summary?.statusCounts ? [
    { name: 'Healthy', count: summary.statusCounts.healthy || 0, color: '#10b981' },
    { name: 'Degraded', count: summary.statusCounts.degraded || 0, color: '#f59e0b' },
    { name: 'Down', count: summary.statusCounts.down || 0, color: '#ef4444' },
    { name: 'Unknown', count: summary.statusCounts.unknown || 0, color: '#64748b' }
  ] : [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>Environment:</span>
              <span className="font-semibold text-sky-400">{activeOrg ? activeOrg.name : 'All Workspaces'}</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Operational Overview</h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time cross-service health, attention items, and active incident telemetry
            </p>
          </div>

          <button
            onClick={fetchSummary}
            className="self-start sm:self-auto px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchSummary} className="underline font-semibold ml-4">Retry</button>
          </div>
        )}

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Total Services</span>
              <Server className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">
              {loading ? '—' : summary?.totalServices || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Monitored runtime endpoints</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Healthy Services</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">
              {loading ? '—' : summary?.statusCounts?.healthy || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Operating within latency threshold</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Attention Required</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">
              {loading ? '—' : summary?.attentionRequired?.length || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Degraded or down services</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Active Organizations</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">
              {organizations.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Multi-tenant domains</div>
          </div>
        </div>

        {/* Attention Required Services */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Attention Required Services</h2>
            </div>
            <Link to="/services" className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1">
              <span>View all services</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="py-6 text-center text-slate-500 text-xs">Loading status telemetry...</div>
          ) : !summary?.attentionRequired || summary.attentionRequired.length === 0 ? (
            <div className="py-8 text-center bg-slate-900/40 rounded-lg border border-slate-800/80">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
              <p className="text-xs text-slate-300 font-medium">All systems nominal</p>
              <p className="text-[11px] text-slate-500 mt-0.5">No services currently reporting degraded or down status</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {summary.attentionRequired.map(svc => (
                <div 
                  key={svc._id}
                  className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-white text-sm">{svc.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {svc.organization?.name} / {svc.project?.name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Heartbeat: {svc.lastHeartbeatAt ? new Date(svc.lastHeartbeatAt).toLocaleTimeString() : 'Never ingested'}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                      svc.status === 'down' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {svc.status}
                    </span>
                    <div className="mt-2">
                      <Link 
                        to={`/logs?serviceId=${svc._id}`} 
                        className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                      >
                        Inspect logs →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Charts & Recent Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Breakdown Chart */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">Service Health Distribution</h2>
              <p className="text-xs text-slate-400 mb-4">Active operational statuses across user projects</p>
            </div>

            <div className="h-48 w-full flex items-center justify-center">
              {loading ? (
                <div className="text-slate-500 text-xs">Loading chart...</div>
              ) : statusData.every(d => d.count === 0) ? (
                <div className="text-slate-600 text-xs">No service data registered</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#F8FAFC' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Environment Breakdown Chart */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">Environment Breakdown</h2>
              <p className="text-xs text-slate-400 mb-4">Services distributed by lifecycle tier</p>
            </div>

            <div className="h-48 w-full flex items-center justify-center">
              {loading ? (
                <div className="text-slate-500 text-xs">Loading chart...</div>
              ) : envData.every(d => d.count === 0) ? (
                <div className="text-slate-600 text-xs">No environment telemetry</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={envData} layout="vertical">
                    <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#F8FAFC' }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {envData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent Active Incidents */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-white">Recent Incidents</h2>
                <Link to="/incidents" className="text-[11px] text-sky-400 hover:text-sky-300 font-medium">
                  View all →
                </Link>
              </div>
              <p className="text-xs text-slate-400 mb-4">Latest detected failures in active organization</p>
            </div>

            <div className="space-y-2 flex-1">
              {recentIncidents.length === 0 ? (
                <div className="py-10 text-center text-slate-600 text-xs">
                  No active incidents recorded for this workspace.
                </div>
              ) : (
                recentIncidents.slice(0, 4).map(inc => (
                  <Link
                    key={inc._id}
                    to={`/incidents?id=${inc._id}`}
                    className="block p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-slate-200 truncate">{inc.title}</div>
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        inc.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {inc.severity}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                      <span>{inc.service?.name || inc.source}</span>
                      <span>{new Date(inc.lastSeenAt || inc.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
