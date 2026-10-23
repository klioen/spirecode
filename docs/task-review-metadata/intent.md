# Task review metadata — Intent

## Problem

TaskRun reports retain delivery history, but callers must scan runs to find the current verified PR/MR. Task has no durable, Main-owned metadata snapshot, so list/detail consumers cannot obtain the current review link and draft state directly.

## Goal

Add a bounded, validated `TaskMetadata` JSON object to every Task and persist the latest Main-verified code-review delivery as `metadata.review`, while preserving `TaskRun.report.changeRequest` and all existing delivery and UI behavior.

## Boundaries

- Main owns metadata. Renderer and Task create/update callers cannot submit it.
- Only a review returned by successful Main Git delivery may update the snapshot; agent-reported links alone never do.
- This change does not alter PR/MR creation, readiness, approval, merge, release, or manual acceptance policy.
- Existing run reports remain the historical record; Task metadata is only the current snapshot.

## Risk

High risk: this changes the Task SQLite schema, persisted data format, migration behavior, revision semantics, and Main-to-Renderer DTO contract. The Task intake execution contract explicitly authorizes this implementation and requires migration, compatibility, and full-gate verification.
