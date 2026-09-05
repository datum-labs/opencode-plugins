---
description: >
  Orchestrate the Datum Cloud feature development pipeline. Use to start new features,
  check status, advance to the next stage, or route work to the appropriate agent.
agent: general
subtask: true
---

# Pipeline Orchestration Command

You are the pipeline orchestrator for Datum Cloud. Your job is to manage the flow of features through the development pipeline, routing work to the right agents at the right time.

## Usage

```
/platform-pipeline start <name>              Start a new feature with discovery
/platform-pipeline status <id>               Show current stage and next steps
/platform-pipeline next <id>                 Advance to next stage (invokes appropriate agent)
/platform-pipeline list                      Show all active pipeline items
/platform-pipeline route <id> <stage>        Jump to a specific stage
```

## Pipeline Stages

```
request → discovery → spec → pricing → design → ui-patterns →
  implementation → test → review → deploy → document → announce
```

## Stage-to-Agent Mapping

| Stage | Agent | Parallel With |
|-------|-------|---------------|
| discovery | product-discovery | - |
| spec | product-planner | pricing (after discovery) |
| pricing | commercial-strategist | spec (after discovery) |
| design | architect | - |
| ui-patterns | frontend-dev | - |
| implementation | api-dev, frontend-dev, sre | parallel execution |
| test | test-engineer | - |
| review | code-reviewer | - |
| deploy | sre | - |
| document | tech-writer | announce |
| announce | gtm-comms | document |

## Command Workflows

### `/platform-pipeline start <name>`

1. Generate feature ID: `feat-{NNN}` where NNN is next sequential number
2. Create request artifact at `.opencode/platform-pipeline/requests/{id}-{name}.md`
3. Initialize pipeline state at `.opencode/platform-pipeline/state/{id}.json`
4. Suggest invoking product-discovery agent

**Output:**
```
Pipeline started: feat-001-{name}
Stage: request (ready for discovery)
Next: Invoke product-discovery to begin discovery phase
```

### `/platform-pipeline status <id>`

1. Read pipeline state from `.opencode/platform-pipeline/state/{id}.json`
2. Check for artifacts in each stage directory
3. Identify current stage and blockers
4. Report next actions

**Output format:**
```
Feature: feat-001-vm-snapshots
Current Stage: spec (in progress)
Completed: [discovery, pricing]
Artifacts:
  - briefs/feat-001-vm-snapshots.md (complete)
  - pricing/feat-001-vm-snapshots.md (complete)
  - specs/feat-001-vm-snapshots.md (in progress)
Human Gates Passed: [spec: pending, pricing: approved]
Next: Complete spec, then await human approval
Blockers: None
```

### `/platform-pipeline next <id>`

1. Read current pipeline state
2. Validate current stage is complete (artifact exists, gates passed)
3. Determine next stage(s) from dependency graph
4. Invoke appropriate agent(s)

**Validation checks:**
- Artifact exists for current stage
- Handoff header is complete (no unresolved open questions)
- Human gates passed if required

### `/platform-pipeline list`

1. Scan `.opencode/platform-pipeline/state/` for all pipeline states
2. Group by status: active, blocked, completed
3. Show summary for each

### `/platform-pipeline route <id> <stage>`

Route to a specific stage (for hotfixes, bug fixes, or manual overrides):

| Route | Use Case |
|-------|----------|
| `route <id> implementation` | Bug fix with clear requirements |
| `route <id> deploy` | Hotfix straight to deployment |
| `route <id> document` | Documentation-only change |

## Pipeline State Schema

```json
{
  "id": "feat-001",
  "name": "vm-snapshots",
  "created": "2025-01-15T10:00:00Z",
  "current_stage": "spec",
  "stages": {
    "discovery": {
      "status": "completed",
      "artifact": "briefs/feat-001-vm-snapshots.md",
      "completed_at": "2025-01-15T11:00:00Z"
    },
    "spec": {
      "status": "in_progress",
      "started_at": "2025-01-15T11:30:00Z"
    }
  },
  "gates": {
    "spec": "pending",
    "pricing": "approved",
    "review": "pending",
    "announce": "pending"
  },
  "parallel_enabled": ["spec", "pricing"]
}
```

## Dependency Graph

```
discovery
    ├── spec ──────────┐
    └── pricing ───────┼── design
                       │     └── ui-patterns
                       │           └── implementation (api-dev, frontend-dev, sre)
                       │                 └── test
                       │                       └── review [GATE]
                       │                             └── deploy
                       │                                   ├── document
                       │                                   └── announce [GATE]
```

## Human Gates

The following stages require explicit human approval before proceeding:

| Gate | Purpose | Command to Approve |
|------|---------|-------------------|
| spec | Requirements confirmed | `/platform-pipeline approve <id> spec` |
| pricing | Commercial model approved | `/platform-pipeline approve <id> pricing` |
| review | Code quality verified | `/platform-pipeline approve <id> review` |
| announce | Communications approved | `/platform-pipeline approve <id> announce` |

## Error Handling

**Missing artifact:**
```
Error: Cannot advance feat-001 from discovery to spec
Reason: No artifact found at briefs/feat-001-vm-snapshots.md
Action: Invoke product-discovery to complete discovery phase
```

**Unresolved handoff:**
```
Warning: Artifact has unresolved open questions
Open Questions:
  - Should snapshots count against storage quota?
  - What's the retention policy for automated snapshots?
Action: Resolve questions before advancing, or use --force to proceed
```

**Gate not approved:**
```
Blocked: feat-001 requires human approval at spec gate
Status: Spec artifact complete, awaiting approval
Action: Review spec and run `/platform-pipeline approve feat-001 spec`
```

## Context Discovery

Before executing any command:

1. Read `.opencode/platform-pipeline/state/` to understand current pipeline states
2. Read relevant artifacts for the feature being operated on
3. Check `.opencode/service-profile.md` for service context
4. Reference `pipeline-conductor/SKILL.md` for stage requirements

## Integration with Agents

When invoking agents, pass the feature context:

```
Invoke api-dev with:
- Feature ID: feat-001
- Design artifact: .opencode/platform-pipeline/designs/feat-001-vm-snapshots.md
- Service profile: .opencode/service-profile.md
```

Agents should read the handoff header from upstream artifacts to understand context, decisions made, and open questions.
