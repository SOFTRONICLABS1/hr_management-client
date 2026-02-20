import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db } from './firebase'
import './App.css'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'settings', label: 'Settings' },
]

const USER_EMAIL_DOMAIN = 'hr-management.local'
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function toEmail(username) {
  if (!username) return ''
  return username.includes('@') ? username : `${username}@${USER_EMAIL_DOMAIN}`
}

function usernameFromEmail(email = '') {
  return email.split('@')[0] || ''
}

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [active, setActive] = useState('dashboard')
  const [loginMode, setLoginMode] = useState('admin')

  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [settings, setSettings] = useState({
    companyName: '',
    timezone: '',
    defaultWorkHours: '',
  })
  const [employeeProfile, setEmployeeProfile] = useState(null)
  const [employeeAttendance, setEmployeeAttendance] = useState([])
  const [employeeLeave, setEmployeeLeave] = useState([])

  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    role: '',
    department: '',
    status: 'Active',
    username: '',
    tempPassword: '',
  })

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    date: '',
    status: 'Present',
  })

  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    reason: '',
    status: 'Pending',
  })

  const [editingEmployee, setEditingEmployee] = useState(null)
  const [editingAttendance, setEditingAttendance] = useState(null)
  const [editingLeave, setEditingLeave] = useState(null)

  const employeeOptions = useMemo(() => employees, [employees])

  useEffect(() => {
    if (window.location.hash === '#/employee-login') {
      setLoginMode('employee')
    } else if (window.location.hash === '#/admin-login') {
      setLoginMode('admin')
    }

    const onHashChange = () => {
      setLoginMode(window.location.hash === '#/employee-login' ? 'employee' : 'admin')
    }
    window.addEventListener('hashchange', onHashChange)

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        return
      }

      try {
        const tokenResult = await getIdTokenResult(firebaseUser, true)
        const claimRole = tokenResult.claims.role || null

        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
        let profile = userDoc.exists() ? userDoc.data() : null

        const lastLoginMode = localStorage.getItem('loginMode')

        if (!profile && (claimRole === 'admin' || lastLoginMode === 'admin')) {
          profile = {
            username: usernameFromEmail(firebaseUser.email || ''),
            role: 'admin',
            created_at: serverTimestamp(),
          }
          await setDoc(doc(db, 'users', firebaseUser.uid), profile)
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile?.username || usernameFromEmail(firebaseUser.email || ''),
          role: claimRole || profile?.role || 'employee',
          employee_id: profile?.employee_id || null,
        })
      } catch (err) {
        setError('Signed in, but profile setup failed. Check Firestore rules.')
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: usernameFromEmail(firebaseUser.email || ''),
          role: 'employee',
          employee_id: null,
        })
      }
    })

    return () => {
      window.removeEventListener('hashchange', onHashChange)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return

    if (user.role === 'admin') {
      loadAdminData()
    } else if (user.role === 'employee') {
      loadEmployeeData()
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    if (user.role === 'employee' && !active.startsWith('employee-')) {
      setActive('employee-dashboard')
    }
    if (user.role === 'admin' && active.startsWith('employee-')) {
      setActive('dashboard')
    }
  }, [user, active])

  async function adminApi(path, body) {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || 'Request failed')
    }

    return res.json()
  }

  async function loadAdminData() {
    const employeesSnap = await getDocs(query(collection(db, 'employees'), orderBy('created_at', 'desc')))
    const employeesData = employeesSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    setEmployees(employeesData)

    const attendanceSnap = await getDocs(query(collection(db, 'attendance'), orderBy('created_at', 'desc')))
    const attendanceData = attendanceSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    setAttendance(attendanceData)

    const leaveSnap = await getDocs(query(collection(db, 'leave_requests'), orderBy('created_at', 'desc')))
    const leaveData = leaveSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    setLeaveRequests(leaveData)

    const settingsDoc = await getDoc(doc(db, 'settings', 'company'))
    const settingsData = settingsDoc.exists() ? settingsDoc.data() : {}
    setSettings({
      companyName: settingsData.companyName || '',
      timezone: settingsData.timezone || '',
      defaultWorkHours: settingsData.defaultWorkHours || '',
    })
  }

  async function loadEmployeeData() {
    if (!user?.employee_id) return

    const profileDoc = await getDoc(doc(db, 'employees', user.employee_id))
    setEmployeeProfile(profileDoc.exists() ? { id: profileDoc.id, ...profileDoc.data() } : null)

    const attendanceSnap = await getDocs(
      query(
        collection(db, 'attendance'),
        where('employee_id', '==', user.employee_id),
        orderBy('date', 'desc'),
      ),
    )
    setEmployeeAttendance(attendanceSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))

    const leaveSnap = await getDocs(
      query(
        collection(db, 'leave_requests'),
        where('employee_id', '==', user.employee_id),
        orderBy('created_at', 'desc'),
      ),
    )
    setEmployeeLeave(leaveSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      localStorage.setItem('loginMode', loginMode)
      await signInWithEmailAndPassword(auth, toEmail(username), password)
      setActive(loginMode === 'employee' ? 'employee-dashboard' : 'dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await signOut(auth)
    setUser(null)
    setUsername('')
    setPassword('')
  }

  async function upsertEmployee(e) {
    e.preventDefault()

    if (!editingEmployee) {
      if (!employeeForm.username || !employeeForm.tempPassword) {
        setError('Username and password are required for new employees.')
        return
      }

      const response = await adminApi('/admin/create-employee', {
        username: employeeForm.username,
        password: employeeForm.tempPassword,
        employee: {
          name: employeeForm.name,
          email: employeeForm.email,
          role: employeeForm.role,
          department: employeeForm.department,
          status: employeeForm.status,
        },
      })

      setEmployees((prev) => [{ ...response.employee }, ...prev])
    } else {
      const payload = {
        name: employeeForm.name,
        email: employeeForm.email,
        role: employeeForm.role,
        department: employeeForm.department,
        status: employeeForm.status,
      }

      await updateDoc(doc(db, 'employees', editingEmployee.id), payload)
      setEmployees((prev) =>
        prev.map((item) => (item.id === editingEmployee.id ? { ...item, ...payload } : item)),
      )
      setEditingEmployee(null)
    }

    setEmployeeForm({
      name: '',
      email: '',
      role: '',
      department: '',
      status: 'Active',
      username: '',
      tempPassword: '',
    })
  }

  function editEmployee(employee) {
    setEditingEmployee(employee)
    setEmployeeForm({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      status: employee.status,
      username: '',
      tempPassword: '',
    })
  }

  async function deleteEmployee(id) {
    await deleteDoc(doc(db, 'employees', id))
    setEmployees((prev) => prev.filter((item) => item.id !== id))
  }

  async function upsertAttendance(e) {
    e.preventDefault()
    const payload = { ...attendanceForm, employee_id: attendanceForm.employee_id }
    const employee = employees.find((item) => item.id === payload.employee_id)
    const enriched = { ...payload, employee_name: employee?.name || '' }

    if (editingAttendance) {
      await updateDoc(doc(db, 'attendance', editingAttendance.id), enriched)
      setAttendance((prev) =>
        prev.map((item) => (item.id === editingAttendance.id ? { ...item, ...enriched } : item)),
      )
      setEditingAttendance(null)
    } else {
      const result = await addDoc(collection(db, 'attendance'), {
        ...enriched,
        created_at: serverTimestamp(),
      })
      setAttendance((prev) => [{ id: result.id, ...enriched }, ...prev])
    }

    setAttendanceForm({ employee_id: '', date: '', status: 'Present' })
  }

  function editAttendance(entry) {
    setEditingAttendance(entry)
    setAttendanceForm({
      employee_id: entry.employee_id,
      date: entry.date,
      status: entry.status,
    })
  }

  async function deleteAttendance(id) {
    await deleteDoc(doc(db, 'attendance', id))
    setAttendance((prev) => prev.filter((item) => item.id !== id))
  }

  async function upsertLeave(e) {
    e.preventDefault()
    const payload = { ...leaveForm, employee_id: leaveForm.employee_id }
    const employee = employees.find((item) => item.id === payload.employee_id)
    const enriched = { ...payload, employee_name: employee?.name || '' }

    if (editingLeave) {
      await updateDoc(doc(db, 'leave_requests', editingLeave.id), enriched)
      setLeaveRequests((prev) =>
        prev.map((item) => (item.id === editingLeave.id ? { ...item, ...enriched } : item)),
      )
      setEditingLeave(null)
    } else {
      const result = await addDoc(collection(db, 'leave_requests'), {
        ...enriched,
        created_at: serverTimestamp(),
      })
      setLeaveRequests((prev) => [{ id: result.id, ...enriched }, ...prev])
    }

    setLeaveForm({ employee_id: '', start_date: '', end_date: '', reason: '', status: 'Pending' })
  }

  function editLeave(entry) {
    setEditingLeave(entry)
    setLeaveForm({
      employee_id: entry.employee_id,
      start_date: entry.start_date,
      end_date: entry.end_date,
      reason: entry.reason,
      status: entry.status,
    })
  }

  async function deleteLeave(id) {
    await deleteDoc(doc(db, 'leave_requests', id))
    setLeaveRequests((prev) => prev.filter((item) => item.id !== id))
  }

  async function saveSettings(e) {
    e.preventDefault()
    await setDoc(doc(db, 'settings', 'company'), settings, { merge: true })
  }

  async function applyLeave(e) {
    e.preventDefault()
    const payload = {
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      reason: leaveForm.reason,
      status: 'Pending',
      employee_id: user.employee_id,
      employee_name: employeeProfile?.name || '',
      created_at: serverTimestamp(),
    }
    const result = await addDoc(collection(db, 'leave_requests'), payload)
    setEmployeeLeave((prev) => [{ id: result.id, ...payload }, ...prev])
    setLeaveForm({ employee_id: '', start_date: '', end_date: '', reason: '', status: 'Pending' })
  }

  async function deleteEmployeeLeave(id) {
    await deleteDoc(doc(db, 'leave_requests', id))
    setEmployeeLeave((prev) => prev.filter((item) => item.id !== id))
  }

  if (!user) {
    return (
      <div className="page">
        <div className="card">
          <div className="brand">
            <div className="logo">HR</div>
            <div>
              <p className="eyebrow">{loginMode === 'admin' ? 'Admin Portal' : 'Employee Portal'}</p>
              <h1>Sign in</h1>
            </div>
          </div>
          <div className="tabs">
            <button
              type="button"
              className={`tab ${loginMode === 'admin' ? 'active' : ''}`}
              onClick={() => {
                window.location.hash = '#/admin-login'
                setLoginMode('admin')
              }}
            >
              Admin Login
            </button>
            <button
              type="button"
              className={`tab ${loginMode === 'employee' ? 'active' : ''}`}
              onClick={() => {
                window.location.hash = '#/employee-login'
                setLoginMode('employee')
              }}
            >
              Employee Login
            </button>
          </div>

          <form onSubmit={handleSubmit} className="form">
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error && <p className="alert error">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="login-hint">Use your assigned credentials to sign in.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">HR</div>
          <div>
            <p className="eyebrow">{user.role === 'admin' ? 'Admin' : 'Employee'} Console</p>
            <p className="user">Signed in as {user.username}</p>
          </div>
        </div>

        <nav className="nav">
          {user.role === 'admin' &&
            NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${active === item.key ? 'active' : ''}`}
                type="button"
                onClick={() => setActive(item.key)}
              >
                {item.label}
              </button>
            ))}
          {user.role === 'employee' && (
            <>
              <button
                className={`nav-item ${active === 'employee-dashboard' ? 'active' : ''}`}
                type="button"
                onClick={() => setActive('employee-dashboard')}
              >
                My Dashboard
              </button>
              <button
                className={`nav-item ${active === 'employee-attendance' ? 'active' : ''}`}
                type="button"
                onClick={() => setActive('employee-attendance')}
              >
                My Attendance
              </button>
              <button
                className={`nav-item ${active === 'employee-leave' ? 'active' : ''}`}
                type="button"
                onClick={() => setActive('employee-leave')}
              >
                My Leave
              </button>
              <button
                className={`nav-item ${active === 'employee-profile' ? 'active' : ''}`}
                type="button"
                onClick={() => setActive('employee-profile')}
              >
                My Profile
              </button>
            </>
          )}
        </nav>

        <button className="logout" onClick={handleLogout} type="button">
          Log out
        </button>
      </aside>

      <main className="main">
        {user.role === 'admin' && active === 'dashboard' && (
          <section>
            <h1>Dashboard</h1>
            <p>Welcome back, {user.username}. Here is your HR overview.</p>
            <div className="card-grid">
              <div className="stat-card">
                <p className="label">Total Employees</p>
                <p className="value">{employees.length}</p>
              </div>
              <div className="stat-card">
                <p className="label">Attendance Records</p>
                <p className="value">{attendance.length}</p>
              </div>
              <div className="stat-card">
                <p className="label">Leave Requests</p>
                <p className="value">{leaveRequests.length}</p>
              </div>
            </div>
          </section>
        )}

        {user.role === 'admin' && active === 'employees' && (
          <section>
            <div className="section-header">
              <h1>Employees</h1>
              <p>Create and manage employee profiles.</p>
            </div>

            <form className="panel" onSubmit={upsertEmployee}>
              <div className="grid">
                <label>
                  Name
                  <input
                    type="text"
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Role
                  <input
                    type="text"
                    value={employeeForm.role}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Department
                  <input
                    type="text"
                    value={employeeForm.department}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={employeeForm.status}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, status: e.target.value })}
                  >
                    <option>Active</option>
                    <option>Onboarding</option>
                    <option>Inactive</option>
                  </select>
                </label>
                {!editingEmployee && (
                  <>
                    <label>
                      Username
                      <input
                        type="text"
                        value={employeeForm.username}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Temp Password
                      <input
                        type="password"
                        value={employeeForm.tempPassword}
                        onChange={(e) =>
                          setEmployeeForm({ ...employeeForm, tempPassword: e.target.value })
                        }
                        required
                      />
                    </label>
                  </>
                )}
              </div>
              <button type="submit">{editingEmployee ? 'Update Employee' : 'Add Employee'}</button>
            </form>

            <div className="table">
              <div className="table-header">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Department</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {employees.map((employee) => (
                <div className="table-row" key={employee.id}>
                  <span>{employee.name}</span>
                  <span>{employee.email}</span>
                  <span>{employee.role}</span>
                  <span>{employee.department}</span>
                  <span>{employee.status}</span>
                  <span className="actions">
                    <button type="button" onClick={() => editEmployee(employee)}>Edit</button>
                    <button type="button" onClick={() => deleteEmployee(employee.id)} className="danger">
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {user.role === 'admin' && active === 'attendance' && (
          <section>
            <div className="section-header">
              <h1>Attendance</h1>
              <p>Track daily attendance by employee.</p>
            </div>

            <form className="panel" onSubmit={upsertAttendance}>
              <div className="grid">
                <label>
                  Employee
                  <select
                    value={attendanceForm.employee_id}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={attendanceForm.date}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={attendanceForm.status}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}
                  >
                    <option>Present</option>
                    <option>Remote</option>
                    <option>Absent</option>
                  </select>
                </label>
              </div>
              <button type="submit">{editingAttendance ? 'Update Entry' : 'Add Entry'}</button>
            </form>

            <div className="table">
              <div className="table-header cols-4">
                <span>Employee</span>
                <span>Date</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {attendance.map((entry) => (
                <div className="table-row cols-4" key={entry.id}>
                  <span>{entry.employee_name || 'Unknown'}</span>
                  <span>{entry.date}</span>
                  <span>{entry.status}</span>
                  <span className="actions">
                    <button type="button" onClick={() => editAttendance(entry)}>Edit</button>
                    <button type="button" onClick={() => deleteAttendance(entry.id)} className="danger">
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {user.role === 'admin' && active === 'leave' && (
          <section>
            <div className="section-header">
              <h1>Leave</h1>
              <p>Manage employee leave requests.</p>
            </div>

            <form className="panel" onSubmit={upsertLeave}>
              <div className="grid">
                <label>
                  Employee
                  <select
                    value={leaveForm.employee_id}
                    onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                    required
                  >
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Reason
                  <input
                    type="text"
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={leaveForm.status}
                    onChange={(e) => setLeaveForm({ ...leaveForm, status: e.target.value })}
                  >
                    <option>Pending</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                </label>
              </div>
              <button type="submit">{editingLeave ? 'Update Request' : 'Add Request'}</button>
            </form>

            <div className="table">
              <div className="table-header cols-5">
                <span>Employee</span>
                <span>Dates</span>
                <span>Reason</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {leaveRequests.map((entry) => (
                <div className="table-row cols-5" key={entry.id}>
                  <span>{entry.employee_name || 'Unknown'}</span>
                  <span>
                    {entry.start_date} → {entry.end_date}
                  </span>
                  <span>{entry.reason}</span>
                  <span>{entry.status}</span>
                  <span className="actions">
                    <button type="button" onClick={() => editLeave(entry)}>Edit</button>
                    <button type="button" onClick={() => deleteLeave(entry.id)} className="danger">
                      Delete
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {user.role === 'admin' && active === 'settings' && (
          <section>
            <div className="section-header">
              <h1>Settings</h1>
              <p>Configure company defaults.</p>
            </div>

            <form className="panel" onSubmit={saveSettings}>
              <div className="grid">
                <label>
                  Company Name
                  <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  />
                </label>
                <label>
                  Timezone
                  <input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  />
                </label>
                <label>
                  Default Work Hours
                  <input
                    type="text"
                    value={settings.defaultWorkHours}
                    onChange={(e) => setSettings({ ...settings, defaultWorkHours: e.target.value })}
                  />
                </label>
              </div>
              <button type="submit">Save Settings</button>
            </form>
          </section>
        )}

        {user.role === 'employee' && active === 'employee-dashboard' && (
          <section>
            <h1>My Dashboard</h1>
            <p>Welcome, {employeeProfile?.name || user.username}.</p>
            <div className="card-grid">
              <div className="stat-card">
                <p className="label">Attendance Records</p>
                <p className="value">{employeeAttendance.length}</p>
              </div>
              <div className="stat-card">
                <p className="label">Leave Requests</p>
                <p className="value">{employeeLeave.length}</p>
              </div>
            </div>
          </section>
        )}

        {user.role === 'employee' && active === 'employee-attendance' && (
          <section>
            <div className="section-header">
              <h1>My Attendance</h1>
              <p>Your personal attendance records.</p>
            </div>
            <div className="table">
              <div className="table-header cols-3">
                <span>Date</span>
                <span>Status</span>
                <span>Recorded At</span>
              </div>
              {employeeAttendance.map((entry) => (
                <div className="table-row cols-3" key={entry.id}>
                  <span>{entry.date}</span>
                  <span>{entry.status}</span>
                  <span>
                    {entry.created_at?.toDate ? entry.created_at.toDate().toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {user.role === 'employee' && active === 'employee-leave' && (
          <section>
            <div className="section-header">
              <h1>My Leave</h1>
              <p>Apply for leave and track approvals.</p>
            </div>

            <form className="panel" onSubmit={applyLeave}>
              <div className="grid">
                <label>
                  Start Date
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Reason
                  <input
                    type="text"
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    required
                  />
                </label>
              </div>
              <button type="submit">Apply Leave</button>
            </form>

            <div className="table">
              <div className="table-header cols-5">
                <span>Dates</span>
                <span>Reason</span>
                <span>Status</span>
                <span>Created</span>
                <span>Actions</span>
              </div>
              {employeeLeave.map((entry) => (
                <div className="table-row cols-5" key={entry.id}>
                  <span>
                    {entry.start_date} → {entry.end_date}
                  </span>
                  <span>{entry.reason}</span>
                  <span>{entry.status}</span>
                  <span>
                    {entry.created_at?.toDate ? entry.created_at.toDate().toLocaleDateString() : ''}
                  </span>
                  <span className="actions">
                    {entry.status === 'Pending' ? (
                      <button type="button" onClick={() => deleteEmployeeLeave(entry.id)} className="danger">
                        Cancel
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {user.role === 'employee' && active === 'employee-profile' && (
          <section>
            <div className="section-header">
              <h1>My Profile</h1>
              <p>Basic details pulled from HR records.</p>
            </div>
            <div className="panel profile-card">
              <div>
                <p className="label">Name</p>
                <p className="value">{employeeProfile?.name || '-'}</p>
              </div>
              <div>
                <p className="label">Email</p>
                <p className="value">{employeeProfile?.email || '-'}</p>
              </div>
              <div>
                <p className="label">Role</p>
                <p className="value">{employeeProfile?.role || '-'}</p>
              </div>
              <div>
                <p className="label">Department</p>
                <p className="value">{employeeProfile?.department || '-'}</p>
              </div>
              <div>
                <p className="label">Status</p>
                <p className="value">{employeeProfile?.status || '-'}</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
