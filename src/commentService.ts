import * as vscode from 'vscode';
import { Comment, CommentReply, CommentRange, CommentData, CommentAnchor, LegacyComment, NotificationLevel } from './types';
import { v4 as uuidv4 } from 'uuid';
import { SyncManager } from './syncManager';
import { SyncMethod } from './syncStrategy';
import { CommentPositionTracker } from './commentPositionTracker';

/**
 * 评论服务类，负责管理评论数据的CRUD操作
 */
export class CommentService {
    private static readonly STORAGE_KEY = 'codeReviewNotes.comments';
    private static readonly DATA_VERSION = '1.0.0';
    
    private comments: Comment[] = [];
    private context: vscode.ExtensionContext;
    private syncManager: SyncManager;
    private positionTracker: CommentPositionTracker;
    private documentChangeListener?: vscode.Disposable;
    private _onDidChangeComments = new vscode.EventEmitter<void>();
    
    readonly onDidChangeComments = this._onDidChangeComments.event;    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.syncManager = new SyncManager(context);
        this.positionTracker = new CommentPositionTracker();
        
        // 设置位置追踪
        this.setupPositionTracking();
        
        // 异步加载评论
        this.loadComments().then(() => {
            this._onDidChangeComments.fire();
        });
    }

    /**
     * 设置位置追踪
     */
    private setupPositionTracking(): void {
        this.documentChangeListener = this.positionTracker.setupDocumentChangeListener(this);
    }

    /**
     * 获取当前文件的所有评论
     */
    getCommentsForFile(documentUri: string): Comment[] {
        return this.comments.filter(comment => comment.documentUri === documentUri);
    }

    /**
     * 获取所有评论
     */
    getAllComments(): Comment[] {
        return this.comments;
    }

    /**
     * 根据ID获取评论
     */
    getCommentById(id: string): Comment | undefined {
        return this.comments.find(comment => comment.id === id);
    }    /**
     * 添加新评论
     */
    async addComment(
        documentUri: string,
        range: CommentRange,
        text: string,
        author: string = 'User'
    ): Promise<Comment> {
        // 获取文档并创建智能锚点
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
        const vscodeRange = new vscode.Range(
            range.startLine, range.startCharacter,
            range.endLine, range.endCharacter
        );
        const anchor = await this.positionTracker.createAnchor(document, vscodeRange);

        const comment: Comment = {
            id: uuidv4(),
            documentUri,
            anchor,
            text,
            author,
            timestamp: Date.now(),
            resolved: false,
            replies: []
        };

        this.comments.push(comment);
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return comment;
    }

    /**
     * 添加回复
     */
    addReply(commentId: string, text: string, author: string = 'User'): CommentReply | undefined {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return undefined;
        }

        const reply: CommentReply = {
            id: uuidv4(),
            parentId: commentId,
            author,
            text,
            timestamp: Date.now()
        };

        comment.replies.push(reply);
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return reply;
    }

    /**
     * 解决评论
     */
    resolveComment(commentId: string, resolvedBy?: string): boolean {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return false;
        }

        comment.resolved = true;
        comment.resolvedBy = resolvedBy;
        comment.resolvedAt = Date.now();
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return true;
    }

    /**
     * 取消解决评论
     */
    unresolveComment(commentId: string): boolean {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return false;
        }

        comment.resolved = false;
        // 保留resolvedBy和resolvedAt，以便查看历史记录
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return true;
    }

    /**
     * 删除评论
     */
    async deleteComment(commentId: string): Promise<boolean> {
        const index = this.comments.findIndex(comment => comment.id === commentId);
        if (index === -1) {
            return false;
        }
        
        const comment = this.comments[index];
        this.comments.splice(index, 1);
          // 保存并同步
        await this.saveComments();
        await this.syncManager.saveComments(this.comments);
        
        // 通知变化
        this._onDidChangeComments.fire();
        
        // 显示删除成功消息
        this._showNotification(`评论已删除: "${comment.text.substring(0, 30)}..."`, NotificationLevel.Minimal);
        
        return true;
    }    /**
     * 批量删除评论
     */
    async deleteComments(commentIds: string[]): Promise<number> {
        let deletedCount = 0;
        
        for (const id of commentIds) {
            const index = this.comments.findIndex(comment => comment.id === id);
            if (index !== -1) {
                this.comments.splice(index, 1);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            await this.saveComments();
            await this.syncManager.saveComments(this.comments);
            this._onDidChangeComments.fire();
            
            this._showNotification(`已删除 ${deletedCount} 条评论`, NotificationLevel.Minimal);
        }
        
        return deletedCount;
    }
    
    /**
     * 删除文件的所有评论
     */
    async deleteCommentsForFile(documentUri: string): Promise<number> {
        const originalLength = this.comments.length;
        this.comments = this.comments.filter(comment => comment.documentUri !== documentUri);
        const deletedCount = originalLength - this.comments.length;
        
        if (deletedCount > 0) {
            await this.saveComments();
            await this.syncManager.saveComments(this.comments);
            this._onDidChangeComments.fire();
            
            vscode.window.showInformationMessage(`已删除文件 ${deletedCount} 条评论`);
        }
        
        return deletedCount;
    }

    /**
     * 从持久化存储加载评论
     */
    private async loadComments(): Promise<void> {
        try {
            // 使用同步管理器加载评论
            const loadedComments = await this.syncManager.loadComments();
            
            // 检查是否需要迁移旧格式评论
            const migratedComments = await this.migrateLegacyComments(loadedComments);
            
            this.comments = migratedComments;
        } catch (error) {
            console.error('Failed to load comments:', error);
            this.comments = [];
        }
    }

    /**
     * 保存评论到持久化存储
     */
    private async saveComments(): Promise<void> {
        try {
            // 使用同步管理器保存评论
            const result = await this.syncManager.saveComments(this.comments);
            if (!result.success) {
                console.warn('Save comments warning:', result.message);
            }
        } catch (error) {
            console.error('Failed to save comments:', error);
        }
    }

    /**
     * 清除所有评论（用于测试或重置）
     */
    clearAllComments(): void {
        this.comments = [];
        this.saveComments();
        this._onDidChangeComments.fire();
    }

    /**
     * 获取当前用户名
     */
    getCurrentUser(): string {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        return config.get<string>('defaultAuthor') || 'User';
    }

    /**
     * 设置当前用户名
     */
    async setCurrentUser(username: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        await config.update('defaultAuthor', username, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 提示用户输入用户名
     */
    async promptForUsername(): Promise<string | undefined> {
        const currentUser = this.getCurrentUser();
        const username = await vscode.window.showInputBox({
            prompt: '请输入您的用户名',
            value: currentUser,
            placeHolder: '例如：张三',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '用户名不能为空';
                }
                if (value.trim().length > 50) {
                    return '用户名不能超过50个字符';
                }
                return null;
            }
        });

        if (username && username.trim() !== currentUser) {
            await this.setCurrentUser(username.trim());
            this._showNotification(`用户名已更新为：${username.trim()}`, NotificationLevel.Minimal);
        }

        return username?.trim();
    }

    // ================== 同步相关方法 ==================

    /**
     * 手动执行完整同步
     */
    async performFullSync(): Promise<void> {
        try {
            const mergedComments = await this.syncManager.performFullSync(this.comments);
            this.comments = mergedComments;
            this._onDidChangeComments.fire();
            this._showNotification('✅ 同步完成', NotificationLevel.Verbose);
        } catch (error) {
            console.error('Full sync failed:', error);
            this._showNotification(`同步失败: ${error instanceof Error ? error.message : 'Unknown error'}`, NotificationLevel.Minimal, true);
            throw error;
        }
    }

    /**
     * 获取同步状态
     */
    async getSyncStatus(): Promise<string> {
        return await this.syncManager.getSyncStatus();
    }

    /**
     * 显示同步方法选择器
     */
    async showSyncMethodPicker(): Promise<void> {
        await this.syncManager.showSyncMethodPicker();
    }

    /**
     * 设置同步方法
     */
    async setSyncMethod(method: SyncMethod): Promise<void> {
        await this.syncManager.setSyncMethod(method);
        // 重新加载评论以应用新的同步策略
        await this.loadComments();
        this._onDidChangeComments.fire();
    }

    /**
     * 获取当前同步方法
     */
    getCurrentSyncMethod(): SyncMethod {
        return this.syncManager.getCurrentSyncMethod();
    }

    // ================== Git 特定方法（向后兼容） ==================

    /**
     * 手动同步到Git（向后兼容）
     */
    async syncToGit(): Promise<void> {
        if (this.syncManager.getCurrentSyncMethod() !== SyncMethod.Git) {
            await this.syncManager.setSyncMethod(SyncMethod.Git);
        }
        await this.performFullSync();
    }

    /**
     * 从Git加载评论（向后兼容）
     */
    async loadFromGit(): Promise<void> {
        try {
            const gitOps = await this.syncManager.gitSpecificOperations();
            const gitComments = await gitOps.loadFromFile();
            
            if (gitComments.length > 0) {
                const mergedComments = this.syncManager.mergeComments(this.comments, gitComments);
                this.comments = mergedComments;
                await this.saveComments();
                this._onDidChangeComments.fire();
                this._showNotification(`📥 从Git加载了 ${gitComments.length} 条评论`, NotificationLevel.Verbose);
            } else {
                this._showNotification('📥 Git中没有评论文件', NotificationLevel.Verbose);
            }
        } catch (error) {
            console.error('Load from Git failed:', error);
            this._showNotification(`从Git加载失败: ${error instanceof Error ? error.message : 'Unknown error'}`, NotificationLevel.Minimal, true);
            throw error;
        }
    }

    /**
     * 启用自动同步（向后兼容）
     */
    async enableAutoSync(): Promise<void> {
        try {
            const gitOps = await this.syncManager.gitSpecificOperations();
            await gitOps.setupAutoSync();
        } catch (error) {
            console.error('Enable auto sync failed:', error);
            this._showNotification(`启用自动同步失败: ${error instanceof Error ? error.message : 'Unknown error'}`, NotificationLevel.Minimal, true);
            throw error;
        }
    }

    /**
     * 获取Git同步状态（向后兼容）
     */
    async getGitSyncStatus(): Promise<string> {
        try {
            const gitOps = await this.syncManager.gitSpecificOperations();
            return await gitOps.getGitStatus();
        } catch (error) {
            return 'Git not available';
        }    }

    // ================== 位置追踪相关方法 ==================

    /**
     * 验证并更新评论位置
     */    async validateAndUpdatePositions(documentUri: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
        const fileComments = this.getCommentsForFile(documentUri);
        
        if (fileComments.length === 0) {
            return;
        }
        
        const updatedComments = await this.positionTracker.validateCommentPositions(document, fileComments);
        
        // 更新评论列表
        updatedComments.forEach(updatedComment => {
            const index = this.comments.findIndex(c => c.id === updatedComment.id);
            if (index !== -1) {
                this.comments[index] = updatedComment;
            }
        });
        
        await this.saveComments();
        this._onDidChangeComments.fire();
    }

    /**
     * 手动重新定位所有评论
     */
    async relocateAllComments(documentUri: string): Promise<void> {
        await this.positionTracker.relocateAllComments(documentUri, this);
    }

    /**
     * 更新评论列表（供位置追踪器调用）
     */
    updateComments(comments: Comment[]): void {
        // 更新当前评论列表
        comments.forEach(updatedComment => {
            const index = this.comments.findIndex(c => c.id === updatedComment.id);
            if (index !== -1) {
                this.comments[index] = updatedComment;
            }
        });
        
        this.saveComments();
        this._onDidChangeComments.fire();
    }

    /**
     * 获取评论的当前有效位置
     */
    getCommentRange(comment: Comment): CommentRange {
        // 如果评论已移动，返回新位置，否则返回原始位置
        return comment.anchor.currentRange || comment.anchor.originalRange;
    }

    /**
     * 迁移旧格式评论到新的锚点系统
     */
    private async migrateLegacyComments(comments: any[]): Promise<Comment[]> {
        const migratedComments: Comment[] = [];
        
        for (const comment of comments) {
            if (comment.range && !comment.anchor) {
                // 这是旧格式的评论，需要迁移
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(comment.documentUri));
                    const vscodeRange = new vscode.Range(
                        comment.range.startLine, comment.range.startCharacter,
                        comment.range.endLine, comment.range.endCharacter
                    );
                    const anchor = await this.positionTracker.createAnchor(document, vscodeRange);
                    
                    migratedComments.push({
                        ...comment,
                        anchor,
                        // 移除旧的range字段
                        range: undefined
                    } as Comment);
                } catch (error) {
                    console.warn('无法迁移评论:', comment.id, error);
                    // 创建一个基本的锚点作为后备
                    const anchor: CommentAnchor = {
                        originalRange: comment.range,
                        codeSnippet: '',
                        status: 'valid',
                        lastValidatedAt: Date.now()
                    };
                    migratedComments.push({
                        ...comment,
                        anchor,
                        range: undefined
                    } as Comment);
                }
            } else if (comment.anchor) {
                // 新格式的评论
                migratedComments.push(comment as Comment);
            }
        }
        
        return migratedComments;
    }

private _showNotification(message: string, level: NotificationLevel, isError: boolean = false): void {
        const config = vscode.workspace.getConfiguration('codeReview');
        const configuredLevel = config.get<NotificationLevel>('notificationLevel') || NotificationLevel.Minimal;

        if (configuredLevel === NotificationLevel.None) {
            return; 
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
    /**
     * 销毁方法
     */
    dispose(): void {
        this.documentChangeListener?.dispose();
    }
}