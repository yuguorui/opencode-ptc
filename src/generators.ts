import type { createOpencodeClient } from "@opencode-ai/sdk"
import type {
  PTCTool,
  PTCAgent,
  PTCSkill,
  PTCParameter,
  PTCToolFunction,
  PTCAgentFunction,
  PTCSkillFunction,
  PTCToolCallRecord,
  PTCContext,
} from "./types"

type OpencodeClient = ReturnType<typeof createOpencodeClient>

export async function resolveDefaultModel(
  client: OpencodeClient,
  directory?: string,
): Promise<{ providerID: string; modelID: string }> {
  const configResponse = await client.config.get({
    query: { directory },
  })
  if (configResponse.error) {
    throw new Error(`Failed to fetch config: ${JSON.stringify(configResponse.error)}`)
  }
  const config = configResponse.data
  if (config?.model) {
    const [providerID, modelID] = config.model.split("/")
    if (providerID && modelID) {
      return { providerID, modelID }
    }
  }

  const providersResponse = await client.config.providers({
    query: { directory },
  })
  if (providersResponse.error) {
    throw new Error(`Failed to fetch providers: ${JSON.stringify(providersResponse.error)}`)
  }
  const providers = providersResponse.data
  const entries = Object.entries(providers?.default ?? {})
  if (entries.length > 0) {
    const [providerID, modelID] = entries[0]
    if (providerID && typeof modelID === "string") {
      return { providerID, modelID }
    }
  }

  throw new Error("No default model configured. Set config.model in opencode.json.")
}

export async function fetchAvailableTools(
  client: OpencodeClient,
  provider: string,
  model: string,
  directory?: string,
): Promise<PTCTool[]> {
  const response = await client.tool.list({
    query: { provider, model, directory },
  })
  if (response.error) {
    throw new Error(`Failed to fetch tools: ${JSON.stringify(response.error)}`)
  }
  const toolList = response.data ?? []

  const tools: PTCTool[] = []
  for (const toolDef of toolList) {
    const parameters: Record<string, PTCParameter> = {}
    const schema = (toolDef as Record<string, unknown>).parameters as Record<string, unknown> | undefined
    if (schema?.properties && typeof schema.properties === "object") {
      for (const [paramName, paramDef] of Object.entries(schema.properties as Record<string, unknown>)) {
        const param = paramDef as Record<string, unknown>
        parameters[paramName] = {
          type: (param.type as string) ?? "string",
          description: param.description as string | undefined,
          required: Array.isArray(schema.required) && schema.required.includes(paramName),
          enum: Array.isArray(param.enum) ? (param.enum as string[]) : undefined,
          items: param.items as PTCParameter | undefined,
          properties: param.properties as Record<string, PTCParameter> | undefined,
        }
      }
    }

    tools.push({
      name: toolDef.id,
      description: toolDef.description ?? "",
      parameters,
    })
  }

  return tools
}

export async function fetchAvailableAgents(client: OpencodeClient): Promise<PTCAgent[]> {
  const response = await client.app.agents()
  if (response.error) {
    throw new Error(`Failed to fetch agents: ${JSON.stringify(response.error)}`)
  }

  return (response.data ?? [])
    .filter(agent => agent.mode !== "primary")
    .map(agent => ({
      name: agent.name,
      description: agent.description,
      mode: agent.mode,
    }))
}

export async function fetchAvailableSkills(_client: OpencodeClient): Promise<PTCSkill[]> {
  return []
}

export function createToolFunction(
  client: OpencodeClient,
  tool: PTCTool,
  context: PTCContext,
  callRecords: PTCToolCallRecord[],
): PTCToolFunction {
  return async (args: Record<string, unknown>): Promise<string> => {
    const startTime = Date.now()
    const record: PTCToolCallRecord = {
      tool: tool.name,
      args,
      duration: 0,
    }

    try {
      const response = await client.tool.execute({
        query: { directory: context.directory },
        body: {
          sessionID: context.sessionID,
          messageID: context.messageID,
          providerID: context.providerID,
          modelID: context.modelID,
          toolID: tool.name,
          args,
          agent: context.agent,
        },
      })
      if (response.error) {
        throw new Error(`Tool execute failed: ${JSON.stringify(response.error)}`)
      }
      const output = response.data?.output ?? ""
      record.result = output
      return output
    } catch (err) {
      record.error = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      record.duration = Date.now() - startTime
      callRecords.push(record)
    }
  }
}

export function createAgentFunction(
  _client: OpencodeClient,
  agent: PTCAgent,
  _context: PTCContext,
  callRecords: PTCToolCallRecord[],
): PTCAgentFunction {
  return async (prompt: string, _options?: { sessionId?: string }): Promise<string> => {
    const startTime = Date.now()
    const record: PTCToolCallRecord = {
      tool: `agent:${agent.name}`,
      args: { prompt },
      duration: 0,
    }

    try {
      record.error = "Agent calls are not yet supported in direct execution mode"
      throw new Error(`Agent calls are not yet supported. Use the 'task' tool directly for agent invocation.`)
    } finally {
      record.duration = Date.now() - startTime
      callRecords.push(record)
    }
  }
}

export function createSkillFunction(
  _client: OpencodeClient,
  skill: PTCSkill,
  _context: PTCContext,
  callRecords: PTCToolCallRecord[],
): PTCSkillFunction {
  return async (): Promise<string> => {
    const startTime = Date.now()
    const record: PTCToolCallRecord = {
      tool: `skill:${skill.name}`,
      args: {},
      duration: 0,
    }

    try {
      record.error = "Skill calls are not yet supported in direct execution mode"
      throw new Error(`Skill calls are not yet supported. Use the 'skill' tool directly.`)
    } finally {
      record.duration = Date.now() - startTime
      callRecords.push(record)
    }
  }
}

export function generateFunctionSignatures(
  tools: PTCTool[],
  agents: PTCAgent[],
  skills: PTCSkill[],
): string {
  const lines: string[] = []

  lines.push("// Available Tools")
  lines.push("")

  for (const tool of tools) {
    const params = Object.entries(tool.parameters)
      .map(([name, param]) => `${name}${param.required ? "" : "?"}: ${mapTypeToTS(param.type)}`)
      .join(", ")

    lines.push(`// ${tool.description}`)
    lines.push(`async function ${sanitizeName(tool.name)}(args: { ${params} }): Promise<string>`)
    lines.push("")
  }

  lines.push("// Available Agents (listing only - use 'task' tool for invocation)")
  lines.push("")

  for (const agent of agents) {
    lines.push(`// ${agent.description ?? "No description"}`)
    lines.push(`// agents.${sanitizeName(agent.name)} - not directly callable`)
    lines.push("")
  }

  if (skills.length > 0) {
    lines.push("// Available Skills (listing only - use 'skill' tool for invocation)")
    lines.push("")
    for (const skill of skills) {
      lines.push(`// ${skill.description}`)
      lines.push(`// skills.${sanitizeName(skill.name)} - not directly callable`)
      lines.push("")
    }
  }

  return lines.join("\n")
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_")
}

function mapTypeToTS(type: string): string {
  switch (type) {
    case "string":
      return "string"
    case "number":
    case "integer":
      return "number"
    case "boolean":
      return "boolean"
    case "array":
      return "unknown[]"
    case "object":
      return "Record<string, unknown>"
    default:
      return "unknown"
  }
}
