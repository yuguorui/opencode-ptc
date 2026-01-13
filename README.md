# opencode-pct

**Programmatic Tool Calling (PTC)** plugin for [OpenCode](https://github.com/sst/opencode).

This plugin enables models to execute JavaScript code that can orchestrate multiple tool calls, agents, and skills in a single execution context.

## Installation

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["file:///path/to/opencode-pct"]
}
```

Or install from npm (when published):

```json
{
  "plugin": ["opencode-pct"]
}
```

## Usage

Once installed, the plugin exposes two new tools:

### `ptc_execute`

Execute JavaScript code that can call available tools, agents, and skills programmatically.

**Arguments:**
- `code` (string, required): JavaScript code to execute
- `listAvailable` (boolean, optional): If true, returns list of available functions instead of executing code

**Example:**

```javascript
// Read multiple files in parallel
const [file1, file2] = await Promise.all([
  tools.read({ filePath: "/path/to/file1.ts" }),
  tools.read({ filePath: "/path/to/file2.ts" }),
]);

// Search for patterns
const matches = await tools.grep({ pattern: "TODO", path: "src" });

// Delegate to an agent for complex analysis
const analysis = await agents.explore("Find all API endpoints and their handlers");

// Log progress
log("Analysis complete, found endpoints");

// Return structured result
return {
  file1Length: file1.length,
  file2Length: file2.length,
  matches: matches.split("\n").length,
  analysis
};
```

### `ptc_list`

List all available tools, agents, and skills with their TypeScript-style signatures.

## Available Globals

Inside the executed JavaScript code, these globals are available:

| Global | Description |
|--------|-------------|
| `tools` | Object containing all available tools as async functions |
| `agents` | Object containing all available agents as async functions |
| `skills` | Object containing all available skills as async functions |
| `log(...args)` | Function to log messages (captured in output) |
| `context` | Object with `sessionID` and `messageID` |

## How It Works

1. **Discovery**: On execution, the plugin fetches all available tools, agents, and skills from the OpenCode session
2. **Translation**: Each capability is translated into an async JavaScript function
3. **Execution**: The provided code is executed in a sandboxed async context with access to these functions
4. **Orchestration**: Tool calls made during execution are tracked and reported in the output

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck
```

## License

MIT
