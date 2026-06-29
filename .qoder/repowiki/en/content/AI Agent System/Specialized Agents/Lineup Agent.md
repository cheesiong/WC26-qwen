# Lineup Agent

<cite>
**Referenced Files in This Document**
- [lineupAgent.js](file://backend/services/agents/lineupAgent.js)
- [lineupService.js](file://backend/services/lineupService.js)
- [agentFramework.js](file://backend/services/agents/agentFramework.js)
- [orchestratorAgent.js](file://backend/services/agents/orchestratorAgent.js)
- [predictionEngine.js](file://backend/services/predictionEngine.js)
- [qwenClient.js](file://backend/services/qwenClient.js)
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

## Introduction
The Lineup Agent is a specialized multi-agent component that analyzes confirmed starting XI data to assess lineup strength and tactical implications for World Cup 2026 matches. It operates only when lineup data is available (typically ~60–75 minutes before kickoff) and carries the highest signal weight among pre-match agents (0.40) because confirmed lineups resolve uncertainty about who will actually play. The agent evaluates:
- Lineup strength scores (0–10 scale) and the delta between teams
- Key player absences versus expected lineups
- Formation matchups and tactical implications
- Whether either team appears to be playing a weakened or rotated side

## Project Structure
The Lineup Agent integrates within the multi-agent prediction framework:
- Agent definition and orchestration: [lineupAgent.js](file://backend/services/agents/lineupAgent.js)
- Domain data fetching and computation: [lineupService.js](file://backend/services/lineupService.js)
- Agent framework and session orchestration: [agentFramework.js](file://backend/services/agents/agentFramework.js)
- Multi-agent orchestrator: [orchestratorAgent.js](file://backend/services/agents/orchestratorAgent.js)
- Prediction engine integration: [predictionEngine.js](file://backend/services/predictionEngine.js)
- LLM client: [qwenClient.js](file://backend/services/qwenClient.js)

```mermaid
graph TB
subgraph "Agent Layer"
LA["LineupAgent<br/>agents/lineupAgent.js"]
AF["Agent Framework<br/>agents/agentFramework.js"]
OA["Orchestrator<br/>agents/orchestratorAgent.js"]
end
subgraph "Domain Layer"
LS["Lineup Service<br/>lineupService.js"]
end
subgraph "LLM Layer"
QC["Qwen Client<br/>qwenClient.js"]
end
subgraph "Prediction Engine"
PE["Prediction Engine<br/>predictionEngine.js"]
end
OA --> LA
LA --> LS
LA --> AF
LA --> QC
OA --> AF
PE --> OA
```

**Diagram sources**
- [lineupAgent.js:1-118](file://backend/services/agents/lineupAgent.js#L1-L118)
- [lineupService.js:1-425](file://backend/services/lineupService.js#L1-L425)
- [agentFramework.js:1-586](file://backend/services/agents/agentFramework.js#L1-L586)
- [orchestratorAgent.js:1-502](file://backend/services/agents/orchestratorAgent.js#L1-L502)
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)
- [qwenClient.js:1-123](file://backend/services/qwenClient.js#L1-L123)

**Section sources**
- [lineupAgent.js:1-118](file://backend/services/agents/lineupAgent.js#L1-L118)
- [lineupService.js:1-425](file://backend/services/lineupService.js#L1-L425)
- [agentFramework.js:1-586](file://backend/services/agents/agentFramework.js#L1-L586)
- [orchestratorAgent.js:1-502](file://backend/services/agents/orchestratorAgent.js#L1-L502)
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)
- [qwenClient.js:1-123](file://backend/services/qwenClient.js#L1-L123)

## Core Components
- Lineup Agent: Specialized LLM agent that analyzes confirmed starting XI data and generates high-confidence probability assessments with explicit weight recommendations.
- Lineup Service: Fetches and computes lineup data from multiple sources, calculates strength scores, detects key absences, and builds structured results for downstream consumption.
- Agent Framework: Provides the Agent class, AgentSession orchestration, conflict detection and negotiation, and standardized output parsing with JSON schema enforcement.
- Orchestrator: Coordinates multi-agent runs, manages agent tasks, conflict resolution, and final probability blending.
- Prediction Engine: Integrates lineup signals into the broader prediction pipeline, weighting lineup data at 0.40 when available.

**Section sources**
- [lineupAgent.js:14-118](file://backend/services/agents/lineupAgent.js#L14-L118)
- [lineupService.js:41-425](file://backend/services/lineupService.js#L41-L425)
- [agentFramework.js:208-586](file://backend/services/agents/agentFramework.js#L208-L586)
- [orchestratorAgent.js:309-502](file://backend/services/agents/orchestratorAgent.js#L309-L502)
- [predictionEngine.js:92-100](file://backend/services/predictionEngine.js#L92-L100)

## Architecture Overview
The Lineup Agent participates in two prediction modes:
- Single-agent mode: Uses the prediction engine’s unified pipeline with lineupToProbs conversion.
- Multi-agent mode: Operates within AgentSession orchestration, generating structured outputs with confidence, evidence, and weight recommendations.

```mermaid
sequenceDiagram
participant PE as "PredictionEngine"
participant OA as "Orchestrator"
participant LA as "LineupAgent"
participant LS as "LineupService"
participant AF as "AgentFramework"
participant QC as "QwenClient"
PE->>OA : "runMultiAgentPrediction(matchId, precomputed)"
OA->>LS : "fetchDomainData(matchId)"
LS-->>OA : "lineupData"
OA->>LA : "buildPrompt(matchContext, lineupData)"
LA->>QC : "chatComplete(systemPrompt + userMessage)"
QC-->>LA : "LLM response"
LA->>AF : "parseAgentOutput(response)"
AF-->>OA : "AgentOutput (probability, confidence, evidence, weightRecommendation)"
OA->>AF : "detectConflicts()"
AF-->>OA : "conflicts"
OA->>AF : "negotiate() if conflicts exist"
AF-->>OA : "finalOutputs"
OA->>PE : "blend finalOutputs -> finalProbs"
```

**Diagram sources**
- [orchestratorAgent.js:319-502](file://backend/services/agents/orchestratorAgent.js#L319-L502)
- [lineupAgent.js:44-118](file://backend/services/agents/lineupAgent.js#L44-L118)
- [lineupService.js:221-316](file://backend/services/lineupService.js#L221-L316)
- [agentFramework.js:211-586](file://backend/services/agents/agentFramework.js#L211-L586)
- [qwenClient.js:53-101](file://backend/services/qwenClient.js#L53-L101)

## Detailed Component Analysis

### Lineup Agent Implementation
The Lineup Agent is a focused tactical analyst that:
- Activates only when lineup data is available (returns null otherwise)
- Carries the highest pre-match signal weight (0.40)
- Builds a structured prompt containing formation, strength scores, starters, and key absences
- Emphasizes lineup strength delta and key absences in its reasoning

```mermaid
classDiagram
class Agent {
+string name
+string role
+string model
+string systemPrompt
+run(userMessage) AgentOutput
+challenge(ownOutput, opposingOutput, delta) AgentOutput
}
class LineupAgent {
+Agent agent
+buildPrompt(matchContext, domainData) string|null
+fetchDomainData(matchId) object
}
class LineupService {
+fetchLineup(matchId) object
+submitManualLineup(matchId, side, starters, formation) object
+lineupToProbs(lineupData) object
}
LineupAgent --> Agent : "extends"
LineupAgent --> LineupService : "uses"
```

**Diagram sources**
- [lineupAgent.js:110-118](file://backend/services/agents/lineupAgent.js#L110-L118)
- [lineupAgent.js:44-107](file://backend/services/agents/lineupAgent.js#L44-L107)
- [lineupService.js:221-425](file://backend/services/lineupService.js#L221-L425)
- [agentFramework.js:211-330](file://backend/services/agents/agentFramework.js#L211-L330)

**Section sources**
- [lineupAgent.js:14-118](file://backend/services/agents/lineupAgent.js#L14-L118)

### Lineup Service: Data Fetching and Computation
The Lineup Service performs:
- Availability checks (time proximity to kickoff)
- Multi-source fetching (football-data.org API, ESPN scrape, manual submission)
- Strength score computation using position weights and team ELO baselines
- Key absence detection by comparing current starters to recent lineup patterns
- Result construction with strength delta and impact scores

```mermaid
flowchart TD
Start(["fetchLineup(matchId)"]) --> CheckCache["Check cached lineups"]
CheckCache --> HasCache{"Both sides cached?"}
HasCache --> |Yes| BuildResult["buildLineupResult()"]
HasCache --> |No| LoadMatch["Load match and teams"]
LoadMatch --> TimeCheck{"Within 2 hours of KO?"}
TimeCheck --> |No| ReturnUnavailable["Return unavailable"]
TimeCheck --> |Yes| TryAPI["Try API (football-data.org)"]
TryAPI --> APISuccess{"API success?"}
APISuccess --> |No| TryESPN["Scrape ESPN"]
APISuccess --> |Yes| ComputeScores["Compute strength scores"]
TryESPN --> ESPNSuccess{"ESPN success?"}
ESPNSuccess --> |No| ReturnUnavailable
ESPNSuccess --> ComputeScores
ComputeScores --> SaveDB["Save to DB"]
SaveDB --> BuildResult
BuildResult --> End(["Return structured lineup data"])
```

**Diagram sources**
- [lineupService.js:221-316](file://backend/services/lineupService.js#L221-L316)
- [lineupService.js:318-362](file://backend/services/lineupService.js#L318-L362)

**Section sources**
- [lineupService.js:83-155](file://backend/services/lineupService.js#L83-L155)
- [lineupService.js:157-183](file://backend/services/lineupService.js#L157-L183)
- [lineupService.js:185-218](file://backend/services/lineupService.js#L185-L218)
- [lineupService.js:221-316](file://backend/services/lineupService.js#L221-L316)
- [lineupService.js:318-362](file://backend/services/lineupService.js#L318-L362)

### Agent Framework: Session Orchestration and Conflict Resolution
The Agent Framework provides:
- Standardized Agent class with run() and challenge() methods
- JSON schema enforcement and robust parsing with fallbacks
- AgentSession orchestration with parallel dispatch, conflict detection, and negotiation
- Weight adjustment rules: winner boosted by 1.3×, loser penalized to 0.6×

```mermaid
sequenceDiagram
participant AS as "AgentSession"
participant A as "Agent A"
participant B as "Agent B"
AS->>A : "run(userMessage)"
AS->>B : "run(userMessage)"
A-->>AS : "AgentOutput"
B-->>AS : "AgentOutput"
AS->>AS : "detectConflicts()"
alt conflicts detected
AS->>A : "challenge(ownOutput, opposingOutput, delta)"
AS->>B : "challenge(ownOutput, opposingOutput, delta)"
A-->>AS : "revisedOutput"
B-->>AS : "revisedOutput"
AS->>AS : "apply weight adjustments"
end
AS->>AS : "buildFinalOutputs()"
```

**Diagram sources**
- [agentFramework.js:336-503](file://backend/services/agents/agentFramework.js#L336-L503)

**Section sources**
- [agentFramework.js:211-330](file://backend/services/agents/agentFramework.js#L211-L330)
- [agentFramework.js:336-503](file://backend/services/agents/agentFramework.js#L336-L503)

### Multi-Agent Orchestration and Lineup Integration
The Orchestrator coordinates agent tasks and integrates lineup data:
- Pre-fetches domain data (H2H, form, intel, lineup) in parallel
- Skips agents with null prompts (e.g., LineupAgent when unavailable)
- Builds AgentSession and handles conflict resolution
- Blends final outputs using log-pool weighting

```mermaid
graph TB
OA["Orchestrator.runMultiAgentPrediction"] --> PF["Pre-fetch domain data"]
PF --> H2H["H2HAgent"]
PF --> FORM["FormAgent"]
PF --> INTEL["IntelAgent"]
PF --> LINEUP["LineupAgent"]
LINEUP --> PROMPT["buildPrompt(matchContext, lineupData)"]
PROMPT --> AG["Agent.run()"]
AG --> SESSION["AgentSession"]
SESSION --> BL["logPool blend"]
BL --> OUT["Final probabilities"]
```

**Diagram sources**
- [orchestratorAgent.js:319-502](file://backend/services/agents/orchestratorAgent.js#L319-L502)

**Section sources**
- [orchestratorAgent.js:331-396](file://backend/services/agents/orchestratorAgent.js#L331-L396)
- [orchestratorAgent.js:402-449](file://backend/services/agents/orchestratorAgent.js#L402-L449)

## Dependency Analysis
The Lineup Agent depends on:
- Agent Framework for output parsing and session orchestration
- Lineup Service for reliable lineup data and strength computations
- Qwen Client for LLM inference
- Orchestrator for multi-agent coordination

```mermaid
graph LR
LA["LineupAgent"] --> AF["AgentFramework"]
LA --> LS["LineupService"]
LA --> QC["QwenClient"]
OA["Orchestrator"] --> LA
PE["PredictionEngine"] --> OA
```

**Diagram sources**
- [lineupAgent.js:14-16](file://backend/services/agents/lineupAgent.js#L14-L16)
- [agentFramework.js:28-29](file://backend/services/agents/agentFramework.js#L28-L29)
- [lineupService.js:43](file://backend/services/lineupService.js#L43)
- [qwenClient.js:27-40](file://backend/services/qwenClient.js#L27-L40)
- [orchestratorAgent.js:30-37](file://backend/services/agents/orchestratorAgent.js#L30-L37)
- [predictionEngine.js:40-53](file://backend/services/predictionEngine.js#L40-L53)

**Section sources**
- [lineupAgent.js:14-16](file://backend/services/agents/lineupAgent.js#L14-L16)
- [agentFramework.js:28-29](file://backend/services/agents/agentFramework.js#L28-L29)
- [lineupService.js:43](file://backend/services/lineupService.js#L43)
- [qwenClient.js:27-40](file://backend/services/qwenClient.js#L27-L40)
- [orchestratorAgent.js:30-37](file://backend/services/agents/orchestratorAgent.js#L30-L37)
- [predictionEngine.js:40-53](file://backend/services/predictionEngine.js#L40-L53)

## Performance Considerations
- Availability gating: Lineup Agent returns null when data is unavailable, preventing unnecessary LLM calls.
- Parallel orchestration: In multi-agent mode, agents run concurrently, reducing total prediction latency.
- Weighted blending: The 0.40 weight ensures lineup signals dominate when available, while other signals remain influential.
- Robust parsing: JSON extraction with sanitization and fallbacks minimizes parse errors and improves reliability.

## Troubleshooting Guide
Common issues and resolutions:
- Lineup data unavailable: Agent returns null; orchestrator skips LineupAgent for that run.
- JSON parse errors: AgentFramework applies fallback outputs with minimal confidence and flags.
- LLM failures: AgentFramework retries once and falls back to default outputs.
- Absence detection: If recent lineup patterns are insufficient, absence detection may be empty; verify DB entries.

**Section sources**
- [lineupAgent.js:64-66](file://backend/services/agents/lineupAgent.js#L64-L66)
- [agentFramework.js:122-156](file://backend/services/agents/agentFramework.js#L122-L156)
- [agentFramework.js:252-269](file://backend/services/agents/agentFramework.js#L252-L269)
- [lineupService.js:190-218](file://backend/services/lineupService.js#L190-L218)

## Conclusion
The Lineup Agent provides a robust, high-confidence analysis of confirmed starting XI data within the multi-agent prediction system. By leveraging structured prompts, standardized output schemas, and conflict-aware negotiation, it delivers actionable insights on lineup strength, key absences, and tactical implications. Its integration with the Lineup Service ensures reliable data sourcing and computation, while the Orchestrator coordinates seamless multi-agent workflows and final probability blending.