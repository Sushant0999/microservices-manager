import { useEffect, useState, useRef, memo } from 'react';
import { 
  Box, Container, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, Stack,
  CircularProgress, Tooltip, TextField, DialogActions, Autocomplete, Grid,
  ToggleButton, ToggleButtonGroup, List, ListItem, ListItemButton, 
  ListItemIcon, ListItemText, Divider
} from '@mui/material';
import { 
  PlayArrow as PlayIcon, Stop as StopIcon, Refresh as RefreshIcon, 
  Build as BuildIcon, Terminal as LogIcon, FiberManualRecord as StatusIcon,
  Add as AddIcon, Delete as DeleteIcon, FolderOpen as BrowseIcon, 
  Edit as EditIcon, ArrowUpward as UpIcon,
  Launch as LaunchIcon, GridView as GridIcon, List as ListIcon,
  Folder as ProjectIcon,
  ChevronLeft as CollapseIcon, ChevronRight as ExpandIcon
} from '@mui/icons-material';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface Service {
  name: string;
  projectName: string;
  path: string;
  port: number;
  status: string;
  startCommand: string;
  rebuildCommand?: string;
}

interface Project {
  name: string;
  description: string;
  services: Service[];
}

const getLogColor = (log: string) => {
  const upperLog = log.toUpperCase();
  if (upperLog.includes('ERROR') || upperLog.includes('EXCEPTION') || upperLog.includes('FAIL')) return '#ef4444';
  if (upperLog.includes('WARN')) return '#f59e0b';
  if (upperLog.includes('INFO') || upperLog.includes('SUCCESS') || upperLog.includes('OK')) return '#e2e8f0';
  if (upperLog.includes('DEBUG')) return '#94a3b8';
  return 'rgba(255,255,255,0.7)';
};

const LogCard = memo(({ service, onAction }: { service: Service, onAction: (projectName: string, name: string, action: string) => void }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (service.status !== 'RUNNING' && service.status !== 'REBUILDING') {
      return;
    }
    const eventSource = new EventSource(`/api/projects/${service.projectName}/services/${service.name}/logs`);
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev.slice(-99), event.data]);
    };
    return () => eventSource.close();
  }, [service.projectName, service.name, service.status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Paper sx={{ 
      background: '#020617', 
      borderRadius: 3, 
      overflow: 'hidden', 
      border: '1px solid rgba(255,255,255,0.1)',
      height: '300px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <LogIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'white', flexGrow: 1 }}>{service.name}</Typography>
        <Chip 
          icon={<StatusIcon sx={{ fontSize: '10px !important' }} />}
          label={service.status} 
          size="small"
          color={service.status === 'RUNNING' ? 'success' : (service.status === 'STOPPED' ? 'default' : 'warning')} 
          sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, mr: 1 }}
        />
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Start">
            <IconButton size="small" color="success" onClick={() => onAction(service.projectName, service.name, 'start')} disabled={service.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
              <PlayIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Stop">
            <IconButton size="small" color="error" onClick={() => onAction(service.projectName, service.name, 'stop')} disabled={service.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
              <StopIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      <Box 
        ref={scrollRef}
        sx={{ 
          p: 1.5, 
          flexGrow: 1, 
          overflowY: 'auto', 
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          color: 'rgba(255,255,255,0.8)'
        }}
      >
        {logs.length === 0 && (
          <Typography variant="caption" sx={{ opacity: 0.3, display: 'block', textAlign: 'center', mt: 4 }}>
            Waiting for logs...
          </Typography>
        )}
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '2px', wordBreak: 'break-all', color: getLogColor(log) }}>
            <span style={{ color: '#6366f1', marginRight: '4px' }}>&gt;</span>
            {log}
          </div>
        ))}
      </Box>
    </Paper>
  );
});

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  
  // Selected log service: { projectName, serviceName }
  const [selectedLogService, setSelectedLogService] = useState<{ projectName: string; serviceName: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Service Add/Edit form state
  const [openForm, setOpenForm] = useState(false);
  const [editingService, setEditingService] = useState<{ projectName: string; serviceName: string } | null>(null);
  const [formData, setFormData] = useState<Service>({ name: '', projectName: 'Default', path: '', port: 8080, status: 'STOPPED', startCommand: '', rebuildCommand: '' });
  
  // Project Add/Edit form state
  const [openProjectForm, setOpenProjectForm] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState<string | null>(null);
  const [projectFormData, setProjectFormData] = useState<{ name: string; description: string }>({ name: '', description: '' });

  // Folder browser state
  const [openBrowse, setOpenBrowse] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [dirs, setDirs] = useState<string[]>([]);
  
  // Sidebar visibility
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Display view mode state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [suggestedCommands, setSuggestedCommands] = useState<string[]>([]);
  const [suggestedRebuildCommands, setSuggestedRebuildCommands] = useState<string[]>([]);
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Derived calculations
  const allServices: Service[] = projects.flatMap(p => (p.services || []).map(s => ({ ...s, projectName: p.name })));
  
  const filteredServices = selectedProject === 'All' 
    ? allServices 
    : allServices.filter(s => s.projectName === selectedProject);

  const activeProjectObj = projects.find(p => p.name === selectedProject);

  const fetchProjects = async () => {
    try {
      const { data } = await axios.get('/api/projects');
      setProjects(data || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleAction = async (projectName: string, serviceName: string, action: string) => {
    try {
      await axios.post(`/api/projects/${projectName}/services/${serviceName}/${action}`);
      fetchProjects();
    } catch (err) {
      console.error(`Action ${action} failed for ${projectName}/${serviceName}`, err);
    }
  };

  const openLogs = (projectName: string, serviceName: string) => {
    setSelectedLogService({ projectName, serviceName });
    setLogs([]);
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/projects/${projectName}/services/${serviceName}/logs`);
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev.slice(-999), event.data]);
    };
    eventSourceRef.current = eventSource;
  };

  const closeLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setSelectedLogService(null);
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

  const handleSaveService = async () => {
    try {
      if (editingService) {
        if (editingService.projectName !== formData.projectName) {
          // Moved to another project
          await axios.delete(`/api/projects/${editingService.projectName}/services/${editingService.serviceName}`);
          await axios.post(`/api/projects/${formData.projectName}/services`, formData);
        } else {
          // Updated in the same project
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

  const resetForm = () => {
    setFormData({ 
      name: '', 
      projectName: selectedProject !== 'All' ? selectedProject : (projects[0]?.name || 'Default'), 
      path: '', 
      port: 8080, 
      status: 'STOPPED',
      startCommand: '', 
      rebuildCommand: '' 
    });
    setEditingService(null);
    setSuggestedCommands([]);
    setSuggestedRebuildCommands([]);
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
      const { data } = await axios.get(`/api/fs/suggest-commands?path=${encodeURIComponent(path)}`);
      setSuggestedCommands(data || []);
      
      const { data: rebuildData } = await axios.get(`/api/fs/suggest-rebuild-commands?path=${encodeURIComponent(path)}`);
      setSuggestedRebuildCommands(rebuildData || []);

      const { data: portData } = await axios.get(`/api/fs/suggest-port?path=${encodeURIComponent(path)}`);

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

  // Stats derivations
  const totalServices = filteredServices.length;
  const runningServices = filteredServices.filter(s => s.status === 'RUNNING').length;
  const portsUsed = filteredServices.filter(s => s.status === 'RUNNING').map(s => s.port);

  return (
    <Box sx={{ minHeight: '100vh', py: 4, background: 'linear-gradient(135deg, #090d16 0%, #111029 50%, #1b1335 100%)' }}>
      <Container maxWidth="xl">
        <Grid container spacing={3}>
          {/* Header */}
          <Grid item xs={12}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: 'white', letterSpacing: -1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box component="span" sx={{ background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Microservices
                </Box> 
                <Typography component="span" variant="h4" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 300 }}>Manager</Typography>
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Tooltip title={sidebarVisible ? 'Hide Projects Panel' : 'Show Projects Panel'}>
                  <IconButton
                    onClick={() => setSidebarVisible(v => !v)}
                    size="small"
                    sx={{
                      color: sidebarVisible ? 'primary.light' : 'rgba(255,255,255,0.5)',
                      background: sidebarVisible ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid',
                      borderColor: sidebarVisible ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                      borderRadius: 2,
                      '&:hover': { background: 'rgba(99,102,241,0.25)' }
                    }}
                  >
                    {sidebarVisible ? <CollapseIcon /> : <ExpandIcon />}
                  </IconButton>
                </Tooltip>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(_, val) => val && setViewMode(val)}
                  size="small"
                  sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}
                >
                  <ToggleButton value="list" sx={{ color: 'white' }}><ListIcon /></ToggleButton>
                  <ToggleButton value="grid" sx={{ color: 'white' }}><GridIcon /></ToggleButton>
                </ToggleButtonGroup>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => { resetForm(); setOpenForm(true); }} sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                  Add Service
                </Button>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchProjects} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
                  Refresh
                </Button>
              </Stack>
            </Stack>
          </Grid>

          {/* Left Sidebar - Projects list */}
          <AnimatePresence initial={false}>
          {sidebarVisible && (
          <Grid item xs={12} md={3.5} lg={3} component={motion.div} key="sidebar" initial={{ opacity: 0, x: -30, width: 0 }} animate={{ opacity: 1, x: 0, width: 'auto' }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
            <Paper sx={{ 
              background: 'rgba(30, 41, 59, 0.4)', 
              backdropFilter: 'blur(12px)',
              borderRadius: 4, 
              border: '1px solid rgba(255,255,255,0.08)',
              p: 2,
              height: 'fit-content'
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '0.8rem' }}>
                  Projects
                </Typography>
                <Button 
                  size="small" 
                  startIcon={<AddIcon sx={{ fontSize: '1rem !important' }} />}
                  onClick={() => { setProjectFormData({ name: '', description: '' }); setEditingProjectName(null); setOpenProjectForm(true); }}
                  sx={{ color: 'primary.light', textTransform: 'none', fontWeight: 700 }}
                >
                  New Project
                </Button>
              </Stack>

              <List sx={{ p: 0 }}>
                {/* All Projects item */}
                <ListItem disablePadding sx={{ mb: 1 }}>
                  <ListItemButton 
                    selected={selectedProject === 'All'}
                    onClick={() => setSelectedProject('All')}
                    sx={{ 
                      borderRadius: 2,
                      color: 'white',
                      '&.Mui-selected': {
                        background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, rgba(124, 58, 237, 0.1) 100%)',
                        borderLeft: '4px solid #6366f1',
                      },
                      '&:hover': {
                        background: 'rgba(255,255,255,0.05)'
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <ProjectIcon sx={{ color: selectedProject === 'All' ? 'primary.light' : 'rgba(255,255,255,0.5)' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary={<Typography variant="body2" sx={{ fontWeight: 700 }}>All Projects</Typography>} 
                      secondary={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>All managed microservices</Typography>}
                    />
                    <Chip 
                      label={allServices.length} 
                      size="small" 
                      sx={{ background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: '0.65rem' }} 
                    />
                  </ListItemButton>
                </ListItem>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 1.5 }} />

                {/* Individual Projects */}
                {loading ? (
                  <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
                ) : projects.map((p) => {
                  const runningCount = (p.services || []).filter(s => s.status === 'RUNNING').length;
                  const totalCount = (p.services || []).length;
                  return (
                    <ListItem 
                      key={p.name} 
                      disablePadding 
                      sx={{ mb: 1 }}
                      secondaryAction={
                        <Stack direction="row" spacing={0.2} sx={{ mr: -1.5 }}>
                          <IconButton size="small" onClick={() => startEditProject(p)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: 'warning.light' } }}>
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteProject(p.name)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: 'error.light' } }}>
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                      }
                    >
                      <ListItemButton 
                        selected={selectedProject === p.name}
                        onClick={() => setSelectedProject(p.name)}
                        sx={{ 
                          borderRadius: 2,
                          color: 'white',
                          pr: 7, // Make room for actions
                          '&.Mui-selected': {
                            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.2) 0%, rgba(124, 58, 237, 0.05) 100%)',
                            borderLeft: '4px solid #818cf8',
                          },
                          '&:hover': {
                            background: 'rgba(255,255,255,0.05)'
                          }
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <ProjectIcon sx={{ color: selectedProject === p.name ? 'primary.light' : 'rgba(255,255,255,0.5)' }} />
                        </ListItemIcon>
                        <ListItemText 
                          primary={<Typography variant="body2" sx={{ fontWeight: 700 }}>{p.name}</Typography>} 
                          secondary={
                            <Typography variant="caption" noWrap sx={{ display: 'block', maxWidth: 120, color: 'rgba(255,255,255,0.4)' }}>
                              {p.description || 'No description'}
                            </Typography>
                          }
                        />
                        <Chip 
                          label={`${runningCount}/${totalCount}`} 
                          size="small" 
                          color={runningCount > 0 ? 'success' : 'default'}
                          sx={{ 
                            fontWeight: 700, 
                            fontSize: '0.65rem', 
                            height: 18, 
                            background: runningCount > 0 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: runningCount > 0 ? '#4caf50' : 'rgba(255,255,255,0.6)'
                          }} 
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>
          )}
          </AnimatePresence>

          {/* Right Main Content Panel */}
          <Grid item xs={12} md={sidebarVisible ? 8.5 : 12} lg={sidebarVisible ? 9 : 12}>
            <Stack spacing={3}>
              {/* Active Project Dashboard Header & Stats */}
              <Paper sx={{ 
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.5) 100%)', 
                backdropFilter: 'blur(12px)',
                borderRadius: 4, 
                border: '1px solid rgba(255,255,255,0.08)',
                p: 3
              }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={7}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="h5" sx={{ color: 'white', fontWeight: 800 }}>
                        {selectedProject === 'All' ? 'All Active Projects' : selectedProject}
                      </Typography>
                      {selectedProject !== 'All' && (
                        <Chip 
                          label="Project Scope" 
                          size="small"
                          sx={{ background: 'rgba(99, 102, 241, 0.2)', color: 'primary.light', fontWeight: 700, fontSize: '0.65rem' }} 
                        />
                      )}
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                      {selectedProject === 'All' 
                        ? 'Overview of all your configured projects and their underlying microservices.' 
                        : (activeProjectObj?.description || 'No description provided for this project. Add configurations and run microservices below.')}
                    </Typography>
                  </Grid>

                  {/* Stats Grid */}
                  <Grid item xs={12} md={5}>
                    <Stack direction="row" spacing={3} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Services</Typography>
                        <Typography variant="h4" sx={{ color: 'white', fontWeight: 800 }}>{totalServices}</Typography>
                      </Box>
                      <Box sx={{ borderLeft: '1px solid rgba(255,255,255,0.1)', pl: 3 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Running</Typography>
                        <Typography variant="h4" sx={{ color: runningServices > 0 ? 'success.main' : 'white', fontWeight: 800 }}>
                          {runningServices}
                        </Typography>
                      </Box>
                      <Box sx={{ borderLeft: '1px solid rgba(255,255,255,0.1)', pl: 3 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Ports Active</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, mt: 1, fontFamily: 'monospace' }}>
                          {portsUsed.length > 0 ? portsUsed.join(', ') : 'None'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>

              {/* View Switcher and Services Panel */}
              <AnimatePresence mode="wait">
                {viewMode === 'list' ? (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Paper sx={{ 
                      background: 'rgba(30, 41, 59, 0.4)', 
                      backdropFilter: 'blur(10px)',
                      borderRadius: 4, 
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)' 
                    }}>
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow sx={{ background: 'rgba(255,255,255,0.03)' }}>
                              <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.75rem' }}>SERVICE NAME</TableCell>
                              {selectedProject === 'All' && (
                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.75rem' }}>PROJECT</TableCell>
                              )}
                              <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.75rem' }}>PORT</TableCell>
                              <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.75rem' }}>STATUS</TableCell>
                              <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.75rem' }} align="right">
                                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                  <span>ACTIONS</span>
                                  <Tooltip title="Start All Services">
                                     <IconButton size="small" onClick={startAll} sx={{ color: 'success.main', background: 'rgba(76, 175, 80, 0.1)', p: 0.5 }}>
                                       <PlayIcon sx={{ fontSize: 16 }} />
                                     </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Stop All Services">
                                     <IconButton size="small" onClick={stopAll} sx={{ color: 'error.main', background: 'rgba(244, 67, 54, 0.1)', p: 0.5 }}>
                                       <StopIcon sx={{ fontSize: 16 }} />
                                     </IconButton>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {loading ? (
                              <TableRow><TableCell colSpan={selectedProject === 'All' ? 5 : 4} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
                            ) : filteredServices.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={selectedProject === 'All' ? 5 : 4} align="center" sx={{ py: 6 }}>
                                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                                    No services added yet. Click "Add Service" to get started.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : filteredServices.map((service) => (
                              <TableRow key={`${service.projectName}:${service.name}`} hover sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { background: 'rgba(255,255,255,0.01)' } }}>
                                <TableCell sx={{ color: 'white', fontWeight: 600 }}>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {service.name}
                                    {service.status === 'RUNNING' && (
                                      <Tooltip title="Open in Browser">
                                        <IconButton size="small" sx={{ color: 'primary.light', p: 0.5 }} onClick={() => window.open(`http://localhost:${service.port}`, '_blank')}>
                                          <LaunchIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                </TableCell>
                                {selectedProject === 'All' && (
                                  <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    <Chip label={service.projectName} size="small" sx={{ height: 20, fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', color: 'white' }} />
                                  </TableCell>
                                )}
                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                  <code>{service.port}</code>
                                </TableCell>
                                <TableCell>
                                  <Chip 
                                    icon={<StatusIcon sx={{ fontSize: '8px !important' }} />}
                                    label={service.status} 
                                    size="small"
                                    color={service.status === 'RUNNING' ? 'success' : (service.status === 'STOPPED' ? 'default' : 'warning')} 
                                    sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22 }}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                    <Tooltip title="Start">
                                      <IconButton size="small" color="success" onClick={() => handleAction(service.projectName, service.name, 'start')} disabled={service.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
                                        <PlayIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Stop">
                                      <IconButton size="small" color="error" onClick={() => handleAction(service.projectName, service.name, 'stop')} disabled={service.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
                                        <StopIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Restart">
                                      <IconButton size="small" color="info" onClick={() => handleAction(service.projectName, service.name, 'restart')} sx={{ background: 'rgba(3, 169, 244, 0.1)' }}>
                                        <RefreshIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit Config">
                                      <IconButton size="small" color="warning" onClick={() => startEditService(service)} sx={{ background: 'rgba(255, 152, 0, 0.1)' }}>
                                        <EditIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Clean & Rebuild">
                                      <IconButton size="small" sx={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} disabled={!service.rebuildCommand} onClick={() => handleAction(service.projectName, service.name, 'rebuild')}>
                                        <BuildIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="View Logs">
                                      <IconButton size="small" sx={{ background: 'rgba(99, 102, 241, 0.1)', color: 'primary.light' }} onClick={() => openLogs(service.projectName, service.name)}>
                                        <LogIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove Service">
                                      <IconButton size="small" color="error" sx={{ background: 'rgba(244, 67, 54, 0.05)' }} onClick={() => handleDeleteService(service.projectName, service.name)}>
                                        <DeleteIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  </motion.div>
                ) : (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    {filteredServices.length === 0 ? (
                      <Paper sx={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, py: 8, textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                          No services added yet. Click "Add Service" to get started.
                        </Typography>
                      </Paper>
                    ) : (
                      <Grid container spacing={3}>
                        {filteredServices.map((service) => (
                          <Grid item xs={12} md={6} key={`${service.projectName}:${service.name}`}>
                            <LogCard service={service} onAction={handleAction} />
                          </Grid>
                        ))}
                      </Grid>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Stack>
          </Grid>
        </Grid>

        {/* Logs Dialog */}
        <Dialog 
          open={!!selectedLogService} 
          onClose={closeLogs}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { background: '#020617', borderRadius: 4, color: 'white', border: '1px solid rgba(255,255,255,0.1)' } }}
        >
          <DialogTitle sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <LogIcon sx={{ color: 'primary.light' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Logs: {selectedLogService?.serviceName}
              </Typography>
              <Chip 
                label={selectedLogService?.projectName} 
                size="small" 
                sx={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.65rem' }} 
              />
              {(() => {
                if (!selectedLogService) return null;
                const s = allServices.find(s => s.name === selectedLogService.serviceName && s.projectName === selectedLogService.projectName);
                if (!s) return null;
                return (
                  <Chip 
                    icon={<StatusIcon sx={{ fontSize: '10px !important' }} />}
                    label={s.status} 
                    size="small"
                    color={s.status === 'RUNNING' ? 'success' : (s.status === 'STOPPED' ? 'default' : 'warning')} 
                    sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, ml: 1 }}
                  />
                );
              })()}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {(() => {
                if (!selectedLogService) return null;
                const s = allServices.find(s => s.name === selectedLogService.serviceName && s.projectName === selectedLogService.projectName);
                if (!s) return null;
                return (
                  <Stack direction="row" spacing={0.5} sx={{ mr: 2 }}>
                    <Tooltip title="Start">
                      <IconButton size="small" color="success" onClick={() => handleAction(s.projectName, s.name, 'start')} disabled={s.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
                        <PlayIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Stop">
                      <IconButton size="small" color="error" onClick={() => handleAction(s.projectName, s.name, 'stop')} disabled={s.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
                        <StopIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                );
              })()}
              <IconButton onClick={closeLogs} sx={{ color: 'white' }}>
                <DeleteIcon sx={{ transform: 'rotate(45deg)', opacity: 0.5 }} />
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            <Box sx={{ 
              p: 2, 
              height: '400px', 
              overflowY: 'auto', 
              fontFamily: '"JetBrains Mono", "Courier New", monospace',
              fontSize: '0.85rem' 
            }}>
              {logs.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px', opacity: 0.8, color: getLogColor(log) }}>
                  <span style={{ color: '#6366f1', marginRight: '8px' }}>[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </Box>
          </DialogContent>
        </Dialog>

        {/* Project Form Dialog */}
        <Dialog open={openProjectForm} onClose={() => setOpenProjectForm(false)} PaperProps={{ sx: { background: '#1e293b', color: 'white', borderRadius: 4, minWidth: '400px' } }}>
          <DialogTitle sx={{ fontWeight: 800 }}>
            {editingProjectName ? 'Edit Project Config' : 'Create New Project'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1.5 }}>
              <TextField 
                label="Project Name" 
                fullWidth 
                variant="filled" 
                value={projectFormData.name}
                disabled={!!editingProjectName}
                onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                sx={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  borderRadius: 1, 
                  '& .MuiInputBase-input': { color: 'white' }, 
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } 
                }}
              />
              <TextField 
                label="Description" 
                fullWidth 
                multiline
                rows={3}
                variant="filled" 
                value={projectFormData.description}
                onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                sx={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  borderRadius: 1,
                  '& .MuiInputBase-input': { color: 'white' },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setOpenProjectForm(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
            <Button 
              variant="contained" 
              onClick={handleSaveProject} 
              sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
            >
              {editingProjectName ? 'Update Project' : 'Create Project'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Service Form Dialog */}
        <Dialog open={openForm} onClose={() => setOpenForm(false)} PaperProps={{ sx: { background: '#1e293b', color: 'white', borderRadius: 4, minWidth: '450px' } }}>
          <DialogTitle sx={{ fontWeight: 800 }}>{editingService ? 'Edit Microservice' : 'Add New Microservice'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField 
                label="Service Name" 
                fullWidth 
                variant="filled" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                sx={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  borderRadius: 1,
                  '& .MuiInputBase-input': { color: 'white' },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                }}
              />
              <Autocomplete
                options={projects.map(p => p.name)}
                value={formData.projectName || 'Default'}
                onChange={(_, newValue) => setFormData({ ...formData, projectName: newValue || 'Default' })}
                disableClearable
                renderInput={(params) => (
                  <TextField 
                    {...params}
                    label="Associated Project" 
                    fullWidth 
                    variant="filled" 
                    sx={{ 
                      background: 'rgba(255,255,255,0.04)', 
                      borderRadius: 1,
                      '& .MuiInputBase-input': { color: 'white' },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                    }}
                  />
                )}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField 
                  label="Local Service Path" 
                  fullWidth 
                  variant="filled" 
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  sx={{ 
                    background: 'rgba(255,255,255,0.04)', 
                    borderRadius: 1,
                    '& .MuiInputBase-input': { color: 'white' },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                  }}
                />
                <Button 
                  variant="outlined" 
                  onClick={() => browseDirs(formData.path || '')}
                  sx={{ minWidth: 'auto', px: 2, height: '56px', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
                >
                  <BrowseIcon />
                </Button>
              </Box>
              <TextField 
                label="Port" 
                fullWidth 
                type="number" 
                variant="filled" 
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                sx={{ 
                  background: 'rgba(255,255,255,0.04)', 
                  borderRadius: 1,
                  '& .MuiInputBase-input': { color: 'white' },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                }}
              />
              
              <Autocomplete
                freeSolo
                options={suggestedCommands}
                value={formData.startCommand}
                onChange={(_, newValue) => setFormData({ ...formData, startCommand: newValue || '' })}
                onInputChange={(_, newInputValue) => setFormData({ ...formData, startCommand: newInputValue })}
                renderInput={(params) => (
                  <TextField 
                    {...params}
                    label="Start Command" 
                    fullWidth 
                    variant="filled" 
                    sx={{ 
                      background: 'rgba(255,255,255,0.04)', 
                      borderRadius: 1,
                      '& .MuiInputBase-input': { color: 'white' },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                    }}
                  />
                )}
              />
              {suggestedCommands.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1, display: 'block' }}>Suggested start commands:</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {suggestedCommands.map((cmd) => (
                      <Chip 
                        key={cmd} 
                        label={cmd} 
                        size="small" 
                        onClick={() => setFormData({ ...formData, startCommand: cmd })}
                        sx={{ background: 'rgba(99, 102, 241, 0.2)', color: 'white', '&:hover': { background: 'rgba(99, 102, 241, 0.4)' } }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              <Autocomplete
                freeSolo
                options={suggestedRebuildCommands}
                value={formData.rebuildCommand || ''}
                onChange={(_, newValue) => setFormData({ ...formData, rebuildCommand: newValue || '' })}
                onInputChange={(_, newInputValue) => setFormData({ ...formData, rebuildCommand: newInputValue })}
                renderInput={(params) => (
                  <TextField 
                    {...params}
                    label="Clean & Rebuild Command" 
                    fullWidth 
                    variant="filled" 
                    sx={{ 
                      background: 'rgba(255,255,255,0.04)', 
                      borderRadius: 1,
                      '& .MuiInputBase-input': { color: 'white' },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }
                    }}
                  />
                )}
              />
              {suggestedRebuildCommands.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1, display: 'block' }}>Suggested rebuild commands:</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {suggestedRebuildCommands.map((cmd) => (
                      <Chip 
                        key={cmd} 
                        label={cmd} 
                        size="small" 
                        onClick={() => setFormData({ ...formData, rebuildCommand: cmd })}
                        sx={{ background: 'rgba(244, 67, 54, 0.2)', color: 'white', '&:hover': { background: 'rgba(244, 67, 54, 0.4)' } }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setOpenForm(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
            <Button 
              variant="contained" 
              onClick={handleSaveService} 
              sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
            >
              {editingService ? 'Update Service' : 'Save Service'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Directory Browser */}
        <Dialog open={openBrowse} onClose={() => setOpenBrowse(false)} PaperProps={{ sx: { background: '#020617', color: 'white', borderRadius: 4, minWidth: '500px', border: '1px solid rgba(255,255,255,0.1)' } }}>
          <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BrowseIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Select Folder</Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Box sx={{ p: 1, background: 'rgba(99, 102, 241, 0.1)', borderRadius: 2, display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', flexGrow: 1, wordBreak: 'break-all' }}>{currentPath || 'Roots'}</Typography>
                <IconButton size="small" onClick={() => browseDirs(currentPath.substring(0, currentPath.lastIndexOf('\\')))} disabled={!currentPath} sx={{ color: 'white' }}>
                  <UpIcon />
                </IconButton>
              </Box>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {dirs.map((dir, i) => (
                  <Button 
                    key={i} 
                    fullWidth 
                    variant="text" 
                    onClick={() => browseDirs(dir)}
                    onDoubleClick={() => handleSelectPath(dir)}
                    sx={{ justifyContent: 'flex-start', color: 'rgba(255,255,255,0.8)', textTransform: 'none', py: 1 }}
                  >
                    📁 {dir.split('\\').pop() || dir}
                  </Button>
                ))}
              </div>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setOpenBrowse(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
            <Button variant="contained" onClick={() => handleSelectPath(currentPath)} disabled={!currentPath}>Select current folder</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}

export default App;
