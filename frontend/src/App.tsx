import { useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import GenerationStatusPanel from "./components/GenerationStatusPanel";
import { AuthProvider, useAuth } from "./context/AuthContext";import { GenerationProvider } from "./context/GenerationContext";
import { useTheme } from "./context/ThemeContext";
import ApuntesPage from "./pages/ApuntesPage";
import ChatPage from "./pages/ChatPage";
import ClassLogPage from "./pages/ClassLogPage";
import DAGPage from "./pages/DAGPage";
import DashboardPage from "./pages/DashboardPage";
import GeometryLab from "./pages/GeometryLab";
import LoginPage from "./pages/LoginPage";
import PracticePage from "./pages/PracticePage";
import TopicsPage from "./pages/TopicsPage";
import TrainingPage from "./pages/TrainingPage";

const navItems = [
  { to: "/", label: "Panel Principal", icon: "📊" },
  { to: "/topics", label: "Temas", icon: "📚" },
  { to: "/dag", label: "Mapa DAG", icon: "🗺️" },
  { to: "/practice", label: "Práctica", icon: "✏️" },
  { to: "/geometry", label: "Geometría", icon: "📐" },
  { to: "/chat", label: "Tutor IA", icon: "🤖" },
  { to: "/training", label: "Entrenamiento", icon: "🎯" },
  { to: "/apuntes", label: "Apuntes", icon: "📋" },
  { to: "/class-log", label: "Registro", icon: "📝" },
];

export default function App() {
  return (
    <AuthProvider>
      <GenerationProvider>
        <AppContent />
      </GenerationProvider>
    </AuthProvider>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Overlay móvil */}
        {menuOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}>
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-indigo-700 dark:text-indigo-400">
                MathGraph Lab
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Aprendizaje Matemático
              </p>
            </div>
            {/* Cerrar sidebar en móvil */}
            <button
              onClick={() => setMenuOpen(false)}
              className="lg:hidden p-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Cerrar menú">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <nav className="flex-1 p-3 sm:p-4 space-y-0.5 sm:space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`
                }>
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium">
              <span>{isDark ? "🌞" : "🌙"}</span>
              {isDark ? "Claro" : "Oscuro"}
            </button>
            {user && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Usuario: <span className="font-medium">{user.username}</span>
                </p>
                <button
                  onClick={logout}
                  className="w-full text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1.5 rounded transition font-medium">
                  🚪 Cerrar sesión
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              v1.0
            </p>
          </div>
        </aside>

        {/* Main content + footer */}
        <div className="flex-1 flex flex-col min-h-0 w-full">
          {/* Mobile top bar */}
          <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Abrir menú">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
              MathGraph Lab
            </h1>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
              <span className="text-lg">{isDark ? "🌞" : "🌙"}</span>
            </button>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/topics"
                  element={
                    <ProtectedRoute>
                      <TopicsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/topics/:id"
                  element={
                    <ProtectedRoute>
                      <TopicsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dag"
                  element={
                    <ProtectedRoute>
                      <DAGPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/practice"
                  element={
                    <ProtectedRoute>
                      <PracticePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/geometry"
                  element={
                    <ProtectedRoute>
                      <GeometryLab />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/ai-tutor"
                  element={<Navigate to="/chat" replace />}
                />
                <Route
                  path="/training"
                  element={
                    <ProtectedRoute>
                      <TrainingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <ChatPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/class-log"
                  element={
                    <ProtectedRoute>
                      <ClassLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/apuntes"
                  element={
                    <ProtectedRoute>
                      <ApuntesPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>
          </main>

          {/* Footer de estado de generación */}
          <GenerationStatusPanel />
        </div>
      </div>
    </BrowserRouter>
  );
}
