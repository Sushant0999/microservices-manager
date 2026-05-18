import java.io.*;
public class TestRun {
    public static void main(String[] args) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("cmd.exe", "/c", "gradlew bootRun");
        pb.directory(new File("D:/codes/pdfNest/config"));
        pb.redirectErrorStream(true);
        Process p = pb.start();
        BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
        String line;
        while((line = br.readLine())!=null) {
            System.out.println(line);
        }
    }
}
