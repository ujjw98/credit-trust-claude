import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ actorType, children }) {
  const { actorType: currentType, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-mono text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  if (currentType !== actorType) {
    return <Navigate to="/" replace />;
  }

  return children;
}
