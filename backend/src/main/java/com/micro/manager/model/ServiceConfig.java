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
}
