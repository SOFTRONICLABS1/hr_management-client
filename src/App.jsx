import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'settings', label: 'Settings' },
]

function useAuthedFetch(onUnauthorized) {
  return async (path, options = {}) => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: token ? `Bearer ${token}` : '',
      },
    })

    if (res.status === 401) {
      onUnauthorized()
      throw new Error('Unauthorized')
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || 'Request failed')
    }

    if (res.status === 204) return null
    return res.json()
  }
}

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [active, setActive] = useState('dashboard')
  const [loginMode, setLoginMode] = useState('admin')
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  })

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
    permissions: {
      attendance_view: true,
      leave_apply: true,
      profile_view: true,
    },
    search: '',
    statusFilter: 'All',
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

  const authedFetch = useAuthedFetch(() => {
    localStorage.removeItem('token')
    setUser(null)
  })

  const userPermissions = user?.permissions || {}

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

    const token = localStorage.getItem('token')
    if (!token) {
      return () => window.removeEventListener('hashchange', onHashChange)
    }

    authedFetch('/auth/me')
      .then((data) => {
        setUser(data.user)
      })
      .catch(() => {})

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!user) return

    if (user.role === 'admin') {
      Promise.all([
        authedFetch('/employees'),
        authedFetch('/attendance'),
        authedFetch('/leave'),
        authedFetch('/settings'),
      ])
        .then(([employeesData, attendanceData, leaveData, settingsData]) => {
          setEmployees(employeesData)
          setAttendance(attendanceData)
          setLeaveRequests(leaveData)
          setSettings({
            companyName: settingsData.companyName || '',
            timezone: settingsData.timezone || '',
            defaultWorkHours: settingsData.defaultWorkHours || '',
          })
        })
        .catch(() => {})
    } else if (user.role === 'employee') {
      const tasks = []
      if (userPermissions.profile_view) tasks.push(authedFetch('/employee/me'))
      else tasks.push(Promise.resolve(null))
      if (userPermissions.attendance_view) tasks.push(authedFetch('/employee/attendance'))
      else tasks.push(Promise.resolve([]))
      if (userPermissions.leave_apply) tasks.push(authedFetch('/employee/leave'))
      else tasks.push(Promise.resolve([]))

      Promise.all(tasks)
        .then(([profile, attendanceData, leaveData]) => {
          setEmployeeProfile(profile)
          setEmployeeAttendance(attendanceData)
          setEmployeeLeave(leaveData)
        })
        .catch(() => {})
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

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Login failed')
      }

      const data = await res.json()
      localStorage.setItem('token', data.token)
      setUser(data.user)
      setActive(loginMode === 'employee' ? 'employee-dashboard' : 'dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('token')
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
      if (employeeForm.tempPassword.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (!employeeForm.email.includes('@')) {
        setError('Please enter a valid email.')
        return
      }

      const created = await authedFetch('/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: employeeForm.name,
          email: employeeForm.email,
          role: employeeForm.role,
          department: employeeForm.department,
          status: employeeForm.status,
          username: employeeForm.username,
          password: employeeForm.tempPassword,
          permissions: employeeForm.permissions,
        }),
      })

      setEmployees((prev) => [created, ...prev])
    } else {
      const updated = await authedFetch(`/employees?id=${editingEmployee.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: employeeForm.name,
          email: employeeForm.email,
          role: employeeForm.role,
          department: employeeForm.department,
          status: employeeForm.status,
          permissions: employeeForm.permissions,
        }),
      })

      setEmployees((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
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
      permissions: {
        attendance_view: true,
        leave_apply: true,
        profile_view: true,
      },
      search: employeeForm.search,
      statusFilter: employeeForm.statusFilter,
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
      permissions: employee.permissions || {
        attendance_view: true,
        leave_apply: true,
        profile_view: true,
      },
    })
  }

  async function deleteEmployee(id) {
    await authedFetch(`/employees?id=${id}`, { method: 'DELETE' })
    setEmployees((prev) => prev.filter((item) => item.id !== id))
  }

  async function upsertAttendance(e) {
    e.preventDefault()
    const employee = employees.find((item) => item.id === attendanceForm.employee_id)

    if (editingAttendance) {
      const updated = await authedFetch(`/attendance?id=${editingAttendance.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          employee_id: attendanceForm.employee_id,
          employee_name: employee?.name || '',
          date: attendanceForm.date,
          status: attendanceForm.status,
        }),
      })

      setAttendance((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingAttendance(null)
    } else {
      const created = await authedFetch('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: attendanceForm.employee_id,
          employee_name: employee?.name || '',
          date: attendanceForm.date,
          status: attendanceForm.status,
        }),
      })

      setAttendance((prev) => [created, ...prev])
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
    await authedFetch(`/attendance?id=${id}`, { method: 'DELETE' })
    setAttendance((prev) => prev.filter((item) => item.id !== id))
  }

  async function upsertLeave(e) {
    e.preventDefault()
    const employee = employees.find((item) => item.id === leaveForm.employee_id)

    if (editingLeave) {
      const updated = await authedFetch(`/leave?id=${editingLeave.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          employee_id: leaveForm.employee_id,
          employee_name: employee?.name || '',
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason,
          status: leaveForm.status,
        }),
      })

      setLeaveRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingLeave(null)
    } else {
      const created = await authedFetch('/leave', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: leaveForm.employee_id,
          employee_name: employee?.name || '',
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason,
          status: leaveForm.status,
        }),
      })

      setLeaveRequests((prev) => [created, ...prev])
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
    await authedFetch(`/leave?id=${id}`, { method: 'DELETE' })
    setLeaveRequests((prev) => prev.filter((item) => item.id !== id))
  }

  async function saveSettings(e) {
    e.preventDefault()
    await authedFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  async function applyLeave(e) {
    e.preventDefault()
    const created = await authedFetch('/employee/leave', {
      method: 'POST',
      body: JSON.stringify({
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason,
      }),
    })

    setEmployeeLeave((prev) => [created, ...prev])
    setLeaveForm({ employee_id: '', start_date: '', end_date: '', reason: '', status: 'Pending' })
  }

  async function deleteEmployeeLeave(id) {
    await authedFetch(`/employee/leave?id=${id}`, { method: 'DELETE' })
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
              {userPermissions.attendance_view && (
                <button
                  className={`nav-item ${active === 'employee-attendance' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActive('employee-attendance')}
                >
                  My Attendance
                </button>
              )}
              {userPermissions.leave_apply && (
                <button
                  className={`nav-item ${active === 'employee-leave' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActive('employee-leave')}
                >
                  My Leave
                </button>
              )}
              {userPermissions.profile_view && (
                <button
                  className={`nav-item ${active === 'employee-profile' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActive('employee-profile')}
                >
                  My Profile
                </button>
              )}
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
                <label>
                  Permissions
                  <div className="checkbox-group">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={employeeForm.permissions.attendance_view}
                        onChange={(e) =>
                          setEmployeeForm({
                            ...employeeForm,
                            permissions: {
                              ...employeeForm.permissions,
                              attendance_view: e.target.checked,
                            },
                          })
                        }
                      />
                      View Attendance
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={employeeForm.permissions.leave_apply}
                        onChange={(e) =>
                          setEmployeeForm({
                            ...employeeForm,
                            permissions: {
                              ...employeeForm.permissions,
                              leave_apply: e.target.checked,
                            },
                          })
                        }
                      />
                      Apply Leave
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={employeeForm.permissions.profile_view}
                        onChange={(e) =>
                          setEmployeeForm({
                            ...employeeForm,
                            permissions: {
                              ...employeeForm.permissions,
                              profile_view: e.target.checked,
                            },
                          })
                        }
                      />
                      View Profile
                    </label>
                  </div>
                </label>
              </div>
              <button type="submit">{editingEmployee ? 'Update Employee' : 'Add Employee'}</button>
            </form>

            <div className="filters">
              <input
                type="text"
                placeholder="Search by name or email"
                value={employeeForm.search || ''}
                onChange={(e) => setEmployeeForm({ ...employeeForm, search: e.target.value })}
              />
              <select
                value={employeeForm.statusFilter || 'All'}
                onChange={(e) => setEmployeeForm({ ...employeeForm, statusFilter: e.target.value })}
              >
                <option>All</option>
                <option>Active</option>
                <option>Onboarding</option>
                <option>Inactive</option>
              </select>
            </div>

            <div className="table">
              <div className="table-header">
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Department</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {employees
                .filter((employee) => {
                  const query = (employeeForm.search || '').toLowerCase()
                  const matchesQuery =
                    !query ||
                    employee.name.toLowerCase().includes(query) ||
                    employee.email.toLowerCase().includes(query)
                  const statusFilter = employeeForm.statusFilter || 'All'
                  const matchesStatus = statusFilter === 'All' || employee.status === statusFilter
                  return matchesQuery && matchesStatus
                })
                .map((employee) => (
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

            <form className="panel" onSubmit={changePassword}>
              <h2>Change Admin Password</h2>
              <div className="grid">
                <label>
                  Current Password
                  <input
                    type="password"
                    value={passwordForm.current}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, current: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  New Password
                  <input
                    type="password"
                    value={passwordForm.next}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, next: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Confirm New Password
                  <input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirm: e.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <button type="submit">Update Password</button>
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
                  <span>{entry.created_at || ''}</span>
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
                  <span>{entry.created_at || ''}</span>
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
  async function changePassword(e) {
    e.preventDefault()
    setError('')

    if (passwordForm.next.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setError('New password and confirmation do not match.')
      return
    }

    await authedFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next,
      }),
    })

    setPasswordForm({ current: '', next: '', confirm: '' })
  }
