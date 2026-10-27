// Starts the server over stdio, calls one tool and prints the text an agent reads back.
// Usage: node examples/call.mjs <tool> ['{"json":"arguments"}']
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const [name = 'how_to_hire', args = '{}'] = process.argv.slice(2);
const client = new Client({ name: 'example', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../index.mjs', import.meta.url))] }));
const res = await client.callTool({ name, arguments: JSON.parse(args) });
console.log(res.content.map((c) => c.text).join('\n'));
await client.close();
