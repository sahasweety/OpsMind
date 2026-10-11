import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Organizations from './pages/Organizations';
import Projects from './pages/Projects';
import Services from './pages/Services';
import Dashboard from './pages/Dashboard';
import Incidents from './pages/Incidents';
import LogsExplorer from './pages/LogsExplorer';
import GitHubIntegration from './pages/GitHubIntegration';
import Webhooks from './pages/Webhooks';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Authenticated Dashboard Routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/organizations" element={
              <ProtectedRoute>
                <Organizations />
              </ProtectedRoute>
            } />
            <Route path="/projects" element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            } />
            <Route path="/services" element={
              <ProtectedRoute>
                <Services />
              </ProtectedRoute>
            } />
            <Route path="/incidents" element={
              <ProtectedRoute>
                <Incidents />
              </ProtectedRoute>
            } />
            <Route path="/logs" element={
              <ProtectedRoute>
                <LogsExplorer />
              </ProtectedRoute>
            } />
            <Route path="/github" element={
              <ProtectedRoute>
                <GitHubIntegration />
              </ProtectedRoute>
            } />
            <Route path="/webhooks" element={
              <ProtectedRoute>
                <Webhooks />
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </OrgProvider>
    </AuthProvider>
  );
}

export default App;
