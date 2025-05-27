# 🔍 Code Review Notes - VS Code Extension

一个强大的VS Code代码评论扩展，提供类似Overleaf的评论体验，支持多用户协作、灵活同步系统、用户特定颜色编码和完整的评论生命周期管理。

## ✨ 核心特性

### 🚀 **NEW** 通知系统全面优化 v0.1.4

- 🔄 **同步通知优化**: 减少git同步时的不必要通知干扰
- 🎛️ **全模块集成**: 通知级别控制系统扩展至所有模块
- ⚙️ **统一接口**: 统一的通知系统确保一致用户体验

### 🔔 通知级别控制 v0.1.1-0.1.4

- 🔔 **通知级别设置**: 通过配置控制通知显示频率
- 🧹 **减少不必要通知**: 优化同步操作的通知体验
- 🛠️ **修复UI问题**: 解决了AddComment UI无选择时显示的问题

### 🔄 灵活同步系统 v0.1.0

- 🔄 **多种同步策略**: 本地存储 / Git同步 / 服务器同步（即将推出）
- 🎮 **交互式选择器**: 一键切换同步方法，无缝数据迁移
- ⚙️ **策略模式架构**: 可扩展设计，轻松添加新的同步方式
- 🛡️ **向后兼容**: 保留所有现有功能，平滑升级体验
- 📊 **实时状态监控**: 同步状态和健康指标显示

#### 同步方法详解

| 同步方法               | 适用场景 | 特点                             |
| ---------------------- | -------- | -------------------------------- |
| 🏠**本地存储**   | 个人使用 | 快速、可靠、无需外部依赖         |
| 🔗**Git同步**    | 团队协作 | 通过Git仓库同步，支持分支和合并  |
| 🌐**服务器同步** | 实时协作 | 类似Overleaf，实时更新（开发中） |

### 🎨 多用户协作

- 🌈 **用户特定颜色**: 8种预设颜色，自动为不同用户分配
- 💬 **评论线程**: 支持评论回复，构建完整讨论
- 👤 **解决者信息追踪**: 自动记录谁解决了评论及解决时间
- 👥 **多用户场景**: 完整支持团队代码评审工作流

### 🖥️ 界面体验

- 🌳 **双重树视图**: 当前文件 + 全工作区评论视图
- ✅ **状态管理**: 已解决/未解决评论视觉区分
- 🎯 **悬停提示**: 完整评论详情和解决者信息
- 🔍 **智能过滤**: 按状态过滤（全部/已解决/未解决）

### ⚡ 便捷操作

- ⌨️ **快捷键**: `Ctrl+Shift+C` 快速添加评论
- 🖱️ **上下文菜单**: 右键快速操作
- 📋 **命令面板**: 完整命令集成

## 🚀 快速开始

### 1. 选择同步方法

```
Ctrl+Shift+P → "Choose Sync Method" → 选择适合的同步策略
```

- **本地存储**: 默认选项，适合个人使用
- **Git同步**: 适合团队协作，需要Git仓库
- **服务器同步**: 即将推出的实时协作功能

### 2. 设置用户名

```
Ctrl+Shift+P → "Set Username" → 输入您的用户名
```

### 3. 添加评论

```
选择代码文本 → 右键 → "Add Comment" 或按 Ctrl+Shift+C
```

### 4. 体验同步功能

```
Ctrl+Shift+P → "Sync Now" → 立即同步评论
Ctrl+Shift+P → "Get Sync Status" → 查看同步状态
```

## 📋 功能详解

### 同步系统操作

| 操作                   | 命令                     | 说明                       |
| ---------------------- | ------------------------ | -------------------------- |
| **选择同步方法** | "Choose Sync Method"     | 交互式选择器，支持实时切换 |
| **立即同步**     | "Sync Now"               | 手动触发完整同步           |
| **查看状态**     | "Get Sync Status"        | 显示当前同步方法和状态     |
| **Git同步**      | "Sync Comments to Git"   | 向后兼容的Git同步命令      |
| **Git加载**      | "Load Comments from Git" | 从Git仓库加载评论          |
| **自动同步**     | "Enable Auto Sync"       | 启用Git自动同步            |

### 评论操作

| 操作               | 方法                               | 说明                 |
| ------------------ | ---------------------------------- | -------------------- |
| **添加评论** | 选择文本 → 右键 /`Ctrl+Shift+C` | 使用当前设置的用户名 |
| **回复评论** | 树视图右键 → "Reply to Comment"   | 形成讨论线程         |
| **解决评论** | 树视图右键 → "Resolve Comment"    | 记录解决者和时间     |
| **重开评论** | 树视图右键 → "Unresolve Comment"  | 清除解决状态         |
| **查看详情** | 鼠标悬停代码高亮区域               | 显示完整信息         |
| **跳转位置** | 点击树视图评论条目                 | 直接导航到代码       |

### 解决者信息显示

#### 悬停提示格式

```
✅ 已解决

作者: Alice
时间: 2024-12-26 14:30:25
解决者: Bob (2024-12-26 15:45:10)

评论内容...
```

#### 树视图格式

```
📁 src/example.js
  ✅ 需要添加错误处理 (已解决 by Bob)
  💬 建议优化性能
```

### 视觉反馈系统

#### 评论高亮

- **未解决评论**: 实线彩色边框，用户专属颜色
- **已解决评论**: 虚线半透明边框，淡化显示
- **用户颜色**: 自动分配8种颜色中的一种

#### 用户颜色方案

1. 🟠 橙黄色 `#ff9500`  2. 🟢 绿色 `#30d158`
2. 🔵 蓝色 `#007aff`    4. 🔴 红色 `#ff3b30`
3. ⚫ 灰色 `#8e8e93`    6. 🟣 紫色 `#af52de`
4. 🟤 深橙色 `#ff6b35`  8. 🔷 青色 `#32d2c9`

## 🎯 命令列表

| 命令                           | 功能                   | 快捷键           |
| ------------------------------ | ---------------------- | ---------------- |
| `Set Username`               | 设置当前用户名         | -                |
| `Add Comment`                | 添加新评论             | `Ctrl+Shift+C` |
| `Reply to Comment`           | 回复评论               | -                |
| `Resolve Comment`            | 解决评论（记录解决者） | -                |
| `Unresolve Comment`          | 重新打开评论           | -                |
| `Refresh Comments`           | 刷新评论视图           | -                |
| `Create Test Comments`       | 创建多用户演示评论     | -                |
| `Toggle Comment Highlights`  | 切换评论高亮           | -                |
| `Toggle Resolved Highlights` | 切换已解决评论高亮     | -                |

## ⚙️ 配置选项

在VS Code设置中可配置：

```json
{
  "codeReviewNotes.defaultAuthor": "YourName",
  "codeReviewNotes.syncMethod": "local",
  "codeReviewNotes.serverUrl": "http://localhost:3000",
  "codeReviewNotes.serverAuthToken": "your-token",
  "codeReviewNotes.enableRealTimeSync": false,
  "codeReviewNotes.showResolvedCommentHighlights": true,
  "codeReviewNotes.unresolvedCommentColor": "#ff9500",
  "codeReviewNotes.resolvedCommentColor": "#30d158"
}
```

### 新增配置项说明

| 配置项                 | 类型    | 默认值  | 说明                         |
| ---------------------- | ------- | ------- | ---------------------------- |
| `syncMethod`         | string  | "local" | 同步方法: local/git/server   |
| `serverUrl`          | string  | ""      | 服务器同步URL地址            |
| `serverAuthToken`    | string  | ""      | 服务器同步认证令牌           |
| `enableRealTimeSync` | boolean | false   | 启用实时同步（需服务器支持） |

## 🏗️ 技术架构

### 策略模式设计

```typescript
// 抽象同步策略
abstract class SyncStrategy {
    abstract getSyncMethod(): SyncMethod;
    abstract isSupported(): Promise<boolean>;
    abstract saveComments(comments: Comment[]): Promise<SyncResult>;
    abstract loadComments(): Promise<Comment[]>;
    abstract performFullSync(localComments: Comment[]): Promise<Comment[]>;
}

// 具体策略实现
class LocalSyncStrategy extends SyncStrategy { ... }
class GitSyncStrategy extends SyncStrategy { ... }
class ServerSyncStrategy extends SyncStrategy { ... }

// 统一管理器
class SyncManager {
    async setSyncMethod(method: SyncMethod): Promise<void>
    async showSyncMethodPicker(): Promise<void>
    getCurrentSyncMethod(): SyncMethod
}
```

### 文件结构

```
src/
├── syncStrategy.ts          # 抽象基类和接口
├── localSyncStrategy.ts     # 本地同步实现
├── gitSyncService.ts        # Git同步实现
├── serverSyncStrategy.ts    # 服务器同步占位
├── syncManager.ts           # 同步管理器
├── commentService.ts        # 评论服务（已重构）
└── extension.ts             # 扩展入口（新增命令）
```

## 🔧 开发调试

### 环境要求

- VS Code 1.100.0+
- Node.js 16+
- TypeScript 5.0+

### 本地开发

```bash
# 安装依赖
npm install

# 编译TypeScript
npm run compile

# 启动监听模式
npm run watch

# 运行扩展
按 F5 启动Extension Development Host
```

### 扩展打包

```bash
# 打包为VSIX文件
npx @vscode/vsce package
```

## 📁 数据存储

### 存储位置

- **评论数据**: 工作区状态存储
- **用户设置**: VS Code工作区配置
- **用户颜色**: 扩展上下文存储

### 评论数据结构

```typescript
interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  range: CommentRange;
  documentUri: string;
  resolved: boolean;
  resolvedBy?: string;    // 🆕 解决者用户名
  resolvedAt?: number;    // 🆕 解决时间戳
  replies: Reply[];
}
```

## 🧪 测试场景

### 基础功能测试

1. ✅ 设置用户名并验证保存
2. ✅ 添加评论使用正确用户名
3. ✅ 解决评论并记录解决者信息
4. ✅ 验证悬停提示显示解决者详情
5. ✅ 检查树视图解决者信息格式

### 多用户协作测试

1. ✅ 运行"Create Test Comments"命令
2. ✅ 验证不同用户显示不同颜色
3. ✅ 测试解决其他用户的评论
4. ✅ 检查解决者信息的正确显示

### 边界条件测试

1. ✅ 空用户名处理
2. ✅ 特殊字符用户名
3. ✅ 长用户名显示
4. ✅ 向后兼容性（旧评论无解决者信息）

## 🐛 故障排除

### 常见问题

**Q: 如何设置用户名？**
A: 按 `Ctrl+Shift+P`，输入"Set Username"，在弹出框中输入您的用户名

**Q: 解决者信息不显示？**
A: 确保评论是在设置用户名后解决的，旧评论可能没有解决者信息

**Q: 扩展没有激活？**
A: 检查VS Code版本（需要1.100.0+），在Extension Development Host中按F5运行

**Q: 评论颜色冲突？**
A: 可在设置中自定义颜色，或切换VS Code主题

## 📊 版本历史

### v0.1.0 (当前版本) - 2025年5月26日

🚀 **重大功能发布: 灵活同步系统**

- ✅ 策略模式架构重写
- ✅ 本地/Git/服务器三种同步策略
- ✅ 交互式同步方法选择器
- ✅ 向后兼容所有现有功能
- ✅ 新增6个同步相关命令
- ✅ 完整的配置选项支持

### v0.0.2 - 2025年5月26日

- ✅ 用户特定颜色系统
- ✅ 解决者信息追踪
- ✅ 悬浮提示优化
- ✅ 测试评论命令

### v0.0.1 - 2025年5月26日

- ✅ 基础评论功能
- ✅ 双树视图界面
- ✅ 评论线程和回复
- ✅ 状态管理和高亮

## 🔮 路线图

### 即将推出 (v0.2.0)

- [ ] 🌐 **服务器同步实现**: WebSocket实时通信
- [ ] 👥 **团队功能**: 用户管理和在线状态
- [ ] 🔔 **通知系统**: 评论更新提醒

## 🐛 故障排除

### 同步相关问题

**Q: 如何切换同步方法？**
A: `Ctrl+Shift+P` → "Choose Sync Method" → 选择新的同步策略

**Q: Git同步失败？**
A: 确保当前工作区是Git仓库，并且有适当的读写权限

**Q: 服务器同步不可用？**
A: 服务器同步功能当前为占位实现，将在v0.2.0版本中完整实现

**Q: 数据会丢失吗？**
A: 切换同步方法时会自动迁移数据，建议切换前手动同步一次

### 通用问题

**Q: 扩展没有激活？**
A: 检查VS Code版本（需要1.100.0+），重新安装扩展

**Q: 命令找不到？**
A: 重新加载窗口 (`Ctrl+Shift+P` → "Reload Window")

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 发起Pull Request

---

**开发者**: GitHub Copilot
**项目状态**: ✅ 生产就绪，同步系统架构完整
**最后更新**: 2025年5月26日

**🚀 立即开始**:

1. 按 `F5` 启动扩展开发环境
2. `Ctrl+Shift+P` → "Choose Sync Method" 选择同步策略
3. 开始体验强大的协作功能！
