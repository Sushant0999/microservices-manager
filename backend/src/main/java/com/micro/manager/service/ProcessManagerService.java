package com.micro.manager.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.micro.manager.model.Project;
import com.micro.manager.model.ServiceConfig;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.io.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

@Service
public class ProcessManagerService {

    private final Map<String, Project> projects = new ConcurrentHashMap<>();
    private final Map<String, Process> activeProcesses = new ConcurrentHashMap<>();
    private final Map<String, List<String>> logs = new ConcurrentHashMap<>();
    private final Map<String, List<Consumer<String>>> logConsumers = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    
    @org.springframework.beans.factory.annotation.Value("${server.port:9009}")
    private int serverPort;
    
    private File configFile;

    @PostConstruct
    public void init() throws IOException {
        rotateLogFiles();
        loadConfigs();
    }

    private void rotateLogFiles() {
        try {
            File rootDir;
            File backendDir;
            File parentConfig = new File("../services.json");
            if (parentConfig.exists()) {
                rootDir = new File("..");
                backendDir = new File(".");
            } else {
                rootDir = new File(".");
                backendDir = new File("backend");
            }

            List<File> logFiles = new ArrayList<>();
            File[] rootFiles = rootDir.listFiles((dir, name) -> name.toLowerCase().endsWith(".log"));
            if (rootFiles != null) {
                logFiles.addAll(Arrays.asList(rootFiles));
            }
            if (backendDir.exists() && backendDir.isDirectory()) {
                File[] backendFiles = backendDir.listFiles((dir, name) -> name.toLowerCase().endsWith(".log"));
                if (backendFiles != null) {
                    for (File f : backendFiles) {
                        if (!logFiles.contains(f)) {
                            logFiles.add(f);
                        }
                    }
                }
            }

            // Sort files by last modified time in descending order (newest first)
            logFiles.sort((f1, f2) -> Long.compare(f2.lastModified(), f1.lastModified()));

            System.out.println("Found " + logFiles.size() + " log files for rotation.");
            // Keep the first 5 log files, delete the rest
            for (int i = 5; i < logFiles.size(); i++) {
                File toDelete = logFiles.get(i);
                boolean deleted = toDelete.delete();
                System.out.println("Deleting old log file: " + toDelete.getName() + " - Success: " + deleted);
            }
        } catch (Exception e) {
            System.err.println("Error rotating log files: " + e.getMessage());
        }
    }

    @jakarta.annotation.PreDestroy
    public void shutdown() {
        System.out.println("Shutting down manager, stopping all services...");
        for (String key : new HashSet<>(activeProcesses.keySet())) {
            String[] parts = key.split(":", 2);
            if (parts.length == 2) {
                stopService(parts[0], parts[1]);
            }
        }
    }

    private String getServiceKey(String projectName, String serviceName) {
        return projectName + ":" + serviceName;
    }

    public void loadConfigs() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        File parentConfig = new File("../services.json");
        File localConfig = new File("services.json");
        
        if (parentConfig.exists()) {
            configFile = parentConfig;
        } else if (localConfig.exists()) {
            configFile = localConfig;
        } else {
            configFile = parentConfig; // default fallback
        }

        if (!configFile.exists()) {
            Project defaultProject = new Project();
            defaultProject.setName("Default");
            defaultProject.setDescription("Default Project");
            projects.put("Default", defaultProject);
            saveConfigs();
            return;
        }

        try {
            Map<String, Object> rawMap = mapper.readValue(configFile, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            if (rawMap.containsKey("projects")) {
                List<Project> list = mapper.convertValue(rawMap.get("projects"), mapper.getTypeFactory().constructCollectionType(List.class, Project.class));
                list.forEach(p -> {
                    if (p.getServices() != null) {
                        p.getServices().forEach(s -> {
                            s.setStatus("STOPPED");
                            s.setProjectName(p.getName());
                        });
                    } else {
                        p.setServices(new ArrayList<>());
                    }
                    projects.put(p.getName(), p);
                });
            } else if (rawMap.containsKey("services")) {
                List<ServiceConfig> list = mapper.convertValue(rawMap.get("services"), mapper.getTypeFactory().constructCollectionType(List.class, ServiceConfig.class));
                Project defaultProject = new Project();
                defaultProject.setName("Default");
                defaultProject.setDescription("Default Project");
                list.forEach(s -> {
                    s.setStatus("STOPPED");
                    s.setProjectName("Default");
                    defaultProject.getServices().add(s);
                });
                projects.put("Default", defaultProject);
                saveConfigs();
            } else {
                Project defaultProject = new Project();
                defaultProject.setName("Default");
                defaultProject.setDescription("Default Project");
                projects.put("Default", defaultProject);
                saveConfigs();
            }
        } catch (Exception e) {
            System.err.println("Error reading configs: " + e.getMessage());
            Project defaultProject = new Project();
            defaultProject.setName("Default");
            defaultProject.setDescription("Default Project");
            projects.put("Default", defaultProject);
            saveConfigs();
        }
    }

    private synchronized void saveConfigs() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        if (configFile == null) {
            configFile = new File("../services.json");
        }
        Map<String, Collection<Project>> data = new HashMap<>();
        data.put("projects", projects.values());
        mapper.writerWithDefaultPrettyPrinter().writeValue(configFile, data);
    }

    public Collection<Project> getProjects() {
        return projects.values();
    }

    public void addProject(Project project) throws IOException {
        if (projects.containsKey(project.getName())) {
            throw new IllegalArgumentException("Project already exists: " + project.getName());
        }
        if (project.getServices() == null) {
            project.setServices(new ArrayList<>());
        }
        projects.put(project.getName(), project);
        saveConfigs();
    }

    public void updateProject(String oldName, Project project) throws IOException {
        if (!oldName.equals(project.getName()) && projects.containsKey(project.getName())) {
            throw new IllegalArgumentException("Project name already exists: " + project.getName());
        }
        
        Project existing = projects.remove(oldName);
        if (existing != null) {
            List<ServiceConfig> updatedServices = project.getServices();
            if (updatedServices != null) {
                for (ServiceConfig updated : updatedServices) {
                    ServiceConfig oldService = existing.getServices().stream()
                        .filter(s -> s.getName().equals(updated.getName()))
                        .findFirst().orElse(null);
                    if (oldService != null) {
                        updated.setStatus(oldService.getStatus());
                    } else {
                        updated.setStatus("STOPPED");
                    }
                    updated.setProjectName(project.getName());
                }
                existing.setServices(updatedServices);
            }
            existing.setName(project.getName());
            existing.setDescription(project.getDescription());
            projects.put(project.getName(), existing);
        } else {
            if (project.getServices() == null) project.setServices(new ArrayList<>());
            projects.put(project.getName(), project);
        }
        saveConfigs();
    }

    public void removeProject(String projectName) throws IOException {
        Project project = projects.remove(projectName);
        if (project != null && project.getServices() != null) {
            for (ServiceConfig s : project.getServices()) {
                stopService(projectName, s.getName());
            }
        }
        saveConfigs();
    }

    public void addService(String projectName, ServiceConfig config) throws IOException {
        Project project = projects.get(projectName);
        if (project == null) {
            throw new IllegalArgumentException("Project not found: " + projectName);
        }
        boolean exists = project.getServices().stream().anyMatch(s -> s.getName().equals(config.getName()));
        if (exists) {
            throw new IllegalArgumentException("Service already exists in project " + projectName + ": " + config.getName());
        }
        config.setStatus("STOPPED");
        config.setProjectName(projectName);
        project.getServices().add(config);
        saveConfigs();
    }

    public void updateService(String projectName, String oldServiceName, ServiceConfig config) throws IOException {
        Project project = projects.get(projectName);
        if (project == null) {
            throw new IllegalArgumentException("Project not found: " + projectName);
        }
        
        if (!oldServiceName.equals(config.getName())) {
            stopService(projectName, oldServiceName);
        }

        List<ServiceConfig> services = project.getServices();
        for (int i = 0; i < services.size(); i++) {
            if (services.get(i).getName().equals(oldServiceName)) {
                String oldStatus = services.get(i).getStatus();
                config.setStatus(oldStatus);
                config.setProjectName(projectName);
                services.set(i, config);
                break;
            }
        }
        saveConfigs();
    }

    public void removeService(String projectName, String serviceName) throws IOException {
        stopService(projectName, serviceName);
        Project project = projects.get(projectName);
        if (project != null) {
            project.getServices().removeIf(s -> s.getName().equals(serviceName));
        }
        saveConfigs();
    }

    public void startService(String projectName, String name) throws IOException {
        Project project = projects.get(projectName);
        if (project == null) return;
        ServiceConfig config = project.getServices().stream()
            .filter(s -> s.getName().equals(name))
            .findFirst().orElse(null);
        
        String key = getServiceKey(projectName, name);
        if (config == null || activeProcesses.containsKey(key)) return;

        String os = System.getProperty("os.name").toLowerCase();
        ProcessBuilder pb;
        if (os.contains("win")) {
            String startCmd = config.getStartCommand();
            if (startCmd.startsWith("./")) {
                startCmd = startCmd.substring(2);
            }
            pb = new ProcessBuilder("cmd.exe", "/c", startCmd);
        } else {
            pb = new ProcessBuilder("sh", "-c", config.getStartCommand());
        }
        
        pb.directory(new File(config.getPath()));
        pb.redirectErrorStream(true);
        
        killProcessByPort(config.getPort());
        
        Process process = pb.start();

        activeProcesses.put(key, process);
        config.setStatus("RUNNING");

        executorService.submit(() -> captureLogs(projectName, name, process));
    }

    private void captureLogs(String projectName, String name, Process process) {
        String key = getServiceKey(projectName, name);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                final String finalLine = line;
                List<String> serviceLogs = logs.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>()));
                synchronized (serviceLogs) {
                    serviceLogs.add(finalLine);
                    if (serviceLogs.size() > 1000) {
                        serviceLogs.remove(0);
                    }
                    List<Consumer<String>> consumers = logConsumers.get(key);
                    if (consumers != null) {
                        for (Consumer<String> consumer : consumers) {
                            try {
                                consumer.accept(finalLine);
                            } catch (Exception e) {
                                // ignore
                            }
                        }
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            activeProcesses.remove(key);
            Project project = projects.get(projectName);
            if (project != null) {
                ServiceConfig config = project.getServices().stream()
                    .filter(s -> s.getName().equals(name))
                    .findFirst().orElse(null);
                if (config != null) {
                    config.setStatus("STOPPED");
                    killProcessByPort(config.getPort());
                }
            }
        }
    }

    public void stopService(String projectName, String name) {
        String key = getServiceKey(projectName, name);
        Process process = activeProcesses.remove(key);
        if (process != null) {
            process.destroy();
            process.destroyForcibly();
        }
        
        Project project = projects.get(projectName);
        if (project != null) {
            ServiceConfig config = project.getServices().stream()
                .filter(s -> s.getName().equals(name))
                .findFirst().orElse(null);
            if (config != null) {
                config.setStatus("STOPPED");
                killProcessByPort(config.getPort());
            }
        }
    }

    private void killProcessByPort(int port) {
        if (port <= 0 || port == serverPort) return;
        String os = System.getProperty("os.name").toLowerCase();
        try {
            if (os.contains("win")) {
                ProcessBuilder pb = new ProcessBuilder("cmd.exe", "/c", "netstat -ano | findstr LISTENING | findstr :" + port);
                Process p = pb.start();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    Set<String> pids = new HashSet<>();
                    while ((line = reader.readLine()) != null) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty()) continue;
                        
                        String[] parts = trimmed.split("\\s+");
                        if (parts.length >= 5) {
                            String localAddr = parts[1];
                            String pid = parts[parts.length - 1];
                            
                            if (localAddr.endsWith(":" + port) && pid.matches("\\d+")) {
                                pids.add(pid);
                            }
                        }
                    }
                    
                    if (!pids.isEmpty()) {
                        System.out.println("Killing processes on port " + port + ": " + pids);
                        for (String pid : pids) {
                            new ProcessBuilder("taskkill", "/F", "/PID", pid, "/T").start().waitFor();
                        }
                    }
                }
            } else {
                new ProcessBuilder("sh", "-c", "lsof -ti tcp:" + port + " | xargs kill -9").start().waitFor();
            }
        } catch (Exception e) {
            System.err.println("Failed to kill process on port " + port + ": " + e.getMessage());
        }
    }

    public List<String> getLogs(String projectName, String name) {
        String key = getServiceKey(projectName, name);
        return logs.getOrDefault(key, Collections.emptyList());
    }

    public void addLogConsumer(String projectName, String name, Consumer<String> consumer) {
        String key = getServiceKey(projectName, name);
        List<String> serviceLogs = logs.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>()));
        synchronized (serviceLogs) {
            for (String log : serviceLogs) {
                try {
                    consumer.accept(log);
                } catch (Exception e) {
                    // ignore
                }
            }
            logConsumers.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>()).add(consumer);
        }
    }

    public void removeLogConsumer(String projectName, String name, Consumer<String> consumer) {
        String key = getServiceKey(projectName, name);
        List<Consumer<String>> consumers = logConsumers.get(key);
        if (consumers != null) {
            consumers.remove(consumer);
        }
    }

    public void rebuildService(String projectName, String name) throws IOException, InterruptedException {
        Project project = projects.get(projectName);
        if (project == null) return;
        ServiceConfig config = project.getServices().stream()
            .filter(s -> s.getName().equals(name))
            .findFirst().orElse(null);
            
        if (config == null || config.getRebuildCommand() == null || config.getRebuildCommand().isEmpty()) return;

        stopService(projectName, name);
        config.setStatus("REBUILDING");

        String os = System.getProperty("os.name").toLowerCase();
        ProcessBuilder pb;
        if (os.contains("win")) {
            String rebuildCmd = config.getRebuildCommand();
            if (rebuildCmd.startsWith("./")) {
                rebuildCmd = rebuildCmd.substring(2);
            }
            pb = new ProcessBuilder("cmd.exe", "/c", rebuildCmd);
        } else {
            pb = new ProcessBuilder("sh", "-c", config.getRebuildCommand());
        }
        
        pb.directory(new File(config.getPath()));
        pb.redirectErrorStream(true);
        Process process = pb.start();

        String key = getServiceKey(projectName, name);
        activeProcesses.put(key, process);
        logs.put(key, Collections.synchronizedList(new ArrayList<>()));
        executorService.submit(() -> captureLogs(projectName, name, process));
    }
}
