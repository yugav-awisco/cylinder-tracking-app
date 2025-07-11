import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredUserType = null }) => {
  // Check authentication
  const currentUser = localStorage.getItem('currentUser');
  const userType = localStorage.getItem('userType');
  const accessCode = localStorage.getItem('accessCode');
  const loginTimestamp = localStorage.getItem('loginTimestamp');

  // Check if user is authenticated
  const isAuthenticated = currentUser && userType && accessCode;

  // Check session expiry (optional - 24 hours)
  const isSessionValid = () => {
    if (!loginTimestamp) return false;
    
    const loginTime = new Date(loginTimestamp);
    const now = new Date();
    const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
    
    // Session expires after 24 hours
    return hoursDiff < 24;
  };

  // If not authenticated, redirect to login
  if (!isAuthenticated || !isSessionValid()) {
    // Clear invalid session data
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userType');
    localStorage.removeItem('accessCode');
    localStorage.removeItem('branchId');
    localStorage.removeItem('loginTimestamp');
    
    return <Navigate to="/login" replace />;
  }

  // If specific user type is required, check it
  if (requiredUserType && userType !== requiredUserType) {
    // Redirect to appropriate page based on user type
    if (userType === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (userType === 'branch_user') {
      return <Navigate to="/form" replace />;
    } else {
      return <Navigate to="/login" replace />;
    }
  }

  // If all checks pass, render the protected component
  return children;
};

export default ProtectedRoute;