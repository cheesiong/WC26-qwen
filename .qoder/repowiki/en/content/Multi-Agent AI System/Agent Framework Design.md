# Agent Framework Design

<cite>
**Referenced Files in This Document**
- [agentFramework.js](file://backend/services/agents/agentFramework.js)
- [orchestratorAgent.js](file://backend/services/agents/orchestratorAgent.js)
- [statisticalAgent.js](file://backend/services/agents/statisticalAgent.js)
- [h2hAgent.js](file://backend/services/agents/h2hAgent.js)
- [formAgent.js](file://backend/services/agents/formAgent.js)
- [intelAgent.js](file://backend/services/agents/intelAgent.js)
- [lineupAgent.js](file://backend/services/agents/lineupAgent.js)
- [db.js](file://backend/database/db.js)
- [predictionEngine.js](file://backend/services/predictionEngine.js)
- [README.md](file://README.md)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document explains the multi-agent framework architecture used by the World Cup 2026 prediction system. It focuses on the Agent base class design, the AgentSession orchestration, JSON output schema validation, conflict detection and negotiation mechanics, probability normalization, and database persistence. It also covers session management, parallel execution patterns, and how the system integrates with the broader prediction pipeline.

## Project Structure
The multi-agent system is centered around a shared framework and a set of specialized agents, orchestrated by a central orchestrator. The framework defines the Agent base class and AgentSession orchestration, while each agent specializes in a distinct domain (statistical, head-to-head, form, intelligence, lineup). The orchestrator coordinates data fetching, parallel execution, conflict detection, negotiation, and final synthesis.

```mermaid
graph TB
subgraph "Agent Framework"
AF["agentFramework.js<br/>Agent, AgentSession,<br/>helpers"]
end
subgraph "Specialist Agents"
SA["statisticalAgent.js"]
HA["h2hAgent.js"]
FA["formAgent.js"]
IA["intelAgent.js"]
LA["lineupAgent.js"]
end
subgraph "Orchestration"
OA["orchestratorAgent.js"]
end
subgraph "Persistence"
DB["db.js<br/>SQLite schema<br/>agent_sessions, agent_messages, agent_conflicts"]
end
subgraph "Prediction Engine"
PE["predictionEngine.js<br/>feature flags, weights"]
end
OA --> AF
SA --> AF
HA --> AF
FA --> AF
IA --> AF
LA --> AF
OA --> DB
PE --> OA
```

**Diagram sources**
- [agentFramework.js:198-562](file://backend/services/agents/agentFramework.js#L198-L562)
- [orchestratorAgent.js:1-471](file://backend/services/agents/orchestratorAgent.js#L1-L471)
- [statisticalAgent.js:1-98](file://backend/services/agents/statisticalAgent.js#L1-L98)
- [h2hAgent.js:1-107](file://backend/services/agents/h2hAgent.js#L1-L107)
- [formAgent.js:1-113](file://backend/services/agents/formAgent.js#L1-L113)
- [intelAgent.js:1-126](file://backend/services/agents/intelAgent.js#L1-L126)
- [lineupAgent.js:1-118](file://backend/services/agents/lineupAgent.js#L1-L118)
- [db.js:167-208](file://backend/database/db.js#L167-L208)
- [predictionEngine.js:48-61](file://backend/services/predictionEngine.js#L48-L61)

**Section sources**
- [README.md:18-105](file://README.md#L18-L105)
- [agentFramework.js:1-576](file://backend/services/agents/agentFramework.js#L1-L576)
- [orchestratorAgent.js:1-471](file://backend/services/agents/orchestratorAgent.js#L1-L471)
- [db.js:167-208](file://backend/database/db.js#L167-L208)

## Core Components
- Agent: A lightweight LLM-backed specialist with a fixed role. It supports:
  - Constructor parameters: name, role, model, systemPrompt
  - run(userMessage): executes Round 1 analysis
  - challenge(own, opposing, delta): executes Round 2 rebuttal
- AgentSession: Orchestrates a full multi-agent run:
  - dispatch(tasks): parallel Round 1
  - detectConflicts(): pairwise probability delta checks
  - negotiate(map): parallel Round 2 rebuttals
  - buildFinalOutputs(): merges outputs and adjusts weights
  - save(method): persists session, messages, and conflicts to DB

Key constants and helpers:
- Conflict threshold: 0.20
- Weight adjustment: winner boosted by 1.3×, loser penalized to 0.6×
- JSON schema enforced via AGENT_OUTPUT_SCHEMA
- Probability normalization via normalizeProbs
- Delta computation via maxProbDelta
- Round 2 challenge prompt construction via buildChallengeMessage
- Persistence via saveMessage and agent_sessions/agent_messages/agent_conflicts tables

**Section sources**
- [agentFramework.js:31-576](file://backend/services/agents/agentFramework.js#L31-L576)

## Architecture Overview
The system follows a five-agent specialization pattern with a central orchestrator. The orchestrator builds match context, pre-fetches domain data, dispatches agents in parallel, detects conflicts, negotiates where needed, and synthesizes a final prediction using a log-pool blend with temperature scaling.

```mermaid
sequenceDiagram
participant Orchestrator as "Orchestrator"
participant Agents as "Specialist Agents"
participant Session as "AgentSession"
participant DB as "Database"
Orchestrator->>Orchestrator : Build match context + pre-fetch domain data
Orchestrator->>Session : new AgentSession(matchId)
Orchestrator->>Session : dispatch(agentTasks)
Session->>Agents : run() in parallel
Agents-->>Session : Round 1 outputs
Orchestrator->>Session : detectConflicts()
alt Conflicts detected
Orchestrator->>Session : negotiate(agentMap)
Session->>Agents : challenge() with opponent output
Agents-->>Session : Revised outputs
end
Orchestrator->>Session : buildFinalOutputs()
Session-->>Orchestrator : Final weighted outputs
Orchestrator->>DB : save(method) + savePrediction(...)
Orchestrator-->>Orchestrator : Return prediction result
```

**Diagram sources**
- [orchestratorAgent.js:278-468](file://backend/services/agents/orchestratorAgent.js#L278-L468)
- [agentFramework.js:326-562](file://backend/services/agents/agentFramework.js#L326-L562)
- [db.js:167-208](file://backend/database/db.js#L167-L208)

**Section sources**
- [README.md:18-105](file://README.md#L18-L105)
- [orchestratorAgent.js:1-471](file://backend/services/agents/orchestratorAgent.js#L1-L471)
- [agentFramework.js:1-576](file://backend/services/agents/agentFramework.js#L1-L576)

## Detailed Component Analysis

### Agent Base Class
The Agent class encapsulates a single LLM-backed specialist:
- Constructor accepts name, role, model, and systemPrompt
- run(userMessage) performs:
  - LLM call with systemPrompt + userMessage
  - parseAgentOutput to validate JSON and normalize probabilities
  - Single retry with explicit JSON-only instruction if parsing fails
- challenge(ownOutput, opposingOutput, delta) performs:
  - Builds a Round 2 prompt highlighting differences exceeding the conflict threshold
  - LLM call with systemPrompt + challengeMessage
  - parseAgentOutput with retry; if retry fails, returns original Round 1 output unchanged

```mermaid
classDiagram
class Agent {
+string name
+string role
+string model
+string systemPrompt
+constructor(opts)
+run(userMessage) AgentOutput
+challenge(ownOutput, opposingOutput, delta) AgentOutput
}
```

**Diagram sources**
- [agentFramework.js:201-320](file://backend/services/agents/agentFramework.js#L201-L320)

**Section sources**
- [agentFramework.js:201-320](file://backend/services/agents/agentFramework.js#L201-L320)

### AgentSession Orchestration
AgentSession manages a complete multi-agent run:
- dispatch(agentTasks): parallel Promise.allSettled of run() across agents; collects successful outputs
- detectConflicts(): pairwise comparison using maxProbDelta; flags conflicts where delta ≥ 0.20
- negotiate(agentMap): for each conflict, concurrently challenges both agents; collects revised outputs
- buildFinalOutputs():
  - Seeds from Round 1 outputs with initial finalWeight = weightRecommendation
  - Computes move distance per agent using maxProbDelta between Round 1 and revised outputs
  - Winner (less movement) receives 1.3× weight boost; loser (more movement) receives 0.6× weight reduction and adopts loser’s revised probability
  - Records resolution reasoning
- save(method): inserts agent_sessions row, persists all messages (Round 1 and Round 2 rebuttals), and writes conflict-resolution records

```mermaid
flowchart TD
Start(["AgentSession.start"]) --> Dispatch["dispatch() — parallel Round 1"]
Dispatch --> Detect["detectConflicts() — pairwise deltas ≥ 0.20"]
Detect --> HasConflicts{"Conflicts found?"}
HasConflicts --> |No| BuildFinal["buildFinalOutputs() — seed + weights"]
HasConflicts --> |Yes| Negotiate["negotiate() — parallel Round 2"]
Negotiate --> BuildFinal
BuildFinal --> Save["save(method) — DB persistence"]
Save --> End(["Done"])
```

**Diagram sources**
- [agentFramework.js:326-562](file://backend/services/agents/agentFramework.js#L326-L562)

**Section sources**
- [agentFramework.js:326-562](file://backend/services/agents/agentFramework.js#L326-L562)

### JSON Output Schema Validation and Parsing
- AGENT_OUTPUT_SCHEMA enforces a strict JSON structure with probability, confidence, evidence, weightRecommendation, and optional flags
- parseAgentOutput(text, agentName, model, round, latencyMs) validates and normalizes:
  - Extracts JSON using extractJSON (code fence, first object, or regex fallback)
  - normalizeProbs ensures probabilities sum to 1.0
  - Clamps confidence and weightRecommendation to [0,1]
  - Adds parseError and rawResponse metadata for robustness

```mermaid
flowchart TD
A["Raw LLM text"] --> B["extractJSON()"]
B --> C{"Valid JSON?"}
C --> |No| D["Fallback to uniform prior + flags"]
C --> |Yes| E["normalizeProbs()"]
E --> F["Clamp confidence and weightRecommendation"]
F --> G["Attach metadata (agent, model, round, latency)"]
D --> H["Return AgentOutput"]
G --> H
```

**Diagram sources**
- [agentFramework.js:40-146](file://backend/services/agents/agentFramework.js#L40-L146)

**Section sources**
- [agentFramework.js:40-146](file://backend/services/agents/agentFramework.js#L40-L146)

### Conflict Detection and Weight Adjustment
- Conflict detection uses maxProbDelta to compare Round 1 outputs; any outcome probability difference ≥ 0.20 triggers negotiation
- During negotiation, each agent receives the opponent’s Round 1 output and justification
- After Round 2, the agent that moved less is considered the winner and gains a 1.3× weight boost; the loser’s weight is reduced to 0.6× and adopts the loser’s revised probability in the final blend

```mermaid
flowchart TD
Start(["Pairwise comparison"]) --> Delta["Compute maxProbDelta"]
Delta --> Threshold{"≥ 0.20?"}
Threshold --> |No| Skip["No conflict"]
Threshold --> |Yes| Record["Record conflict"]
Record --> Rebuttal["Round 2: challenge()"]
Rebuttal --> MoveA["Compute move distance for A"]
Rebuttal --> MoveB["Compute move distance for B"]
MoveA --> Decide{"MoveA ≤ MoveB?"}
MoveB --> Decide
Decide --> |Yes| WinnerA["A wins (less movement)"]
Decide --> |No| WinnerB["B wins (less movement)"]
WinnerA --> AdjustA["A: weight *= 1.3"]
AdjustA --> AdoptA["A: keep own probability"]
WinnerB --> AdjustB["B: weight *= 0.6 and adopt B's revised"]
AdoptA --> Resolve["Record resolution"]
AdjustB --> Resolve
Resolve --> End(["Proceed to final synthesis"])
```

**Diagram sources**
- [agentFramework.js:103-109](file://backend/services/agents/agentFramework.js#L103-L109)
- [agentFramework.js:437-493](file://backend/services/agents/agentFramework.js#L437-L493)

**Section sources**
- [agentFramework.js:19-25](file://backend/services/agents/agentFramework.js#L19-L25)
- [agentFramework.js:103-109](file://backend/services/agents/agentFramework.js#L103-L109)
- [agentFramework.js:437-493](file://backend/services/agents/agentFramework.js#L437-L493)

### Specialized Agents
Each agent extends the Agent base class and provides:
- A domain-specific systemPrompt embedding AGENT_OUTPUT_SCHEMA
- A buildPrompt(context, domainData) function to construct the userMessage
- A fetchDomainData(...) function to pre-fetch external data
- An agent singleton configured with name, role, model, and systemPrompt

Examples:
- StatisticalAgent: interprets Dixon-Coles backbone outputs
- H2HAgent: interprets competition-weighted head-to-head records
- FormAgent: evaluates recent match form with competition weighting
- IntelAgent: interprets injuries, motivation, and rotation
- LineupAgent: analyzes confirmed starting XI strength

```mermaid
classDiagram
class Agent
class StatisticalAgent {
+agent : Agent
+buildPrompt(ctx, data)
+fetchDomainData(...)
}
class H2HAgent {
+agent : Agent
+buildPrompt(ctx, data)
+fetchDomainData(...)
}
class FormAgent {
+agent : Agent
+buildPrompt(ctx, data)
+fetchDomainData(...)
}
class IntelAgent {
+agent : Agent
+buildPrompt(ctx, data)
+fetchDomainData(...)
}
class LineupAgent {
+agent : Agent
+buildPrompt(ctx, data)
+fetchDomainData(...)
}
StatisticalAgent --> Agent : "extends"
H2HAgent --> Agent : "extends"
FormAgent --> Agent : "extends"
IntelAgent --> Agent : "extends"
LineupAgent --> Agent : "extends"
```

**Diagram sources**
- [statisticalAgent.js:1-98](file://backend/services/agents/statisticalAgent.js#L1-L98)
- [h2hAgent.js:1-107](file://backend/services/agents/h2hAgent.js#L1-L107)
- [formAgent.js:1-113](file://backend/services/agents/formAgent.js#L1-L113)
- [intelAgent.js:1-126](file://backend/services/agents/intelAgent.js#L1-L126)
- [lineupAgent.js:1-118](file://backend/services/agents/lineupAgent.js#L1-L118)
- [agentFramework.js:13-30](file://backend/services/agents/agentFramework.js#L13-L30)

**Section sources**
- [statisticalAgent.js:1-98](file://backend/services/agents/statisticalAgent.js#L1-L98)
- [h2hAgent.js:1-107](file://backend/services/agents/h2hAgent.js#L1-L107)
- [formAgent.js:1-113](file://backend/services/agents/formAgent.js#L1-L113)
- [intelAgent.js:1-126](file://backend/services/agents/intelAgent.js#L1-L126)
- [lineupAgent.js:1-118](file://backend/services/agents/lineupAgent.js#L1-L118)

### Orchestrator Integration and Final Synthesis
The orchestrator coordinates the entire pipeline:
- Pre-fetches domain data in parallel (H2H, form, intel, lineup)
- Builds agent tasks and agentMap
- Creates AgentSession and dispatches Round 1
- Detects conflicts and negotiates if needed
- Builds final outputs and synthesizes using log-pool blending with temperature scaling
- Generates insight via LLM and saves prediction and session to DB

```mermaid
sequenceDiagram
participant PE as "predictionEngine.js"
participant OA as "orchestratorAgent.js"
participant AS as "AgentSession"
participant DB as "db.js"
PE->>OA : runMultiAgentPrediction(matchId, precomputed)
OA->>OA : Pre-fetch domain data (parallel)
OA->>AS : new AgentSession(matchId)
OA->>AS : dispatch(agentTasks)
OA->>AS : detectConflicts()
alt Conflicts exist
OA->>AS : negotiate(agentMap)
end
OA->>AS : buildFinalOutputs()
OA->>DB : save(method) + savePrediction(...)
OA-->>PE : Return prediction result
```

**Diagram sources**
- [predictionEngine.js:48-61](file://backend/services/predictionEngine.js#L48-L61)
- [orchestratorAgent.js:278-468](file://backend/services/agents/orchestratorAgent.js#L278-L468)
- [agentFramework.js:326-562](file://backend/services/agents/agentFramework.js#L326-L562)
- [db.js:167-208](file://backend/database/db.js#L167-L208)

**Section sources**
- [orchestratorAgent.js:1-471](file://backend/services/agents/orchestratorAgent.js#L1-L471)
- [predictionEngine.js:48-61](file://backend/services/predictionEngine.js#L48-L61)

## Dependency Analysis
- Agent depends on:
  - chatComplete (Qwen client) for LLM calls
  - AGENT_OUTPUT_SCHEMA for validation
  - normalizeProbs and maxProbDelta for processing
- AgentSession depends on:
  - Agent instances and their outputs
  - Database schema for persistence
  - saveMessage helper for message insertion
- Orchestrator depends on:
  - Specialist agents and their buildPrompt/fetchDomainData
  - AgentSession for orchestration
  - DB for saving predictions and sessions
- Database schema supports:
  - agent_sessions (session metadata)
  - agent_messages (Round 1 and Round 2 rebuttals)
  - agent_conflicts (detected conflicts and resolutions)

```mermaid
graph LR
AgentFramework["agentFramework.js"] --> Qwen["qwenClient.js"]
AgentFramework --> DB["db.js"]
Specialist["Specialist Agents"] --> AgentFramework
Orchestrator["orchestratorAgent.js"] --> AgentFramework
Orchestrator --> DB
PE["predictionEngine.js"] --> Orchestrator
```

**Diagram sources**
- [agentFramework.js:27-29](file://backend/services/agents/agentFramework.js#L27-L29)
- [orchestratorAgent.js:28-30](file://backend/services/agents/orchestratorAgent.js#L28-L30)
- [db.js:1-252](file://backend/database/db.js#L1-L252)
- [predictionEngine.js:37-53](file://backend/services/predictionEngine.js#L37-L53)

**Section sources**
- [agentFramework.js:27-29](file://backend/services/agents/agentFramework.js#L27-L29)
- [orchestratorAgent.js:28-30](file://backend/services/agents/orchestratorAgent.js#L28-L30)
- [db.js:167-208](file://backend/database/db.js#L167-L208)
- [predictionEngine.js:37-53](file://backend/services/predictionEngine.js#L37-L53)

## Performance Considerations
- Parallelism:
  - Round 1: Promise.allSettled across agents to avoid blocking on failures
  - Round 2: Promise.all for simultaneous rebuttals within each conflict
- Robustness:
  - Single retry with explicit JSON-only instruction when parsing fails
  - Graceful fallback to uniform prior with parseError flags
- Cost control:
  - Lower temperature and smaller maxTokens for deterministic, concise outputs
- Persistence:
  - Batched inserts for messages and conflicts to minimize overhead

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and remedies:
- JSON parsing failures:
  - parseAgentOutput returns fallback with parseError and flags; inspect rawResponse and latencyMs
  - Retry attempts apply stricter instructions; if still failing, investigate systemPrompt or model limits
- LLM call failures:
  - Agent.run and Agent.challenge catch exceptions and fall back to parseAgentOutput with empty text
  - Check network connectivity and API credentials
- Session persistence errors:
  - save() and saveMessage wrap DB operations in try/catch; errors are logged and do not abort the run
- Missing or insufficient domain data:
  - Some agents skip when data is unavailable (e.g., H2H with <2 meetings, LineupAgent when unavailable)
  - Verify dataService endpoints and caching layers

**Section sources**
- [agentFramework.js:221-262](file://backend/services/agents/agentFramework.js#L221-L262)
- [agentFramework.js:272-319](file://backend/services/agents/agentFramework.js#L272-L319)
- [agentFramework.js:175-195](file://backend/services/agents/agentFramework.js#L175-L195)
- [orchestratorAgent.js:325-363](file://backend/services/agents/orchestratorAgent.js#L325-L363)

## Conclusion
The multi-agent framework cleanly separates concerns between a reusable Agent base class, a robust AgentSession orchestration, and domain-specialized agents. It enforces strict JSON output validation, implements conflict detection and negotiation with clear weight adjustments, and persists all artifacts for auditability. The orchestrator coordinates pre-fetching, parallel execution, and final synthesis, integrating seamlessly with the broader prediction pipeline and database schema.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Database Schema Overview
- agent_sessions: session metadata (agents_used, rounds, conflicts, synthesis_method, wall_time_ms)
- agent_messages: per-agent messages (round, agent, role, probability, confidence, evidence, raw_response, latency_ms)
- agent_conflicts: detected conflicts and resolutions (delta, resolution, winner, reasoning)

```mermaid
erDiagram
AGENT_SESSIONS {
text id PK
text match_id
text agents_used
int rounds
int conflicts_detected
int conflicts_resolved
text synthesis_method
int wall_time_ms
text created_at
}
AGENT_MESSAGES {
int id PK
text session_id FK
int round
text agent
text role
text probability
real confidence
text evidence
text raw_response
int latency_ms
text created_at
}
AGENT_CONFLICTS {
int id PK
text session_id FK
text agent_a
text agent_b
real delta
int round_detected
text resolution
text winner
text resolution_reasoning
text created_at
}
AGENT_SESSIONS ||--o{ AGENT_MESSAGES : "contains"
AGENT_SESSIONS ||--o{ AGENT_CONFLICTS : "records"
```

**Diagram sources**
- [db.js:167-208](file://backend/database/db.js#L167-L208)

**Section sources**
- [db.js:167-208](file://backend/database/db.js#L167-L208)