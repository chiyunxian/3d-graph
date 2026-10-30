# 方程空间 · 3D 方程构图器

在线访问：**https://chiyunxian.github.io/3d-graph/**

输入三个方程，在 x、y、z 三维空间中绘制曲面和它们围出的空间图形。

## 快速示例

打开页面时方程输入框为空，输入后点击“绘制图形”即可。可以点“圆柱”或“锥面”填入一组示例：

```
x^2 + y^2 = 4
z = 0
z = 4
```

三条方程围出一个圆柱体：侧面是圆柱，上下底面是 z=0 和 z=4 两个平面。

## 支持

- 显式曲面：`z = f(x,y)`，例如 `z = x^2 + y^2`
- 隐式曲面：`F(x,y,z) = 0`，例如 `x^2 + y^2 + z^2 = 9`
- 三个方程输入框，初始为空，由用户自己输入
- 可只填 1—3 个方程，留空的行会被跳过
- 坐标范围、采样精度（36 / 48 / 64）
- 网格、坐标轴、交线显示开关
- 自动旋转、拖拽旋转、滚轮缩放、右键平移
- 曲面交线以金色点标出
- 圆柱 / 锥面示例一键切换
- 桌面与手机响应式布局

## 数学表达式

支持 `+ - * / ^`、括号、`x y z`、`pi`、`e`，以及：

`sin` `cos` `tan` `asin` `acos` `atan` `sinh` `cosh` `tanh`
`sqrt` `abs` `exp` `ln` `log` `log10` `floor` `ceil` `round` `sign` `pow` `min` `max`

示例：

- `z = sin(x) * cos(y)`
- `x^2 + y^2 = 4`
- `z = sqrt(x^2 + y^2)`
- `x + y + z = 2`

隐式曲面使用点云绘制，交线使用两两方程的近似交点。

## 文件

- `index.html`：页面
- `styles.css`：界面样式
- `app.js`：表达式解析、三维场景、曲面采样与交互
- `three.min.js` / `OrbitControls.js`：Three.js 与轨道控制器
- `favicon.svg`

本地打开 `index.html` 即可，也可以运行：

```bash
python -m http.server 8080
```
