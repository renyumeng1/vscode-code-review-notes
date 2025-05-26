import * as vscode from 'vscode';
import { CommentService } from './commentService';
import { CommentTreeDataProvider, CommentTreeItem } from './commentTreeProvider';
import { AllCommentsTreeDataProvider, CommentFilter } from './allCommentsTreeProvider';
import { CommentHighlightManager } from './commentHighlightManager';
import { UserColorManagerImpl } from './userColorManager';
import { Comment, CommentRange, UserColorManager } from './types';

let commentService: CommentService;
let treeDataProvider: CommentTreeDataProvider;
let allCommentsTreeDataProvider: AllCommentsTreeDataProvider;
let commentHighlightManager: CommentHighlightManager;
let userColorManager: UserColorManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Review Notes extension is now active!');
    
    // 显示激活消息
    vscode.window.showInformationMessage('Code Review Notes 插件已激活！');

    // 初始化服务
    commentService = new CommentService(context);
    userColorManager = new UserColorManagerImpl(context);
    treeDataProvider = new CommentTreeDataProvider(commentService);
    allCommentsTreeDataProvider = new AllCommentsTreeDataProvider(commentService);
    commentHighlightManager = new CommentHighlightManager(context, commentService, userColorManager);

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
        vscode.commands.registerCommand('code-review-notes.replyToComment', async (item: CommentTreeItem) => {
            if (item && item.comment) {
                await replyToComment(item.comment.id);
            }
        }),

        // 解决评论
        vscode.commands.registerCommand('code-review-notes.resolveComment', async (item: CommentTreeItem) => {
            if (item && item.comment) {
                const currentUser = commentService.getCurrentUser();
                commentService.resolveComment(item.comment.id, currentUser);
                vscode.window.showInformationMessage(`评论已由 ${currentUser} 标记为已解决`);
            }
        }),

        // 取消解决评论
        vscode.commands.registerCommand('code-review-notes.unresolveComment', async (item: CommentTreeItem) => {
            if (item && item.comment) {
                commentService.unresolveComment(item.comment.id);
                vscode.window.showInformationMessage('评论已标记为未解决');
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
            vscode.window.showInformationMessage('显示所有评论');
        }),

        // 显示已解决的评论
        vscode.commands.registerCommand('code-review-notes.showResolvedComments', () => {
            allCommentsTreeDataProvider.setFilter(CommentFilter.Resolved);
            allCommentsTreeView.description = '显示已解决的评论';
            vscode.window.showInformationMessage('显示已解决的评论');
        }),

        // 显示未解决的评论
        vscode.commands.registerCommand('code-review-notes.showUnresolvedComments', () => {
            allCommentsTreeDataProvider.setFilter(CommentFilter.Unresolved);
            allCommentsTreeView.description = '显示未解决的评论';
            vscode.window.showInformationMessage('显示未解决的评论');
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
                vscode.window.showErrorMessage('请先打开一个文件');
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

                    const comment: Comment = {
                        id: `test-${testComment.author}-${Date.now()}-${Math.random()}`,
                        text: testComment.text,
                        author: testComment.author,
                        timestamp: Date.now(),
                        range: range,
                        documentUri: document.uri.toString(),
                        resolved: testComment.resolved,
                        replies: []
                    };

                    const addedComment = commentService.addComment(
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
        })
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
        vscode.window.showErrorMessage('请先打开一个文件');
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

        // 创建选择范围
        const startPos = new vscode.Position(comment.range.startLine, comment.range.startCharacter);
        const endPos = new vscode.Position(comment.range.endLine, comment.range.endCharacter);
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

export function deactivate() {
    // 清理资源
}
