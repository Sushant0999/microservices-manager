package com.micro.manager.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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

    private final Map<String, Process> activeProcesses = new ConcurrentHashMap<>();
    private final Map<String, List<String>> logs = new ConcurrentHashMap<>();
    private final Map<String, List<Consumer<String>>> logConsumers = new ConcurrentHashMap<>();
    private final Map<String, ServiceConfig> serviceConfigs = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    
    @org.springframework.beans.factory.annotation.Value("${server.port:9009}")
    private int serverPort;

    @PostConstruct
    public void init() throws IOException {
        loadConfigs();
    }

    @jakarta.annotation.PreDestroy
    public void shutdown() {
        System.out.println("Shutting down manager, stopping all services...");
        for (String name : new HashSet<>(activeProcesses.keySet())) {
            stopService(name);
        }
    }

    public void loadConfigs() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        File configFile = new File("../services.json");
        if (configFile.exists()) {
            Map<String, List<ServiceConfig>> data = mapper.readValue(configFile, new com.fasterxml.jackson.core.type.TypeReference<Map<String, List<ServiceConfig>>>() {});
            if (data != null && data.get("services") != null) {
                List<ServiceConfig> list = mapper.convertValue(data.get("services"), mapper.getTypeFactory().constructCollectionType(List.class, ServiceConfig.class));
                list.forEach(s -> {
                    s.setStatus("STOPPED");
                    serviceConfigs.put(s.getName(), s);
                });
            }
        }
    }

    private void saveConfigs() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        File configFile = new File("../services.json");
        Map<String, Collection<ServiceConfig>> data = new HashMap<>();
        data.put("services", serviceConfigs.values());
        mapper.writerWithDefaultPrettyPrinter().writeValue(configFile, data);
    }

    public void addService(ServiceConfig config) throws IOException {
        serviceConfigs.put(config.getName(), config);
        saveConfigs();
    }

    public void updateService(String oldName, ServiceConfig config) throws IOException {
        if (!oldName.equals(config.getName())) {
            serviceConfigs.remove(oldName);
        }
        serviceConfigs.put(config.getName(), config);
        saveConfigs();
    }

    public void removeService(String name) throws IOException {
        stopService(name);
        serviceConfigs.remove(name);
        saveConfigs();
    }

    public Collection<ServiceConfig> getServices() {
        return serviceConfigs.values();
    }

    public void startService(String name) throws IOException {
        ServiceConfig config = serviceConfigs.get(name);
        if (config == null || activeProcesses.containsKey(name)) return;

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
        
        // Ensure port is free before starting
        killProcessByPort(config.getPort());
        
        Process process = pb.start();

        activeProcesses.put(name, process);
        config.setStatus("RUNNING");

        executorService.submit(() -> captureLogs(name, process));
    }

    private void captureLogs(String name, Process process) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                final String finalLine = line;
                logs.computeIfAbsent(name, k -> Collections.synchronizedList(new ArrayList<>())).add(finalLine);
                // Keep only last 1000 lines
                if (logs.get(name).size() > 1000) {
                    logs.get(name).remove(0);
                }
                List<Consumer<String>> consumers = logConsumers.get(name);
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
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            activeProcesses.remove(name);
            ServiceConfig config = serviceConfigs.get(name);
            if (config != null) {
                config.setStatus("STOPPED");
                killProcessByPort(config.getPort());
            }
        }
    }

    public void stopService(String name) {
        Process process = activeProcesses.remove(name);
        if (process != null) {
            process.destroy();
            // Try to destroy the whole process tree if possible
            process.destroyForcibly();
        }
        
        ServiceConfig config = serviceConfigs.get(name);
        if (config != null) {
            config.setStatus("STOPPED");
            killProcessByPort(config.getPort());
        }
    }

    private void killProcessByPort(int port) {
        if (port <= 0 || port == serverPort) return;
        String os = System.getProperty("os.name").toLowerCase();
        try {
            if (os.contains("win")) {
                // More robust port-to-PID lookup on Windows
                ProcessBuilder pb = new ProcessBuilder("cmd.exe", "/c", "netstat -ano | findstr LISTENING | findstr :" + port);
                Process p = pb.start();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    Set<String> pids = new HashSet<>();
                    while ((line = reader.readLine()) != null) {
                        // Line example: TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       1234
                        String trimmed = line.trim();
                        if (trimmed.isEmpty()) continue;
                        
                        String[] parts = trimmed.split("\\s+");
                        if (parts.length >= 5) {
                            String localAddr = parts[1]; // e.g. 0.0.0.0:8080
                            String pid = parts[parts.length - 1];
                            
                            // Ensure we match the exact port, not just a substring
                            if (localAddr.endsWith(":" + port) && pid.matches("\\d+")) {
                                pids.add(pid);
                            }
                        }
                    }
                    
                    if (!pids.isEmpty()) {
                        System.out.println("Killing processes on port " + port + ": " + pids);
                        for (String pid : pids) {
                            // Kill process and all its children (/T) forcibly (/F)
                            new ProcessBuilder("taskkill", "/F", "/PID", pid, "/T").start().waitFor();
                        }
                    }
                }
            } else {
                // Linux/Mac: fuser -k PORT/tcp or lsof
                new ProcessBuilder("sh", "-c", "lsof -ti tcp:" + port + " | xargs kill -9").start().waitFor();
            }
        } catch (Exception e) {
            System.err.println("Failed to kill process on port " + port + ": " + e.getMessage());
        }
    }

    public List<String> getLogs(String name) {
        return logs.getOrDefault(name, Collections.emptyList());
    }

    public void addLogConsumer(String name, Consumer<String> consumer) {
        logConsumers.computeIfAbsent(name, k -> new CopyOnWriteArrayList<>()).add(consumer);
        List<String> existingLogs = getLogs(name);
        String[] copy;
        synchronized(existingLogs) {
            copy = existingLogs.toArray(new String[0]);
        }
        for (String log : copy) {
            try {
                consumer.accept(log);
            } catch (Exception e) {}
        }
    }

    public void removeLogConsumer(String name, Consumer<String> consumer) {
        List<Consumer<String>> consumers = logConsumers.get(name);
        if (consumers != null) {
            consumers.remove(consumer);
        }
    }

    public void rebuildService(String name) throws IOException, InterruptedException {
        ServiceConfig config = serviceConfigs.get(name);
        if (config == null || config.getRebuildCommand() == null || config.getRebuildCommand().isEmpty()) return;

        stopService(name);
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

        activeProcesses.put(name, process);
        logs.put(name, Collections.synchronizedList(new ArrayList<>()));
        executorService.submit(() -> captureLogs(name, process));
    }
}
