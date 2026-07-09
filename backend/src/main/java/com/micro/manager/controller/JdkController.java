package com.micro.manager.controller;

import com.micro.manager.model.JdkConfig;
import com.micro.manager.service.ProcessManagerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Collection;

@RestController
@RequestMapping("/api/jdks")
@CrossOrigin(origins = "*")
public class JdkController {

    @Autowired
    private ProcessManagerService processManager;

    @GetMapping
    public Collection<JdkConfig> listJdks() {
        return processManager.getJdks();
    }

    @PostMapping
    public void addJdk(@RequestBody JdkConfig config) throws IOException {
        processManager.addJdk(config);
    }

    @PostMapping("/detect")
    public Collection<JdkConfig> detectJdks() throws IOException {
        processManager.detectJdks();
        return processManager.getJdks();
    }

    @PutMapping("/{name}")
    public void updateJdk(@PathVariable String name, @RequestBody JdkConfig config) throws IOException {
        processManager.updateJdk(name, config);
    }

    @DeleteMapping("/{name}")
    public void deleteJdk(@PathVariable String name) throws IOException {
        processManager.removeJdk(name);
    }
}
