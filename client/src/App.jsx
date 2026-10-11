import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Organizations from './pages/Organizations';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import GitHubIntegration from './pages/GitHubIntegration';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
          <Route path="/github" element={
            <ProtectedRoute>
              <GitHubIntegration />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
