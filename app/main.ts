import * as net from "net";

const respParser: any[] = function(data: Buffer) {
  
}

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    console.log(data.toString().split("\r\n"));
    connection.write("+PONG\r\n");
  })
});

server.listen(6379, "127.0.0.1");
