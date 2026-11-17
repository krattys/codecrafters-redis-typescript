import * as net from "net";

const RespTypes = {
  Array: "*",
  SimpleString: "+",
  BulkString: "$",
  Integer: ":",
} as const;

type RespValue =
  | { type: "simple-string"; value: string }
  | { type: "bulk-string"; value: string | null }
  | { type: "array"; value: RespValue[] };

function parseValue(input: string, pos: number): { value: RespValue, next: number } {
  const respType = input[pos];
  const lineEnd = input.indexOf("\r\n", pos);
  if (lineEnd === -1) {
    throw new Error("Incomplete RESP data")
  }
  switch (respType) {
    case RespTypes.SimpleString:
      {
        const value = input.substring(pos + 1, lineEnd);
        return { value: { type: "simple-string", value: value } satisfies RespValue, next: lineEnd + 2 };
      }
    case RespTypes.BulkString:
      {
        const stringLength = parseInt(input.substring(pos + 1, lineEnd));
        if (stringLength === -1) {
          return { value: { type: "bulk-string", value: null }, next: lineEnd + 2 }
        }
        const startPos = lineEnd + 2;
        const endPos = startPos + stringLength;
        if (endPos + 1 >= input.length) {
          throw new Error("Message is truncated and not fully formed");
        }
        if (input.substring(endPos, endPos + 2) !== "\r\n") {
          throw new Error("Message doesn't end with valid separator");
        }
        const value = input.substring(startPos, endPos);
        return { value: { type: "bulk-string", value: value } satisfies RespValue, next: endPos + 2 };
      }
    case RespTypes.Array:
      {
        const arrLength = parseInt(input.substring(pos + 1, lineEnd));
        let respArr: RespValue[] = [];
        let next = lineEnd + 2;
        for (let i = 0; i < arrLength; i++) {
          let val = parseValue(input, next);
          respArr.push(val.value);
          next = val.next;
        }
        return { value: { type: "array", value: respArr } satisfies RespValue, next: next };
      }
    default:
      throw new Error("Unhandled type.");
  }
}

function respParser(data: Buffer): RespValue[] {
  let parsedArray: RespValue[] = [];
  const dataString = data.toString().split("\r\n").slice(0, -1);
  console.log("dataString: ", dataString);

  // switch (dataString[0]) {
  //   case RespTypes.Array:
  //     {
  //       let dataArray = dataString.split("\r\n").slice(0, -1);
  //       const arraySize: number = parseInt(dataArray[0].substring(1));
  //       for (let i = 1; i < dataArray.length; i++) {
  //         if (dataArray[i][0].startsWith(RespTypes.BulkString)) {
  //           continue;
  //         }
  //         parsedArray.push(dataArray[i]);
  //       }
  //     }
  //     break;
  //   default:
  //     {
  //       console.log("Parser has not been implemented for this data type.\n");
  //     }
  //     break;
  // }

  return parsedArray;
}

// Uncomment the code below to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    const parsedArray: any[] = respParser(data);
    switch (parsedArray[0]) {
      case "ECHO":
        {
          const response: string = `$${parsedArray[1].length}\r\n${parsedArray[1]}\r\n`;
          connection.write(response);
        }
        break;
      case "PING":
        {
          const response: string = `+PONG\r\n`;
          connection.write(response);
        }
        break;
      default:
        {
          connection.write("_\r\n");
        }
        break;
    }
  });
});

server.listen(6379, "127.0.0.1");
