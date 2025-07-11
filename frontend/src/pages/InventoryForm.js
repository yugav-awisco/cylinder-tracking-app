import React, { useEffect, useState, useCallback } from 'react';
import LogoutButton from '../components/LogoutButton';

const InventoryForm = () => {
  // State management
  const [cylinderTypes, setCylinderTypes] = useState([]);
  const [filteredCylinderTypes, setFilteredCylinderTypes] = useState([]);
  const [cylinderGroups, setCylinderGroups] = useState([]); // NEW: Store available groups
  const [selectedGroup, setSelectedGroup] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [branchId, setBranchId] = useState(null);
  const [weekEnding, setWeekEnding] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [currentUser, setCurrentUser] = useState('');
  const [accessCode, setAccessCode] = useState(''); // Store access code for user tracking
  const [missingSubmissions, setMissingSubmissions] = useState([]);
  const [showMissingAlert, setShowMissingAlert] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Get current week's Sunday
  const getCurrentWeekSunday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    return sunday.toISOString().split('T')[0];
  };

  // Initialize component
  useEffect(() => {
    const storedBranchId = localStorage.getItem('branchId') || '1';
    const storedUser = localStorage.getItem('currentUser') || 'Unknown User';
    const storedAccessCode = localStorage.getItem('accessCode') || '';
    setBranchId(storedBranchId);
    setCurrentUser(storedUser);
    setAccessCode(storedAccessCode);
    setWeekEnding(getCurrentWeekSunday());
    
    // Check for missing submissions on load
    checkMissingSubmissions();
  }, []);

  // Check for missing submissions
  const checkMissingSubmissions = useCallback(async () => {
    try {
      const response = await fetch(`/records/missing?date=${weekEnding}`);
      if (response.ok) {
        const missingBranches = await response.json();
        setMissingSubmissions(missingBranches);
        if (missingBranches.length > 0) {
          setShowMissingAlert(true);
        }
      }
    } catch (error) {
      console.error('Error checking missing submissions:', error);
    }
  }, [weekEnding]);

  // Export CSV function - FIXED to use correct endpoint
  const exportToCSV = async () => {
    setExportLoading(true);
    try {
      // Use the correct endpoint that exists in your server
      const response = await fetch(`/admin/export?branchId=${branchId}&date=${weekEnding}&format=csv`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get the filename from the response headers or create a default one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `inventory_branch_${branchId}_${weekEnding}.csv`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setMessage({ text: 'CSV exported successfully!', type: 'success' });
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ 
        text: `Export failed: ${error.message}`, 
        type: 'error' 
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Filter cylinder types based on search term and selected group
  useEffect(() => {
    let filtered = cylinderTypes;

    // Filter by selected group
    if (selectedGroup) {
      filtered = filtered.filter(type => type.group === selectedGroup);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(type =>
        type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (type.group && type.group.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredCylinderTypes(filtered);
  }, [cylinderTypes, searchTerm, selectedGroup]);

  // Fetch cylinder types and extract unique groups
  const fetchCylinderTypes = useCallback(async () => {
    if (!branchId) return;
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    try {
      const params = new URLSearchParams({ branchId });
      // Don't filter by group in the API call - get all types for this branch
      
      const response = await fetch(`/cylinder-types?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      const data = await response.json();
      const mappedData = data.map(item => ({
        ...item,
        name: item.label
      }));
      
      setCylinderTypes(mappedData);
      
      // Extract unique groups from the cylinder types
      const uniqueGroups = [...new Set(mappedData.map(type => type.group).filter(Boolean))];
      setCylinderGroups(uniqueGroups.sort());
      
      console.log('API data loaded:', mappedData);
      console.log('Available groups:', uniqueGroups);
      
      // Initialize form data for new types
      const newFormData = {};
      mappedData.forEach(type => {
        if (!formData[type.id]) {
          newFormData[type.id] = { full: 0, empty: 0 };
        } else {
          newFormData[type.id] = formData[type.id];
        }
      });
      setFormData(newFormData);
      
    } catch (error) {
      console.error('Error fetching cylinder types:', error);
      setMessage({ 
        text: `Failed to load cylinder types: ${error.message}`, 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  }, [branchId, formData]);

  useEffect(() => {
    fetchCylinderTypes();
  }, [branchId]);

  // Handle input changes
  const handleInputChange = (typeId, field, value) => {
    const numValue = parseInt(value) || 0;
    
    setFormData(prev => ({
      ...prev,
      [typeId]: {
        ...prev[typeId],
        [field]: numValue
      }
    }));

    // Clear validation error for this field
    const errorKey = `${typeId}_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  // Validation function
  const validateForm = () => {
    const errors = {};
    let hasNonZeroEntry = false;

    cylinderTypes.forEach(type => {
      const data = formData[type.id];
      if (!data) return;

      if (data.full < 0) {
        errors[`${type.id}_full`] = 'Cannot be negative';
      }
      if (data.empty < 0) {
        errors[`${type.id}_empty`] = 'Cannot be negative';
      }

      if (data.full > 0 || data.empty > 0) {
        hasNonZeroEntry = true;
      }
    });

    if (!hasNonZeroEntry) {
      errors.general = 'At least one cylinder type must have non-zero counts';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission - UPDATED to send access code
  const handleSubmit = async () => {
    if (!validateForm()) {
      setMessage({ text: 'Please fix validation errors', type: 'error' });
      return;
    }

    // Show confirmation dialog
    const totalItems = cylinderTypes.reduce((sum, type) => {
      const data = formData[type.id];
      return sum + (data?.full || 0) + (data?.empty || 0);
    }, 0);

    const confirmMessage = `Are you sure you want to submit this inventory?\n\nSummary:\n- Total cylinders counted: ${totalItems}\n- Week ending: ${weekEnding}\n- Branch: ${branchId}\n- Submitted by: ${currentUser}\n\nPlease verify all counts are correct before proceeding.`;

    if (!window.confirm(confirmMessage)) {
      return; // User cancelled
    }

    setSubmitLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const records = cylinderTypes
        .filter(type => {
          const data = formData[type.id];
          return data && (data.full > 0 || data.empty > 0);
        })
        .map(type => ({
          branchId: parseInt(branchId),
          typeId: type.id,
          weekEnding,
          fullCount: formData[type.id].full,
          emptyCount: formData[type.id].empty
        }));

      const response = await fetch('/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: parseInt(branchId),
          records: records,
          accessCode: accessCode // Send access code instead of user name
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Submission failed');
      }

      setMessage({ text: 'Inventory successfully submitted!', type: 'success' });
      
      setTimeout(() => {
        handleClearForm();
      }, 2000);

    } catch (error) {
      console.error('Submission error:', error);
      setMessage({ 
        text: error.message.includes('Duplicate') 
          ? 'Duplicate entry for this week' 
          : `Submission failed: ${error.message}`, 
        type: 'error' 
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Clear form
  const handleClearForm = () => {
    const clearedData = {};
    cylinderTypes.forEach(type => {
      clearedData[type.id] = { full: 0, empty: 0 };
    });
    setFormData(clearedData);
    setValidationErrors({});
    setMessage({ text: '', type: '' });
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchTerm('');
  };

  if (!branchId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '15px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
          color: 'white',
          padding: '30px',
          textAlign: 'center',
          position: 'relative'
        }}>
          {/* User Info - Top Right */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            {/* Logout Button */}
            <LogoutButton size="small" />
            
            {/* Export Button */}
            <button
              onClick={exportToCSV}
              disabled={exportLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: exportLoading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                cursor: exportLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!exportLoading) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = exportLoading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>

            {/* User Info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span style={{ opacity: 0.9 }}>{currentUser}</span>
            </div>
          </div>
          
          <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', fontWeight: '600' }}>
            Weekly Inventory Entry
          </h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Branch ID: {branchId} | Week Ending: {weekEnding}
          </p>
        </div>

        <div style={{ padding: '30px' }}>
          {/* Missing Submissions Alert */}
          {showMissingAlert && missingSubmissions.length > 0 && (
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)',
              border: '1px solid #ffeaa7',
              borderRadius: '10px',
              marginBottom: '30px',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowMissingAlert(false)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#856404',
                  padding: '5px'
                }}
              >
                ×
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h3 style={{ margin: 0, color: '#856404', fontSize: '18px', fontWeight: '600' }}>
                  Missing Submissions Alert
                </h3>
              </div>
              <p style={{ margin: '0 0 15px 0', color: '#856404', fontSize: '14px' }}>
                The following branches haven't submitted inventory for week ending {weekEnding}:
              </p>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '15px'
              }}>
                {missingSubmissions.map((branch, index) => (
                  <span
                    key={index}
                    style={{
                      background: '#856404',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    Branch {branch.branchId || branch.id || branch}
                  </span>
                ))}
              </div>
              <button
                onClick={checkMissingSubmissions}
                style={{
                  background: '#856404',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#6c5211'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#856404'}
              >
                Refresh Status
              </button>
            </div>
          )}
          
          {/* Controls Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            {/* Group Filter - NOW DYNAMIC */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                Filter by Group:
              </label>
              <select 
                value={selectedGroup} 
                onChange={(e) => setSelectedGroup(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e1e8ed',
                  borderRadius: '8px',
                  fontSize: '16px',
                  background: 'white'
                }}
              >
                <option value="">All Groups</option>
                {cylinderGroups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                Search Cylinders:
              </label>
              <div style={{ position: 'relative' }}>
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="#666" 
                  strokeWidth="2"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none'
                  }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or group..."
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 40px',
                    border: '2px solid #e1e8ed',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box'
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={handleClearSearch}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      color: '#666'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Week Ending */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                Week Ending:
              </label>
              <input
                type="date"
                value={weekEnding}
                onChange={(e) => setWeekEnding(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e1e8ed',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              />
            </div>
          </div>

          {/* Search/Filter Results Info */}
          {(searchTerm || selectedGroup) && (
            <div style={{
              padding: '12px 16px',
              background: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '8px',
              marginBottom: '20px',
              color: '#495057',
              fontSize: '14px'
            }}>
              {filteredCylinderTypes.length === 0 
                ? `No cylinders found ${searchTerm ? `matching "${searchTerm}"` : ''} ${selectedGroup ? `in group "${selectedGroup}"` : ''}`
                : `Showing ${filteredCylinderTypes.length} of ${cylinderTypes.length} cylinders ${searchTerm ? `matching "${searchTerm}"` : ''} ${selectedGroup ? `in group "${selectedGroup}"` : ''}`
              }
              {(searchTerm || selectedGroup) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedGroup('');
                  }}
                  style={{
                    marginLeft: '10px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Message Display */}
          {message.text && (
            <div style={{
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              background: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              {message.text}
            </div>
          )}

          {/* General Validation Error */}
          {validationErrors.general && (
            <div style={{
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px',
              background: '#f8d7da',
              color: '#721c24',
              border: '1px solid #f5c6cb'
            }}>
              {validationErrors.general}
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '18px', color: '#666' }}>Loading cylinder types...</div>
            </div>
          ) : (
            /* Inventory Table */
            <div>
              <div style={{
                border: '2px solid #e1e8ed',
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  background: '#f8f9fa',
                  borderBottom: '2px solid #e1e8ed',
                  fontWeight: '600',
                  color: '#2c3e50'
                }}>
                  <div style={{ padding: '15px' }}>Cylinder Type</div>
                  <div style={{ padding: '15px', textAlign: 'center' }}>Full Count</div>
                  <div style={{ padding: '15px', textAlign: 'center' }}>Empty Count</div>
                </div>

                {/* Table Body */}
                {filteredCylinderTypes.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    {searchTerm || selectedGroup
                      ? `No cylinder types found with current filters`
                      : 'No cylinder types available for this branch'
                    }
                  </div>
                ) : (
                  filteredCylinderTypes.map((type, index) => (
                    <div 
                      key={type.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr',
                        borderBottom: index < filteredCylinderTypes.length - 1 ? '1px solid #e1e8ed' : 'none',
                        background: index % 2 === 0 ? 'white' : '#f8f9fa'
                      }}
                    >
                      <div style={{ 
                        padding: '15px', 
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {type.name}
                        {type.group && (
                          <span style={{
                            marginLeft: '10px',
                            padding: '4px 8px',
                            background: '#e3f2fd',
                            color: '#1976d2',
                            borderRadius: '12px',
                            fontSize: '12px'
                          }}>
                            {type.group}
                          </span>
                        )}
                      </div>
                      
                      <div style={{ padding: '15px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={formData[type.id]?.full || 0}
                          onChange={(e) => handleInputChange(type.id, 'full', e.target.value)}
                          style={{
                            width: '80px',
                            padding: '8px',
                            border: validationErrors[`${type.id}_full`] ? '2px solid #dc3545' : '1px solid #ddd',
                            borderRadius: '6px',
                            textAlign: 'center',
                            fontSize: '16px'
                          }}
                        />
                        {validationErrors[`${type.id}_full`] && (
                          <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                            {validationErrors[`${type.id}_full`]}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ padding: '15px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={formData[type.id]?.empty || 0}
                          onChange={(e) => handleInputChange(type.id, 'empty', e.target.value)}
                          style={{
                            width: '80px',
                            padding: '8px',
                            border: validationErrors[`${type.id}_empty`] ? '2px solid #dc3545' : '1px solid #ddd',
                            borderRadius: '6px',
                            textAlign: 'center',
                            fontSize: '16px'
                          }}
                        />
                        {validationErrors[`${type.id}_empty`] && (
                          <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                            {validationErrors[`${type.id}_empty`]}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Action Buttons */}
              {filteredCylinderTypes.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  marginTop: '30px',
                  justifyContent: 'center',
                  flexWrap: 'wrap'
                }}>
                  <button
                    type="button"
                    onClick={handleClearForm}
                    disabled={submitLoading}
                    style={{
                      padding: '15px 30px',
                      fontSize: '16px',
                      fontWeight: '600',
                      border: '2px solid #6c757d',
                      background: 'white',
                      color: '#6c757d',
                      borderRadius: '10px',
                      cursor: submitLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      minWidth: '120px'
                    }}
                  >
                    Clear Form
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitLoading || cylinderTypes.length === 0}
                    style={{
                      padding: '15px 30px',
                      fontSize: '16px',
                      fontWeight: '600',
                      border: 'none',
                      background: submitLoading ? '#95a5a6' : 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)',
                      color: 'white',
                      borderRadius: '10px',
                      cursor: submitLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      minWidth: '160px',
                      boxShadow: '0 4px 15px rgba(46, 204, 113, 0.3)'
                    }}
                  >
                    {submitLoading ? 'Submitting...' : 'Submit Inventory'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryForm;