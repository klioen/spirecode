# Spec: SpireCode 品牌图标

## Visual system

图标使用圆角深色底板承载一个明确的彩色 `S` 主体：

- `S` 是唯一主体，不再叠加左右括号，消除“双 S”视觉歧义。
- `S` 从青色过渡到暖黄色，表达开发输入到 Agent 产出的连续过程。
- `S` 的上端向右上延伸，以整体上升姿态表达 Spire，不再叠加独立尖角。
- 粗笔画与大负空间保证 16px 下仍能识别。
- 外围保留足够安全区，适配 macOS mask、Windows ICO 和 Linux PNG。

基础色：

- Background: `#0b151b` → `#12252a`
- Cyan: `#22d3ee` → `#16a6c1`
- Gold: `#ffd166` → `#f5a623`
- Border highlight: `rgba(255,255,255,0.12)`

## Assets

- 新增 `assets/spirecode-icon.svg` 作为唯一矢量源。
- 重建 `assets/icon.icns`，包含 macOS 所需的 16–1024px 图层。
- 重建 `assets/icon.ico`，包含 Windows 16、24、32、48、64、128、256px 图层。
- 重建 `assets/icons/{16,32,48,64,128,256,512}x*.png`。
- PNG 和 ICO 保持透明画布；圆角底板由图标本身绘制。

## In-app mark

新增无文字、`aria-hidden` 的 React SVG 品牌组件：

- `src/components/SpireCodeMark.tsx`
- Project Rail 使用紧凑尺寸，替代纯文本 `S`。
- 空工作台使用大尺寸，替代纯文本 `S`。
- CSS 仅负责尺寸、阴影和 flex 行为，图形色彩由 SVG 定义，确保主题间品牌一致。

## Verification

- 组件测试确认 Project Rail 和空工作台渲染同一品牌 mark。
- 资源验证确认 SVG、ICNS、ICO 和所有 PNG 存在且尺寸正确。
- `pnpm check` 全部通过。
- `pnpm bundle` 证明最终 macOS app/DMG 继续通过签名与 smoke。

## Concerns

- **Small-size clarity:** 16px 资源必须从简洁几何缩放，不使用会消失的线条。
- **macOS appearance:** 底板自行包含圆角和安全区，不能让内容贴到系统 mask 边缘。
- **Single source:** 不手工分别绘制三个平台图形，避免品牌漂移。
