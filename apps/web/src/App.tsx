import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from './api/errors.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProjectPage } from './pages/ProjectPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { ThreatModelPage } from './pages/ThreatModelPage.js';
import { RequireSession } from './session/RequireSession.js';
import { SessionProvider } from './session/SessionProvider.js';

// Nothing refetches in the background: no interval, and no refetch on window focus or reconnect. Only
// user actions cause requests, so an idle tab doesn't keep its session alive past the idle limit.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000,
    },
  },
});

// The routes, without the router around them, so tests can render them in a MemoryRouter.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/threat-models/:threatModelId" element={<ThreatModelPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
