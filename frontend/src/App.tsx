import { useEffect, useState, useRef, memo } from 'react';
import { 
  Box, Container, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, Stack,
  CircularProgress, Tooltip, TextField, DialogActions, Autocomplete, Grid,
  ToggleButton, ToggleButtonGroup
} from '@mui/material';
import { 
  PlayArrow as PlayIcon, Stop as StopIcon, Refresh as RefreshIcon, 
  Build as BuildIcon, Terminal as LogIcon, FiberManualRecord as StatusIcon,
  Add as AddIcon, Delete as DeleteIcon, FolderOpen as BrowseIcon, 
  Edit as EditIcon, ArrowUpward as UpIcon,
  Launch as LaunchIcon, GridView as GridIcon, List as ListIcon
} from '@mui/icons-material';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface Service {
  name: string;
  projectName?: string;
  path: string;
  port: number;
  status: string;
  startCommand: string;
  rebuildCommand?: string;
}

const getLogColor = (log: string) => {
  const upperLog = log.toUpperCase();
  if (upperLog.includes('ERROR') || upperLog.includes('EXCEPTION') || upperLog.includes('FAIL')) return '#ef4444';
  if (upperLog.includes('WARN')) return '#f59e0b';
  if (upperLog.includes('INFO') || upperLog.includes('SUCCESS') || upperLog.includes('OK')) return '#e2e8f0';
  if (upperLog.includes('DEBUG')) return '#94a3b8';
  return 'rgba(255,255,255,0.7)';
};

const LogCard = memo(({ service, onAction }: { service: Service, onAction: (name: string, action: string) => void }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/services/${service.name}/logs`);
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev.slice(-99), event.data]);
    };
    return () => eventSource.close();
  }, [service.name]);

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
            <IconButton size="small" color="success" onClick={() => onAction(service.name, 'start')} disabled={service.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
              <PlayIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Stop">
            <IconButton size="small" color="error" onClick={() => onAction(service.name, 'stop')} disabled={service.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
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
  const [services, setServices] = useState<Service[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [selectedLogService, setSelectedLogService] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [openBrowse, setOpenBrowse] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [dirs, setDirs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [formData, setFormData] = useState<Service>({ name: '', projectName: 'Default', path: '', port: 8080, startCommand: '', rebuildCommand: '', status: 'STOPPED' });
  const [suggestedCommands, setSuggestedCommands] = useState<string[]>([]);
  const [suggestedRebuildCommands, setSuggestedRebuildCommands] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const projects = ['All', ...Array.from(new Set(services.map(s => s.projectName || 'Default')))];
  const filteredServices = selectedProject === 'All' ? services : services.filter(s => (s.projectName || 'Default') === selectedProject);

  const fetchServices = async () => {
    try {
      const { data } = await axios.get('/api/services');
      setServices(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch services', err);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleAction = async (serviceName: string, action: string) => {
    try {
      await axios.post(`/api/services/${serviceName}/${action}`);
      fetchServices();
    } catch (err) {
      console.error(`Action ${action} failed for ${serviceName}`, err);
    }
  };

  const openLogs = (serviceName: string) => {
    setSelectedLogService(serviceName);
    setLogs([]);
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/services/${serviceName}/logs`);
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev.slice(-999), event.data]);
    };
    eventSourceRef.current = eventSource;
  };

  const handleSaveService = async () => {
    try {
      if (editingService) {
        await axios.put(`/api/services/${editingService}`, formData);
      } else {
        await axios.post('/api/services', formData);
      }
      setOpenForm(false);
      resetForm();
      fetchServices();
    } catch (err) {
      console.error('Failed to save service', err);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', projectName: selectedProject !== 'All' ? selectedProject : 'Default', path: '', port: 8080, startCommand: '', rebuildCommand: '', status: 'STOPPED' });
    setEditingService(null);
    setSuggestedCommands([]);
    setSuggestedRebuildCommands([]);
  };

  const startEdit = (service: Service) => {
    setFormData(service);
    setEditingService(service.name);
    setOpenForm(true);
    fetchSuggestions(service.path);
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

  const handleDeleteService = async (name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name}?`)) {
      try {
        await axios.delete(`/api/services/${name}`);
        fetchServices();
      } catch (err) {
        console.error('Failed to remove service', err);
      }
    }
  };

  const closeLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setSelectedLogService(null);
  };

  const startAll = async () => {
    const promises = filteredServices
      .filter(s => s.status !== 'RUNNING')
      .map(s => axios.post(`/api/services/${s.name}/start`));
    await Promise.allSettled(promises);
    fetchServices();
  };

  const stopAll = async () => {
    const promises = filteredServices
      .filter(s => s.status === 'RUNNING')
      .map(s => axios.post(`/api/services/${s.name}/stop`));
    await Promise.allSettled(promises);
    fetchServices();
  };

  return (
    <Box sx={{ minHeight: '100vh', py: 4, background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
      <Container maxWidth="lg">
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
          <Typography variant="h3" sx={{ fontWeight: 800, color: 'white', letterSpacing: -1 }}>
            Microservices <Box component="span" sx={{ color: 'primary.main' }}>Manager</Box>
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Autocomplete
              size="small"
              options={projects}
              value={selectedProject}
              onChange={(_, newValue) => newValue && setSelectedProject(newValue)}
              disableClearable
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  placeholder="Select Project"
                  variant="outlined" 
                  sx={{ 
                    minWidth: 150, 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: 2, 
                    '& .MuiInputBase-input': { color: 'white' },
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '& .MuiSvgIcon-root': { color: 'white' }
                  }} 
                />
              )}
            />
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { resetForm(); setOpenForm(true); }} sx={{ borderRadius: 2 }}>
              Add Service
            </Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchServices} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        <AnimatePresence mode="wait">
          {viewMode === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Paper sx={{ 
                background: 'rgba(30, 41, 59, 0.7)', 
                backdropFilter: 'blur(10px)',
                borderRadius: 4, 
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)' 
              }}>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ background: 'rgba(255,255,255,0.05)' }}>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>SERVICE NAME</TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>PORT</TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>STATUS</TableCell>
                        <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }} align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                            <span>ACTIONS</span>
                            <Tooltip title="Start All">
                               <IconButton size="small" onClick={startAll} sx={{ color: 'success.main', background: 'rgba(76, 175, 80, 0.1)', p: 0.5 }}>
                                 <PlayIcon sx={{ fontSize: 16 }} />
                               </IconButton>
                            </Tooltip>
                            <Tooltip title="Stop All">
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
                        <TableRow><TableCell colSpan={4} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
                      ) : filteredServices.map((service) => (
                        <TableRow key={service.name} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          <TableCell sx={{ color: 'white', fontWeight: 500 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              {service.name}
                              {service.status === 'RUNNING' && (
                                <Tooltip title="Open in Browser">
                                  <IconButton size="small" sx={{ color: 'primary.main', p: 0.5 }} onClick={() => window.open(`http://localhost:${service.port}`, '_blank')}>
                                    <LaunchIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                            <code>{service.port}</code>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              icon={<StatusIcon sx={{ fontSize: '10px !important' }} />}
                              label={service.status} 
                              size="small"
                              color={service.status === 'RUNNING' ? 'success' : (service.status === 'STOPPED' ? 'default' : 'warning')} 
                              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Start">
                                <IconButton size="small" color="success" onClick={() => handleAction(service.name, 'start')} disabled={service.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
                                  <PlayIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Stop">
                                <IconButton size="small" color="error" onClick={() => handleAction(service.name, 'stop')} disabled={service.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
                                  <StopIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Restart">
                                <IconButton size="small" color="info" onClick={() => handleAction(service.name, 'restart')} sx={{ background: 'rgba(3, 169, 244, 0.1)' }}>
                                  <RefreshIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit">
                                <IconButton size="small" color="warning" onClick={() => startEdit(service)} sx={{ background: 'rgba(255, 152, 0, 0.1)' }}>
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Clean & Rebuild">
                                <IconButton size="small" sx={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} disabled={!service.rebuildCommand} onClick={() => handleAction(service.name, 'rebuild')}>
                                  <BuildIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="View Logs">
                                <IconButton size="small" sx={{ background: 'rgba(99, 102, 241, 0.1)', color: 'primary.main' }} onClick={() => openLogs(service.name)}>
                                  <LogIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Remove Service">
                                <IconButton size="small" color="error" sx={{ background: 'rgba(244, 67, 54, 0.05)' }} onClick={() => handleDeleteService(service.name)}>
                                  <DeleteIcon />
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Grid container spacing={3}>
                {filteredServices.map((service) => (
                  <Grid item xs={12} md={6} key={service.name}>
                    <LogCard service={service} onAction={handleAction} />
                  </Grid>
                ))}
              </Grid>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logs Dialog */}
        <Dialog 
          open={!!selectedLogService} 
          onClose={closeLogs}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { background: '#020617', borderRadius: 4, color: 'white' } }}
        >
          <DialogTitle sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <LogIcon sx={{ color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Logs: {selectedLogService}</Typography>
              {(() => {
                const s = services.find(s => s.name === selectedLogService);
                if (!s) return null;
                return (
                  <Chip 
                    icon={<StatusIcon sx={{ fontSize: '10px !important' }} />}
                    label={s.status} 
                    size="small"
                    color={s.status === 'RUNNING' ? 'success' : (s.status === 'STOPPED' ? 'default' : 'warning')} 
                    sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, ml: 2 }}
                  />
                );
              })()}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {(() => {
                const s = services.find(s => s.name === selectedLogService);
                if (!s) return null;
                return (
                  <Stack direction="row" spacing={0.5} sx={{ mr: 2 }}>
                    <Tooltip title="Start">
                      <IconButton size="small" color="success" onClick={() => handleAction(s.name, 'start')} disabled={s.status === 'RUNNING'} sx={{ background: 'rgba(76, 175, 80, 0.1)' }}>
                        <PlayIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Stop">
                      <IconButton size="small" color="error" onClick={() => handleAction(s.name, 'stop')} disabled={s.status === 'STOPPED'} sx={{ background: 'rgba(244, 67, 54, 0.1)' }}>
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

        {/* Form Dialog */}
        <Dialog open={openForm} onClose={() => setOpenForm(false)} PaperProps={{ sx: { background: '#1e293b', color: 'white', borderRadius: 4 } }}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editingService ? 'Edit Microservice' : 'Add New Microservice'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1, minWidth: '400px' }}>
              <TextField 
                label="Service Name" 
                fullWidth 
                variant="filled" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
              />
              <Autocomplete
                freeSolo
                options={projects.filter(p => p !== 'All')}
                value={formData.projectName || 'Default'}
                onChange={(_, newValue) => setFormData({ ...formData, projectName: newValue || 'Default' })}
                onInputChange={(_, newInputValue) => setFormData({ ...formData, projectName: newInputValue || 'Default' })}
                renderInput={(params) => (
                  <TextField 
                    {...params}
                    label="Project Name" 
                    fullWidth 
                    variant="filled" 
                    sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
                  />
                )}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField 
                  label="Project Path" 
                  fullWidth 
                  variant="filled" 
                  value={formData.path}
                  onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                  sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
                />
                <Button 
                  variant="outlined" 
                  onClick={() => browseDirs(formData.path || '')}
                  sx={{ minWidth: 'auto', px: 2, height: '56px', borderColor: 'rgba(255,255,255,0.1)' }}
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
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
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
                    sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
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
                    sx={{ background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
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
            <Button variant="contained" onClick={handleSaveService} sx={{ borderRadius: 2 }}>{editingService ? 'Update Service' : 'Save Service'}</Button>
          </DialogActions>
        </Dialog>

        {/* Directory Browser */}
        <Dialog open={openBrowse} onClose={() => setOpenBrowse(false)} PaperProps={{ sx: { background: '#020617', color: 'white', borderRadius: 4, minWidth: '500px' } }}>
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
                <IconButton size="small" onClick={() => browseDirs(currentPath.substring(0, currentPath.lastIndexOf('\\')))} disabled={!currentPath}>
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

