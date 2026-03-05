import { useEffect, useMemo, useState } from 'react'
import './App.css'

const defaultHost =
  typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost'
const API_BASE_AUTH = import.meta.env.VITE_API_BASE_AUTH || `http://${defaultHost}:4000`
const API_BASE_HR = import.meta.env.VITE_API_BASE_HR || `http://${defaultHost}:4000`

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'payslips', label: 'Payslips' },
  { key: 'settings', label: 'Settings' },
]

function useAuthedFetch(onUnauthorized, baseUrl) {
  return async (path, options = {}) => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${baseUrl}${path}`, {
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

const sanitizeIntInput = (value) => String(value || '').replace(/[^0-9]/g, '')
const hasNonDigits = (value) => /[^0-9]/.test(String(value || ''))

export default function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [active, setActive] = useState('dashboard')
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  })
  const [passwordError, setPasswordError] = useState('')
  const [showPasswordFields, setShowPasswordFields] = useState(false)

  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [payslips, setPayslips] = useState([])
  const [payslipRequests, setPayslipRequests] = useState([])
  const [employeePayslipRequests, setEmployeePayslipRequests] = useState([])
  const [employeePayslips, setEmployeePayslips] = useState([])
  const [settings, setSettings] = useState({
    companyName: '',
    timezone: '',
    defaultWorkHours: '',
  })
  const [employeeProfile, setEmployeeProfile] = useState(null)
  const [employeeAttendance, setEmployeeAttendance] = useState([])
  const [employeeLeave, setEmployeeLeave] = useState([])
  const [employeePayslipRequestMonth, setEmployeePayslipRequestMonth] = useState('')

  const defaultEmployeeForm = {
    name: '',
    email: '',
    role: '',
    department: '',
    status: 'Active',
    username: '',
    tempPassword: '',
    resetPassword: '',
    permissions: {
      attendance_view: true,
      leave_apply: true,
      profile_view: true,
    },
    search: '',
    statusFilter: 'All',
  }

  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm)

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    date: '',
    status: 'Present',
  })

  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    subject: '',
    description: '',
    reason: '',
    status: 'Pending',
  })

  const defaultPayslipForm = {
    employee_id: '',
    month: '',
    name: '',
    employee_no: '',
    no_of_days_pay: '',
    location: '',
    no_of_days_in_month: '',
    bank: '',
    location_india_days: '',
    bank_ac_no: '',
    lop: '',
    employee_pan: '',
    employer_pan: '',
    employer_tan: '',
    leaves: '',
    role: '',
    role_designation: '',
    basic_salary: '',
    income_tax: '',
    house_rent_allowance: '',
    professional_tax: '',
    conveyance_allowance: '',
    medical_allowance: '',
    special_allowance: '',
    total_income: '',
    total_deductions: '',
    net_pay: '',
    information: '',
    generated_on: '',
  }

  const [payslipForm, setPayslipForm] = useState(defaultPayslipForm)
  const [payslipErrors, setPayslipErrors] = useState({})

  const [editingEmployee, setEditingEmployee] = useState(null)
  const [editingAttendance, setEditingAttendance] = useState(null)
  const [editingLeave, setEditingLeave] = useState(null)
  const [editingPayslip, setEditingPayslip] = useState(null)
  const [showTempPassword, setShowTempPassword] = useState(false)
  const [usePrevMonth, setUsePrevMonth] = useState(false)
  const [prevMonthNotice, setPrevMonthNotice] = useState('')
  const [payslipRequestId, setPayslipRequestId] = useState(null)

  const handleNumericChange = (field, value) => {
    const clean = sanitizeIntInput(value)
    setPayslipForm((prev) => ({ ...prev, [field]: clean }))
    setPayslipErrors((prev) => ({
      ...prev,
      [field]: hasNonDigits(value) ? 'Enter only numbers' : '',
    }))
  }

  const getPreviousMonthKey = (value) => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return ''
    const [yearStr, monthStr] = value.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!year || !month) return ''
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  }

  const formatMonthLabel = (value) => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return ''
    const [yearStr, monthStr] = value.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!year || !month) return ''
    const date = new Date(year, month - 1, 1)
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }

  const getPrevMonthCandidates = (value) => {
    const prevKey = getPreviousMonthKey(value)
    const prevLabel = formatMonthLabel(prevKey)
    return [prevKey, prevLabel].filter(Boolean)
  }

  const employeeOptions = useMemo(() => employees, [employees])
  const employeeStats = useMemo(() => {
    const total = employees.length
    const active = employees.filter((item) => item.status === 'Active').length
    const onboarding = employees.filter((item) => item.status === 'Onboarding').length
    const inactive = employees.filter((item) => item.status === 'Inactive').length
    return { total, active, onboarding, inactive }
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const query = (employeeForm.search || '').toLowerCase()
    const statusFilter = employeeForm.statusFilter || 'All'
    return employees.filter((employee) => {
      const matchesQuery =
        !query ||
        employee.name.toLowerCase().includes(query) ||
        employee.email.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'All' || employee.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [employees, employeeForm.search, employeeForm.statusFilter])

  const payslipTotals = useMemo(() => {
    const toNumber = (value) => (value === '' ? 0 : Number(value) || 0)
    const totalIncome =
      toNumber(payslipForm.basic_salary) +
      toNumber(payslipForm.house_rent_allowance) +
      toNumber(payslipForm.conveyance_allowance) +
      toNumber(payslipForm.medical_allowance) +
      toNumber(payslipForm.special_allowance)
    const totalDeductions =
      toNumber(payslipForm.income_tax) + toNumber(payslipForm.professional_tax)
    const netPay = totalIncome - totalDeductions
    return {
      totalIncome: totalIncome ? String(totalIncome) : '0',
      totalDeductions: totalDeductions ? String(totalDeductions) : '0',
      netPay: netPay ? String(netPay) : '0',
    }
  }, [
    payslipForm.basic_salary,
    payslipForm.house_rent_allowance,
    payslipForm.conveyance_allowance,
    payslipForm.medical_allowance,
    payslipForm.special_allowance,
    payslipForm.income_tax,
    payslipForm.professional_tax,
  ])

  useEffect(() => {
    setPayslipForm((prev) => {
      const next = {
        ...prev,
        total_income: payslipTotals.totalIncome,
        total_deductions: payslipTotals.totalDeductions,
        net_pay: payslipTotals.netPay,
      }
      if (
        prev.total_income === next.total_income &&
        prev.total_deductions === next.total_deductions &&
        prev.net_pay === next.net_pay
      ) {
        return prev
      }
      return next
    })
  }, [payslipTotals])

  const authedFetchAuth = useAuthedFetch(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, API_BASE_AUTH)

  const authedFetchHR = useAuthedFetch(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, API_BASE_HR)

  const defaultEmployeePermissions = {
    attendance_view: true,
    leave_apply: true,
    profile_view: true,
  }
  const userPermissions =
    user?.permissions || (user?.role === 'employee' ? defaultEmployeePermissions : {})

  const refreshLeaveRequests = async () => {
    const data = await authedFetchHR('/leave')
    setLeaveRequests(data)
  }

  const refreshPayslipRequests = async () => {
    const data = await authedFetchAuth('/payslip-requests')
    setPayslipRequests(data)
  }

  const refreshEmployeePayslips = async () => {
    const [requests, payslipsData] = await Promise.all([
      authedFetchAuth('/employee/payslip-requests'),
      authedFetchAuth('/employee/payslips'),
    ])
    setEmployeePayslipRequests(requests)
    setEmployeePayslips(payslipsData)
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    authedFetchAuth('/auth/me')
      .then((data) => {
        setUser(data.user)
        setActive(data.user.role === 'employee' ? 'employee-dashboard' : 'dashboard')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return

    if (user.role === 'admin') {
      Promise.all([
        authedFetchAuth('/employees'),
        authedFetchHR('/attendance'),
        authedFetchHR('/leave'),
        authedFetchAuth('/payslips'),
        authedFetchAuth('/payslip-requests'),
        authedFetchAuth('/settings'),
      ])
        .then(
          ([
            employeesData,
            attendanceData,
            leaveData,
            payslipsData,
            payslipRequestsData,
            settingsData,
          ]) => {
          setEmployees(employeesData)
          setAttendance(attendanceData)
          setLeaveRequests(leaveData)
          setPayslips(payslipsData)
          setPayslipRequests(payslipRequestsData)
          setSettings({
            companyName: settingsData.companyName || '',
            timezone: settingsData.timezone || '',
            defaultWorkHours: settingsData.defaultWorkHours || '',
          })
        })
        .catch(() => {})
    } else if (user.role === 'employee') {
      const tasks = []
      if (userPermissions.profile_view) tasks.push(authedFetchHR('/employee/me'))
      else tasks.push(Promise.resolve(null))
      if (userPermissions.attendance_view) tasks.push(authedFetchHR('/employee/attendance'))
      else tasks.push(Promise.resolve([]))
      if (userPermissions.leave_apply) tasks.push(authedFetchHR('/employee/leave'))
      else tasks.push(Promise.resolve([]))
      tasks.push(authedFetchAuth('/employee/payslip-requests'))
      tasks.push(authedFetchAuth('/employee/payslips'))

      Promise.all(tasks)
        .then(([profile, attendanceData, leaveData, payslipRequestData, payslipData]) => {
          setEmployeeProfile(profile)
          setEmployeeAttendance(attendanceData)
          setEmployeeLeave(leaveData)
          setEmployeePayslipRequests(payslipRequestData)
          setEmployeePayslips(payslipData)
        })
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    if (user.role !== 'admin') return
    if (active !== 'leave') return
    refreshLeaveRequests().catch(() => {})
  }, [active, user])

  useEffect(() => {
    if (!user) return
    if (user.role !== 'admin') return
    if (active !== 'payslips') return
    refreshPayslipRequests().catch(() => {})
  }, [active, user])

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
      const res = await fetch(`${API_BASE_AUTH}/auth/login`, {
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
      setActive(data.user.role === 'employee' ? 'employee-dashboard' : 'dashboard')
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

  function resetEmployeeForm({ keepFilters } = { keepFilters: true }) {
    setEmployeeForm((prev) => ({
      ...defaultEmployeeForm,
      search: keepFilters ? prev.search : defaultEmployeeForm.search,
      statusFilter: keepFilters ? prev.statusFilter : defaultEmployeeForm.statusFilter,
    }))
    setEditingEmployee(null)
    setShowTempPassword(false)
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

      const created = await authedFetchAuth('/employees', {
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
      const updated = await authedFetchAuth(`/employees/${editingEmployee.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: employeeForm.name,
          email: employeeForm.email,
          role: employeeForm.role,
          department: employeeForm.department,
          status: employeeForm.status,
          permissions: employeeForm.permissions,
          reset_password: employeeForm.resetPassword || '',
        }),
      })

      setEmployees((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingEmployee(null)
    }

    resetEmployeeForm({ keepFilters: true })
  }

  function editEmployee(employee) {
    setEditingEmployee(employee)
    setEmployeeForm((prev) => ({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      status: employee.status,
      username: '',
      tempPassword: '',
      resetPassword: '',
      permissions: employee.permissions || {
        attendance_view: true,
        leave_apply: true,
        profile_view: true,
      },
      search: prev.search,
      statusFilter: prev.statusFilter,
    }))
    setShowTempPassword(false)
  }

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
    let value = ''
    for (let i = 0; i < 10; i += 1) {
      value += chars[Math.floor(Math.random() * chars.length)]
    }
    setEmployeeForm((prev) => ({ ...prev, tempPassword: value }))
  }

  function generateResetPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
    let value = ''
    for (let i = 0; i < 10; i += 1) {
      value += chars[Math.floor(Math.random() * chars.length)]
    }
    setEmployeeForm((prev) => ({ ...prev, resetPassword: value }))
  }

  async function deleteEmployee(id) {
    await authedFetchAuth(`/employees/${id}`, { method: 'DELETE' })
    setEmployees((prev) => prev.filter((item) => item.id !== id))
  }

  function resetPayslipForm() {
    setPayslipForm(defaultPayslipForm)
    setPayslipErrors({})
    setEditingPayslip(null)
    setUsePrevMonth(false)
    setPrevMonthNotice('')
    setPayslipRequestId(null)
  }

  function handlePayslipEmployeeChange(employeeId) {
    const selected = employees.find((item) => String(item.id) === String(employeeId))
    setPayslipForm((prev) => ({
      ...prev,
      employee_id: employeeId,
      name: selected?.name || prev.name,
      role: selected?.role || prev.role,
      role_designation: selected?.department || prev.role_designation,
    }))
  }

  function loadPayslipRequest(request) {
    handlePayslipEmployeeChange(request.employee_id)
    setPayslipForm((prev) => ({
      ...prev,
      month: request.month || '',
    }))
    setPayslipRequestId(request.id)
    setUsePrevMonth(false)
  }

  useEffect(() => {
    if (!usePrevMonth) return
    if (!payslipForm.employee_id || !payslipForm.month) return
    const candidates = getPrevMonthCandidates(payslipForm.month)
    if (!candidates.length) return
    const prevPayslip = payslips.find(
      (item) =>
        String(item.employee_id) === String(payslipForm.employee_id) &&
        candidates.includes(String(item.month)),
    )
    if (!prevPayslip) {
      setPrevMonthNotice('No previous month payslip found for this employee.')
      return
    }
    setPrevMonthNotice('')
    setPayslipForm((prev) => ({
      ...prev,
      name: prevPayslip.name ?? '',
      employee_no: prevPayslip.employee_no ?? '',
      no_of_days_pay: prevPayslip.no_of_days_pay ?? '',
      location: prevPayslip.location ?? '',
      no_of_days_in_month: prevPayslip.no_of_days_in_month ?? '',
      bank: prevPayslip.bank ?? '',
      location_india_days: prevPayslip.location_india_days ?? '',
      bank_ac_no: prevPayslip.bank_ac_no ?? '',
      lop: prevPayslip.lop ?? '',
      employee_pan: prevPayslip.employee_pan ?? '',
      employer_pan: prevPayslip.employer_pan ?? '',
      employer_tan: prevPayslip.employer_tan ?? '',
      leaves: prevPayslip.leaves ?? '',
      role: prevPayslip.role ?? '',
      role_designation: prevPayslip.role_designation ?? '',
      basic_salary: prevPayslip.basic_salary ?? '',
      income_tax: prevPayslip.income_tax ?? '',
      house_rent_allowance: prevPayslip.house_rent_allowance ?? '',
      professional_tax: prevPayslip.professional_tax ?? '',
      conveyance_allowance: prevPayslip.conveyance_allowance ?? '',
      medical_allowance: prevPayslip.medical_allowance ?? '',
      special_allowance: prevPayslip.special_allowance ?? '',
      total_income: prevPayslip.total_income ?? '',
      total_deductions: prevPayslip.total_deductions ?? '',
      net_pay: prevPayslip.net_pay ?? '',
      information: prevPayslip.information ?? '',
      generated_on: prevPayslip.generated_on ?? '',
    }))
  }, [usePrevMonth, payslipForm.employee_id, payslipForm.month, payslips])

  function editPayslip(entry) {
    setEditingPayslip(entry)
    setPayslipForm({
      employee_id: entry.employee_id || '',
      month: entry.month || '',
      name: entry.name || '',
      employee_no: entry.employee_no || '',
      no_of_days_pay: entry.no_of_days_pay || '',
      location: entry.location || '',
      no_of_days_in_month: entry.no_of_days_in_month || '',
      bank: entry.bank || '',
      location_india_days: entry.location_india_days || '',
      bank_ac_no: entry.bank_ac_no || '',
      lop: entry.lop || '',
      employee_pan: entry.employee_pan || '',
      employer_pan: entry.employer_pan || '',
      employer_tan: entry.employer_tan || '',
      leaves: entry.leaves || '',
      role: entry.role || '',
      role_designation: entry.role_designation || '',
      basic_salary: entry.basic_salary ?? '',
      income_tax: entry.income_tax ?? '',
      house_rent_allowance: entry.house_rent_allowance ?? '',
      professional_tax: entry.professional_tax ?? '',
      conveyance_allowance: entry.conveyance_allowance ?? '',
      medical_allowance: entry.medical_allowance ?? '',
      special_allowance: entry.special_allowance ?? '',
      total_income: entry.total_income ?? '',
      total_deductions: entry.total_deductions ?? '',
      net_pay: entry.net_pay ?? '',
      information: entry.information || '',
      generated_on: entry.generated_on || '',
    })
  }

  async function deletePayslip(id) {
    await authedFetchAuth(`/payslips/${id}`, { method: 'DELETE' })
    setPayslips((prev) => prev.filter((item) => item.id !== id))
  }

  async function updatePayslipRequestStatus(id, status, payslipId = null) {
    const updated = await authedFetchAuth(`/payslip-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, payslip_id: payslipId }),
    })
    setPayslipRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function downloadPayslip(entry) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE_AUTH}/payslips/${entry.id}/pdf`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || 'Failed to download payslip.')
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (entry.name || 'Employee').replace(/[^a-z0-9-_]/gi, '_')
    const safeMonth = (entry.month || 'Payslip').replace(/[^a-z0-9-_]/gi, '_')
    link.href = url
    link.download = `Payslip-${safeName}-${safeMonth}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  async function upsertPayslip(e) {
    e.preventDefault()
    setError('')

    const hasNumericErrors = Object.values(payslipErrors).some(Boolean)
    if (hasNumericErrors) {
      setError('Please enter only numbers in the highlighted fields.')
      return
    }

    if (!payslipForm.employee_id || !payslipForm.month) {
      setError('Employee and month are required.')
      return
    }

    const toNumberOrNull = (value) => {
      if (value === '' || value === null || value === undefined) return null
      const num = Number(value)
      return Number.isNaN(num) ? null : num
    }

    const payload = {
      ...payslipForm,
      basic_salary: toNumberOrNull(payslipForm.basic_salary),
      income_tax: toNumberOrNull(payslipForm.income_tax),
      house_rent_allowance: toNumberOrNull(payslipForm.house_rent_allowance),
      professional_tax: toNumberOrNull(payslipForm.professional_tax),
      conveyance_allowance: toNumberOrNull(payslipForm.conveyance_allowance),
      medical_allowance: toNumberOrNull(payslipForm.medical_allowance),
      special_allowance: toNumberOrNull(payslipForm.special_allowance),
      total_income: toNumberOrNull(payslipForm.total_income),
      total_deductions: toNumberOrNull(payslipForm.total_deductions),
      net_pay: toNumberOrNull(payslipForm.net_pay),
    }

    if (editingPayslip) {
      const updated = await authedFetchAuth(`/payslips/${editingPayslip.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setPayslips((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      resetPayslipForm()
    } else {
      if (payslipRequestId) {
        payload.request_id = payslipRequestId
      }
      const created = await authedFetchAuth('/payslips', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setPayslips((prev) => [created, ...prev])
      if (payslipRequestId) {
        await refreshPayslipRequests()
      }
      resetPayslipForm()
    }
  }

  async function upsertAttendance(e) {
    e.preventDefault()
    const employee = employees.find((item) => item.id === attendanceForm.employee_id)

    if (editingAttendance) {
      const updated = await authedFetchHR(`/attendance?id=${editingAttendance.id}`, {
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
      const created = await authedFetchHR('/attendance', {
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
    await authedFetchHR(`/attendance?id=${id}`, { method: 'DELETE' })
    setAttendance((prev) => prev.filter((item) => item.id !== id))
  }

  async function upsertLeave(e) {
    e.preventDefault()
    const employee = employees.find((item) => item.id === leaveForm.employee_id)

    if (editingLeave) {
      const updated = await authedFetchHR(`/leave/${editingLeave.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          employee_id: leaveForm.employee_id,
          employee_name: employee?.name || '',
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          subject: leaveForm.subject,
          description: leaveForm.description,
          reason: leaveForm.description || leaveForm.reason,
          status: leaveForm.status,
        }),
      })

      setLeaveRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingLeave(null)
    } else {
      const created = await authedFetchHR('/leave', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: leaveForm.employee_id,
          employee_name: employee?.name || '',
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          subject: leaveForm.subject,
          description: leaveForm.description,
          reason: leaveForm.description || leaveForm.reason,
          status: leaveForm.status,
        }),
      })

      setLeaveRequests((prev) => [created, ...prev])
    }

    setLeaveForm({
      employee_id: '',
      start_date: '',
      end_date: '',
      subject: '',
      description: '',
      reason: '',
      status: 'Pending',
    })
  }

  function editLeave(entry) {
    setEditingLeave(entry)
    setLeaveForm({
      employee_id: entry.employee_id,
      start_date: entry.start_date,
      end_date: entry.end_date,
      subject: entry.subject || '',
      description: entry.description || entry.reason || '',
      reason: entry.reason || '',
      status: entry.status,
    })
  }

  async function deleteLeave(id) {
    await authedFetchHR(`/leave/${id}`, { method: 'DELETE' })
    setLeaveRequests((prev) => prev.filter((item) => item.id !== id))
  }

  async function saveSettings(e) {
    e.preventDefault()
    await authedFetchAuth('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  async function applyLeave(e) {
    e.preventDefault()
    const created = await authedFetchHR('/employee/leave', {
      method: 'POST',
      body: JSON.stringify({
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        subject: leaveForm.subject,
        description: leaveForm.description,
        reason: leaveForm.description || leaveForm.reason,
      }),
    })

    setEmployeeLeave((prev) => [created, ...prev])
    setLeaveForm({
      employee_id: '',
      start_date: '',
      end_date: '',
      subject: '',
      description: '',
      reason: '',
      status: 'Pending',
    })
  }

  async function deleteEmployeeLeave(id) {
    await authedFetchHR(`/employee/leave?id=${id}`, { method: 'DELETE' })
    setEmployeeLeave((prev) => prev.filter((item) => item.id !== id))
  }

  async function requestPayslip(e) {
    e.preventDefault()
    const created = await authedFetchAuth('/employee/payslip-requests', {
      method: 'POST',
      body: JSON.stringify({ month: employeePayslipRequestMonth }),
    })
    setEmployeePayslipRequests((prev) => [created, ...prev])
    setEmployeePayslipRequestMonth('')
  }

  async function downloadEmployeePayslip(entry) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE_AUTH}/employee/payslips/${entry.id}/pdf`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || 'Failed to download payslip.')
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (entry.name || 'Employee').replace(/[^a-z0-9-_]/gi, '_')
    const safeMonth = (entry.month || 'Payslip').replace(/[^a-z0-9-_]/gi, '_')
    link.href = url
    link.download = `Payslip-${safeName}-${safeMonth}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  async function changePassword(e) {
    e.preventDefault()
    setPasswordError('')

    if (passwordForm.next.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    try {
      await authedFetchAuth('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.next,
        }),
      })
      setPasswordForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.')
    }
  }

  if (!user) {
    return (
      <div className="page">
        <div className="card">
          <div className="brand">
            <div className="logo">HR</div>
            <div>
              <p className="eyebrow">Welcome Back</p>
              <h1>Sign in</h1>
            </div>
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
              <button
                className={`nav-item ${active === 'employee-payslips' ? 'active' : ''}`}
                type="button"
                onClick={() => setActive('employee-payslips')}
              >
                My Payslips
              </button>
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
        <div className="main-header">
          <div>
            <p className="eyebrow muted">
              {user.role === 'admin' ? 'Admin Workspace' : 'Employee Workspace'}
            </p>
            <h1>{user.role === 'admin' ? 'HR Control Center' : 'My HR Hub'}</h1>
          </div>
          <div className="header-actions">
            <span className="pill">{user.role.toUpperCase()}</span>
          </div>
        </div>
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
            <div className="section-header spread">
              <div>
                <h1>Employees</h1>
                <p>Create, manage, and support your team from one place.</p>
              </div>
              <div className="header-actions">
                {editingEmployee && (
                  <span className="pill subtle">Editing {employeeForm.name || 'employee'}</span>
                )}
                <button type="button" className="ghost" onClick={() => resetEmployeeForm({ keepFilters: true })}>
                  New Employee
                </button>
              </div>
            </div>

            <div className="employee-stats">
              <div className="stat-card">
                <p className="label">Total</p>
                <p className="value">{employeeStats.total}</p>
              </div>
              <div className="stat-card">
                <p className="label">Active</p>
                <p className="value">{employeeStats.active}</p>
              </div>
              <div className="stat-card">
                <p className="label">Onboarding</p>
                <p className="value">{employeeStats.onboarding}</p>
              </div>
              <div className="stat-card">
                <p className="label">Inactive</p>
                <p className="value">{employeeStats.inactive}</p>
              </div>
            </div>

            <div className="employee-page">
              <div className="employee-form-wrap">
                <form className="panel employee-form" onSubmit={upsertEmployee}>
                  <div className="panel-header">
                    <div>
                      <h2>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
                      <p className="muted">
                        {editingEmployee
                          ? 'Update profile details and permissions.'
                          : 'Create a new profile with login access and permissions.'}
                      </p>
                    </div>
                    {editingEmployee && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => resetEmployeeForm({ keepFilters: true })}
                      >
                        Clear
                      </button>
                    )}
                  </div>

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
                          onChange={(e) =>
                            setEmployeeForm({ ...employeeForm, username: e.target.value })
                          }
                          required
                        />
                        <span className="field-hint">Used to sign in. Keep it short and unique.</span>
                      </label>
                      <label>
                        Temp Password
                        <div className="input-row">
                          <input
                            type={showTempPassword ? 'text' : 'password'}
                            value={employeeForm.tempPassword}
                            onChange={(e) =>
                              setEmployeeForm({ ...employeeForm, tempPassword: e.target.value })
                            }
                            required
                          />
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setShowTempPassword((prev) => !prev)}
                          >
                            {showTempPassword ? 'Hide' : 'Show'}
                          </button>
                          <button type="button" className="secondary" onClick={generateTempPassword}>
                            Generate
                          </button>
                        </div>
                        <span className="field-hint">
                          Share this once. The employee should change it after first login.
                        </span>
                      </label>
                    </>
                  )}
                  {editingEmployee && (
                    <label>
                      Reset Password
                      <div className="input-row">
                        <input
                          type={showTempPassword ? 'text' : 'password'}
                          value={employeeForm.resetPassword}
                          onChange={(e) =>
                            setEmployeeForm({ ...employeeForm, resetPassword: e.target.value })
                          }
                          placeholder="New password"
                        />
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setShowTempPassword((prev) => !prev)}
                        >
                          {showTempPassword ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" className="secondary" onClick={generateResetPassword}>
                          Generate
                        </button>
                      </div>
                      <span className="field-hint">
                        If provided, the employee login password will be reset.
                      </span>
                    </label>
                  )}
                    <label>
                      Permissions
                      <div className="toggle-group">
                        <label className="toggle">
                          <span>View Attendance</span>
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
                          <span className="toggle-track" aria-hidden="true" />
                        </label>
                        <label className="toggle">
                          <span>Apply Leave</span>
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
                          <span className="toggle-track" aria-hidden="true" />
                        </label>
                        <label className="toggle">
                          <span>View Profile</span>
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
                          <span className="toggle-track" aria-hidden="true" />
                        </label>
                      </div>
                    </label>
                  </div>

                  <div className="form-actions">
                    <button type="submit">
                      {editingEmployee ? 'Update Employee' : 'Add Employee'}
                    </button>
                    {editingEmployee && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => resetEmployeeForm({ keepFilters: true })}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="employee-list">
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Directory</h2>
                      <p className="muted">Search and filter employee records.</p>
                    </div>
                    <div className="filters compact">
                      <input
                        type="text"
                        placeholder="Search by name or email"
                        value={employeeForm.search || ''}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, search: e.target.value })}
                      />
                      <select
                        value={employeeForm.statusFilter || 'All'}
                        onChange={(e) =>
                          setEmployeeForm({ ...employeeForm, statusFilter: e.target.value })
                        }
                      >
                        <option>All</option>
                        <option>Active</option>
                        <option>Onboarding</option>
                        <option>Inactive</option>
                      </select>
                    </div>
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
                    {filteredEmployees.length === 0 && (
                      <div className="empty-state">
                        <p>No employees match the current filters.</p>
                      </div>
                    )}
                    {filteredEmployees.map((employee) => (
                      <div className="table-row" key={employee.id}>
                        <span>{employee.name}</span>
                        <span>{employee.email}</span>
                        <span>{employee.role}</span>
                        <span>{employee.department}</span>
                        <span>
                          <span
                            className={`status-badge status-${employee.status.toLowerCase()}`}
                          >
                            {employee.status}
                          </span>
                        </span>
                        <span className="actions">
                          <button type="button" onClick={() => editEmployee(employee)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmployee(employee.id)}
                            className="danger"
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
            <div className="section-header spread">
              <div>
                <h1>Leave</h1>
                <p>Manage employee leave requests.</p>
              </div>
              <button type="button" className="ghost" onClick={refreshLeaveRequests}>
                Refresh
              </button>
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
                <label className="full-span">
                  Subject
                  <textarea
                    className="subject"
                    value={leaveForm.subject}
                    onChange={(e) => setLeaveForm({ ...leaveForm, subject: e.target.value })}
                    required
                  />
                </label>
                <label className="full-span">
                  Description
                  <textarea
                    value={leaveForm.description}
                    onChange={(e) => setLeaveForm({ ...leaveForm, description: e.target.value })}
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
              <div className="table-header cols-6">
                <span>Employee</span>
                <span>Dates</span>
                <span>Subject</span>
                <span>Description</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {leaveRequests.map((entry) => (
                <div className="table-row cols-6" key={entry.id}>
                  <span>{entry.employee_name || 'Unknown'}</span>
                  <span>
                    {entry.start_date} → {entry.end_date}
                  </span>
                  <span>{entry.subject || '-'}</span>
                  <span>{entry.description || entry.reason || '-'}</span>
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

        {user.role === 'admin' && active === 'payslips' && (
          <section>
            <div className="section-header spread">
              <div>
                <h1>Payslip Generator</h1>
                <p>Create, store, and download salary slips using the official template.</p>
              </div>
              <div className="header-actions">
                {editingPayslip && (
                  <span className="pill subtle">Editing {payslipForm.name || 'payslip'}</span>
                )}
                <button type="button" className="ghost" onClick={resetPayslipForm}>
                  New Payslip
                </button>
              </div>
            </div>

            <div className="payslip-preview panel">
              <div className="payslip-preview-overlay">
                <div>
                  <p className="label">Preview</p>
                  <p className="value">{payslipForm.name || 'Employee Name'}</p>
                  <p className="muted">{payslipForm.month || 'Month / Year'}</p>
                </div>
                <div>
                  <p className="label">Net Pay</p>
                  <p className="value">₹ {payslipForm.net_pay || '0'}</p>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Payslip Requests</h2>
                  <p className="muted">Employees can request payslips for a month.</p>
                </div>
                <button type="button" className="ghost" onClick={refreshPayslipRequests}>
                  Refresh
                </button>
              </div>
              <div className="table">
                <div className="table-header cols-5">
                  <span>Employee</span>
                  <span>Month</span>
                  <span>Status</span>
                  <span>Requested</span>
                  <span>Actions</span>
                </div>
                {payslipRequests.map((request) => (
                  <div className="table-row cols-5" key={request.id}>
                    <span>{request.employee_name || 'Unknown'}</span>
                    <span>{request.month}</span>
                    <span>{request.status}</span>
                    <span>{request.created_at || '-'}</span>
                    <span className="actions">
                      {(() => {
                        const existingPayslip = payslips.find(
                          (item) =>
                            String(item.employee_id) === String(request.employee_id) &&
                            String(item.month) === String(request.month),
                        )
                        if (request.status !== 'Pending') {
                          return <span className="muted">-</span>
                        }
                        if (existingPayslip) {
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updatePayslipRequestStatus(
                                    request.id,
                                    'Generated',
                                    existingPayslip.id,
                                  )
                                }
                              >
                                Send Payslip
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => updatePayslipRequestStatus(request.id, 'Rejected')}
                              >
                                Reject
                              </button>
                            </>
                          )
                        }
                        return (
                          <>
                            <button type="button" onClick={() => loadPayslipRequest(request)}>
                              Fill Payslip
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => updatePayslipRequestStatus(request.id, 'Rejected')}
                            >
                              Reject
                            </button>
                          </>
                        )
                      })()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <form className="panel payslip-form" onSubmit={upsertPayslip}>
              <div className="panel-header">
                <div>
                  <h2>{editingPayslip ? 'Edit Payslip Details' : 'Add Payslip Details'}</h2>
                  <p className="muted">Fill in the fields to generate a PDF payslip.</p>
                </div>
                <div className="header-actions">
                  {payslipRequestId && <span className="pill subtle">Request #{payslipRequestId}</span>}
                  {editingPayslip && (
                    <button type="button" className="ghost" onClick={resetPayslipForm}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="grid">
                <label>
                  Employee
                  <select
                    value={payslipForm.employee_id}
                    onChange={(e) => handlePayslipEmployeeChange(e.target.value)}
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
                  Salary Slip Month
                  <input
                    type="month"
                    value={payslipForm.month}
                    onChange={(e) => setPayslipForm({ ...payslipForm, month: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Employee Name
                  <input
                    type="text"
                    value={payslipForm.name}
                    onChange={(e) => setPayslipForm({ ...payslipForm, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Employee No
                  <input
                    type="text"
                    value={payslipForm.employee_no}
                    onChange={(e) => setPayslipForm({ ...payslipForm, employee_no: e.target.value })}
                  />
                </label>
                <label>
                  Role
                  <input
                    type="text"
                    value={payslipForm.role}
                    onChange={(e) => setPayslipForm({ ...payslipForm, role: e.target.value })}
                  />
                </label>
                <label>
                  Role Designation
                  <input
                    type="text"
                    value={payslipForm.role_designation}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, role_designation: e.target.value })
                    }
                  />
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    value={payslipForm.location}
                    onChange={(e) => setPayslipForm({ ...payslipForm, location: e.target.value })}
                  />
                </label>
                <label>
                  Bank
                  <input
                    type="text"
                    value={payslipForm.bank}
                    onChange={(e) => setPayslipForm({ ...payslipForm, bank: e.target.value })}
                  />
                </label>
                <label>
                  Bank A/C No
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.bank_ac_no ? 'input-error' : ''}
                    value={payslipForm.bank_ac_no}
                    onChange={(e) => handleNumericChange('bank_ac_no', e.target.value)}
                  />
                  {payslipErrors.bank_ac_no && (
                    <p className="field-error">{payslipErrors.bank_ac_no}</p>
                  )}
                </label>
                <label>
                  No. Of Days - Pay
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.no_of_days_pay ? 'input-error' : ''}
                    value={payslipForm.no_of_days_pay}
                    onChange={(e) => handleNumericChange('no_of_days_pay', e.target.value)}
                  />
                  {payslipErrors.no_of_days_pay && (
                    <p className="field-error">{payslipErrors.no_of_days_pay}</p>
                  )}
                </label>
                <label>
                  No. Of Days in Month
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.no_of_days_in_month ? 'input-error' : ''}
                    value={payslipForm.no_of_days_in_month}
                    onChange={(e) => handleNumericChange('no_of_days_in_month', e.target.value)}
                  />
                  {payslipErrors.no_of_days_in_month && (
                    <p className="field-error">{payslipErrors.no_of_days_in_month}</p>
                  )}
                </label>
                <label>
                  Location India Days
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.location_india_days ? 'input-error' : ''}
                    value={payslipForm.location_india_days}
                    onChange={(e) => handleNumericChange('location_india_days', e.target.value)}
                  />
                  {payslipErrors.location_india_days && (
                    <p className="field-error">{payslipErrors.location_india_days}</p>
                  )}
                </label>
                <label>
                  LOP
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.lop ? 'input-error' : ''}
                    value={payslipForm.lop}
                    onChange={(e) => handleNumericChange('lop', e.target.value)}
                  />
                  {payslipErrors.lop && <p className="field-error">{payslipErrors.lop}</p>}
                </label>
                <label>
                  Leaves
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={payslipErrors.leaves ? 'input-error' : ''}
                    value={payslipForm.leaves}
                    onChange={(e) => handleNumericChange('leaves', e.target.value)}
                  />
                  {payslipErrors.leaves && <p className="field-error">{payslipErrors.leaves}</p>}
                </label>
                <label>
                  Employee PAN
                  <input
                    type="text"
                    value={payslipForm.employee_pan}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, employee_pan: e.target.value })
                    }
                  />
                </label>
                <label>
                  Employer PAN
                  <input
                    type="text"
                    value={payslipForm.employer_pan}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, employer_pan: e.target.value })
                    }
                  />
                </label>
                <label>
                  Employer TAN
                  <input
                    type="text"
                    value={payslipForm.employer_tan}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, employer_tan: e.target.value })
                    }
                  />
                </label>
                <label>
                  Basic Salary
                  <input
                    type="number"
                    value={payslipForm.basic_salary}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, basic_salary: e.target.value })
                    }
                  />
                </label>
                <label>
                  House Rent Allowance
                  <input
                    type="number"
                    value={payslipForm.house_rent_allowance}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, house_rent_allowance: e.target.value })
                    }
                  />
                </label>
                <label>
                  Conveyance Allowance
                  <input
                    type="number"
                    value={payslipForm.conveyance_allowance}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, conveyance_allowance: e.target.value })
                    }
                  />
                </label>
                <label>
                  Medical Allowance
                  <input
                    type="number"
                    value={payslipForm.medical_allowance}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, medical_allowance: e.target.value })
                    }
                  />
                </label>
                <label>
                  Special Allowance
                  <input
                    type="number"
                    value={payslipForm.special_allowance}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, special_allowance: e.target.value })
                    }
                  />
                </label>
                <label>
                  Income Tax
                  <input
                    type="number"
                    value={payslipForm.income_tax}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, income_tax: e.target.value })
                    }
                  />
                </label>
                <label>
                  Professional Tax
                  <input
                    type="number"
                    value={payslipForm.professional_tax}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, professional_tax: e.target.value })
                    }
                  />
                </label>
                <label>
                  Total Income
                  <input type="number" value={payslipForm.total_income} readOnly />
                </label>
                <label>
                  Total Deductions
                  <input type="number" value={payslipForm.total_deductions} readOnly />
                </label>
                <label>
                  Net Pay
                  <input type="number" value={payslipForm.net_pay} readOnly />
                </label>
                <label>
                  Generated On
                  <input
                    type="date"
                    value={payslipForm.generated_on}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, generated_on: e.target.value })
                    }
                  />
                </label>
                <label className="full-span">
                  Information
                  <input
                    type="text"
                    value={payslipForm.information}
                    onChange={(e) =>
                      setPayslipForm({ ...payslipForm, information: e.target.value })
                    }
                  />
                </label>
                <label className="full-span inline-toggle">
                  <input
                    type="checkbox"
                    checked={usePrevMonth}
                    onChange={(e) => setUsePrevMonth(e.target.checked)}
                  />
                  <span>Use Previous Month Salary (auto-fills salary fields)</span>
                </label>
                {usePrevMonth && prevMonthNotice && (
                  <p className="field-error full-span">{prevMonthNotice}</p>
                )}
              </div>

              <div className="form-actions">
                <button type="submit">
                  {editingPayslip ? 'Update Payslip' : 'Save Payslip'}
                </button>
                {editingPayslip && (
                  <button type="button" className="secondary" onClick={resetPayslipForm}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Saved Payslips</h2>
                  <p className="muted">Download the PDF using the original background.</p>
                </div>
              </div>
              <div className="table">
                <div className="table-header cols-5">
                  <span>Employee</span>
                  <span>Month</span>
                  <span>Net Pay</span>
                  <span>Generated</span>
                  <span>Actions</span>
                </div>
                {payslips.map((entry) => (
                  <div className="table-row cols-5" key={entry.id}>
                    <span>{entry.name || entry.employee_name || 'Unknown'}</span>
                    <span>{entry.month}</span>
                    <span>{entry.net_pay}</span>
                    <span>{entry.generated_on || '-'}</span>
                    <span className="actions">
                      <button type="button" onClick={() => downloadPayslip(entry)}>
                        Download
                      </button>
                      <button type="button" onClick={() => editPayslip(entry)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deletePayslip(entry.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
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
              {passwordError && <p className="alert error">{passwordError}</p>}
              <div className="grid">
                <label>
                  Current Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.current}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, current: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  New Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.next}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, next: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  Confirm New Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.confirm}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirm: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
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
                <label className="full-span">
                  Subject
                  <textarea
                    className="subject"
                    value={leaveForm.subject}
                    onChange={(e) => setLeaveForm({ ...leaveForm, subject: e.target.value })}
                    required
                  />
                </label>
                <label className="full-span">
                  Description
                  <textarea
                    value={leaveForm.description}
                    onChange={(e) => setLeaveForm({ ...leaveForm, description: e.target.value })}
                    required
                  />
                </label>
              </div>
              <button type="submit">Apply Leave</button>
            </form>

            <div className="table">
              <div className="table-header cols-6">
                <span>Dates</span>
                <span>Subject</span>
                <span>Description</span>
                <span>Status</span>
                <span>Created</span>
                <span>Actions</span>
              </div>
              {employeeLeave.map((entry) => (
                <div className="table-row cols-6" key={entry.id}>
                  <span>
                    {entry.start_date} → {entry.end_date}
                  </span>
                  <span>{entry.subject || '-'}</span>
                  <span>{entry.description || entry.reason || '-'}</span>
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

        {user.role === 'employee' && active === 'employee-payslips' && (
          <section>
            <div className="section-header">
              <h1>My Payslips</h1>
              <p>Request a payslip and download when it is generated.</p>
            </div>

            <form className="panel" onSubmit={requestPayslip}>
              <div className="grid">
                <label>
                  Month
                  <input
                    type="month"
                    value={employeePayslipRequestMonth}
                    onChange={(e) => setEmployeePayslipRequestMonth(e.target.value)}
                    required
                  />
                </label>
              </div>
              <button type="submit">Request Payslip</button>
            </form>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>My Requests</h2>
                  <p className="muted">Track the status of your payslip requests.</p>
                </div>
                <button type="button" className="ghost" onClick={refreshEmployeePayslips}>
                  Refresh
                </button>
              </div>
              <div className="table">
                <div className="table-header cols-3">
                  <span>Month</span>
                  <span>Status</span>
                  <span>Requested</span>
                </div>
                {employeePayslipRequests.map((entry) => (
                  <div className="table-row cols-3" key={entry.id}>
                    <span>{entry.month}</span>
                    <span>{entry.status}</span>
                    <span>{entry.created_at || '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>My Payslips</h2>
                  <p className="muted">Download generated payslips.</p>
                </div>
              </div>
              <div className="table">
                <div className="table-header cols-4">
                  <span>Month</span>
                  <span>Net Pay</span>
                  <span>Generated</span>
                  <span>Actions</span>
                </div>
                {employeePayslips.map((entry) => (
                  <div className="table-row cols-4" key={entry.id}>
                    <span>{entry.month}</span>
                    <span>{entry.net_pay}</span>
                    <span>{entry.generated_on || '-'}</span>
                    <span className="actions">
                      <button type="button" onClick={() => downloadEmployeePayslip(entry)}>
                        Download
                      </button>
                    </span>
                  </div>
                ))}
              </div>
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

            <form className="panel" onSubmit={changePassword}>
              <h2>Change Password</h2>
              {passwordError && <p className="alert error">{passwordError}</p>}
              <div className="grid">
                <label>
                  Current Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.current}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, current: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  New Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.next}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, next: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label>
                  Confirm New Password
                  <div className="input-row">
                    <input
                      type={showPasswordFields ? 'text' : 'password'}
                      value={passwordForm.confirm}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirm: e.target.value })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPasswordFields((prev) => !prev)}
                    >
                      {showPasswordFields ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </div>
              <button type="submit">Update Password</button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
