import * as vscode from 'vscode';
import { CommentService } from './commentService';
import { CommentTreeDataProvider, CommentTreeItem } from './commentTreeProvider';
import { AllCommentsTreeDataProvider, CommentFilter } from './allCommentsTreeProvider';
import { CommentHighlightManager } from './commentHighlightManager';
import { UserColorManagerImpl } from './userColorManager';
import { InlineCommentUIManager } from './inlineCommentUIManager';
import { Comment, CommentRange, UserColorManager, NotificationLevel } from './types';

let commentService: CommentService;
let treeDataProvider: CommentTreeDataProvider;
let allCommentsTreeDataProvider: AllCommentsTreeDataProvider;
let commentHighlightManager: CommentHighlightManager;
let userColorManager: UserColorManager;
let inlineCommentUIManager: InlineCommentUIManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Review Notes extension is now active!');
    
    // 显示激活消息
    showNotification('Code Review Notes 插件已激活！', NotificationLevel.Verbose);

    // 初始化服务
    commentService = new CommentService(context);
    userColorManager = new UserColorManagerImpl(context);
    treeDataProvider = new CommentTreeDataProvider(commentService);
    allCommentsTreeDataProvider = new AllCommentsTreeDataProvider(commentService);
    commentHighlightManager = new CommentHighlightManager(context, commentService, userColorManager);
    inlineCommentUIManager = new InlineCommentUIManager(context, commentService);

    // 设置CommentPositionTracker的静默验证回调
    const positionTracker = (commentService as any).positionTracker;
    if (positionTracker) {
        positionTracker.onSilentValidationNeeded = async (document: vscode.TextDocument) => {
            await commentService.validateAndUpdatePositions(document.uri.toString());
            commentHighlightManager.updateHighlights(vscode.window.activeTextEditor!);
        };
    }

    // 创建树视图
    const treeView = vscode.window.createTreeView('codeReviewNotes', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });

    const allCommentsTreeView = vscode.window.createTreeView('allCodeReviewNotes', {
        treeDataProvider: allCommentsTreeDataProvider,
        showCollapseAll: true
    });

    // 设置初始描述
    allCommentsTreeView.description = allCommentsTreeDataProvider.getCurrentFilterDescription();

    // 注册命令
    const commands = [
        // 添加评论
        vscode.commands.registerCommand('code-review-notes.addComment', async () => {
            await addComment();
        }),

        // 回复评论
        vscode.commands.registerCommand('code-review-notes.replyToComment', async (itemOrCommentId: CommentTreeItem | string) => {
            let commentId: string;
            
            if (typeof itemOrCommentId === 'string') {
                // 直接传递 commentId
                commentId = itemOrCommentId;
            } else if (itemOrCommentId && itemOrCommentId.comment) {
                // 从 TreeItem 获取 commentId
                commentId = itemOrCommentId.comment.id;
            } else {
                showNotification('无效的评论参数', NotificationLevel.Minimal, true);
                return;
            }
            
            await replyToComment(commentId);
        }),

        // 解决评论
        vscode.commands.registerCommand('code-review-notes.resolveComment', async (itemOrCommentId: CommentTreeItem | string) => {
            let commentId: string;
            
            if (typeof itemOrCommentId === 'string') {
                commentId = itemOrCommentId;
            } else if (itemOrCommentId && itemOrCommentId.comment) {
                commentId = itemOrCommentId.comment.id;
            } else {
                showNotification('无效的评论参数', NotificationLevel.Minimal, true);
                return;
            }
            
            const currentUser = commentService.getCurrentUser();
            const success = commentService.resolveComment(commentId, currentUser);
            if (success) {
                showNotification(`评论已由 ${currentUser} 标记为已解决`, NotificationLevel.Minimal);
            } else {
                showNotification('评论不存在', NotificationLevel.Minimal, true);
            }
        }),

        // 取消解决评论
        vscode.commands.registerCommand('code-review-notes.unresolveComment', async (itemOrCommentId: CommentTreeItem | string) => {
            let commentId: string;
            
            if (typeof itemOrCommentId === 'string') {
                commentId = itemOrCommentId;
            } else if (itemOrCommentId && itemOrCommentId.comment) {
                commentId = itemOrCommentId.comment.id;
            } else {
                showNotification('无效的评论参数', NotificationLevel.Minimal, true);
                return;
            }
            
            const success = commentService.unresolveComment(commentId);
            if (success) {
                showNotification('评论已标记为未解决', NotificationLevel.Minimal);
            } else {
                showNotification('评论不存在', NotificationLevel.Minimal, true);
            }
        }),

        // 刷新评论
        vscode.commands.registerCommand('code-review-notes.refreshComments', () => {
            treeDataProvider.refresh();
        }),

        // 跳转到评论
        vscode.commands.registerCommand('code-review-notes.goToComment', async (commentId: string) => {
            await goToComment(commentId);
        }),

        // 显示所有评论
        vscode.commands.registerCommand('code-review-notes.showAllComments', () => {
            allCommentsTreeDataProvider.setFilter(CommentFilter.All);
            allCommentsTreeView.description = '显示所有评论';
            showNotification('显示所有评论', NotificationLevel.Verbose);
        }),

        // 显示已解决的评论
        vscode.commands.registerCommand('code-review-notes.showResolvedComments', () => {
            allCommentsTreeDataProvider.setFilter(CommentFilter.Resolved);
            allCommentsTreeView.description = '显示已解决的评论';
            showNotification('显示已解决的评论', NotificationLevel.Verbose);
        }),

        // 显示未解决的评论
        vscode.commands.registerCommand('code-review-notes.showUnresolvedComments', () => {
            allCommentsTreeDataProvider.setFilter(CommentFilter.Unresolved);
            allCommentsTreeView.description = '显示未解决的评论';
            showNotification('显示未解决的评论', NotificationLevel.Verbose);
        }),

        // 切换评论高亮
        vscode.commands.registerCommand('code-review-notes.toggleCommentHighlights', () => {
            commentHighlightManager.toggleHighlights();
        }),

        // 切换已解决评论高亮
        vscode.commands.registerCommand('code-review-notes.toggleResolvedHighlights', () => {
            commentHighlightManager.toggleResolvedHighlights();
        }),

        // 设置用户名
        vscode.commands.registerCommand('code-review-notes.setUsername', async () => {
            await commentService.promptForUsername();
        }),

        // 创建测试评论（用于验证用户颜色功能）
        vscode.commands.registerCommand('code-review-notes.createTestComments', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                showNotification('请先打开一个文件', NotificationLevel.Minimal, true);
                return;
            }

            const document = activeEditor.document;
            const testComments = [
                {
                    author: 'Alice',
                    text: '这个函数需要添加错误处理',
                    line: 3,
                    resolved: false
                },
                {
                    author: 'Bob',
                    text: '建议使用 Array.map() 方法重构',
                    line: 11,
                    resolved: false
                },
                {
                    author: 'Charlie',
                    text: '性能优化已完成',
                    line: 15,
                    resolved: true,
                    resolvedBy: 'Diana'
                },
                {
                    author: 'Diana',
                    text: '代码格式需要调整',
                    line: 20,
                    resolved: true,
                    resolvedBy: 'Alice'
                }
            ];

            // 创建测试评论
            for (const testComment of testComments) {
                if (testComment.line < document.lineCount) {
                    const line = document.lineAt(testComment.line);
                    const range: CommentRange = {
                        startLine: testComment.line,
                        startCharacter: 0,
                        endLine: testComment.line,
                        endCharacter: line.text.length
                    };

                    const addedComment = await commentService.addComment(
                        document.uri.toString(),
                        range,
                        testComment.text,
                        testComment.author
                    );

                    // 如果是已解决的评论，设置解决者信息
                    if (testComment.resolved && 'resolvedBy' in testComment) {
                        commentService.resolveComment(addedComment.id, (testComment as any).resolvedBy);
                    }
                }
            }

            vscode.window.showInformationMessage('测试评论已创建，每个用户将显示不同的颜色！');
        }),

        // ================== 新的同步相关命令 ==================

        // 显示同步方法选择器
        vscode.commands.registerCommand('code-review-notes.showSyncMethodPicker', async () => {
            await commentService.showSyncMethodPicker();
        }),

        // 执行完整同步
        vscode.commands.registerCommand('code-review-notes.performFullSync', async () => {
            try {
                await commentService.performFullSync();
            } catch (error) {
                console.error('Full sync command failed:', error);
            }
        }),

        // 获取同步状态
        vscode.commands.registerCommand('code-review-notes.getSyncStatus', async () => {
            try {
                const status = await commentService.getSyncStatus();
                vscode.window.showInformationMessage(`同步状态: ${status}`);
            } catch (error) {
                vscode.window.showErrorMessage(`获取同步状态失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }),

        // ================== 向后兼容的 Git 同步命令 ==================

        // 同步评论到Git
        vscode.commands.registerCommand('code-review-notes.syncComments', async () => {
            try {
                await commentService.syncToGit();
            } catch (error) {
                console.error('Sync to Git command failed:', error);
            }
        }),

        // 从Git加载评论
        vscode.commands.registerCommand('code-review-notes.loadCommentsFromGit', async () => {
            try {
                await commentService.loadFromGit();
            } catch (error) {
                console.error('Load from Git command failed:', error);
            }
        }),

        // 启用自动同步
        vscode.commands.registerCommand('code-review-notes.enableAutoSync', async () => {
            try {
                await commentService.enableAutoSync();
            } catch (error) {
                console.error('Enable auto sync command failed:', error);
            }
        }),

        // 删除评论
        vscode.commands.registerCommand('code-review-notes.deleteComment', async (commentIdOrItem: string | CommentTreeItem) => {
            let commentId: string;
            
            // 处理不同的调用方式
            if (typeof commentIdOrItem === 'string') {
                // 直接传递 commentId
                commentId = commentIdOrItem;
            } else if (commentIdOrItem && commentIdOrItem.comment) {
                // 从 TreeItem 获取 commentId
                commentId = commentIdOrItem.comment.id;
            } else {
                showNotification('无效的评论参数', NotificationLevel.Minimal, true);
                return;
            }
            
            const comment = commentService.getCommentById(commentId);
            if (!comment) {
                showNotification('评论不存在', NotificationLevel.Minimal, true);
                return;
            }
            
            const action = await vscode.window.showWarningMessage(
                `确定要删除这条评论吗？\n"${comment.text.substring(0, 50)}..."`,
                { modal: true },
                '删除',
                '取消'
            );
            
            if (action === '删除') {
                const success = await commentService.deleteComment(commentId);
                if (success) {
                    treeDataProvider.refresh();
                    allCommentsTreeDataProvider.refresh();
                    // 更新高亮
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        commentHighlightManager.updateHighlights(activeEditor);
                    }
                }
            }
        }),

        // 添加评论到指定行
        vscode.commands.registerCommand('code-review-notes.addCommentToLine', async (uri: vscode.Uri, lineNumber: number, commentText?: string) => {
            const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
            if (!editor) {
                vscode.window.showErrorMessage('找不到对应的编辑器');
                return;
            }
            
            // 选择整行
            const line = editor.document.lineAt(lineNumber);
            const range = new vscode.Range(lineNumber, 0, lineNumber, line.text.length);
            editor.selection = new vscode.Selection(range.start, range.end);
            
            if (commentText) {
                // 直接添加评论
                await addCommentWithText(commentText);
            } else {
                // 使用内联输入框（类似Copilot体验）
                await inlineCommentUIManager.showInlineCommentInput(editor, lineNumber);
            }
        }),

        // ...existing code...
    ];

    // 监听活动编辑器变化
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
        treeDataProvider.refresh();
    });

    // 添加到订阅
    context.subscriptions.push(
        treeView, 
        allCommentsTreeView, 
        onDidChangeActiveTextEditor, 
        commentHighlightManager,
        ...commands
    );
}

/**
 * 添加评论
 */
async function addComment(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        showNotification('请先打开一个文件', NotificationLevel.Minimal, true);
        return;
    }

    const selection = activeEditor.selection;
    if (selection.isEmpty) {
        vscode.window.showErrorMessage('请先选择要评论的文本');
        return;
    }

    // 获取评论内容
    const commentText = await vscode.window.showInputBox({
        prompt: '输入您的评论',
        placeHolder: '在此输入评论内容...',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return '评论内容不能为空';
            }
            return null;
        }
    });

    if (!commentText) {
        return;
    }

    // 获取作者名称
    const defaultAuthor = commentService.getCurrentUser();

    // 创建评论范围
    const range: CommentRange = {
        startLine: selection.start.line,
        startCharacter: selection.start.character,
        endLine: selection.end.line,
        endCharacter: selection.end.character
    };

    // 添加评论
    const comment = commentService.addComment(
        activeEditor.document.uri.toString(),
        range,
        commentText.trim(),
        defaultAuthor
    );

    vscode.window.showInformationMessage('评论已添加');
}

/**
 * 回复评论
 */
async function replyToComment(commentId: string): Promise<void> {
    const replyText = await vscode.window.showInputBox({
        prompt: '输入您的回复',
        placeHolder: '在此输入回复内容...',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return '回复内容不能为空';
            }
            return null;
        }
    });

    if (!replyText) {
        return;
    }

    // 获取作者名称
    const config = vscode.workspace.getConfiguration('codeReviewNotes');
    const defaultAuthor = config.get<string>('defaultAuthor') || 'User';

    const reply = commentService.addReply(commentId, replyText.trim(), defaultAuthor);
    if (reply) {
        vscode.window.showInformationMessage('回复已添加');
    } else {
        vscode.window.showErrorMessage('未找到对应的评论');
    }
}

/**
 * 跳转到评论位置
 */
async function goToComment(commentId: string): Promise<void> {
    const comment = commentService.getCommentById(commentId);
    if (!comment) {
        vscode.window.showErrorMessage('未找到评论');
        return;
    }

    try {
        const uri = vscode.Uri.parse(comment.documentUri);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        // 使用锚点系统获取当前范围
        const commentRange = commentService.getCommentRange(comment);
        const startPos = new vscode.Position(commentRange.startLine, commentRange.startCharacter);
        const endPos = new vscode.Position(commentRange.endLine, commentRange.endCharacter);
        const range = new vscode.Range(startPos, endPos);

        // 选择文本并滚动到视图
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        // 高亮显示（可选）
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editor.wordHighlightBorder')
        });

        editor.setDecorations(decorationType, [range]);

        // 3秒后移除高亮
        setTimeout(() => {
            decorationType.dispose();
        }, 3000);

    } catch (error) {
        vscode.window.showErrorMessage(`无法打开文件: ${error}`);
    }
}

/**
 * 使用预定义文本添加评论
 */
async function addCommentWithText(commentText: string): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        showNotification('请先打开一个文件', NotificationLevel.Minimal, true);
        return;
    }

    const selection = activeEditor.selection;
    if (selection.isEmpty) {
        vscode.window.showErrorMessage('请先选择要评论的文本');
        return;
    }

    // 获取作者名称
    const defaultAuthor = commentService.getCurrentUser();

    // 创建评论范围
    const range: CommentRange = {
        startLine: selection.start.line,
        startCharacter: selection.start.character,
        endLine: selection.end.line,
        endCharacter: selection.end.character
    };

    // 添加评论
    const comment = await commentService.addComment(
        activeEditor.document.uri.toString(),
        range,
        commentText.trim(),
        defaultAuthor
    );

    // 刷新视图
    treeDataProvider.refresh();
    allCommentsTreeDataProvider.refresh();
    
    // 更新高亮
    commentHighlightManager.updateHighlights(activeEditor);
}

/**
 * 根据通知等级显示通知
 * @param message 通知消息
 * @param level 此通知的等级
 * @param isError 是否为错误消息 (默认为 false)
 */
function showNotification(message: string, level: NotificationLevel, isError: boolean = false): void {
    const config = vscode.workspace.getConfiguration('codeReview');
    const configuredLevel = config.get<NotificationLevel>('notificationLevel') || NotificationLevel.Minimal;

    if (configuredLevel === NotificationLevel.None) {
        return; // 不显示任何通知
    }

    if (configuredLevel === NotificationLevel.Minimal) {
        if (level === NotificationLevel.Minimal || isError) {
            if (isError) {
                vscode.window.showErrorMessage(message);
            } else {
                vscode.window.showInformationMessage(message);
            }
        }
    } else if (configuredLevel === NotificationLevel.Verbose) {
        if (isError) {
            vscode.window.showErrorMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    }
}
export function deactivate() {
    // 清理资源
}
