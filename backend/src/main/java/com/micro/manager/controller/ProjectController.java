package com.micro.manager.controller;

import com.micro.manager.model.Project;
import com.micro.manager.model.ServiceConfig;
import com.micro.manager.service.ProcessManagerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Collection;
import java.util.function.Consumer;

@RestController
@RequestMapping("/api/projects")
@CrossOrigin(origins = "*")
public class ProjectController {

    @Autowired
    private ProcessManagerService processManager;

    @GetMapping
    public Collection<Project> listProjects() {
        return processManager.getProjects();
    }

    @PostMapping
    public void createProject(@RequestBody Project project) throws IOException {
        processManager.addProject(project);
    }

    @PutMapping("/{name}")
    public void updateProject(@PathVariable String name, @RequestBody Project project) throws IOException {
        processManager.updateProject(name, project);
    }

    @DeleteMapping("/{name}")
    public void deleteProject(@PathVariable String name) throws IOException {
        processManager.removeProject(name);
    }

    @PostMapping("/{projectName}/services")
    public void addService(@PathVariable String projectName, @RequestBody ServiceConfig config) throws IOException {
        processManager.addService(projectName, config);
    }

    @PutMapping("/{projectName}/services/{name}")
    public void updateService(@PathVariable String projectName, @PathVariable String name, @RequestBody ServiceConfig config) throws IOException {
        processManager.updateService(projectName, name, config);
    }

    @DeleteMapping("/{projectName}/services/{name}")
    public void deleteService(@PathVariable String projectName, @PathVariable String name) throws IOException {
        processManager.removeService(projectName, name);
    }

    @PostMapping("/{projectName}/services/{name}/start")
    public void startService(@PathVariable String projectName, @PathVariable String name) throws IOException {
        processManager.startService(projectName, name);
    }

    @PostMapping("/{projectName}/services/{name}/stop")
    public void stopService(@PathVariable String projectName, @PathVariable String name) {
        processManager.stopService(projectName, name);
    }

    @PostMapping("/{projectName}/services/{name}/restart")
    public void restartService(@PathVariable String projectName, @PathVariable String name) throws IOException {
        processManager.stopService(projectName, name);
        processManager.startService(projectName, name);
    }

    @PostMapping("/{projectName}/services/{name}/rebuild")
    public void rebuildService(@PathVariable String projectName, @PathVariable String name) throws IOException, InterruptedException {
        processManager.rebuildService(projectName, name);
    }

    @GetMapping(value = "/{projectName}/services/{name}/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs(@PathVariable String projectName, @PathVariable String name) {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        
        Consumer<String> consumer = new Consumer<String>() {
            @Override
            public void accept(String line) {
                try {
                    emitter.send(line);
                } catch (IOException e) {
                    processManager.removeLogConsumer(projectName, name, this);
                    throw new RuntimeException(e);
                }
            }
        };

        emitter.onCompletion(() -> processManager.removeLogConsumer(projectName, name, consumer));
        emitter.onTimeout(() -> processManager.removeLogConsumer(projectName, name, consumer));
        emitter.onError((e) -> processManager.removeLogConsumer(projectName, name, consumer));
        
        processManager.addLogConsumer(projectName, name, consumer);
        
        return emitter;
    }
}
