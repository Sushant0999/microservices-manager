package com.micro.manager.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JdkSuggestion {
    /** Normalized detected Java major version, e.g. "8", "11", "17", "21". Null if not detected. */
    private String detectedJavaVersion;
    
    /** Original version string found in build config, e.g. "17", "1.8", "3.2.2". */
    private String rawJavaVersion;
    
    /** Detected Spring Boot version if found, e.g. "3.2.2", "2.7.14". */
    private String detectedSpringBootVersion;
    
    /** Explanation of how the version was determined. */
    private String detectionSource;
    
    /** Name of the matched configured JDK (from JDKs list), or null if none matched. */
    private String suggestedJdkName;
    
    /** True if a matching JDK from the configured JDK list was found. */
    private boolean matchingJdkFound;
}
