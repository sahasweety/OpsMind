import React, { useState, useEffect } from 'react';
import api from '../api/client';
import LogPanel from './LogPanel';

const ENVIRONMENTS = ['development', 'staging', 'production'];
const STATUSES = ['unknown', 'healthy', 'degraded', 'down'];

const STATUS_COLORS = {
  unknown:  'bg-gray-100 text-gray-600',
  healthy:  'bg-green-100 text-green-700',
  degraded: 'bg-yellow-100 text-yellow-700',
  down:     'bg-red-100 text-red-700',
};

const ENV_COLORS = {
  development: 'bg-blue-100 text-blue-700',
  staging:     'bg-purple-100 text-purple-700',
  production:  'bg-orange-100 text-orange-700',
};

// ─── Secret Banner — shown exactly once, never stored ──────────────────────
function SecretBanner({ secret, title, onDismiss }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Trim guards against any whitespace that may surround the value in state
    navigator.clipboard.writeText(secret.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-yellow-50 border border-yellow-400 rounded p-4 mb-4">
      {/* select-none on the wrapper prevents accidental drag-selection of surrounding text */}
      <h4 className="font-semibold text-yellow-800 mb-1 select-none">
        ⚠️ {title || 'Service Ingest Secret'} — Copy Now
      </h4>
      <p className="text-xs text-yellow-700 mb-2 select-none">
        This secret will not be shown again. Store it securely before leaving this page.
        Use the button below — do not manually select this text.
      </p>
      {/*
        No whitespace between the tags and {secret.trim()} so that a manual
        select-all on only this element captures exactly the 64-char hex string.
        data-secret-length lets you verify the length in DevTools without seeing the value.
      */}
      <code
        className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all select-all"
        data-secret-length={secret.trim().length}
      >{secret.trim()}</code>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleCopy}
          className="text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-900 px-3 py-1 rounded border border-yellow-400 font-medium transition"
        >
          {copied ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          onClick={onDismiss}
          className="text-xs text-yellow-700 underline hover:text-yellow-900 select-none"
        >
          I have copied the secret — dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Rotate Credential Section ──────────────────────────────────────────────
function RotateCredentialSection({ serviceId }) {
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating]     = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [rotatedSecret, setRotatedSecret] = useState(null);

  const handleRotate = async () => {
    setRotateError('');
    try {
      setRotating(true);
      const res = await api.post(`/services/${serviceId}/rotate-credential`);
      setConfirming(false);
      setRotatedSecret(res.data.ingestSecret);
    } catch (err) {
      setRotateError(err.response?.data?.message || 'Failed to rotate credential');
    } finally {
      setRotating(false);
    }
  };

  if (rotatedSecret) {
    return (
      <SecretBanner
        secret={rotatedSecret}
        title="New Ingest Secret (Rotated)"
        onDismiss={() => setRotatedSecret(null)}
      />
    );
  }

  if (confirming) {
    return (
      <div className="border border-orange-300 rounded p-3 bg-orange-50 mb-4">
        <p className="text-sm font-medium text-orange-800 mb-1">⚠️ Rotate Ingestion Secret?</p>
        <p className="text-xs text-orange-700 mb-3">
          The existing secret will stop working <strong>immediately</strong>. Any running
          service or simulator currently using it will begin failing until updated with the
          new secret. This action cannot be undone.
        </p>
        {rotateError && (
          <div className="text-red-600 text-xs mb-2">{rotateError}</div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleRotate}
            disabled={rotating}
            className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700 disabled:opacity-50 font-medium"
          >
            {rotating ? 'Rotating…' : 'Yes, rotate now'}
          </button>
          <button
            onClick={() => { setConfirming(false); setRotateError(''); }}
            disabled={rotating}
            className="border px-3 py-1 rounded text-xs hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded p-3 bg-gray-50 mb-4">
      <p className="text-xs text-gray-600 mb-2 font-medium">Ingestion Credential</p>
      <p className="text-xs text-gray-500 mb-2">
        Rotate the ingest secret if it was exposed or you need to invalidate it immediately.
        The old secret stops working as soon as rotation completes.
      </p>
      <button
        onClick={() => setConfirming(true)}
        className="text-xs border border-orange-400 text-orange-700 px-3 py-1 rounded hover:bg-orange-50 font-medium transition"
      >
        🔄 Rotate Ingestion Secret
      </button>
    </div>
  );
}

// ─── Service Panel ──────────────────────────────────────────────────────────
function ServicePanel({ project, orgRole, onBack }) {
  const [services, setServices]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [newSecret, setNewSecret]       = useState(null); // shown once after creation
  const [formError, setFormError]       = useState('');
  const [creating, setCreating]         = useState(false);
  const [envFilter, setEnvFilter]       = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode]         = useState(false);
  const [viewingLogs, setViewingLogs]   = useState(null);

  // Create form state
  const [form, setForm] = useState({ name: '', description: '', environment: 'development' });

  // Edit form state
  const [editForm, setEditForm]     = useState({});
  const [editError, setEditError]   = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const canWrite = ['owner', 'admin'].includes(orgRole);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const query = `/services?projectId=${project._id}${envFilter ? `&environment=${envFilter}` : ''}`;
      const res = await api.get(query);
      setServices(res.data.services);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, [project._id, envFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Service name is required'); return; }
    try {
      setCreating(true);
      const res = await api.post('/services', {
        name: form.name.trim(),
        description: form.description.trim(),
        projectId: project._id,
        environment: form.environment
      });
      // Show raw secret once; do NOT put it in localStorage
      setNewSecret(res.data.ingestSecret);
      setForm({ name: '', description: '', environment: 'development' });
      fetchServices();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create service');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Delete this service?')) return;
    try {
      await api.delete(`/services/${serviceId}`);
      if (selectedService?._id === serviceId) setSelectedService(null);
      fetchServices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete service');
    }
  };

  const handleStatusChange = async (serviceId, status) => {
    try {
      setStatusUpdating(true);
      const res = await api.patch(`/services/${serviceId}/status`, { status });
      setSelectedService(res.data.service);
      fetchServices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const openEdit = (svc) => {
    setEditForm({ name: svc.name, description: svc.description || '', environment: svc.environment });
    setEditError('');
    setEditMode(true);
  };

  const handleEditSave = async () => {
    setEditError('');
    if (!editForm.name.trim()) { setEditError('Name is required'); return; }
    try {
      setEditSaving(true);
      const res = await api.patch(`/services/${selectedService._id}`, editForm);
      setSelectedService(res.data.service);
      setEditMode(false);
      fetchServices();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (viewingLogs) {
    return <LogPanel service={viewingLogs} onBack={() => setViewingLogs(null)} />;
  }

  if (selectedService) {
    const svc = selectedService;
    return (
      <div>
        <button onClick={() => { setSelectedService(null); setEditMode(false); }}
          className="mb-4 text-blue-600 hover:underline text-sm">
          ← Back to services
        </button>

        {editMode ? (
          <div className="border rounded p-4 bg-gray-50">
            <h3 className="font-semibold mb-3">Edit Service</h3>
            {editError && <div className="text-red-600 text-sm mb-2">{editError}</div>}
            <div className="flex flex-col gap-2">
              <input className="border p-2 rounded text-sm" placeholder="Name"
                value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              <input className="border p-2 rounded text-sm" placeholder="Description"
                value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              <select className="border p-2 rounded text-sm"
                value={editForm.environment} onChange={e => setEditForm(f => ({ ...f, environment: e.target.value }))}>
                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={handleEditSave} disabled={editSaving}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditMode(false)}
                  className="border px-4 py-2 rounded text-sm hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl font-semibold">{svc.name}</h2>
                {svc.description && <p className="text-sm text-gray-500 mt-1">{svc.description}</p>}
              </div>
              {canWrite && (
                <div className="flex gap-2">
                  <button onClick={() => setViewingLogs(svc)} className="border px-3 py-1 rounded text-sm hover:bg-gray-100 font-medium">Logs</button>
                  <button onClick={() => openEdit(svc)}
                    className="border px-3 py-1 rounded text-sm hover:bg-gray-100">Edit</button>
                  <button onClick={() => handleDelete(svc._id)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">Delete</button>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[svc.status]}`}>
                {svc.status}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ENV_COLORS[svc.environment]}`}>
                {svc.environment}
              </span>
            </div>

            {canWrite && (
              <div className="border rounded p-3 bg-gray-50 mb-4">
                <p className="text-xs text-gray-600 mb-2 font-medium">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button key={s} disabled={statusUpdating || svc.status === s}
                      onClick={() => handleStatusChange(svc._id, s)}
                      className={`text-xs px-3 py-1 rounded border ${svc.status === s ? 'bg-gray-200 cursor-default' : 'hover:bg-gray-100'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Credential rotation — owner/admin only */}
            {canWrite && (
              <RotateCredentialSection
                serviceId={svc._id}
              />
            )}

            <div className="text-xs text-gray-400">
              Created by {svc.createdBy?.name || 'unknown'} ·{' '}
              {svc.lastHeartbeatAt ? `Last heartbeat: ${new Date(svc.lastHeartbeatAt).toLocaleString()}` : 'No heartbeat yet'}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline text-sm">
        ← Back to projects
      </button>
      <h2 className="text-xl font-semibold mb-1">{project.name}</h2>
      <p className="text-xs text-gray-400 mb-4">Services</p>

      {/* Secret banner — shown once after creation, cleared on dismiss */}
      {newSecret && (
        <SecretBanner
          secret={newSecret}
          title="Service Ingest Secret"
          onDismiss={() => setNewSecret(null)}
        />
      )}

      {/* Create form — only for owner/admin */}
      {canWrite && (
        <div className="bg-gray-50 border rounded p-4 mb-5">
          <h3 className="font-medium mb-2">Register New Service</h3>
          {formError && <div className="text-red-600 text-sm mb-2">{formError}</div>}
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input type="text" placeholder="Service name *" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="border p-2 rounded text-sm" />
            <input type="text" placeholder="Description (optional)" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="border p-2 rounded text-sm" />
            <select value={form.environment}
              onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
              className="border p-2 rounded text-sm">
              {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
            </select>
            <button type="submit" disabled={creating}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50">
              {creating ? 'Registering...' : 'Register Service'}
            </button>
          </form>
        </div>
      )}

      {/* Environment filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button onClick={() => setEnvFilter('')}
          className={`text-xs px-3 py-1 rounded border ${envFilter === '' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          All
        </button>
        {ENVIRONMENTS.map(env => (
          <button key={env} onClick={() => setEnvFilter(env)}
            className={`text-xs px-3 py-1 rounded border ${envFilter === env ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
            {env}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading services...</div>}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {!loading && !error && services.length === 0 && (
        <div className="text-gray-400 text-sm py-6 text-center">
          No services registered yet.{canWrite ? ' Create one above.' : ''}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {services.map(svc => (
          <button key={svc._id} onClick={() => setSelectedService(svc)}
            className="text-left border rounded p-3 hover:bg-blue-50 transition">
            <div className="flex items-center justify-between">
              <span className="font-medium">{svc.name}</span>
              <div className="flex gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[svc.status]}`}>{svc.status}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${ENV_COLORS[svc.environment]}`}>{svc.environment}</span>
              </div>
            </div>
            {svc.description && <div className="text-xs text-gray-400 mt-1">{svc.description}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ServicePanel;
