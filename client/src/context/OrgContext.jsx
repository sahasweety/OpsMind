import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../api/client';
import { getSocket } from '../api/socket';

export const OrgContext = createContext();

const STORAGE_KEY = 'opsmind.activeOrgId';

export const OrgProvider = ({ children }) => {
  const [organizations, setOrganizations] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/organizations');
      const list = res.data.organizations || [];
      setOrganizations(list);

      setActiveOrgId(current => {
        if (list.length === 0) return '';
        const exists = list.some(o => o._id === current);
        const nextId = exists ? current : list[0]._id;
        localStorage.setItem(STORAGE_KEY, nextId);
        return nextId;
      });
    } catch (err) {
      if (err.response?.status !== 401) {
        setError(err.response?.data?.message || 'Failed to load organizations');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const selectOrg = useCallback((orgId) => {
    setActiveOrgId(orgId);
    if (orgId) {
      localStorage.setItem(STORAGE_KEY, orgId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Join/leave socket room on active org switch
  useEffect(() => {
    const socket = getSocket();
    if (socket && activeOrgId) {
      socket.emit('join_org', activeOrgId);
      return () => {
        socket.emit('leave_org', activeOrgId);
      };
    }
  }, [activeOrgId]);

  const activeOrg = organizations.find(o => o._id === activeOrgId) || null;

  return (
    <OrgContext.Provider value={{
      organizations,
      activeOrg,
      activeOrgId,
      selectOrg,
      fetchOrganizations,
      loading,
      error
    }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
};
