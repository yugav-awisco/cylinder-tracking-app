import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IndustrialLoginPortal from './pages/IndustrialLoginPortal';
import InventoryForm from './pages/InventoryForm';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

console.log('InventoryForm:', InventoryForm);
console.log('IndustrialLoginPortal:', IndustrialLoginPortal);

function App() {
  return (
    <Router>
      <Routes>
        {/* Login page - accessible to everyone */}
        <Route path="/" element={<IndustrialLoginPortal />} />
        <Route path="/login" element={<IndustrialLoginPortal />} />
        
        {/* Protected Admin Dashboard - only for admin users */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requiredUserType="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Protected Inventory Form - only for branch users */}
        <Route 
          path="/form" 
          element={
            <ProtectedRoute requiredUserType="branch_user">
              <InventoryForm />
            </ProtectedRoute>
          } 
        />
        
        {/* Catch all other routes and redirect to login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;