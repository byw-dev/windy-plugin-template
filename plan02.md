# 计划文档：人工影响天气作业模拟（修订版）

## 1. 目标

在现有飞机轨迹展示功能的基础上，增加人工影响天气作业效果的模拟与可视化。用户可以输入影响半径和时间阈值，插件将根据飞机轨迹、速度以及风场数据，计算并展示一个动态的、受影响的区域。该功能需要与现有的轨迹回放系统完全集成。

## 2. 环境与约束

*   **Windy 插件环境**: 本项目为 Windy 插件，所有开发需遵循其 API 和生命周期。
*   **Leaflet.js**: 地图渲染库 Leaflet (`L`) 由 Windy 环境提供，不能自行引入或替换。所有与 Leaflet 相关的类型定义，应参考项目内的 `declarations/patched-leaflet.d.ts` 文件。
*   **地图对象**: 全局地图实例通过 `@windy/map` 模块的 `map` 对象访问。

## 3. 核心功能分解

### 3.1. 数据模型更新 (Data Model)

*   **文件**: `src/pluginTypes.d.ts`
*   **任务**: 更新 `PlaneTrack` 接口，以匹配后端返回的最新数据结构，必须包含风速（`ws`）和风向（`wd`）字段，以便进行模拟计算。

```typescript
// src/pluginTypes.d.ts
export interface PlaneTrack {
    id: string;
    timestamp: number;
    lon: number;
    lat: number;
    alt: number;
    speed: number;    // 对地速度 (m/s)
    heading: number;  // 对地航向 (度)
    ws?: number;      // 风速 (m/s)
    wd?: number;      // 风向 (度)
    tmp?: number;
    hum?: number;
}
```

### 3.2. UI增强 (UI Enhancements)

*   **文件**: `src/plugin.svelte`
*   **任务**: 在现有UI中增加模拟参数输入和启动按钮。

1.  **增加 Svelte 状态变量**:
    *   `simulationRadius`: `number` - 影响半径 `r` (米)，提供默认值（如 500）。
    *   `timeThreshold`: `number` - 时间阈值 `t` (秒)，提供默认值（如 10）。

2.  **增加HTML元素**:
    *   在回放控件 (`<PlaybackControls />`) 下方，添加一个新的 `div` 容器用于模拟控制。
    *   **输入框**: 两个 `input[type=number]`，分别使用 `bind:value` 绑定到 `simulationRadius` 和 `timeThreshold`。
    *   **模拟按钮**: 一个 `<button>`，文本为 "Simulate"，`on:click` 事件绑定到 `handleSimulation` 处理器。

### 3.3. 模拟算法实现 (Simulation Algorithm)

*   **新文件**: `src/services/simulationService.ts`
*   **任务**: 创建一个新服务，用于封装所有与模拟相关的纯计算逻辑，使其与地图渲染和 Svelte 组件解耦。

1.  **向量与颜色定义**:
    *   定义 `Vec2` 接口。
    *   导出 `colorMap` 数组，用于根据影响程度着色。定义如下：
    ```typescript
    /**
    * 色卡定义 (0为灰色，之后为冷暖渐变)
    * 用于根据暴露时间显示不同的颜色。
    */
       export const colorMap = [
       { r: 0.7, g: 0.7, b: 0.7, a: 0.2 },   // [0, 10): 灰色 (默认/未暴露)
       { r: 0.2, g: 0.5, b: 1.0, a: 0.35 },  // [10, 20): 蓝色
       { r: 0.1, g: 0.8, b: 0.8, a: 0.45 },  // [20, 30): 青色
       { r: 0.3, g: 1.0, b: 0.3, a: 0.55 },  // [30, 40): 绿色
       { r: 0.8, g: 1.0, b: 0.2, a: 0.6 },   // [40, 50): 黄绿色
       { r: 1.0, g: 1.0, b: 0.1, a: 0.65 },  // [50, 60): 黄色
       { r: 1.0, g: 0.7, b: 0.1, a: 0.7 },   // [60, 70): 橙色
       { r: 1.0, g: 0.5, b: 0.1, a: 0.75 },  // [70, 80): 橙红色
       { r: 1.0, g: 0.2, b: 0.1, a: 0.8 },   // [80, 90): 红色
       { r: 1.0, g: 0.0, b: 0.2, a: 0.85 },  // [90, 100): 深红色
       { r: 1.0, g: 0.0, b: 0.6, a: 0.9 }    // [100, +∞): 品红色 (标记极高值)
       ];
    ```

2.  **核心计算函数**:
    *   `toVector(speed, heading)`: 将速度和方向（度）转换为 `Vec2` 向量。
    *   `computeAirspeed(groundSpeed, groundHeading, windSpeed, windDirection)`: 根据对地速度向量和风速向量，计算出飞机相对空气的速度向量。注意风向（`wd`）通常指风的来源方向，计算时需转换为去向。
    *   `affectedAreaFraction(r, t, v_air)`: 根据影响半径 `r`、时间阈值 `t` 和相对空速 `v_air`，计算出受影响区域的面积占比。这是本次需求的核心算法。

3.  **模拟执行函数 `runSimulation`**:
    *   **输入**: `tracks: PlaneTrack[]`, `radius: number`, `threshold: number`。
    *   **输出**: `SimulationLayer[]` (一个自定义的接口，见 4.1)。
    *   **逻辑**:
        *   遍历每个轨迹点 `track`。
        *   若 `track.speed > 0` 且风场数据有效（`track.ws`, `track.wd` 都非空），则调用 `computeAirspeed` 和 `affectedAreaFraction` 计算面积占比 `frac`。
        *   根据 `frac` 从 `colorMap` 中选取颜色。
        *   **不在此处创建 Leaflet 对象**。而是生成一个包含所有必要信息（时间戳、初始经纬度、半径、颜色、风速向量）的普通 JavaScript 对象，并将其添加到返回数组中。这能保持该服务的纯粹性。

### 3.4. 状态管理与地图渲染 (State & Rendering)

1.  **创建 `src/stores/simulationStore.ts`**:
    *   `simulationLayers`: `writable<SimulationLayer[]>` - 存储由 `runSimulation` 生成的图层数据对象数组。
    *   `isSimulated`: `writable<boolean>` - 标记当前是否处于模拟显示状态。
    *   `SimulationLayer` 接口定义:
        ```typescript
        export interface SimulationLayer {
            timestamp: number;
            lat: number;
            lon: number;
            radius: number;
            color: { r, g, b, a };
            windVector: Vec2; // 用于后续移动计算
        }
        ```

2.  **修改 `src/services/trackService.ts`**:
    *   **创建图层组**: 在文件顶部创建一个 `simulationLayerGroup = L.layerGroup()`。这个图层组将用于统一管理所有模拟圆圈，方便整体添加、移除和清空。
    *   **修改 `updateMapDisplay` 函数**: 这是与回放功能集成的关键。
        *   在函数开头，首先检查 `get(isSimulated)` 是否为 `true`。
        *   如果是，则清空 `simulationLayerGroup.clearLayers()`。
        *   获取当前的回放时间 `currentPlaybackTime`（可以从 `playbackStore` 获取或根据当前 `effectiveIndex` 计算）。
        *   遍历 `simulationStore` 中的 `simulationLayers`：
            *   对于每个 `layer`，如果其 `timestamp <= currentPlaybackTime`，说明它应该被显示。
            *   计算时间差 `deltaT = currentPlaybackTime - layer.timestamp`。
            *   根据 `layer.windVector` 和 `deltaT` 计算位移（米）。
            *   将米制位移转换为经纬度偏移。**注意**：这是一个近似计算，需考虑纬度对经度距离的影响。`latOffset = dy / metersPerDegreeLat`, `lonOffset = dx / (metersPerDegreeLat * cos(lat))`。
            *   计算出圆心当前的新经纬度 `newLatLng`。
            *   使用 `L.circle(newLatLng, { radius, color, ... })` 创建一个新的圆，并将其添加到 `simulationLayerGroup` 中。
        *   确保 `simulationLayerGroup` 已被添加到 `map` 对象上。

3.  **连接 `plugin.svelte` 中的事件**:
    *   实现 `handleSimulation` 函数：
        *   从 `trackStore` 获取当前全部轨迹数据。
        *   调用 `simulationService.runSimulation()`，传入轨迹数据和 UI 上的 `simulationRadius`, `timeThreshold`。
        *   将返回的 `SimulationLayer[]` 数据设置到 `simulationStore` 中。
        *   设置 `isSimulated` store 为 `true`。
        *   手动调用一次 `updateMapDisplay()` 来立即显示模拟的初始状态。

## 4. 实施步骤

1.  **数据模型**: 修改 `src/pluginTypes.d.ts`。
2.  **UI 开发**: 在 `src/plugin.svelte` 中添加输入框和按钮，并绑定状态。
3.  **Store 创建**: 创建 `src/stores/simulationStore.ts` 并定义 `SimulationLayer` 接口。
4.  **算法实现**: 创建 `src/services/simulationService.ts` 并实现所有纯计算函数 (`computeAirspeed`, `affectedAreaFraction`, `runSimulation`)。
5.  **渲染逻辑**: 修改 `src/services/trackService.ts`，在 `updateMapDisplay` 中集成模拟图层的动态渲染和移动逻辑。
6.  **事件绑定**: 在 `src/plugin.svelte` 中实现 `handleSimulation` 函数，将所有部分串联起来。
7.  **测试与调试**:
    *   测试模拟按钮的功能。
    *   验证回放时，圆圈是否根据风速正确移动。
    *   检查边界情况（如风速为0，飞机静止等）。
    *   确认与现有的轨迹线、飞机图标渲染不冲突。

