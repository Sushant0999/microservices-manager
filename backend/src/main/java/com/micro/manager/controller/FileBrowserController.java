package com.micro.manager.controller;

import com.micro.manager.model.DiscoveredService;
import com.micro.manager.model.JdkConfig;
import com.micro.manager.model.JdkSuggestion;
import com.micro.manager.service.ProcessManagerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/fs")
@CrossOrigin(origins = "*")
public class FileBrowserController {

    @Autowired
    private ProcessManagerService processManager;

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
            if (port != null) return port;
            return 4200;
        }

        // ── React + Vite ─────────────────────────────────────────────────────
        if (new File(dir, "package.json").exists() && isViteProject(dir)) {
            Integer port = readPortFromViteConfig(dir);
            if (port != null) return port;
            Integer envPort = readPortFromEnv(dir);
            if (envPort != null) return envPort;
            return 5173;
        }

        // ── Python (with or without venv) ─────────────────────────────────────
        if (detectVenvDir(dir) != null || isPythonProject(dir)) {
            Integer port = readPortFromPythonProject(dir);
            if (port != null) return port;
            Integer envPort = readPortFromEnv(dir);
            if (envPort != null) return envPort;
            if (hasFastApiDep(dir)) return 8000;
            if (hasFlaskDep(dir)) return 5000;
            return 5000;
        }

        // ── Java Spring Boot / Cloud / Micronaut / Quarkus ───────────────────
        Integer springPort = readPortFromSpringProject(dir);
        if (springPort != null) return springPort;

        // ── Generic Node / React (CRA) ────────────────────────────────────────
        if (new File(dir, "package.json").exists()) {
            Integer envPort = readPortFromEnv(dir);
            if (envPort != null) return envPort;
            Integer pkgPort = readPortFromPackageJson(dir);
            if (pkgPort != null) return pkgPort;
            if (isReactProject(dir)) return 3000;
            return 3000;
        }

        // ── Generic .env check ────────────────────────────────────────────────
        Integer envPort = readPortFromEnv(dir);
        if (envPort != null) return envPort;

        return 8080;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Service name suggestions
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/suggest-name")
    public String suggestName(@RequestParam String path) {
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) {
            return "";
        }

        // 1. Check Spring application.properties / application.yml / bootstrap files
        String springAppName = readSpringApplicationName(dir);
        if (springAppName != null && !springAppName.trim().isEmpty()) {
            return springAppName.trim();
        }

        // 2. Check Maven pom.xml (<artifactId> or <name>)
        File pomFile = new File(dir, "pom.xml");
        if (pomFile.exists() && pomFile.isFile()) {
            String pomName = readNameFromPomXml(pomFile);
            if (pomName != null && !pomName.trim().isEmpty()) {
                return pomName.trim();
            }
        }

        // 3. Check Gradle (settings.gradle / build.gradle)
        String gradleName = readNameFromGradle(dir);
        if (gradleName != null && !gradleName.trim().isEmpty()) {
            return gradleName.trim();
        }

        // 4. Check package.json
        File pkgFile = new File(dir, "package.json");
        if (pkgFile.exists() && pkgFile.isFile()) {
            String pkgName = readNameFromPackageJson(pkgFile);
            if (pkgName != null && !pkgName.trim().isEmpty()) {
                return pkgName.trim();
            }
        }

        // 5. Fallback to folder name
        return dir.getName();
    }

    private String readSpringApplicationName(File dir) {
        List<File> candidateDirs = new ArrayList<>();
        candidateDirs.add(new File(dir, "src/main/resources"));
        candidateDirs.add(dir);

        for (File scanDir : candidateDirs) {
            if (!scanDir.exists() || !scanDir.isDirectory()) continue;
            File[] files = scanDir.listFiles(f -> f.isFile() && (
                    f.getName().startsWith("application") || f.getName().startsWith("bootstrap")
            ));
            if (files == null) continue;

            Arrays.sort(files, (f1, f2) -> {
                String n1 = f1.getName().toLowerCase();
                String n2 = f2.getName().toLowerCase();
                if (n1.equals("application.properties")) return -1;
                if (n2.equals("application.properties")) return 1;
                if (n1.equals("application.yml") || n1.equals("application.yaml")) return -1;
                if (n2.equals("application.yml") || n2.equals("application.yaml")) return 1;
                return n1.compareTo(n2);
            });

            for (File file : files) {
                String name = parseSpringAppNameFromFile(file);
                if (name != null && !name.trim().isEmpty()) {
                    return name.trim();
                }
            }
        }
        return null;
    }

    private String parseSpringAppNameFromFile(File file) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(file.toPath());
            boolean insideSpringBlock = false;
            int springIndent = -1;
            boolean insideAppBlock = false;
            int appIndent = -1;

            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;

                // Flat: spring.application.name=my-service or spring.application.name: my-service
                if (trimmed.startsWith("spring.application.name") && (trimmed.contains("=") || trimmed.contains(":"))) {
                    String[] parts = trimmed.split("[=:]", 2);
                    if (parts.length > 1) {
                        String val = cleanQuotes(parts[1].trim());
                        if (!val.isEmpty()) return val;
                    }
                }

                // Nested YAML:
                int indent = 0;
                while (indent < line.length() && (line.charAt(indent) == ' ' || line.charAt(indent) == '\t')) indent++;

                if (trimmed.equals("spring:") || trimmed.startsWith("spring: ")) {
                    insideSpringBlock = true;
                    springIndent = indent;
                    insideAppBlock = false;
                    appIndent = -1;
                } else if (insideSpringBlock) {
                    if (indent <= springIndent && !trimmed.isEmpty()) {
                        insideSpringBlock = false;
                        insideAppBlock = false;
                    } else if (trimmed.equals("application:") || trimmed.startsWith("application: ")) {
                        insideAppBlock = true;
                        appIndent = indent;
                    } else if (insideAppBlock) {
                        if (indent <= appIndent && !trimmed.isEmpty()) {
                            insideAppBlock = false;
                        } else if (trimmed.startsWith("name") && (trimmed.contains(":") || trimmed.contains("="))) {
                            String[] parts = trimmed.split("[=:]", 2);
                            if (parts.length > 1) {
                                String val = cleanQuotes(parts[1].trim());
                                if (!val.isEmpty()) return val;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    private String cleanQuotes(String val) {
        if (val == null) return "";
        String s = val.trim();
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
            if (s.length() >= 2) {
                s = s.substring(1, s.length() - 1).trim();
            }
        }
        return s;
    }

    private String readNameFromPomXml(File pomFile) {
        try {
            String content = new String(java.nio.file.Files.readAllBytes(pomFile.toPath()));
            String stripped = content.replaceAll("<parent>[\\s\\S]*?</parent>", "")
                                     .replaceAll("<dependencies>[\\s\\S]*?</dependencies>", "")
                                     .replaceAll("<build>[\\s\\S]*?</build>", "");

            Matcher artMatcher = Pattern.compile("<artifactId>\\s*([^<]+?)\\s*</artifactId>").matcher(stripped);
            if (artMatcher.find()) {
                String val = cleanQuotes(artMatcher.group(1).trim());
                if (!val.isEmpty()) return val;
            }

            Matcher nameMatcher = Pattern.compile("<name>\\s*([^<]+?)\\s*</name>").matcher(stripped);
            if (nameMatcher.find()) {
                String val = cleanQuotes(nameMatcher.group(1).trim());
                if (!val.isEmpty()) return val;
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    private String readNameFromGradle(File dir) {
        for (String fname : new String[]{"settings.gradle", "settings.gradle.kts"}) {
            File f = new File(dir, fname);
            if (!f.exists()) continue;
            try {
                String content = new String(java.nio.file.Files.readAllBytes(f.toPath()));
                Matcher m = Pattern.compile("rootProject\\.name\\s*=\\s*['\"]([^'\"]+)['\"]").matcher(content);
                if (m.find()) return m.group(1).trim();
            } catch (Exception e) { /* ignore */ }
        }

        for (String fname : new String[]{"build.gradle", "build.gradle.kts"}) {
            File f = new File(dir, fname);
            if (!f.exists()) continue;
            try {
                String content = new String(java.nio.file.Files.readAllBytes(f.toPath()));
                Matcher m = Pattern.compile("archivesBaseName\\s*=\\s*['\"]([^'\"]+)['\"]").matcher(content);
                if (m.find()) return m.group(1).trim();
            } catch (Exception e) { /* ignore */ }
        }
        return null;
    }

    private String readNameFromPackageJson(File pkgFile) {
        try {
            String content = new String(java.nio.file.Files.readAllBytes(pkgFile.toPath()));
            Matcher m = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"").matcher(content);
            if (m.find()) return m.group(1).trim();
        } catch (Exception e) { /* ignore */ }
        return null;
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
    // ──────────────────────────────────────────────────────────────────────────
    //  Port-reading helpers
    // ──────────────────────────────────────────────────────────────────────────

    public Integer extractPortFromValue(String raw) {
        if (raw == null) return null;
        String val = raw.trim();
        // Remove trailing comments (# comment or // comment)
        if (val.contains("#")) {
            val = val.substring(0, val.indexOf("#")).trim();
        }
        if (val.contains("//")) {
            val = val.substring(0, val.indexOf("//")).trim();
        }
        // Remove surrounding quotes
        if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
            if (val.length() >= 2) {
                val = val.substring(1, val.length() - 1).trim();
            }
        }
        // Check for placeholder with default: ${PORT:8080}, ${SERVER_PORT:-8080}, ${port:=8080}, etc.
        Matcher placeholderMatcher = Pattern.compile("\\$\\{[^:}]+[:=-]\\s*(\\d{2,5})\\s*\\}").matcher(val);
        if (placeholderMatcher.find()) {
            try {
                int p = Integer.parseInt(placeholderMatcher.group(1));
                if (p > 0 && p <= 65535) return p;
            } catch (NumberFormatException ignored) {}
        }
        // Check for plain number (2 to 5 digits)
        Matcher numberMatcher = Pattern.compile("^(\\d{2,5})$").matcher(val);
        if (numberMatcher.find()) {
            try {
                int p = Integer.parseInt(numberMatcher.group(1));
                if (p > 0 && p <= 65535) return p;
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    private Integer parsePortFromConfigFile(File file) {
        try {
            List<String> lines = java.nio.file.Files.readAllLines(file.toPath());
            boolean isYaml = file.getName().endsWith(".yml") || file.getName().endsWith(".yaml");
            boolean insideServerBlock = false;
            int serverIndent = -1;

            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("!") || trimmed.startsWith("//")) continue;

                // Flat match: server.port=8080 or server.port: 8080 or micronaut.server.port or quarkus.http.port
                if (trimmed.startsWith("server.port") || trimmed.startsWith("micronaut.server.port") || trimmed.startsWith("quarkus.http.port")) {
                    if (trimmed.contains("=") || trimmed.contains(":")) {
                        String[] parts = trimmed.split("[=:]", 2);
                        if (parts.length > 1) {
                            Integer p = extractPortFromValue(parts[1]);
                            if (p != null) return p;
                        }
                    }
                }

                // If YAML, check nested blocks
                if (isYaml) {
                    int indent = 0;
                    while (indent < line.length() && (line.charAt(indent) == ' ' || line.charAt(indent) == '\t')) indent++;

                    // Reset if new document indicator
                    if (trimmed.startsWith("---")) {
                        insideServerBlock = false;
                        serverIndent = -1;
                        continue;
                    }

                    if (trimmed.equals("server:") || trimmed.startsWith("server: ")) {
                        if (trimmed.contains("port")) {
                            Matcher m = Pattern.compile("port\\s*[:=]\\s*([^\n,}]+)").matcher(trimmed);
                            if (m.find()) {
                                Integer p = extractPortFromValue(m.group(1));
                                if (p != null) return p;
                            }
                        }
                        insideServerBlock = true;
                        serverIndent = indent;
                    } else if (insideServerBlock) {
                        if (indent <= serverIndent && !trimmed.isEmpty()) {
                            insideServerBlock = false;
                            serverIndent = -1;
                        } else if (trimmed.startsWith("port") && (trimmed.contains(":") || trimmed.contains("="))) {
                            String[] parts = trimmed.split("[=:]", 2);
                            if (parts.length > 1) {
                                Integer p = extractPortFromValue(parts[1]);
                                if (p != null) return p;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    private int getConfigFilePriority(String fileName) {
        String name = fileName.toLowerCase();
        if (name.startsWith("application-local.")) return 1;
        if (name.startsWith("application-dev.")) return 2;
        if (name.startsWith("application-default.")) return 3;
        if (name.equals("application.properties") || name.equals("application.yml") || name.equals("application.yaml")) return 4;
        if (name.startsWith("bootstrap-local.")) return 5;
        if (name.startsWith("bootstrap-dev.")) return 6;
        if (name.startsWith("bootstrap-default.")) return 7;
        if (name.equals("bootstrap.properties") || name.equals("bootstrap.yml") || name.equals("bootstrap.yaml")) return 8;
        if (name.startsWith("application-")) return 9;
        if (name.startsWith("bootstrap-")) return 10;
        if (name.endsWith(".properties") || name.endsWith(".yml") || name.endsWith(".yaml")) return 11;
        return 99;
    }

    private Integer readPortFromSpringProject(File dir) {
        List<File> candidateDirs = new ArrayList<>();
        candidateDirs.add(new File(dir, "src/main/resources"));
        candidateDirs.add(new File(dir, "src/main/resources/config"));
        candidateDirs.add(new File(dir, "config"));
        candidateDirs.add(dir);

        List<File> allConfigFiles = new ArrayList<>();
        for (File cDir : candidateDirs) {
            if (!cDir.exists() || !cDir.isDirectory()) continue;
            File[] files = cDir.listFiles(f -> f.isFile() && (
                    f.getName().endsWith(".properties") ||
                    f.getName().endsWith(".yml") ||
                    f.getName().endsWith(".yaml")
            ));
            if (files != null) {
                allConfigFiles.addAll(Arrays.asList(files));
            }
        }

        allConfigFiles.sort(Comparator.comparingInt(f -> getConfigFilePriority(f.getName())));

        for (File file : allConfigFiles) {
            Integer p = parsePortFromConfigFile(file);
            if (p != null) return p;
        }

        return null;
    }

    private Integer readPortFromEnv(File dir) {
        for (String envName : new String[]{".env.local", ".env.development", ".env.dev", ".env"}) {
            try {
                File envFile = new File(dir, envName);
                if (envFile.exists() && envFile.isFile()) {
                    for (String line : java.nio.file.Files.readAllLines(envFile.toPath())) {
                        String t = line.trim();
                        if (t.isEmpty() || t.startsWith("#")) continue;
                        if (t.contains("=")) {
                            String[] parts = t.split("=", 2);
                            String key = parts[0].trim().toUpperCase();
                            if (key.equals("PORT") || key.equals("SERVER_PORT") || key.equals("APP_PORT") || key.equals("HTTP_PORT")) {
                                Integer p = extractPortFromValue(parts[1]);
                                if (p != null) return p;
                            }
                        }
                    }
                }
            } catch (Exception e) { /* ignore */ }
        }
        return null;
    }

    private Integer readPortFromPackageJson(File dir) {
        try {
            File pkgFile = new File(dir, "package.json");
            if (pkgFile.exists() && pkgFile.isFile()) {
                String content = new String(java.nio.file.Files.readAllBytes(pkgFile.toPath()));
                Matcher m1 = Pattern.compile("PORT\\s*=\\s*(\\d{2,5})").matcher(content);
                if (m1.find()) return Integer.parseInt(m1.group(1));

                Matcher m2 = Pattern.compile("--port\\s+(\\d{2,5})").matcher(content);
                if (m2.find()) return Integer.parseInt(m2.group(1));

                Matcher m3 = Pattern.compile("-p\\s+(\\d{2,5})").matcher(content);
                if (m3.find()) return Integer.parseInt(m3.group(1));
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

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

    // ──────────────────────────────────────────────────────────────────────────
    //  JDK & Java Version detection endpoint
    // ──────────────────────────────────────────────────────────────────────────

    @GetMapping("/suggest-jdk")
    public JdkSuggestion suggestJdk(@RequestParam String path) {
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) {
            return JdkSuggestion.builder()
                    .detectedJavaVersion(null)
                    .detectionSource("Invalid directory")
                    .matchingJdkFound(false)
                    .build();
        }

        JdkSuggestion suggestion = detectJavaVersion(dir);
        if (suggestion.getDetectedJavaVersion() != null && processManager != null) {
            String matchedJdkName = findBestMatchingJdk(suggestion.getDetectedJavaVersion(), processManager.getJdks());
            if (matchedJdkName != null) {
                suggestion.setSuggestedJdkName(matchedJdkName);
                suggestion.setMatchingJdkFound(true);
            }
        }
        return suggestion;
    }

    public JdkSuggestion detectJavaVersion(File dir) {
        File pomFile = new File(dir, "pom.xml");
        if (pomFile.exists() && pomFile.isFile()) {
            JdkSuggestion suggestion = detectFromPomXml(pomFile);
            if (suggestion != null && suggestion.getDetectedJavaVersion() != null) {
                return suggestion;
            }
        }

        File gradleFile = new File(dir, "build.gradle");
        File gradleKtsFile = new File(dir, "build.gradle.kts");
        if (gradleFile.exists() || gradleKtsFile.exists()) {
            JdkSuggestion suggestion = detectFromGradle(dir);
            if (suggestion != null && suggestion.getDetectedJavaVersion() != null) {
                return suggestion;
            }
        }

        // .java-version or system.properties
        File dotJavaVersion = new File(dir, ".java-version");
        if (dotJavaVersion.exists() && dotJavaVersion.isFile()) {
            try {
                String content = new String(java.nio.file.Files.readAllBytes(dotJavaVersion.toPath())).trim();
                String norm = normalizeJavaVersion(content);
                if (norm != null) {
                    return JdkSuggestion.builder()
                            .detectedJavaVersion(norm)
                            .rawJavaVersion(content)
                            .detectionSource(".java-version file (" + content + ")")
                            .build();
                }
            } catch (Exception ignored) {}
        }

        File systemProps = new File(dir, "system.properties");
        if (systemProps.exists() && systemProps.isFile()) {
            try {
                List<String> lines = java.nio.file.Files.readAllLines(systemProps.toPath());
                for (String l : lines) {
                    String trim = l.trim();
                    if (trim.startsWith("java.runtime.version")) {
                        String val = trim.split("=", 2)[1].trim();
                        String norm = normalizeJavaVersion(val);
                        if (norm != null) {
                            return JdkSuggestion.builder()
                                    .detectedJavaVersion(norm)
                                    .rawJavaVersion(val)
                                    .detectionSource("system.properties (java.runtime.version=" + val + ")")
                                    .build();
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        return JdkSuggestion.builder()
                .detectedJavaVersion(null)
                .detectionSource("No Java build configuration found")
                .matchingJdkFound(false)
                .build();
    }

    private JdkSuggestion detectFromPomXml(File pomFile) {
        String content = "";
        try {
            content = new String(java.nio.file.Files.readAllBytes(pomFile.toPath()));
        } catch (Exception e) {
            return null;
        }

        Map<String, String> properties = extractXmlProperties(content);

        // 1. Direct properties check in pom.xml
        String[] javaProps = new String[]{
            "java.version", "maven.compiler.release", "maven.compiler.target",
            "maven.compiler.source", "jdk.version", "java.src.version", "target.jdk",
            "compiler.target", "compiler.source"
        };
        for (String prop : javaProps) {
            String val = properties.get(prop.toLowerCase());
            if (val != null && !val.trim().isEmpty()) {
                val = resolvePropertyPlaceholder(val.trim(), properties);
                String normalized = normalizeJavaVersion(val);
                if (normalized != null) {
                    return JdkSuggestion.builder()
                            .detectedJavaVersion(normalized)
                            .rawJavaVersion(val)
                            .detectionSource("pom.xml (<" + prop + "> " + val + ")")
                            .build();
                }
            }
        }

        // 2. Check maven-compiler-plugin configuration via regex
        Matcher releaseMatcher = Pattern.compile("<release>\\s*([^<]+?)\\s*</release>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (releaseMatcher.find()) {
            String val = resolvePropertyPlaceholder(releaseMatcher.group(1).trim(), properties);
            String normalized = normalizeJavaVersion(val);
            if (normalized != null) {
                return JdkSuggestion.builder()
                        .detectedJavaVersion(normalized)
                        .rawJavaVersion(val)
                        .detectionSource("pom.xml (compiler plugin <release> " + val + ")")
                        .build();
            }
        }

        Matcher targetMatcher = Pattern.compile("<target>\\s*([^<]+?)\\s*</target>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (targetMatcher.find()) {
            String val = resolvePropertyPlaceholder(targetMatcher.group(1).trim(), properties);
            String normalized = normalizeJavaVersion(val);
            if (normalized != null) {
                return JdkSuggestion.builder()
                        .detectedJavaVersion(normalized)
                        .rawJavaVersion(val)
                        .detectionSource("pom.xml (compiler plugin <target> " + val + ")")
                        .build();
            }
        }

        // 3. Check Spring Boot parent or Spring Boot dependencies
        // Parent check: <parent> ... <groupId>org.springframework.boot</groupId> ... <artifactId>spring-boot-starter-parent</artifactId> ... <version>X.Y.Z</version>
        Matcher parentMatcher = Pattern.compile("<parent>[\\s\\S]*?<groupId>\\s*org\\.springframework\\.boot\\s*</groupId>[\\s\\S]*?<artifactId>\\s*spring-boot-starter-parent\\s*</artifactId>[\\s\\S]*?<version>\\s*([^<]+?)\\s*</version>[\\s\\S]*?</parent>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (parentMatcher.find()) {
            String bootVersion = resolvePropertyPlaceholder(parentMatcher.group(1).trim(), properties);
            JdkSuggestion s = inferJdkFromSpringBootVersion(bootVersion, "pom.xml (<parent> Spring Boot " + bootVersion + ")");
            if (s != null) return s;
        }

        // Parent or dependencyManagement with spring-boot-dependencies
        Matcher depMgmtBootMatcher = Pattern.compile("<artifactId>\\s*spring-boot-dependencies\\s*</artifactId>[\\s\\S]*?<version>\\s*([^<]+?)\\s*</version>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (depMgmtBootMatcher.find()) {
            String bootVersion = resolvePropertyPlaceholder(depMgmtBootMatcher.group(1).trim(), properties);
            JdkSuggestion s = inferJdkFromSpringBootVersion(bootVersion, "pom.xml (spring-boot-dependencies " + bootVersion + ")");
            if (s != null) return s;
        }

        // Any spring-boot-starter dependency with explicit version
        Matcher starterMatcher = Pattern.compile("<groupId>\\s*org\\.springframework\\.boot\\s*</groupId>[\\s\\S]*?<artifactId>\\s*spring-boot-starter[a-zA-Z0-9-]*\\s*</artifactId>[\\s\\S]*?<version>\\s*([^<]+?)\\s*</version>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (starterMatcher.find()) {
            String bootVersion = resolvePropertyPlaceholder(starterMatcher.group(1).trim(), properties);
            JdkSuggestion s = inferJdkFromSpringBootVersion(bootVersion, "pom.xml (spring-boot-starter " + bootVersion + ")");
            if (s != null) return s;
        }

        // Generic spring-boot mention in parent without explicit version in matcher or generic starter
        if (content.contains("spring-boot-starter-parent") || content.contains("org.springframework.boot")) {
            // Check if jakarta namespace is used
            if (content.contains("jakarta.")) {
                return JdkSuggestion.builder()
                        .detectedJavaVersion("17")
                        .rawJavaVersion("17")
                        .detectionSource("pom.xml (Spring Boot + Jakarta EE -> Java 17)")
                        .build();
            }
            if (content.contains("javax.")) {
                return JdkSuggestion.builder()
                        .detectedJavaVersion("8")
                        .rawJavaVersion("8")
                        .detectionSource("pom.xml (Spring Boot + Java EE javax -> Java 8)")
                        .build();
            }
            // Default Spring Boot fallback (modern Spring Boot 3 default)
            return JdkSuggestion.builder()
                    .detectedJavaVersion("17")
                    .rawJavaVersion("17")
                    .detectionSource("pom.xml (Spring Boot project default Java 17)")
                    .build();
        }

        // 4. Other framework dependencies check
        if (content.contains("jakarta.servlet") || content.contains("jakarta.persistence") || content.contains("jakarta.annotation")) {
            return JdkSuggestion.builder()
                    .detectedJavaVersion("17")
                    .rawJavaVersion("17")
                    .detectionSource("pom.xml (Jakarta EE dependency -> Java 17)")
                    .build();
        }
        if (content.contains("javax.servlet") || content.contains("javax.persistence")) {
            return JdkSuggestion.builder()
                    .detectedJavaVersion("8")
                    .rawJavaVersion("8")
                    .detectionSource("pom.xml (Java EE javax dependency -> Java 8)")
                    .build();
        }

        // Quarkus
        Matcher quarkusMatcher = Pattern.compile("quarkus-bom[\\s\\S]*?<version>\\s*([^<]+?)\\s*</version>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (quarkusMatcher.find()) {
            String qv = resolvePropertyPlaceholder(quarkusMatcher.group(1).trim(), properties);
            if (qv.startsWith("3.")) {
                return JdkSuggestion.builder().detectedJavaVersion("17").rawJavaVersion(qv).detectionSource("pom.xml (Quarkus " + qv + " -> Java 17)").build();
            } else {
                return JdkSuggestion.builder().detectedJavaVersion("11").rawJavaVersion(qv).detectionSource("pom.xml (Quarkus " + qv + " -> Java 11)").build();
            }
        }

        // Micronaut
        Matcher micronautMatcher = Pattern.compile("micronaut-bom[\\s\\S]*?<version>\\s*([^<]+?)\\s*</version>", Pattern.CASE_INSENSITIVE).matcher(content);
        if (micronautMatcher.find()) {
            String mv = resolvePropertyPlaceholder(micronautMatcher.group(1).trim(), properties);
            if (mv.startsWith("4.")) {
                return JdkSuggestion.builder().detectedJavaVersion("17").rawJavaVersion(mv).detectionSource("pom.xml (Micronaut " + mv + " -> Java 17)").build();
            } else {
                return JdkSuggestion.builder().detectedJavaVersion("11").rawJavaVersion(mv).detectionSource("pom.xml (Micronaut " + mv + " -> Java 11)").build();
            }
        }

        // Default Java Maven project fallback
        return JdkSuggestion.builder()
                .detectedJavaVersion("17")
                .rawJavaVersion("17")
                .detectionSource("pom.xml (Maven project default Java 17)")
                .build();
    }

    private JdkSuggestion inferJdkFromSpringBootVersion(String bootVersion, String sourceDesc) {
        if (bootVersion == null || bootVersion.trim().isEmpty()) return null;
        String clean = bootVersion.replaceAll("[^0-9.]", "").trim();
        String[] parts = clean.split("\\.");
        if (parts.length > 0) {
            try {
                int major = Integer.parseInt(parts[0]);
                int minor = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
                if (major >= 3) {
                    return JdkSuggestion.builder()
                            .detectedJavaVersion("17")
                            .rawJavaVersion("17")
                            .detectedSpringBootVersion(bootVersion)
                            .detectionSource(sourceDesc + " -> requires Java 17+")
                            .build();
                } else if (major == 2) {
                    if (minor >= 5) {
                        return JdkSuggestion.builder()
                                .detectedJavaVersion("11")
                                .rawJavaVersion("11")
                                .detectedSpringBootVersion(bootVersion)
                                .detectionSource(sourceDesc + " -> defaults to Java 11")
                                .build();
                    } else {
                        return JdkSuggestion.builder()
                                .detectedJavaVersion("8")
                                .rawJavaVersion("8")
                                .detectedSpringBootVersion(bootVersion)
                                .detectionSource(sourceDesc + " -> defaults to Java 8")
                                .build();
                    }
                } else if (major == 1) {
                    return JdkSuggestion.builder()
                            .detectedJavaVersion("8")
                            .rawJavaVersion("8")
                            .detectedSpringBootVersion(bootVersion)
                            .detectionSource(sourceDesc + " -> defaults to Java 8")
                            .build();
                }
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    private JdkSuggestion detectFromGradle(File dir) {
        for (String fname : new String[]{"build.gradle", "build.gradle.kts"}) {
            File f = new File(dir, fname);
            if (!f.exists()) continue;
            try {
                String content = new String(java.nio.file.Files.readAllBytes(f.toPath()));

                // jvmToolchain(17) or jvmToolchain { languageVersion.set(JavaLanguageVersion.of(17)) }
                Matcher toolchainMatcher = Pattern.compile("jvmToolchain\\s*\\(?\\s*(\\d+)\\s*\\)?").matcher(content);
                if (toolchainMatcher.find()) {
                    String v = toolchainMatcher.group(1);
                    return JdkSuggestion.builder()
                            .detectedJavaVersion(v)
                            .rawJavaVersion(v)
                            .detectionSource(fname + " (jvmToolchain " + v + ")")
                            .build();
                }
                Matcher toolchainLangMatcher = Pattern.compile("JavaLanguageVersion\\.of\\(\\s*(\\d+)\\s*\\)").matcher(content);
                if (toolchainLangMatcher.find()) {
                    String v = toolchainLangMatcher.group(1);
                    return JdkSuggestion.builder()
                            .detectedJavaVersion(v)
                            .rawJavaVersion(v)
                            .detectionSource(fname + " (JavaLanguageVersion.of(" + v + "))")
                            .build();
                }

                // sourceCompatibility / targetCompatibility
                Matcher scMatcher = Pattern.compile("(?:sourceCompatibility|targetCompatibility)\\s*=\\s*['\"]?([0-9._]+)['\"]?").matcher(content);
                if (scMatcher.find()) {
                    String val = scMatcher.group(1);
                    String norm = normalizeJavaVersion(val);
                    if (norm != null) {
                        return JdkSuggestion.builder()
                                .detectedJavaVersion(norm)
                                .rawJavaVersion(val)
                                .detectionSource(fname + " (sourceCompatibility " + val + ")")
                                .build();
                    }
                }
                Matcher jvMatcher = Pattern.compile("JavaVersion\\.VERSION_([0-9_]+)").matcher(content);
                if (jvMatcher.find()) {
                    String val = jvMatcher.group(1);
                    String norm = normalizeJavaVersion(val);
                    if (norm != null) {
                        return JdkSuggestion.builder()
                                .detectedJavaVersion(norm)
                                .rawJavaVersion(val)
                                .detectionSource(fname + " (JavaVersion.VERSION_" + val + ")")
                                .build();
                    }
                }

                // Spring Boot plugin version: id 'org.springframework.boot' version '3.2.0'
                Matcher bootPluginMatcher = Pattern.compile("id\\s*['\"]org\\.springframework\\.boot['\"]\\s*version\\s*['\"]([^'\"]+)['\"]").matcher(content);
                if (bootPluginMatcher.find()) {
                    String bootVer = bootPluginMatcher.group(1).trim();
                    JdkSuggestion s = inferJdkFromSpringBootVersion(bootVer, fname + " (Spring Boot plugin " + bootVer + ")");
                    if (s != null) return s;
                }

                // Spring Boot dependency version
                Matcher bootDepMatcher = Pattern.compile("org\\.springframework\\.boot:spring-boot-starter[a-zA-Z0-9-]*:([0-9.]+)").matcher(content);
                if (bootDepMatcher.find()) {
                    String bootVer = bootDepMatcher.group(1).trim();
                    JdkSuggestion s = inferJdkFromSpringBootVersion(bootVer, fname + " (Spring Boot dependency " + bootVer + ")");
                    if (s != null) return s;
                }

                if (content.contains("org.springframework.boot")) {
                    return JdkSuggestion.builder()
                            .detectedJavaVersion("17")
                            .rawJavaVersion("17")
                            .detectionSource(fname + " (Spring Boot default Java 17)")
                            .build();
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String normalizeJavaVersion(String raw) {
        if (raw == null) return null;
        String val = raw.trim();
        if (val.isEmpty()) return null;

        // Handle "1.8", "1.8.0", "1.8.0_311", "VERSION_1_8" -> "8"
        if (val.startsWith("1.8") || val.equals("8") || val.equalsIgnoreCase("1_8")) return "8";
        if (val.startsWith("1.7") || val.equals("7") || val.equalsIgnoreCase("1_7")) return "7";
        if (val.startsWith("1.6") || val.equals("6") || val.equalsIgnoreCase("1_6")) return "6";

        // Handle "11", "17", "21", "22", "23", etc.
        Matcher m = Pattern.compile("^(\\d+)").matcher(val);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private String findBestMatchingJdk(String targetJavaVersion, Collection<JdkConfig> jdks) {
        if (targetJavaVersion == null || jdks == null || jdks.isEmpty()) return null;
        String normTarget = normalizeJavaVersion(targetJavaVersion);
        if (normTarget == null) return null;

        String os = System.getProperty("os.name").toLowerCase();

        // 1. First pass: Exact version token match in JDK name with valid path on current OS
        for (JdkConfig jdk : jdks) {
            String name = jdk.getName();
            if (name != null && isJdkVersionMatch(name, normTarget)) {
                String osPath = getJdkPathForCurrentOs(jdk, os);
                if (osPath != null && !osPath.trim().isEmpty() && new File(osPath).exists()) {
                    return name;
                }
            }
        }

        // 2. Second pass: any JDK name match even if path is not local
        for (JdkConfig jdk : jdks) {
            String name = jdk.getName();
            if (name != null && isJdkVersionMatch(name, normTarget)) {
                return name;
            }
        }

        // 3. Third pass: Check JDK path strings
        for (JdkConfig jdk : jdks) {
            String osPath = getJdkPathForCurrentOs(jdk, os);
            if (osPath != null && isJdkVersionMatch(osPath, normTarget)) {
                return jdk.getName();
            }
        }

        return null;
    }

    private boolean isJdkVersionMatch(String text, String targetVersion) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        if ("8".equals(targetVersion)) {
            return lower.matches(".*(?:\\b|[^0-9])(?:8|1\\.8)(?:\\b|[^0-9]).*")
                    || lower.contains("jdk8") || lower.contains("jdk1.8") || lower.contains("java-8") || lower.contains("java-1.8");
        }
        String pattern = ".*(?:\\b|[^0-9])" + Pattern.quote(targetVersion) + "(?:\\b|[^0-9]).*";
        return lower.matches(pattern) || lower.contains("jdk" + targetVersion) || lower.contains("java-" + targetVersion);
    }

    private String getJdkPathForCurrentOs(JdkConfig jdk, String os) {
        if (os.contains("win")) return jdk.getWindowsPath();
        if (os.contains("mac") || os.contains("darwin")) return jdk.getMacPath();
        return jdk.getLinuxPath();
    }

    private Map<String, String> extractXmlProperties(String xmlContent) {
        Map<String, String> map = new HashMap<>();
        Matcher propBlockMatcher = Pattern.compile("<properties>([\\s\\S]*?)</properties>", Pattern.CASE_INSENSITIVE).matcher(xmlContent);
        if (propBlockMatcher.find()) {
            String props = propBlockMatcher.group(1);
            Matcher tagMatcher = Pattern.compile("<([a-zA-Z0-9._-]+)>\\s*([^<]+?)\\s*</\\1>").matcher(props);
            while (tagMatcher.find()) {
                map.put(tagMatcher.group(1).toLowerCase(), tagMatcher.group(2).trim());
            }
        }
        return map;
    }

    private String resolvePropertyPlaceholder(String val, Map<String, String> properties) {
        if (val == null) return null;
        if (val.startsWith("${") && val.endsWith("}")) {
            String key = val.substring(2, val.length() - 1).toLowerCase();
            if (properties.containsKey(key)) {
                return properties.get(key);
            }
        }
        return val;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  Recursive Multi-Service Scanner
    // ──────────────────────────────────────────────────────────────────────────

    private static final Set<String> IGNORED_DIR_NAMES = new HashSet<>(Arrays.asList(
            ".git", ".svn", ".hg", "node_modules", "target", "build", ".gradle",
            ".idea", ".vscode", "dist", "out", "venv", ".venv", "env", ".env",
            "bin", "obj", "logs", ".system_generated", "coverage", ".next", ".nuxt"
    ));

    @GetMapping("/scan-services")
    public List<DiscoveredService> scanServices(
            @RequestParam String path,
            @RequestParam(defaultValue = "4") int maxDepth
    ) {
        File rootDir = new File(path);
        List<DiscoveredService> discovered = new ArrayList<>();
        if (!rootDir.exists() || !rootDir.isDirectory()) {
            return discovered;
        }

        Set<String> visitedPaths = new HashSet<>();
        scanDirectoryRecursively(rootDir, rootDir, 0, maxDepth, discovered, visitedPaths);
        return discovered;
    }

    private void scanDirectoryRecursively(
            File rootDir,
            File currentDir,
            int currentDepth,
            int maxDepth,
            List<DiscoveredService> discovered,
            Set<String> visitedPaths
    ) {
        if (currentDir == null || !currentDir.exists() || !currentDir.isDirectory()) return;

        try {
            String canonical = currentDir.getCanonicalPath();
            if (visitedPaths.contains(canonical)) return;
            visitedPaths.add(canonical);
        } catch (Exception e) {
            return;
        }

        if (isServiceDirectory(currentDir)) {
            String dirPath = currentDir.getAbsolutePath();
            String name = suggestName(dirPath);
            if (name == null || name.trim().isEmpty()) {
                name = currentDir.getName();
            }

            Integer port = suggestPort(dirPath);
            List<String> startCmds = suggestCommands(dirPath);
            String startCmd = (!startCmds.isEmpty() && !startCmds.get(0).startsWith("echo ")) ? startCmds.get(0) : "mvn spring-boot:run";
            List<String> rebuildCmds = suggestRebuildCommands(dirPath);
            String rebuildCmd = (!rebuildCmds.isEmpty() && !rebuildCmds.get(0).startsWith("echo ")) ? rebuildCmds.get(0) : "mvn clean install -DskipTests";
            String framework = detectFramework(dirPath);
            JdkSuggestion jdkSugg = suggestJdk(dirPath);

            String relPath = "";
            try {
                Path rootP = rootDir.toPath().toAbsolutePath().normalize();
                Path currP = currentDir.toPath().toAbsolutePath().normalize();
                relPath = rootP.relativize(currP).toString();
            } catch (Exception ignored) {
                relPath = currentDir.getName();
            }
            if (relPath.isEmpty()) {
                relPath = ".";
            }

            DiscoveredService svc = DiscoveredService.builder()
                    .name(name)
                    .path(dirPath)
                    .relativePath(relPath)
                    .port(port != null ? port : 8080)
                    .startCommand(startCmd)
                    .rebuildCommand(rebuildCmd)
                    .framework(framework)
                    .jdkName(jdkSugg != null ? jdkSugg.getSuggestedJdkName() : null)
                    .detectedJavaVersion(jdkSugg != null ? jdkSugg.getDetectedJavaVersion() : null)
                    .build();

            discovered.add(svc);
        }

        if (currentDepth < maxDepth) {
            File[] subDirs = currentDir.listFiles(f -> f.isDirectory() && !IGNORED_DIR_NAMES.contains(f.getName().toLowerCase()));
            if (subDirs != null) {
                Arrays.sort(subDirs, Comparator.comparing(File::getName));
                for (File subDir : subDirs) {
                    scanDirectoryRecursively(rootDir, subDir, currentDepth + 1, maxDepth, discovered, visitedPaths);
                }
            }
        }
    }

    private boolean isServiceDirectory(File dir) {
        if (new File(dir, "pom.xml").exists()) return true;
        if (new File(dir, "build.gradle").exists() || new File(dir, "build.gradle.kts").exists()) return true;
        if (new File(dir, "angular.json").exists()) return true;
        if (new File(dir, "package.json").exists() && (isViteProject(dir) || isReactProject(dir) || new File(dir, "server.js").exists() || new File(dir, "app.js").exists() || new File(dir, "index.js").exists())) return true;
        if (detectVenvDir(dir) != null || isPythonProject(dir)) return true;
        return false;
    }
}
