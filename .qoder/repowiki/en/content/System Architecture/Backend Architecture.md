# Backend Architecture

<cite>
**Referenced Files in This Document**
- [server.js](file://backend/server.js)
- [package.json](file://backend/package.json)
- [db.js](file://backend/database/db.js)
- [predictionEngine.js](file://backend/services/predictionEngine.js)
- [orchestratorAgent.js](file://backend/services/agents/orchestratorAgent.js)
- [agentFramework.js](file://backend/services/agents/agentFramework.js)
- [dataService.js](file://backend/services/dataService.js)
- [bracketService.js](file://backend/services/bracketService.js)
- [statisticalAgent.js](file://backend/services/agents/statisticalAgent.js)
- [h2hAgent.js](file://backend/services/agents/h2hAgent.js)
- [formAgent.js](file://backend/services/agents/formAgent.js)
- [intelAgent.js](file://backend/services/agents/intelAgent.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Security Considerations](#security-considerations)
9. [Middleware Stack and Error Handling](#middleware-stack-and-error-handling)
10. [Database Integration](#database-integration)
11. [Cron Job System](#cron-job-system)
12. [Service Layer Architecture](#service-layer-architecture)
13. [API Versioning Strategy](#api-versioning-strategy)
14. [Configuration Management](#configuration-management)
15. [Troubleshooting Guide](#troubleshooting-guide)
16. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive backend architecture documentation for the Express.js API server powering the World Cup 2026 prediction platform. The system integrates a sophisticated prediction engine, multi-agent AI coordination, real-time data synchronization, and tournament management capabilities. Built with Node.js and Express, it leverages SQLite via node-sqlite3-wasm for data persistence and employs a modular service layer architecture.

## Project Structure
The backend follows a clean, modular organization with clear separation of concerns:

```mermaid
graph TB
subgraph "Application Root"
Server[server.js]
Package[package.json]
end
subgraph "Database Layer"
DB[database/db.js]
Schema[SQLite Schema]
end
subgraph "Service Layer"
Pred[predictionEngine.js]
Data[dataService.js]
Bracket[bracketService.js]
subgraph "AI Agents"
AgentFramework[agents/agentFramework.js]
Orchestrator[agents/orchestratorAgent.js]
Stats[agents/statisticalAgent.js]
H2H[agents/h2hAgent.js]
Form[agents/formAgent.js]
Intel[agents/intelAgent.js]
end
subgraph "Support Services"
Analysis[analysisService.js]
Lineup[lineupService.js]
H2HService[h2hService.js]
Odds[oddsService.js]
Suspension[suspensionService.js]
Scenario[scenarioService.js]
Calibration[calibrationService.js]
IndexNow[indexNow.js]
I18N[i18nService.js]
Qwen[qwenClient.js]
end
end
Server --> DB
Server --> Pred
Server --> Data
Server --> Bracket
Pred --> AgentFramework
Pred --> Orchestrator
Orchestrator --> AgentFramework
AgentFramework --> Stats
AgentFramework --> H2H
AgentFramework --> Form
AgentFramework --> Intel
```

**Diagram sources**
- [server.js:1-724](file://backend/server.js#L1-L724)
- [db.js:1-252](file://backend/database/db.js#L1-L252)
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)
- [agentFramework.js:1-586](file://backend/services/agents/agentFramework.js#L1-L586)

**Section sources**
- [server.js:1-724](file://backend/server.js#L1-L724)
- [package.json:1-32](file://backend/package.json#L1-L32)

## Core Components
The backend consists of several interconnected core components:

### Express Server Application
The main application server handles HTTP requests, manages middleware, and exposes RESTful APIs for clients. It implements a comprehensive routing system covering teams, matches, tournaments, analytics, and administrative endpoints.

### Database Layer
Utilizes node-sqlite3-wasm for robust SQLite operations with proper locking mechanisms and schema initialization. The database manages all application data including teams, matches, predictions, tournament brackets, and AI agent sessions.

### Prediction Engine
A sophisticated machine learning-powered system implementing Dixon-Coles bivariate Poisson models with multiple adjustment signals including ELO ratings, head-to-head records, recent form, web intelligence, lineup strength, and rest days.

### Multi-Agent AI System
An advanced orchestration framework that coordinates specialized AI agents (statistical, H2H, form, intelligence) to provide diverse analytical perspectives and synthesize consensus predictions through conflict resolution and weighted aggregation.

**Section sources**
- [server.js:18-724](file://backend/server.js#L18-L724)
- [db.js:1-252](file://backend/database/db.js#L1-L252)
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)

## Architecture Overview
The system employs a layered architecture with clear separation between presentation, business logic, and data access layers:

```mermaid
graph TB
subgraph "Presentation Layer"
Routes[HTTP Routes]
Controllers[Route Handlers]
end
subgraph "Business Logic Layer"
Services[Service Layer]
Orchestrator[Multi-Agent Orchestrator]
PredictionEngine[Prediction Engine]
BracketManager[Tournament Manager]
end
subgraph "Data Access Layer"
Database[SQLite Database]
Cache[In-Memory Cache]
ExternalAPI[External APIs]
end
subgraph "AI/ML Layer"
Agents[Specialized Agents]
LLM[Qwen LLM]
Models[Statistical Models]
end
Routes --> Controllers
Controllers --> Services
Services --> Orchestrator
Services --> PredictionEngine
Services --> BracketManager
Services --> Database
Orchestrator --> Agents
Agents --> LLM
PredictionEngine --> Models
Database --> Cache
Database --> ExternalAPI
```

**Diagram sources**
- [server.js:24-582](file://backend/server.js#L24-L582)
- [predictionEngine.js:691-756](file://backend/services/predictionEngine.js#L691-L756)
- [orchestratorAgent.js:309-502](file://backend/services/agents/orchestratorAgent.js#L309-L502)

## Detailed Component Analysis

### Prediction Engine Component
The prediction engine implements a sophisticated mathematical model combining multiple data sources and adjustment signals:

```mermaid
flowchart TD
Start([Prediction Request]) --> LoadMatch["Load Match Data"]
LoadMatch --> LoadTeams["Load Team Ratings"]
LoadTeams --> FetchSignals["Fetch Adjustment Signals"]
FetchSignals --> FormSignal["Form Signal"]
FetchSignals --> H2HSignal["H2H Signal"]
FetchSignals --> IntelSignal["Intelligence Signal"]
FetchSignals --> LineupSignal["Lineup Signal"]
FetchSignals --> RestSignal["Rest Days Signal"]
FormSignal --> BlendSignals["Log-Pool Blend"]
H2HSignal --> BlendSignals
IntelSignal --> BlendSignals
LineupSignal --> BlendSignals
RestSignal --> BlendSignals
BlendSignals --> TemperatureCalibration["Temperature Calibration"]
TemperatureCalibration --> ScorelineDerivation["Scoreline Derivation"]
ScorelineDerivation --> ConfidenceCalc["Confidence Calculation"]
ConfidenceCalc --> FactorsBuild["Factors Build"]
FactorsBuild --> InsightGeneration["Insight Generation"]
InsightGeneration --> SavePrediction["Save to Database"]
SavePrediction --> End([Return Result])
```

**Diagram sources**
- [predictionEngine.js:691-800](file://backend/services/predictionEngine.js#L691-L800)
- [predictionEngine.js:462-583](file://backend/services/predictionEngine.js#L462-L583)

The engine uses Dixon-Coles bivariate Poisson models with:
- **Backbone Model**: λ_home = exp(log_α_home + log_β_away + home_adv)
- **Adjustment Signals**: H2H (0.30), Form (0.20), Intelligence (0.20), Lineup (0.40), Rest (0.10)
- **Confidence Calibration**: Temperature scaling and Brier score evaluation
- **Scoreline Derivation**: Expected points optimization for tournament scoring rules

**Section sources**
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)

### Multi-Agent AI Coordination System
The orchestrator coordinates multiple specialized AI agents through a structured negotiation framework:

```mermaid
sequenceDiagram
participant Client as "API Client"
participant Server as "Express Server"
participant Orchestrator as "Orchestrator Agent"
participant Agents as "Specialized Agents"
participant DB as "Database"
Client->>Server : GET /api/matches/ : id/prediction
Server->>Orchestrator : runMultiAgentPrediction()
Orchestrator->>Agents : Parallel Domain Data Fetch
Agents-->>Orchestrator : Domain Data
Orchestrator->>Agents : Dispatch Round 1
Agents-->>Orchestrator : Initial Opinions
Orchestrator->>Orchestrator : Detect Conflicts
Orchestrator->>Agents : Negotiation Round 2
Agents-->>Orchestrator : Revised Opinions
Orchestrator->>DB : Save Session & Messages
Orchestrator-->>Server : Final Prediction
Server-->>Client : Prediction Response
```

**Diagram sources**
- [orchestratorAgent.js:319-502](file://backend/services/agents/orchestratorAgent.js#L319-L502)
- [agentFramework.js:355-445](file://backend/services/agents/agentFramework.js#L355-L445)

**Section sources**
- [orchestratorAgent.js:1-502](file://backend/services/agents/orchestratorAgent.js#L1-L502)
- [agentFramework.js:1-586](file://backend/services/agents/agentFramework.js#L1-L586)

### Data Service Integration
The data service layer manages external data sources and caching strategies:

```mermaid
classDiagram
class DataService {
+fetchTeamForm(teamId) Promise~object[]~
+fetchWebIntel(homeId, awayId, date, stage) Promise~object~
+syncLiveResults() Promise~string[]~
-apiClient AxiosInstance
-cacheStore Map
}
class APIClient {
+get(endpoint) Promise~object~
+headers Map
+timeout number
}
class IntelParser {
+parseIntelWithLLM() Promise~object~
+verifyInjuriesAgainstSource() object[]
-INJURY_KW_RE RegExp
}
class CacheManager {
+get(key) object
+set(key, value, ttl) void
+isCacheValid(timestamp, hours) boolean
}
DataService --> APIClient : "uses"
DataService --> IntelParser : "uses"
DataService --> CacheManager : "uses"
```

**Diagram sources**
- [dataService.js:1-602](file://backend/services/dataService.js#L1-L602)

**Section sources**
- [dataService.js:1-602](file://backend/services/dataService.js#L1-L602)

### Tournament Management System
The bracket service manages the complete tournament lifecycle from group stages to finals:

```mermaid
flowchart LR
GroupStage[Group Stage] --> R32[R32 Draw]
R32 --> R16[R16]
R16 --> QF[Quarter Finals]
QF --> SF[Semi Finals]
SF --> Final[Final]
SF --> Third[Third Place]
GroupStage --> AutoAdvance[Auto-Advance]
AutoAdvance --> R32
subgraph "Bracket Management"
R32Draw[FIFA Official Draw]
ThirdPlace[Best 8 Third Places]
KnockoutProgression[KO Progression Tracking]
end
GroupStage --> R32Draw
GroupStage --> ThirdPlace
R32 --> KnockoutProgression
```

**Diagram sources**
- [bracketService.js:1-1080](file://backend/services/bracketService.js#L1-L1080)

**Section sources**
- [bracketService.js:1-1080](file://backend/services/bracketService.js#L1-L1080)

## Dependency Analysis
The system exhibits well-managed dependencies with clear inversion of control patterns:

```mermaid
graph TB
subgraph "External Dependencies"
Express[express ^4.19.2]
SQLite[node-sqlite3-wasm ^0.8.57]
Cron[node-cron ^4.2.1]
Axios[axios ^1.7.2]
Cheerio[cheerio ^1.0.0]
Dotenv[dotenv ^16.4.5]
Cors[cors ^2.8.5]
end
subgraph "Internal Dependencies"
Server[server.js]
DB[database/db.js]
PredEngine[services/predictionEngine.js]
DataSvc[services/dataService.js]
BracketSvc[services/bracketService.js]
AgentFramework[services/agents/agentFramework.js]
Orchestrator[services/agents/orchestratorAgent.js]
end
Server --> Express
Server --> SQLite
Server --> Cron
Server --> DB
Server --> PredEngine
Server --> DataSvc
Server --> BracketSvc
PredEngine --> AgentFramework
PredEngine --> DataSvc
PredEngine --> DB
Orchestrator --> AgentFramework
Orchestrator --> PredEngine
DataSvc --> Axios
DataSvc --> Cheerio
DataSvc --> DB
```

**Diagram sources**
- [package.json:14-31](file://backend/package.json#L14-L31)
- [server.js:1-17](file://backend/server.js#L1-L17)

**Section sources**
- [package.json:1-32](file://backend/package.json#L1-L32)

## Performance Considerations
The system implements several performance optimization strategies:

### Database Optimization
- **Connection Pooling**: Single database connection with proper locking via node-sqlite3-wasm
- **Query Optimization**: Strategic use of prepared statements and indexed lookups
- **Schema Design**: Proper indexing on frequently queried columns (match_id, team_id, status)
- **Transaction Management**: Batch operations wrapped in transactions for consistency

### Caching Strategies
- **Web Intelligence Cache**: Separate cache tables for form, H2H, and intelligence data
- **Prediction Caching**: Cache mechanism to avoid recomputation for completed matches
- **Static Content**: Frontend assets served statically for reduced server load

### Asynchronous Processing
- **Parallel Data Fetching**: Multiple data sources queried concurrently
- **Background Jobs**: Cron jobs handle periodic maintenance tasks
- **Non-blocking Operations**: All I/O operations use async/await patterns

### Memory Management
- **Circular Dependency Breakers**: Lazy loading prevents require loops
- **Resource Cleanup**: Proper disposal of database connections and external API clients

## Security Considerations
The system implements several security measures:

### Authentication & Authorization
- **CORS Configuration**: Controlled cross-origin resource sharing
- **Environment Variables**: API keys and secrets managed via dotenv
- **Input Validation**: Route parameters validated before database queries

### Data Protection
- **SQL Injection Prevention**: All database queries use prepared statements
- **XSS Prevention**: Proper escaping of user-generated content
- **Rate Limiting**: Not implemented but can be added via middleware

### Secure Communication
- **HTTPS Support**: Production deployment requires HTTPS
- **API Key Management**: External API credentials stored securely
- **Audit Logging**: Comprehensive logging for debugging and security monitoring

## Middleware Stack and Error Handling
The Express server implements a structured middleware stack:

```mermaid
flowchart TD
Request[HTTP Request] --> CORS[CORS Middleware]
CORS --> BodyParser[Body Parser]
BodyParser --> Routes[Route Handlers]
Routes --> BusinessLogic[Business Logic]
BusinessLogic --> Database[Database Operations]
Database --> Response[HTTP Response]
BusinessLogic --> ErrorHandler[Error Handler]
ErrorHandler --> ErrorResponse[Error Response]
subgraph "Error Types"
ValidationError[Validation Error]
NotFoundError[Not Found]
InternalError[Internal Server Error]
ExternalError[External API Error]
end
ErrorHandler --> ValidationError
ErrorHandler --> NotFoundError
ErrorHandler --> InternalError
ErrorHandler --> ExternalError
```

**Diagram sources**
- [server.js:21-22](file://backend/server.js#L21-L22)

**Section sources**
- [server.js:1-724](file://backend/server.js#L1-L724)

## Database Integration
The database layer uses node-sqlite3-wasm with comprehensive schema design:

### Database Schema Design
The schema supports the complete tournament lifecycle with 20+ tables covering:
- **Core Entities**: teams, matches, predictions, model performance
- **Tournament Management**: bracket slots, third place tracking
- **Historical Data**: ELO history, model configurations
- **AI Agent Sessions**: Multi-agent coordination tracking
- **Web Intelligence**: Cached data for form, H2H, and intelligence

### Migration Strategy
- **Schema Evolution**: ALTER TABLE statements for backward compatibility
- **Data Seeding**: Default model weights and initial configurations
- **Version Management**: Migration functions handle schema upgrades

### Connection Management
- **Locking Mechanisms**: Directory-based locks prevent concurrent access issues
- **Connection Pooling**: Single connection reused throughout application lifetime
- **Timeout Configuration**: Busy timeout and synchronous settings optimized for performance

**Section sources**
- [db.js:1-252](file://backend/database/db.js#L1-L252)

## Cron Job System
The system implements a comprehensive scheduling framework:

```mermaid
flowchart TD
Scheduler[Cron Scheduler] --> LiveSync[Live Results Sync]
Scheduler --> PredictionCron[Prediction Updates]
Scheduler --> LineupCron[Lineup Fetching]
LiveSync --> Every5Min[*/5 * * * *]
Every5Min --> SyncAPI[Sync Live Results]
PredictionCron --> HourlyCron[Hourly Schedule]
HourlyCron --> MidnightNoon[0 0-12 * * *]
HourlyCron --> EveningRuns[0 14,16,18 * * *]
HourlyCron --> Evening30[30 20,21,22 * * *]
LineupCron --> Every15Min[*/15 * * * *]
Every15Min --> FetchLineups[Fetch Lineups]
FetchLineups --> Repredict[Re-run Predictions]
MidnightNoon --> RunPredictionCron[runPredictionCron]
EveningRuns --> RunPredictionCron
Evening30 --> RunPredictionCron
```

**Diagram sources**
- [server.js:585-675](file://backend/server.js#L585-L675)

**Section sources**
- [server.js:585-675](file://backend/server.js#L585-L675)

## Service Layer Architecture
The service layer follows clean architecture principles with clear boundaries:

```mermaid
classDiagram
class ServiceLayer {
<<interface>>
+execute() Promise~any~
+validate() boolean
+transform() object
}
class PredictionService {
+predict(matchId, forceRefresh) PredictionResult
+batchGenerate() BatchResult
+getHistorical() HistoricalData[]
}
class DataService {
+fetchTeamForm() TeamForm[]
+fetchWebIntel() IntelData
+syncLiveResults() UpdatedMatches[]
}
class BracketService {
+advanceGroupToR32() AdvanceResult
+simulateKnockoutBracket() BracketResult
+runTournamentSimulation() SimulationResult[]
}
class AgentService {
+runMultiAgentPrediction() AgentResult
+saveAgentSession() void
+loadAgentSession() AgentSession
}
ServiceLayer <|.. PredictionService
ServiceLayer <|.. DataService
ServiceLayer <|.. BracketService
ServiceLayer <|.. AgentService
```

**Diagram sources**
- [predictionEngine.js:691-756](file://backend/services/predictionEngine.js#L691-L756)
- [dataService.js:514-599](file://backend/services/dataService.js#L514-L599)
- [bracketService.js:485-704](file://backend/services/bracketService.js#L485-L704)

**Section sources**
- [predictionEngine.js:1-1046](file://backend/services/predictionEngine.js#L1-L1046)
- [dataService.js:1-602](file://backend/services/dataService.js#L1-L602)
- [bracketService.js:1-1080](file://backend/services/bracketService.js#L1-L1080)

## API Versioning Strategy
The API follows a simple versioning approach through endpoint structure:

### Current API Structure
All endpoints follow the `/api/*` pattern with clear resource organization:
- **Teams**: `/api/teams`, `/api/teams/:id`
- **Matches**: `/api/matches`, `/api/matches/:id`
- **Predictions**: `/api/matches/:id/prediction`, `/api/predictions/generate-all`
- **Tournaments**: `/api/tournament/*`
- **Analytics**: `/api/analytics/*`
- **Admin**: `/api/sync`, `/api/suspensions`

### Version Control Approach
- **Semantic Versioning**: Future major version changes would introduce `/api/v2/*` endpoints
- **Backward Compatibility**: Existing endpoints maintained during minor updates
- **Deprecation Policy**: Old endpoints supported with warning headers

## Configuration Management
The system uses a hierarchical configuration approach:

### Environment Configuration
- **Database**: DB_PATH environment variable for SQLite file location
- **API Keys**: FOOTBALL_DATA_API_KEY for external data access
- **Frontend**: FRONTEND_URL for CORS configuration
- **Port**: PORT environment variable for server binding

### Runtime Configuration
- **Model Weights**: Stored in model_config table for dynamic adjustment
- **Feature Flags**: USE_MULTI_AGENT environment variable controls AI features
- **Calibration**: Temperature scaling and Dixon-Coles parameters
- **Caching**: TTL values for different data types

### Service Initialization Patterns
- **Lazy Loading**: Services loaded on-demand to prevent circular dependencies
- **Singleton Pattern**: Database connections and external clients as singletons
- **Factory Functions**: Service creation with dependency injection

**Section sources**
- [server.js:1-22](file://backend/server.js#L1-L22)
- [db.js:5-6](file://backend/database/db.js#L5-L6)

## Troubleshooting Guide
Common issues and their resolutions:

### Database Issues
- **Lock File Problems**: Stale .lock files cause connection failures
- **Schema Migration**: Missing columns handled via ALTER TABLE statements
- **Connection Timeouts**: Adjust busy_timeout and synchronous PRAGMAs

### Prediction Engine Issues
- **Missing Team Ratings**: Automatic rating initialization from FIFA data
- **Incomplete Data**: Graceful fallback to default values and synthetic data
- **LLM Failures**: Fallback parsing strategies and error recovery

### API Issues
- **CORS Errors**: Verify FRONTEND_URL environment variable
- **Rate Limiting**: External API rate limits require careful request scheduling
- **Cache Invalidation**: Manual cache clearing for development

### Performance Issues
- **Slow Queries**: Database indexing and query optimization
- **Memory Leaks**: Proper cleanup of database connections and timers
- **External API Failures**: Circuit breaker patterns and retry logic

**Section sources**
- [server.js:585-675](file://backend/server.js#L585-L675)
- [predictionEngine.js:184-203](file://backend/services/predictionEngine.js#L184-L203)

## Conclusion
The backend architecture demonstrates enterprise-grade design with clear separation of concerns, robust data management, and sophisticated AI coordination. The modular service layer enables maintainability and extensibility, while the multi-agent system provides nuanced analytical insights. The comprehensive scheduling framework ensures real-time data freshness, and the SQLite integration provides reliable persistence with minimal operational overhead.

The system successfully balances performance requirements with maintainability, providing a solid foundation for the World Cup 2026 prediction platform with room for future enhancements and scaling.