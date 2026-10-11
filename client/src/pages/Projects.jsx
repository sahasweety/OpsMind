import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Server, 
  Calendar, 
  ExternalLink,
  Building2,
  AlertCircle
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import Layout from '../components/Layout';

export default function Projects() {
  const { user } = useAuth();
  const { activeOrg, activeOrgId, organizations } = useOrg();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create project form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const userMembership = activeOrg?.members?.find(m => {
    const mId = (m.user?._id ?? m.user)?.toString();
    return mId && user?._id && mId === user._id.toString();
  });
  const currentRole = userMembership?.role || 'member';
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const fetchProjects = useCallback(async () => {
    if (!activeOrgId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/projects?organizationId=${activeOrgId}`);
      setProjects(res.data.projects || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!name.trim()) {
      setCreateError('Project name is required');
      return;
    }
    setCreating(true);
    try {
      await api.post('/projects', {
        name: name.trim(),
        description: description.trim(),
        organizationId: activeOrgId
      });
      setName('');
      setDescription('');
      fetchProjects();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? Associated services will also be deleted.`)) {
      return;
    }
    setDeletingId(projectId);
    try {
      await api.delete(`/projects/${projectId}`);
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  if (!activeOrgId) {
    return (
      <Layout>
        <div className="text-center py-16 bg-[#111827] rounded-xl border border-slate-800">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white">No Active Organization</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Please create or select an organization from the workspace switcher to view projects.
          </p>
          <button
            onClick={() => navigate('/organizations')}
            className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold transition"
          >
            Go to Organizations
          </button>
        </div>
      </Layout>
    );
  }

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
            <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
            <p className="text-sm text-slate-400 mt-1">
              Service containers and operational scopes within {activeOrg?.name}
            </p>
          </div>
        </div>

        {/* Create Project Card */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-white mb-1">Create Project</h2>
          <p className="text-xs text-slate-400 mb-4">Organize microservices, APIs, and data workers into logical domains</p>

          {createError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateProject} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Project name (e.g. Core Banking Platform)"
                required
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'Create Project'}</span>
            </button>
          </form>
        </div>

        {/* Projects List */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Projects ({projects.length})
          </h2>

          {loading ? (
            <div className="text-slate-500 text-sm py-8 text-center bg-[#111827] rounded-xl border border-slate-800">
              Loading projects...
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm py-8 text-center bg-[#111827] rounded-xl border border-slate-800">
              {error}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 bg-[#111827] rounded-xl border border-slate-800">
              <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium text-sm">No projects created yet</p>
              <p className="text-slate-500 text-xs mt-1">Create your first project above to begin registering services</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(proj => (
                <div
                  key={proj._id}
                  className="bg-[#111827] rounded-xl border border-slate-800 hover:border-slate-700 p-5 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-white text-base truncate" title={proj.name}>
                        {proj.name}
                      </h3>
                    </div>
                    {proj.description && (
                      <p className="text-xs text-slate-400 mb-4 line-clamp-2">{proj.description}</p>
                    )}
                    <div className="text-xs text-slate-500 space-y-1 mb-4">
                      {proj.createdAt && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Created {new Date(proj.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/services?projectId=${proj._id}`)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 font-medium transition flex items-center gap-1.5"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>View Services →</span>
                    </button>

                    {canManage && (
                      <button
                        disabled={deletingId === proj._id}
                        onClick={() => handleDeleteProject(proj._id, proj.name)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
