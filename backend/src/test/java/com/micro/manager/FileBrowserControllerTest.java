package com.micro.manager;

import com.micro.manager.controller.FileBrowserController;
import com.micro.manager.model.JdkConfig;
import com.micro.manager.model.JdkSuggestion;
import com.micro.manager.service.ProcessManagerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class FileBrowserControllerTest {

    private FileBrowserController controller;
    private ProcessManagerService mockProcessManager;
    private List<JdkConfig> sampleJdks;

    @TempDir
    Path tempDir;

    @BeforeEach
    public void setUp() {
        controller = new FileBrowserController();
        mockProcessManager = new ProcessManagerService();
        sampleJdks = new ArrayList<>();

        JdkConfig jdk8 = new JdkConfig();
        jdk8.setName("OpenJDK 8");
        jdk8.setMacPath("/Library/Java/JavaVirtualMachines/jdk8/Contents/Home");
        jdk8.setWindowsPath("C:\\Program Files\\Java\\jdk1.8.0_311");
        jdk8.setLinuxPath("/usr/lib/jvm/java-8-openjdk");
        sampleJdks.add(jdk8);

        JdkConfig jdk11 = new JdkConfig();
        jdk11.setName("AdoptOpenJDK 11");
        jdk11.setMacPath("/Library/Java/JavaVirtualMachines/jdk-11.jdk/Contents/Home");
        jdk11.setWindowsPath("C:\\Program Files\\Java\\jdk-11.0.12");
        jdk11.setLinuxPath("/usr/lib/jvm/java-11-openjdk");
        sampleJdks.add(jdk11);

        JdkConfig jdk17 = new JdkConfig();
        jdk17.setName("Corretto 17");
        jdk17.setMacPath("/Library/Java/JavaVirtualMachines/amazon-corretto-17.jdk/Contents/Home");
        jdk17.setWindowsPath("C:\\Program Files\\Amazon Corretto\\jdk17.0.5");
        jdk17.setLinuxPath("/usr/lib/jvm/java-17-amazon-corretto");
        sampleJdks.add(jdk17);

        JdkConfig jdk21 = new JdkConfig();
        jdk21.setName("Oracle JDK 21");
        jdk21.setMacPath("/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home");
        jdk21.setWindowsPath("C:\\Program Files\\Java\\jdk-21");
        jdk21.setLinuxPath("/usr/lib/jvm/java-21-openjdk");
        sampleJdks.add(jdk21);

        ReflectionTestUtils.setField(mockProcessManager, "jdks", sampleJdks);
        ReflectionTestUtils.setField(controller, "processManager", mockProcessManager);
    }

    @Test
    public void testExplicitJavaVersionPropertyInPom() throws IOException {
        String pom = """
            <project>
                <properties>
                    <java.version>17</java.version>
                </properties>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("17", suggestion.getDetectedJavaVersion());
        assertEquals("Corretto 17", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testCompilerSourceJava8InPom() throws IOException {
        String pom = """
            <project>
                <properties>
                    <maven.compiler.source>1.8</maven.compiler.source>
                    <maven.compiler.target>1.8</maven.compiler.target>
                </properties>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("8", suggestion.getDetectedJavaVersion());
        assertEquals("OpenJDK 8", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testCompilerPluginReleaseInPom() throws IOException {
        String pom = """
            <project>
                <build>
                    <plugins>
                        <plugin>
                            <groupId>org.apache.maven.plugins</groupId>
                            <artifactId>maven-compiler-plugin</artifactId>
                            <configuration>
                                <release>21</release>
                            </configuration>
                        </plugin>
                    </plugins>
                </build>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("21", suggestion.getDetectedJavaVersion());
        assertEquals("Oracle JDK 21", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testSpringBoot3ParentInPomWithoutExplicitJavaVersion() throws IOException {
        String pom = """
            <project>
                <parent>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-parent</artifactId>
                    <version>3.2.2</version>
                </parent>
                <dependencies>
                    <dependency>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-web</artifactId>
                    </dependency>
                </dependencies>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("17", suggestion.getDetectedJavaVersion());
        assertEquals("3.2.2", suggestion.getDetectedSpringBootVersion());
        assertEquals("Corretto 17", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testSpringBoot27ParentInPomWithoutExplicitJavaVersion() throws IOException {
        String pom = """
            <project>
                <parent>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-parent</artifactId>
                    <version>2.7.14</version>
                </parent>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("11", suggestion.getDetectedJavaVersion());
        assertEquals("2.7.14", suggestion.getDetectedSpringBootVersion());
        assertEquals("AdoptOpenJDK 11", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testSpringBoot21ParentInPomWithoutExplicitJavaVersion() throws IOException {
        String pom = """
            <project>
                <parent>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-parent</artifactId>
                    <version>2.1.8.RELEASE</version>
                </parent>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("8", suggestion.getDetectedJavaVersion());
        assertEquals("2.1.8.RELEASE", suggestion.getDetectedSpringBootVersion());
        assertEquals("OpenJDK 8", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testGradleToolchainFallback() throws IOException {
        String gradle = """
            plugins {
                id 'java'
            }
            java {
                toolchain {
                    languageVersion = JavaLanguageVersion.of(21)
                }
            }
            """;
        Files.writeString(tempDir.resolve("build.gradle"), gradle);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("21", suggestion.getDetectedJavaVersion());
        assertEquals("Oracle JDK 21", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testGradleSourceCompatibilityFallback() throws IOException {
        String gradle = """
            plugins {
                id 'java'
            }
            sourceCompatibility = '11'
            targetCompatibility = '11'
            """;
        Files.writeString(tempDir.resolve("build.gradle"), gradle);

        JdkSuggestion suggestion = controller.suggestJdk(tempDir.toString());
        assertEquals("11", suggestion.getDetectedJavaVersion());
        assertEquals("AdoptOpenJDK 11", suggestion.getSuggestedJdkName());
        assertTrue(suggestion.isMatchingJdkFound());
    }

    @Test
    public void testSuggestNameFromApplicationProperties() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        Files.writeString(resDir.resolve("application.properties"), "server.port=8081\nspring.application.name=payment-service\n");

        String name = controller.suggestName(tempDir.toString());
        assertEquals("payment-service", name);
    }

    @Test
    public void testSuggestNameFromApplicationYml() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        String yaml = """
            server:
              port: 9001
            spring:
              application:
                name: auth-microservice
            """;
        Files.writeString(resDir.resolve("application.yml"), yaml);

        String name = controller.suggestName(tempDir.toString());
        assertEquals("auth-microservice", name);
    }

    @Test
    public void testSuggestNameFromPomXml() throws IOException {
        String pom = """
            <project>
                <parent>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-parent</artifactId>
                    <version>3.2.2</version>
                </parent>
                <groupId>com.example</groupId>
                <artifactId>inventory-service</artifactId>
                <version>1.0.0</version>
            </project>
            """;
        Files.writeString(tempDir.resolve("pom.xml"), pom);

        String name = controller.suggestName(tempDir.toString());
        assertEquals("inventory-service", name);
    }

    @Test
    public void testSuggestNameFromPackageJson() throws IOException {
        String pkg = """
            {
              "name": "dashboard-ui",
              "version": "1.0.0"
            }
            """;
        Files.writeString(tempDir.resolve("package.json"), pkg);

        String name = controller.suggestName(tempDir.toString());
        assertEquals("dashboard-ui", name);
    }

    @Test
    public void testScanNestedMicroservicesDirectory() throws IOException {
        // Create root repo with nested microservices
        Path authServiceDir = Files.createDirectories(tempDir.resolve("services/auth-service"));
        Path authResDir = Files.createDirectories(authServiceDir.resolve("src/main/resources"));
        Files.writeString(authServiceDir.resolve("pom.xml"), "<project><properties><java.version>17</java.version></properties><artifactId>auth-service</artifactId></project>");
        Files.writeString(authResDir.resolve("application.properties"), "server.port=8081\nspring.application.name=auth-service\n");

        Path orderServiceDir = Files.createDirectories(tempDir.resolve("services/order-service"));
        Path orderResDir = Files.createDirectories(orderServiceDir.resolve("src/main/resources"));
        Files.writeString(orderServiceDir.resolve("pom.xml"), "<project><properties><java.version>17</java.version></properties><artifactId>order-service</artifactId></project>");
        Files.writeString(orderResDir.resolve("application.properties"), "server.port=8082\nspring.application.name=order-service\n");

        Path frontendDir = Files.createDirectories(tempDir.resolve("frontend"));
        Files.writeString(frontendDir.resolve("package.json"), "{\"name\":\"frontend-web\",\"dependencies\":{\"react\":\"^18.0.0\"}}");
        Files.writeString(frontendDir.resolve("vite.config.ts"), "export default { server: { port: 5173 } };");

        // Ignored directories should not be scanned as services
        Path targetDir = Files.createDirectories(authServiceDir.resolve("target/classes"));
        Files.writeString(targetDir.resolve("pom.xml"), "<project><artifactId>fake-target</artifactId></project>");

        var discovered = controller.scanServices(tempDir.toString(), 4);
        assertEquals(3, discovered.size());

        var names = discovered.stream().map(com.micro.manager.model.DiscoveredService::getName).toList();
        assertTrue(names.contains("auth-service"));
        assertTrue(names.contains("order-service"));
        assertTrue(names.contains("frontend-web"));

        var auth = discovered.stream().filter(s -> s.getName().equals("auth-service")).findFirst().orElseThrow();
        assertEquals(8081, auth.getPort());
        assertEquals("Corretto 17", auth.getJdkName());
        assertEquals("spring-boot", auth.getFramework());
    }

    @Test
    public void testSuggestPortFromPlaceholderDefault() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        Files.writeString(resDir.resolve("application.properties"), "server.port=${PORT:8095}\n");

        Integer port = controller.suggestPort(tempDir.toString());
        assertEquals(8095, port);
    }

    @Test
    public void testSuggestPortFromApplicationLocalPropertiesOverridingDefault() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        Files.writeString(resDir.resolve("application.properties"), "#server.port=8080\n");
        Files.writeString(resDir.resolve("application-local.properties"), "server.port=8084\n");

        Integer port = controller.suggestPort(tempDir.toString());
        assertEquals(8084, port);
    }

    @Test
    public void testSuggestPortFromBootstrapProperties() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        Files.writeString(resDir.resolve("bootstrap.properties"), "server.port=9096\n");

        Integer port = controller.suggestPort(tempDir.toString());
        assertEquals(9096, port);
    }

    @Test
    public void testSuggestPortFromYamlWithCommentsAndQuotes() throws IOException {
        Path resDir = Files.createDirectories(tempDir.resolve("src/main/resources"));
        String yaml = """
            server:
              port: "${SERVER_PORT:8088}" # custom port
            """;
        Files.writeString(resDir.resolve("application.yml"), yaml);

        Integer port = controller.suggestPort(tempDir.toString());
        assertEquals(8088, port);
    }

    @Test
    public void testSuggestPortFromEnvFile() throws IOException {
        Files.writeString(tempDir.resolve(".env"), "PORT=4000\n");

        Integer port = controller.suggestPort(tempDir.toString());
        assertEquals(4000, port);
    }

    @Test
    public void testRadiantFinancialsDirectoriesIfPresent() {
        File otpDir = new File("/Users/apple/Documents/GitHub/RadiantFinancials-OTP/Escrow-dfs-otp-management");
        if (otpDir.exists()) {
            assertEquals(8084, controller.suggestPort(otpDir.getAbsolutePath()));
        }

        File authDir = new File("/Users/apple/Documents/GitHub/RadiantFinancials-auth-service/dfs-authorization-server");
        if (authDir.exists()) {
            assertEquals(8082, controller.suggestPort(authDir.getAbsolutePath()));
        }

        File fabDir = new File("/Users/apple/Documents/GitHub/RadiantFinancials-fab-mock");
        if (fabDir.exists()) {
            assertEquals(8095, controller.suggestPort(fabDir.getAbsolutePath()));
        }

        File supportDir = new File("/Users/apple/Documents/GitHub/RadiantFinancials-Support");
        if (supportDir.exists()) {
            assertEquals(8092, controller.suggestPort(supportDir.getAbsolutePath()));
        }

        File balanceDir = new File("/Users/apple/Documents/GitHub/RadiantFinancials-balance-transfer");
        if (balanceDir.exists()) {
            assertEquals(8089, controller.suggestPort(balanceDir.getAbsolutePath()));
        }
    }

    @Test
    public void testDetectGitBranchFromMockDirectory() throws IOException {
        Path repoDir = tempDir.resolve("my-repo");
        Files.createDirectories(repoDir);
        Path gitDir = repoDir.resolve(".git");
        Files.createDirectories(gitDir);
        Path headFile = gitDir.resolve("HEAD");
        Files.write(headFile, "ref: refs/heads/feature/awesome-service\n".getBytes());

        String branch = ProcessManagerService.detectGitBranch(repoDir.toString());
        assertEquals("feature/awesome-service", branch);

        // Subdirectory check
        Path subDir = repoDir.resolve("sub-service");
        Files.createDirectories(subDir);
        String subBranch = ProcessManagerService.detectGitBranch(subDir.toString());
        assertEquals("feature/awesome-service", subBranch);

        // Controller endpoint check
        java.util.Map<String, String> response = controller.detectBranch(subDir.toString());
        assertNotNull(response);
        assertEquals("feature/awesome-service", response.get("branch"));
    }
}

