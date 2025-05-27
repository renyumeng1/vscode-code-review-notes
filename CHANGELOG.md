# Change Log

All notable changes to the "code-review-notes" extension will be documented in this file.

## [0.1.4] - 2025-05-27

### 🛠️ Bug Fixes & Improvements

### Enhanced
- **🔔 通知系统优化**: 扩展通知级别控制系统，减少同步操作和其他非关键操作的通知干扰
  - 同步通知现在遵循用户配置的通知级别设置
  - 优化Git同步通知，遵循通知级别控制
  - 将通知等级系统集成到所有模块中

### Fixed
- 修复了Git同步服务中的通知级别控制问题
- 优化各种非必要通知的显示逻辑
- 统一通知系统接口，确保一致的用户体验

## [0.1.3] - 2025-05-27

### 🛠️ 持续优化改进

### Fixed
- 修复了其他已知问题和性能优化

## [0.1.2] - 2025-05-27

### 🛠️ 稳定性增强

### Fixed
- 修复了首次启动时可能出现的UI闪烁问题
- 修复了选择跟踪的边缘情况

## [0.1.1] - 2025-05-27

### 🛠️ Bug Fixes & Improvements

### Added
- **🔔 通知级别控制**: 新增通知级别配置选项，用户可根据需要控制通知显示频率
  - `codeReviewNotes.notificationLevel`: 控制通知显示级别（none/minimal/verbose）

### Fixed
- 修复AddComment UI在无文本选择时错误显示的问题
- 修复通知配置密钥错误（从'codeReview'更正为'codeReviewNotes'）
- 优化通知系统，减少不必要的通知频率
- 在多个模块中实现一致的通知级别控制

## [0.1.0] - 2025-05-26

### 🚀 Major Feature Release: Flexible Synchronization System

### Added
- **🔄 Flexible Sync System**: Complete rewrite of synchronization architecture using strategy pattern
  - **Local Sync Strategy**: Fast, reliable local-only storage (default)
  - **Git Sync Strategy**: Team collaboration through Git repository synchronization  
  - **Server Sync Strategy**: Placeholder for future real-time server synchronization
- **🎮 Sync Method Picker**: Interactive UI to choose and switch between sync methods
- **⚙️ Advanced Configuration Options**:
  - `codeReviewNotes.syncMethod`: Choose sync method (local/git/server)
  - `codeReviewNotes.serverUrl`: Server URL for future server sync
  - `codeReviewNotes.serverAuthToken`: Authentication token for server sync
  - `codeReviewNotes.enableRealTimeSync`: Enable real-time synchronization
- **📝 New Commands**:
  - "Choose Sync Method" - Interactive sync method selection
  - "Sync Now" - Manual full synchronization
  - "Get Sync Status" - View current sync status

### Enhanced
- **🏗️ Strategy Pattern Architecture**: Extensible design for easy addition of new sync methods
- **🔧 Unified Sync Manager**: Central coordination of all synchronization strategies
- **🔄 Seamless Strategy Switching**: Change sync methods without data loss
- **📊 Sync Status Monitoring**: Real-time sync status and health indicators
- **🛡️ Backward Compatibility**: All existing Git commands preserved for smooth upgrades

### Technical Improvements
- **Type Safety**: Complete TypeScript type definitions for all sync components
- **Error Handling**: Robust error handling and recovery mechanisms
- **Modular Design**: Clean separation of concerns and extensible interfaces
- **Configuration Management**: Persistent configuration with workspace-level settings

### Future Ready
- **🌐 Server Sync Foundation**: Ready for Overleaf-style real-time collaboration
- **👥 Team Features**: Prepared for user management and real-time presence
- **🔗 Integration Ready**: Extensible for GitHub, Azure DevOps, and other platforms

## [0.0.2] - 2025-05-26

### Added
- **用户特定颜色系统**: 不同用户的评论现在显示不同的颜色，提供更好的视觉区分
- **简化的悬浮提示**: 重新设计悬浮消息，显示清洁的用户ID和讨论信息，移除复杂的HTML样式
- **测试评论命令**: 添加了 `createTestComments` 命令，可以快速创建来自不同用户的示例评论用于演示
- **8种预定义颜色方案**: 系统自动为用户分配橙黄、绿、蓝、红、灰、紫、深橙、青等8种颜色
- **用户颜色持久化**: 用户颜色分配会保存到工作区状态，确保会话间一致性

### Changed
- **高亮系统重构**: 从单一装饰类型改为基于用户的多装饰类型系统
- **悬浮消息优化**: 简化了悬浮提示的显示内容，更加简洁易读
- **装饰管理改进**: 更智能的装饰创建和清理机制

### Features
- 支持最多8个不同用户的同时协作，每人有独特颜色
- 颜色系统与现有的已解决/未解决状态兼容
- 实时颜色分配，新用户自动获得下一个可用颜色

## [0.0.1] - 2025-05-26

### Added
- 初始版本发布
- **添加评论功能**: 选择文本后可以添加评论
- **双侧边栏树视图**: 
  - "Code Review Notes" - 显示当前文件的所有评论
  - "All Comments" - 显示所有文件的评论，按文件分组
- **智能过滤系统**: 支持显示全部/已解决/未解决评论的筛选
- **回复评论**: 支持对评论进行回复，形成讨论串
- **解决/取消解决评论**: 可以标记评论为已解决状态
- **跳转功能**: 点击评论可以跳转到对应代码位置
- **代码高亮显示**: 在编辑器中高亮显示有评论的代码区域
- **悬停提示**: 鼠标悬停显示完整评论详情和快捷操作链接
- **持久化存储**: 评论数据保存在工作区状态中
- **快捷键支持**: Ctrl+Shift+C 快速添加评论
- **右键菜单集成**: 在编辑器右键菜单中添加评论选项
- **配置选项**: 支持设置默认作者名称
- **多文件支持**: 跨文件管理和查看评论

### Features
- 类似 Overleaf 的评论体验
- 支持所有文件类型
- 实时刷新评论列表
- **增强的视觉高亮**: 
  - 未解决评论：温暖橙黄色 + 💬 图标
  - 已解决评论：柔和绿色 + ✅ 图标
- **美观的悬停卡片**: HTML 样式的评论详情显示
- **灵活的高亮控制**: 
  - 全局高亮开关
  - 已解决评论高亮开关
  - 自定义颜色配置
- **响应式配置**: 设置变化时实时更新高亮效果
- 中文界面支持