import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatModelOption,
  MemoryConfig,
  MemoryDocument,
  MemoryDocumentId,
  MemoryReasoningEffort,
} from "../../bindings";
import { commandError } from "../../lib/errors";
import { MarkdownContent } from "../chat/MarkdownContent";
import { memoryApi } from "./memoryApi";
import { settingsApi } from "./settingsApi";

const documents: Array<{ id: MemoryDocumentId; name: string }> = [
  { id: "summary", name: "memory_summary.md" },
  { id: "handbook", name: "MEMORY.md" },
];
const reasoningEfforts: MemoryReasoningEffort[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
}

function modelValue(provider: string, id: string): string {
  return `${provider}/${id}`;
}

function splitModel(value: string): { provider: string; id: string } | null {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    provider: value.slice(0, separator),
    id: value.slice(separator + 1),
  };
}

function ModelSelect({
  label,
  value,
  models,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  models: ChatModelOption[];
  disabled: boolean;
  onChange(value: string): void;
}) {
  const available = models.some(
    (model) => modelValue(model.provider, model.id) === value,
  );
  const groups = models.reduce<Map<string, ChatModelOption[]>>(
    (result, model) => {
      const entries = result.get(model.provider) ?? [];
      entries.push(model);
      result.set(model.provider, entries);
      return result;
    },
    new Map(),
  );
  return (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!available && value && (
          <option value={value}>{value} (Unavailable)</option>
        )}
        {[...groups].map(([provider, entries]) => (
          <optgroup key={provider} label={provider}>
            {entries.map((model) => (
              <option
                key={modelValue(model.provider, model.id)}
                value={modelValue(model.provider, model.id)}
              >
                {model.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function MemorySettings({
  worktreeId,
}: { worktreeId?: string | null } = {}) {
  const [selected, setSelected] = useState<MemoryDocumentId>("summary");
  const [document, setDocument] = useState<MemoryDocument | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState<ReturnType<
    typeof commandError
  > | null>(null);
  const [models, setModels] = useState<ChatModelOption[]>([]);
  const [phase1Model, setPhase1Model] = useState("");
  const [phase1ReasoningEffort, setPhase1ReasoningEffort] =
    useState<MemoryReasoningEffort>("low");
  const [phase2Model, setPhase2Model] = useState("");
  const [phase2ReasoningEffort, setPhase2ReasoningEffort] =
    useState<MemoryReasoningEffort>("medium");
  const [persistedConfig, setPersistedConfig] = useState<MemoryConfig | null>(
    null,
  );
  const [configLoading, setConfigLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [memoryDisabled, setMemoryDisabled] = useState(false);
  const [extensionWarning, setExtensionWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const request = useRef(0);

  const loadDocument = useCallback(async (id: MemoryDocumentId) => {
    const current = ++request.current;
    setDocumentLoading(true);
    setDocumentError(null);
    try {
      const next = await memoryApi.read(id);
      if (request.current === current) setDocument(next);
    } catch (failure) {
      if (request.current === current) {
        setDocument(null);
        setDocumentError(commandError(failure));
      }
    } finally {
      if (request.current === current) setDocumentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocument(selected);
    return () => {
      request.current += 1;
    };
  }, [loadDocument, selected]);

  useEffect(() => {
    let disposed = false;
    if (worktreeId) {
      void settingsApi.listExtensions(worktreeId).then(
        (extensions) => {
          if (disposed) return;
          const memory = extensions.find(
            (extension) => extension.name === "pi-memory",
          );
          setMemoryDisabled(memory?.enabled === false);
          setExtensionWarning(null);
        },
        (failure) => {
          if (!disposed) setExtensionWarning(commandError(failure).message);
        },
      );
    } else {
      setMemoryDisabled(false);
      setExtensionWarning(null);
    }
    void Promise.allSettled([
      memoryApi.getConfig(),
      memoryApi.listModels(worktreeId ?? ""),
    ]).then(([configResult, modelsResult]) => {
      if (disposed) return;
      if (configResult.status === "fulfilled") {
        const config = configResult.value;
        setPhase1Model(modelValue(config.phase1Provider, config.phase1ModelId));
        setPhase1ReasoningEffort(config.phase1ReasoningEffort);
        setPhase2Model(modelValue(config.phase2Provider, config.phase2ModelId));
        setPhase2ReasoningEffort(config.phase2ReasoningEffort);
        setPersistedConfig(config);
      } else setConfigError(commandError(configResult.reason).message);
      if (modelsResult.status === "fulfilled") setModels(modelsResult.value);
      else setModelsError(commandError(modelsResult.reason).message);
      setConfigLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, [worktreeId]);

  const availableValues = useMemo(
    () => new Set(models.map((model) => modelValue(model.provider, model.id))),
    [models],
  );
  const canSave =
    !configLoading &&
    !saving &&
    !memoryDisabled &&
    availableValues.has(phase1Model) &&
    availableValues.has(phase2Model);

  const saveConfig = async () => {
    const phase1 = splitModel(phase1Model);
    const phase2 = splitModel(phase2Model);
    if (!phase1 || !phase2 || !canSave) {
      setConfigError("Select available Phase 1 and Phase 2 models.");
      return;
    }
    setSaving(true);
    setSaved(false);
    setConfigError(null);
    try {
      const config = await memoryApi.setConfig({
        phase1Provider: phase1.provider,
        phase1ModelId: phase1.id,
        phase1ReasoningEffort,
        phase2Provider: phase2.provider,
        phase2ModelId: phase2.id,
        phase2ReasoningEffort,
      });
      setPhase1Model(modelValue(config.phase1Provider, config.phase1ModelId));
      setPhase1ReasoningEffort(config.phase1ReasoningEffort);
      setPhase2Model(modelValue(config.phase2Provider, config.phase2ModelId));
      setPhase2ReasoningEffort(config.phase2ReasoningEffort);
      setPersistedConfig(config);
      setSaved(true);
    } catch (failure) {
      if (persistedConfig) {
        setPhase1Model(
          modelValue(
            persistedConfig.phase1Provider,
            persistedConfig.phase1ModelId,
          ),
        );
        setPhase1ReasoningEffort(persistedConfig.phase1ReasoningEffort);
        setPhase2Model(
          modelValue(
            persistedConfig.phase2Provider,
            persistedConfig.phase2ModelId,
          ),
        );
        setPhase2ReasoningEffort(persistedConfig.phase2ReasoningEffort);
      }
      setConfigError(commandError(failure).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedName = documents.find(({ id }) => id === selected)!.name;
  return (
    <section className="memory-settings">
      <div className="memory-heading">
        <div>
          <h3>Memory</h3>
          <p className="settings-description">
            Configure processing and read the global documents generated by Pi
            Memory.
          </p>
        </div>
      </div>
      <div className="memory-config">
        <div className="memory-config-fields">
          <div className="memory-config-row">
            <ModelSelect
              label="Phase 1 Model"
              value={phase1Model}
              models={models}
              disabled={configLoading || saving || memoryDisabled}
              onChange={(value) => {
                setPhase1Model(value);
                setSaved(false);
              }}
            />
            <label>
              <span>Phase 1 Reasoning</span>
              <select
                aria-label="Phase 1 Reasoning Effort"
                value={phase1ReasoningEffort}
                disabled={configLoading || saving || memoryDisabled}
                onChange={(event) => {
                  setPhase1ReasoningEffort(
                    event.target.value as MemoryReasoningEffort,
                  );
                  setSaved(false);
                }}
              >
                {reasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="memory-config-row">
            <ModelSelect
              label="Phase 2 Model"
              value={phase2Model}
              models={models}
              disabled={configLoading || saving || memoryDisabled}
              onChange={(value) => {
                setPhase2Model(value);
                setSaved(false);
              }}
            />
            <label>
              <span>Phase 2 Reasoning</span>
              <select
                aria-label="Phase 2 Reasoning Effort"
                value={phase2ReasoningEffort}
                disabled={configLoading || saving || memoryDisabled}
                onChange={(event) => {
                  setPhase2ReasoningEffort(
                    event.target.value as MemoryReasoningEffort,
                  );
                  setSaved(false);
                }}
              >
                {reasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <small>Restart SpireCode after saving.</small>
        {memoryDisabled && (
          <div className="settings-empty">
            Enable pi-memory to configure Memory settings.
          </div>
        )}
        {extensionWarning && (
          <div className="settings-description">
            Unable to verify pi-memory status: {extensionWarning}
          </div>
        )}
        {modelsError && (
          <div className="dialog-error" role="alert">
            Unable to load models: {modelsError}
          </div>
        )}
        {!configLoading && !modelsError && models.length === 0 && (
          <div className="settings-empty">
            No available authenticated models.
          </div>
        )}
        {configError && (
          <div className="dialog-error" role="alert">
            {configError}
          </div>
        )}
        {saved && (
          <div className="memory-config-saved">
            Restart SpireCode to apply these changes.
          </div>
        )}
        <div className="memory-config-actions">
          <button
            type="button"
            disabled={!canSave}
            aria-label="Save Memory configuration"
            onClick={() => void saveConfig()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="memory-tabs" aria-label="Memory documents">
        {documents.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            className={selected === item.id ? "active" : ""}
            onClick={() => setSelected(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {documentLoading && (
        <div className="settings-empty" role="status">
          Loading {selectedName}…
        </div>
      )}
      {!documentLoading && documentError?.code === "NOT_FOUND" && (
        <div className="settings-empty">
          {selectedName} has not been generated yet.
        </div>
      )}
      {!documentLoading &&
        documentError &&
        documentError.code !== "NOT_FOUND" && (
          <div className="dialog-error" role="alert">
            {documentError.message}
          </div>
        )}
      {!documentLoading && document && (
        <div className="memory-document">
          <div className="memory-document-meta">
            <b>{document.name}</b>
            <span>{formatBytes(document.size)}</span>
            <span>{new Date(document.updatedAt).toLocaleString()}</span>
          </div>
          {document.content ? (
            <div className="memory-document-content">
              <MarkdownContent content={document.content} />
            </div>
          ) : (
            <div className="settings-empty">{document.name} is empty.</div>
          )}
        </div>
      )}
    </section>
  );
}
