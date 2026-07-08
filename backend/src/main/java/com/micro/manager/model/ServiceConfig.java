package com.micro.manager.model;

import lombok.Data;

@Data
public class ServiceConfig {
    private String name;
    private String projectName = "Default";
    private String path;
    private int port;
    private String startCommand;
    private String rebuildCommand;
    private String status = "STOPPED";
    /** Optional: path to the properties/config file to use when starting this service. Null/empty = use default. */
    private String activePropertiesFile;
}
