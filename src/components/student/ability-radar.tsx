import type { RadarDimension } from "@/lib/services/grading";

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_RADIUS = 100;
const LABEL_RADIUS = 124;
const LEVELS = [25, 50, 75, 100] as const;

interface AbilityRadarProps {
  dimensions: RadarDimension[];
  className?: string;
}

function polarPoint(angle: number, radius: number): { x: number; y: number } {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

/**
 * 五维能力雷达图：按可视化标准绘制刻度环、刻度值、轴线、数据多边形、顶点与数据标注。
 * 维度数量由 dimensions 长度动态决定，得分按 score/max 归一化到半径。
 */
export default function AbilityRadar({ dimensions, className = "" }: AbilityRadarProps) {
  const count = dimensions.length;
  const angles = dimensions.map((_, index) => (index * 2 * Math.PI) / count - Math.PI / 2);

  const ringPoints = (level: number) =>
    angles
      .map((angle) => {
        const { x, y } = polarPoint(angle, (MAX_RADIUS * level) / 100);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const valuePoints = angles
    .map((angle, index) => {
      const { score, max } = dimensions[index];
      const radius = (MAX_RADIUS * Math.max(0, Math.min(score, max))) / Math.max(max, 1);
      const { x, y } = polarPoint(angle, radius);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  function textAnchorFor(angle: number): "start" | "middle" | "end" {
    const cos = Math.cos(angle);
    if (cos > 0.3) return "start";
    if (cos < -0.3) return "end";
    return "middle";
  }

  const axisVertexes = angles.map((angle) => polarPoint(angle, MAX_RADIUS));

  return (
    <div className={`flex justify-center ${className}`}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[360px] h-auto"
        role="img"
        aria-label="五维能力雷达图"
      >
        {/* 刻度环与轴线 */}
        <g fill="none" stroke="currentColor" className="text-border" strokeWidth="1">
          {LEVELS.map((level) => (
            <polygon key={level} points={ringPoints(level)} />
          ))}
          {axisVertexes.map((vertex, index) => (
            <line key={index} x1={CENTER} y1={CENTER} x2={vertex.x} y2={vertex.y} />
          ))}
        </g>

        {/* 刻度值标注（沿顶部轴线） */}
        <g className="text-muted-foreground" fill="currentColor" fontSize="8.5" fontWeight="600">
          <text x={CENTER + 5} y={CENTER + 3} textAnchor="start">0</text>
          {LEVELS.map((level) => {
            const { y } = polarPoint(-Math.PI / 2, (MAX_RADIUS * level) / 100);
            return (
              <text key={level} x={CENTER + 5} y={y + 2.5} textAnchor="start">
                {level}
              </text>
            );
          })}
        </g>

        {/* 数据多边形与顶点 */}
        <g className="text-primary">
          <polygon
            points={valuePoints}
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="2"
          />
          {dimensions.map((dimension, index) => {
            const radius = (MAX_RADIUS * Math.max(0, Math.min(dimension.score, dimension.max))) / Math.max(dimension.max, 1);
            const { x, y } = polarPoint(angles[index], radius);
            return <circle key={dimension.key} cx={x} cy={y} r="3.5" fill="currentColor" />;
          })}
        </g>

        {/* 维度标签与得分标注 */}
        <g className="text-foreground" fill="currentColor" fontWeight="700">
          {dimensions.map((dimension, index) => {
            const angle = angles[index];
            const anchor = textAnchorFor(angle);
            const { x, y } = polarPoint(angle, LABEL_RADIUS);
            const verticalShift = Math.sin(angle) > 0.5 ? 12 : Math.sin(angle) < -0.5 ? -4 : 3;
            return (
              <text key={dimension.key} x={x} y={y + verticalShift} textAnchor={anchor} fontSize="11">
                <tspan x={x}>{dimension.label}</tspan>
                <tspan x={x} dy="12" fontSize="9" fontWeight="600" className="text-muted-foreground">
                  {dimension.score}/{dimension.max}
                </tspan>
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
