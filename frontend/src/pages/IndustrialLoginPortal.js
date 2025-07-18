import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const IndustrialLoginPortal = () => {
  const [currentScreen, setCurrentScreen] = useState('splash');
  const [accessCode, setAccessCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentScreen === 'login' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentScreen]);

  // Function to log user access for admin tracking
  const logUserAccess = async (userName, accessCode, success, userType) => {
    const logEntry = {
      userName: userName,
      accessCode: accessCode,
      timestamp: new Date().toISOString(),
      success: success,
      userType: userType,
      ipAddress: 'Not available in browser',
      userAgent: navigator.userAgent,
      sessionId: Date.now() + Math.random().toString(36).substr(2, 9)
    };

    console.log('User Access Log:', logEntry);
    
    try {
      const existingLogs = JSON.parse(localStorage.getItem('userAccessLogs') || '[]');
      existingLogs.push(logEntry);
      
      if (existingLogs.length > 100) {
        existingLogs.splice(0, existingLogs.length - 100);
      }
      
      localStorage.setItem('userAccessLogs', JSON.stringify(existingLogs));
    } catch (error) {
      console.error('Failed to store access log:', error);
    }

    return logEntry;
  };

  // Updated login function with hardcoded admin access
  const handleLogin = async () => {
    if (!accessCode.trim()) {
      setError('Please enter your access code');
      return;
    }
  
    setIsLoading(true);
    setMessage('');
    setError('');
  
    try {
      const trimmedCode = accessCode.trim().toUpperCase();
      
      // Check for hardcoded admin access first
      if (trimmedCode === 'ADMIN2025') {
        // Hardcoded admin access
        const userName = 'System Administrator';
        const userType = 'admin';
        
        await logUserAccess(userName, trimmedCode, true, userType);
        
        // Store session data in localStorage (same as original)
        localStorage.setItem('currentUser', userName);
        localStorage.setItem('userType', userType);
        localStorage.setItem('accessCode', trimmedCode);
        localStorage.setItem('loginTimestamp', new Date().toISOString());
        
        // Show success message briefly, then redirect automatically
        setMessage(`Welcome ${userName}! Admin access granted. Redirecting...`);
        
        // Auto-redirect after 1.5 seconds
        setTimeout(() => {
          navigate('/admin');
        }, 1500);
        
        return;
      }
      
      // For other codes, try the server's auth endpoint (updated URL)
      const response = await fetch('https://awisco-cylinder-api.onrender.com/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: trimmedCode })
      });

      const data = await response.json();

      if (response.ok) {
        // Successful authentication
        const { branchId, userName } = data;
        
        // Determine user type based on access code patterns or branch
        const userType = trimmedCode.includes('ADMIN') || trimmedCode.includes('MASTER') || trimmedCode.includes('SUPER') 
          ? 'admin' 
          : 'branch_user';
        
        await logUserAccess(userName, trimmedCode, true, userType);
        
        // Store session data in localStorage
        localStorage.setItem('currentUser', userName);
        localStorage.setItem('userType', userType);
        localStorage.setItem('accessCode', trimmedCode);
        localStorage.setItem('loginTimestamp', new Date().toISOString());
        
        if (branchId) {
          localStorage.setItem('branchId', branchId.toString());
        }
        
        // Show success message briefly, then redirect automatically
        setMessage(`Welcome ${userName}! Access granted. Redirecting...`);
        
        // Auto-redirect after 1.5 seconds
        setTimeout(() => {
          if (userType === 'admin') {
            navigate('/admin');
          } else {
            navigate('/form');
          }
        }, 1500);
        
      } else {
        // Authentication failed
        await logUserAccess('Unknown User', trimmedCode, false, 'unknown');
        
        setAttempts(prev => prev + 1);
        setError(`Invalid access code. ${2 - attempts} attempts remaining.`);
        setAccessCode('');
        
        if (attempts >= 2) {
          setError('Too many failed attempts. Please contact IT support.');
          setTimeout(() => {
            setCurrentScreen('splash');
            setAttempts(0);
            setError('');
          }, 3000);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      
      // If server is not available, still allow hardcoded admin access
      const trimmedCode = accessCode.trim().toUpperCase();
      if (trimmedCode === 'ADMIN2025') {
        const userName = 'System Administrator';
        const userType = 'admin';
        
        await logUserAccess(userName, trimmedCode, true, userType);
        
        localStorage.setItem('currentUser', userName);
        localStorage.setItem('userType', userType);
        localStorage.setItem('accessCode', trimmedCode);
        localStorage.setItem('loginTimestamp', new Date().toISOString());
        
        setMessage(`Welcome ${userName}! Admin access granted (offline mode). Redirecting...`);
        
        setTimeout(() => {
          navigate('/admin');
        }, 1500);
        
        return;
      }
      
      setError('Connection error. Please check your network and try again.');
      await logUserAccess('Unknown User', accessCode.trim().toUpperCase(), false, 'network_error');
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function to clear session
  const logout = () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userType');
    localStorage.removeItem('accessCode');
    localStorage.removeItem('branchId');
    localStorage.removeItem('loginTimestamp');
    
    setCurrentScreen('splash');
    setAccessCode('');
    setAttempts(0);
    setMessage('');
    setError('');
  };

  if (currentScreen === 'splash') {
    return (
      <div 
        onClick={() => setCurrentScreen('login')}
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at center, #2a2a3e 0%, #16161d 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Animated gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 80%, rgba(251, 191, 36, 0.1) 0%, transparent 50%), radial-gradient(circle at 70% 20%, rgba(139, 92, 246, 0.05) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.05) 0%, transparent 70%)',
          animation: 'pulse 4s ease-in-out infinite'
        }} />
        
        {/* Grid pattern overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />

        {/* Floating particles */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: Math.random() * 4 + 2 + 'px',
                height: Math.random() * 4 + 2 + 'px',
                background: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#8b5cf6' : '#60a5fa',
                borderRadius: '50%',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                opacity: Math.random() * 0.5 + 0.2,
                animation: `float ${20 + Math.random() * 10}s linear infinite`,
                animationDelay: Math.random() * 20 + 's'
              }}
            />
          ))}
        </div>

        {/* Logo container with glow effect */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          animation: 'fadeIn 1s ease-out'
        }}>
          <div style={{
            position: 'absolute',
            inset: '-50px',
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animation: 'glow 3s ease-in-out infinite'
          }} />
          <img 
            src="/logo.jpg" 
            alt="AWISCO Logo" 
            style={{ 
              height: '180px', 
              marginBottom: '40px',
              filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3)) brightness(1.1) contrast(1.1)',
              position: 'relative',
              zIndex: 1,
              display: 'block',
              animation: 'logoFloat 3s ease-in-out infinite'
            }}
            onError={(e) => {
              console.error('Failed to load logo from:', e.target.src);
              e.target.style.display = 'none';
              document.getElementById('fallback-logo').style.display = 'flex';
            }}
            onLoad={(e) => {
              console.log('Logo loaded successfully from:', e.target.src);
            }}
          />
        </div>
        <div 
          id="fallback-logo"
          style={{ 
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
            position: 'relative',
            zIndex: 1
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="#FFD700">
              <path d="M2,11L7,9L10,13L13,9L18,11L17,14H18C18.6,14 19,14.4 19,15V21H17V15H7V21H5V15C5,14.4 5.4,14 6,14H7L6,11H2V11Z"/>
              <circle cx="12" cy="7" r="2"/>
            </svg>
            <span style={{ 
              fontSize: '80px', 
              fontWeight: '900', 
              color: '#FFD700',
              textShadow: '3px 3px 6px rgba(0,0,0,0.7)',
              fontFamily: 'Arial Black, sans-serif'
            }}>
              AWISCO
            </span>
          </div>
          <div style={{ 
            color: '#888', 
            marginTop: '10px',
            fontSize: '18px',
            letterSpacing: '3px',
            textTransform: 'uppercase'
          }}>
            Industrial Solutions
          </div>
        </div>

        {/* Industry tags with better styling */}
        <div style={{
          color: '#fbbf24',
          fontSize: '14px',
          letterSpacing: '3px',
          marginBottom: '60px',
          position: 'relative',
          zIndex: 1,
          textTransform: 'uppercase',
          fontWeight: '500',
          textShadow: '0 2px 4px rgba(0,0,0,0.3)',
          animation: 'fadeIn 1.5s ease-out'
        }}>
          <span style={{ opacity: 0.8 }}>•</span> WELDING <span style={{ opacity: 0.8 }}>•</span> CONSTRUCTION <span style={{ opacity: 0.8 }}>•</span> MANUFACTURING <span style={{ opacity: 0.8 }}>•</span>
        </div>

        {/* Enhanced Continue button */}
        <div style={{
          position: 'relative',
          animation: 'fadeIn 2s ease-out'
        }}>
          <div style={{
            color: 'white',
            fontSize: '22px',
            padding: '18px 60px',
            border: '2px solid rgba(251, 191, 36, 0.5)',
            borderRadius: '50px',
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden',
            fontWeight: '300',
            letterSpacing: '2px',
            textTransform: 'uppercase'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.3) 0%, rgba(139, 92, 246, 0.1) 100%)';
            e.currentTarget.style.borderColor = '#fbbf24';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(251, 191, 36, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)';
            e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.5)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}>
            Click to Continue
          </div>
        </div>

        {/* Add animations */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
          }
          @keyframes float {
            from { transform: translateY(100vh) rotate(0deg); }
            to { transform: translateY(-100vh) rotate(360deg); }
          }
          @keyframes glow {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.1); }
          }
          @keyframes logoFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative'
    }}>
      <button
        onClick={() => {
          setCurrentScreen('splash');
          setAccessCode('');
          setMessage('');
          setError('');
        }}
        style={{
          position: 'absolute',
          top: '30px',
          left: '30px',
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '50px',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          color: '#666',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateX(-5px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateX(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        ← Back
      </button>

      <div style={{
        background: 'white',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '450px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #2c3e50 0%, #1a1a1a 100%)',
          padding: '40px',
          textAlign: 'center',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <img 
            src="/logo.jpg" 
            alt="AWISCO Logo" 
            style={{ 
              height: '80px', 
              marginBottom: '20px',
              display: 'block'
            }}
            onError={(e) => {
              console.error('Login page - Failed to load logo from:', e.target.src);
              e.target.style.display = 'none';
              document.getElementById('fallback-logo-login').style.display = 'flex';
            }}
            onLoad={(e) => {
              console.log('Login page - Logo loaded successfully from:', e.target.src);
            }}
          />
          <div 
            id="fallback-logo-login"
            style={{ 
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '15px',
              marginBottom: '20px'
            }}>
            <svg width="50" height="50" viewBox="0 0 24 24" fill="#FFD700">
              <path d="M2,11L7,9L10,13L13,9L18,11L17,14H18C18.6,14 19,14.4 19,15V21H17V15H7V21H5V15C5,14.4 5.4,14 6,14H7L6,11H2V11Z"/>
              <circle cx="12" cy="7" r="2"/>
            </svg>
            <span style={{ fontSize: '40px', fontWeight: '900', color: '#FFD700' }}>AWISCO</span>
          </div>
          <h2 style={{ 
            color: 'white', 
            fontSize: '24px', 
            marginBottom: '10px',
            margin: '0 0 10px 0'
          }}>Secure Portal Access</h2>
          <p style={{ 
            color: '#ccc', 
            fontSize: '14px',
            margin: '0'
          }}>Industrial Management System</p>
        </div>

        <div style={{ padding: '40px' }}>
          {/* SUCCESS MESSAGE DISPLAY */}
          {message && (
            <div style={{
              background: '#d4edda',
              color: '#155724',
              border: '1px solid #c3e6cb',
              borderRadius: '10px',
              padding: '15px',
              marginBottom: '20px',
              textAlign: 'center',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              {message}
            </div>
          )}

          {/* ERROR MESSAGE DISPLAY */}
          {error && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              border: '1px solid #f5c6cb',
              borderRadius: '10px',
              padding: '15px',
              marginBottom: '20px',
              textAlign: 'center',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              {error}
            </div>
          )}

          <div style={{
            background: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '10px',
            padding: '15px',
            marginBottom: '30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span style={{ color: '#666', fontSize: '14px', fontWeight: '500' }}>Security Status</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#28a745'
              }} />
              <span style={{ color: '#28a745', fontSize: '14px' }}>Active</span>
            </div>
          </div>

          {/* Access Code Input */}
          <div style={{ marginBottom: '30px' }}>
            <label style={{
              display: 'block',
              marginBottom: '10px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center'
            }}>
              Personal Access Code
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter your access code"
                disabled={isLoading || message}
                style={{
                  width: '100%',
                  padding: '15px',
                  paddingRight: '50px',
                  fontSize: '18px',
                  border: '2px solid #e1e5e9',
                  borderRadius: '10px',
                  outline: 'none',
                  transition: 'border-color 0.3s ease',
                  fontFamily: 'monospace',
                  letterSpacing: '2px',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  opacity: (isLoading || message) ? 0.6 : 1
                }}
                onFocus={(e) => e.target.style.borderColor = '#4285f4'}
                onBlur={(e) => e.target.style.borderColor = '#e1e5e9'}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading || message}
                style={{
                  position: 'absolute',
                  right: '15px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: (isLoading || message) ? 'not-allowed' : 'pointer',
                  color: '#666',
                  padding: '5px',
                  opacity: (isLoading || message) ? 0.6 : 1
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={isLoading || !accessCode || message}
            style={{
              width: '100%',
              padding: '15px',
              background: (isLoading || !accessCode || message) ? '#ccc' : 'linear-gradient(135deg, #333 0%, #000 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: (isLoading || !accessCode || message) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: (isLoading || !accessCode || message) ? 'none' : '0 4px 15px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={(e) => {
              if (!isLoading && accessCode && !message) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = (isLoading || !accessCode || message) ? 'none' : '0 4px 15px rgba(0,0,0,0.2)';
            }}
          >
            {isLoading ? 'Authenticating...' : message ? 'Redirecting...' : 'Access System'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <p style={{ color: '#888', fontSize: '12px' }}>
              Need help? Contact IT support at ext. 2001
            </p>
            <p style={{ color: '#aaa', fontSize: '11px', marginTop: '5px' }}>
              All access attempts are monitored and logged
            </p>
          </div>

          {/* Access Logs Info */}
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: '#e8f5e8',
            border: '1px solid #c3e6c3',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#2d5d2d',
            textAlign: 'center'
          }}>
            🔒 Authorized personnel only - Personal access codes required
          </div>

          {/* Clear existing session button */}
          {localStorage.getItem('currentUser') && !message && (
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <button
                onClick={logout}
                style={{
                  background: 'none',
                  border: '1px solid #dc3545',
                  color: '#dc3545',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc3545';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = '#dc3545';
                }}
              >
                Clear Previous Session
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndustrialLoginPortal;
