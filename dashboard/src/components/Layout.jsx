import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/',          label: 'Orders',    icon: '📦', end: true },
  { to: '/catalog',   label: 'Catalog',   icon: '🛍'  },
  { to: '/broadcast', label: 'Broadcast', icon: '📢'  },
  { to: '/reports',   label: 'Reports',   icon: '📊'  },
  { to: '/settings',  label: 'Settings',  icon: '⚙️'  },
];

export default function Layout() {
  const navigate = useNavigate();
  const [waConnected, setWaConnected] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('new_order', (order) => {
      toast.success(`New order! ${order.orderRef} — Rs ${(order.totalAmount / 100).toFixed(2)}`, {
        duration: 8000, icon: '🛍',
      });
    });
    socket.on('whatsapp_status', ({ connected }) => setWaConnected(connected));
    return () => socket.disconnect();
  }, []);

  function logout() {
    localStorage.removeItem('token');
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-gray-900 border-r border-gray-800 flex flex-col
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>

        <div className="p-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-green-400">WA Bizz</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              waConnected === true ? 'bg-green-500' :
              waConnected === false ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
            <span className="text-xs text-gray-400">
              {waConnected === true ? 'WhatsApp connected' :
               waConnected === false ? 'WhatsApp disconnected' : 'Checking...'}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-green-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
              }>
              <span>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={logout}
            className="w-full px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            🚪 Log out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-green-400">WA Bizz</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
