import React, { useState, useEffect } from 'react';

const AccessCodeManager = ({ isVisible, onClose }) => {
  const [accessCodes, setAccessCodes] = useState({});
  const [newUser, setNewUser] = useState({ name: '', code: '', userType: 'branch_user', branchId: '' });
  const [editingCode, setEditingCode] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    loadAccessCodes();
  }, []);

  const loadAccessCodes = () => {
    const stored = localStorage.getItem('userAccessCodes');
    if (stored) {
      setAccessCodes(JSON.parse(stored));
    }
  };

  const saveAccessCodes = (codes) => {
    localStorage.setItem('userAccessCodes', JSON.stringify(codes));
    setAccessCodes(codes);
  };

  const addUser = () => {
    if (!newUser.name.trim() || !newUser.code.trim()) {
      setMessage({ text: 'Please fill in all required fields', type: 'error' });
      return;
    }

    const upperCode = newUser.code.toUpperCase();
    
    if (accessCodes[upperCode]) {
      setMessage({ text: 'Access code already exists', type: 'error' });
      return;
    }

    const updatedCodes = {
      ...accessCodes,
      [upperCode]: {
        name: newUser.name.trim(),
        userType: newUser.userType,
        branchId: newUser.userType === 'branch_user' ? newUser.branchId : null
      }
    };

    saveAccessCodes(updatedCodes);
    setNewUser({ name: '', code: '', userType: 'branch_user', branchId: '' });
    setMessage({ text: 'User added successfully!', type: 'success' });
  };

  const updateUser = (code, updatedData) => {
    const updatedCodes = {
      ...accessCodes,
      [code]: updatedData
    };
    saveAccessCodes(updatedCodes);
    setEditingCode(null);
    setMessage({ text: 'User updated successfully!', type: 'success' });
  };

  const deleteUser = (code) => {
    if (window.confirm(`Are you sure you want to delete access code ${code}?`)) {
      const updatedCodes = { ...accessCodes };
      delete updatedCodes[code];
      saveAccessCodes(updatedCodes);
      setMessage({ text: 'User deleted successfully!', type: 'success' });
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewUser({ ...newUser, code: result });
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '15px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
          color: 'white',
          padding: '20px 30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
            Access Code Management
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '30px', maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' }}>
          {/* Message Display */}
          {message.text && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              background: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              {message.text}
            </div>
          )}

          {/* Add New User Section */}
          <div style={{
            background: '#f8f9fa',
            border: '2px solid #e9ecef',
            borderRadius: '10px',
            padding: '20px',
            marginBottom: '30px'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2c3e50' }}>Add New User</h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Enter full name"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Access Code *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newUser.code}
                    onChange={(e) => setNewUser({ ...newUser, code: e.target.value.toUpperCase() })}
                    placeholder="Enter access code"
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    onClick={generateRandomCode}
                    style={{
                      padding: '10px 15px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  User Type
                </label>
                <select
                  value={newUser.userType}
                  onChange={(e) => setNewUser({ ...newUser, userType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="branch_user">Branch User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {newUser.userType === 'branch_user' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                    Branch ID
                  </label>
                  <input
                    type="text"
                    value={newUser.branchId}
                    onChange={(e) => setNewUser({ ...newUser, branchId: e.target.value })}
                    placeholder="Enter branch ID"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={addUser}
              style={{
                background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(40, 167, 69, 0.3)'
              }}
            >
              Add User
            </button>
          </div>

          {/* Existing Users List */}
          <div>
            <h3 style={{ margin: '0 0 20px 0', color: '#2c3e50' }}>Existing Users</h3>
            
            <div style={{
              border: '2px solid #e1e8ed',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
                background: '#f8f9fa',
                borderBottom: '2px solid #e1e8ed',
                fontWeight: '600',
                color: '#2c3e50',
                fontSize: '14px'
              }}>
                <div style={{ padding: '15px' }}>Name</div>
                <div style={{ padding: '15px' }}>Access Code</div>
                <div style={{ padding: '15px' }}>Type</div>
                <div style={{ padding: '15px' }}>Branch ID</div>
                <div style={{ padding: '15px', textAlign: 'center' }}>Actions</div>
              </div>

              {/* Table Body */}
              {Object.entries(accessCodes).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  No users found
                </div>
              ) : (
                Object.entries(accessCodes).map(([code, user], index) => (
                  <div
                    key={code}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
                      borderBottom: index < Object.entries(accessCodes).length - 1 ? '1px solid #e1e8ed' : 'none',
                      background: index % 2 === 0 ? 'white' : '#f8f9fa',
                      fontSize: '14px'
                    }}
                  >
                    {editingCode === code ? (
                      <EditUserRow
                        code={code}
                        user={user}
                        onSave={updateUser}
                        onCancel={() => setEditingCode(null)}
                      />
                    ) : (
                      <>
                        <div style={{ padding: '15px', fontWeight: '500' }}>
                          {user.name}
                        </div>
                        <div style={{ 
                          padding: '15px', 
                          fontFamily: 'monospace',
                          fontWeight: '600',
                          color: '#495057'
                        }}>
                          {code}
                        </div>
                        <div style={{ padding: '15px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: user.userType === 'admin' ? '#dc3545' : '#007bff',
                            color: 'white'
                          }}>
                            {user.userType === 'admin' ? 'Admin' : 'Branch User'}
                          </span>
                        </div>
                        <div style={{ padding: '15px', color: '#6c757d' }}>
                          {user.branchId || 'N/A'}
                        </div>
                        <div style={{ 
                          padding: '15px', 
                          textAlign: 'center',
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center'
                        }}>
                          <button
                            onClick={() => setEditingCode(code)}
                            style={{
                              background: '#ffc107',
                              color: '#212529',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteUser(code)}
                            style={{
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Instructions */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: '#e3f2fd',
            border: '1px solid #90caf9',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#1565c0'
          }}>
            <strong>Instructions:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Access codes should be unique and secure</li>
              <li>Branch users need a valid Branch ID assigned</li>
              <li>Administrators have access to all system functions</li>
              <li>Changes take effect immediately for new logins</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// Edit User Row Component
const EditUserRow = ({ code, user, onSave, onCancel }) => {
  const [editData, setEditData] = useState({
    name: user.name,
    userType: user.userType,
    branchId: user.branchId || ''
  });

  const handleSave = () => {
    if (!editData.name.trim()) {
      alert('Name is required');
      return;
    }
    onSave(code, editData);
  };

  return (
    <>
      <div style={{ padding: '15px' }}>
        <input
          type="text"
          value={editData.name}
          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
          style={{
            width: '100%',
            padding: '6px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '13px',
            boxSizing: 'border-box'
          }}
        />
      </div>
      <div style={{ 
        padding: '15px', 
        fontFamily: 'monospace',
        fontWeight: '600',
        color: '#6c757d',
        display: 'flex',
        alignItems: 'center'
      }}>
        {code}
      </div>
      <div style={{ padding: '15px' }}>
        <select
          value={editData.userType}
          onChange={(e) => setEditData({ ...editData, userType: e.target.value })}
          style={{
            width: '100%',
            padding: '6px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '13px'
          }}
        >
          <option value="branch_user">Branch User</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div style={{ padding: '15px' }}>
        {editData.userType === 'branch_user' ? (
          <input
            type="text"
            value={editData.branchId}
            onChange={(e) => setEditData({ ...editData, branchId: e.target.value })}
            style={{
              width: '100%',
              padding: '6px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        ) : (
          <span style={{ color: '#6c757d' }}>N/A</span>
        )}
      </div>
      <div style={{ 
        padding: '15px', 
        textAlign: 'center',
        display: 'flex',
        gap: '4px',
        justifyContent: 'center'
      }}>
        <button
          onClick={handleSave}
          style={{
            background: '#28a745',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{
            background: '#6c757d',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Cancel
        </button>
      </div>
    </>
  );
};

export default AccessCodeManager;