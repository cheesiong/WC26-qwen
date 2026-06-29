# Model Calibration and Temperature Scaling

<cite>
**Referenced Files in This Document**
- [calibrationService.js](file://backend/services/calibrationService.js)
- [analysisService.js](file://backend/services/analysisService.js)
- [predictionEngine.js](file://backend/services/predictionEngine.js)
- [db.js](file://backend/database/db.js)
- [orchestratorAgent.js](file://backend/services/agents/orchestratorAgent.js)
- [verifyTuning.js](file://backend/scripts/verifyTuning.js)
- [tuneV2.js](file://backend/scripts/tuneV2.js)
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
This document explains the model calibration system used to improve prediction confidence reliability and accuracy. It covers:
- Temperature scaling to recalibrate output probabilities
- Storage and retrieval of calibration parameters in the model_config table
- Implementation of getTemperature and applyTemperature functions
- Dixon–Coles ρ parameter fitting for low-score correction
- Parameter optimization workflows and their impact on model performance

## Project Structure
The calibration system spans three primary areas:
- Database schema with model_config table for storing calibrated parameters
- Prediction engine that applies calibration during inference
- Analysis service that triggers periodic calibration updates

```mermaid
graph TB
subgraph "Database"
MC["model_config<br/>key, value, description, updated_at"]
PRED["predictions<br/>prob_home, prob_draw, prob_away,<br/>actual_outcome, lambda_home, lambda_away"]
end
subgraph "Services"
PE["predictionEngine.js<br/>predict(), getTemperature(), applyTemperature(), getDcRho()"]
CS["calibrationService.js<br/>refitTemperature(), refitDcRho()"]
AS["analysisService.js<br/>recordMatchResult()"]
OA["agents/orchestratorAgent.js<br/>applyTemperature(), getTemperature()"]
end
AS --> CS
CS --> MC
PE --> MC
PE --> PRED
OA --> MC
OA --> PRED
```

**Diagram sources**
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)
- [orchestratorAgent.js:57-71](file://backend/services/agents/orchestratorAgent.js#L57-L71)

**Section sources**
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)
- [orchestratorAgent.js:57-71](file://backend/services/agents/orchestratorAgent.js#L57-L71)

## Core Components
- model_config table: Stores calibrated parameters (e.g., calibration_temperature, dc_rho) with timestamps and descriptions.
- calibrationService: Periodically fits temperature scaling and Dixon–Coles ρ using historical predictions and outcomes.
- predictionEngine: Applies fitted parameters to adjust final prediction probabilities and scoreline matrices.
- analysisService: Triggers calibration updates after sufficient completed matches and computes performance metrics.

**Section sources**
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [calibrationService.js:18-27](file://backend/services/calibrationService.js#L18-L27)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)

## Architecture Overview
The calibration pipeline operates as follows:
- After each completed match, analysisService updates predictions and model_performance, then triggers calibration refits.
- calibrationService computes optimal temperature and ρ by minimizing negative log-likelihood on historical predictions.
- model_config persists the fitted parameters.
- predictionEngine loads the latest parameters and applies them to produce calibrated probabilities.

```mermaid
sequenceDiagram
participant AS as "analysisService"
participant CS as "calibrationService"
participant DB as "model_config"
participant PE as "predictionEngine"
AS->>AS : "recordMatchResult()"
AS->>CS : "refitTemperature() and refitDcRho()"
CS->>DB : "INSERT/UPDATE calibration_temperature/dc_rho"
PE->>DB : "SELECT value FROM model_config WHERE key = 'calibration_temperature'"
PE->>PE : "applyTemperature(finalProbs, T)"
PE->>DB : "SELECT value FROM model_config WHERE key = 'dc_rho'"
PE->>PE : "dcScoreMatrix(..., rho)"
```

**Diagram sources**
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)

## Detailed Component Analysis

### Temperature Scaling Calibration
Temperature scaling adjusts output probabilities by applying a power transform in log-space, controlled by the parameter T:
- T > 1 softens probabilities (less confident)
- T < 1 sharpens probabilities (more confident)
- The optimal T is found by grid-search minimizing negative log-likelihood on historical predictions.

Implementation highlights:
- Grid search bounds and steps define resolution and range for T.
- Softmax re-scaling in log-space prevents numerical overflow.
- Fitted T is persisted to model_config and loaded at inference time.

```mermaid
flowchart TD
Start(["Start refitTemperature"]) --> Load["Load predictions with actual outcomes"]
Load --> Enough{"Enough samples?"}
Enough --> |No| Abort["Abort: insufficient data"]
Enough --> |Yes| Grid["Grid search over T"]
Grid --> Eval["Compute NLL for each T"]
Eval --> Best["Select best T"]
Best --> Persist["Persist to model_config"]
Persist --> Done(["Return fitted result"])
Abort --> Done
```

**Diagram sources**
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:28-51](file://backend/services/calibrationService.js#L28-L51)

**Section sources**
- [calibrationService.js:18-27](file://backend/services/calibrationService.js#L18-L27)
- [calibrationService.js:28-51](file://backend/services/calibrationService.js#L28-L51)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)

### Probability Recalibration Functions
Two functions implement the temperature application:
- getTemperature: Loads the latest calibration_temperature from model_config, defaulting to 1.0.
- applyTemperature: Re-normalizes probabilities in log-space using 1/T scaling.

```mermaid
flowchart TD
A["Input: probs {winHome, draw, winAway}, T"] --> B{"T present and != 1.0?"}
B --> |No| C["Return probs unchanged"]
B --> |Yes| D["Log-space re-scaling with 1/T"]
D --> E["Stabilize by subtracting max log"]
E --> F["Exponentiate and normalize"]
F --> G["Output: recalibrated probs"]
```

**Diagram sources**
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [orchestratorAgent.js:57-66](file://backend/services/agents/orchestratorAgent.js#L57-L66)

**Section sources**
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [orchestratorAgent.js:57-66](file://backend/services/agents/orchestratorAgent.js#L57-L66)

### Dixon–Coles ρ Calibration
Low-score correction improves accuracy for 0–0, 1–0, 0–1, and 1–1 outcomes using the Dixon–Coles τ function. The ρ parameter is optimized by maximizing likelihood over observed scorelines:
- Grid search over ρ with bounds and step size
- Uses stored lambda_home and lambda_away from predictions
- Persists best ρ to model_config

```mermaid
flowchart TD
StartDC(["Start refitDcRho"]) --> LoadDC["Load predictions with lambdas and match scores"]
LoadDC --> EnoughDC{"Enough samples?"}
EnoughDC --> |No| AbortDC["Abort: insufficient data"]
EnoughDC --> |Yes| GridDC["Grid search over ρ"]
GridDC --> EvalDC["Compute NLL for each ρ"]
EvalDC --> BestDC["Select best ρ"]
BestDC --> PersistDC["Persist to model_config"]
PersistDC --> DoneDC(["Return fitted result"])
AbortDC --> DoneDC
```

**Diagram sources**
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)
- [predictionEngine.js:151-163](file://backend/services/predictionEngine.js#L151-L163)

**Section sources**
- [calibrationService.js:23-26](file://backend/services/calibrationService.js#L23-L26)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)
- [predictionEngine.js:151-163](file://backend/services/predictionEngine.js#L151-L163)

### Runtime Parameter Loading and Application
- model_config table stores calibration_temperature and dc_rho with descriptions and timestamps.
- predictionEngine retrieves parameters at runtime and applies them:
  - getTemperature: loads T for probability recalibration
  - getDcRho: loads ρ for scoreline matrix construction
- Both functions gracefully handle missing values by falling back to defaults.

```mermaid
classDiagram
class ModelConfig {
+string key
+float value
+string description
+string updated_at
}
class PredictionEngine {
+getTemperature(db) float
+getDcRho(db) float
+applyTemperature(probs, T) Probs
}
class CalibrationService {
+refitTemperature() Result
+refitDcRho() Result
}
ModelConfig <.. PredictionEngine : "read"
ModelConfig <.. CalibrationService : "write"
PredictionEngine --> CalibrationService : "triggered by"
```

**Diagram sources**
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)

**Section sources**
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:663-688](file://backend/services/predictionEngine.js#L663-L688)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)

### Parameter Optimization Workflows
- Triggering: analysisService checks cumulative completed matches and triggers refitTemperature and refitDcRho every 10 matches beyond 20.
- Fitting: calibrationService performs grid search over predefined ranges and step sizes.
- Persistence: fitted parameters are inserted/upserted into model_config with updated timestamps.
- Verification: scripts read model_config to report current calibration parameters.

```mermaid
sequenceDiagram
participant AS as "analysisService"
participant CS as "calibrationService"
participant DB as "model_config"
participant VT as "verifyTuning.js"
AS->>AS : "count completed matches"
AS->>CS : "refitTemperature() and refitDcRho()"
CS->>DB : "persist fitted parameters"
VT->>DB : "SELECT key='calibration_temperature'/'dc_rho'"
VT-->>VT : "print current values"
```

**Diagram sources**
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)
- [verifyTuning.js:155-162](file://backend/scripts/verifyTuning.js#L155-L162)

**Section sources**
- [analysisService.js:199-211](file://backend/services/analysisService.js#L199-L211)
- [calibrationService.js:53-82](file://backend/services/calibrationService.js#L53-L82)
- [calibrationService.js:88-129](file://backend/services/calibrationService.js#L88-L129)
- [verifyTuning.js:155-162](file://backend/scripts/verifyTuning.js#L155-L162)

### Relationship Between Calibration Parameters and Accuracy Improvements
- Temperature scaling improves probability calibration quality by aligning predicted confidence with empirical accuracy, reducing Brier score and log-loss.
- Dixon–Coles ρ correction reduces bias in low-scoring outcomes, improving scoreline distribution fit and downstream point-based accuracy.
- Backtesting scripts demonstrate how parameter sweeps identify favorable configurations for Brier score and accuracy.

**Section sources**
- [analysisService.js:63-71](file://backend/services/analysisService.js#L63-L71)
- [tuneV2.js:16-55](file://backend/scripts/tuneV2.js#L16-L55)

## Dependency Analysis
- calibrationService depends on:
  - model_config schema for persistence
  - predictions table for historical data
  - predictionEngine.dcScoreMatrix for ρ fitting
- predictionEngine depends on:
  - model_config for runtime parameters
  - predictions for lambda_home and lambda_away (when available)
- analysisService coordinates triggering of calibration updates.

```mermaid
graph LR
CS["calibrationService.js"] --> DB["db.js:model_config"]
CS --> PRED["predictions table"]
CS --> PE["predictionEngine.js:dcScoreMatrix"]
PE --> DB
AS["analysisService.js"] --> CS
```

**Diagram sources**
- [calibrationService.js:15-16](file://backend/services/calibrationService.js#L15-L16)
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:151-163](file://backend/services/predictionEngine.js#L151-L163)
- [analysisService.js:16-16](file://backend/services/analysisService.js#L16-L16)

**Section sources**
- [calibrationService.js:15-16](file://backend/services/calibrationService.js#L15-L16)
- [db.js:160-165](file://backend/database/db.js#L160-L165)
- [predictionEngine.js:151-163](file://backend/services/predictionEngine.js#L151-L163)
- [analysisService.js:16-16](file://backend/services/analysisService.js#L16-L16)

## Performance Considerations
- Grid search resolutions balance accuracy and computational cost; adjust T_STEPS and RHO_STEPS judiciously.
- Numerical stability: log-space re-scaling and small additive floors prevent overflow/underflow.
- Sampling thresholds ensure reliable estimates before updating parameters.

## Troubleshooting Guide
- Insufficient samples: Calibration aborts with reasons indicating minimum sample counts for T and ρ.
- Missing parameters: getTemperature/getDcRho fall back to safe defaults (1.0 for T, backbone DC_RHO for ρ).
- Parameter verification: Use verifyTuning script to confirm current values in model_config.

**Section sources**
- [calibrationService.js:61-63](file://backend/services/calibrationService.js#L61-L63)
- [calibrationService.js:103-105](file://backend/services/calibrationService.js#L103-L105)
- [predictionEngine.js:665-674](file://backend/services/predictionEngine.js#L665-L674)
- [verifyTuning.js:155-162](file://backend/scripts/verifyTuning.js#L155-L162)

## Conclusion
The calibration system integrates temperature scaling and Dixon–Coles ρ fitting into the prediction pipeline. By persisting fitted parameters to model_config and applying them at runtime, the model achieves improved probability calibration and more accurate scoreline distributions, validated through performance metrics and backtesting.