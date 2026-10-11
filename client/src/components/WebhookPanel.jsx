import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Send, CheckCircle2, XCircle, AlertCircle, Shield, Globe } from 'lucide-react';
import api from '../api/client';

export default function WebhookPanel({ org, orgRole, onBack }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [creating, setCreating] = useState(false);

  // Per-webhook actions
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const canManage = orgRole === 'owner' || orgRole === 'admin';

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/organizations/${org._id}/webhooks`);
      setWebhooks(res.data.webhooks || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      fetchWebhooks();
    } else {
      setLoading(false);
    }
  }, [org._id, canManage]);

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

    try {
      setCreating(true);
      await api.post(`/organizations/${org._id}/webhooks`, {
        name: name.trim(),
        url: url.trim(),
        secret: secret.trim() ? secret.trim() : undefined
      });
      setName('');
      setUrl('');
      setSecret('');
      setSuccessMsg('Webhook created successfully! Signing secret is securely saved.');
      fetchWebhooks();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (webhook) => {
    try {
      setTogglingId(webhook._id);
      await api.patch(`/organizations/${org._id}/webhooks/${webhook._id}`, {
        enabled: !webhook.enabled
      });
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update webhook status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (webhookId) => {
    if (!window.confirm('Are you sure you want to delete this webhook destination?')) return;
    try {
      setDeletingId(webhookId);
      await api.delete(`/organizations/${org._id}/webhooks/${webhookId}`);
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete webhook');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (webhookId) => {
    try {
      setTestingId(webhookId);
      setTestResult(null);
      const res = await api.post(`/organizations/${org._id}/webhooks/${webhookId}/test`);
      setTestResult({
        webhookId,
        success: res.data.success,
        status: res.data.status,
        message: res.data.message
      });
      fetchWebhooks();
    } catch (err) {
      setTestResult({
        webhookId,
        success: false,
        message: err.response?.data?.message || 'Test request failed'
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          ← Back to Projects
        </button>
        <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
          {org.name}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Bell className="text-blue-600" size={22} />
        <h2 className="text-xl font-bold text-gray-800">Outbound Webhooks</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Notify external systems (custom endpoints, Slack, or Discord) when incidents are created.
      </p>

      {!canManage && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded mb-6 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          Only organization owners and administrators can view and configure webhooks.
        </div>
      )}

      {canManage && (
        <>
          {/* Create Webhook Box */}
          <div className="bg-white border rounded shadow-sm p-5 mb-6">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Plus size={16} className="text-blue-600" /> Add Webhook Destination
            </h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded mb-3 flex items-center gap-2">
                <AlertCircle size={15} /> {formError}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded mb-3 flex items-center gap-2">
                <CheckCircle2 size={15} /> {successMsg}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Destination Name</label>
                <input
                  type="text"
                  placeholder="e.g. Production Alerting Channel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border p-2 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  disabled={creating}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payload URL (HTTPS recommended)</label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://api.example.com/webhooks/opsmind"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full border p-2 pl-8 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none font-mono text-xs"
                    disabled={creating}
                  />
                  <Globe size={14} className="absolute left-2.5 top-3 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Localhost and internal IP ranges are blocked for SSRF safety.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signing Secret (Optional)</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Enter HMAC secret for payload signing"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full border p-2 pl-8 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none font-mono text-xs"
                    disabled={creating}
                    autoComplete="new-password"
                  />
                  <Shield size={14} className="absolute left-2.5 top-3 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Sent via <code>X-OpsMind-Signature: sha256=...</code> header. Never displayed again after save.
                </p>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {creating ? 'Adding destination...' : 'Save Webhook'}
              </button>
            </form>
          </div>

          {/* Webhook List */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Configured Destinations</h3>
            {loading && <div className="text-gray-400 text-sm py-4">Loading webhooks...</div>}
            {error && <div className="text-red-600 text-sm py-2">{error}</div>}

            {!loading && !error && webhooks.length === 0 && (
              <div className="bg-gray-50 border border-dashed rounded p-6 text-center text-gray-400 text-sm">
                No outbound webhooks configured for this organization yet.
              </div>
            )}

            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh._id} className="bg-white border rounded shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{wh.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${wh.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {wh.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{wh.url}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTest(wh._id)}
                        disabled={testingId === wh._id}
                        title="Send test payload"
                        className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded hover:bg-blue-100 transition disabled:opacity-50"
                      >
                        <Send size={12} /> {testingId === wh._id ? 'Sending...' : 'Test'}
                      </button>

                      <button
                        onClick={() => handleToggle(wh)}
                        disabled={togglingId === wh._id}
                        className="text-xs border px-2 py-1 rounded hover:bg-gray-50 text-gray-600 transition"
                      >
                        {wh.enabled ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        onClick={() => handleDelete(wh._id)}
                        disabled={deletingId === wh._id}
                        title="Delete webhook"
                        className="text-red-500 hover:text-red-700 p-1 rounded"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Delivery Status */}
                  <div className="text-xs text-gray-400 pt-2 border-t mt-1 flex justify-between items-center">
                    <div>
                      {wh.lastDelivery?.status ? (
                        <span className="flex items-center gap-1">
                          {wh.lastDelivery.status === 'success' ? (
                            <CheckCircle2 size={13} className="text-green-600" />
                          ) : (
                            <XCircle size={13} className="text-red-500" />
                          )}
                          Last delivery: <strong className={wh.lastDelivery.status === 'success' ? 'text-green-700' : 'text-red-600'}>{wh.lastDelivery.status}</strong>
                          {wh.lastDelivery.statusCode && ` (HTTP ${wh.lastDelivery.statusCode})`}
                          {wh.lastDelivery.timestamp && ` · ${new Date(wh.lastDelivery.timestamp).toLocaleTimeString()}`}
                        </span>
                      ) : (
                        <span>No deliveries recorded yet</span>
                      )}
                    </div>
                    {wh.lastDelivery?.error && (
                      <span className="text-red-500 truncate max-w-xs" title={wh.lastDelivery.error}>
                        {wh.lastDelivery.error}
                      </span>
                    )}
                  </div>

                  {/* Test feedback */}
                  {testResult && testResult.webhookId === wh._id && (
                    <div className={`mt-2 p-2 rounded text-xs flex items-center gap-2 ${testResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {testResult.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {testResult.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
