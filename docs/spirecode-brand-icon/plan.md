# Plan: SpireCode 品牌图标（from docs/spirecode-brand-icon/spec.md 2026-09-19）

## Files that change

- `docs/spirecode-brand-icon/{intent,spec,plan}.md`：品牌目标、视觉规格、实施与证明。
- `assets/spirecode-icon.svg`：Code Spire 唯一矢量源。
- `assets/icon.icns`：macOS 多分辨率应用图标。
- `assets/icon.ico`：Windows 多分辨率应用图标。
- `assets/icons/*.png`：Linux 多分辨率应用图标。
- `scripts/generate-icons.py`：从同一几何确定性生成 PNG、ICO 和 macOS iconset 输入。
- `src/components/SpireCodeMark.tsx`：应用内共享品牌组件。
- `src/features/projects/ProjectRail.tsx`：侧栏使用品牌组件替代文本 `S`。
- `src/features/workbench/Workbench.tsx`：空工作台使用品牌组件替代文本 `S`。
- `src/styles/index.css`：品牌组件尺寸与阴影。
- 相关组件测试：验证共享 mark 渲染。

## Order of work

1. 创建几何简单、适合小尺寸的 SVG 源和确定性 Python/Pillow 生成器。
2. 生成 Linux PNG、Windows ICO 和 macOS iconset，再用 `iconutil` 生成 ICNS。
3. 创建共享 React SVG mark，将侧栏和空工作台的文本 `S` 替换为同一图形。
4. 更新样式和测试，检查 16px、64px、512px 预览及文件格式。
5. 运行 `pnpm check` 和 `pnpm bundle`，验证最终 macOS artifact。

## Risks

- 最危险的是小尺寸图标糊成色块；通过粗几何、充足负空间和逐尺寸检查规避。
- Pillow 绘制与 SVG 抗锯齿可能略有差异；生成器使用 4x supersampling，并共享同一坐标和颜色定义。
- ICNS 如果缺少 Retina 命名图层会被 `iconutil` 拒绝；生成完整 iconset contract。
- 不使用在线 Logo 生成服务，避免不可复现、授权和风格漂移。

## Proof

- Python 资源检查：PNG 尺寸、ICO frame、ICNS 文件类型全部符合预期。
- 相关 Vitest 组件测试通过。
- `pnpm check`。
- `pnpm bundle`，最终 app 和 DMG smoke 通过。
