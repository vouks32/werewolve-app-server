import http from 'http'
import { exec } from "child_process"

const PORT = 9000;

http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/webhook") {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });
 
        req.on("end", () => {
            console.log("Webhook received:", new Date().toISOString());
 
            // Call your PowerShell script
            exec('powershell -ExecutionPolicy Bypass -File "C:\\Users\\Administrator\\Desktop\\werewolf\\auto-pull\\update.ps1"', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
            });

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("OK");
        });
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
}).listen(PORT, () => {
    console.log(`Listening for webhooks on http://localhost:${PORT}/webhook`);
});
