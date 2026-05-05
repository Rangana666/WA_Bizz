import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SignupSuccess from './pages/SignupSuccess';
import Layout from './components/Layout';
import Businesses from './pages/Businesses';
import BusinessDetail from './pages/BusinessDetail';
import Revenue from './pages/Revenue';
import Updates from './pages/Updates';
import Metrics from './pages/Metrics';

function RequireAuth({ children }) {
  return localStorage.getItem('fleet_token') ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/signup/success" element={<SignupSuccess />} />
      <Route
        path="/"
        element={<RequireAuth><Layout /></RequireAuth>}
      >
        <Route index element={<Businesses />} />
        <Route path="businesses/:bizId" element={<BusinessDetail />} />
        <Route path="revenue" element={<Revenue />} />
        <Route path="updates" element={<Updates />} />
        <Route path="metrics" element={<Metrics />} />
      </Route>
    </Routes>
  );
}
