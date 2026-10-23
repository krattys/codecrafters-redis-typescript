import * as net from "net";

const RespTypes = {
  Array: "*",
  SimpleString: "+",
  BulkString: "$",
} as const;

function respParser(data: Buffer): string[] {
  let parsedArray: string[] = [];

  let dataString: string = data.toString();
  switch (dataString[0]) {
    case RespTypes.Array:
      {
        let dataArray = dataString.split("\r\n").slice(0, -1);
        const arraySize: Number = parseInt(dataArray[0].substring(1));
        for (let i = 1; i < dataArray.length; i++) {
          if (dataArray[i][0].startsWith(RespTypes.BulkString)) {
            continue;
          }
          parsedArray.push(dataArray[i]);
        }
      } break;
    default:
      {
        console.log("Parser has not been implemented for this data type.\n");
      } break;
  }

  
  return parsedArray;
}

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const parsedArray: any[] = respParser(data);
    switch (parsedArray[0]) {
      case "ECHO": {
        const response: string = `$${parsedArray[1].length}\r\n${parsedArray[1]}\r\n`;
        connection.write(response);
      } break;
      case "PING": {
        const response: string = `+PONG\r\n`;
        connection.write(response);
      } break;
      default: {
        connection.write("_\r\n");
      } break;
    }
  })
});

server.listen(6379, "127.0.0.1");
