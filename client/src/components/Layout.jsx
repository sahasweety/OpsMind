import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Layers, 
  Server, 
  AlertTriangle, 
  FileText, 
  GitBranch, 
  Webhook, 
  LogOut, 
  ChevronDown, 
  Menu, 
  X,
  Activity,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { organizations, activeOrg, activeOrgId, selectOrg } = useOrg();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Overview', path: '/', icon: LayoutDashboard },
    { label: 'Organizations', path: '/organizations', icon: Building2 },
    { label: 'Projects', path: '/projects', icon: Layers },
    { label: 'Services', path: '/services', icon: Server },
    { label: 'Incidents', path: '/incidents', icon: AlertTriangle },
    { label: 'Logs Explorer', path: '/logs', icon: FileText },
    { label: 'GitHub CI/CD', path: '/github', icon: GitBranch },
    { label: 'Webhooks', path: '/webhooks', icon: Webhook },
  ];

  const userMembership = activeOrg?.members?.find(m => {
    const mId = (m.user?._id ?? m.user)?.toString();
    return mId && user?._id && mId === user._id.toString();
  });
  const currentRole = userMembership?.role || 'member';

  return (
    <div className="min-h-screen flex bg-[#0B0F19] text-slate-100">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#111827] border-r border-slate-800/80 z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <NavLink to="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-white hover:opacity-90 transition">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Activity className="w-5 h-5" />
            </div>
            <span>Ops<span className="text-sky-400">Mind</span></span>
          </NavLink>
          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
            DevOps
          </span>
        </div>

        {/* Organization Switcher */}
        <div className="p-3 border-b border-slate-800/80">
          <div className="relative">
            <button
              onClick={() => setOrgDropdownOpen(prev => !prev)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-left transition group text-xs"
              title="Switch active organization"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="truncate">
                  <div className="font-semibold text-slate-200 truncate">
                    {activeOrg ? activeOrg.name : 'Select Organization'}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize">
                    {activeOrg ? `${currentRole} role` : 'None active'}
                  </div>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 shrink-0" />
            </button>

            {orgDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setOrgDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-40 py-1 max-h-56 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Organizations
                  </div>
                  {organizations.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No organizations found</div>
                  ) : (
                    organizations.map(org => (
                      <button
                        key={org._id}
                        onClick={() => {
                          selectOrg(org._id);
                          setOrgDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 transition ${
                          org._id === activeOrgId ? 'bg-sky-500/10 text-sky-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <span className="truncate">{org.name}</span>
                        {org._id === activeOrgId && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 ml-2" />
                        )}
                      </button>
                    ))
                  )}
                  <div className="border-t border-slate-800 mt-1 pt-1">
                    <NavLink
                      to="/organizations"
                      onClick={() => setOrgDropdownOpen(false)}
                      className="block px-3 py-1.5 text-xs text-sky-400 hover:bg-slate-800 transition font-medium"
                    >
                      + Manage Organizations
                    </NavLink>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-semibold text-slate-200 truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-md transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Mobile & Tablet */}
        <header className="h-16 md:hidden flex items-center justify-between px-4 bg-[#111827] border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold text-lg text-white">
            <Activity className="w-5 h-5 text-sky-400" />
            <span>Ops<span className="text-sky-400">Mind</span></span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#111827] border-b border-slate-800 px-4 py-4 space-y-2 z-30">
            <div className="mb-3 pb-3 border-b border-slate-800 text-xs">
              <div className="text-slate-400 mb-1">Active Organization:</div>
              <div className="font-semibold text-slate-200">{activeOrg?.name || 'None selected'}</div>
            </div>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">{user?.email}</span>
              <button onClick={handleLogout} className="text-red-400 font-semibold hover:underline">
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <main className="flex-1 overflow-y-auto bg-[#0B0F19] p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
