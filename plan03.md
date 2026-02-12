# 计划文档：模拟控制开关与增强轨迹信息显示

## 1. 目标

本次迭代旨在优化用户界面交互，增加模拟功能的开关控制，并增强轨迹信息的展示能力以支持更多数据字段。

## 2. 核心功能分解

### 2.1. 数据模型升级 (Data Model)

*   **文件**: `src/pluginTypes.d.ts`
*   **任务**: 更新 `PlaneTrack` 接口，新增云物理相关字段。所有新字段应设为可选以兼容旧数据。对应字段如下：
    *   `icfp_num_conc`, `icfp_lwc`, `icfp_mvd`, `icfp_ed`
    *   `scdp_num_conc`, `scdp_lwc`, `scdp_mvd`, `scdp_ed`

### 2.2. 状态管理更新 (State Management)

*   **文件**: `src/stores/pollingStore.ts`
*   **任务**: 新增 `currentTrackData` store，用于存储当前时刻（无论是实时还是回放选定）的完整 `PlaneTrack` 对象。这将替代仅存储简单字符串的 `latestTrackInfo`，让 UI 组件能够访问所有详细字段。

### 2.3. UI 交互优化：模拟开关 (Simulation Toggle)

*   **文件**: `src/plugin.svelte`
*   **任务**:
    1.  **新增按钮**: 在 Track 按钮右侧新增 "Sim-ON/Sim-OFF" 切换按钮。
    2.  **显示逻辑**:
        *   仅在 `hasTrackData` 为真时显示。
        *   状态变量 `showSimulationControls` 默认为 `false` (对应按钮显示 "Sim-ON")。
        *   点击 "Sim-ON" -> 状态变为 `true`，按钮变 "Sim-OFF"，并展开 `<div class="simulation-controls">` 面板。
        *   点击 "Sim-OFF" -> 状态变为 `false`，按钮变 "Sim-ON"，**立即**隐藏面板并调用 `clearSimulationLayers()` 清除地图上的模拟图层。
