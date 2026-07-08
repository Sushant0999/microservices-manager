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
        String startCmd = config.getStartCommand();

        // Inject the selected properties/config file into the start command (if specified)
        String propsFile = config.getActivePropertiesFile();
        boolean hasPropsFile = propsFile != null && !propsFile.trim().isEmpty();

        ProcessBuilder pb;
        if (os.contains("win")) {
            if (startCmd.startsWith("./")) {
                startCmd = startCmd.substring(2);
            }
            if (hasPropsFile) {
                startCmd = injectPropertiesFile(startCmd, propsFile);
            }
            pb = new ProcessBuilder("cmd.exe", "/c", startCmd);
        } else {
            if (hasPropsFile) {
                startCmd = injectPropertiesFile(startCmd, propsFile);
            }
            pb = new ProcessBuilder("sh", "-c", startCmd);
        }

        pb.directory(new File(config.getPath()));
        pb.redirectErrorStream(true);

        // Set CONFIG_FILE env var as a universal fallback so any script can read it
        if (hasPropsFile) {
            pb.environment().put("CONFIG_FILE", propsFile);
            pb.environment().put("SPRING_CONFIG_LOCATION", "file:" + propsFile);
        }

        
        killProcessByPort(config.getPort());
        waitForPortFree(config.getPort());
        
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

    /**
     * Appends the selected properties/config file to the start command in a
     * framework-aware manner:
     *   - Spring Boot (mvn / gradlew / java -jar): --spring.config.location=file:<path>
     *   - uvicorn: --env-file <path>
     *   - generic: appended as --config <path> (most CLIs accept this)
     */
    private String injectPropertiesFile(String cmd, String propsFile) {
        String lower = cmd.toLowerCase();
        // Spring Boot via Maven or Gradle wrapper
        if (lower.contains("mvn") || lower.contains("gradlew") || lower.contains("gradle")) {
            return cmd + " --spring.config.location=file:" + propsFile;
        }
        // Plain java -jar
        if (lower.contains("java ") && lower.contains(".jar")) {
            return cmd + " --spring.config.location=file:" + propsFile;
        }
        // uvicorn (FastAPI)
        if (lower.contains("uvicorn")) {
            return cmd + " --env-file " + propsFile;
        }
        // Generic fallback — pass as --config (many CLIs accept this)
        return cmd + " --config " + propsFile;
    }



    /**
     * Kills all processes listening on the given port.
     * Retries up to MAX_KILL_RETRIES times, waiting KILL_RETRY_DELAY_MS between
     * attempts, to handle cases where the OS needs a moment to release the port.
     */
    private static final int MAX_KILL_RETRIES   = 3;
    private static final int KILL_RETRY_DELAY_MS = 400;

    private void killProcessByPort(int port) {
        if (port <= 0 || port == serverPort) return;
        String os = System.getProperty("os.name").toLowerCase();

        for (int attempt = 1; attempt <= MAX_KILL_RETRIES; attempt++) {
            try {
                boolean killed = false;
                if (os.contains("win")) {
                    // Use PowerShell to grab PIDs — handles 0.0.0.0, 127.0.0.1, ::1 bindings
                    String psCmd = "(Get-NetTCPConnection -LocalPort " + port
                            + " -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique";
                    ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-NoProfile", "-Command", psCmd);
                    pb.redirectErrorStream(true);
                    Process p = pb.start();
                    Set<String> pids = new HashSet<>();
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            String trimmed = line.trim();
                            if (trimmed.matches("\\d+")) pids.add(trimmed);
                        }
                    }
                    p.waitFor();

                    if (!pids.isEmpty()) {
                        System.out.println("[KillPort] Attempt " + attempt + ": killing PIDs " + pids + " on port " + port);
                        for (String pid : pids) {
                            new ProcessBuilder("taskkill", "/F", "/PID", pid, "/T").start().waitFor();
                        }
                        killed = true;
                    }
                } else {
                    // Unix: lsof may return multiple PIDs
                    ProcessBuilder pb = new ProcessBuilder("sh", "-c", "lsof -ti tcp:" + port);
                    pb.redirectErrorStream(true);
                    Process p = pb.start();
                    Set<String> pids = new HashSet<>();
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            String trimmed = line.trim();
                            if (trimmed.matches("\\d+")) pids.add(trimmed);
                        }
                    }
                    p.waitFor();

                    if (!pids.isEmpty()) {
                        System.out.println("[KillPort] Attempt " + attempt + ": killing PIDs " + pids + " on port " + port);
                        new ProcessBuilder("sh", "-c", "kill -9 " + String.join(" ", pids)).start().waitFor();
                        killed = true;
                    }
                }

                if (!killed) {
                    System.out.println("[KillPort] Port " + port + " is free (no process found on attempt " + attempt + ")");
                    return; // nothing to kill
                }

                // Give the OS a moment to release the port before the next check/attempt
                Thread.sleep(KILL_RETRY_DELAY_MS);

                // If port is already free, stop retrying
                if (isPortFree(port)) {
                    System.out.println("[KillPort] Port " + port + " confirmed free after attempt " + attempt);
                    return;
                }

            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                System.err.println("[KillPort] Error on attempt " + attempt + " for port " + port + ": " + e.getMessage());
            }
        }
        System.err.println("[KillPort] Could not fully free port " + port + " after " + MAX_KILL_RETRIES + " attempts");
    }

    /**
     * Blocks until the port is free (confirmed via ServerSocket) or the timeout
     * elapses (max 3 s). Called after killProcessByPort before launching the process.
     */
    private void waitForPortFree(int port) {
        if (port <= 0 || port == serverPort) return;
        int maxWaitMs  = 3000;
        int pollMs     = 250;
        int elapsed    = 0;
        while (elapsed < maxWaitMs) {
            if (isPortFree(port)) {
                System.out.println("[KillPort] Port " + port + " is free, proceeding to start.");
                return;
            }
            try {
                Thread.sleep(pollMs);
                elapsed += pollMs;
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        System.err.println("[KillPort] Port " + port + " still not free after " + maxWaitMs + " ms — starting anyway.");
    }

    /** Returns true if a ServerSocket can bind to the given port (i.e., nothing is listening). */
    private boolean isPortFree(int port) {
        try (java.net.ServerSocket ss = new java.net.ServerSocket()) {
            ss.setReuseAddress(true);
            ss.bind(new java.net.InetSocketAddress(port));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public List<String> getLogs(String projectName, String name) {
        String key = getServiceKey(projectName, name);
        return logs.getOrDefault(key, Collections.emptyList());
    }

    public void addLogConsumer(String projectName, String name, Consumer<String> consumer) {
        String key = getServiceKey(projectName, name);
        List<String> serviceLogs = logs.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>()));
        
        executorService.submit(() -> {
            // Give Spring Boot a moment to return the emitter and establish the HTTP/SSE connection
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            
            synchronized (serviceLogs) {
                for (String log : serviceLogs) {
                    try {
                        consumer.accept(log);
                    } catch (Exception e) {
                        return; // connection closed/broken, abort registration
                    }
                }
                logConsumers.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>()).add(consumer);
            }
        });
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
