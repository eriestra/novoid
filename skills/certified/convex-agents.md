---
name: convex-agents
displayName: Convex Agents
description: Building AI agents with the Convex Agent component including thread management, tool integration, streaming responses, RAG patterns, and workflow orchestration
version: 1.0.0
author: Convex
tags: [convex, agents, ai, llm, tools, rag, workflows]
---

# Convex Agents

Build persistent, stateful AI agents using `@convex-dev/agent`.

> **Rule:** Let Convex handle conversation history and state persistence.

## 1. Setup
Install dependencies and define the agent.

```bash
npm install @convex-dev/agent ai openai
```

```typescript
// convex/agent.ts
import { Agent } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { OpenAI } from "openai";

const openai = new OpenAI();

export const agent = new Agent(components.agent, {
  chat: openai.chat,
});
```

## 2. Thread Management
Create threads to isolate conversations.

```typescript
// Create thread
const threadId = await agent.createThread(ctx, {
  userId: args.userId,
  metadata: { title: "New Conversation" },
});

// Get messages
const messages = await agent.getMessages(ctx, { threadId });
```

## 3. Streaming Responses
Handle responses interactively using `onToken`.

```typescript
const response = await agent.chat(ctx, {
  threadId: args.threadId,
  messages: [{ role: "user", content: args.message }],
  stream: true,
  onToken: async (token) => {
    // Stream tokens to client
    await ctx.runMutation(internal.chat.appendToken, { threadId, token });
  },
});
```

## 4. Registering Tools
Tools are just mapped Convex functions or standard async functions.

```typescript
import { tool } from "@convex-dev/agent";

export const getWeather = tool({
  name: "get_weather",
  description: "Get current weather for a location",
  parameters: v.object({ location: v.string() }),
  handler: async (ctx, args) => {
    return { temp: 72, condition: "Sunny" }; // Example
  },
});
```

Pass them to the chat call:
```typescript
const response = await agent.chat(ctx, {
  threadId,
  messages,
  tools: [getWeather],
});
```
