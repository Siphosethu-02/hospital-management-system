// src/routes/ProtectedRoute.jsx
// Gate for the /app/* section: redirects to /login if not authenticated,
// and optionally restricts to a set of allowed roles (rendering a 403
// message instead of the page if the logged-in role isn't permitted).

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/common/Loader';
import ErrorPage from '../components/common/ErrorPage';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loader fullScreen label="Checking your session..." />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user.role_name || user.role;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <ErrorPage
        code={403}
        title="Access denied"
        message="Your account role doesn't have permission to view this page."
      />
    );
  }

  return children;
}
