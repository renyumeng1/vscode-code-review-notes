# Code Review Notes - 发布指南

## 扩展发布准备完成状态

✅ **扩展功能完备** - 所有新功能已实现并测试
✅ **代码编译成功** - TypeScript编译无错误
✅ **扩展包已创建** - `code-review-notes-0.0.1.vsix` 已生成
✅ **文档完善** - README.md和技术文档完整
✅ **LICENSE文件** - MIT许可证已创建
✅ **package.json配置** - 发布元数据已添加

## 发布选项

### 选项1: VS Code 扩展市场发布 (推荐)

1. **安装vsce工具**
   ```bash
   npm install -g vsce
   ```

2. **创建发布者账户**
   - 访问 https://marketplace.visualstudio.com/manage
   - 使用Microsoft账户登录
   - 创建新的发布者（建议使用: `yumengproductions`）

3. **登录vsce**
   ```bash
   vsce login yumengproductions
   ```

4. **发布扩展**
   ```bash
   vsce publish
   ```

### 选项2: 本地分享 (推荐用于测试)

扩展包 `code-review-notes-0.0.1.vsix` 已经创建，可以：

1. **本地安装测试**
   ```bash
   code --install-extension code-review-notes-0.0.1.vsix
   ```

2. **分享给团队**
   - 直接分享 `.vsix` 文件
   - 团队成员可以通过VS Code安装

## 需要的额外文件

### 图标文件 (可选但推荐)
- 创建 `icon.png` (128x128像素)
- 建议设计简洁的代码审查相关图标

### GitHub仓库 (如果要公开)
1. 在GitHub创建仓库: `vscode-code-review-notes`
2. 推送代码到仓库
3. 更新package.json中的仓库URL

## 当前配置信息

- **扩展名称**: Code Review Notes
- **发布者**: yumengproductions (需要在marketplace创建)
- **版本**: 0.0.1
- **许可证**: MIT
- **类别**: Other, Notebooks, Debuggers

## 主要功能

1. **多用户协作** - 支持多个审查者同时工作
2. **解决者追踪** - 记录谁解决了评论以及解决时间
3. **自定义用户名** - 允许用户设置个人用户名
4. **颜色编码** - 不同状态的评论使用不同颜色
5. **智能高亮** - 代码中的评论区域高亮显示
6. **全局视图** - 查看所有文件的评论汇总

## 建议的发布流程

1. **测试阶段**: 使用 `.vsix` 文件在团队内部测试
2. **完善阶段**: 根据反馈优化功能和文档
3. **公开发布**: 发布到VS Code市场
4. **维护更新**: 持续改进和bug修复

## 联系信息

如需技术支持或功能建议，请联系开发者。
