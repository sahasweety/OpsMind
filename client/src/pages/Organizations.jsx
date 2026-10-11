import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/client';
import ServicePanel from '../components/ServicePanel';
import IncidentPanel from '../components/IncidentPanel';
import WebhookPanel from '../components/WebhookPanel';

// ─── Service Panel wrapper inside Project Panel ─────────────────────────────

function ProjectPanel({ org, onBack }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewingIncidents, setViewingIncidents] = useState(false);
  const [viewingWebhooks, setViewingWebhooks] = useState(false);

  // Determine current user's role in this org.
  // user._id is a MongoDB ObjectId serialised as a string by the server.
  // m.user may be a populated object { _id, name, email } or a raw ObjectId,
  // depending on which API endpoint was used to load the org list.
  const { user } = useContext(AuthContext);
  const membership = org.members?.find(m => {
    const memberId = (m.user?._id ?? m.user)?.toString();
    const currentId = user?._id?.toString();
    return memberId && currentId && memberId === currentId;
  });
  // Never grant permissions silently; explicit null means "no membership found".
  const orgRole = membership?.role ?? null;
  if (!membership && user) {
    console.warn('[ProjectPanel] Could not resolve org membership for user', user._id, '— canWrite will be false');
  }

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects?organizationId=${org._id}`);
      setProjects(res.data.projects);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, [org._id]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!newProjectName.trim()) { setFormError('Project name is required'); return; }
    try {
      setCreating(true);
      await api.post('/projects', {
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
        organizationId: org._id
      });
      setNewProjectName('');
      setNewProjectDesc('');
      fetchProjects();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  if (viewingIncidents) {
    return <IncidentPanel org={org} onBack={() => setViewingIncidents(false)} />;
  }

  if (viewingWebhooks) {
    return <WebhookPanel org={org} orgRole={orgRole} onBack={() => setViewingWebhooks(false)} />;
  }

  if (selectedProject) {
    return (
      <div>
        <button onClick={() => setSelectedProject(null)} className="mb-4 text-blue-600 hover:underline text-sm">
          ← Back to projects
        </button>
        <ServicePanel
          project={selectedProject}
          orgRole={orgRole}
          onBack={() => setSelectedProject(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline text-sm">
        ← Back to Organizations
      </button>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">{org.name}</h2>
          <p className="text-sm text-gray-500">Slug: {org.slug}</p>
        </div>
        <div className="flex gap-2">
          {(orgRole === 'owner' || orgRole === 'admin') && (
            <button
              onClick={() => setViewingWebhooks(true)}
              className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded font-medium text-sm hover:bg-blue-100 transition"
            >
              Webhooks
            </button>
          )}
          <button onClick={() => setViewingIncidents(true)} className="bg-red-100 text-red-800 px-4 py-2 rounded font-bold hover:bg-red-200 text-sm">
            View Incidents
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border rounded p-4 mb-6">
        <h3 className="font-medium mb-2">New Project</h3>
        {formError && <div className="text-red-600 text-sm mb-2">{formError}</div>}
        <form onSubmit={handleCreateProject} className="flex flex-col gap-2">
          <input type="text" placeholder="Project name" value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)} className="border p-2 rounded text-sm" />
          <input type="text" placeholder="Description (optional)" value={newProjectDesc}
            onChange={e => setNewProjectDesc(e.target.value)} className="border p-2 rounded text-sm" />
          <button type="submit" disabled={creating}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50">
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      </div>

      <h3 className="font-medium mb-2">Projects</h3>
      {loading && <div className="text-gray-500 text-sm">Loading projects...</div>}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {!loading && !error && projects.length === 0 && (
        <div className="text-gray-400 text-sm py-4 text-center">No projects yet. Create one above.</div>
      )}
      <div className="flex flex-col gap-2">
        {projects.map(p => (
          <button key={p._id} onClick={() => setSelectedProject(p)}
            className="text-left border rounded p-3 hover:bg-blue-50 transition">
            <div className="font-medium">{p.name}</div>
            {p.description && <div className="text-sm text-gray-500 mt-1">{p.description}</div>}
            <div className="text-xs text-gray-400 mt-1">Click to view services →</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Organizations Page ────────────────────────────────────────────────

const Organizations = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedOrg, setSelectedOrg] = useState(null);

  const fetchOrgs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/organizations');
      setOrgs(res.data.organizations);
    } catch (err) {
      if (err.response?.status === 401) { logout(); navigate('/login'); }
      else setError(err.response?.data?.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, []);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!newOrgName.trim()) { setFormError('Organization name is required'); return; }
    try {
      setCreating(true);
      await api.post('/organizations', { name: newOrgName.trim() });
      setNewOrgName('');
      fetchOrgs();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  if (selectedOrg) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded shadow p-6">
          <ProjectPanel org={selectedOrg} onBack={() => setSelectedOrg(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-700">OpsMind</h1>
            <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
          </div>
          <div className="flex gap-4 items-center">
            <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm">
              Dashboard
            </button>
            <button onClick={() => navigate('/github')} className="text-blue-600 hover:underline text-sm">
              GitHub CI/CD
            </button>

            <button onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white rounded shadow p-4 mb-6">
          <h2 className="font-semibold mb-2">New Organization</h2>
          {formError && <div className="text-red-600 text-sm mb-2">{formError}</div>}
          <form onSubmit={handleCreateOrg} className="flex gap-2">
            <input type="text" placeholder="Organization name" value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)} className="flex-1 border p-2 rounded text-sm" />
            <button type="submit" disabled={creating}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-3">My Organizations</h2>
          {loading && <div className="text-gray-500 text-sm">Loading...</div>}
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {!loading && !error && orgs.length === 0 && (
            <div className="text-gray-400 text-sm py-4 text-center">No organizations yet. Create one above.</div>
          )}
          <div className="flex flex-col gap-2">
            {orgs.map(org => (
              <button key={org._id} onClick={() => setSelectedOrg(org)}
                className="text-left border rounded p-3 hover:bg-blue-50 transition">
                <div className="font-medium">{org.name}</div>
                <div className="text-xs text-gray-400">/{org.slug}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Organizations;
