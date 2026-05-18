package com.micro.manager.controller;

import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/fs")
@CrossOrigin(origins = "*")
public class FileBrowserController {

    @GetMapping("/browse")
    public List<String> browse(@RequestParam(required = false) String path) {
        if (path == null || path.isEmpty()) {
            return Stream.of(File.listRoots())
                    .map(File::getAbsolutePath)
                    .collect(Collectors.toList());
        }
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) return new ArrayList<>();

        File[] files = dir.listFiles(File::isDirectory);
        if (files == null) return new ArrayList<>();

        return Stream.of(files)
                .map(File::getAbsolutePath)
                .collect(Collectors.toList());
    }

    @GetMapping("/suggest-commands")
    public List<String> suggestCommands(@RequestParam String path) {
        File dir = new File(path);
        List<String> commands = new ArrayList<>();
        if (!dir.exists() || !dir.isDirectory()) return commands;

        if (new File(dir, "pom.xml").exists()) {
            commands.add("mvn spring-boot:run");
            commands.add("mvn clean install -DskipTests");
            commands.add("mvn test");
            commands.add("mvn package -DskipTests");
        } 
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) {
            commands.add("./gradlew bootRun");
            commands.add("./gradlew build -x test");
            commands.add("./gradlew test");
            commands.add("./gradlew clean build");
        }
        if (new File(dir, "package.json").exists()) {
            commands.add("npm run start");
            commands.add("npm run dev");
            commands.add("npm install");
            commands.add("npm run build");
        }
        
        if (commands.isEmpty()) {
            commands.add("powershell.exe /c echo 'No command suggested'");
        }
        return commands;
    }

    @GetMapping("/suggest-rebuild-commands")
    public List<String> suggestRebuildCommands(@RequestParam String path) {
        File dir = new File(path);
        List<String> commands = new ArrayList<>();
        if (!dir.exists() || !dir.isDirectory()) return commands;

        if (new File(dir, "pom.xml").exists()) {
            commands.add("mvn clean install -DskipTests");
            commands.add("mvn clean package -DskipTests");
            commands.add("mvn clean install");
        } 
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) {
            commands.add("./gradlew clean build -x test");
            commands.add("./gradlew clean build");
            commands.add("./gradlew clean assemble");
        }
        if (new File(dir, "package.json").exists()) {
            commands.add("npm install && npm run build");
            commands.add("npm ci && npm run build");
            commands.add("npm run build");
        }
        
        if (commands.isEmpty()) {
            commands.add("powershell.exe /c echo 'No rebuild command suggested'");
        }
        return commands;
    }

    @GetMapping("/suggest-port")
    public Integer suggestPort(@RequestParam String path) {
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) return 8080;

        File resourcesDir = new File(dir, "src/main/resources");
        if (!resourcesDir.exists()) return 8080;

        String[] extensions = {"properties", "yml", "yaml"};
        for (String ext : extensions) {
            File appFile = new File(resourcesDir, "application." + ext);
            if (appFile.exists()) {
                try {
                    List<String> lines = java.nio.file.Files.readAllLines(appFile.toPath());
                    for (String line : lines) {
                        String trimmed = line.trim();
                        // Support both application.properties and application.yml syntax
                        if (trimmed.startsWith("server.port") && (trimmed.contains("=") || trimmed.contains(":"))) {
                            String[] parts = trimmed.split("[=:]", 2);
                            if (parts.length > 1) {
                                return Integer.parseInt(parts[1].trim());
                            }
                        }
                    }
                } catch (Exception e) {
                    // Ignore
                }
            }
        }
        return 8080;
    }
}
