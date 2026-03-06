import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignIn from './pages/SignIn';
import Landing from './pages/Landing';
import SchoolProfile from './pages/SchoolProfile';
import Archive from './pages/Archive';
import Metrics from './pages/Metrics';
import PromptEditor from './pages/PromptEditor';
import ChatPanel from './components/ChatPanel';

function AppRoutes() {
  const { user } = useAuth();

  if (!user) return <SignIn />;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/school/:schoolId" element={<SchoolProfile />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/metrics" element={<Metrics />} />
      <Route path="/admin/prompts" element={<PromptEditor />} />
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
