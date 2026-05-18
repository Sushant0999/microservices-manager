package com.micro.manager.controller;

import com.micro.manager.model.ServiceConfig;
import com.micro.manager.service.ProcessManagerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

@RestController
@RequestMapping("/api/services")
@CrossOrigin(origins = "*")
public class ServiceController {

    @Autowired
    private ProcessManagerService processManager;

    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    @GetMapping
    public Collection<ServiceConfig> listServices() {
        return processManager.getServices();
    }

    @PostMapping
    public void add(@RequestBody ServiceConfig config) throws IOException {
        processManager.addService(config);
    }
    
    @PutMapping("/{name}")
    public void update(@PathVariable String name, @RequestBody ServiceConfig config) throws IOException {
        processManager.updateService(name, config);
    }

    @DeleteMapping("/{name}")
    public void delete(@PathVariable String name) throws IOException {
        processManager.removeService(name);
    }

    @PostMapping("/{name}/start")
    public void start(@PathVariable String name) throws IOException {
        processManager.startService(name);
    }

    @PostMapping("/{name}/stop")
    public void stop(@PathVariable String name) {
        processManager.stopService(name);
    }

    @PostMapping("/{name}/restart")
    public void restart(@PathVariable String name) throws IOException {
        processManager.stopService(name);
        processManager.startService(name);
    }

    @PostMapping("/{name}/rebuild")
    public void rebuild(@PathVariable String name) throws IOException, InterruptedException {
        processManager.rebuildService(name);
    }

    @GetMapping(value = "/{name}/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs(@PathVariable String name) {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        
        Consumer<String> consumer = new Consumer<String>() {
            @Override
            public void accept(String line) {
                try {
                    emitter.send(line);
                } catch (IOException e) {
                    processManager.removeLogConsumer(name, this);
                    throw new RuntimeException(e);
                }
            }
        };

        emitter.onCompletion(() -> processManager.removeLogConsumer(name, consumer));
        emitter.onTimeout(() -> processManager.removeLogConsumer(name, consumer));
        emitter.onError((e) -> processManager.removeLogConsumer(name, consumer));
        
        processManager.addLogConsumer(name, consumer);
        
        return emitter;
    }
}
