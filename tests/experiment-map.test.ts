import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const component = read('src/components/student/experiment-map.tsx');
const uiCss = read('src/app/ui-system.css');
const globalsCss = read('src/app/globals.css');

test('移动端步骤卡片单列全宽，无左右锯齿挤压', () => {
  assert.match(
    uiCss,
    /\.lab-map-page \.mobile-route-card,\.lab-map-page \.mobile-step-list button:nth-child\(even\),\.lab-map-page \.mobile-step-list button:nth-child\(odd\) \{ width:100%!important; min-height:82px!important; align-self:stretch!important; transform:none!important; \}/,
  );
});

test('移动端标题支持换行，不被截断', () => {
  assert.match(globalsCss, /\.mobile-route-copy \{ flex:1;min-width:0; \}/);
  assert.match(globalsCss, /white-space:normal;overflow-wrap:anywhere/);
});

test('移动端触控目标不低于 44px', () => {
  assert.match(uiCss, /min-height:82px!important/);
  assert.match(uiCss, /\.student-topbar-back,\.student-topbar-actions button,\.student-topbar-teacher-switch \{ min-height:44px/);
});

test('无横向页面溢出', () => {
  assert.match(uiCss, /html,body \{ overflow-x:hidden;/);
});

test('装饰路线层与标签层不拦截点击', () => {
  assert.match(uiCss, /\.mobile-route-line \{ [^}]*pointer-events:none;/);
  assert.match(uiCss, /\.island-map-label \{ [^}]*pointer-events:none;/);
});

test('未开始步骤热区有可见描边，非透明热区', () => {
  assert.match(uiCss, /\.island-map-hotspot-open \.island-map-focus \{ border-color:rgba\(0,37,84,\.22\)/);
});

test('触屏设备（无 hover）标签常显，可辨步骤名', () => {
  assert.match(uiCss, /@media \(hover:none\) \{ \.island-map-hotspot \.island-map-label \{ [^}]*opacity:1; \}/);
});

test('prefers-reduced-motion 覆盖群岛地图动画与过渡', () => {
  assert.match(uiCss, /island-map-hotspot-cur \.island-map-focus \{ animation:none!important; \}/);
  assert.match(uiCss, /\.island-map-focus,\.island-map-label \{ transition:none!important; \}/);
});

test('步骤热区为真实按钮，点击直接调用 onOpenStep 跳转路由', () => {
  assert.match(component, /type="button"/);
  assert.match(component, /onClick=\{\(\) => handleNode\(stepId\)\}/);
  assert.match(component, /function handleNode\(stepId: number\) \{\s*onOpenStep\(stepId\);/);
});

test('不引入 lock 状态，步骤无 Gate 拦截直接跳转', () => {
  assert.match(component, /type NodeState = 'done' \| 'cur' \| 'revise' \| 'open';/);
  assert.doesNotMatch(component, /'lock'/);
});

test('废弃 map-node / production-route / map-current-ring / mobile-route-lock 选择器已清理', () => {
  assert.doesNotMatch(uiCss, /\.map-node \{/);
  assert.doesNotMatch(uiCss, /\.map-node-status/);
  assert.doesNotMatch(uiCss, /\.map-current-ring/);
  assert.doesNotMatch(uiCss, /\.mobile-route-lock/);
  assert.doesNotMatch(uiCss, /\.production-route-flow/);
});
