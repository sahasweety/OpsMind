import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { getSocket } from '../api/socket';

function IncidentPanel({ org, onBack }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchIncidents = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/incidents?organizationId=${org._id}&page=${page}&limit=10`);
      setIncidents(res.data.incidents);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents(1);

    const socket = getSocket();
    if (socket) {
      socket.emit('join_org', org._id);

      const onNewIncident = (incident) => {
        setIncidents(prev => [incident, ...prev]);
      };

      socket.on('new_incident', onNewIncident);
      return () => {
        socket.off('new_incident', onNewIncident);
        socket.emit('leave_org', org._id);
      };
    }
  }, [org._id]);

  const loadIncidentDetail = async (id) => {
    try {
      const res = await api.get(`/incidents/${id}`);
      setSelectedIncident(res.data.incident);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load incident detail');
    }
  };

  const handleLifecycle = async (action) => {
    try {
      setActionLoading(true);
      const res = await api.post(`/incidents/${selectedIncident._id}/${action}`);
      // re-fetch the specific incident with evidence populated
      await loadIncidentDetail(selectedIncident._id);
      fetchIncidents(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} incident`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvestigate = async () => {
    try {
      setActionLoading(true);
      const res = await api.post(`/incidents/${selectedIncident._id}/investigate`);
      await loadIncidentDetail(selectedIncident._id);
      fetchIncidents(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to run investigation');
    } finally {
      setActionLoading(false);
    }
  };

  if (selectedIncident) {
    const inc = selectedIncident;
    return (
      <div>
        <button onClick={() => setSelectedIncident(null)} className="mb-4 text-blue-600 hover:underline text-sm">
          ← Back to Incidents
        </button>
        <div className="bg-white border rounded p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-red-700">{inc.title}</h2>
              <p className="text-gray-500">Service: {inc.service?.name}</p>
            </div>
            <div className="flex gap-2 items-center">
              {inc.status === 'open' && (
                 <button disabled={actionLoading} onClick={() => handleLifecycle('acknowledge')} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm font-medium">Acknowledge</button>
              )}
              {(inc.status === 'open' || inc.status === 'acknowledged' || inc.status === 'investigating') && (
                 <button disabled={actionLoading} onClick={() => handleLifecycle('resolve')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium">Resolve</button>
              )}
              {inc.status === 'resolved' && (
                 <button disabled={actionLoading} onClick={() => handleLifecycle('reopen')} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm font-medium">Reopen</button>
              )}
              <span className="px-3 py-1 rounded bg-yellow-100 text-yellow-800 text-sm font-bold capitalize ml-2">{inc.status}</span>
              <span className="px-3 py-1 rounded bg-red-100 text-red-800 text-sm font-bold capitalize">{inc.severity}</span>
            </div>
          </div>
          <div className="text-sm text-gray-500 mb-6">
            First seen: {new Date(inc.firstSeenAt).toLocaleString()}<br/>
            Last seen: {new Date(inc.lastSeenAt).toLocaleString()}<br/>
            {inc.acknowledgedAt && <>Acknowledged: {new Date(inc.acknowledgedAt).toLocaleString()}<br/></>}
            {inc.resolvedAt && <>Resolved: {new Date(inc.resolvedAt).toLocaleString()}</>}
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-4 mb-2">
              <h3 className="font-semibold text-lg">AI Investigation</h3>
              <button
                disabled={actionLoading}
                onClick={handleInvestigate}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
              >
                {actionLoading ? 'Running...' : 'Investigate with AI'}
              </button>
            </div>
            {inc.aiInvestigation?.summary ? (
              <div className="bg-purple-50 p-4 rounded border border-purple-100">
                <p className="font-semibold mb-2">Summary</p>
                <p className="text-gray-700 mb-4">{inc.aiInvestigation.summary}</p>

                {inc.aiInvestigation.hypotheses?.length > 0 && (
                  <>
                    <p className="font-semibold mb-2">Hypotheses</p>
                    <ul className="list-disc pl-5 mb-4 text-gray-700 space-y-2">
                      {inc.aiInvestigation.hypotheses.map((hyp, i) => (
                        <li key={i}>
                          <span className="font-medium text-purple-900">{hyp.rootCause}</span>
                          <div className="text-xs text-gray-500 mt-1">Confidence: {hyp.confidence} | Evidence: {hyp.supportingEvidence?.join(', ')}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {inc.aiInvestigation.recommendedSteps?.length > 0 && (
                  <>
                    <p className="font-semibold mb-2">Recommendations</p>
                    <ul className="list-decimal pl-5 mb-4 text-gray-700">
                      {inc.aiInvestigation.recommendedSteps.map((step, i) => <li key={i}>{step}</li>)}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No investigation performed yet.</div>
            )}
          </div>

          <h3 className="font-semibold text-lg mb-2">Evidence ({inc.evidence?.length || 0} logs)</h3>
          <div className="bg-gray-900 text-gray-100 rounded p-4 text-xs font-mono overflow-auto max-h-64 mb-6">
            {inc.evidence?.map(log => (
              <div key={log._id} className="py-1 border-b border-gray-800">
                <span className="text-gray-500 mr-2">{new Date(log.timestamp).toISOString()}</span>
                <span className="text-red-500">[{log.level}]</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Incidents for {org.name}</h2>
        <button onClick={onBack} className="text-blue-600 hover:underline text-sm">
          Back to Projects
        </button>
      </div>

      {loading && <div className="text-gray-500">Loading incidents...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && incidents.length === 0 && (
        <div className="text-center text-gray-500 py-10 bg-gray-50 rounded border">No incidents reported.</div>
      )}

      <div className="flex flex-col gap-3">
        {incidents.map(inc => (
          <div key={inc._id} onClick={() => loadIncidentDetail(inc._id)} className="border rounded p-4 cursor-pointer hover:bg-gray-50 flex justify-between items-center bg-white">
            <div>
              <div className="font-bold text-red-700">{inc.title}</div>
              <div className="text-sm text-gray-500">{inc.service?.name} · Last seen: {new Date(inc.lastSeenAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-2">
              <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 capitalize font-bold">{inc.status}</span>
              <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800 capitalize font-bold">{inc.severity}</span>
            </div>
          </div>
        ))}
      </div>

      {pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            disabled={pagination.page <= 1}
            onClick={() => fetchIncidents(pagination.page - 1)}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">Page {pagination.page} of {pagination.pages}</span>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchIncidents(pagination.page + 1)}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default IncidentPanel;
