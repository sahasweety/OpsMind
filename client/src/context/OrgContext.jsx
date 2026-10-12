import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

export const OrgContext = createContext();

const STORAGE_KEY = 'opsmind.activeOrgId';

export const OrgProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
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
        if (list.length === 0) {
          localStorage.removeItem(STORAGE_KEY);
          return '';
        }
        const exists = list.some(o => o._id === current);
        const nextId = exists ? current : list[0]._id;
        localStorage.setItem(STORAGE_KEY, nextId);
        return nextId;
      });
      return list;
    } catch (err) {
      if (err.response?.status !== 401) {
        setError(err.response?.data?.message || 'Failed to load organizations');
      } else {
        setOrganizations([]);
      }
      return [];
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

  const addOrganization = useCallback((newOrg) => {
    if (!newOrg || !newOrg._id) return;
    setOrganizations(prev => {
      const exists = prev.some(o => o._id === newOrg._id);
      if (exists) {
        return prev.map(o => (o._id === newOrg._id ? newOrg : o));
      }
      return [...prev, newOrg];
    });
    setActiveOrgId(newOrg._id);
    localStorage.setItem(STORAGE_KEY, newOrg._id);
  }, []);

  // Fetch organizations when context initializes with authenticated user or when user changes
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      fetchOrganizations();
    } else {
      setOrganizations([]);
      setActiveOrgId('');
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      setError(null);
    }
  }, [user, authLoading, fetchOrganizations]);

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
      addOrganization,
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
