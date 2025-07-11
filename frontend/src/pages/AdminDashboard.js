import React, { useState, useEffect } from 'react';

const AdminDashboard = () => {
  const [records, setRecords] = useState([]);
  const [groupedRecords, setGroupedRecords] = useState([]);
  const [expandedSubmissions, setExpandedSubmissions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalBranches: 0,
    totalSubmissions: 0,
    thisWeek: 0,
    pending: 0
  });
  const [filters, setFilters] = useState({
    date: '',
    branchId: ''
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  
  // User management state
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [userManagementLoading, setUserManagementLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({
    code: '',
    user_name: '',
    branch_id: '',
    active: true
  });

  // Get current week's Sunday for default filter
  const getCurrentWeekSunday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    return sunday.toISOString().split('T')[0];
  };

  // Group records by submission (same branch, date, user, and submitted time)
  const groupRecordsBySubmission = (records) => {
    const groups = {};
    
    records.forEach(record => {
      // Create a unique key for each submission
      const submissionKey = `${record.branchId}_${record.weekEnding}_${record.submittedBy}_${new Date(record.submittedAt).getTime()}`;
      
      if (!groups[submissionKey]) {
        groups[submissionKey] = {
          id: submissionKey,
          branchId: record.branchId,
          branchName: record.branchName,
          weekEnding: record.weekEnding,
          submittedBy: record.submittedBy,
          submittedAt: record.submittedAt,
          records: [],
          totalCylinders: 0
        };
      }
      
      groups[submissionKey].records.push(record);
      groups[submissionKey].totalCylinders += record.fullCount + record.emptyCount;
    });
    
    return Object.values(groups).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  };

  // Fetch records using the updated admin/records endpoint
  const fetchRecords = async () => {
    setLoading(true);
    setError('');
    
    try {
      let url = 'https://awisco-cylinder-api.onrender.com/admin/records?limit=1000';
      
      if (filters.branchId) {
        url += `&branchId=${filters.branchId}`;
      }
      
      if (filters.date) {
        url += `&date=${filters.date}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Admin records response:', data);
      
      // Only use real data from server - no fallback demo data
      setRecords(data || []);
      setGroupedRecords(groupRecordsBySubmission(data || []));
      calculateStats(data || []);
      
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      // Set empty arrays when there's an error - no demo data
      setRecords([]);
      setGroupedRecords([]);
      setStats({
        totalBranches: 0,
        totalSubmissions: 0,
        thisWeek: 0,
        pending: 0
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const calculateStats = (data) => {
    const uniqueBranches = new Set(data.map(r => r.branchId)).size;
    const thisWeekDate = getCurrentWeekSunday();
    const thisWeekSubmissions = data.filter(r => r.weekEnding === thisWeekDate).length;
    
    // Get total branches from the system
    fetch('https://awisco-cylinder-api.onrender.com/branches')
      .then(response => response.json())
      .then(branches => {
        setStats({
          totalBranches: branches.length,
          totalSubmissions: data.length,
          thisWeek: thisWeekSubmissions,
          pending: Math.max(0, branches.length - uniqueBranches)
        });
      })
      .catch(() => {
        setStats({
          totalBranches: uniqueBranches,
          totalSubmissions: data.length,
          thisWeek: thisWeekSubmissions,
          pending: 0
        });
      });
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({ date: '', branchId: '' });
  };

  // Delete all records
  const deleteAllRecords = async () => {
    const confirmMessage = `⚠️ DANGER: This will permanently delete ALL inventory records from the database.\n\nThis action CANNOT be undone!\n\nType "DELETE ALL" to confirm:`;
    
    const userInput = prompt(confirmMessage);
    
    if (userInput !== "DELETE ALL") {
      return; // User cancelled or didn't type the exact phrase
    }
    
    const finalConfirm = window.confirm("Last chance! Are you absolutely sure you want to delete ALL records? This cannot be undone!");
    
    if (!finalConfirm) {
      return;
    }

    setDeleteAllLoading(true);
    try {
      const response = await fetch('https://awisco-cylinder-api.onrender.com/admin/records/delete-all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete records: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Refresh the records after deletion
      await fetchRecords();
      
      setError(''); // Clear any previous errors
      alert(`Success: ${result.deletedCount || 'All'} records have been deleted.`);
      
    } catch (err) {
      console.error('Delete all error:', err);
      setError(`Failed to delete records: ${err.message}`);
    } finally {
      setDeleteAllLoading(false);
    }
  };

  // Toggle expansion of a submission
  const toggleSubmissionExpansion = (submissionId) => {
    const newExpanded = new Set(expandedSubmissions);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
    }
    setExpandedSubmissions(newExpanded);
  };

  // Export data using the server endpoint
  const exportData = async () => {
    setExportLoading(true);
    try {
      let url = 'https://awisco-cylinder-api.onrender.com/admin/export?format=csv';
      
      if (filters.branchId) {
        url += `&branchId=${filters.branchId}`;
      }
      
      if (filters.date) {
        url += `&date=${filters.date}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get the filename from the response headers or create a default one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `inventory_records_${new Date().toISOString().split('T')[0]}.csv`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url_obj = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url_obj;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url_obj);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`Export failed: ${err.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  // Fetch users and branches for management
  const fetchUsersAndBranches = async () => {
    setUserManagementLoading(true);
    try {
      // Fetch access codes (users)
      const usersResponse = await fetch('https://awisco-cylinder-api.onrender.com/admin/users');
      let usersData = [];
      if (usersResponse.ok) {
        usersData = await usersResponse.json();
      }
      setUsers(usersData);

      // Fetch branches
      const branchesResponse = await fetch('https://awisco-cylinder-api.onrender.com/branches');
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        setBranches(branchesData);
      }
    } catch (err) {
      console.error('Error fetching users/branches:', err);
    } finally {
      setUserManagementLoading(false);
    }
  };

  // Save user (create or update)
  const saveUser = async (userData) => {
    try {
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser ? `https://awisco-cylinder-api.onrender.com/admin/users/${editingUser.id}` : 'https://awisco-cylinder-api.onrender.com/admin/users';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        throw new Error(`Failed to save user: ${response.statusText}`);
      }

      // Refresh users list
      await fetchUsersAndBranches();
      setEditingUser(null);
      setNewUser({ code: '', user_name: '', branch_id: '', active: true });
    } catch (err) {
      console.error('Error saving user:', err);
      setError(`Failed to save user: ${err.message}`);
    }
  };

  // Delete user
  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const response = await fetch(`https://awisco-cylinder-api.onrender.com/admin/users/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete user: ${response.statusText}`);
      }

      await fetchUsersAndBranches();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(`Failed to delete user: ${err.message}`);
    }
  };

  // Logout function
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };

  useEffect(() => {
    fetchRecords();
  }, [filters]);

  useEffect(() => {
    // Set default date filter to current week
    setFilters(prev => ({ ...prev, date: getCurrentWeekSunday() }));
  }, []);

  useEffect(() => {
    if (showUserManagement) {
      fetchUsersAndBranches();
    }
  }, [showUserManagement]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '20px 0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '28px', 
              fontWeight: '700',
              color: '#1a202c'
            }}>
              Admin Dashboard
            </h1>
            <p style={{ 
              margin: '4px 0 0 0', 
              color: '#718096',
              fontSize: '16px'
            }}>
              Inventory Management System - Administrative Portal
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: '#f7fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span style={{ color: '#4a5568', fontSize: '14px', fontWeight: '500' }}>
                System Administrator
              </span>
            </div>

            <button
              onClick={() => setShowUserManagement(!showUserManagement)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: showUserManagement ? '#805ad5' : '#6b46c1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              {showUserManagement ? 'Hide' : 'Manage'} Users
            </button>

            <button
              onClick={deleteAllRecords}
              disabled={deleteAllLoading || records.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: deleteAllLoading ? '#9ca3af' : (records.length === 0 ? '#d1d5db' : '#dc2626'),
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: (deleteAllLoading || records.length === 0) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!deleteAllLoading && records.length > 0) {
                  e.currentTarget.style.background = '#b91c1c';
                }
              }}
              onMouseLeave={(e) => {
                if (!deleteAllLoading && records.length > 0) {
                  e.currentTarget.style.background = '#dc2626';
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              {deleteAllLoading ? 'Deleting...' : 'Delete All Records'}
            </button>
            
            <button
              onClick={exportData}
              disabled={exportLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: exportLoading ? '#9ca3af' : '#3182ce',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: exportLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => !exportLoading && (e.currentTarget.style.background = '#2c5aa0')}
              onMouseLeave={(e) => !exportLoading && (e.currentTarget.style.background = '#3182ce')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              {exportLoading ? 'Exporting...' : 'Export All'}
            </button>
            
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: '#e53e3e',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#c53030'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#e53e3e'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16,17 21,12 16,7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '24px'
      }}>
        {/* User Management Section */}
        {showUserManagement && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ 
              margin: '0 0 20px 0', 
              fontSize: '18px', 
              fontWeight: '600',
              color: '#1a202c'
            }}>
              User Management
            </h3>

            {/* Add/Edit User Form */}
            <div style={{
              background: '#f7fafc',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
                {editingUser ? 'Edit User' : 'Add New User'}
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <input
                  type="text"
                  placeholder="Access Code"
                  value={editingUser ? editingUser.code : newUser.code}
                  onChange={(e) => editingUser 
                    ? setEditingUser({...editingUser, code: e.target.value})
                    : setNewUser({...newUser, code: e.target.value})
                  }
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="text"
                  placeholder="User Name"
                  value={editingUser ? editingUser.user_name : newUser.user_name}
                  onChange={(e) => editingUser 
                    ? setEditingUser({...editingUser, user_name: e.target.value})
                    : setNewUser({...newUser, user_name: e.target.value})
                  }
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
                <select
                  value={editingUser ? editingUser.branch_id : newUser.branch_id}
                  onChange={(e) => editingUser 
                    ? setEditingUser({...editingUser, branch_id: e.target.value})
                    : setNewUser({...newUser, branch_id: e.target.value})
                  }
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select Branch</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} (ID: {branch.id})
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={editingUser ? editingUser.active : newUser.active}
                    onChange={(e) => editingUser 
                      ? setEditingUser({...editingUser, active: e.target.checked})
                      : setNewUser({...newUser, active: e.target.checked})
                    }
                  />
                  <label style={{ fontSize: '14px' }}>Active</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => saveUser(editingUser || newUser)}
                  style={{
                    padding: '10px 20px',
                    background: '#38a169',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  {editingUser ? 'Update' : 'Add'} User
                </button>
                {editingUser && (
                  <button
                    onClick={() => {
                      setEditingUser(null);
                      setNewUser({ code: '', user_name: '', branch_id: '', active: true });
                    }}
                    style={{
                      padding: '10px 20px',
                      background: '#718096',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Users List */}
            {userManagementLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>Loading users...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Access Code</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>User Name</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Branch</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px', fontWeight: '500' }}>{user.code}</td>
                        <td style={{ padding: '12px' }}>{user.user_name || 'No Name'}</td>
                        <td style={{ padding: '12px' }}>
                          {branches.find(b => b.id === user.branch_id)?.name || `Branch ${user.branch_id}`}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background: user.active ? '#c6f6d5' : '#fed7d7',
                            color: user.active ? '#22543d' : '#742a2a'
                          }}>
                            {user.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                              onClick={() => setEditingUser(user)}
                              style={{
                                padding: '6px 12px',
                                background: '#3182ce',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteUser(user.id)}
                              style={{
                                padding: '6px 12px',
                                background: '#e53e3e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#718096', fontSize: '14px', fontWeight: '500' }}>Total Branches</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '32px', fontWeight: '700', color: '#1a202c' }}>
                  {stats.totalBranches}
                </p>
              </div>
              <div style={{
                width: '48px',
                height: '48px',
                background: '#ebf8ff',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3182ce" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#718096', fontSize: '14px', fontWeight: '500' }}>Total Submissions</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '32px', fontWeight: '700', color: '#1a202c' }}>
                  {stats.totalSubmissions}
                </p>
              </div>
              <div style={{
                width: '48px',
                height: '48px',
                background: '#f0fff4',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38a169" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#718096', fontSize: '14px', fontWeight: '500' }}>This Week</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '32px', fontWeight: '700', color: '#1a202c' }}>
                  {stats.thisWeek}
                </p>
              </div>
              <div style={{
                width: '48px',
                height: '48px',
                background: '#fffbeb',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d69e2e" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, color: '#718096', fontSize: '14px', fontWeight: '500' }}>Pending</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '32px', fontWeight: '700', color: '#1a202c' }}>
                  {stats.pending}
                </p>
              </div>
              <div style={{
                width: '48px',
                height: '48px',
                background: '#fed7d7',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12,6 12,12 16,14"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 20px 0', 
            fontSize: '18px', 
            fontWeight: '600',
            color: '#1a202c',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"></polygon>
            </svg>
            Filter Records
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            alignItems: 'end'
          }}>
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '6px', 
                fontSize: '14px', 
                fontWeight: '500',
                color: '#4a5568'
              }}>
                Filter by Date:
              </label>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => handleFilterChange('date', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '6px', 
                fontSize: '14px', 
                fontWeight: '500',
                color: '#4a5568'
              }}>
                Filter by Branch:
              </label>
              <input
                type="text"
                placeholder="Enter branch ID"
                value={filters.branchId}
                onChange={(e) => handleFilterChange('branchId', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={clearFilters}
              style={{
                padding: '10px 20px',
                background: '#718096',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#4a5568'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#718096'}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fed7d7',
            color: '#9b2c2c',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px',
            border: '1px solid #feb2b2'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Records Table */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            background: '#f7fafc',
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '18px', 
              fontWeight: '600',
              color: '#1a202c'
            }}>
              Inventory Records
            </h3>
          </div>

          {loading ? (
            <div style={{ 
              padding: '48px', 
              textAlign: 'center',
              color: '#718096'
            }}>
              <div style={{ fontSize: '16px' }}>Loading records...</div>
            </div>
          ) : groupedRecords.length === 0 ? (
            <div style={{ 
              padding: '48px', 
              textAlign: 'center',
              color: '#718096'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 16px' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>No records found</div>
              <div style={{ fontSize: '14px' }}>Try adjusting your filters or check if data has been submitted</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568', width: '50px' }}></th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Branch</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Week Ending</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Total Cylinders</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Cylinder Types</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Submitted By</th>
                    <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRecords.map((submission) => (
                    <React.Fragment key={submission.id}>
                      {/* Main submission row */}
                      <tr 
                        style={{ 
                          borderBottom: '1px solid #e2e8f0',
                          cursor: 'pointer',
                          background: expandedSubmissions.has(submission.id) ? '#f8fafc' : 'white'
                        }}
                        onClick={() => toggleSubmissionExpansion(submission.id)}
                      >
                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                          <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="#4a5568" 
                            strokeWidth="2"
                            style={{
                              transform: expandedSubmissions.has(submission.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s'
                            }}
                          >
                            <polyline points="9,18 15,12 9,6"></polyline>
                          </svg>
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ fontWeight: '500', color: '#1a202c' }}>
                            {submission.branchName || `Branch ${submission.branchId}`}
                          </div>
                          <div style={{ fontSize: '14px', color: '#718096' }}>
                            ID: {submission.branchId}
                          </div>
                        </td>
                        <td style={{ padding: '16px 24px', color: '#4a5568' }}>
                          {new Date(submission.weekEnding).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: '600', color: '#3182ce' }}>
                          {submission.totalCylinders}
                        </td>
                        <td style={{ padding: '16px 24px', textAlign: 'center', color: '#4a5568' }}>
                          {submission.records.length} types
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ 
                            fontWeight: '500', 
                            color: '#1a202c',
                            padding: '4px 8px',
                            background: '#e6fffa',
                            borderRadius: '12px',
                            fontSize: '12px',
                            display: 'inline-block'
                          }}>
                            {submission.submittedBy || 'Unknown User'}
                          </div>
                        </td>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ fontSize: '14px', color: '#4a5568' }}>
                            {new Date(submission.submittedAt).toLocaleDateString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#718096' }}>
                            {new Date(submission.submittedAt).toLocaleTimeString()}
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded cylinder details */}
                      {expandedSubmissions.has(submission.id) && (
                        <tr>
                          <td colSpan="7" style={{ padding: '0', background: '#f8fafc' }}>
                            <div style={{ padding: '16px 24px' }}>
                              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>
                                Cylinder Details:
                              </h4>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                                gap: '12px' 
                              }}>
                                {submission.records.map((record, index) => (
                                  <div 
                                    key={index}
                                    style={{
                                      background: 'white',
                                      padding: '12px',
                                      borderRadius: '6px',
                                      border: '1px solid #e2e8f0',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontWeight: '500', color: '#1a202c' }}>
                                        {record.cylinderType || record.label}
                                      </div>
                                      {record.groupName && (
                                        <div style={{ fontSize: '12px', color: '#718096' }}>
                                          Group: {record.groupName}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                      <span style={{ 
                                        padding: '4px 8px', 
                                        background: '#dcfce7', 
                                        color: '#166534', 
                                        borderRadius: '4px', 
                                        fontSize: '12px', 
                                        fontWeight: '500' 
                                      }}>
                                        Full: {record.fullCount}
                                      </span>
                                      <span style={{ 
                                        padding: '4px 8px', 
                                        background: '#fef2f2', 
                                        color: '#991b1b', 
                                        borderRadius: '4px', 
                                        fontSize: '12px', 
                                        fontWeight: '500' 
                                      }}>
                                        Empty: {record.emptyCount}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
