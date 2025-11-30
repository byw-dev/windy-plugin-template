# 计划文档：飞机轨迹回放功能

## 1. 目标

为Windy插件增加一个带时间进度条和控制按钮的飞机轨迹回放功能。用户可以通过UI控件查看历史轨迹，同时后台数据轮询保持不变。

## 2. 核心功能分解

### 2.1. 状态管理

在 `src/plugin.svelte` 的 `<script>` 部分，引入以下新的状态变量来管理回放逻辑：

*   `isPlaybackMode`: `boolean` - 模式开关。`false`为实时模式，`true`为回放模式。
*   `playbackIndex`: `number` - 当前显示的轨迹点索引。默认值为 `-1`，代表实时模式（即显示最新位置）。
*   `isPlaying`: `boolean` - 播放状态。`true`表示正在自动播放，`false`表示暂停。
*   `playbackTimer`: `number | null` - 用于存储 `setInterval` 的ID，控制自动播放。
*   `fastForwardTimer`: `number | null` - 用于存储长按快进/快退的 `setInterval` ID。

### 2.2. UI组件

在 `src/plugin.svelte` 的HTML部分，添加一个新的UI区域，该区域仅在 `hasData` 为 `true` 时可见。

*   **容器**: `<div class="playback-controls">`
*   **控制按钮**:
    *   后退按钮: `<button>`，内嵌后退SVG图标。
    *   播放/暂停按钮: `<button>`，内嵌播放/暂停SVG图标，根据 `isPlaying` 状态切换。
    *   前进按钮: `<button>`，内嵌前进SVG图标。
*   **进度条**: `<input type="range" min="0" max="{totalPoints - 1}" bind:value={playbackIndex}>`

### 2.3. 核心渲染逻辑

重构当前的地图渲染方式，创建一个统一的渲染函数 `updateMapDisplay()`。

*   **`updateMapDisplay(isDragging = false)`**:
    1.  获取当前选中的轨迹点索引，如果处于实时模式，则索引为轨迹数组的最后一个元素。
    2.  **清除旧图层**:
        *   如果不是在拖动滑块 (`isDragging = false`)，则清除 `PLANE_LAYER_STORE` 中所有旧的轨迹线段。
    3.  **渲染新轨迹**:
        *   如果不是在拖动滑块，则根据当前索引，从 `0` 到该索引渲染新的轨迹线段，并添加到地图和 `PLANE_LAYER_STORE` 中。
    4.  **更新飞机图标**:
        *   将 `planeMarker` 的位置和朝向更新到当前索引对应的数据。

*   **修改 `fetchPlaneTrack`**:
    *   数据获取和处理后，如果当前不处于回放模式 (`!isPlaybackMode`)，则调用 `updateMapDisplay()` 来更新视图。

### 2.4. 事件处理与交互逻辑

1.  **进度条 (`<input type="range">`)**:
    *   `on:input` (拖动时):
        *   进入回放模式 (`isPlaybackMode = true`)，暂停播放 (`isPlaying = false`)。
        *   根据滑块值更新 `playbackIndex`。
        *   调用 `updateMapDisplay(true)`，只移动飞机图标。
    *   `on:change` (拖动结束时):
        *   调用 `updateMapDisplay(false)`，重绘轨迹。

2.  **播放/暂停按钮**:
    *   `on:click`:
        *   进入回放模式。
        *   切换 `isPlaying` 状态。
        *   如果 `isPlaying` 变为 `true`：
            *   启动 `playbackTimer` (`setInterval`)，每秒递增 `playbackIndex` 并调用 `updateMapDisplay()`。
            *   当 `playbackIndex` 到达轨迹末端时，切换到实时模式 (`isPlaybackMode = false`, `playbackIndex = -1`) 并停止计时器。
        *   如果 `isPlaying` 变为 `false`，清除 `playbackTimer`。

3.  **后退/前进按钮**:
    *   `on:click`:
        *   进入回放模式，暂停播放。
        *   `playbackIndex` 减一或加一（并检查边界）。
        *   调用 `updateMapDisplay()`。
    *   `on:mousedown`:
        *   启动 `fastForwardTimer`，每100毫秒调整1个点（即每秒10个点）。
    *   `on:mouseup` / `on:mouseleave`:
        *   清除 `fastForwardTimer`。

### 3. SVG图标

将使用以下内联SVG作为按钮图标：

*   **后退**: `<svg>...</svg>` (类似 `<<` 的形状)
*   **播放**: `<svg>...</svg>` (三角形)
*   **暂停**: `<svg>...</svg>` (两条竖线)
*   **前进**: `<svg>...</svg>` (类似 `>>` 的形状)

