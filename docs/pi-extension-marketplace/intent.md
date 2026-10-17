# Intent — Pi Extension Marketplace

## Problem

SpireCode can currently enumerate Pi extensions resolved from `~/.pi/agent/settings.json`, but users must leave the application and use the Pi CLI to discover, install, update, or remove packages. This makes the extension system hard to discover and encourages manual edits to Pi configuration.

Pi extensions execute with the same operating-system permissions as the Pi agent. A marketplace therefore crosses process, network, package-installation, persistence, and trust boundaries; it cannot be implemented as an embedded remote web page or a generic command runner.

## Outcome

Add an Extensions experience in Settings with two views:

- **Marketplace** browses community extension packages from Pi's package catalog.
- **Installed** shows user-configured resources and manages packages owned by Pi's package manager.

Users can install, update, and uninstall user-scoped npm packages through Pi's SDK after an explicit trust warning. The UI never labels catalog inclusion as official verification and never silently restarts an active agent session.

## Non-goals

- Project-scoped installation or mutation of `.pi/settings.json`.
- Git, local-path, private-registry, or arbitrary package sources.
- Ratings, reviews, favorites, automatic updates, or background installation.
- Security scanning or inferred fine-grained permissions.
- Loading `pi.dev` HTML or scripts in the Renderer.
- Treating package names, download counts, publishers, or catalog inclusion as verification.

## Risk classification

This is a **high-risk change** because it adds cross-process contracts, remote catalog ingestion, package code installation, and mutation of Pi's durable user settings. The user approved the proposed scope and security model before implementation.
