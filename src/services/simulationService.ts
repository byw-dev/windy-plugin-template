/**
 * Simulation Service - 人工影响天气作业模拟计算逻辑
 */
import type { PlaneTrack } from '../pluginTypes';
import type { Vec2, SimulationLayer } from '../stores/simulationStore';

// 常量定义
const DEG_TO_RAD = Math.PI / 180;

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

/**
 * 将速度和方向（度）转换为 Vec2 向量
 * @param speed - 速度大小
 * @param heading - 方向（度，0度为北，顺时针）
 * @returns Vec2 向量
 */
export function toVector(speed: number, heading: number): Vec2 {
    // 将度数转换为弧度
    // 航向：0度为北，顺时针；数学角度：0度为东，逆时针
    // 转换：数学角度 = 90 - 航向
    const angleRad = (90 - heading) * DEG_TO_RAD;
    return {
        x: speed * Math.cos(angleRad),
        y: speed * Math.sin(angleRad)
    };
}

/**
 * 根据对地速度向量和风速向量，计算出飞机相对空气的速度向量
 * @param groundSpeed - 对地速度 (m/s)
 * @param groundHeading - 对地航向 (度)
 * @param windSpeed - 风速 (m/s)
 * @param windDirection - 风向 (度，风的来源方向)
 * @returns 相对空速向量
 */
export function computeAirspeed(
    groundSpeed: number,
    groundHeading: number,
    windSpeed: number,
    windDirection: number
): Vec2 {
    // 将对地速度转换为向量
    const groundVec = toVector(groundSpeed, groundHeading);
    
    // 风向是风的来源方向，需要转换为风的去向（+180度）
    const windToDirection = (windDirection + 180) % 360;
    const windVec = toVector(windSpeed, windToDirection);
    
    // 空速 = 对地速度 - 风速
    return {
        x: groundVec.x - windVec.x,
        y: groundVec.y - windVec.y
    };
}

/**
 * 根据影响半径 r、时间阈值 t 和相对空速 v_air，计算出受影响区域的面积占比
 * 
 * 算法说明：
 * 此函数计算一个圆形影响区域内满足暴露时间阈值的面积占比。
 * 粒子在圆内停留的时间取决于它相对于飞机的速度（空速）。
 * 
 * 几何模型：
 * - 影响区域是半径为 r 的圆
 * - 粒子以速度 v 相对于圆心移动
 * - 只有暴露时间 >= t 的粒子才被认为"受影响"
 * - L = t * |v| 是粒子在时间 t 内移动的距离
 * - 当 L >= 2r 时，粒子穿过圆的最大距离不足 t 秒，返回 0
 * - 否则，计算满足条件的区域面积（椭圆形区域的近似）
 * 
 * @param r - 影响半径 (米)
 * @param t - 时间阈值 (秒)
 * @param v - 相对空速向量
 * @returns 受影响区域的面积占比 (0-1)
 */
export function affectedAreaFraction(r: number, t: number, v: Vec2): number {
    if (r <= 0) return 0;
    if (t <= 0) return 1;

    const vmag = Math.hypot(v.x, v.y);
    if (vmag === 0) return 1;

    const L = t * vmag;
    if (L >= 2 * r) return 0;

    const yMax = Math.sqrt(r * r - (L * L) / 4);
    const area = yMax * L + 2 * r * r * Math.asin(yMax / r);
    const diskArea = Math.PI * r * r;
    
    // Return a protected value between 0 and 1
    return Math.max(0, Math.min(1, area / diskArea));
}

/**
 * 检查轨迹点是否有效用于模拟
 * @param track - 轨迹点
 * @returns 是否有效
 */
function isValidTrackForSimulation(track: PlaneTrack): boolean {
    return track.speed > 0 && 
           track.ws !== undefined && 
           track.wd !== undefined;
}

/**
 * 运行模拟计算
 * @param tracks - 飞机轨迹数据数组
 * @param radius - 影响半径 (米)
 * @param threshold - 时间阈值 (秒)
 * @returns 模拟图层数据数组
 */
export function runSimulation(
    tracks: PlaneTrack[],
    radius: number,
    threshold: number
): SimulationLayer[] {
    const layers: SimulationLayer[] = [];
    
    for (const track of tracks) {
        // 只处理有效的轨迹点（速度大于0且风场数据有效）
        if (isValidTrackForSimulation(track)) {
            // 计算空速
            const airspeed = computeAirspeed(track.speed, track.heading, track.ws, track.wd);
            
            // 计算受影响面积占比
            const frac = affectedAreaFraction(radius, threshold, airspeed);
            
            // 根据面积占比选择颜色
            // 将 frac (0-1) 映射到颜色索引
            const percentage = frac * 100;
            const colorIndex = Math.min(
                Math.floor(percentage / 10),
                colorMap.length - 1
            );
            const color = colorMap[colorIndex];
            
            // 风向转换：风的来源方向 -> 风的去向
            const windToDirection = (track.wd + 180) % 360;
            const windVector = toVector(track.ws, windToDirection);
            
            // 创建模拟图层数据
            layers.push({
                timestamp: track.timestamp,
                lat: track.lat,
                lon: track.lon,
                radius: radius,
                color: { ...color },
                windVector: windVector
            });
        }
    }
    
    return layers;
}
