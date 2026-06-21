# 人脉方舟 Network Ark

> 一款智能个人关系管理与可视化图谱平台，帮助你管理人际关系、构建家族树、记录互动待办，让每一段关系都被妥善守护。

***

## 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [数据模型](#数据模型)
- [快速开始](#快速开始)
- [功能详解](#功能详解)
- [关键技术实现](#关键技术实现)
- [数据导入导出](#数据导入导出)
- [隐私与存储](#隐私与存储)
- [移动端 APK 打包](#移动端-apk-打包)
- [部署到 GitHub Pages](#部署到-github-pages)

***

## 项目简介

**人脉方舟**是一款面向个人的关系管理应用，采用安卓手机竖屏模式设计（最大宽度 480px），以本地优先（Local-First）理念构建，所有数据存储在浏览器 IndexedDB 中，无需后端服务器，无需注册登录，开箱即用。

应用同时支持三种形态：

- **Web 应用**：浏览器直接访问，PWA 离线可用
- **Android APK**：通过 Capacitor 封装为原生应用
- **本地部署**：克隆源码本地运行

包含五大核心模块：

| 模块  | 说明                                     |
| --- | -------------------------------------- |
| 联系人 | 人脉卡片管理，支持自定义分组、首字母索引、头像上传、vCard/CSV 导入 |
| 关系图 | 力导向图谱可视化，支持搜索高亮、分组筛选、多视图切换             |
| 家族树 | 心理谱系风格家谱图，按辈分分层布局，支持配偶/父母/子女关系         |
| 待办  | 互动记录与待办事项，支持时间选择器、生日提醒、互动统计            |
| 我的  | 数据统计、关系健康度分析、数据管理                      |

***

## 核心功能

### 1. 联系人管理

- **自定义分组**：纯自定义分组体系，无固定分组限制，按需创建
- **"我"置顶**：用户自己的名片始终置顶显示，金色高亮标识
- **首字母快速索引**：基于 `pinyin-pro` 库实现中文拼音首字母排序，右侧字母索引支持长按拖动快速定位，拖动时屏幕中央显示超大字母提示
- **性别筛选**：支持按男/女/未知筛选
- **搜索**：支持按姓名、电话、标签搜索
- **完整字段**：姓名、电话、电子邮箱、微信号、职业、所在单位、家庭住址、性别、生日、标签、备注、头像
- **头像上传**：原生 Canvas API 压缩（400×400，JPEG 70%），自动处理透明背景
- **快捷拨号/短信/微信/邮件**：联系人详情页一键跳转对应 App
  - 电话：`tel:` 协议跳转系统拨号
  - 短信：`sms:` 协议跳转系统短信
  - 微信：复制微信号到剪贴板 + `weixin:` 协议唤起微信
  - 邮件：`mailto:` 协议跳转邮件客户端
- **批量操作**：联系人支持批量模式
  - 批量修改分组
  - 批量打标签（添加/移除）
  - 批量删除
- **照片墙**：每个联系人详情页可上传和管理照片
  - 支持多选上传
  - 自动压缩存储
  - 全屏查看
  - 为照片添加备注
- **联系人导入**：弹窗选择导入方式
  - 方式一：vCard 文件导入（`.vcf` / `.vcard`），支持解析 FN、N、TEL、EMAIL、ADR、BDAY、NOTE、TITLE、ORG、X-GENDER、X-WECHAT、X-GROUP 等字段
  - 方式二：CSV 格式粘贴导入，支持中英文表头
  - 导入后自动与"我"建立关系连线

### 2. 关系图谱

- **四种视图**：网络图（力导向）、树形图（环形）、环形图（力导向紧凑）、直线图（智能排序）
- **直线布局**：智能排序不可拖拽，整洁美观
- **"我"为中心**：用户自己固定在图谱中心，金色高亮，更大节点
- **性别形状**：男性=方形，女性=圆形，未知=圆形
- **头像节点**：有头像的联系人用图片作为节点符号
- **关系连线**：线上文字显示分组名或自定义关系名
- **关系强度可视化**：关系图中的连线粗细和颜色深浅反映互动频率（基于互动次数），可开关
- **关系路径分析（六度分隔）**：在关系图中选择两个联系人，通过 BFS 算法查找他们在人脉网络中的最短关系路径
- **导出图谱图片**：关系图支持导出为 PNG 图片（Web 端下载，移动端通过系统分享）
- **搜索高亮**：输入姓名后显示候选下拉列表，点击后该节点及关联节点高亮，其余节点半透明
- **分组筛选**：点击漏斗按钮弹出分组筛选面板，可自由显示/隐藏特定分组；底部图例也可点击快速切换
- **添加关系**：支持为"我"之外的任意两个联系人添加自定义关系
- **关系管理**：查看和删除"我"之外成员之间的关系
- **节点交互**：悬停节点显示名称气泡（含"详情"链接），点击链接弹出联系人详情

### 3. 家族树

- **心理谱系风格**：男性=方形（蓝色），女性=圆形（粉色），"我"=金色高亮
- **辈分分层**：祖辈/父辈/同辈/子辈/孙辈五层，层间距 140px，垂直布局
- **智能排序算法**：三步排序避免连线交叉
  1. 初始布局：配偶相邻放置
  2. 向上调整：按子女平均 X 坐标排序父辈
  3. 向下调整：按父母平均 X 坐标排序子辈
- **智能子女查找**：先查找夫妻共同子女，再查找单亲子女，基于最短路径
- **配偶关系**：
  - 已婚：粉色虚线 + "婚"字标注
  - 未婚有子女：灰色实线连接
  - 配偶信息双向同步（编辑 A 的配偶自动更新 B）
- **从联系人添加**：可直接从"家人"分组的联系人中选择添加，自动同步头像
- **头像同步**：
  - 家族成员头像与关联联系人头像保持同步
  - "我"的家族成员头像与联系人中的"我"自动同步
  - 每次加载时自动检测并同步，持久化到数据库
- **父母多选**：点击式多选列表（适配移动端，非 Ctrl+click）
- **节点不可拖拽**：固定布局，避免误操作
- **导出图谱图片**：家族树支持导出为 PNG 图片（Web 端下载，移动端通过系统分享）
- **家族树照片墙同步**：家族成员若关联联系人则共享照片墙，未关联则独立照片墙

### 4. 待办与互动

- **三标签页**：待办事项、互动统计、生日提醒
- **待办事项页面**：互动记录支持待办状态管理，可筛选待完成/已完成
- **待办事项**：
  - 互动类型：会面、通话、礼物、消息、拜访、出行、约会、自定义
  - 自定义类型：选择"自定义"后出现输入框
  - 日期 + 时间选择
  - 完成状态标记
  - 按日期分组，未完成在前，同一天按时间排序
- **时间选择器**：自定义底部弹窗，双滚轮（时/分）CSS scroll-snap 实现，蓝色高亮带，无外部依赖
- **互动统计**：按类型统计、按联系人统计
- **生日提醒**：自动计算距离生日天数，按远近排序

### 5. 我的

- **数据统计**：联系人数、互动记录数、家族成员数
- **关系健康度**：基于互动频率和近期联系时间综合评分（0-100）
  - 优秀（≥80）/ 良好（≥60）/ 一般（≥40）/ 需关注（≥20）/ 需维护（<20）
  - SVG 环形进度条可视化
  - 列出最需要关注的 3 段关系
- **规则引擎（智能关系维护建议）**：基于互动数据自动生成关系维护建议
  - 生日提醒
  - 长期未联系提醒
  - 互动良好等正向反馈
- **中英文切换**：支持中文和英文界面切换，所有页面均已国际化
- **深色模式**：支持系统跟随 + 手动切换浅色/深色模式
- **数据管理**：清空所有数据（保留"我"）
- **关于**：应用信息与技术栈

### 6. 新手教程引导

- **首次使用引导**：首次使用提供分步引导教程
- **聚光灯效果**：小型浮层提示，不模糊背景，高亮当前步骤对应的界面元素
- **导航控制**：支持下一步/上一步/跳过

### 7. 进阶能力

#### 7.1 Service Worker 缓存

- **文件**：`public/sw.js`
- **PWA 离线支持**：二次加载极速体验，断网情况下仍可访问已缓存页面
- **分级缓存策略**：
  - HTML 文档：网络优先（Network First），保证获取最新版本
  - 静态资源（JS/CSS/图片/字体）：缓存优先（Cache First），命中后直接返回
  - 其他请求：stale-while-revalidate，先用缓存响应再后台更新
- **仅生产环境注册**：开发环境不注册 Service Worker，避免缓存干扰调试

#### 7.2 虚拟列表

- **文件**：`src/pages/ContactsPage.tsx`
- **自动启用**：当联系人数量超过 100 条时自动切换为虚拟列表渲染
- **可视区域渲染**：仅渲染当前可见区域内的 DOM 节点（含上下 buffer 缓冲区），千条联系人依然流畅滚动
- **字母索引适配**：虚拟模式下，点击或拖动字母索引时通过计算偏移量直接滚动到目标分组，无需遍历 DOM

#### 7.3 Web Worker 子线程计算

- **文件**：`src/workers/graphWorker.ts`、`src/hooks/useGraphWorker.ts`
- **子线程计算**：将 BFS 最短路径查找、直线布局分层计算等耗时任务移至 Worker 子线程执行
- **不阻塞 UI**：大数据量（数百节点）下的图谱计算不再卡顿主线程，保持流畅交互
- **自动降级**：当 Worker 不可用（如某些受限环境）时，自动回退到主线程同步计算，保证功能可用

#### 7.4 关系健康度精细化

- **文件**：`src/utils/helpers.ts`（`calculateHealthScoreDetailed` 函数）
- **六维度评分体系**（总分 100）：
  | 维度    | 权重 | 说明                     |
  | ----- | -- | ---------------------- |
  | 互动频率  | 20 | 基于互动总次数评级              |
  | 近期联系  | 25 | 距上次互动的时间衰减             |
  | 互动多样性 | 15 | 互动类型种类丰富度              |
  | 互动趋势  | 15 | 最近 30 天 vs 前 30 天的频率对比 |
  | 关系稳定性 | 15 | 基于互动时间跨度计算的密度          |
  | 特殊加分  | 10 | 生日互动、纪念互动等加分项          |
- **ProfilePage 维度明细**：以条形图形式展示各维度得分，直观了解关系短板
- **趋势分析**：比较最近 30 天与前 30 天的互动频率，判断关系走向（上升/平稳/下降）
- **稳定性计算**：基于互动时间跨度（首末互动间隔）与互动次数计算密度，跨度长且分布均匀者得分更高

#### 7.5 本地数据加密

- **文件**：`src/utils/crypto.ts`
- **加密算法**：使用 Web Crypto API 的 AES-GCM 256 对称加密
- **加密字段**：phone、email、address、wechat、note、birthday 共 6 个敏感字段
- **密钥派生**：PBKDF2 算法，10 万次迭代增强抗暴力破解能力
- **默认设备密钥**：首次使用时自动生成设备专属密钥并存储，无需用户操作即可加密
- **可选密码保护**：用户可在 ProfilePage 设置独立密码，使用密码派生密钥加密，提升安全性
- **透明加解密**：在 `db.ts` 的 personDB 层自动处理加解密，业务代码无感知
- **ProfilePage 入口**：提供加密设置入口，可查看加密状态、设置/修改密码、重新加密数据

***

## 技术栈

### 核心框架

| 技术                                            | 版本   | 用途         |
| --------------------------------------------- | ---- | ---------- |
| [React](https://react.dev/)                   | 19.2 | UI 框架      |
| [TypeScript](https://www.typescriptlang.org/) | 6.0  | 类型安全       |
| [Vite](https://vite.dev/)                     | 8.0  | 构建工具与开发服务器 |
| [TailwindCSS](https://tailwindcss.com/)       | 4.3  | 原子化 CSS 框架 |

### 可视化与工具库

| 技术                                     | 版本   | 用途                    |
| -------------------------------------- | ---- | --------------------- |
| [ECharts](https://echarts.apache.org/) | 6.1  | 关系图谱与家族树可视化           |
| [pinyin-pro](https://pinyin-pro.cn/)   | 3.28 | 中文拼音转换（首字母排序、多音字、生僻字） |

### 移动端封装

| 技术                                    | 用途                      |
| ------------------------------------- | ----------------------- |
| [Capacitor](https://capacitorjs.com/) | Web 应用封装为原生 Android APK |
| @capacitor/app-launcher               | 唤起第三方应用（微信等）            |
| @capacitor/filesystem                 | 文件系统访问（导出图片）            |
| @capacitor/share                      | 系统分享（导出图谱图片）            |
| @capacitor/splash-screen              | 原生开屏画面                  |

### 数据存储

| 技术        | 用途                        |
| --------- | ------------------------- |
| IndexedDB | 浏览器本地数据库，5 个 Object Store |

### 开发工具

| 技术                         | 用途                  |
| -------------------------- | ------------------- |
| ESLint + typescript-eslint | 代码规范检查              |
| @vitejs/plugin-react       | React Fast Refresh  |
| @tailwindcss/vite          | TailwindCSS Vite 插件 |

***

## 项目结构

```
network-ark/
├── src/
│   ├── components/              # 通用组件
│   │   ├── Avatar.tsx           # 头像组件（首字母/图片）
│   │   ├── BottomNav.tsx        # 底部导航栏（5 个标签）
│   │   ├── ConfirmDialog.tsx    # 确认弹窗（单/双按钮模式）
│   │   ├── EmptyState.tsx       # 空状态占位
│   │   ├── Modal.tsx            # 通用弹窗容器
│   │   ├── PageHeader.tsx       # 页面头部
│   │   ├── PersonDetail.tsx     # 联系人详情（含拨号、星座、年龄、微信唤起）
│   │   ├── PersonForm.tsx       # 联系人表单（含头像上传压缩）
│   │   ├── SplashScreen.tsx     # 开屏画面（3 秒，可跳过）
│   │   └── TourGuide.tsx        # 新手教程（聚光灯式提示）
│   ├── pages/                   # 页面
│   │   ├── ContactsPage.tsx     # 联系人页（索引、筛选、导入、虚拟列表）
│   │   ├── GraphPage.tsx        # 关系图谱页（搜索、筛选、多视图、导出）
│   │   ├── FamilyPage.tsx       # 家族树页（分层布局、智能排序、导出）
│   │   ├── InteractionsPage.tsx # 待办与互动页（时间选择器、统计）
│   │   └── ProfilePage.tsx      # 我的页（统计、健康度、加密设置、数据管理）
│   ├── hooks/
│   │   ├── useChartZoom.ts      # 图谱缩放控制
│   │   └── useGraphWorker.ts    # Web Worker 调用
│   ├── workers/
│   │   └── graphWorker.ts       # 图谱计算子线程
│   ├── types/
│   │   └── index.ts             # TypeScript 类型定义与常量
│   ├── utils/
│   │   ├── crypto.ts            # AES-GCM 加密
│   │   ├── db.ts                # IndexedDB 封装（CRUD + 5 个 Store）
│   │   ├── helpers.ts           # 工具函数（拼音、压缩、健康度、导出图片）
│   │   ├── i18n.tsx             # 国际化（中英文）
│   │   └── sampleData.ts        # 导入解析（CSV/vCard）
│   ├── App.tsx                  # 根组件（标签切换、新手教程）
│   ├── index.css                # 全局样式（竖屏适配、动画）
│   └── main.tsx                 # 入口
├── public/
│   └── sw.js                    # Service Worker（PWA 离线缓存）
├── android/                     # Capacitor Android 项目
│   └── app/src/main/
│       ├── AndroidManifest.xml  # 权限声明、强制竖屏
│       └── res/                 # 原生资源（图标、开屏图）
├── scripts/
│   └── build-apk.ps1            # APK 一键构建脚本
├── capacitor.config.ts          # Capacitor 配置
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

***

## 数据模型

### Person（联系人）

| 字段               | 类型        | 说明                      |
| ---------------- | --------- | ----------------------- |
| id               | string    | 唯一 ID                   |
| name             | string    | 姓名                      |
| phone            | string?   | 电话                      |
| email            | string?   | 电子邮箱                    |
| address          | string?   | 家庭住址                    |
| occupation       | string?   | 职业                      |
| organization     | string?   | 所在单位                    |
| wechat           | string?   | 微信号                     |
| avatar           | string?   | 头像（base64）              |
| group            | GroupType | 分组类型（保留字段）              |
| customGroupLabel | string?   | 自定义分组名                  |
| tags             | string\[] | 标签                      |
| note             | string?   | 备注                      |
| gender           | Gender    | 性别（male/female/unknown） |
| birthday         | string?   | 生日（YYYY-MM-DD）          |
| isMe             | boolean?  | 是否为用户自己                 |
| createdAt        | number    | 创建时间戳                   |
| updatedAt        | number    | 更新时间戳                   |

### Relation（关系）

| 字段     | 类型           | 说明           |
| ------ | ------------ | ------------ |
| id     | string       | 唯一 ID        |
| fromId | string       | 起始人物 ID      |
| toId   | string       | 目标人物 ID      |
| type   | RelationType | 关系类型         |
| note   | string?      | 关系备注（显示在连线上） |

### Interaction（互动/待办）

| 字段         | 类型              | 说明             |
| ---------- | --------------- | -------------- |
| id         | string          | 唯一 ID          |
| personId   | string          | 关联联系人 ID       |
| type       | InteractionType | 互动类型           |
| customType | string?         | 自定义类型名         |
| content    | string          | 内容             |
| date       | string          | 日期（YYYY-MM-DD） |
| time       | string?         | 时间（HH:mm）      |
| completed  | boolean?        | 是否完成           |
| createdAt  | number          | 创建时间戳          |

### FamilyMember（家族成员）

| 字段         | 类型         | 说明                                           |
| ---------- | ---------- | -------------------------------------------- |
| id         | string     | 唯一 ID                                        |
| personId   | string?    | 关联联系人 ID                                     |
| name       | string     | 姓名                                           |
| gender     | Gender     | 性别                                           |
| generation | Generation | 辈分（grandparent/parent/self/child/grandchild） |
| relation   | string     | 与"我"的关系                                      |
| avatar     | string?    | 头像（base64，与联系人同步）                            |
| birthday   | string?    | 生日                                           |
| note       | string?    | 备注                                           |
| parentIds  | string\[]  | 父母 ID 列表                                     |
| spouseId   | string?    | 配偶 ID                                        |
| married    | boolean?   | 是否已婚                                         |
| isMe       | boolean?   | 是否为用户自己                                      |
| createdAt  | number     | 创建时间戳                                        |

### Reminder（提醒）

| 字段        | 类型                                      | 说明       |
| --------- | --------------------------------------- | -------- |
| id        | string                                  | 唯一 ID    |
| personId  | string                                  | 关联联系人 ID |
| type      | 'birthday' \| 'anniversary' \| 'custom' | 提醒类型     |
| title     | string                                  | 标题       |
| date      | string                                  | 日期       |
| createdAt | number                                  | 创建时间戳    |

***

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装与运行

```bash
# 进入项目目录
cd network-ark

# 安装依赖
npm install

# 启动开发服务器（默认 5173 端口）
npm run dev

# 指定端口运行（如 3000）
npm run dev -- --port 3000

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 代码检查
npm run lint
```

### 首次启动

应用首次启动时只会创建"我"：

- 联系人中创建"我"（金色置顶）
- 家族树中创建"我"（同辈层）
- 可在「我的」页面清空所有数据后重新开始

***

## 功能详解

### 首字母索引拖动

联系人列表右侧的字母索引支持：

- **单击**：快速跳转到对应字母分组
- **长按拖动**：手指/鼠标按住后上下拖动，实时切换字母，列表同步滚动
- **超大提示**：拖动时屏幕中央显示当前字母的大号提示气泡
- **实现**：Touch 事件 + Mouse 事件双端支持，`getLetterAtY` 按比例计算对应字母

### 时间选择器

待办事项的时间选择采用自定义底部弹窗：

- **双滚轮**：小时（00-23）+ 分钟（00-59）
- **CSS scroll-snap**：原生滚动吸附，无需第三方库
- **蓝色高亮带**：当前选中行高亮显示
- **底部弹出**：从底部滑入的 Bottom Sheet 风格

### 关系图搜索高亮

- 输入姓名后实时显示候选下拉列表（带头像和分组）
- 点击候选后：
  - 该节点 + 直接关联节点高亮（opacity: 1）
  - 其余节点和连线半透明（opacity: 0.15）
  - 自动弹出该联系人详情页

### 家族树智能布局

三步排序算法避免连线交叉：

```
1. 初始布局：同层成员按添加顺序排列，配偶相邻
2. 向上调整：父辈按其子女的平均 X 坐标重新排序
3. 向下调整：子辈按其父母的平均 X 坐标重新排序
```

子女查找策略：

```
1. 先查找夫妻共同的子女（parentId 匹配夫妻任一方）
2. 再查找单亲子女
3. 基于最短路径关系，而非添加顺序
```

### 头像压缩

使用原生 Canvas API 实现：

- 最大尺寸 400×400，保持比例不放大
- JPEG 质量 70%
- PNG 透明背景自动填充白底
- 完整错误处理：文件类型校验、加载失败、编码失败

### 微信唤起

联系人详情页点击微信按钮的流程：

1. 将联系人微信号复制到剪贴板
2. 显示美观的 Toast 提示"微信号已复制到剪贴板"
3. 通过 Capacitor AppLauncher 打开 `weixin://` 协议唤起微信主界面

> 注：由于微信隐私限制，无法直接跳转到对应好友资料页，用户需在微信中手动搜索粘贴的微信号添加好友。

***

## 关键技术实现

### IndexedDB 数据层

5 个 Object Store，每个 Store 提供统一的 CRUD 接口：

```typescript
personDB.getAll()          // 获取所有联系人
personDB.add(person)       // 新增
personDB.update(person)    // 更新
personDB.remove(id)        // 删除
```

- 单例数据库连接，避免重复打开
- 事务封装为 Promise，支持 async/await
- 索引优化：group、name、personId、date、generation
- 透明加解密：在 personDB 层自动处理敏感字段加解密

### ECharts 图谱配置

- **力导向布局**：repulsion 500，edgeLength 220，gravity 0.08
- **emphasis focus: 'adjacency'**：悬停时高亮相邻节点
- **image:// 协议**：使用 base64 数据 URI 作为节点图片符号
- **roam 配置**：关系图支持缩放和拖拽，家族树仅支持平移
- **tooltip 交互**：悬停显示名称气泡 + "详情"链接，点击链接弹出详情页
- **graphic 组件**：家族树使用隐形连接节点实现折线连线

### 移动端适配

- **竖屏模式**：`max-width: 480px` 居中，两侧阴影模拟手机
- **安全区**：`env(safe-area-inset-*)` 适配刘海屏
- **触摸优化**：`-webkit-tap-highlight-color: transparent`
- **100dvh**：动态视口高度，解决移动端地址栏问题
- **touch-none**：字母索引拖动时禁用默认滚动
- **强制竖屏**：APK 中通过 `android:screenOrientation="portrait"` 锁定竖屏

### vCard 解析器

自实现的 vCard 格式解析，无需外部库：

- 支持 `BEGIN:VCARD` / `END:VCARD` 分块
- 解析属性名 + 参数 + 值（如 `TEL;TYPE=CELL:13800138000`）
- 支持 FN、N、TEL、EMAIL、ADR、BDAY、NOTE、TITLE、ORG、CATEGORIES、X-GENDER、X-WECHAT、X-GROUP
- N 格式自动拼接姓 + 名

### 导出图谱图片

根据运行环境自动选择导出方式：

- **Web 端**：使用 `document.createElement('a')` + `link.click()` 直接下载 PNG
- **移动端 APK**：使用 Capacitor Filesystem 写入临时文件 + Share 插件调起系统分享

***

## 数据导入导出

### 导入方式

#### vCard 文件导入

1. 在手机通讯录或邮箱应用中导出 vCard（.vcf）
2. 联系人页面点击右上角导入按钮
3. 选择「vCard 文件导入」
4. 选择 .vcf 文件，自动解析并导入

**支持的 vCard 字段：**

| vCard 属性                          | 映射字段  |
| --------------------------------- | ----- |
| FN / N                            | 姓名    |
| TEL                               | 电话    |
| EMAIL                             | 电子邮箱  |
| ADR                               | 家庭住址  |
| BDAY                              | 生日    |
| NOTE                              | 备注    |
| TITLE                             | 职业    |
| ORG                               | 所在单位  |
| X-GENDER                          | 性别    |
| X-WECHAT                          | 微信号   |
| X-GROUP / X-CATEGORY / CATEGORIES | 自定义分组 |

#### CSV 格式导入

1. 联系人页面点击右上角导入按钮
2. 选择「CSV 格式导入」
3. 粘贴 CSV 数据（支持中英文表头）

**CSV 表头字段：**

```
姓名, 电话, 分组, 邮箱, 微信, 职业, 单位, 住址, 性别, 标签, 备注, 生日
```

导入后每个联系人自动与"我"建立关系连线，关系备注为分组名。

### 微信联系人导入说明

微信出于隐私保护不提供联系人导出接口，推荐替代方案：

1. **手机通讯录中转**：微信联系人添加到手机通讯录 → 导出 vCard → 导入
2. **截图 OCR**：微信通讯录截图 → 提取文字 → 整理 CSV → 导入
3. **手动录入**：核心联系人手动录入，字段完整质量最高

***

## 隐私与存储

### 本地优先

- 所有数据存储在浏览器 IndexedDB 中
- 无后端服务器，无网络请求（除图片占位符）
- 数据不会离开设备

### 数据安全

- 清空数据需二次确认
- 清空后保留"我"的基本信息，可重新开始

### 本地数据加密（AES-GCM）

- 使用 Web Crypto API 的 AES-GCM 256 对称加密
- 敏感字段（phone、email、address、wechat、note、birthday）自动加密存储
- PBKDF2 密钥派生（10 万次迭代），默认使用设备密钥，可选设置用户密码保护
- 透明加解密：在 `db.ts` 的 personDB 层自动处理，业务代码无感知
- ProfilePage 提供加密设置入口，可查看加密状态、设置/修改密码

### 数据持久化

- IndexedDB 数据在浏览器关闭后依然保留
- 清除浏览器数据会删除所有信息
- 建议定期使用 CSV 导出备份（开发中）

***

## 移动端 APK 打包

本项目支持通过 Capacitor 将 Web 应用封装为 Android APK。

### 环境要求

- JDK 21
- Android SDK（含 Build Tools 34）
- Node.js 18+

### 构建步骤

```powershell
# 1. 构建 Web 应用
npm run build

# 2. 同步到 Android 项目
npx cap sync android

# 3. 构建 APK（Windows PowerShell）
.\scripts\build-apk.ps1

# 或手动构建
cd android
.\gradlew.bat assembleDebug
```

构建完成后，APK 位于：

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Android 权限说明

APK 中声明的权限：

| 权限                      | 用途                     |
| ----------------------- | ---------------------- |
| READ\_CONTACTS          | 读取通讯录（预留）              |
| WRITE\_CONTACTS         | 写入通讯录（预留）              |
| READ\_EXTERNAL\_STORAGE | 读取外部存储（Android 12 及以下） |
| READ\_MEDIA\_IMAGES     | 读取图片（Android 13+）      |
| READ\_MEDIA\_VIDEO      | 读取视频（Android 13+）      |
| QUERY\_ALL\_PACKAGES    | 查询已安装应用（检测微信等）         |

### 原生配置

- **强制竖屏**：`android:screenOrientation="portrait"`
- **开屏画面**：3 秒显示开屏图片，右上角跳过按钮
- **应用图标**：自适应图标（Adaptive Icon），前景图为应用 logo
- **微信唤起**：通过 `<queries>` 声明微信包名 `com.tencent.mm`

***

***

## 版本

v1.1.0

***

> 人脉方舟 — 让每一段关系都被妥善守护。

