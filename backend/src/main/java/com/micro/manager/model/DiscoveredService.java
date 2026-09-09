package com.micro.manager.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiscoveredService {
    /** Inferred service name from application.properties, pom.xml, etc. */
    private String name;

    /** Absolute directory path of the service */
    private String path;

    /** Relative path from the scanned root directory */
    private String relativePath;

    /** Inferred port from application.properties/yml or framework defaults */
    private int port;

    /** Suggested start command */
    private String startCommand;

    /** Suggested rebuild command */
    private String rebuildCommand;

    /** Detected framework (e.g. spring-boot, gradle, react-vite, python) */
    private String framework;

    /** Matched JDK name if applicable */
    private String jdkName;

    /** Detected Java version (e.g. 17, 11, 8) */
    private String detectedJavaVersion;

    /** Current git branch if applicable */
    private String branch;
}

