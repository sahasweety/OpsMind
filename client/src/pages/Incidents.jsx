import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Filter,
  Check,
  Search,
  Layers,
  Server,
  Activity,
  GitBranch,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import api from '../api/client';
import { getSocket } from '../api/socket';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

const STATUS_FILTERS = ['', 'open', 'acknowledged', 'investigating', 'resolved'];
const SEVERITY_FILTERS = ['', 'critical', 'high', 'medium', 'low'];

export default function Incidents() {
  const { activeOrg, activeOrgId } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedIncidentId = searchParams.get('id') || '';

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtering & Pagination
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  // Detail View
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [investigating, setInvestigating] = useState(false);

  // Load Incident Detail
  const loadIncidentDetail = useCallback(async (id) => {
    try {
      setDetailLoading(true);
      const res = await api.get(`/incidents/${id}`);
      setSelectedIncident(res.data.incident);
      setSearchParams({ id });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load incident detail');
    } finally {
      setDetailLoading(false);
    }
  }, [setSearchParams]);

  // Fetch list of incidents
  const fetchIncidents = useCallback(async (targetPage = page) => {
    if (!activeOrgId) {
      setIncidents([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      let q = `/incidents?organizationId=${activeOrgId}&page=${targetPage}&limit=12`;
      if (statusFilter) q += `&status=${statusFilter}`;
      if (severityFilter) q += `&severity=${severityFilter}`;
      if (sourceFilter) q += `&source=${sourceFilter}`;

      const res = await api.get(q);
      setIncidents(res.data.incidents || []);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, page, statusFilter, severityFilter, sourceFilter]);

  useEffect(() => {
    fetchIncidents(page);
  }, [fetchIncidents, page]);

  useEffect(() => {
    if (selectedIncidentId) {
      loadIncidentDetail(selectedIncidentId);
    } else {
      setSelectedIncident(null);
    }
  }, [selectedIncidentId, loadIncidentDetail]);

  // Real-time socket updates
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const onNewIncident = (newInc) => {
        setIncidents(prev => [newInc, ...prev]);
        setPagination(prev => ({ ...prev, total: prev.total + 1 }));
      };

      const onIncidentUpdated = (updated) => {
        setIncidents(prev => prev.map(item => item._id === updated._id ? { ...item, ...updated } : item));
        setSelectedIncident(curr => curr && curr._id === updated._id ? { ...curr, ...updated } : curr);
      };

      socket.on('new_incident', onNewIncident);
      socket.on('incident_updated', onIncidentUpdated);

      return () => {
        socket.off('new_incident', onNewIncident);
        socket.off('incident_updated', onIncidentUpdated);
      };
    }
  }, []);

  const handleLifecycle = async (action) => {
    if (!selectedIncident) return;
    setActionLoading(true);
    try {
      await api.post(`/incidents/${selectedIncident._id}/${action}`);
      await loadIncidentDetail(selectedIncident._id);
      fetchIncidents(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} incident`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvestigate = async () => {
    if (!selectedIncident) return;
    setInvestigating(true);
    try {
      await api.post(`/incidents/${selectedIncident._id}/investigate`);
      await loadIncidentDetail(selectedIncident._id);
      fetchIncidents(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || 'AI investigation failed');
    } finally {
      setInvestigating(false);
    }
  };

  const severityBadge = (sev) => {
    switch (sev) {
      case 'critical':
        return 'bg-red-500/20 text-red-300 border-red-500/40 font-bold';
      case 'high':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'low':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const statusBadge = (st) => {
    switch (st) {
      case 'open':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
      case 'acknowledged':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'investigating':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'resolved':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

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
            <h1 className="text-2xl font-bold text-white tracking-tight">Incidents & Investigations</h1>
            <p className="text-sm text-slate-400 mt-1">
              Service-health anomalies, CI/CD failures, AI root-cause reports, and lifecycle history
            </p>
          </div>
        </div>

        {/* Selected Incident Detail View */}
        {selectedIncident ? (
          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div>
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium mb-2 flex items-center gap-1"
                >
                  ← Back to Incidents List
                </button>
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  <span>{selectedIncident.title}</span>
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(selectedIncident.status)}`}>
                    {selectedIncident.status.toUpperCase()}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${severityBadge(selectedIncident.severity)}`}>
                    {selectedIncident.severity.toUpperCase()}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span>Source: <strong className="text-slate-300">{selectedIncident.source}</strong></span>
                  {selectedIncident.service && (
                    <span>Service: <strong className="text-slate-300">{selectedIncident.service.name}</strong></span>
                  )}
                  <span>First Seen: {new Date(selectedIncident.firstSeenAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Lifecycle Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedIncident.status === 'open' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleLifecycle('acknowledge')}
                    className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Acknowledge</span>
                  </button>
                )}

                {(selectedIncident.status === 'open' || selectedIncident.status === 'acknowledged' || selectedIncident.status === 'investigating') && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleLifecycle('resolve')}
                    className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Resolve</span>
                  </button>
                )}

                {selectedIncident.status === 'resolved' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleLifecycle('reopen')}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reopen Incident</span>
                  </button>
                )}

                {selectedIncident.source !== 'github_actions' && (
                  <button
                    disabled={investigating}
                    onClick={handleInvestigate}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${investigating ? 'animate-spin' : ''}`} />
                    <span>{investigating ? 'Investigating...' : 'AI Investigate'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* AI Investigation Results Section */}
            {selectedIncident.aiInvestigation?.summary ? (
              <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-800/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-purple-800/30 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold text-white text-sm">GenAI Root-Cause Investigation Report</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 font-mono">
                    Provider: {selectedIncident.aiInvestigation.provider || 'gemini'}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-1">Executive Summary</h4>
                  <p className="text-xs text-slate-300 leading-relaxed bg-purple-900/20 p-3 rounded-lg border border-purple-800/20">
                    {selectedIncident.aiInvestigation.summary}
                  </p>
                </div>

                {selectedIncident.aiInvestigation.hypotheses?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Formulated Hypotheses</h4>
                    <div className="space-y-2">
                      {selectedIncident.aiInvestigation.hypotheses.map((h, i) => (
                        <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-200">{h.rootCause}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              h.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-300' :
                              h.confidence === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {h.confidence} confidence
                            </span>
                          </div>
                          {h.supportingEvidence?.length > 0 && (
                            <div className="mt-2 text-[11px] text-slate-400 font-mono">
                              Evidence references: {h.supportingEvidence.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedIncident.aiInvestigation.recommendedSteps?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Recommended Mitigation Steps</h4>
                    <ol className="list-decimal pl-5 text-xs text-slate-300 space-y-1">
                      {selectedIncident.aiInvestigation.recommendedSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {selectedIncident.aiInvestigation.uncertainties?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-1">Model Uncertainties</h4>
                    <ul className="list-disc pl-5 text-xs text-slate-400 space-y-1">
                      {selectedIncident.aiInvestigation.uncertainties.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : selectedIncident.source === 'github_actions' ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
                <p>This incident originated from GitHub Actions CI/CD workflow failure. Review workflow logs in the GitHub tab.</p>
              </div>
            ) : null}

            {/* Evidence Logs Section */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center justify-between">
                <span>Associated Evidence Logs ({selectedIncident.evidence?.length || 0})</span>
                <span className="text-xs text-slate-500 font-normal">Tumbling window telemetry</span>
              </h3>

              <div className="bg-[#0D1117] border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-60 overflow-y-auto space-y-1.5">
                {selectedIncident.evidence?.length === 0 ? (
                  <div className="text-center py-6 text-slate-600">No log records attached to this incident.</div>
                ) : (
                  selectedIncident.evidence?.map(log => (
                    <div key={log._id} className="flex items-start gap-3 py-1 border-b border-slate-800/60 last:border-none">
                      <span className="text-slate-500 text-[11px] shrink-0">
                        {new Date(log.timestamp).toISOString().substring(11, 19)}
                      </span>
                      <span className="text-red-400 uppercase font-bold shrink-0">[{log.level}]</span>
                      <span className="text-slate-200 break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Audit History Timeline */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Incident Status History & Audit Log</span>
              </h3>

              <div className="border-l-2 border-slate-800 pl-4 space-y-3 my-2">
                {selectedIncident.statusHistory?.map((entry, idx) => (
                  <div key={idx} className="relative text-xs">
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-sky-400 ring-4 ring-[#111827]" />
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white capitalize">{entry.status}</span>
                      <span className="text-slate-500 text-[11px]">{new Date(entry.changedAt).toLocaleString()}</span>
                    </div>
                    {entry.comment && (
                      <p className="text-slate-400 text-xs mt-0.5">{entry.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Filter Toolbar */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">All Statuses</option>
                {STATUS_FILTERS.filter(Boolean).map(st => (
                  <option key={st} value={st}>{st.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Severity:</span>
              <select
                value={severityFilter}
                onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">All Severities</option>
                {SEVERITY_FILTERS.filter(Boolean).map(sev => (
                  <option key={sev} value={sev}>{sev.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Source:</span>
              <select
                value={sourceFilter}
                onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="">All Sources</option>
                <option value="service_health">Service Health</option>
                <option value="github_actions">GitHub CI/CD</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Total Incidents: <strong className="text-white">{pagination.total}</strong>
          </div>
        </div>

        {/* Incidents Table */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-slate-500 text-sm">Loading incidents...</div>
          ) : error ? (
            <div className="p-10 text-center text-red-400 text-sm">{error}</div>
          ) : incidents.length === 0 ? (
            <div className="p-14 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
              <p className="text-slate-300 font-medium text-sm">Zero Active Incidents</p>
              <p className="text-slate-500 text-xs mt-1">All services in this organization are operating normally</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Incident Title</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Source & Target</th>
                    <th className="py-3 px-4">Last Detected</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {incidents.map(inc => (
                    <tr
                      key={inc._id}
                      onClick={() => loadIncidentDetail(inc._id)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition ${
                        selectedIncidentId === inc._id ? 'bg-sky-500/10' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-white">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-4 h-4 shrink-0 ${inc.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                          <span className="truncate max-w-md">{inc.title}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${severityBadge(inc.severity)}`}>
                          {inc.severity}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${statusBadge(inc.status)}`}>
                          {inc.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {inc.source === 'github_actions' ? (
                          <span className="flex items-center gap-1.5 text-purple-300">
                            <GitBranch className="w-3.5 h-3.5" />
                            <span>GitHub Actions</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <Server className="w-3.5 h-3.5 text-slate-500" />
                            <span>{inc.service?.name || 'Service Health'}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(inc.lastSeenAt || inc.createdAt).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className="text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1">
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
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
