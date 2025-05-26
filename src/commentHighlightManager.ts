import * as vscode from 'vscode';
import { Comment, UserColorManager } from './types';
import { CommentService } from './commentService';

/**
 * 评论高亮管理器
 */
export class CommentHighlightManager {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private resolvedDecorationType!: vscode.TextEditorDecorationType;
    private isHighlightEnabled: boolean = true;
    private context: vscode.ExtensionContext;

    constructor(
        context: vscode.ExtensionContext, 
        private commentService: CommentService,
        private userColorManager: UserColorManager
    ) {
        this.context = context;
        
        // 创建装饰类型会在需要时动态创建
        this.createDecorationTypes();

        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('codeReviewNotes')) {
                this.createDecorationTypes();
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    this.updateHighlights(activeEditor);
                }
            }
        });

        // 监听编辑器变化
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.updateHighlights(editor);
            }
        });

        // 监听评论数据变化
        this.commentService.onDidChangeComments(() => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                this.updateHighlights(activeEditor);
            }
        });

        // 初始化当前编辑器的高亮
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.updateHighlights(activeEditor);
        }

        // 恢复高亮状态
        this.isHighlightEnabled = this.context.workspaceState.get('commentHighlights.enabled', true);
    }    /**
     * 切换已解决评论的高亮显示
     */
    toggleResolvedHighlights(): void {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        const currentSetting = config.get<boolean>('showResolvedCommentHighlights', true);
        
        config.update('showResolvedCommentHighlights', !currentSetting, vscode.ConfigurationTarget.Workspace);
        
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.updateHighlights(activeEditor);
        }

        const statusMessage = !currentSetting ? '已解决评论高亮已启用' : '已解决评论高亮已禁用';
        vscode.window.showInformationMessage(statusMessage);
    }

    /**
     * 切换高亮显示
     */
    toggleHighlights(): void {
        this.isHighlightEnabled = !this.isHighlightEnabled;
        this.context.workspaceState.update('commentHighlights.enabled', this.isHighlightEnabled);
        
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.updateHighlights(activeEditor);
        }

        const statusMessage = this.isHighlightEnabled ? '评论高亮已启用' : '评论高亮已禁用';
        vscode.window.showInformationMessage(statusMessage);
    }    /**
     * 更新编辑器中的高亮
     */
    updateHighlights(editor: vscode.TextEditor): void {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        
        if (!this.isHighlightEnabled) {
            // 清除所有高亮
            this.clearAllDecorations(editor);
            return;
        }

        const documentUri = editor.document.uri.toString();
        const comments = this.commentService.getCommentsForFile(documentUri);

        // 检查是否显示已解决评论的高亮
        const showResolvedHighlights = config.get<boolean>('showResolvedCommentHighlights', true);

        // 按用户分组评论
        const commentsByUser: Map<string, { unresolved: Comment[], resolved: Comment[] }> = new Map();
        
        comments.forEach(comment => {
            if (!commentsByUser.has(comment.author)) {
                commentsByUser.set(comment.author, { unresolved: [], resolved: [] });
            }
            
            const userComments = commentsByUser.get(comment.author)!;
            if (comment.resolved) {
                userComments.resolved.push(comment);
            } else {
                userComments.unresolved.push(comment);
            }
        });

        // 清除之前的装饰
        this.clearAllDecorations(editor);

        // 为每个用户创建装饰
        commentsByUser.forEach((userComments, userId) => {
            const userColor = this.userColorManager.getUserColor(userId);
            
            // 处理未解决的评论
            if (userComments.unresolved.length > 0) {
                const decorationType = this.getOrCreateDecorationType(userId, false, userColor);
                const decorations = this.createDecorations(userComments.unresolved);
                editor.setDecorations(decorationType, decorations);
            }
            
            // 处理已解决的评论（如果启用）
            if (showResolvedHighlights && userComments.resolved.length > 0) {
                const decorationType = this.getOrCreateDecorationType(userId, true, userColor);
                const decorations = this.createDecorations(userComments.resolved);
                editor.setDecorations(decorationType, decorations);
            }
        });

        // 如果不显示已解决评论，清除已解决评论的装饰
        if (!showResolvedHighlights) {
            editor.setDecorations(this.resolvedDecorationType, []);
        }
    }    /**
     * 创建悬停消息 - 简化版本
     */
    private createHoverMessage(comment: Comment): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        
        const date = new Date(comment.timestamp).toLocaleString('zh-CN');
        const statusIcon = comment.resolved ? '✅' : '💬';
        const statusText = comment.resolved ? '已解决' : '活跃';
        
        // 简化的悬停提示
        markdown.appendMarkdown(`**${statusIcon} ${statusText}**\n\n`);
        markdown.appendMarkdown(`**作者:** ${comment.author}\n\n`);
        markdown.appendMarkdown(`**时间:** ${date}\n\n`);
        
        // 显示解决者信息
        if (comment.resolved && comment.resolvedBy) {
            const resolvedDate = comment.resolvedAt ? new Date(comment.resolvedAt).toLocaleString('zh-CN') : '';
            markdown.appendMarkdown(`**解决者:** ${comment.resolvedBy}${resolvedDate ? ` (${resolvedDate})` : ''}\n\n`);
        }
        
        markdown.appendMarkdown(`${comment.text}\n\n`);
        
        if (comment.replies.length > 0) {
            markdown.appendMarkdown(`**讨论 (${comment.replies.length} 条回复):**\n\n`);
            
            // 显示最多3条最新回复
            const recentReplies = comment.replies.slice(-3);
            recentReplies.forEach(reply => {
                const replyDate = new Date(reply.timestamp).toLocaleString('zh-CN');
                markdown.appendMarkdown(`• **${reply.author}** (${replyDate}): ${reply.text}\n\n`);
            });
            
            if (comment.replies.length > 3) {
                markdown.appendMarkdown(`*...还有 ${comment.replies.length - 3} 条回复*\n\n`);
            }
        }
        
        return markdown;
    }

    /**
     * 获取或创建装饰类型
     */
    private getOrCreateDecorationType(userId: string, isResolved: boolean, userColor: any): vscode.TextEditorDecorationType {
        const key = `${userId}_${isResolved ? 'resolved' : 'unresolved'}`;
        
        if (!this.decorationTypes.has(key)) {
            const decorationType = this.createUserDecorationType(userColor, isResolved);
            this.decorationTypes.set(key, decorationType);
        }
        
        return this.decorationTypes.get(key)!;
    }

    /**
     * 创建用户特定的装饰类型
     */
    private createUserDecorationType(userColor: any, isResolved: boolean): vscode.TextEditorDecorationType {
        const options: vscode.DecorationRenderOptions = {
            backgroundColor: userColor.backgroundColor,
            borderWidth: '1px',
            borderStyle: isResolved ? 'dashed' : 'solid',
            borderColor: userColor.borderColor,
            borderRadius: '3px',
            overviewRulerColor: userColor.borderColor,
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            after: {
                contentText: isResolved ? ' ✅' : ' 💬',
                color: userColor.borderColor,
                margin: '0 0 0 4px'
            }
        };

        if (isResolved) {
            options.opacity = '0.7';
        }

        return vscode.window.createTextEditorDecorationType(options);
    }

    /**
     * 创建装饰选项
     */
    private createDecorations(comments: Comment[]): vscode.DecorationOptions[] {
        const decorations: vscode.DecorationOptions[] = [];
        
        comments.forEach(comment => {
            try {
                const startPos = new vscode.Position(comment.range.startLine, comment.range.startCharacter);
                const endPos = new vscode.Position(comment.range.endLine, comment.range.endCharacter);
                const range = new vscode.Range(startPos, endPos);

                const decoration: vscode.DecorationOptions = {
                    range: range,
                    hoverMessage: this.createHoverMessage(comment)
                };

                decorations.push(decoration);
            } catch (error) {
                console.error('Error creating decoration for comment:', comment.id, error);
            }
        });

        return decorations;
    }

    /**
     * 清除所有装饰
     */
    private clearAllDecorations(editor: vscode.TextEditor): void {
        // 清除所有用户装饰类型
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });
        
        // 清除已解决评论装饰
        if (this.resolvedDecorationType) {
            editor.setDecorations(this.resolvedDecorationType, []);
        }
    }    /**
     * 创建装饰类型
     */
    private createDecorationTypes(): void {
        // 清理现有的装饰类型
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();
        
        if (this.resolvedDecorationType) {
            this.resolvedDecorationType.dispose();
        }

        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        const resolvedColor = config.get<string>('resolvedCommentColor', 'rgba(40, 167, 69, 0.12)');

        // 已解决评论的默认装饰类型（用于向后兼容）
        this.resolvedDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: resolvedColor,
            borderWidth: '1px',
            borderStyle: 'dashed',
            borderColor: 'rgba(40, 167, 69, 0.6)',
            borderRadius: '3px',
            overviewRulerColor: 'rgba(40, 167, 69, 0.6)',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            opacity: '0.7',
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            after: {
                contentText: ' ✅',
                color: 'rgba(40, 167, 69, 0.8)',
                margin: '0 0 0 4px'
            }
        });
    }

    /**
     * 获取高亮状态
     */
    isEnabled(): boolean {
        return this.isHighlightEnabled;
    }    /**
     * 清理资源
     */
    dispose(): void {
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();
        
        if (this.resolvedDecorationType) {
            this.resolvedDecorationType.dispose();
        }
    }
}
