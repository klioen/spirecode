# Spec: 允许编辑选中的文件
Status: draft。 Implements: `docs/edit-selected-files/intent.md`。

## 1. Requirements

1. `file` 类型资源使用可编辑 Monaco；`diff` 类型仍只读。
2. 文件加载完成后，以该内容作为 saved baseline。编辑内容与 baseline 不同即为 dirty。
3. dirty 文件在对应标签标题上显示未保存标记；保存成功后清除。
4. 当前文件聚焦或打开时，`⌘S` 触发保存并阻止浏览器默认行为。
5. 保存失败时保留用户 buffer 和 dirty 状态，并显示结构化错误。
6. 保存期间不得把 watcher 导致的重读静默覆盖到 dirty buffer。
7. 若文件在加载后被外部修改，保存必须以版本条件拒绝，用户内容继续保留，并提示重新加载后再编辑。
8. 关闭 dirty 标签前必须确认；取消时标签和 buffer 均保留。

## 2. Architecture and contracts

新增 allowlisted host command：

```text
fs_write_file {
  worktreeId: string,
  relativePath: string,
  content: string,
  expectedVersion: string
} -> FileContent
```

`FileContent.version` 改为稳定字符串，由 Main 根据文件内容与 metadata 生成。`fs_read_file` 返回版本；`fs_write_file` 在写入前重新计算当前版本并与 `expectedVersion` 比较，不一致返回 `FILE_CONFLICT`。

Renderer 不接收绝对路径。IPC 对 `content` 单独设置不超过 5 MiB 的 UTF-8 byte 限制；`relativePath` 与 ID 延续现有限制。

## 3. Main filesystem behavior

- `FilesystemService.writeFile` 复用 `resolveProjectPath(root, relativePath, true)`，因此只允许覆盖已存在、位于 worktree 内且非 `.git` 的真实文件。
- 写入前验证目标仍是普通文件、当前文件仍是 UTF-8 文本且未超过上限。
- 验证 `expectedVersion` 后写入 UTF-8 内容；新内容超过 5 MiB 时返回 `FILE_TOO_LARGE`。
- 使用同目录临时文件并 rename 替换，避免截断后失败留下半文件；保留原文件 mode。
- 返回写入后的 `FileContent` 和新 version。

## 4. Renderer behavior

- 文件正文与 saved baseline 留在 `ResourceView` 局部状态，不进入 Zustand。
- `onChange` 更新局部 buffer 和 dirty 标记；editor store 只记录每个 tab 的 dirty metadata，供 tab 标题与关闭判断使用。
- `⌘S` 调用 `fsWriteFile`。成功后以响应内容/version 更新 baseline、cache 并清除 dirty。
- watcher invalidation：clean 文件按现有逻辑刷新；dirty 文件保留本地 buffer，仅记录远端可能变化。真正保存时依靠 expectedVersion 阻止覆盖。
- 保存错误显示在编辑区域内，不清空现有内容。
- 关闭 dirty tab 使用原生 `window.confirm`；确认后丢弃，取消则不关闭。

## 5. Error contract

新增错误码：

```text
FILE_CONFLICT
```

消息说明文件已在磁盘上变化，当前编辑未保存且未被覆盖。

## 6. Acceptance criteria

- 打开 UTF-8 文件后可输入，标签出现 dirty 标记。
- `⌘S` 后磁盘内容正确、dirty 标记消失。
- 二进制、大文件、目录和越界路径仍不可编辑/写入。
- Git diff 仍无法编辑。
- 外部修改后保存得到 `FILE_CONFLICT`，不会覆盖外部内容或丢失本地 buffer。
- dirty 标签关闭可取消；确认后才丢弃。
- `pnpm check` 全部通过。

## 7. Concerns

### Concern A: watcher self-invalidation

保存会触发 filesystem watcher。响应先更新 cache/baseline，后续 invalidation 可安全重读；generation 检查继续防止旧响应覆盖新状态。

### Concern B: large IPC payload

现有通用 `text` 参数仅允许 64 KiB，文件正文需独立验证，但仍严格限制为 5 MiB，与读取上限一致。

### Concern C: atomic replacement and symlinks

临时文件必须创建在已解析目标的同目录，且最终 rename 前再次确认目标边界。不能接受 Renderer 提供的临时路径。
