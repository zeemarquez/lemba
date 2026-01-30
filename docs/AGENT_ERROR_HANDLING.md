# Agent Orchestrator Error Handling

## Overview

This document describes the comprehensive error handling implementation for the AI agent orchestration system to handle network failures, API errors, and other transient issues.

## Problem

The agent orchestrator was experiencing failures when API calls encountered network issues, particularly:
- `TypeError: Failed to fetch` errors
- Network timeouts
- Rate limiting issues
- Temporary API service outages

These errors would cause the entire workflow to fail without any retry mechanism.

## Solution

### 1. Retry Logic at Multiple Levels

#### Orchestrator Level (`orchestrator.ts`)

Added a new `executeAgentWithRetry` method that wraps agent execution with retry logic:

```typescript
private async executeAgentWithRetry(
    agentType: AgentType,
    instructions: string,
    context: AgentContext,
    onDiff: (diff: DocumentDiff) => void,
    options: OrchestrationOptions,
    maxRetries: number = 3
): Promise<AgentResult>
```

**Features:**
- Up to 3 retry attempts for failed agent executions
- Exponential backoff: 1s, 2s, 4s delays between retries
- Intelligent error detection (retries only retryable errors)
- Detailed logging of retry attempts

**Retryable Error Patterns:**
- `Failed to fetch`
- `Network request failed`
- `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNRESET`
- `Rate limit`, `Too Many Requests`
- HTTP 500, 502, 503, 504 errors

#### API Service Level (`ai-service.ts`)

Added retry logic to core API functions:

1. **`chatCompletionOneRound`** - Used by all specialist agents
   - 3 retry attempts with exponential backoff
   - Retries on network errors and retryable HTTP status codes
   - Preserves token usage tracking

2. **`chatCompletion`** - Used by summarizer agent
   - Same retry logic as above
   - Handles both OpenAI/Google and Anthropic formats

**Helper Functions:**
```typescript
function isRetryableError(error: unknown): boolean
function isRetryableStatus(status: number): boolean
```

#### Individual Agent Level

All specialist agents now wrap their API calls with try-catch blocks:

- **Writer Agent** (`writer.ts`)
- **Planner Agent** (`planner.ts`)
- **Researcher Agent** (`researcher.ts`)
- **Linter Agent** (`linter.ts`)

Each agent provides context-specific error messages:
```typescript
throw new Error(`Writer agent API call failed: ${errorMsg}`);
```

### 2. Error Propagation

The error handling follows a layered approach:

1. **API Service Layer**: Handles network-level retries (3 attempts)
2. **Agent Layer**: Catches API errors and adds context
3. **Orchestrator Layer**: Handles agent-level retries (3 attempts)
4. **Workflow Layer**: Gracefully handles step failures and continues workflow

### 3. Workflow Resilience

When a step fails:
- Error is logged with `agentLog.error`
- `step_failed` event is emitted
- Error result is recorded in workflow
- **Workflow continues** with remaining steps
- Final response includes information about failed steps

```typescript
catch (error) {
    step.status = 'error';
    const errorMsg = String(error);
    agentLog.error(`step ${step.agentType} failed`, errorMsg);
    this.emitEvent({ type: 'step_failed', step, error: errorMsg });
    
    // Continue with other steps if possible
    const errorResult: AgentResult = {
        taskId: step.id,
        agentType: step.agentType,
        status: 'error',
        output: '',
        error: errorMsg,
        startedAt: Date.now(),
        completedAt: Date.now(),
    };
    step.result = errorResult;
    results.push(errorResult);
}
```

## Retry Strategy

### Exponential Backoff

Delays between retry attempts:
- 1st retry: 1 second
- 2nd retry: 2 seconds  
- 3rd retry: 4 seconds
- Maximum delay cap: 5 seconds

### Total Retry Attempts

For a single API call failure:
- API Service Level: 3 attempts
- Agent Level: Error propagation with context
- Orchestrator Level: 3 attempts (for the entire agent execution)

**Maximum total attempts per agent step:** Up to 9 API calls (3 orchestrator retries × 3 API service retries)

## Error Types

### Retryable Errors (will retry)
- Network failures (`Failed to fetch`, timeouts, connection errors)
- Rate limiting (429)
- Server errors (500, 502, 503, 504)
- Temporary service outages

### Non-Retryable Errors (fail immediately)
- Authentication errors (401)
- Bad requests (400)
- Resource not found (404)
- API key issues
- Trial limit exceeded

## User Experience

### During Retries
- Console logs show retry attempts with timing
- UI shows current step status (via events)
- No blocking or hanging

### After Failures
- Clear error messages with context
- Workflow continues with remaining steps
- Summary includes information about failed steps
- Partial results are still returned

## Logging

All retry attempts and failures are logged with:
```typescript
agentLog.info(`Retrying ${agentType} (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms`);
agentLog.warn(`${agentType} failed (attempt ${attempt + 1}/${maxRetries + 1})`, errorMsg);
agentLog.error(`${agentType} failed after ${attempt + 1} attempt(s)`, errorMsg);
```

Filter console by `[AI Agent]` to see all agent-related logs.

## Testing Recommendations

1. **Network Failures**: Test with network disconnected
2. **Rate Limiting**: Make rapid successive requests
3. **Server Errors**: Use mock API that returns 503
4. **Partial Failures**: Test workflow with one agent failing

## Future Improvements

Potential enhancements:
- Circuit breaker pattern for repeated failures
- Configurable retry counts and delays
- Retry metrics and monitoring
- User notification for retry attempts
- Fallback models on persistent failures
- Request deduplication for idempotent operations

## Configuration

Current configuration (can be adjusted):
- Max retries per agent: 3
- Max retries per API call: 3
- Initial delay: 1000ms
- Backoff multiplier: 2x
- Max delay: 5000ms

To modify, update the hardcoded values in:
- `orchestrator.ts`: `executeAgentWithRetry` method
- `ai-service.ts`: `chatCompletionOneRound` and `chatCompletion` functions
