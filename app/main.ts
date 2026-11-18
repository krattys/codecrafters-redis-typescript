import * as net from "net";

const RespTypes = {
  Array: "*",
  SimpleString: "+",
  BulkString: "$",
  Integer: ":",
} as const;

type RespValue =
  | { type: "simple-string"; data: string }
  | { type: "bulk-string"; data: string | null }
  | { type: "array"; data: RespValue[] }
  | { type: "error"; data: string };

type Command = { name: "PING" } | { name: "ECHO"; args: string };

function parseValue(
  input: string,
  pos: number,
): { value: RespValue; next: number } {
  const respType = input[pos];
  const lineEnd = input.indexOf("\r\n", pos);
  if (lineEnd === -1) {
    throw new Error("Incomplete RESP data");
  }
  switch (respType) {
    case RespTypes.SimpleString: {
      const value = input.substring(pos + 1, lineEnd);
      return {
        value: { type: "simple-string", data: value } satisfies RespValue,
        next: lineEnd + 2,
      };
    }
    case RespTypes.BulkString: {
      const stringLength = parseInt(input.substring(pos + 1, lineEnd));
      if (stringLength === -1) {
        return {
          value: { type: "bulk-string", data: null },
          next: lineEnd + 2,
        };
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
      return {
        value: { type: "bulk-string", data: value } satisfies RespValue,
        next: endPos + 2,
      };
    }
    case RespTypes.Array: {
      const arrLength = parseInt(input.substring(pos + 1, lineEnd));
      let respArr: RespValue[] = [];
      let next = lineEnd + 2;
      for (let i = 0; i < arrLength; i++) {
        let val = parseValue(input, next);
        respArr.push(val.value);
        next = val.next;
      }
      return {
        value: { type: "array", data: respArr } satisfies RespValue,
        next: next,
      };
    }
    default:
      throw new Error("Unhandled type.");
  }
}

function toCommand(value: RespValue): Command {
  const type = value.type;
  switch (type) {
    case "simple-string":
    case "bulk-string": {
      throw new Error("Wrong data type for the message. Use arrays.");
    }
    case "array": {
      const commandStringArr = value.data.map(function (el): string {
        const elementType = el.type;
        switch (elementType) {
          case "array":
          case "simple-string": {
            throw new Error(
              "Wrong data type for command string. Use bulk strings.",
            );
          }
          case "bulk-string": {
            if (el.data === null) {
              throw new Error("Command or args cannot be null.");
            }
            return el.data;
          }
          case "error": {
            throw new Error(el.data);
          }
          default: {
            const unhandledType: never = elementType;
            throw new Error(`Unhandled type ${unhandledType}`);
          }
        }
      });

      const [name, args, ...rest] = commandStringArr;
      if (name === undefined) {
        throw new Error("Give a valid command.");
      }

      const command = name.toUpperCase();
      switch (command) {
        case "PING": {
          if (args === undefined) {
            return { name: "PING" };
          }
          throw new Error(`Wrong args for ${command} command.`);
        }
        case "ECHO": {
          if (rest.length > 0 || args === undefined) {
            throw new Error(`Wrong args for ${command} command.`);
          }
          return { name: "ECHO", args: args };
        }
        default: {
          throw new Error(`Unmapped command ${command}.`);
        }
      }
    }
    case "error": {
      throw new Error(value.data);
    }
    default: {
      const unhandledType: never = type;
      throw new Error(`Unmapped type ${unhandledType}.`);
    }
  }
}

function encode(value: RespValue): string {
  switch (value.type) {
    case "simple-string": {
      if (/[\r\n]/.test(value.data)) {
        throw new Error(
          "Data is wrong for this type. It contains newline characters.",
        );
      }
      return `+${value.data}\r\n`;
    }
    case "bulk-string": {
      if (value.data === null) {
        return `$-1\r\n`;
      }
      return `$${value.data.length}\r\n${value.data}\r\n`;
    }
    case "array": {
      let encodedArray = `*${value.data.length}\r\n`;
      value.data.forEach((el) => {
        encodedArray += encode(el);
      });
      return encodedArray;
    }
    case "error": {
      if (/[\r\n]/.test(value.data)) {
        throw new Error(
          "Data is wrong for this type. It contains newline characters.",
        );
      }
      return `-ERR ${value.data}\r\n`;
    }
    default: {
      const unhandledType: never = value;
      throw new Error(`Unmapped type encountered ${unhandledType}.`);
    }
  }
}

function execute(command: Command): RespValue {
  switch (command.name) {
    case "PING": {
      return { type: "simple-string", data: "PONG" };
    }
    case "ECHO": {
      return { type: "bulk-string", data: command.args };
    }
    default: {
      const unmappedCommand: never = command;
      throw new Error(`Unmapped command type ${unmappedCommand}.`);
    }
  }
}

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.on("data", (data: Buffer) => {
    try {
      const parsedMessage = parseValue(data.toString(), 0);
      const command = toCommand(parsedMessage.value);
      const result = execute(command);
      const response = encode(result);
      connection.write(response);
    } catch (err) {
      if (err instanceof Error) {
        err.message = err.message.replace(/[\r\n]/g, " ").replace(/ {2,}/g, " ");
        const response = encode({ type: "error", data: err.message });
        connection.write(response);
      } else {
        connection.write(
          encode({ type: "error", data: "Incorrect operation." }),
        );
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
