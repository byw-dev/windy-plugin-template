/**
 * Simulation Store - 管理模拟状态
 */
import { writable } from 'svelte/store';

/**
 * 二维向量接口
 */
export interface Vec2 {
    x: number;
    y: number;
}

/**
 * 模拟图层数据接口
 */
export interface SimulationLayer {
    timestamp: number;
    lat: number;
    lon: number;
    radius: number;
    color: { r: number; g: number; b: number; a: number };
    windVector: Vec2; // 用于后续移动计算
}

/**
 * 存储由 runSimulation 生成的图层数据对象数组
 */
export const simulationLayers = writable<SimulationLayer[]>([]);

/**
 * 标记当前是否处于模拟显示状态
 */
export const isSimulated = writable<boolean>(false);
