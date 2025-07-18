import React, { useEffect, useState, useCallback } from 'react';
import LogoutButton from '../components/LogoutButton';

const InventoryForm = () => {
  // Existing state management
  const [cylinderTypes, setCylinderTypes] = useState([]);
  const [filteredCylinderTypes, setFilteredCylinderTypes] = useState([]);
  const [cylinderGroups, setCylinderGroups] = useState([]);
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
  const [accessCode, setAccessCode] = useState('');
  const [missingSubmissions, setMissingSubmissions] = useState([]);
  const [showMissingAlert, setShowMissingAlert] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // NEW: Past entries state
  const [showPastEntries, setShowPastEntries] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [pastEntries, setPastEntries] = useState([]);
  const [groupedPastEntries, setGroupedPastEntries] = useState([]);
  const [expandedPastSubmissions, setExpandedPastSubmissions] = useState(new Set());
  const [pastEntriesLoading, setPastEntriesLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Get current week's Sunday
  const getCurrentWeekSunday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    return sunday.toISOString().split('T')[0];
  };

  // Group records by submission (same logic as admin dashboard)
  const groupRecordsBySubmission = (records) => {
    const groups = {};
    
    records.forEach(record => {
      const submissionTime = new Date(record.submittedAt);
      const roundedTime = new Date(submissionTime.getFullYear(), submissionTime.getMonth(), submissionTime.getDate(), submissionTime.getHours(), submissionTime.getMinutes());
      const submissionKey = `${record.branchId}_${record.weekEnding}_${record.submittedBy}_${roundedTime.getTime()}`;
      
      if (!groups[submissionKey]) {
        groups[submissionKey] = {
          id: submissionKey,
          branchId: record.branchId,
          branchName: record.branchName,
          weekEnding: record.weekEnding,
          submittedBy: record.submittedBy,
          submittedAt: record.submittedAt,
          records: [],
          totalCylinders: 0,
          totalTypes: 0
        };
      }
      
      groups[submissionKey].records.push(record);
      groups[submissionKey].totalCylinders += (record.fullCount || 0) + (record.emptyCount || 0);
      groups[submissionKey].totalTypes = groups[submissionKey].records.length;
    });
    
    return Object.values(groups).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  };

  // Fetch all branches for selection
  const fetchBranches = async () => {
    setBranchesLoading(true);
    try {
      const response = await fetch('https://awisco-cylinder-api.onrender.com/branches');
      if (response.ok) {
        const branchesData = await response.json();
        setBranches(branchesData);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      setMessage({ text: 'Failed to load branches', type: 'error' });
    } finally {
      setBranchesLoading(false);
    }
  };

  // Fetch past entries for selected branch
  const fetchPastEntries = async (branchId) => {
    setPastEntriesLoading(true);
    try {
      const response = await fetch(`https://awisco-cylinder-api.onrender.com/admin/records?branchId=${branchId}&limit=1000`);
      if (response.ok) {
        const data = await response.json();
        setPastEntries(data);
        setGroupedPastEntries(groupRecordsBySubmission(data));
      } else {
        throw new Error('Failed to fetch past entries');
      }
    } catch (error) {
      console.error('Error fetching past entries:', error);
      setMessage({ text: 'Failed to load past entries', type: 'error' });
    } finally {
      setPastEntriesLoading(false);
    }
  };

  // Handle branch selection for past entries
  const handleBranchSelect = (branch) => {
    setSelectedBranch(branch);
    fetchPastEntries(branch.id);
    setExpandedPastSubmissions(new Set()); // Reset expanded state
  };

  // Toggle expansion of past submission
  const togglePastSubmissionExpansion = (submissionId) => {
    const newExpanded = new Set(expandedPastSubmissions);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
    }
    setExpandedPastSubmissions(newExpanded);
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
      const response = await fetch(`https://awisco-cylinder-api.onrender.com/records/missing?date=${weekEnding}`);
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

  // Export CSV function
  const exportToCSV = async () => {
    setExportLoading(true);
    try {
      const response = await fetch(`https://awisco-cylinder-api.onrender.com/admin/export?branchId=${branchId}&date=${weekEnding}&format=csv`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `inventory_branch_${branchId}_${weekEnding}.csv`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

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

    if (selectedGroup) {
      filtered = filtered.filter(type => type.group === selectedGroup);
    }

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
      const response = await fetch(`https://awisco-cylinder-api.onrender.com/cylinder-types?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      const data = await response.json();
      const mappedData = data.map(item => ({
        ...item,
        name: item.label
      }));
      
      setCylinderTypes(mappedData);
      
      const uniqueGroups = [...new Set(mappedData.map(type => type.group).filter(Boolean))];
      setCylinderGroups(uniqueGroups.sort());
      
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

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) {
      setMessage({ text: 'Please fix validation errors', type: 'error' });
      return;
    }

    const totalItems = cylinderTypes.reduce((sum, type) => {
      const data = formData[type.id];
      return sum + (data?.full || 0) + (data?.empty || 0);
    }, 0);

    const confirmMessage = `Are you sure you want to submit this inventory?\n\nSummary:\n- Total cylinders counted: ${totalItems}\n- Week ending: ${weekEnding}\n- Branch: ${branchId}\n- Submitted by: ${currentUser}\n\nPlease verify all counts are correct before proceeding.`;

    if (!window.confirm(confirmMessage)) {
      return;
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

      const response = await fetch('https://awisco-cylinder-api.onrender.com/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: parseInt(branchId),
          records: records,
          accessCode: accessCode
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

  // Render Past Entries Modal/Overlay
  if (showPastEntries) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '20px'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          background: 'white',
          borderRadius: '15px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden'
        }}>
          {/* Past Entries Header */}
          <div style={{
            background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
            color: 'white',
            padding: '30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', fontWeight: '600' }}>
                Past Branch Entries
              </h1>
              <p style={{ margin: 0, opacity: 0.9 }}>
                {selectedBranch ? `Viewing entries for ${selectedBranch.name} (ID: ${selectedBranch.id})` : 'Select a branch to view past entries'}
              </p>
            </div>
            <button
              onClick={() => {
                setShowPastEntries(false);
                setSelectedBranch(null);
                setPastEntries([]);
                setGroupedPastEntries([]);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Close
            </button>
          </div>

          <div style={{ padding: '30px' }}>
            {!selectedBranch ? (
              // Branch Selection View
              <div>
                <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600', color: '#2d3748' }}>
                  Select a Branch
                </h3>
                
                {branchesLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '16px', color: '#666' }}>Loading branches...</div>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px'
                  }}>
                    {branches.map(branch => (
                      <div
                        key={branch.id}
                        onClick={() => handleBranchSelect(branch)}
                        style={{
                          padding: '20px',
                          border: '2px solid #e2e8f0',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          background: 'white'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#3182ce';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(49, 130, 206, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#2d3748', marginBottom: '8px' }}>
                          {branch.name}
                        </div>
                        <div style={{ fontSize: '14px', color: '#718096' }}>
                          Branch ID: {branch.id}
                        </div>
                        <div style={{ 
                          marginTop: '12px',
                          fontSize: '14px',
                          color: '#3182ce',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          View Entries
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9,18 15,12 9,6"></polyline>
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Past Entries View
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '20px'
                }}>
                  <button
                    onClick={() => {
                      setSelectedBranch(null);
                      setPastEntries([]);
                      setGroupedPastEntries([]);
                    }}
                    style={{
                      background: '#e2e8f0',
                      border: 'none',
                      color: '#4a5568',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15,18 9,12 15,6"></polyline>
                    </svg>
                    Back to Branches
                  </button>
                  
                  <div style={{ fontSize: '14px', color: '#718096' }}>
                    {groupedPastEntries.length} submissions • {pastEntries.length} total records
                  </div>
                </div>

                {pastEntriesLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '16px', color: '#666' }}>Loading past entries...</div>
                  </div>
                ) : groupedPastEntries.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '40px',
                    color: '#718096'
                  }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 16px' }}>
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>No entries found</div>
                    <div style={{ fontSize: '14px' }}>This branch hasn't submitted any inventory records yet</div>
                  </div>
                ) : (
                  // Past Entries Table (Same as Admin Dashboard)
                  <div style={{
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      background: '#f7fafc',
                      padding: '16px 24px',
                      borderBottom: '1px solid #e2e8f0'
                    }}>
                      <h4 style={{ 
                        margin: 0, 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: '#2d3748'
                      }}>
                        Submission History
                      </h4>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f7fafc' }}>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568', width: '50px' }}></th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Week Ending</th>
                            <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Total Cylinders</th>
                            <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Cylinder Types</th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Submitted By</th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#4a5568' }}>Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedPastEntries.map((submission) => (
                            <React.Fragment key={submission.id}>
                              {/* Main submission row */}
                              <tr 
                                style={{ 
                                  borderBottom: '1px solid #e2e8f0',
                                  cursor: 'pointer',
                                  background: expandedPastSubmissions.has(submission.id) ? '#f8fafc' : 'white',
                                  transition: 'background-color 0.2s'
                                }}
                                onClick={() => togglePastSubmissionExpansion(submission.id)}
                                onMouseEnter={(e) => {
                                  if (!expandedPastSubmissions.has(submission.id)) {
                                    e.currentTarget.style.background = '#f9fafb';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!expandedPastSubmissions.has(submission.id)) {
                                    e.currentTarget.style.background = 'white';
                                  }
                                }}
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
                                      transform: expandedPastSubmissions.has(submission.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s'
                                    }}
                                  >
                                    <polyline points="9,18 15,12 9,6"></polyline>
                                  </svg>
                                </td>
                                <td style={{ padding: '16px 24px', color: '#4a5568' }}>
                                  {new Date(submission.weekEnding).toLocaleDateString()}
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                  <span style={{
                                    fontWeight: '600', 
                                    color: '#3182ce',
                                    background: '#ebf8ff',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '14px'
                                  }}>
                                    {submission.totalCylinders}
                                  </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                  <span style={{
                                    color: '#4a5568',
                                    background: '#f7fafc',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '14px'
                                  }}>
                                    {submission.totalTypes} types
                                  </span>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                  <div style={{ 
                                    fontWeight: '500', 
                                    color: '#2d3748',
                                    padding: '4px 12px',
                                    background: '#e6fffa',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    display: 'inline-block',
                                    border: '1px solid #b2f5ea'
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
                              {expandedPastSubmissions.has(submission.id) && (
                                <tr>
                                  <td colSpan="6" style={{ padding: '0', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ padding: '24px' }}>
                                      <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        marginBottom: '16px'
                                      }}>
                                        <h4 style={{ 
                                          margin: 0, 
                                          fontSize: '16px', 
                                          fontWeight: '600', 
                                          color: '#2d3748',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px'
                                        }}>
                                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                            <line x1="9" y1="9" x2="15" y2="15"></line>
                                            <line x1="15" y1="9" x2="9" y2="15"></line>
                                          </svg>
                                          Cylinder Details ({submission.totalTypes} types)
                                        </h4>
                                        <div style={{
                                          display: 'flex',
                                          gap: '16px',
                                          fontSize: '14px',
                                          color: '#718096'
                                        }}>
                                          <span>Total Full: {submission.records.reduce((sum, r) => sum + (r.fullCount || 0), 0)}</span>
                                          <span>Total Empty: {submission.records.reduce((sum, r) => sum + (r.emptyCount || 0), 0)}</span>
                                        </div>
                                      </div>
                                      
                                      <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                                        gap: '12px' 
                                      }}>
                                        {submission.records
                                          .sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''))
                                          .map((record, index) => (
                                          <div 
                                            key={index}
                                            style={{
                                              background: 'white',
                                              padding: '16px',
                                              borderRadius: '8px',
                                              border: '1px solid #e2e8f0',
                                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                            }}
                                          >
                                            <div style={{ 
                                              display: 'flex', 
                                              justifyContent: 'space-between', 
                                              alignItems: 'flex-start',
                                              marginBottom: '12px'
                                            }}>
                                              <div style={{ flex: 1 }}>
                                                <div style={{ 
                                                  fontWeight: '600', 
                                                  color: '#2d3748',
                                                  fontSize: '14px',
                                                  marginBottom: '4px'
                                                }}>
                                                  {record.cylinderType || record.label}
                                                </div>
                                                {record.groupName && (
                                                  <div style={{ 
                                                    fontSize: '12px', 
                                                    color: '#718096',
                                                    background: '#f7fafc',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    display: 'inline-block'
                                                  }}>
                                                    {record.groupName}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            
                                            <div style={{ 
                                              display: 'flex', 
                                              gap: '8px', 
                                              alignItems: 'center',
                                              justifyContent: 'center'
                                            }}>
                                              <div style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                padding: '8px',
                                                background: '#dcfce7',
                                                borderRadius: '6px',
                                                border: '1px solid #bbf7d0'
                                              }}>
                                                <div style={{ 
                                                  fontSize: '12px', 
                                                  color: '#166534',
                                                  fontWeight: '500',
                                                  marginBottom: '2px'
                                                }}>
                                                  FULL
                                                </div>
                                                <div style={{ 
                                                  fontSize: '18px', 
                                                  fontWeight: '700',
                                                  color: '#166534'
                                                }}>
                                                  {record.fullCount || 0}
                                                </div>
                                              </div>
                                              
                                              <div style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                padding: '8px',
                                                background: '#fef2f2',
                                                borderRadius: '6px',
                                                border: '1px solid #fecaca'
                                              }}>
                                                <div style={{ 
                                                  fontSize: '12px', 
                                                  color: '#991b1b',
                                                  fontWeight: '500',
                                                  marginBottom: '2px'
                                                }}>
                                                  EMPTY
                                                </div>
                                                <div style={{ 
                                                  fontSize: '18px', 
                                                  fontWeight: '700',
                                                  color: '#991b1b'
                                                }}>
                                                  {record.emptyCount || 0}
                                                </div>
                                              </div>
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
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Inventory Form View
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
          padding: '24px 32px'
        }}>
          {/* Top Row - User Info and Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              {/* User Info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '500'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{currentUser}</span>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {/* Past Entries Button */}
                <button
                  onClick={() => {
                    setShowPastEntries(true);
                    fetchBranches();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Past Entries
                </button>
                
                {/* Export Button */}
                <button
                  onClick={exportToCSV}
                  disabled={exportLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: exportLoading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    color: exportLoading ? 'rgba(255, 255, 255, 0.6)' : 'white',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!exportLoading) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!exportLoading) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7,10 12,15 17,10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  {exportLoading ? 'Exporting...' : 'Export'}
                </button>

                {/* Logout Button */}
                <LogoutButton size="small" />
              </div>
            </div>
          </div>
          
          {/* Main Title Section */}
          <div style={{
            textAlign: 'center'
          }}>
            <h1 style={{ 
              margin: '0 0 8px 0', 
              fontSize: '32px', 
              fontWeight: '700',
              letterSpacing: '-0.5px'
            }}>
              Weekly Inventory Entry
            </h1>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '24px',
              opacity: 0.9,
              fontSize: '15px',
              fontWeight: '500'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                Branch ID: {branchId}
              </div>
              <div style={{
                width: '1px',
                height: '16px',
                background: 'rgba(255, 255, 255, 0.3)'
              }}></div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Week Ending: {weekEnding}
              </div>
            </div>
          </div>
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
            {/* Group Filter */}
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
