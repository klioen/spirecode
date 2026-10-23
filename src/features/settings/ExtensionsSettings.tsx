import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  ExtensionCatalogItem,
  ExtensionCatalogResult,
  ExtensionCatalogSort,
  ExtensionSetting,
} from "../../bindings";
import { SearchableSelect } from "../../components/SearchableSelect";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { settingsApi } from "./settingsApi";

type Tab = "marketplace" | "installed";
type Confirmation =
  | { action: "install"; item: ExtensionCatalogItem }
  | { action: "remove"; extension: ExtensionSetting }
  | null;

export function ExtensionsSettings({
  worktreeId,
}: {
  worktreeId: string | null;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("installed");
  const [extensions, setExtensions] = useState<ExtensionSetting[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [installedError, setInstalledError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ExtensionCatalogResult | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExtensionCatalogSort>("downloads");
  const [page, setPage] = useState(1);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [mutation, setMutation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  useEffect(() => {
    let disposed = false;
    setInstalledLoading(true);
    settingsApi.listExtensions(worktreeId ?? undefined).then(
      (items) => {
        if (!disposed) {
          setExtensions(items);
          setInstalledError(null);
          setInstalledLoading(false);
        }
      },
      (failure) => {
        if (!disposed) {
          setInstalledError(commandError(failure).message);
          setInstalledLoading(false);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [worktreeId]);

  useEffect(() => {
    if (tab !== "marketplace") return;
    let disposed = false;
    setCatalogLoading(true);
    setCatalogError(null);
    settingsApi.listExtensionCatalog(query, sort, page).then(
      (result) => {
        if (!disposed) {
          setCatalog(result);
          setCatalogLoading(false);
        }
      },
      (failure) => {
        if (!disposed) {
          setCatalogError(commandError(failure).message);
          setCatalogLoading(false);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [catalogRevision, page, query, sort, tab]);

  const installedNames = useMemo(
    () => new Set(extensions.map(({ name }) => name)),
    [extensions],
  );
  const installedRows = useMemo(() => {
    const seenSources = new Set<string>();
    return extensions.filter((extension) => {
      if (!extension.packageSource) return true;
      if (seenSources.has(extension.packageSource)) return false;
      seenSources.add(extension.packageSource);
      return true;
    });
  }, [extensions]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const next = draftQuery.trim();
    setPage(1);
    setQuery(next);
  };

  const completeMutation = (items: ExtensionSetting[]) => {
    setExtensions(items);
    setRestartRequired(true);
    setMutationError(null);
  };

  const install = async (item: ExtensionCatalogItem) => {
    if (mutation) return;
    setMutation(`install:${item.name}`);
    setMutationError(null);
    try {
      completeMutation(await settingsApi.installExtensionPackage(item.name));
      setConfirmation(null);
    } catch (failure) {
      setMutationError(commandError(failure).message);
    } finally {
      setMutation(null);
    }
  };

  const update = async (extension: ExtensionSetting) => {
    if (mutation || !extension.packageSource) return;
    setMutation(`update:${extension.packageSource}`);
    setMutationError(null);
    try {
      completeMutation(
        await settingsApi.updateExtensionPackage(extension.packageSource),
      );
    } catch (failure) {
      setMutationError(commandError(failure).message);
    } finally {
      setMutation(null);
    }
  };

  const remove = async (extension: ExtensionSetting) => {
    if (mutation || !extension.packageSource) return;
    setMutation(`remove:${extension.packageSource}`);
    setMutationError(null);
    try {
      completeMutation(
        await settingsApi.removeExtensionPackage(extension.packageSource),
      );
      setConfirmation(null);
    } catch (failure) {
      setMutationError(commandError(failure).message);
    } finally {
      setMutation(null);
    }
  };

  return (
    <section className="extensions-settings">
      <h3>{t("settings.section.extensions")}</h3>
      <p className="settings-description">
        {t("settings.extensions.description")}
      </p>
      <div
        className="extensions-tabs"
        role="tablist"
        aria-label={t("settings.extensions.tabs")}
      >
        {(["installed", "marketplace"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {t(`settings.extensions.tab.${value}`)}
          </button>
        ))}
      </div>
      {restartRequired && (
        <div className="extension-notice" role="status">
          {t("settings.extensions.restartRequired")}
        </div>
      )}
      {mutationError && <div className="dialog-error">{mutationError}</div>}

      {tab === "marketplace" ? (
        <div role="tabpanel" className="extension-marketplace">
          <div className="extension-community-note">
            <b>{t("settings.extensions.community.title")}</b>
            <span>{t("settings.extensions.community.description")}</span>
          </div>
          <form className="extension-marketplace-controls" onSubmit={search}>
            <input
              type="search"
              aria-label={t("settings.extensions.search")}
              placeholder={t("settings.extensions.search.placeholder")}
              value={draftQuery}
              maxLength={160}
              onChange={(event) => setDraftQuery(event.target.value)}
            />
            <SearchableSelect
              ariaLabel={t("settings.extensions.sort")}
              value={sort}
              options={(["downloads", "recent", "name"] as const).map(
                (value) => ({
                  value,
                  label: t(`settings.extensions.sort.${value}`),
                }),
              )}
              onChange={(value) => {
                setPage(1);
                setSort(value as ExtensionCatalogSort);
              }}
            />
            <button type="submit">
              {t("settings.extensions.search.action")}
            </button>
          </form>
          {catalogLoading && (
            <div className="settings-empty">
              {t("settings.extensions.catalog.loading")}
            </div>
          )}
          {!catalogLoading && catalogError && (
            <div className="settings-empty extension-catalog-error">
              <span>
                {t("settings.extensions.catalog.failed", {
                  error: catalogError,
                })}
              </span>
              <button
                type="button"
                onClick={() => setCatalogRevision((value) => value + 1)}
              >
                {t("settings.extensions.retry")}
              </button>
              <a
                href="https://pi.dev/packages?type=extension"
                target="_blank"
                rel="noreferrer"
              >
                {t("settings.extensions.openCatalog")}
              </a>
            </div>
          )}
          {!catalogLoading && !catalogError && catalog?.items.length === 0 && (
            <div className="settings-empty">
              {t("settings.extensions.catalog.empty")}
            </div>
          )}
          {!catalogLoading &&
            !catalogError &&
            catalog &&
            catalog.items.length > 0 && (
              <>
                <div className="extension-catalog-grid">
                  {catalog.items.map((item) => {
                    const installed = installedNames.has(item.name);
                    const installing = mutation === `install:${item.name}`;
                    return (
                      <article className="extension-card" key={item.name}>
                        <div className="extension-card-heading">
                          <div>
                            <a
                              href={item.catalogUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.name}
                            </a>
                            <span>
                              {t("settings.extensions.community.badge")}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="primary"
                            aria-label={t(
                              installed
                                ? "settings.extensions.installed.aria"
                                : "settings.extensions.install.aria",
                              { name: item.name },
                            )}
                            disabled={installed || mutation !== null}
                            onClick={() =>
                              setConfirmation({ action: "install", item })
                            }
                          >
                            {installed
                              ? t("settings.extensions.installed")
                              : installing
                                ? t("settings.extensions.installing")
                                : t("settings.extensions.install")}
                          </button>
                        </div>
                        <p>{item.description}</p>
                        <div className="extension-card-meta">
                          <span>{item.publisher}</span>
                          <span>{item.downloadsLabel}</span>
                          <span>{item.publishedLabel}</span>
                        </div>
                        <div className="extension-card-links">
                          {item.npmUrl && (
                            <a
                              href={item.npmUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("settings.extensions.npm")}
                            </a>
                          )}
                          {item.repositoryUrl && (
                            <a
                              href={item.repositoryUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("settings.extensions.repository")}
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="extension-pagination">
                  <button
                    type="button"
                    disabled={catalog.page <= 1 || catalogLoading}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    {t("settings.extensions.previous")}
                  </button>
                  <span>
                    {t("settings.extensions.page", {
                      page: catalog.page,
                      total: catalog.totalPages,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={
                      catalog.page >= catalog.totalPages || catalogLoading
                    }
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t("settings.extensions.next")}
                  </button>
                </div>
              </>
            )}
        </div>
      ) : (
        <div role="tabpanel" className="extension-sections">
          <section className="extension-section">
            <h4>{t("settings.extensions.user")}</h4>
            <p>{t("settings.extensions.user.description")}</p>
            {installedLoading && (
              <div className="settings-empty">
                {t("settings.extensions.loading")}
              </div>
            )}
            {installedError && (
              <div className="dialog-error">{installedError}</div>
            )}
            {!installedLoading &&
              !installedError &&
              installedRows.length === 0 && (
                <div className="settings-empty">
                  {t("settings.extensions.user.empty")}
                </div>
              )}
            {!installedLoading &&
              !installedError &&
              installedRows.length > 0 && (
                <div className="extension-list">
                  {installedRows.map((extension) => (
                    <article className="extension-row" key={extension.id}>
                      <div className="extension-details">
                        <div className="extension-title">
                          <b>{extension.name}</b>
                          {extension.version && (
                            <span>v{extension.version}</span>
                          )}
                          <span>
                            {extension.management === "local"
                              ? t("settings.extensions.local")
                              : extension.source}
                          </span>
                        </div>
                        <code title={extension.displayPath}>
                          {extension.displayPath}
                        </code>
                        <small>
                          {t(
                            extension.enabled
                              ? "settings.extensions.status.enabled"
                              : "settings.extensions.status.disabled",
                          )}
                        </small>
                      </div>
                      {extension.management && extension.packageSource && (
                        <div className="extension-row-actions">
                          {extension.management === "npm" && (
                            <button
                              type="button"
                              aria-label={t("settings.extensions.update.aria", {
                                name: extension.name,
                              })}
                              disabled={mutation !== null}
                              onClick={() => void update(extension)}
                            >
                              {mutation === `update:${extension.packageSource}`
                                ? t("settings.extensions.updating")
                                : t("settings.extensions.update")}
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={t(
                              extension.management === "local"
                                ? "settings.extensions.removeLocal.aria"
                                : "settings.extensions.uninstall.aria",
                              { name: extension.name },
                            )}
                            disabled={mutation !== null}
                            onClick={() =>
                              setConfirmation({ action: "remove", extension })
                            }
                          >
                            {t(
                              extension.management === "local"
                                ? "settings.extensions.removeLocal"
                                : "settings.extensions.uninstall",
                            )}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
          </section>
        </div>
      )}

      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => !open && !mutation && setConfirmation(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="chat-delete-overlay" />
          <Dialog.Content className="chat-delete-dialog extension-confirmation-dialog">
            <Dialog.Title asChild>
              <h2>
                {confirmation?.action === "install"
                  ? t("settings.extensions.confirm.install.title", {
                      name: confirmation.item.name,
                    })
                  : confirmation?.action === "remove"
                    ? t(
                        confirmation.extension.management === "local"
                          ? "settings.extensions.confirm.removeLocal.title"
                          : "settings.extensions.confirm.remove.title",
                        { name: confirmation.extension.name },
                      )
                    : ""}
              </h2>
            </Dialog.Title>
            <Dialog.Description asChild>
              <div>
                {confirmation?.action === "install" ? (
                  <>
                    <p>{t("settings.extensions.confirm.install.warning")}</p>
                    <dl>
                      <div>
                        <dt>{t("settings.extensions.package")}</dt>
                        <dd>{confirmation.item.name}</dd>
                      </div>
                      <div>
                        <dt>{t("settings.extensions.publisher")}</dt>
                        <dd>{confirmation.item.publisher}</dd>
                      </div>
                      <div>
                        <dt>{t("settings.extensions.scope")}</dt>
                        <dd>{t("settings.extensions.scope.user")}</dd>
                      </div>
                    </dl>
                  </>
                ) : confirmation?.action === "remove" ? (
                  <p>
                    {t(
                      confirmation.extension.management === "local"
                        ? "settings.extensions.confirm.removeLocal.description"
                        : "settings.extensions.confirm.remove.description",
                    )}
                  </p>
                ) : null}
              </div>
            </Dialog.Description>
            <div className="chat-delete-actions">
              <Dialog.Close asChild>
                <button type="button" disabled={mutation !== null}>
                  {t("settings.extensions.cancel")}
                </button>
              </Dialog.Close>
              {confirmation?.action === "install" && (
                <button
                  type="button"
                  className="primary"
                  disabled={mutation !== null}
                  onClick={() => void install(confirmation.item)}
                >
                  {t("settings.extensions.confirm.install.action")}
                </button>
              )}
              {confirmation?.action === "remove" && (
                <button
                  type="button"
                  className="danger"
                  disabled={mutation !== null}
                  onClick={() => void remove(confirmation.extension)}
                >
                  {t(
                    confirmation.extension.management === "local"
                      ? "settings.extensions.confirm.removeLocal.action"
                      : "settings.extensions.confirm.remove.action",
                  )}
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
