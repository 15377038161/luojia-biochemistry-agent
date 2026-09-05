import type { RadarDimension } from "@/lib/services/grading";
export default function AbilityRadar({ dimensions }: { dimensions: RadarDimension[] }) {
  const points = (values: number[]) => values.map((value, i) => {
    const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
    return [160 + Math.cos(angle) * 95 * value / 100, 135 + Math.sin(angle) * 95 * value / 100].join(",");
  }).join(" ");
  return <div className="ability-radar"><svg viewBox="0 0 320 280" role="img" aria-label="五维能力雷达图">
    {[25, 50, 75, 100].map(n => <polygon key={n} points={points(Array(5).fill(n))} fill="none" stroke="#ceded4" />)}
    <polygon points={points(dimensions.map(d => d.score))} fill="#4a927d33" stroke="#337761" strokeWidth="2" />
    {dimensions.map((d, i) => { const a = i * Math.PI * 2 / 5 - Math.PI / 2; return <text key={d.key} x={160 + Math.cos(a) * 128} y={135 + Math.sin(a) * 120} textAnchor="middle" fontSize="10" fill="#284d43">{d.label}</text>; })}
  </svg><dl>{dimensions.map(d => <div key={d.key}><dt>{d.label}</dt><dd>{d.score}<small> / 100</small></dd></div>)}</dl></div>;
}
