import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';
import sampleBrands from './vehicleBrands.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ==========================================
// CONFIGURATION 1: VEHICLE BRANDS
// ==========================================
// Real brand mapping lives in the git-ignored vehicleBrands.local.js; falls back to sample data
const localBrands = Object.values(import.meta.glob('./vehicleBrands.local.js', { eager: true }))[0];
const customBrands = localBrands?.default ?? sampleBrands;

// ==========================================
// CONFIGURATION 2: TEAM MEMBERS
// ==========================================
const TEAM_MEMBERS = [
  {
    id: 1,
    name: "Operations Head",
    role: "Owner & Head of Operations",
    phone: "+91 00000 00001",
    email: "ops@example.com",
    desc: "Oversees all logistics strategy, client relations, and overall fleet growth.",
    img: ""
  },
  {
    id: 2,
    name: "Amit Singh",
    role: "Logistics Manager",
    phone: "+91 00000 00002",
    email: "amit@example.com",
    desc: "Handles daily route planning, dispatching, and tracking Google Sheets loads.",
    img: "https://ui-avatars.com/api/?name=Amit+Singh&background=10b981&color=fff&size=150"
  },
  {
    id: 3,
    name: "Priya Sharma",
    role: "Fleet Supervisor",
    phone: "+91 00000 00003",
    email: "priya@example.com",
    desc: "Manages vehicle maintenance, driver schedules, and GPS tracking compliance.",
    img: "https://ui-avatars.com/api/?name=Priya+Sharma&background=f59e0b&color=fff&size=150"
  }
];

// ==========================================
// COMPONENT: TEAM FLIP CARD
// ==========================================
function TeamCard({ member }) {
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const hasPhoto = member.img && !member.img.startsWith('http');
  return (
    <div className="team-card">
      <div className="avatar">{hasPhoto ? <img src={member.img} alt={member.name} /> : initials}</div>
      <div className="team-info">
        <strong>{member.name}</strong>
        <span className="role">{member.role}</span>
        <span>{member.phone}</span>
        <span>{member.email}</span>
      </div>
    </div>
  );
}

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
function App() {
  // --- 1. STATE MANAGEMENT ---
  const [vehicles, setVehicles] = useState([]);
  const [loads, setLoads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null); 
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [chartDimension, setChartDimension] = useState('Loading point');
  
  // Controls which loads (Sheet 1 vs Sheet 2) show up in the stats and chart
  const [dashboardLoadType, setDashboardLoadType] = useState('Type 1');
  const [statusFilter, setStatusFilter] = useState('All');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Theme: remembers your choice, falls back to the system setting
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // --- 2. AUTHENTICATION (Strict: Resets on refresh) ---
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [inputPassword, setInputPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  const [token, setToken] = useState(null);

  // Password is now verified by the backend; nothing secret lives in the frontend bundle
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: inputPassword }),
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      setToken(data.token);
      setIsAuthenticated(true);
      setLoginError(false);
    } catch {
      setLoginError(true);
    }
  };

  // --- 3. DATA FETCHING ---
  useEffect(() => {
    if (!isAuthenticated) return; 

    const fetchAllData = async (isBackgroundRefresh = false) => {
      try {
        if (!isBackgroundRefresh) setIsLoading(true);
        setError(null);

        const opts = { headers: { Authorization: `Bearer ${token}` } };
        const [axestrackRes, sheetsRes, statusRes] = await Promise.all([
          fetch(`${API}/api/fleet`, opts),
          fetch(`${API}/api/loads`, opts),
          fetch(`${API}/api/status`, opts)
        ]);

        if ([axestrackRes, sheetsRes, statusRes].some(r => r.status === 401)) {
          setIsAuthenticated(false); setToken(null); return; // session expired
        }
        if (!axestrackRes.ok || !sheetsRes.ok) throw new Error('Server error while loading fleet data');

        const gpsData = await axestrackRes.json();
        const kmArray = Array.isArray(gpsData) ? gpsData : (gpsData.data || []);

        const rawStatusData = await statusRes.json();
        const statusArray = Array.isArray(rawStatusData.data) ? rawStatusData.data : [];

        // MERGE: Attach live status & Force Uppercase
        const mergedVehicles = kmArray.map(kmTruck => {
          const formattedVehicleNo = String(kmTruck.Vehicle || '').toUpperCase();
          const cleanKmTruckNo = formattedVehicleNo.replace(/\s+/g, ''); 
          
          const liveMapData = statusArray.find(s => {
            const rawLiveName = s.vehicle || s.Vehicle || s.vehicleNo || s.regNo || '';
            const cleanLiveTruckNo = String(rawLiveName).replace(/\s+/g, '').toUpperCase();
            return cleanLiveTruckNo === cleanKmTruckNo;
          }) || null;

          return {
            ...kmTruck,
            Vehicle: formattedVehicleNo, 
            liveStatus: liveMapData 
          };
        });
        
        setVehicles(mergedVehicles);
        setLastUpdated(new Date());

        const sheetsData = await sheetsRes.json();
        if (Array.isArray(sheetsData)) {
          // Filters out completely empty rows
          const validLoads = sheetsData.filter(row => row['Vehicle no.'] && row['Vehicle no.'].trim() !== "");
          setLoads(validLoads); 
        } else {
          setLoads([]); 
        }

      } catch (err) {
        console.error("Failed to fetch data:", err);
        // A failed background refresh keeps the last good data on screen instead of wiping the dashboard
        if (!isBackgroundRefresh) setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData(false); 
    const timer = setInterval(() => fetchAllData(true), 60000); 
    return () => clearInterval(timer); 
  }, [isAuthenticated, token]); 

  // --- 4. DERIVED DATA & CALCULATIONS ---
  const totalVehicles = vehicles.length;
  const totalTodayKm = vehicles.reduce((sum, truck) => sum + (Number(truck['Today Km']) || 0), 0);
  const totalMonthKm = vehicles.reduce((sum, truck) => sum + (Number(truck['Month Km']) || 0), 0);
  
  // Filter loads based on the active toggle switch for the dashboard stats
  const activeLoads = loads.filter(load => load.loadType === dashboardLoadType);
  
  const totalLoads = activeLoads.length; 
  const notUnloadedCount = activeLoads.filter(load => !load['Unloading date'] || load['Unloading date'].trim() === '').length;
  
  // Check for missing POD (accounts for both Sheet 1 and Sheet 2 header differences)
  const podNotReceivedCount = activeLoads.filter(load => {
    const podVal = load['P.O.D swm'] || load['P.O.D swr'];
    return !podVal || podVal.trim() === '';
  }).length;

  const getTruckStatus = (truck) => {
    const live = truck.liveStatus;
    if (!live) {
      if (Number(truck['Today Km']) > 0) return { label: 'Active (No Live Data)', className: 'status-green' };
      return { label: 'Unknown', className: 'status-yellow' };
    }
    const statusGif = String(live.status || '').toLowerCase();
    if (statusGif.includes('on')) return { label: 'Running', className: 'status-green' };
    if (statusGif.includes('notrpt.')) return { label: 'Stopped', className: 'status-red' };
    return { label: 'Idle', className: 'status-yellow' };
  };

  let runningCount = 0; let stoppedCount = 0; let idleCount = 0;
  vehicles.forEach(truck => {
    const status = getTruckStatus(truck);
    if (status.className === 'status-green') runningCount++;
    else if (status.className === 'status-red') stoppedCount++;
    else idleCount++;
  });

  // Pivot math uses ONLY the activeLoads
  const dynamicCounts = activeLoads.reduce((acc, load) => {
    let key = '';
    if (chartDimension === 'Loading point') {
      key = load['Loading point'];
    } else if (chartDimension === 'Month') {
      const dateStr = load['Loading date'];
      if (dateStr && dateStr.includes('.')) {
        const parts = dateStr.split('.');
        const monthNames = { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };
        key = monthNames[parts[1]] || `Month ${parts[1]}`;
      } else key = 'Unknown Date';
    } else if (chartDimension === 'U.N loading point') {
      key = load['U.N loading point'];
    }
    if (key && key.trim() !== '') acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const PIVOT_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#64748b', '#94a3b8'];
  // Slices under 4% are grouped into "Other" so labels never overlap
  const pivotTotal = Object.values(dynamicCounts).reduce((a, b) => a + b, 0);
  const pivotEntries = Object.entries(dynamicCounts).sort((a, b) => b[1] - a[1]);
  const pivotMain = pivotEntries.filter(([, v]) => v / pivotTotal >= 0.04);
  const pivotOther = pivotEntries.filter(([, v]) => v / pivotTotal < 0.04).reduce((a, [, v]) => a + v, 0);
  if (pivotOther > 0) pivotMain.push(['Other', pivotOther]);
  const pivotPieData = pivotMain.map(([name, value], index) => ({ name, value, color: PIVOT_COLORS[index % PIVOT_COLORS.length] }));

  // --- 5. SEARCH & SORT ---
  const filteredVehicles = vehicles.filter(truck => {
    if (!truck.Vehicle) return false;
    if (statusFilter !== 'All' && getTruckStatus(truck).label.split(' ')[0] !== statusFilter) return false;
    return truck.Vehicle.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
  };

  const sortedVehicles = [...filteredVehicles].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    if (sortConfig.key === 'Status') {
      const statusA = getTruckStatus(a).label;
      const statusB = getTruckStatus(b).label;
      if (statusA < statusB) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (statusA > statusB) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    }

    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    if (['Odometer', 'Today Km', 'Month Km'].includes(sortConfig.key)) {
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    } else {
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
    }

    if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
    return 0;
  });

  // --- 6. RENDER UI ---

  // Screen 1: Login
  if (!isAuthenticated) {
    return (
      <div className="login-wrap">
        <button type="button" className="theme-btn floating" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        <form onSubmit={handleLogin} className="login-card">
          <div className="login-icon">F</div>
          <h2>Fleet Dashboard</h2>
          <p>Enter password to access logistics data</p>
          <input
            type="password" placeholder="Enter password..." autoFocus value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            className={loginError ? 'login-input error' : 'login-input'}
          />
          {loginError && <p className="login-error">Incorrect password, try again.</p>}
          <button type="submit" className="login-btn">Login</button>
        </form>
      </div>
    );
  }

  // Screen 2: Dashboard
  return (
    <div className="dashboard" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      
      <div className="header">
        <div className="brand"><span className="logo">F</span><div><h2>Fleet & Logistics Dashboard</h2><span className="sub">Operations overview</span></div></div>
        <div className="live-indicator"></div>
        <span>Live · {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'connecting…'}</span>
        <button className="theme-btn" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
      </div>

      {isLoading && <div className="skeleton-grid">{[...Array(6)].map((_, i) => <div key={i} className="skeleton" />)}</div>}
      {error && <div className="error-box">{error}</div>}

      {!isLoading && !error && (
        <>
          <div className="dashboard-top-row">
            
            {/* Charts Area */}
            <div className="chart-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '10px' }}>
                <h3 style={{color: 'var(--mu)', margin: 0}}>Analytics Pivot</h3>
                <select 
                  value={chartDimension} onChange={(e) => setChartDimension(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--tx)', outline: 'none' }}
                >
                  <option value="Loading point">Group by: Loading Point</option>
                  <option value="Month">Group by: Month</option>
                  <option value="U.N loading point">Group by: Unloading Point</option>
                </select>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pivotPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                    {pivotPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} style={{ cursor: 'pointer' }} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Loads`, 'Volume']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--tx)' }} itemStyle={{ color: 'var(--tx)' }} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Metrics Section wrapper to hold the toggle buttons and the grid */}
            <div style={{ flex: '2', display: 'flex', flexDirection: 'column' }}>
              
              {/* LOAD TYPE TOGGLE */}
              <div className="seg">
                <button className={dashboardLoadType === 'Type 1' ? 'on1' : ''} onClick={() => setDashboardLoadType('Type 1')}>Type 1 Loads</button>
                <button className={dashboardLoadType === 'Type 2' ? 'on2' : ''} onClick={() => setDashboardLoadType('Type 2')}>Type 2 Loads</button>
              </div>

              {/* Metrics Grid */}
              <div className="stats-grid" style={{ width: '100%' }}>
                <div className="stat-card">
                  <h3>Total Fleet</h3>
                  <p>{totalVehicles}</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '14px', marginTop: '8px', fontSize: '0.9rem', fontWeight: '700' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--ok-tx)' }}><span className="status-dot" style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>{runningCount}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--warn-tx)' }}><span className="status-dot" style={{ background: '#eab308', boxShadow: '0 0 8px #eab308' }}></span>{idleCount}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--bad-tx)' }}><span className="status-dot" style={{ background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span>{stoppedCount}</div>
                  </div>
                </div>
                <div className="stat-card"><h3>Total Loads</h3><p>{totalLoads}</p></div>
                <div className="stat-card warn"><h3>Not Unloaded</h3><p>{notUnloadedCount}</p></div>
                <div className="stat-card"><h3>Today Km</h3><p>{totalTodayKm.toLocaleString()}</p></div>
                <div className="stat-card"><h3>Month Km</h3><p>{totalMonthKm.toLocaleString()}</p></div>
                <div className="stat-card danger"><h3>POD Missing</h3><p>{podNotReceivedCount}</p></div>
              </div>
            </div>
          </div>

          <div className="toolbar">
            <input
              type="text" className="search-input" placeholder="Search for a vehicle number (e.g. RJ14...)"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="chips">
              {[['All', vehicles.length], ['Running', runningCount], ['Idle', idleCount], ['Stopped', stoppedCount]].map(([label, n]) => (
                <button key={label} className={`chip ${statusFilter === label ? 'active' : ''}`} onClick={() => setStatusFilter(label)}>{label} · {n}</button>
              ))}
            </div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th onClick={() => requestSort('Vehicle')}>Vehicle {sortConfig.key === 'Vehicle' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                  <th onClick={() => requestSort('Status')}>Status {sortConfig.key === 'Status' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                  <th onClick={() => requestSort('Odometer')}>Odometer {sortConfig.key === 'Odometer' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                  <th onClick={() => requestSort('Today Km')}>Today Km {sortConfig.key === 'Today Km' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                  <th onClick={() => requestSort('Month Km')}>Month Km {sortConfig.key === 'Month Km' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</th>
                  <th>Load History</th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map((truck, index) => {
                  const statusInfo = getTruckStatus(truck);
                  const vehicleBrand = customBrands[truck.Vehicle] || 'TATA';

                  return (
                    <tr key={truck.Vehicle || index}>
                      <td>
                        <div className="vehicle-plate">
                          <span className="plate-number">{truck.Vehicle}</span>
                          <span className="plate-brand">{vehicleBrand}</span>
                        </div>
                      </td>
                      <td>
                        <span 
                          className={`status-badge ${statusInfo.className}`}
                          title={truck.liveStatus && truck.liveStatus['nearest location'] ? `📍 ${truck.liveStatus['nearest location']}` : 'Location unavailable'}
                          style={{ cursor: 'pointer' }} 
                        >
                          <span className="status-dot"></span>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>{(Number(truck.Odometer) || 0).toLocaleString('en-IN')}</td>
                      <td>{(Number(truck['Today Km']) || 0).toLocaleString('en-IN')}</td>
                      <td>{(Number(truck['Month Km']) || 0).toLocaleString('en-IN')}</td>
                      <td><button className="view-btn" onClick={() => setSelectedVehicle(truck.Vehicle)}>View Loads</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          {sortedVehicles.length === 0 && <div className="empty">No vehicles match your search or filter.</div>}
          </div>
          
          {/* Master Load History Modal */}
          {selectedVehicle && (
            <div className="modal-overlay" onClick={() => setSelectedVehicle(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-btn" onClick={() => setSelectedVehicle(null)}>Close</button>
                <h2>Load History for {selectedVehicle}</h2>
                
                <table style={{marginTop: '20px', width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ paddingBottom: '10px' }}>Type</th>
                      <th style={{ paddingBottom: '10px' }}>Loading Point</th>
                      <th style={{ paddingBottom: '10px' }}>Loading Date</th>
                      <th style={{ paddingBottom: '10px' }}>Unloading Point</th>
                      <th style={{ paddingBottom: '10px' }}>Unloading Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* The modal shows ALL loads from both sheets, sorted by Loading Date */}
                    {loads
                      .filter(load => load['Vehicle no.'] === selectedVehicle)
                      .sort((a, b) => {
                        // 1. Helper function to turn "DD.MM.YY" into a sortable number like 260523
                        const parseDate = (dateStr) => {
                          if (!dateStr || !dateStr.includes('.')) return 0;
                          const [day, month, year] = dateStr.split('.');
                          return parseInt(`${year}${month}${day}`, 10);
                        };
                        
                        // 2. Sort Descending (Newest dates at the top). 
                        // If you prefer oldest at the top, swap it to: parseDate(a['Loading date']) - parseDate(b['Loading date'])
                        return parseDate(b['Loading date']) - parseDate(a['Loading date']);
                      })
                      .map((load, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)', backgroundColor: load.loadType === 'Type 2' ? 'rgba(16,185,129,0.08)' : 'transparent' }}>
                          <td style={{ padding: '12px 0' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 'bold', padding: '4px 8px', borderRadius: '12px',
                              background: load.loadType === 'Type 1' ? '#eff6ff' : '#dcfce7',
                              color: load.loadType === 'Type 1' ? '#3b82f6' : '#15803d'
                            }}>
                              {load.loadType}
                            </span> 
                          </td>
                          <td>{load['Loading point']}</td>
                          <td>{load['Loading date']}</td>
                          <td>{load['U.N loading point']}</td>
                          <td>{load['Unloading date']}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
                
                {loads.filter(load => load['Vehicle no.'] === selectedVehicle).length === 0 && (
                  <p style={{textAlign: 'center', padding: '20px', color: 'var(--mu)'}}>No loads recorded for this vehicle in any sheet.</p>
                )}
              </div>
            </div>
          )}

          {/* Team Section */}
          <div className="team-section">
            <h2>Team &amp; Contacts</h2>
            <div className="team-grid">
              {TEAM_MEMBERS.map(member => (
                <TeamCard key={member.id} member={member} />
              ))}
            </div>
          </div>

        </>
      )}
    </div>
  );
}

export default App;