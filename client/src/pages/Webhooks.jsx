import React, { useState, useEffect, useCallback } from 'react';
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ShieldCheck, 
  Globe,
  Clock,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

export default function Webhooks() {
  const { user } = useAuth();
  const { activeOrg, activeOrgId } = useOrg();

  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form inputs
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [creating, setCreating] = useState(false);

  // Per-webhook actions
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const userMembership = activeOrg?.members?.find(m => {
    const mId = (m.user?._id ?? m.user)?.toString();
    return mId && user?._id && mId === user._id.toString();
  });
  const currentRole = userMembership?.role || 'member';
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const fetchWebhooks = useCallback(async () => {
    if (!activeOrgId) {
      setWebhooks([]);
      setLoading(false);
      return;
    }
    if (!canManage) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/organizations/${activeOrgId}/webhooks`);
      setWebhooks(res.data.webhooks || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, canManage]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');
    setTestResult(null);

    if (!name.trim()) {
      setFormError('Webhook name is required');
      return;
    }
    if (!url.trim()) {
      setFormError('Webhook URL is required');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/organizations/${activeOrgId}/webhooks`, {
        name: name.trim(),
        url: url.trim(),
        secret: secret.trim() ? secret.trim() : undefined
      });
      setName('');
      setUrl('');
      setSecret('');
      setSuccessMsg('Webhook destination registered. HMAC signature will accompany dispatches.');
      fetchWebhooks();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (webhook) => {
    setTogglingId(webhook._id);
    try {
      await api.patch(`/organizations/${activeOrgId}/webhooks/${webhook._id}`, {
        enabled: !webhook.enabled
      });
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update webhook state');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (webhookId, webhookName) => {
    if (!window.confirm(`Delete webhook destination "${webhookName}"?`)) return;
    setDeletingId(webhookId);
    try {
      await api.delete(`/organizations/${activeOrgId}/webhooks/${webhookId}`);
      fetchWebhooks();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete webhook');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (webhookId) => {
    setTestingId(webhookId);
    setTestResult(null);
    try {
      const res = await api.post(`/organizations/${activeOrgId}/webhooks/${webhookId}/test`);
      setTestResult({
        webhookId,
        success: res.data.success,
        status: res.data.status,
        message: res.data.message || (res.data.success ? 'Delivered successfully' : 'Delivery failed'),
        error: res.data.error
      });
      fetchWebhooks();
    } catch (err) {
      setTestResult({
        webhookId,
        success: false,
        message: err.response?.data?.message || 'Test delivery network error'
      });
    } finally {
      setTestingId(null);
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Outbound Webhooks</h1>
            <p className="text-sm text-slate-400 mt-1">
              Secure incident notification dispatches with HMAC-SHA256 signatures and SSRF defenses
            </p>
          </div>
        </div>

        {!canManage ? (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-6 rounded-2xl text-center">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <h3 className="font-semibold text-sm">Administrative Permissions Required</h3>
            <p className="text-xs text-amber-300/80 mt-1">
              Only organization owners and admins can configure and dispatch outbound webhooks.
            </p>
          </div>
        ) : (
          <>
            {/* Create Webhook Form */}
            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-white mb-1">Add Webhook Destination</h2>
              <p className="text-xs text-slate-400 mb-4">
                Dispatches a JSON incident payload whenever a service-health or CI/CD incident occurs
              </p>

              {formError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Destination Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Slack Incident Channel / PagerDuty"
                      required
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Endpoint URL
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://api.opsmind.org/webhook-receiver"
                      required
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Signing Secret (Optional HMAC key)
                  </label>
                  <input
                    type="password"
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    placeholder="Enter custom shared secret or leave empty"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    If configured, payloads are signed via <code className="text-slate-400">X-OpsMind-Signature: sha256=&lt;hash&gt;</code>. Secrets are never exposed back over the API.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{creating ? 'Saving...' : 'Add Destination'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Test Outcome Banner */}
            {testResult && (
              <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold">Test Dispatch Outcome: {testResult.message}</div>
                  {testResult.status && <div className="text-[11px] text-slate-400 mt-0.5">HTTP Status: {testResult.status}</div>}
                  {testResult.error && <div className="text-[11px] mt-0.5 text-red-400 font-mono">{testResult.error}</div>}
                </div>
                <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
              </div>
            )}

            {/* Configured Webhooks List */}
            <div>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Configured Destinations ({webhooks.length})
              </h2>

              {loading ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-[#111827] rounded-xl border border-slate-800">
                  Loading webhook destinations...
                </div>
              ) : error ? (
                <div className="p-8 text-center text-red-400 text-sm bg-[#111827] rounded-xl border border-slate-800">
                  {error}
                </div>
              ) : webhooks.length === 0 ? (
                <div className="p-12 text-center bg-[#111827] rounded-xl border border-slate-800">
                  <Webhook className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium text-sm">No webhook destinations configured</p>
                  <p className="text-slate-500 text-xs mt-1">Register an endpoint above to receive automated incident alerts</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {webhooks.map(wh => (
                    <div
                      key={wh._id}
                      className="bg-[#111827] border border-slate-800 rounded-2xl p-5 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="font-semibold text-white text-sm">{wh.name}</h3>
                            <div className="text-xs text-sky-400 font-mono truncate max-w-xs mt-0.5" title={wh.url}>
                              {wh.url}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                            wh.enabled 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}>
                            {wh.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        {/* Last Delivery Status */}
                        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span>Last Delivery:</span>
                            {wh.lastDelivery?.status ? (
                              <span className={`font-semibold capitalize ${
                                wh.lastDelivery.status === 'success' ? 'text-emerald-400' :
                                wh.lastDelivery.status === 'timeout' ? 'text-amber-400' : 'text-red-400'
                              }`}>
                                {wh.lastDelivery.status} {wh.lastDelivery.statusCode ? `(${wh.lastDelivery.statusCode})` : ''}
                              </span>
                            ) : (
                              <span className="text-slate-500">Never dispatched</span>
                            )}
                          </div>
                          {wh.lastDelivery?.timestamp && (
                            <div className="text-[10px] text-slate-500 text-right">
                              {new Date(wh.lastDelivery.timestamp).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            disabled={togglingId === wh._id}
                            onClick={() => handleToggle(wh)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              wh.enabled 
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' 
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
                          >
                            {wh.enabled ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            disabled={testingId === wh._id}
                            onClick={() => handleTest(wh._id)}
                            className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                          >
                            <Send className={`w-3.5 h-3.5 ${testingId === wh._id ? 'animate-pulse' : ''}`} />
                            <span>{testingId === wh._id ? 'Sending...' : 'Test'}</span>
                          </button>
                        </div>

                        <button
                          disabled={deletingId === wh._id}
                          onClick={() => handleDelete(wh._id, wh.name)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                          title="Delete destination"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
