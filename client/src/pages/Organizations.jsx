import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Building2, 
  Plus, 
  Trash2, 
  Shield, 
  Users, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

export default function Organizations() {
  const { user } = useAuth();
  const { 
    organizations, 
    activeOrgId, 
    selectOrg, 
    addOrganization, 
    fetchOrganizations, 
    loading, 
    error: orgError 
  } = useOrg();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user, fetchOrganizations]);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!name.trim()) {
      setCreateError('Organization name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/organizations', { name: name.trim() });
      const createdOrg = res.data.organization;
      setName('');

      // Immediately add the new organization to state so it appears without a reload
      if (createdOrg) {
        if (addOrganization) {
          addOrganization(createdOrg);
        } else {
          selectOrg(createdOrg._id);
        }
      }

      // Re-fetch to ensure complete server-side populated state (members, owner)
      await fetchOrganizations();

      if (createdOrg) {
        selectOrg(createdOrg._id);
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteOrg = async (orgId, orgName) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${orgName}"? All child projects, services, and webhooks will be deleted.`)) {
      return;
    }
    setDeletingId(orgId);
    try {
      await api.delete(`/organizations/${orgId}`);
      await fetchOrganizations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete organization');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Organizations</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your DevOps workspaces, memberships, and multi-tenant scopes
            </p>
          </div>
        </div>

        {/* Global Organizations Load Error Banner */}
        {orgError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{orgError}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchOrganizations()}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium underline ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Create Organization Card */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-white mb-1">Create New Organization</h2>
          <p className="text-xs text-slate-400 mb-4">You will automatically become the owner with full administrative rights</p>

          {createError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateOrg} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Acme Cloud Platform"
              required
              className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create Organization'}</span>
            </button>
          </form>
        </div>

        {/* Organizations List */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Your Organizations ({organizations.length})
          </h2>

          {loading ? (
            <div className="text-slate-500 text-sm py-8 text-center bg-[#111827] rounded-xl border border-slate-800">
              Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-12 bg-[#111827] rounded-xl border border-slate-800">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium text-sm">No organizations found</p>
              <p className="text-slate-500 text-xs mt-1">Create an organization above to get started with monitoring</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map(org => {
                const isSelected = org._id === activeOrgId;
                const memberRecord = org.members?.find(m => {
                  const mId = (m.user?._id ?? m.user)?.toString();
                  return mId && user?._id && mId === user._id.toString();
                });
                const role = memberRecord?.role || 'member';
                const isOwner = role === 'owner';

                return (
                  <div
                    key={org._id}
                    className={`bg-[#111827] rounded-xl border p-5 transition flex flex-col justify-between ${
                      isSelected ? 'border-sky-500/80 ring-1 ring-sky-500/30' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-white text-base truncate" title={org.name}>
                          {org.name}
                        </h3>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border shrink-0 ${
                          role === 'owner' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          role === 'admin' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {role}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                        <div className="font-mono text-[11px] text-slate-500">slug: {org.slug}</div>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>{org.members?.length || 1} team member{org.members?.length === 1 ? '' : 's'}</span>
                        </div>
                        {org.createdAt && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          selectOrg(org._id);
                          navigate('/projects');
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                          isSelected 
                            ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30' 
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{isSelected ? 'Active (Open)' : 'Set Active'}</span>
                      </button>

                      {isOwner && (
                        <button
                          disabled={deletingId === org._id}
                          onClick={() => handleDeleteOrg(org._id, org.name)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                          title="Delete Organization"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
