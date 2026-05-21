package com.micro.manager.model;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class Project {
    private String name;
    private String description;
    private List<ServiceConfig> services = new ArrayList<>();
}
