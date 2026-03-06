import { Component } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignIn from './pages/SignIn';
import Landing from './pages/Landing';
import SchoolProfile from './pages/SchoolProfile';
import Archive from './pages/Archive';
import Metrics from './pages/Metrics';
import PromptEditor from './pages/PromptEditor';
import ChatPanel from './components/ChatPanel';

class RouteErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Route error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
          <p style={{ color: '#ef4444', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Something went wrong: {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ color: '#E8976B', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Try again
          </button>
          {' · '}
          <Link to="/" style={{ color: '#E8976B', fontSize: '0.85rem' }} onClick={() => this.setState({ error: null })}>
            ← Back to list
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

// Force full remount of SchoolProfile when navigating between schools
function SchoolProfileRoute() {
  const { schoolId } = useParams();
  return <SchoolProfile key={schoolId} />;
}

function AppRoutes() {
  const { user } = useAuth();

  if (!user) return <SignIn />;

  return (
    <Routes>
      <Route path="/" element={<RouteErrorBoundary><Landing /></RouteErrorBoundary>} />
      <Route path="/school/:schoolId" element={<RouteErrorBoundary><SchoolProfileRoute /></RouteErrorBoundary>} />
      <Route path="/archive" element={<RouteErrorBoundary><Archive /></RouteErrorBoundary>} />
      <Route path="/metrics" element={<RouteErrorBoundary><Metrics /></RouteErrorBoundary>} />
      <Route path="/admin/prompts" element={<RouteErrorBoundary><PromptEditor /></RouteErrorBoundary>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <ChatPanel />
      </AuthProvider>
    </BrowserRouter>
  );
}
