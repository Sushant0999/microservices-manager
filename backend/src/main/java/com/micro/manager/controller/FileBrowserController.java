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

    // ──────────────────────────────────────────────────────────────────────────
    //  Directory browser
    // ──────────────────────────────────────────────────────────────────────────

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

    // ──────────────────────────────────────────────────────────────────────────
    //  Properties / config file lister
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/list-properties")
    public List<String> listProperties(@RequestParam String path) {
        File dir = new File(path);
        List<String> result = new ArrayList<>();
        if (!dir.exists() || !dir.isDirectory()) return result;

        // Directories to scan (root + Spring Boot resources dir)
        List<File> scanDirs = new ArrayList<>();
        scanDirs.add(dir);
        File resourcesDir = new File(dir, "src/main/resources");
        if (resourcesDir.exists() && resourcesDir.isDirectory()) {
            scanDirs.add(resourcesDir);
        }

        for (File scanDir : scanDirs) {
            File[] files = scanDir.listFiles(f ->
                    f.isFile() && (
                            f.getName().endsWith(".properties") ||
                            f.getName().endsWith(".yml") ||
                            f.getName().endsWith(".yaml") ||
                            f.getName().equals(".env") ||
                            f.getName().startsWith(".env.")
                    )
            );
            if (files != null) {
                for (File f : files) {
                    result.add(f.getAbsolutePath());
                }
            }
        }

        java.util.Collections.sort(result);
        return result;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Start-command suggestions
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/suggest-commands")
    public List<String> suggestCommands(@RequestParam String path) {
        File dir = new File(path);
        List<String> commands = new ArrayList<>();
        if (!dir.exists() || !dir.isDirectory()) return commands;

        boolean isWindows = isWindows();

        // ── Java: Maven ──────────────────────────────────────────────────────
        if (new File(dir, "pom.xml").exists()) {
            commands.add("mvn spring-boot:run");
            commands.add("mvn clean install -DskipTests");
            commands.add("mvn test");
            commands.add("mvn package -DskipTests");
        }

        // ── Java: Gradle ─────────────────────────────────────────────────────
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) {
            commands.add(isWindows ? "gradlew.bat bootRun" : "./gradlew bootRun");
            commands.add(isWindows ? "gradlew.bat build -x test" : "./gradlew build -x test");
            commands.add(isWindows ? "gradlew.bat clean build" : "./gradlew clean build");
        }

        // ── Angular (check before generic package.json) ───────────────────────
        if (new File(dir, "angular.json").exists()) {
            commands.add("ng serve");
            commands.add("ng serve --open");
            commands.add("ng serve --port 4200");
            commands.add("npx ng serve");
        }
        // ── React + Vite ─────────────────────────────────────────────────────
        else if (new File(dir, "package.json").exists() && isViteProject(dir)) {
            commands.add("npm run dev");
            commands.add("npm run start");
            commands.add("npx vite");
        }
        // ── React (CRA or generic React) ─────────────────────────────────────
        else if (new File(dir, "package.json").exists() && isReactProject(dir)) {
            commands.add("npm run start");
            commands.add("npm run dev");
            commands.add("npx react-scripts start");
        }
        // ── Generic Node / package.json ───────────────────────────────────────
        else if (new File(dir, "package.json").exists()) {
            commands.add("npm run start");
            commands.add("npm run dev");
            commands.add("npm install");
            commands.add("npm run build");
        }

        // ── Python with venv ─────────────────────────────────────────────────
        String venvPath = detectVenvDir(dir);
        if (venvPath != null) {
            String pythonExe  = isWindows ? venvPath + "\\Scripts\\python"   : venvPath + "/bin/python";
            String uvicornExe = isWindows ? venvPath + "\\Scripts\\uvicorn"  : venvPath + "/bin/uvicorn";
            String flaskExe   = isWindows ? venvPath + "\\Scripts\\flask"    : venvPath + "/bin/flask";

            if (new File(dir, "main.py").exists())   commands.add(pythonExe + " main.py");
            if (new File(dir, "app.py").exists())    commands.add(pythonExe + " app.py");
            if (new File(dir, "run.py").exists())    commands.add(pythonExe + " run.py");

            if (hasFastApiDep(dir)) {
                commands.add(uvicornExe + " app:app --reload");
                commands.add(uvicornExe + " main:app --reload");
            }
            if (hasFlaskDep(dir)) {
                commands.add(flaskExe + " run");
                commands.add(flaskExe + " run --host=0.0.0.0");
            }
            // Fallback if nothing was added
            if (commands.isEmpty()) commands.add(pythonExe + " main.py");
        }
        // ── Python without venv ───────────────────────────────────────────────
        else if (isPythonProject(dir)) {
            if (new File(dir, "main.py").exists()) commands.add("python main.py");
            if (new File(dir, "app.py").exists())  commands.add("python app.py");
            if (new File(dir, "run.py").exists())  commands.add("python run.py");

            if (hasFastApiDep(dir)) {
                commands.add("uvicorn app:app --reload");
                commands.add("uvicorn main:app --reload");
            }
            if (hasFlaskDep(dir)) {
                commands.add("flask run");
                commands.add("flask run --host=0.0.0.0");
            }
            if (commands.isEmpty()) {
                commands.add("python main.py");
                commands.add("python app.py");
            }
        }

        if (commands.isEmpty()) {
            commands.add("echo No command suggested");
        }
        return commands;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Rebuild-command suggestions
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/suggest-rebuild-commands")
    public List<String> suggestRebuildCommands(@RequestParam String path) {
        File dir = new File(path);
        List<String> commands = new ArrayList<>();
        if (!dir.exists() || !dir.isDirectory()) return commands;

        boolean isWindows = isWindows();

        // ── Java: Maven ──────────────────────────────────────────────────────
        if (new File(dir, "pom.xml").exists()) {
            commands.add("mvn clean install -DskipTests");
            commands.add("mvn clean package -DskipTests");
            commands.add("mvn clean install");
        }

        // ── Java: Gradle ─────────────────────────────────────────────────────
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) {
            commands.add(isWindows ? "gradlew.bat clean build -x test" : "./gradlew clean build -x test");
            commands.add(isWindows ? "gradlew.bat clean build"         : "./gradlew clean build");
            commands.add(isWindows ? "gradlew.bat clean assemble"      : "./gradlew clean assemble");
        }

        // ── Angular ───────────────────────────────────────────────────────────
        if (new File(dir, "angular.json").exists()) {
            commands.add("npm install && ng build");
            commands.add("ng build --configuration production");
            commands.add("npm ci && ng build");
        }
        // ── React + Vite ─────────────────────────────────────────────────────
        else if (new File(dir, "package.json").exists() && isViteProject(dir)) {
            commands.add("npm install && npm run build");
            commands.add("npm ci && npm run build");
            commands.add("npx vite build");
        }
        // ── React (CRA) ───────────────────────────────────────────────────────
        else if (new File(dir, "package.json").exists() && isReactProject(dir)) {
            commands.add("npm install && npm run build");
            commands.add("npm ci && npm run build");
            commands.add("npx react-scripts build");
        }
        // ── Generic Node ──────────────────────────────────────────────────────
        else if (new File(dir, "package.json").exists()) {
            commands.add("npm install && npm run build");
            commands.add("npm ci && npm run build");
            commands.add("npm run build");
        }

        // ── Python with venv ─────────────────────────────────────────────────
        String venvPath = detectVenvDir(dir);
        if (venvPath != null) {
            String pipExe = isWindows ? venvPath + "\\Scripts\\pip" : venvPath + "/bin/pip";
            if (new File(dir, "requirements.txt").exists()) {
                commands.add(pipExe + " install -r requirements.txt");
                commands.add(pipExe + " install --upgrade -r requirements.txt");
            }
            if (new File(dir, "pyproject.toml").exists()) {
                commands.add(pipExe + " install -e .");
            }
        }
        // ── Python without venv ───────────────────────────────────────────────
        else if (isPythonProject(dir)) {
            if (new File(dir, "requirements.txt").exists()) {
                commands.add("pip install -r requirements.txt");
                commands.add("pip install --upgrade -r requirements.txt");
            }
            if (new File(dir, "pyproject.toml").exists()) {
                commands.add("pip install -e .");
            }
            if (commands.isEmpty()) {
                commands.add("pip install -r requirements.txt");
            }
        }

        if (commands.isEmpty()) {
            commands.add("echo No rebuild command suggested");
        }
        return commands;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Port suggestions
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/suggest-port")
    public Integer suggestPort(@RequestParam String path) {
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) return 8080;

        // ── Angular ───────────────────────────────────────────────────────────
        if (new File(dir, "angular.json").exists()) {
            Integer port = readPortFromAngularJson(dir);
            return port != null ? port : 4200;
        }

        // ── React + Vite ─────────────────────────────────────────────────────
        if (new File(dir, "package.json").exists() && isViteProject(dir)) {
            Integer port = readPortFromViteConfig(dir);
            return port != null ? port : 5173;
        }

        // ── React (CRA) ───────────────────────────────────────────────────────
        if (new File(dir, "package.json").exists() && isReactProject(dir)) {
            return 3000;
        }

        // ── Generic Node ──────────────────────────────────────────────────────
        if (new File(dir, "package.json").exists()) {
            return 3000;
        }

        // ── Python (with or without venv) ─────────────────────────────────────
        if (detectVenvDir(dir) != null || isPythonProject(dir)) {
            Integer port = readPortFromPythonProject(dir);
            if (port != null) return port;
            if (hasFastApiDep(dir)) return 8000;
            if (hasFlaskDep(dir)) return 5000;
            return 5000;
        }

        // ── Java Spring Boot (application.properties / yml) ───────────────────
        File resourcesDir = new File(dir, "src/main/resources");
        if (resourcesDir.exists()) {
            for (String ext : new String[]{"properties", "yml", "yaml"}) {
                File appFile = new File(resourcesDir, "application." + ext);
                if (!appFile.exists()) continue;
                try {
                    List<String> lines = java.nio.file.Files.readAllLines(appFile.toPath());
                    boolean insideServerBlock = false;
                    int serverIndent = -1;
                    for (String line : lines) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;

                        // Flat: server.port=8080 or server.port: 8080
                        if (trimmed.startsWith("server.port") && (trimmed.contains("=") || trimmed.contains(":"))) {
                            String[] parts = trimmed.split("[=:]", 2);
                            if (parts.length > 1) {
                                try { return Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { /* ignore */ }
                            }
                        }

                        // Nested YAML: server: \n  port: 8080
                        int indent = 0;
                        while (indent < line.length() && (line.charAt(indent) == ' ' || line.charAt(indent) == '\t')) indent++;
                        if (trimmed.equals("server:") || trimmed.startsWith("server: ")) {
                            insideServerBlock = true;
                            serverIndent = indent;
                        } else if (insideServerBlock) {
                            if (indent <= serverIndent && !trimmed.isEmpty()) {
                                insideServerBlock = false;
                                serverIndent = -1;
                            } else if (trimmed.startsWith("port") && (trimmed.contains(":") || trimmed.contains("="))) {
                                String[] parts = trimmed.split("[=:]", 2);
                                if (parts.length > 1) {
                                    try { return Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { /* ignore */ }
                                }
                            }
                        }
                    }
                } catch (Exception e) { /* ignore */ }
            }
        }

        return 8080;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Framework detection endpoint (used by the UI for badge display)
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/detect-framework")
    public String detectFramework(@RequestParam String path) {
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) return "unknown";

        if (new File(dir, "pom.xml").exists())                                              return "spring-boot";
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) return "gradle";
        if (new File(dir, "angular.json").exists())                                         return "angular";
        if (new File(dir, "package.json").exists() && isViteProject(dir) && isReactProject(dir)) return "react-vite";
        if (new File(dir, "package.json").exists() && isViteProject(dir))                   return "vite";
        if (new File(dir, "package.json").exists() && isReactProject(dir))                  return "react";
        if (new File(dir, "package.json").exists())                                         return "node";

        String venvPath = detectVenvDir(dir);
        if (venvPath != null) {
            if (hasFastApiDep(dir)) return "python-venv-fastapi";
            if (hasFlaskDep(dir))   return "python-venv-flask";
            return "python-venv";
        }
        if (isPythonProject(dir)) {
            if (hasFastApiDep(dir)) return "python-fastapi";
            if (hasFlaskDep(dir))   return "python-flask";
            return "python";
        }
        return "unknown";
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Detection helpers
    // ──────────────────────────────────────────────────────────────────────────

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }

    /** True if package.json contains "react" as a dependency */
    private boolean isReactProject(File dir) {
        return fileContainsAny(new File(dir, "package.json"), "\"react\"");
    }

    /** True if a Vite config file is present */
    private boolean isViteProject(File dir) {
        return new File(dir, "vite.config.js").exists()
                || new File(dir, "vite.config.ts").exists()
                || new File(dir, "vite.config.mjs").exists()
                || new File(dir, "vite.config.cjs").exists();
    }

    /**
     * Returns the absolute path of the virtual-env directory if one is found,
     * otherwise null. Checks: venv, .venv, env, .env — validates that the
     * Python executable actually exists inside.
     */
    private String detectVenvDir(File dir) {
        boolean isWindows = isWindows();
        String pythonBin = isWindows ? "Scripts\\python.exe" : "bin/python";

        for (String candidate : new String[]{"venv", ".venv", "env"}) {
            File venvDir = new File(dir, candidate);
            if (venvDir.exists() && venvDir.isDirectory()) {
                if (new File(venvDir, pythonBin).exists()) {
                    return venvDir.getAbsolutePath();
                }
            }
        }
        return null;
    }

    /** True if the directory looks like a Python project */
    private boolean isPythonProject(File dir) {
        if (new File(dir, "requirements.txt").exists()) return true;
        if (new File(dir, "pyproject.toml").exists())   return true;
        if (new File(dir, "setup.py").exists())         return true;
        if (new File(dir, "Pipfile").exists())           return true;
        File[] pyFiles = dir.listFiles((d, name) -> name.endsWith(".py"));
        return pyFiles != null && pyFiles.length > 0;
    }

    /** True if requirements.txt / pyproject.toml mentions fastapi or uvicorn */
    private boolean hasFastApiDep(File dir) {
        return fileContainsAny(new File(dir, "requirements.txt"), "fastapi", "uvicorn")
                || fileContainsAny(new File(dir, "pyproject.toml"), "fastapi", "uvicorn");
    }

    /** True if requirements.txt / pyproject.toml mentions flask */
    private boolean hasFlaskDep(File dir) {
        return fileContainsAny(new File(dir, "requirements.txt"), "flask")
                || fileContainsAny(new File(dir, "pyproject.toml"), "flask");
    }

    /** Case-insensitive keyword search inside a file */
    private boolean fileContainsAny(File file, String... keywords) {
        if (!file.exists()) return false;
        try {
            String content = new String(java.nio.file.Files.readAllBytes(file.toPath())).toLowerCase();
            for (String kw : keywords) {
                if (content.contains(kw.toLowerCase())) return true;
            }
        } catch (Exception e) { /* ignore */ }
        return false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Port-reading helpers
    // ──────────────────────────────────────────────────────────────────────────

    private Integer readPortFromAngularJson(File dir) {
        try {
            String content = new String(java.nio.file.Files.readAllBytes(new File(dir, "angular.json").toPath()));
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"port\"\\s*:\\s*(\\d+)").matcher(content);
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    private Integer readPortFromViteConfig(File dir) {
        for (String name : new String[]{"vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"}) {
            try {
                File f = new File(dir, name);
                if (!f.exists()) continue;
                String content = new String(java.nio.file.Files.readAllBytes(f.toPath()));
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("port\\s*:\\s*(\\d+)").matcher(content);
                if (m.find()) return Integer.parseInt(m.group(1));
            } catch (Exception e) { /* ignore */ }
        }
        return null;
    }

    private Integer readPortFromPythonProject(File dir) {
        // 1. Check .env file
        try {
            File envFile = new File(dir, ".env");
            if (envFile.exists()) {
                for (String line : java.nio.file.Files.readAllLines(envFile.toPath())) {
                    String t = line.trim();
                    if (t.toUpperCase().startsWith("PORT=")) {
                        try { return Integer.parseInt(t.split("=", 2)[1].trim()); } catch (NumberFormatException e) { /* ignore */ }
                    }
                }
            }
        } catch (Exception e) { /* ignore */ }

        // 2. Scan common Python entry-point files for port = <number> / port=<number>
        for (String pyFile : new String[]{"main.py", "app.py", "run.py"}) {
            try {
                File f = new File(dir, pyFile);
                if (!f.exists()) continue;
                String content = new String(java.nio.file.Files.readAllBytes(f.toPath()));
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("port\\s*[=:]\\s*(\\d{4,5})").matcher(content);
                if (m.find()) return Integer.parseInt(m.group(1));
            } catch (Exception e) { /* ignore */ }
        }
        return null;
    }
}
