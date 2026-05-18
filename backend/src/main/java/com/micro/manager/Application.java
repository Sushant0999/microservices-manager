package com.micro.manager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

import java.awt.Desktop;
import java.net.URI;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        // We need to set java.awt.headless to false so that Desktop.getDesktop() can
        // work
        System.setProperty("java.awt.headless", "false");
        SpringApplication.run(Application.class, args);
    }

    @EventListener({ ApplicationReadyEvent.class })
    public void applicationReadyEvent() {
        System.out.println("Application started ... launching browser");
        String url = "http://localhost:9009";
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            } else {
                Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
