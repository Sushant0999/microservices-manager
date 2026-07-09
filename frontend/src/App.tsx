import { useEffect, useState, useRef, memo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Autocomplete, Tooltip, CircularProgress
} from '@mui/material';
import axios from 'axios';

interface Service {
  name: string;
  projectName: string;
  path: string;
  port: number;
  status: string;
  startCommand: string;
  rebuildCommand?: string;
  activePropertiesFile?: string;
  jdkName?: string;
}

interface JdkConfig {
  name: string;
  windowsPath: string;
  linuxPath: string;
  macPath: string;
}

interface Project {
  name: string;
  description: string;
  services: Service[];
}

// Log line color mapping based on log content
const getLogColor = (log: string) => {
  const upperLog = log.toUpperCase();
  if (upperLog.includes('ERROR') || upperLog.includes('EXCEPTION') || upperLog.includes('FAIL') || upperLog.includes('CRASH')) return 'var(--error)';
  if (upperLog.includes('WARN')) return 'var(--tertiary)';
  if (upperLog.includes('INFO') || upperLog.includes('SUCCESS') || upperLog.includes('OK')) return 'var(--on-surface)';
  if (upperLog.includes('DEBUG')) return 'var(--outline)';
  return 'rgba(255,255,255,0.7)';
};

// SVG Sparkline Path Generator
const getSparklinePath = (data: number[], maxVal: number) => {
  if (!data || data.length === 0) return 'M 0 80 L 400 80';
  const width = 400;
  const height = 80;
  const points = data.map((val, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : 0;
    const y = height - (val / maxVal) * height;
    return `${x} ${y}`;
  });
  return `M ${points.join(' L ')}`;
};

// Memoized Service Grid Card (based on sample1.html card view)
const SvcCard = memo(({
  service,
  onAction,
  telemetryVal,
  onViewLogs
}: {
  service: Service;
  onAction: (projectName: string, name: string, action: string) => void;
  telemetryVal: { cpu: number; mem: number };
  onViewLogs: () => void;
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // SSE connection for card logs preview
  useEffect(() => {
    if (service.status !== 'RUNNING' && service.status !== 'REBUILDING') {
      setLogs([]);
      return;
    }
    let active = true;
    let es: EventSource;
    let retryTimer: number;

    const connect = () => {
      if (!active) return;
      es = new EventSource(`/api/projects/${service.projectName}/services/${service.name}/logs`);
      es.onmessage = (event) => {
        if (active) setLogs(prev => [...prev.slice(-49), event.data]);
      };
      es.onerror = () => {
        es.close();
        if (active) retryTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      active = false;
      clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [service.projectName, service.name, service.status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const isRunning = service.status === 'RUNNING';
  const isRebuilding = service.status === 'REBUILDING';

  return (
    <div className={`svc-card ${service.status.toLowerCase()}`}>
      <div className="svc-card-header">
        <div className="svc-card-title">
          <span className={`status-badge ${service.status.toLowerCase()}`} style={{ border: 'none', background: 'none', padding: 0 }}>
            <span className="dot" />
          </span>
          <span className="svc-name">{service.name}</span>
        </div>
        <div className="svc-card-actions">
          <Tooltip title="Start">
            <button
              className="btn-icon success"
              disabled={isRunning || isRebuilding}
              onClick={() => onAction(service.projectName, service.name, 'start')}
            >
              <span className="material-symbols-outlined">play_arrow</span>
            </button>
          </Tooltip>
          <Tooltip title="Stop">
            <button
              className="btn-icon danger"
              disabled={service.status === 'STOPPED'}
              onClick={() => onAction(service.projectName, service.name, 'stop')}
            >
              <span className="material-symbols-outlined">stop</span>
            </button>
          </Tooltip>
          <Tooltip title="Restart">
            <button
              className="btn-icon info"
              onClick={() => onAction(service.projectName, service.name, 'restart')}
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </Tooltip>
          <Tooltip title="Full Logs & Config">
            <button
              className="btn-icon active-icon"
              onClick={onViewLogs}
            >
              <span className="material-symbols-outlined">terminal</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Telemetry Progress Bars (from sample1) */}
      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--surface-container-high)' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '4px' }}>
            <span className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>CPU Usage</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold' }}>{telemetryVal.cpu}%</span>
          </div>
          <div style={{ height: '4px', background: 'var(--outline-variant)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--primary)', width: `${telemetryVal.cpu}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '4px' }}>
            <span className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Memory</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold' }}>{telemetryVal.mem}MB</span>
          </div>
          <div style={{ height: '4px', background: 'var(--outline-variant)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--tertiary)', width: `${Math.min(100, (telemetryVal.mem / 1024) * 100)}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Logs stream mini panel */}
      <div ref={scrollRef} className="svc-card-logs" style={{ height: '120px' }}>
        {logs.length === 0 ? (
          <div className="waiting">
            {isRunning || isRebuilding ? 'Waiting for logs...' : 'Service stopped.'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="log-line" style={{ color: getLogColor(log) }}>
              <span style={{ color: 'var(--primary)', marginRight: '4px' }}>❯</span>
              <span>{log}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="svc-card-footer">
        <span className="framework-tag">
          {service.port}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--outline)' }}>
          {isRunning ? 'UPTIME: ACTIVE' : 'STOPPED'}
        </span>
      </div>
    </div>
  );
});

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'projects' | 'logs' | 'settings'>('projects');

  // Selected log service: { projectName, serviceName }
  const [selectedLogService, setSelectedLogService] = useState<{ projectName: string; serviceName: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Log viewer options
  const [logSearch, setLogSearch] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);

  // Telemetry Simulation State (CPU and Memory fluctuating history)
  const [telemetry, setTelemetry] = useState<Record<string, {
    cpu: number;
    mem: number;
    cpuHistory: number[];
    memHistory: number[];
  }>>({});

  // In-Memory Environment Variables Configuration
  const [envVars, setEnvVars] = useState<Record<string, Record<string, string>>>({});
  const [openEnvDialog, setOpenEnvDialog] = useState(false);
  const [editingEnvKey, setEditingEnvKey] = useState('');
  const [editingEnvName, setEditingEnvName] = useState('');
  const [envText, setEnvText] = useState('');

  // Service Add/Edit Form State
  const [openForm, setOpenForm] = useState(false);
  const [editingService, setEditingService] = useState<{ projectName: string; serviceName: string } | null>(null);
  const [formData, setFormData] = useState<Service>({ name: '', projectName: 'Default', path: '', port: 8080, status: 'STOPPED', startCommand: '', rebuildCommand: '', jdkName: '' });

  // Project Add/Edit Form State
  const [openProjectForm, setOpenProjectForm] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState<string | null>(null);
  const [projectFormData, setProjectFormData] = useState<{ name: string; description: string }>({ name: '', description: '' });

  // Folder Browser State
  const [openBrowse, setOpenBrowse] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [dirs, setDirs] = useState<string[]>([]);

  // Display View Mode State (List vs Grid)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [detectedFramework, setDetectedFramework] = useState<string>('');
  const [suggestedCommands, setSuggestedCommands] = useState<string[]>([]);
  const [suggestedRebuildCommands, setSuggestedRebuildCommands] = useState<string[]>([]);

  // JDK management state
  const [jdks, setJdks] = useState<JdkConfig[]>([]);
  const [scanningJdks, setScanningJdks] = useState(false);
  const [openJdkDialog, setOpenJdkDialog] = useState(false);
  const [editingJdkName, setEditingJdkName] = useState<string | null>(null);
  const [jdkFormData, setJdkFormData] = useState<JdkConfig>({ name: '', windowsPath: '', linuxPath: '', macPath: '' });
  const [propertiesFiles, setPropertiesFiles] = useState<string[]>([]);

  const logBottomRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Derived calculations
  const allServices: Service[] = projects.flatMap(p => (p.services || []).map(s => ({ ...s, projectName: p.name })));

  const filteredServices = (selectedProject === 'All'
    ? allServices
    : allServices.filter(s => s.projectName === selectedProject)
  ).filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Telemetry simulation update interval
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => {
        const next = { ...prev };
        allServices.forEach(s => {
          const key = `${s.projectName}:${s.name}`;
          if (s.status === 'RUNNING') {
            const current = prev[key] || {
              cpu: 10,
              mem: 220,
              cpuHistory: Array(15).fill(10),
              memHistory: Array(15).fill(220)
            };
            const cpuDelta = Math.floor(Math.random() * 13) - 6; // -6% to +6%
            const nextCpu = Math.max(3, Math.min(97, current.cpu + cpuDelta));

            const memDelta = Math.floor(Math.random() * 25) - 12; // -12MB to +12MB
            const nextMem = Math.max(50, Math.min(2048, current.mem + memDelta));

            const nextCpuHistory = [...current.cpuHistory.slice(1), nextCpu];
            const nextMemHistory = [...current.memHistory.slice(1), nextMem];

            next[key] = {
              cpu: nextCpu,
              mem: nextMem,
              cpuHistory: nextCpuHistory,
              memHistory: nextMemHistory
            };
          } else {
            next[key] = {
              cpu: 0,
              mem: 0,
              cpuHistory: Array(15).fill(0),
              memHistory: Array(15).fill(0)
            };
          }
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [projects]);

  const fetchProjects = async () => {
    try {
      const { data } = await axios.get('/api/projects');
      setProjects(data || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  const fetchJdks = async () => {
    try {
      const { data } = await axios.get('/api/jdks');
      setJdks(data || []);
    } catch (err) {
      console.error('Failed to fetch JDKs', err);
    }
  };

  const handleScanJdks = async () => {
    setScanningJdks(true);
    try {
      const { data } = await axios.post('/api/jdks/detect');
      setJdks(data || []);
    } catch (err) {
      console.error('Failed to scan JDKs', err);
      alert('Failed to scan system JDKs.');
    } finally {
      setScanningJdks(false);
    }
  };

  const handleSaveJdk = async () => {
    if (!jdkFormData.name.trim()) return;
    try {
      if (editingJdkName) {
        await axios.put(`/api/jdks/${editingJdkName}`, jdkFormData);
      } else {
        await axios.post('/api/jdks', jdkFormData);
      }
      setOpenJdkDialog(false);
      fetchJdks();
    } catch (err) {
      console.error('Failed to save JDK', err);
    }
  };

  const handleDeleteJdk = async (name: string) => {
    if (window.confirm(`Are you sure you want to delete JDK configuration "${name}"? Services configured with this JDK will fall back to using default system Java.`)) {
      try {
        await axios.delete(`/api/jdks/${name}`);
        fetchJdks();
      } catch (err) {
        console.error('Failed to delete JDK', err);
      }
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchJdks();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs on updates
  useEffect(() => {
    if (autoScroll && logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, activeTab]);

  // SSE stream connection for detailed Logs tab
  useEffect(() => {
    if (!selectedLogService) return;

    const { projectName, serviceName } = selectedLogService;
    let active = true;
    let es: EventSource;
    let retryTimer: number;

    setLogs([]);

    const connect = () => {
      if (!active) return;
      es = new EventSource(`/api/projects/${projectName}/services/${serviceName}/logs`);
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        if (active) setLogs(prev => [...prev.slice(-999), event.data]);
      };
      es.onerror = () => {
        es.close();
        if (active) retryTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      if (es) es.close();
      eventSourceRef.current = null;
    };
  }, [selectedLogService?.projectName, selectedLogService?.serviceName]);

  // Auto-select the first service on Logs tab if none is selected
  useEffect(() => {
    if (activeTab === 'logs' && !selectedLogService && allServices.length > 0) {
      setSelectedLogService({ projectName: allServices[0].projectName, serviceName: allServices[0].name });
    }
  }, [activeTab, selectedLogService, projects]);

  const handleAction = async (projectName: string, serviceName: string, action: string) => {
    try {
      await axios.post(`/api/projects/${projectName}/services/${serviceName}/${action}`);
      fetchProjects();
    } catch (err) {
      console.error(`Action ${action} failed for ${projectName}/${serviceName}`, err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      projectName: selectedProject !== 'All' ? selectedProject : (projects[0]?.name || 'Default'),
      path: '',
      port: 8080,
      status: 'STOPPED',
      startCommand: '',
      rebuildCommand: '',
      activePropertiesFile: '',
      jdkName: ''
    });
    setEditingService(null);
    setSuggestedCommands([]);
    setSuggestedRebuildCommands([]);
    setDetectedFramework('');
    setPropertiesFiles([]);
  };

  const startEditService = (service: Service) => {
    setFormData(service);
    setEditingService({ projectName: service.projectName, serviceName: service.name });
    setOpenForm(true);
    fetchSuggestions(service.path);
  };

  const handleDeleteService = async (projectName: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name} from ${projectName}?`)) {
      try {
        await axios.delete(`/api/projects/${projectName}/services/${name}`);
        fetchProjects();
      } catch (err) {
        console.error('Failed to remove service', err);
      }
    }
  };

  const startEditProject = (project: Project) => {
    setProjectFormData({ name: project.name, description: project.description });
    setEditingProjectName(project.name);
    setOpenProjectForm(true);
  };

  const handleDeleteProject = async (name: string) => {
    if (window.confirm(`Are you sure you want to delete project "${name}"? This will stop and remove all services in this project.`)) {
      try {
        await axios.delete(`/api/projects/${name}`);
        if (selectedProject === name) {
          setSelectedProject('All');
        }
        fetchProjects();
      } catch (err) {
        console.error('Failed to delete project', err);
      }
    }
  };

  const handleSaveProject = async () => {
    if (!projectFormData.name.trim()) return;
    try {
      if (editingProjectName) {
        await axios.put(`/api/projects/${editingProjectName}`, projectFormData);
      } else {
        await axios.post('/api/projects', projectFormData);
      }
      setOpenProjectForm(false);
      setProjectFormData({ name: '', description: '' });
      setEditingProjectName(null);
      fetchProjects();
    } catch (err) {
      console.error('Failed to save project', err);
    }
  };

  const handleSaveService = async () => {
    try {
      if (editingService) {
        if (editingService.projectName !== formData.projectName) {
          await axios.delete(`/api/projects/${editingService.projectName}/services/${editingService.serviceName}`);
          await axios.post(`/api/projects/${formData.projectName}/services`, formData);
        } else {
          await axios.put(`/api/projects/${editingService.projectName}/services/${editingService.serviceName}`, formData);
        }
      } else {
        await axios.post(`/api/projects/${formData.projectName}/services`, formData);
      }
      setOpenForm(false);
      resetForm();
      fetchProjects();
    } catch (err) {
      console.error('Failed to save service', err);
    }
  };

  const browseDirs = async (path: string = '') => {
    try {
      const { data } = await axios.get(`/api/fs/browse?path=${encodeURIComponent(path)}`);
      setDirs(data);
      setCurrentPath(path);
      setOpenBrowse(true);
    } catch (err) {
      console.error('Failed to browse directories', err);
    }
  };

  const fetchSuggestions = async (path: string) => {
    try {
      const [{ data }, { data: rebuildData }, { data: portData }, { data: framework }, { data: propsData }] = await Promise.all([
        axios.get(`/api/fs/suggest-commands?path=${encodeURIComponent(path)}`),
        axios.get(`/api/fs/suggest-rebuild-commands?path=${encodeURIComponent(path)}`),
        axios.get(`/api/fs/suggest-port?path=${encodeURIComponent(path)}`),
        axios.get(`/api/fs/detect-framework?path=${encodeURIComponent(path)}`),
        axios.get(`/api/fs/list-properties?path=${encodeURIComponent(path)}`),
      ]);

      setSuggestedCommands(data || []);
      setSuggestedRebuildCommands(rebuildData || []);
      setDetectedFramework(framework || '');
      setPropertiesFiles(propsData || []);

      setFormData(prev => ({
        ...prev,
        startCommand: prev.startCommand || (data?.[0] || ''),
        rebuildCommand: prev.rebuildCommand || (rebuildData?.[0] || ''),
        port: portData ? portData : prev.port
      }));
    } catch (err) {
      console.error('Failed to fetch suggestions', err);
    }
  };

  const handleSelectPath = async (path: string) => {
    setFormData({ ...formData, path });
    setOpenBrowse(false);
    fetchSuggestions(path);
  };

  const startAll = async () => {
    const promises = filteredServices
      .filter(s => s.status !== 'RUNNING')
      .map(s => axios.post(`/api/projects/${s.projectName}/services/${s.name}/start`));
    await Promise.allSettled(promises);
    fetchProjects();
  };

  const stopAll = async () => {
    const promises = filteredServices
      .filter(s => s.status === 'RUNNING')
      .map(s => axios.post(`/api/projects/${s.projectName}/services/${s.name}/stop`));
    await Promise.allSettled(promises);
    fetchProjects();
  };

  const getEnvVarsForService = (key: string, name: string) => {
    if (envVars[key]) return envVars[key];
    return {
      'DATABASE_URL': `postgres://db_admin:***@localhost:5432/${name.replace('-', '_')}`,
      'LOG_LEVEL': 'DEBUG',
      'SERVER_PORT': '8080',
      'CORS_ALLOWED': '*'
    };
  };

  const openEnvEditor = (key: string, name: string) => {
    const currentEnv = getEnvVarsForService(key, name);
    const text = Object.entries(currentEnv).map(([k, v]) => `${k}=${v}`).join('\n');
    setEditingEnvKey(key);
    setEditingEnvName(name);
    setEnvText(text);
    setOpenEnvDialog(true);
  };

  const saveEnvVars = () => {
    const lines = envText.split('\n');
    const newEnv: Record<string, string> = {};
    lines.forEach(l => {
      const idx = l.indexOf('=');
      if (idx !== -1) {
        const k = l.substring(0, idx).trim();
        const v = l.substring(idx + 1).trim();
        if (k) newEnv[k] = v;
      }
    });
    setEnvVars(prev => ({
      ...prev,
      [editingEnvKey]: newEnv
    }));
    setOpenEnvDialog(false);
  };

  const downloadLogs = () => {
    if (!selectedLogService) return;
    const element = document.createElement("a");
    const file = new Blob([logs.join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${selectedLogService.serviceName}_logs.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.toLowerCase().includes(logSearch.toLowerCase());
    if (!matchesSearch) return false;

    if (logLevelFilter === 'ALL') return true;
    const upperLog = log.toUpperCase();
    if (logLevelFilter === 'ERROR') {
      return upperLog.includes('ERROR') || upperLog.includes('EXCEPTION') || upperLog.includes('FAIL') || upperLog.includes('CRASH');
    }
    if (logLevelFilter === 'WARN') {
      return upperLog.includes('WARN');
    }
    if (logLevelFilter === 'INFO') {
      return upperLog.includes('INFO') || upperLog.includes('SUCCESS') || upperLog.includes('OK');
    }
    return true;
  });

  const totalServices = filteredServices.length;
  const runningServices = filteredServices.filter(s => s.status === 'RUNNING').length;

  // View render helpers
  const renderServicesTable = () => {
    if (filteredServices.length === 0) {
      return (
        <div className="empty-state">
          <span className="material-symbols-outlined">folder_open</span>
          <p>No services found matching search or project filter.</p>
        </div>
      );
    }
    return (
      <div className="services-table-wrap">
        <table className="services-table">
          <thead>
            <tr>
              <th>Service Name</th>
              {selectedProject === 'All' && <th>Project</th>}
              <th>Port</th>
              <th>Status</th>
              <th className="right" style={{ paddingRight: '24px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredServices.map(s => {
              const key = `${s.projectName}:${s.name}`;
              const isRunning = s.status === 'RUNNING';
              return (
                <tr key={key}>
                  <td>
                    <div className="svc-name-cell">
                      <span className="svc-name">{s.name}</span>
                      {isRunning && (
                        <Tooltip title="Open in Browser">
                          <button
                            className="btn-icon info"
                            onClick={() => window.open(`http://localhost:${s.port}`, '_blank')}
                            style={{ padding: 0, width: '20px', height: '20px' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>launch</span>
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  {selectedProject === 'All' && (
                    <td>
                      <span className="svc-project-badge">{s.projectName}</span>
                    </td>
                  )}
                  <td>
                    <span className="svc-port">{s.port}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${s.status.toLowerCase()}`}>
                      <span className="dot" />
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell" style={{ gap: '4px', paddingRight: '8px' }}>
                      <Tooltip title="Start">
                        <button
                          className="btn-icon success"
                          disabled={s.status === 'RUNNING' || s.status === 'REBUILDING'}
                          onClick={() => handleAction(s.projectName, s.name, 'start')}
                        >
                          <span className="material-symbols-outlined">play_arrow</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Stop">
                        <button
                          className="btn-icon danger"
                          disabled={s.status === 'STOPPED'}
                          onClick={() => handleAction(s.projectName, s.name, 'stop')}
                        >
                          <span className="material-symbols-outlined">stop</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Restart">
                        <button
                          className="btn-icon info"
                          onClick={() => handleAction(s.projectName, s.name, 'restart')}
                        >
                          <span className="material-symbols-outlined">refresh</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Edit Config">
                        <button
                          className="btn-icon warn"
                          onClick={() => startEditService(s)}
                        >
                          <span className="material-symbols-outlined">edit</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Clean & Rebuild">
                        <button
                          className="btn-icon info"
                          disabled={!s.rebuildCommand}
                          onClick={() => handleAction(s.projectName, s.name, 'rebuild')}
                        >
                          <span className="material-symbols-outlined">build</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="View Logs">
                        <button
                          className="btn-icon active-icon"
                          onClick={() => {
                            setSelectedLogService({ projectName: s.projectName, serviceName: s.name });
                            setActiveTab('logs');
                          }}
                        >
                          <span className="material-symbols-outlined">terminal</span>
                        </button>
                      </Tooltip>
                      <Tooltip title="Remove Service">
                        <button
                          className="btn-icon danger"
                          onClick={() => handleDeleteService(s.projectName, s.name)}
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderServicesGrid = () => {
    if (filteredServices.length === 0) {
      return (
        <div className="empty-state">
          <span className="material-symbols-outlined">folder_open</span>
          <p>No services found matching search or project filter.</p>
        </div>
      );
    }
    return (
      <div className="grid-view">
        {filteredServices.map(s => {
          const key = `${s.projectName}:${s.name}`;
          const currentTelemetry = telemetry[key] || { cpu: 0, mem: 0 };
          return (
            <SvcCard
              key={key}
              service={s}
              onAction={handleAction}
              telemetryVal={currentTelemetry}
              onViewLogs={() => {
                setSelectedLogService({ projectName: s.projectName, serviceName: s.name });
                setActiveTab('logs');
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderProjectsPage = () => {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Inner projects sidebar selector */}
        <div style={{ width: '240px', borderRight: '1px solid var(--outline-variant)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '16px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 8px' }}>
            <span className="caps" style={{ color: 'var(--outline)' }}>Projects</span>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: '10px' }}
              onClick={() => { setProjectFormData({ name: '', description: '' }); setEditingProjectName(null); setOpenProjectForm(true); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span> New
            </button>
          </div>

          <div className="sidebar-projects">
            <div
              className={`project-item ${selectedProject === 'All' ? 'active' : ''}`}
              onClick={() => setSelectedProject('All')}
            >
              <span className="material-symbols-outlined pi-icon">folder</span>
              <span className="pi-name">All Projects</span>
              <span className="pi-badge">{allServices.length}</span>
            </div>

            <div style={{ height: '1px', background: 'var(--outline-variant)', margin: '8px 0' }} />

            {projects.map(p => {
              const runningCount = (p.services || []).filter(s => s.status === 'RUNNING').length;
              const totalCount = (p.services || []).length;
              return (
                <div
                  key={p.name}
                  className={`project-item ${selectedProject === p.name ? 'active' : ''}`}
                  onClick={() => setSelectedProject(p.name)}
                >
                  <span className="material-symbols-outlined pi-icon">folder</span>
                  <span className="pi-name">{p.name}</span>
                  <span className={`pi-badge ${runningCount > 0 ? 'pi-running' : ''}`}>
                    {runningCount}/{totalCount}
                  </span>

                  <div className="project-actions" style={{ gap: '2px' }}>
                    <button className="btn-icon warn" onClick={(e) => { e.stopPropagation(); startEditProject(p); }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                    </button>
                    <button className="btn-icon danger" onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.name); }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dashboard contents */}
        <div className="services-panel">
          {/* Header topbar */}
          <header className="topbar" style={{ height: '64px' }}>
            <div className="topbar-left">
              <span className="topbar-title" style={{ fontSize: '20px' }}>System Monitor</span>
              <div className="search-wrap">
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filter services (⌘+K)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="topbar-right">
              <button className="btn btn-ghost" onClick={fetchProjects}>
                <span className="material-symbols-outlined">refresh</span>
                Refresh
              </button>
              <button className="btn btn-primary" onClick={() => { resetForm(); setOpenForm(true); }}>
                Add Service
              </button>
            </div>
          </header>

          {/* Hero statistics display card */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              <div style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px' }}>Cluster Overview</h2>
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {String(totalServices).padStart(2, '0')}
                      </span>
                      <span className="caps" style={{ color: 'var(--outline)' }}>Total Services</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
                        {String(runningServices).padStart(2, '0')}
                      </span>
                      <span className="caps" style={{ color: 'var(--outline)' }}>Active Instances</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--error)' }}>
                        {String(filteredServices.filter(s => s.status === 'RUNNING' && (telemetry[`${s.projectName}:${s.name}`]?.cpu || 0) > 80).length).padStart(2, '0')}
                      </span>
                      <span className="caps" style={{ color: 'var(--outline)' }}>Alerting</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulated network traffic graph */}
              <div style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <p className="caps" style={{ color: 'var(--primary)', marginBottom: '4px' }}>Network Throughput</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 'bold' }}>
                    {(1.24 + Math.sin(Date.now() / 10000) * 0.05).toFixed(2)} GB/s
                  </p>
                </div>
                <div style={{ height: '40px', display: 'flex', alignItems: 'end', gap: '2px' }}>
                  {Array(15).fill(0).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        background: i === 14 ? 'var(--primary)' : 'rgba(190, 194, 255, 0.2)',
                        height: `${35 + Math.floor(Math.random() * 50)}%`,
                        borderRadius: '1px 1px 0 0'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Grid/List views toolbar */}
          <div className="services-toolbar">
            <div className="services-toolbar-left">
              <span className="caps" style={{ color: 'var(--outline)' }}>
                {selectedProject === 'All' ? 'All Active Projects' : selectedProject}
              </span>
            </div>
            <div className="services-toolbar-right">
              <button className="btn btn-ghost" onClick={startAll} style={{ color: '#4ade80' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>play_arrow</span>
                Start All
              </button>
              <button className="btn btn-ghost" onClick={stopAll} style={{ color: 'var(--error)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>stop</span>
                Stop All
              </button>
              <div className="topbar-divider" />
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  <span className="material-symbols-outlined">list</span>
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  <span className="material-symbols-outlined">grid_view</span>
                </button>
              </div>
            </div>
          </div>

          {/* Render target list or grid */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {viewMode === 'list' ? renderServicesTable() : renderServicesGrid()}
          </div>
        </div>
      </div>
    );
  };

  const renderLogsPage = () => {
    const activeService = selectedLogService
      ? allServices.find(s => s.name === selectedLogService.serviceName && s.projectName === selectedLogService.projectName)
      : allServices[0];

    const activeKey = activeService ? `${activeService.projectName}:${activeService.name}` : '';
    const currentTelemetry = activeService && telemetry[activeKey] ? telemetry[activeKey] : {
      cpu: 0,
      mem: 0,
      cpuHistory: Array(15).fill(0),
      memHistory: Array(15).fill(0)
    };

    const isRunning = activeService?.status === 'RUNNING';
    const isRebuilding = activeService?.status === 'REBUILDING';

    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Telemetry/Config Pane */}
        <section style={{ width: '400px', background: 'var(--surface-container-lowest)', borderRight: '1px solid var(--outline-variant)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '20px' }}>
          <div style={{ marginBottom: '24px' }}>
            <span className="caps" style={{ color: 'var(--outline)', display: 'block', marginBottom: '8px' }}>Select Instance</span>
            <select
              className="form-select"
              value={activeKey}
              onChange={(e) => {
                const [proj, name] = e.target.value.split(':');
                setSelectedLogService({ projectName: proj, serviceName: name });
              }}
            >
              {allServices.map(s => (
                <option key={`${s.projectName}:${s.name}`} value={`${s.projectName}:${s.name}`}>
                  {s.projectName} / {s.name}
                </option>
              ))}
            </select>
          </div>

          {activeService ? (
            <>
              {/* Telemetry charts */}
              <div style={{ marginBottom: '24px' }}>
                <h3 className="caps" style={{ color: 'var(--on-surface-variant)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>monitoring</span>
                  Real-Time Telemetry
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* CPU Sparkline */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', padding: '16px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '8px' }}>
                      <span className="caps" style={{ color: 'var(--outline)', fontSize: '10px' }}>CPU Load</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontSize: '14px', fontWeight: 'bold' }}>
                        {currentTelemetry.cpu}%
                      </span>
                    </div>
                    <div style={{ height: '80px', position: 'relative', overflow: 'hidden', background: 'var(--surface-container-low)' }}>
                      <svg viewBox="0 0 400 80" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                        <path d={getSparklinePath(currentTelemetry.cpuHistory, 100)} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
                        <path d={`${getSparklinePath(currentTelemetry.cpuHistory, 100)} L 400 80 L 0 80 Z`} fill="url(#grad-cpu)" />
                        <defs>
                          <linearGradient id="grad-cpu" x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.15 }} />
                            <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>

                  {/* Memory Sparkline */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--outline-variant)', padding: '16px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '8px' }}>
                      <span className="caps" style={{ color: 'var(--outline)', fontSize: '10px' }}>Memory Usage</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--tertiary)', fontSize: '14px', fontWeight: 'bold' }}>
                        {currentTelemetry.mem}MB / 2048MB
                      </span>
                    </div>
                    <div style={{ height: '80px', position: 'relative', overflow: 'hidden', background: 'var(--surface-container-low)' }}>
                      <svg viewBox="0 0 400 80" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
                        <path d={getSparklinePath(currentTelemetry.memHistory, 2048)} fill="none" stroke="var(--tertiary)" strokeWidth="1.5" />
                        <path d={`${getSparklinePath(currentTelemetry.memHistory, 2048)} L 400 80 L 0 80 Z`} fill="url(#grad-mem)" />
                        <defs>
                          <linearGradient id="grad-mem" x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: 'var(--tertiary)', stopOpacity: 0.15 }} />
                            <stop offset="100%" style={{ stopColor: 'var(--tertiary)', stopOpacity: 0 }} />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Runtime Settings */}
              <div style={{ marginBottom: '24px' }}>
                <h3 className="caps" style={{ color: 'var(--on-surface-variant)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>settings_input_component</span>
                  Runtime Config
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Service Path</label>
                    <div style={{ background: 'var(--surface-container)', padding: '6px 10px', border: '1px solid var(--outline-variant)', wordBreak: 'break-all' }}>
                      {activeService.path}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Start Command</label>
                    <div style={{ background: 'var(--surface-container)', padding: '6px 10px', border: '1px solid var(--outline-variant)', wordBreak: 'break-all', color: 'var(--on-surface)' }}>
                      {activeService.startCommand || <span style={{ color: 'var(--outline)', fontStyle: 'italic' }}>—</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="caps" style={{ color: 'var(--outline)', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>description</span>
                      Config File
                    </label>
                    <div style={{
                      background: activeService.activePropertiesFile ? 'rgba(190, 194, 255, 0.07)' : 'var(--surface-container)',
                      padding: '6px 10px',
                      border: `1px solid ${activeService.activePropertiesFile ? 'var(--primary)' : 'var(--outline-variant)'}`,
                      wordBreak: 'break-all',
                      color: activeService.activePropertiesFile ? 'var(--primary)' : 'var(--outline)',
                      fontStyle: activeService.activePropertiesFile ? 'normal' : 'italic',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {activeService.activePropertiesFile ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px', flexShrink: 0 }}>check_circle</span>
                          {activeService.activePropertiesFile}
                        </>
                      ) : (
                        'default (no override)'
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Port Mapping</label>
                      <div style={{ background: 'var(--surface-container)', padding: '6px 10px', border: '1px solid var(--outline-variant)' }}>
                        {activeService.port}:{activeService.port}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Protocol</label>
                      <div style={{ background: 'var(--surface-container)', padding: '6px 10px', border: '1px solid var(--outline-variant)' }}>
                        HTTP / SSE
                      </div>
                    </div>
                  </div>
                </div>
              </div>


              {/* Editable Env variables */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 className="caps" style={{ color: 'var(--on-surface-variant)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>key</span>
                    Env Vars
                  </h3>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                    onClick={() => openEnvEditor(activeKey, activeService.name)}
                  >
                    Edit
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  {Object.entries(getEnvVarsForService(activeKey, activeService.name)).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--surface-container-low)', border: '1px solid rgba(69,70,85,0.2)' }}>
                      <span style={{ color: 'var(--outline)' }}>{key}</span>
                      <span style={{ color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '12px', maxWidth: '180px' }} title={val}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--outline)', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
              No service registered. Create a service to view telemetry.
            </div>
          )}
        </section>

        {/* Right Pane: Logs Container */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-container-lowest)' }}>
          {/* Detailed topbar */}
          <header className="topbar" style={{ height: '64px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
            <div className="topbar-left" style={{ gap: '6px' }}>
              <span className="caps" style={{ color: 'var(--outline)' }}>Projects</span>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--outline)' }}>chevron_right</span>
              <span className="caps" style={{ color: 'var(--outline)' }}>{activeService?.projectName || 'NO_PROJECT'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--outline)' }}>chevron_right</span>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>{(activeService?.name || 'NO_SERVICE').toUpperCase()}</span>

              {activeService && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                  <span className={`dot ${isRunning ? 'running' : (isRebuilding ? 'rebuilding' : 'stopped')}`} style={{ width: '6px', height: '6px', borderRadius: '50%' }} />
                  <span className={`caps ${isRunning ? 'status-label running' : (isRebuilding ? 'status-label rebuilding' : 'status-label stopped')}`} style={{ fontSize: '10px' }}>
                    {activeService.status}
                  </span>
                </div>
              )}
            </div>

            {activeService && (
              <div className="topbar-right">
                <button
                  className="btn btn-ghost"
                  onClick={() => handleAction(activeService.projectName, activeService.name, 'restart')}
                >
                  <span className="material-symbols-outlined">restart_alt</span>
                  Restart
                </button>
                <div className="topbar-divider" />
                <button
                  className="btn btn-primary"
                  disabled={isRunning || isRebuilding}
                  onClick={() => handleAction(activeService.projectName, activeService.name, 'start')}
                >
                  <span className="material-symbols-outlined">play_arrow</span>
                  Start
                </button>
                <button
                  className="btn btn-danger"
                  disabled={activeService.status === 'STOPPED'}
                  onClick={() => handleAction(activeService.projectName, activeService.name, 'stop')}
                >
                  <span className="material-symbols-outlined">stop</span>
                  Stop
                </button>
              </div>
            )}
          </header>

          {/* Control Bar for Logs */}
          <div className="log-toolbar" style={{ height: '48px', padding: '0 16px', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifySpace: 'between', borderBottom: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="search-wrap">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>search</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search logs..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  style={{ height: '28px', fontSize: '11px' }}
                />
              </div>
              <div className="log-filter-btns">
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
                  <button
                    key={lvl}
                    className={`log-filter-btn ${logLevelFilter === lvl ? 'active' : ''}`}
                    onClick={() => setLogLevelFilter(lvl)}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="caps" style={{ color: 'var(--outline)', fontSize: '9px' }}>Auto-Scroll</span>
                <button
                  style={{
                    width: '32px',
                    height: '16px',
                    background: autoScroll ? 'var(--primary)' : 'var(--outline-variant)',
                    borderRadius: '10px',
                    position: 'relative',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: autoScroll ? '18px' : '2px',
                      top: '2px',
                      width: '12px',
                      height: '12px',
                      background: '#ffffff',
                      borderRadius: '50%',
                      transition: 'left 0.2s'
                    }}
                  />
                </button>
              </div>
              <button className="btn-icon" onClick={downloadLogs} title="Download Logs">
                <span className="material-symbols-outlined">download</span>
              </button>
              <button className="btn-icon danger" onClick={() => setLogs([])} title="Clear View">
                <span className="material-symbols-outlined">delete_sweep</span>
              </button>
            </div>
          </div>

          {/* Logs scroll wrapper */}
          <div className="log-body" style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
            {filteredLogs.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--outline)', fontStyle: 'italic', fontSize: '12px' }}>
                {activeService ? 'No logs match filters.' : 'Select an instance to stream logs.'}
              </div>
            ) : (
              filteredLogs.map((log, i) => {
                const upperLog = log.toUpperCase();
                const level = upperLog.includes('ERROR') || upperLog.includes('EXCEPTION') || upperLog.includes('FAIL')
                  ? 'ERROR'
                  : upperLog.includes('WARN')
                    ? 'WARN'
                    : upperLog.includes('DEBUG')
                      ? 'DEBUG'
                      : 'INFO';

                const isError = level === 'ERROR';

                return (
                  <div key={i} className={`log-entry ${isError ? 'error-row' : ''}`}>
                    <span className="log-ts">{new Date().toLocaleTimeString()}</span>
                    <span className={`log-level-tag ${level.toLowerCase()}`}>
                      {level}
                    </span>
                    <span className="log-msg" style={{ color: getLogColor(log) }}>
                      {log}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logBottomRef} />
          </div>

          {/* Terminal Input mimic */}
          <footer className="log-drawer-footer" style={{ height: '40px', background: '#0a0a0f', borderTop: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>❯</span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.querySelector('input');
                if (input && input.value.trim()) {
                  const cmd = input.value.trim();
                  setLogs(prev => [...prev, `[USER COMMAND]: ${cmd}`, `Command execution is simulated.`]);
                  input.value = '';
                }
              }}
              style={{ flex: 1, display: 'flex' }}
            >
              <input
                type="text"
                placeholder="Type a command (e.g. --tail 100)"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--on-surface)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
            </form>
          </footer>
        </section>
      </div>
    );
  };

  const renderSettingsPage = () => {
    return (
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <header className="topbar" style={{ height: '64px', background: 'none', borderBottom: '1px solid var(--outline-variant)', padding: 0, marginBottom: '24px' }}>
          <span className="topbar-title" style={{ fontSize: '20px' }}>System Settings</span>
        </header>

        <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--primary)' }}>Garbage Collector Recommendation</h3>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--on-surface-variant)', marginBottom: '16px' }}>
              Based on our performance analysis for this low-throughput, desktop-grade microservice dashboard:
            </p>
            <div style={{ background: '#0a0a0f', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px', border: '1px solid var(--outline-variant)', borderRadius: '2px', marginBottom: '16px', color: 'var(--primary)' }}>
              java -XX:+UseSerialGC -Xms32m -Xmx128m -jar backend.jar
            </div>
            <p style={{ fontSize: '12px', color: 'var(--outline)', lineHeight: 1.5 }}>
              Why Serial GC? For small heaps (&lt; 128 MB), Serial GC has negligible CPU overhead and no background GC threads. STW pause times remain imperceptible (&lt; 5 ms), keeping maximum performance for log streaming I/O.
            </p>
          </div>

          <div style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0, color: 'var(--primary)' }}>JDK Configurations</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  disabled={scanningJdks}
                  onClick={handleScanJdks}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>
                    {scanningJdks ? 'hourglass_empty' : 'sync'}
                  </span>
                  {scanningJdks ? 'Scanning...' : 'Scan System JDKs'}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => {
                    setEditingJdkName(null);
                    setJdkFormData({ name: '', windowsPath: '', linuxPath: '', macPath: '' });
                    setOpenJdkDialog(true);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', marginRight: '4px' }}>add</span> Add JDK
                </button>
              </div>
            </div>

            {jdks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--outline)', fontStyle: 'italic', fontSize: '13px' }}>
                No custom JDKs configured. Using system default Java.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {jdks.map(jdk => (
                  <div key={jdk.name} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--on-surface)' }}>{jdk.name}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr', gap: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--outline)' }}>Windows Path:</span>
                        <span style={{ color: 'var(--on-surface-variant)', wordBreak: 'break-all' }}>{jdk.windowsPath || <span style={{ fontStyle: 'italic', color: 'var(--outline)' }}>not set</span>}</span>
                        <span style={{ color: 'var(--outline)' }}>Linux Path:</span>
                        <span style={{ color: 'var(--on-surface-variant)', wordBreak: 'break-all' }}>{jdk.linuxPath || <span style={{ fontStyle: 'italic', color: 'var(--outline)' }}>not set</span>}</span>
                        <span style={{ color: 'var(--outline)' }}>macOS Path:</span>
                        <span style={{ color: 'var(--on-surface-variant)', wordBreak: 'break-all' }}>{jdk.macPath || <span style={{ fontStyle: 'italic', color: 'var(--outline)' }}>not set</span>}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                      <button
                        className="btn-icon warn"
                        onClick={() => {
                          setEditingJdkName(jdk.name);
                          setJdkFormData({ ...jdk });
                          setOpenJdkDialog(true);
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                      </button>
                      <button
                        className="btn-icon danger"
                        onClick={() => handleDeleteJdk(jdk.name)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '4px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--primary)' }}>System Information</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--outline)' }}>App Version</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>v2.4.1-Stable</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--outline)' }}>Java Runtime</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>Java 17 (JVM Headless = false)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--outline)' }}>SSE Event Stream</span>
                <span style={{ color: '#4ade80' }}>Connected (1 active connection)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="shell">
      {/* Dynamic styles to handle CSS overrides and hover actions */}
      <style>{`
        .project-item { position: relative; }
        .project-item .project-actions { display: none; }
        .project-item:hover .project-actions { display: flex; }
        .log-entry.error-row { background: rgba(255, 180, 171, 0.05); }
        .form-select {
          background: var(--surface-container-low); border: 1px solid var(--outline-variant);
          color: var(--on-surface); padding: 8px 10px; border-radius: 2px; outline: none;
          font-family: var(--font-ui); font-size: 13px; width: 100%;
          transition: border-color 0.15s;
        }
        .form-select:focus { border-color: var(--primary); }
      `}</style>

      {/* Main Sidebar Navigation */}
      <aside className="sidebar" style={{ width: '260px' }}>
        <div className="sidebar-logo">
          <h1>Micorservice Manager</h1>
          <p>V2.4.1-Stable</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', flex: 1 }}>
          <button
            className={`btn ${activeTab === 'projects' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
            onClick={() => setActiveTab('projects')}
          >
            <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>folder_managed</span>
            Projects
          </button>
          <button
            className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
            onClick={() => setActiveTab('logs')}
          >
            <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>terminal</span>
            Logs
          </button>
          <button
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
            onClick={() => setActiveTab('settings')}
          >
            <span className="material-symbols-outlined" style={{ marginRight: '8px' }}>settings</span>
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-add-btn" onClick={() => { resetForm(); setOpenForm(true); }}>
            <span className="material-symbols-outlined">add</span>
            Deploy New
          </button>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--on-surface-variant)', textDecoration: 'none', padding: '6px 8px', fontSize: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>
              Docs
            </a>
            <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--on-surface-variant)', textDecoration: 'none', padding: '6px 8px', fontSize: '12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>help_outline</span>
              Support
            </a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 8px', borderTop: '1px solid var(--outline-variant)', marginTop: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--surface-container-highest)', border: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>person</span>
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', margin: 0 }}>admin_root</p>
              <p style={{ fontSize: '10px', color: 'var(--outline)', margin: 0 }}>Workspace 01</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-area">
        {activeTab === 'projects' && renderProjectsPage()}
        {activeTab === 'logs' && renderLogsPage()}
        {activeTab === 'settings' && renderSettingsPage()}
      </div>

      {/* Project Form Dialog */}
      <Dialog
        open={openProjectForm}
        onClose={() => setOpenProjectForm(false)}
        PaperProps={{ sx: { background: 'var(--surface-container)', color: 'var(--on-surface)', borderRadius: 2, border: '1px solid var(--outline-variant)', minWidth: '400px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingProjectName ? 'Edit Project Config' : 'Create New Project'}
        </DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            <div className="form-field">
              <label className="form-label">Project Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="MyProject"
                value={projectFormData.name}
                disabled={!!editingProjectName}
                onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                placeholder="Optional description"
                rows={3}
                value={projectFormData.description}
                onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenProjectForm(false)} sx={{ color: 'var(--outline)' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveProject}
            sx={{ borderRadius: 1, background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 'bold', '&:hover': { opacity: 0.9 } }}
          >
            {editingProjectName ? 'Update Project' : 'Create Project'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Service Form Dialog */}
      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        PaperProps={{ sx: { background: 'var(--surface-container)', color: 'var(--on-surface)', borderRadius: 2, border: '1px solid var(--outline-variant)', minWidth: '450px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>{editingService ? 'Edit Microservice' : 'Add New Microservice'}</DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            <div className="form-field">
              <label className="form-label">Service Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="auth-service"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Associated Project</label>
              <select
                className="form-select"
                value={formData.projectName || 'Default'}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
              >
                {projects.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Local Service Path</label>
              <div className="form-path-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="D:\\codes\\auth-service"
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => browseDirs(formData.path || '')}
                  style={{ minWidth: 'auto', padding: '0 12px' }}
                >
                  <span className="material-symbols-outlined">folder_open</span>
                </button>
              </div>
            </div>

            {detectedFramework && detectedFramework !== 'unknown' && (() => {
              const badges: Record<string, { label: string; color: string; bg: string }> = {
                'spring-boot': { label: '🍃 Spring Boot', color: '#6dbf82', bg: 'rgba(109,191,130,0.15)' },
                'gradle': { label: '🐘 Gradle', color: '#a0c4e0', bg: 'rgba(160,196,224,0.15)' },
                'angular': { label: '🔺 Angular', color: '#e6003f', bg: 'rgba(230,0,63,0.15)' },
                'react-vite': { label: '⚛️ React + Vite', color: '#61dafb', bg: 'rgba(97,218,251,0.12)' },
                'react': { label: '⚛️ React', color: '#61dafb', bg: 'rgba(97,218,251,0.12)' },
                'vite': { label: '⚡ Vite', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
                'node': { label: '🟢 Node.js', color: '#68d391', bg: 'rgba(104,211,145,0.15)' },
                'python-venv-fastapi': { label: '🐍 Python + venv (FastAPI)', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
                'python-venv-flask': { label: '🐍 Python + venv (Flask)', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
                'python-venv': { label: '🐍 Python + venv', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
                'python-fastapi': { label: '🐍 Python (FastAPI)', color: '#86efac', bg: 'rgba(134,239,172,0.12)' },
                'python-flask': { label: '🐍 Python (Flask)', color: '#86efac', bg: 'rgba(134,239,172,0.12)' },
                'python': { label: '🐍 Python', color: '#86efac', bg: 'rgba(134,239,172,0.12)' },
              };
              const badge = badges[detectedFramework];
              if (!badge) return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="framework-badge" style={{ background: badge.bg, color: badge.color, borderColor: `${badge.color}44` }}>
                    {badge.label}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--outline)' }}>Inferred framework</span>
                </div>
              );
            })()}

            <div className="form-field">
              <label className="form-label">Port</label>
              <input
                type="number"
                className="form-input"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Start Command</label>
              <Autocomplete
                freeSolo
                options={suggestedCommands}
                value={formData.startCommand}
                onChange={(_, newValue) => setFormData({ ...formData, startCommand: newValue || '' })}
                onInputChange={(_, newInputValue) => setFormData({ ...formData, startCommand: newInputValue })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    variant="outlined"
                    placeholder="mvn spring-boot:run"
                    sx={{
                      background: 'var(--surface-container-low)',
                      borderRadius: '2px',
                      '& .MuiOutlinedInput-root': {
                        color: 'var(--on-surface)',
                        '& fieldset': { borderColor: 'var(--outline-variant)' },
                        '&:hover fieldset': { borderColor: 'var(--outline)' },
                        '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
                      }
                    }}
                  />
                )}
              />
            </div>

            {suggestedCommands.length > 0 && (
              <div className="form-field">
                <label className="form-label">Suggested Commands</label>
                <div className="suggestion-chips">
                  {suggestedCommands.map((cmd) => (
                    <span
                      key={cmd}
                      className="suggestion-chip"
                      onClick={() => setFormData({ ...formData, startCommand: cmd })}
                    >
                      {cmd}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="form-field">
              <label className="form-label">Clean & Rebuild Command</label>
              <Autocomplete
                freeSolo
                options={suggestedRebuildCommands}
                value={formData.rebuildCommand || ''}
                onChange={(_, newValue) => setFormData({ ...formData, rebuildCommand: newValue || '' })}
                onInputChange={(_, newInputValue) => setFormData({ ...formData, rebuildCommand: newInputValue })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    variant="outlined"
                    placeholder="mvn clean install"
                    sx={{
                      background: 'var(--surface-container-low)',
                      borderRadius: '2px',
                      '& .MuiOutlinedInput-root': {
                        color: 'var(--on-surface)',
                        '& fieldset': { borderColor: 'var(--outline-variant)' },
                        '&:hover fieldset': { borderColor: 'var(--outline)' },
                        '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
                      }
                    }}
                  />
                )}
              />
            </div>

            {suggestedRebuildCommands.length > 0 && (
              <div className="form-field">
                <label className="form-label">Suggested Rebuild Commands</label>
                <div className="suggestion-chips">
                  {suggestedRebuildCommands.map((cmd) => (
                    <span
                      key={cmd}
                      className="suggestion-chip"
                      onClick={() => setFormData({ ...formData, rebuildCommand: cmd })}
                    >
                      {cmd}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Properties / Config File Selector */}
            <div className="form-field">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary)' }}>description</span>
                Active Properties / Config File
              </label>
              {propertiesFiles.length > 0 ? (
                <>
                  <select
                    className="form-select"
                    value={formData.activePropertiesFile || ''}
                    onChange={(e) => setFormData({ ...formData, activePropertiesFile: e.target.value })}
                  >
                    <option value="">(none — use default)</option>
                    {propertiesFiles.map((f) => (
                      <option key={f} value={f}>
                        {f.replace(/\\/g, '/').split('/').pop()} — {f}
                      </option>
                    ))}
                  </select>
                  {formData.activePropertiesFile && (
                    <div style={{
                      marginTop: '6px',
                      padding: '6px 10px',
                      background: 'rgba(var(--primary-rgb, 190, 194, 255), 0.08)',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary)' }}>check_circle</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--on-surface)', wordBreak: 'break-all' }}>
                        {formData.activePropertiesFile}
                      </span>
                      <button
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', padding: '2px' }}
                        onClick={() => setFormData({ ...formData, activePropertiesFile: '' })}
                        title="Clear selection"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. D:\configs\application-prod.properties"
                    value={formData.activePropertiesFile || ''}
                    onChange={(e) => setFormData({ ...formData, activePropertiesFile: e.target.value })}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                  {formData.path && (
                    <span style={{ fontSize: '11px', color: 'var(--outline)', whiteSpace: 'nowrap' }}>
                      Select a path first to auto-detect files
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Target JDK Selector */}
            <div className="form-field">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary)' }}>terminal</span>
                Target JDK (Java Development Kit)
              </label>
              <select
                className="form-select"
                value={formData.jdkName || ''}
                onChange={(e) => setFormData({ ...formData, jdkName: e.target.value })}
              >
                <option value="">System Default JDK</option>
                {jdks.map((jdk) => (
                  <option key={jdk.name} value={jdk.name}>
                    {jdk.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenForm(false)} sx={{ color: 'var(--outline)' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveService}
            sx={{ borderRadius: 1, background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 'bold', '&:hover': { opacity: 0.9 } }}
          >
            {editingService ? 'Update Service' : 'Save Service'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Directory Browser Dialog */}
      <Dialog
        open={openBrowse}
        onClose={() => setOpenBrowse(false)}
        PaperProps={{ sx: { background: 'var(--surface-container-lowest)', color: 'var(--on-surface)', borderRadius: 2, border: '1px solid var(--outline-variant)', minWidth: '500px' } }}
      >
        <DialogTitle sx={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>folder_open</span>
            <span style={{ fontWeight: 700 }}>Select Folder</span>
          </div>
        </DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <div className="browse-path-bar">
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{currentPath || 'Drive Roots'}</span>
              <button
                className="btn-icon"
                onClick={() => browseDirs(currentPath.substring(0, currentPath.lastIndexOf('\\')))}
                disabled={!currentPath}
              >
                <span className="material-symbols-outlined">arrow_upward</span>
              </button>
            </div>

            <div className="browse-list">
              {dirs.map((dir, i) => (
                <div
                  key={i}
                  className="browse-item"
                  onClick={() => browseDirs(dir)}
                  onDoubleClick={() => handleSelectPath(dir)}
                >
                  <span className="material-symbols-outlined">folder</span>
                  <span>{dir.split('\\').pop() || dir}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenBrowse(false)} sx={{ color: 'var(--outline)' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => handleSelectPath(currentPath)}
            disabled={!currentPath}
            sx={{ background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 'bold' }}
          >
            Select Current Folder
          </Button>
        </DialogActions>
      </Dialog>

      {/* Environment Variables Edit Dialog */}
      <Dialog
        open={openEnvDialog}
        onClose={() => setOpenEnvDialog(false)}
        PaperProps={{ sx: { background: 'var(--surface-container)', color: 'var(--on-surface)', borderRadius: 2, border: '1px solid var(--outline-variant)', minWidth: '400px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Edit Environment Variables: {editingEnvName}
        </DialogTitle>
        <DialogContent>
          <div className="form-field" style={{ marginTop: '12px' }}>
            <label className="form-label">Variables (KEY=VALUE, one per line)</label>
            <textarea
              className="form-input"
              rows={8}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical' }}
              placeholder="DATABASE_URL=postgres://localhost:5432/db&#10;LOG_LEVEL=INFO"
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenEnvDialog(false)} sx={{ color: 'var(--outline)' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveEnvVars}
            sx={{ borderRadius: 1, background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 'bold', '&:hover': { opacity: 0.9 } }}
          >
            Save Variables
          </Button>
        </DialogActions>
      </Dialog>

      {/* JDK Form Dialog */}
      <Dialog
        open={openJdkDialog}
        onClose={() => setOpenJdkDialog(false)}
        PaperProps={{ sx: { background: 'var(--surface-container)', color: 'var(--on-surface)', borderRadius: 2, border: '1px solid var(--outline-variant)', minWidth: '450px' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingJdkName ? 'Edit JDK Configuration' : 'Add JDK Configuration'}
        </DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            <div className="form-field">
              <label className="form-label">JDK Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Java 17, GraalVM 21"
                value={jdkFormData.name}
                disabled={!!editingJdkName}
                onChange={(e) => setJdkFormData({ ...jdkFormData, name: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Windows Path</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. C:\Program Files\Java\jdk-17"
                value={jdkFormData.windowsPath}
                onChange={(e) => setJdkFormData({ ...jdkFormData, windowsPath: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Linux Path</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. /usr/lib/jvm/java-17-openjdk"
                value={jdkFormData.linuxPath}
                onChange={(e) => setJdkFormData({ ...jdkFormData, linuxPath: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">macOS Path</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. /Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"
                value={jdkFormData.macPath}
                onChange={(e) => setJdkFormData({ ...jdkFormData, macPath: e.target.value })}
              />
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenJdkDialog(false)} sx={{ color: 'var(--outline)' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveJdk}
            sx={{ borderRadius: 1, background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 'bold', '&:hover': { opacity: 0.9 } }}
          >
            {editingJdkName ? 'Update JDK' : 'Add JDK'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default App;
