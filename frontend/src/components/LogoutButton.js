import React from 'react';
import { useNavigate } from 'react-router-dom';

const LogoutButton = ({ style = {}, size = 'normal' }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear all session data
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userType');
    localStorage.removeItem('accessCode');
    localStorage.removeItem('branchId');
    localStorage.removeItem('loginTimestamp');
    
    // Optional: Clear access logs (uncomment if desired)
    // localStorage.removeItem('userAccessLogs');
    
    // Redirect to login
    navigate('/login', { replace: true });
  };

  const defaultStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: size === 'small' ? '6px' : '8px',
    background: 'rgba(220, 53, 69, 0.1)',
    border: '1px solid rgba(220, 53, 69, 0.3)',
    color: '#dc3545',
    padding: size === 'small' ? '6px 12px' : '8px 16px',
    borderRadius: size === 'small' ? '16px' : '20px',
    fontSize: size === 'small' ? '12px' : '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontWeight: '500',
    ...style
  };

  return (
    <button
      onClick={handleLogout}
      style={defaultStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#dc3545';
        e.currentTarget.style.color = 'white';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(220, 53, 69, 0.1)';
        e.currentTarget.style.color = '#dc3545';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <svg 
        width={size === 'small' ? '14' : '16'} 
        height={size === 'small' ? '14' : '16'} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16,17 21,12 16,7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      Logout
    </button>
  );
};

export default LogoutButton;