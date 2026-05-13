# supertech-PhotoPrinter PRD

## 1. 项目背景

`supertech-program-manager` 当前照片打印链路依赖云服务器生成打印订单，并可由服务端调用蓝阔 API 进行打印。该方式存在几个现实问题：

- 云服务器配置为 4 核 4G，图片合成在高峰期可能成为性能瓶颈。
- 服务端渲染和远程打印链路更长，现场打印可靠性受网络、第三方 API、服务器负载影响。
- 照片打印对清晰度、色彩、最终像素和打印驱动适配要求高，本地高性能笔记本更适合作为现场打印控制端。
- 现场操作需要可视化队列、模板管理、打印机选择、失败重试和日志追踪。

因此新增 `supertech-PhotoPrinter`：运行在本地 Windows 10/11 笔记本上的照片打印客户端，负责从 `supertech-program-manager` 领取打印订单，在本地按最终打印像素渲染图片，并调用 Windows 打印驱动完成打印。

## 2. 产品目标

### 2.1 核心目标

- 将照片合成（渲染）和打印执行从云服务器转移到本地 Windows 客户端。
- 保证生成图片质量和打印质量优先于文件体积、渲染速度和实现捷径。
- 保持与 `supertech-program-manager` 现有照片编辑器、Fabric JSON 模板和打印订单模型兼容。
- 为现场操作人员（打印管理员）提供清晰的打印队列、模板管理和打印机设置界面。


## 3. 总体工作流程

### 3.1 原服务端打印流程

1. 用户打开H5端节目详情页。
2. 用户点选照片。
3. 前端加载预设模板并进入照片编辑器。
4. 用户调整完毕后点击打印。
5. 前端将素材缩放、位置、层级、颜色等 JSON 数据提交服务端。
6. 服务端生成打印订单。
7. 服务端合成图片并调用蓝阔 API 打印。

### 3.2 本地客户端打印流程

1. 用户打开H5端节目详情页。
2. 用户点选照片。
3. 前端加载预设模板并进入照片编辑器。
4. 用户调整完毕后点击打印。
5. 前端将素材缩放、位置、层级、颜色等 JSON 数据提交服务端。
6. 服务端生成打印订单，订单保持 `queued` 状态。
7. `supertech-PhotoPrinter` 通过轮询或 WebSocket 获取新订单。
8. 客户端使用订单中的 Fabric JSON 和模板参数在本地渲染生成 PNG 图像。
9. 客户端回传 png,存入云存储。
10. 客户端调用 Windows 打印驱动打印。
11. 客户端回传 `rendering`、`printing`、`success`、`failed` 等状态。


## 4. 技术选型

### 4.1 客户端技术栈

采用：

- Electron
- Vue 3
- TypeScript
- Fabric.js
- Windows Electron `webContents.print`

选择理由：

- 用户熟悉 Vue 和 Electron，开发效率高。
- 现有照片编辑器和模板数据天然面向前端 JSON/Fabric 生态。
- Electron 可以同时提供现代 Web UI 和 Windows 本地能力。
- Electron 更便于复用前端交互、模板预览和 Fabric 渲染逻辑。
- 相比纯浏览器，Electron 能访问本地打印机、文件系统和日志目录。

### 4.2 渲染方案

采用 Fabric.js 作为图片合成（渲染）引擎。


### 4.3 服务端派发模式

`supertech-program-manager` 通过活动管理的“打印设置”tab控制打印派发路径：

- `print_dispatch_mode=lankuo`：服务端继续调用蓝阔 API。
- `print_dispatch_mode=local_client`：本地客户端领取订单并打印。

客户端认证使用账号密码登录：

-只允许打印管理员角色的用户登录

## 5. 功能需求
分为三步实现功能需求，第一步：将打印管理员登录supertech-program-manager项目后台能够访问的所有页面和所有权限功能复刻到此项目中来。第二步：增加设置功能，用来设置服务端地址、轮询间隔、默认打印机以及打印参数。第三步：添加本地打印的流程逻辑，并增加启动监听/停止监听按钮用来操控此软件的工作状态。

### 5.4 本地打印机读取

打印机读取需要兼容 Electron 和 Windows 系统差异。


读取后合并去重，并尽量识别系统默认打印机。

### 5.5 本地存储

客户端需持久化：

- 服务端地址。
- 轮询间隔。
- 默认打印机。

Electron 环境使用用户数据目录下的 `store.json`。浏览器预览环境可使用 `localStorage` 作为开发调试兜底。

## 6. 服务端接口需求

客户端通过 `supertech-program-manager` 提供的接口工作。

### 6.1 心跳

`POST /api/print-client/heartbeat`

用途：

- 上报客户端在线状态。
- 上报版本号、当前打印机、队列长度等信息。

请求头：

- `X-Print-Client-Token`

### 6.2 领取订单

`POST /api/print-client/jobs/claim`

用途：

- 领取待打印订单。
- 服务端应返回最早的、允许打印的 `queued` 订单。
- 订单被领取后可标记为 `claimed`。

### 6.3 回传状态

`POST /api/print-client/jobs/{record_id}/status`

状态：

- `queued`
- `claimed`
- `rendering`
- `printing`
- `success`
- `failed`

用途：

- 记录客户端处理过程。
- 支持后台查看打印状态。
- 支持失败重试和现场排障。

## 7. 渲染与打印质量原则

图像质量和打印质量是最高优先级。

必须遵守：

- Fabric 画布尺寸从一开始就等于最终打印像素尺寸。
- `multiplier=1`。
- 关闭 Retina/device-pixel-ratio 翻倍。
- 不通过额外倍频放大来“提高清晰度”。
- 不反复缩放、导出、再导入，避免多次采样造成模糊。
- 按素材类型决定平滑策略：
  - 照片类素材可使用高质量平滑。
  - 二维码、边框、文字、硬边图形、像素风素材应避免不必要的平滑。
- 最终生成 PNG 无损母版。
- 本地打印以 PNG 母版为准。
- 文本、二维码、边框等关键元素要避免小数像素导致边缘发虚，必要时进行坐标对齐。
- 模板设计阶段就应明确最终纸张尺寸、像素尺寸和 DPI。

## 8. 可靠性要求

### 8.1 网络可靠性

- 客户端轮询失败不能导致程序崩溃。
- 服务端不可达时应保留配置并提示状态。
- 已领取但未成功打印的订单应能失败回传或后续重试。

### 8.2 打印可靠性

- 打印前必须确认已生成 PNG 母版。
- 打印失败应记录错误信息。
- 失败订单应可重打。
- 打印机列表为空时应提示用户检查 Windows 打印机驱动。

### 8.3 启动可靠性

- Electron 启动不应受 `ELECTRON_RUN_AS_NODE` 等环境变量影响。
- Vite 构建产物在 Electron `file://` 模式下必须使用相对资源路径。

## 9. 安全要求


## 10. 运行与部署

### 10.1 开发命令

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run start
```

### 10.2 本地启动注意事项

- `npm.cmd run start` 应加载构建后的 Electron 页面。
- Electron 本地文件模式要求 Vite `base` 为 `./`。
- 浏览器预览页面不能读取 Windows 本地打印机；打印机列表必须在 Electron 客户端中验证。

## 11. 验收标准

### 11.1 客户端启动

- Windows 10/11 可正常启动 Electron 客户端。
- 默认进入打印队列。




