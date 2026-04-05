import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

const MCP_SERVER_PATH = path.resolve(
  __dirname,
  "../../../packages/linkedin-mcp-search/dist/index.js"
);

export async function getMcpClient(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [MCP_SERVER_PATH],
    });
    const c = new Client(
      { name: "linkedin-api", version: "1.0.0" },
      { capabilities: {} }
    );
    await c.connect(transport);
    const { tools } = await c.listTools();
    console.log(
      `MCP connected — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`
    );
    client = c;
    return c;
  })();

  return connecting;
}

export async function callMcpTool(
  name: string,
  args: Record<string, any>
): Promise<any> {
  const c = await getMcpClient();
  const res = await c.callTool({ name, arguments: args });
  const text = (res.content as any)?.[0]?.text;
  if (!text) throw new Error("Empty MCP response");
  return JSON.parse(text);
}
