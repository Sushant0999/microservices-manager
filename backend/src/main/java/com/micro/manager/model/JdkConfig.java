package com.micro.manager.model;

import lombok.Data;

@Data
public class JdkConfig {
    private String name;
    private String windowsPath;
    private String linuxPath;
    private String macPath;
}
