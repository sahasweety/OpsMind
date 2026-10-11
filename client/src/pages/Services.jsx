import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Server, 
  Plus, 
  Trash2, 
  RotateCw, 
  FileText, 
  Layers, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle,
  Copy,
  Check,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

const ENVIRONMENTS = ['development', 'staging', 'production'];
const STATUSES = ['healthy', 'degraded', 'down', 'unknown'];

export default function Services() {
  const { user } = useAuth();
  const { activeOrg, activeOrgId } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedProjectId = searchParams.get('projectId') || '';

  const [projects, setProjects] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  // Create form state
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [targetProjectId, setTargetProjectId] = useState(selectedProjectId);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Secret banner modal / reveal
  const [newSecret, setNewSecret] = useState(null);
  const [copied, setCopied] = useState(false);

  // Status updates & credentials rotation
  const [rotatingId, setRotatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const userMembership = activeOrg?.members?.find(m => {
    const mId = (m.user?._id ?? m.user)?.toString();
    return mId && user?._id && mId === user._id.toString();
  });
  const currentRole = userMembership?.role || 'member';
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  // Load all projects for the organization to populate project selector
  const fetchProjects = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const res = await api.get(`/projects?organizationId=${activeOrgId}`);
      const list = res.data.projects || [];
      setProjects(list);
      if (!targetProjectId && list.length > 0) {
        setTargetProjectId(list[0]._id);
      }
    } catch (err) {
      console.error('Error fetching projects for services view:', err);
    }
  }, [activeOrgId, targetProjectId]);

  // Load services (either filtered by projectId or all projects in org)
  const fetchServices = useCallback(async () => {
    if (!activeOrgId) {
      setServices([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');

      let loaded = [];
      if (selectedProjectId) {
        const res = await api.get(`/services?projectId=${selectedProjectId}${envFilter ? `&environment=${envFilter}` : ''}`);
        loaded = res.data.services || [];
      } else {
        // Load services across all projects in org
        const projRes = await api.get(`/projects?organizationId=${activeOrgId}`);
        const orgProjects = projRes.data.projects || [];
        const promises = orgProjects.map(p => 
          api.get(`/services?projectId=${p._id}${envFilter ? `&environment=${envFilter}` : ''}`)
            .then(r => r.data.services || [])
            .catch(() => [])
        );
        const results = await Promise.all(promises);
        loaded = results.flat();
      }
      setServices(loaded);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, selectedProjectId, envFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleCreateService = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!name.trim()) {
      setCreateError('Service name is required');
      return;
    }
    if (!targetProjectId) {
      setCreateError('A target project must be selected');
      return;
    }

    setCreating(true);
    try {
      const res = await api.post('/services', {
        name: name.trim(),
        projectId: targetProjectId,
        environment
      });
      setName('');
      fetchServices();
      if (res.data.ingestSecret) {
        setNewSecret({
          serviceName: res.data.service.name,
          secret: res.data.ingestSecret,
          isRotated: false
        });
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create service');
    } finally {
      setCreating(false);
    }
  };

  const handleRotateCredential = async (serviceId, serviceName) => {
    if (!window.confirm(`Rotate ingestion secret for "${serviceName}"? Any existing agents using the old secret will fail immediately until updated.`)) {
      return;
    }
    setRotatingId(serviceId);
    try {
      const res = await api.post(`/services/${serviceId}/rotate-credential`);
      if (res.data.ingestSecret) {
        setNewSecret({
          serviceName,
          secret: res.data.ingestSecret,
          isRotated: true
        });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to rotate credential');
    } finally {
      setRotatingId(null);
    }
  };

  const handleDeleteService = async (serviceId, serviceName) => {
    if (!window.confirm(`Delete service "${serviceName}"? Logs will also be deleted.`)) {
      return;
    }
    setDeletingId(serviceId);
    try {
      await api.delete(`/services/${serviceId}`);
      fetchServices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete service');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (serviceId, nextStatus) => {
    try {
      await api.patch(`/services/${serviceId}/status`, { status: nextStatus });
      fetchServices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    }
  };

  const copySecretToClipboard = (val) => {
    navigator.clipboard.writeText(val.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Services & Telemetry</h1>
            <p className="text-sm text-slate-400 mt-1">
              Operational workloads, ingestion credentials, and runtime statuses
            </p>
          </div>
        </div>

        {/* Ingest Secret Reveal Modal */}
        {newSecret && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 shadow-lg relative">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-white text-sm">
                  {newSecret.isRotated ? 'New Ingestion Secret Rotated' : 'Ingestion Secret Created'} — {newSecret.serviceName}
                </h3>
                <p className="text-xs text-amber-300/80 mt-1">
                  Save this secret now. For security, OpsMind stores only the SHA-256 hash at rest and will never display this secret again.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-amber-300 break-all select-all">
                    {newSecret.secret}
                  </code>
                  <button
                    onClick={() => copySecretToClipboard(newSecret.secret)}
                    className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setNewSecret(null)}
                    className="text-xs text-slate-400 hover:text-white underline"
                  >
                    I have saved the credential securely — Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Service Card */}
        {canManage && (
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-white mb-1">Register New Service</h2>
            <p className="text-xs text-slate-400 mb-4">Each registered service receives a unique 64-character ingestion credential</p>

            {createError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateService} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Service name (e.g. auth-service)"
                required
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />

              <select
                value={targetProjectId}
                onChange={e => setTargetProjectId(e.target.value)}
                required
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="">Select Target Project</option>
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>

              <select
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
              >
                {ENVIRONMENTS.map(env => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>

              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{creating ? 'Registering...' : 'Register Service'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Project Filter:</span>
            <select
              value={selectedProjectId}
              onChange={e => {
                const nextId = e.target.value;
                if (nextId) setSearchParams({ projectId: nextId });
                else setSearchParams({});
              }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="">All Projects ({services.length} services)</option>
              {projects.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Environment:</span>
            <select
              value={envFilter}
              onChange={e => setEnvFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="">All Environments</option>
              {ENVIRONMENTS.map(env => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Services List Table */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading services...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : services.length === 0 ? (
            <div className="p-12 text-center">
              <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium text-sm">No services found</p>
              <p className="text-slate-500 text-xs mt-1">Register a service above to obtain ingestion credentials and begin streaming logs</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Environment</th>
                    <th className="py-3 px-4">Operational Status</th>
                    <th className="py-3 px-4">Heartbeat</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {services.map(svc => {
                    const statusColor = 
                      svc.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      svc.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      svc.status === 'down' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      'bg-slate-800 text-slate-400 border-slate-700';

                    const StatusIcon = 
                      svc.status === 'healthy' ? CheckCircle2 :
                      svc.status === 'degraded' ? AlertTriangle :
                      svc.status === 'down' ? XCircle : HelpCircle;

                    return (
                      <tr key={svc._id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white text-sm">{svc.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">ID: {svc._id}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {svc.environment}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              <span className="capitalize">{svc.status}</span>
                            </span>

                            {canManage && (
                              <select
                                value={svc.status}
                                onChange={e => handleStatusChange(svc._id, e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-400"
                              >
                                {STATUSES.map(st => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-400">
                          {svc.lastHeartbeatAt ? new Date(svc.lastHeartbeatAt).toLocaleTimeString() : 'No logs ingested'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => navigate(`/logs?serviceId=${svc._id}`)}
                              className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Logs</span>
                            </button>

                            {canManage && (
                              <button
                                disabled={rotatingId === svc._id}
                                onClick={() => handleRotateCredential(svc._id, svc.name)}
                                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                                title="Rotate Ingestion Credential"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${rotatingId === svc._id ? 'animate-spin' : ''}`} />
                                <span>Rotate Secret</span>
                              </button>
                            )}

                            {canManage && (
                              <button
                                disabled={deletingId === svc._id}
                                onClick={() => handleDeleteService(svc._id, svc.name)}
                                className="p-1 text-slate-500 hover:text-red-400 rounded-lg transition"
                                title="Delete Service"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
