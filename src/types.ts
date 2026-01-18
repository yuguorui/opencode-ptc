/**
 * Types for the PTC (Programmatic Tool Calling) plugin
 */

import type { createOpencodeClient } from "@opencode-ai/sdk"

/**
 * Represents a tool that can be called programmatically
 */
export interface PTCTool {
  name: string
  description: string
  parameters: Record<string, PTCParameter>
}

export interface PTCParameter {
  type: string
  description?: string
  required?: boolean
  enum?: string[]
  items?: PTCParameter
  properties?: Record<string, PTCParameter>
}

/**
 * Represents an agent that can be invoked
 */
export interface PTCAgent {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
}

/**
 * Represents a skill that can be loaded
 */
export interface PTCSkill {
  name: string
  description: string
}

/**
 * Context passed to executed JavaScript code
 */
export interface PTCContext {
  sessionID: string
  messageID: string
  providerID: string
  modelID: string
  agent: string
  directory?: string
  client: ReturnType<typeof createOpencodeClient>
}

/**
 * Result of executing JavaScript code
 */
export interface PTCExecutionResult {
  success: boolean
  result?: unknown
  error?: string
  logs: string[]
  toolCalls: PTCToolCallRecord[]
}

/**
 * Record of a tool call made during execution
 */
export interface PTCToolCallRecord {
  tool: string
  args: Record<string, unknown>
  result?: string
  error?: string
  duration: number
}

/**
 * Function signature for a generated async tool function
 */
export type PTCToolFunction = (args: Record<string, unknown>) => Promise<string>

/**
 * Function signature for a generated async agent function
 */
export type PTCAgentFunction = (prompt: string, options?: {
  sessionId?: string
}) => Promise<string>

/**
 * Function signature for a generated async skill function
 */
export type PTCSkillFunction = () => Promise<string>

/**
 * The runtime environment exposed to user code
 */
export interface PTCRuntime {
  tools: Record<string, PTCToolFunction>
  agents: Record<string, PTCAgentFunction>
  skills: Record<string, PTCSkillFunction>
  log: (...args: unknown[]) => void
  context: PTCContext
}

/**
 * Options for the PTC executor
 */
export interface PTCExecutorOptions {
  timeout?: number
  maxToolCalls?: number
}
